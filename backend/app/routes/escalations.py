import json
import random
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import EscalationModel, ServiceRequestModel, UserModel, NotificationLogModel
from app.schemas import (
    EscalationCreatePayload,
    EscalationResponse,
    EscalationResolvePayload,
    NotificationLogResponse
)
from app.security import get_authenticated_user
from app.sla_engine import evaluate_sla_breaches
from app.notification_service import notify_escalation_raised, notify_escalation_resolved

router = APIRouter(prefix="/api/escalations", tags=["escalations"])

def format_escalation(esc: EscalationModel) -> EscalationResponse:
    return EscalationResponse(
        id=esc.id,
        request_id=esc.request_id,
        level=esc.level,
        target_role=esc.target_role,
        owner_id=esc.owner_id,
        owner_name=esc.owner_name,
        reason=esc.reason,
        status=esc.status,
        due_date=esc.due_date,
        resolution_note=esc.resolution_note,
        created_at=esc.created_at,
        resolved_at=esc.resolved_at
    )

@router.get("", response_model=List[EscalationResponse])
def list_escalations(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    
    query = db.query(EscalationModel)
    if user.role == "customer":
        user_req_ids = [r.id for r in db.query(ServiceRequestModel.id).filter(ServiceRequestModel.customer_id == user.id).all()]
        query = query.filter(EscalationModel.request_id.in_(user_req_ids))
    elif user.role in ("branch", "franchise"):
        # Franchise sees Level 1 or requests in their branch
        branch_req_ids = [r.id for r in db.query(ServiceRequestModel.id).filter(
            or_(ServiceRequestModel.branch_id == user.id, ServiceRequestModel.pincode == getattr(user, "pincode", ""))
        ).all()]
        query = query.filter(
            or_(EscalationModel.level == 1, EscalationModel.request_id.in_(branch_req_ids))
        )
    elif user.role == "company":
        # Brand sees Level 1 & Level 2 or requests in their company
        company_req_ids = [r.id for r in db.query(ServiceRequestModel.id).filter(ServiceRequestModel.company_id == user.id).all()]
        query = query.filter(
            or_(EscalationModel.level.in_([1, 2]), EscalationModel.request_id.in_(company_req_ids))
        )
    # Admin sees everything

    escalations = query.order_by(EscalationModel.created_at.desc()).all()
    return [format_escalation(e) for e in escalations]

@router.post("", response_model=EscalationResponse)
def create_escalation(payload: EscalationCreatePayload, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == payload.request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    now = datetime.now()
    now_str = now.strftime("%d %b %Y, %I:%M %p")
    due_str = payload.due_date or (now + timedelta(hours=4)).strftime("%d %b %Y, %I:%M %p")
    esc_id = f"ESC-{random.randint(1000, 9999)}"

    level = payload.level or 1
    role_map = {1: "franchise", 2: "company", 3: "admin"}
    target_role = payload.target_role or role_map.get(level, "franchise")

    esc = EscalationModel(
        id=esc_id,
        request_id=req.id,
        level=level,
        target_role=target_role,
        owner_id=user.id,
        owner_name=user.name,
        reason=payload.reason,
        status="Open",
        due_date=due_str,
        created_at=now_str
    )
    db.add(esc)

    req.is_escalated = True
    req.escalation_level = level

    try:
        timeline = json.loads(req.timeline_json) if req.timeline_json else []
        timeline.append({
            "id": f"step_esc_manual_{level}",
            "title": f"Escalated to {target_role.capitalize()} (Tier {level})",
            "timestamp": now_str,
            "description": f"Escalation raised by {user.name} ({user.role}): {payload.reason}",
            "state": "current"
        })
        req.timeline_json = json.dumps(timeline)
    except Exception:
        pass

    db.commit()
    db.refresh(esc)
    db.refresh(req)

    notify_escalation_raised(esc, req, db)
    return format_escalation(esc)

@router.post("/{escalation_id}/resolve", response_model=EscalationResponse)
def resolve_escalation(escalation_id: str, payload: EscalationResolvePayload, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role not in ("branch", "franchise", "company", "admin"):
        raise HTTPException(status_code=403, detail="Only operational staff can resolve escalations")

    esc = db.query(EscalationModel).filter(EscalationModel.id == escalation_id).first()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation record not found")

    if not payload.resolution_note or len(payload.resolution_note.strip()) < 5:
        raise HTTPException(status_code=400, detail="SRS 6.15 / FR-ESC-008: Mandatory resolution note required to close an escalation.")

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    esc.status = "Resolved"
    esc.resolution_note = f"Resolved by {user.name} ({user.role}): {payload.resolution_note.strip()}"
    esc.resolved_at = now_str

    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == esc.request_id).first()
    if req:
        # Check if any other open escalations exist for this ticket
        other_open = db.query(EscalationModel).filter(
            EscalationModel.request_id == req.id,
            EscalationModel.id != esc.id,
            EscalationModel.status.in_(["Open", "In Progress"])
        ).first()

        if not other_open:
            req.is_escalated = False
            req.escalation_level = 0

        try:
            timeline = json.loads(req.timeline_json) if req.timeline_json else []
            timeline.append({
                "id": f"step_esc_resolved_{esc.id}",
                "title": f"Escalation {esc.id} Resolved",
                "timestamp": now_str,
                "description": f"Resolution: {payload.resolution_note.strip()}",
                "state": "completed"
            })
            req.timeline_json = json.dumps(timeline)
        except Exception:
            pass

    db.commit()
    db.refresh(esc)
    if req:
        db.refresh(req)
        notify_escalation_resolved(esc, req, db)

    return format_escalation(esc)

@router.post("/{escalation_id}/escalate-next", response_model=EscalationResponse)
def escalate_to_next_level(escalation_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role not in ("branch", "franchise", "company", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized to push escalation tiers")

    esc = db.query(EscalationModel).filter(EscalationModel.id == escalation_id).first()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation record not found")

    if esc.level >= 3:
        raise HTTPException(status_code=400, detail="Escalation is already at highest level (Level 3 - Platform Admin)")

    next_level = esc.level + 1
    role_map = {1: "franchise", 2: "company", 3: "admin"}
    target_role = role_map.get(next_level, "admin")

    now = datetime.now()
    now_str = now.strftime("%d %b %Y, %I:%M %p")
    due_str = (now + timedelta(hours=4)).strftime("%d %b %Y, %I:%M %p")

    esc.level = next_level
    esc.target_role = target_role
    esc.due_date = due_str
    esc.status = "Open"
    esc.reason = f"{esc.reason} [Pushed to Level {next_level} by {user.name}]"

    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == esc.request_id).first()
    if req:
        req.is_escalated = True
        req.escalation_level = next_level
        try:
            timeline = json.loads(req.timeline_json) if req.timeline_json else []
            timeline.append({
                "id": f"step_esc_pushed_{next_level}",
                "title": f"Escalated to Tier {next_level} ({target_role.capitalize()})",
                "timestamp": now_str,
                "description": f"Pushed to Tier {next_level} by {user.name}. Priority SLA due in 4 hours.",
                "state": "current"
            })
            req.timeline_json = json.dumps(timeline)
        except Exception:
            pass

    db.commit()
    db.refresh(esc)
    if req:
        db.refresh(req)
        notify_escalation_raised(esc, req, db)

    return format_escalation(esc)

@router.post("/check-sla", response_model=List[EscalationResponse])
def run_sla_check(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role not in ("admin", "company", "franchise", "branch"):
        raise HTTPException(status_code=403, detail="Not authorized to run SLA scan")

    breaches = evaluate_sla_breaches(db)
    return [format_escalation(b) for b in breaches]

@router.get("/notifications", response_model=List[NotificationLogResponse])
def get_notifications(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    query = db.query(NotificationLogModel)
    if user.role != "admin":
        query = query.filter(
            or_(
                NotificationLogModel.user_id == user.id,
                NotificationLogModel.recipient_email == user.email
            )
        )
    logs = query.order_by(NotificationLogModel.created_at.desc()).limit(50).all()
    return [
        NotificationLogResponse(
            id=log.id,
            user_id=log.user_id,
            recipient_email=log.recipient_email,
            recipient_name=log.recipient_name,
            title=log.title,
            body=log.body,
            channel=log.channel,
            event_type=log.event_type,
            reference_id=log.reference_id,
            delivery_status=log.delivery_status,
            created_at=log.created_at
        ) for log in logs
    ]
