import json
import random
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import ServiceRequestModel, ApplianceModel, TechnicianModel, UserModel
from app.schemas import ServiceRequestDetail, ServiceBookingCreate, TechnicianBase, TimelineStep

router = APIRouter(prefix="/api/requests", tags=["requests"])

def get_current_user_id(request: Request) -> str:
    user_id = request.cookies.get("servora_user_id") or request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id

def format_request_detail(req: ServiceRequestModel, db: Session) -> ServiceRequestDetail:
    tech = None
    if req.technician_id:
        tech_model = db.query(TechnicianModel).filter(TechnicianModel.id == req.technician_id).first()
        if tech_model:
            tech = TechnicianBase(
                id=tech_model.id,
                name=tech_model.name,
                title=tech_model.title,
                company_branch=tech_model.company_branch,
                rating=tech_model.rating,
                total_jobs=tech_model.total_jobs,
                phone=tech_model.phone,
                avatar=tech_model.avatar,
                is_verified=tech_model.is_verified
            )
            
    timeline_raw = json.loads(req.timeline_json) if req.timeline_json else []
    timeline = [TimelineStep(**step) for step in timeline_raw]

    return ServiceRequestDetail(
        id=req.id,
        customer_id=req.customer_id,
        customer_name=req.customer_name,
        customer_phone=req.customer_phone,
        customer_address=req.customer_address,
        appliance_id=req.appliance_id,
        appliance_name=req.appliance_name,
        brand=req.brand,
        model_no=req.model_no,
        issue=req.issue,
        description=req.description,
        priority=req.priority,
        status=req.status,
        status_badge=req.status_badge,
        created_at=req.created_at,
        appointment_date=req.appointment_date,
        appointment_slot=req.appointment_slot,
        technician=tech,
        timeline=timeline,
        verification_otp=req.verification_otp
    )

@router.get("", response_model=List[ServiceRequestDetail])
def list_requests(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    query = db.query(ServiceRequestModel)
    if user.role == "customer":
        query = query.filter(ServiceRequestModel.customer_id == user_id)
    elif user.role == "technician":
        technician = db.query(TechnicianModel).filter(
            (TechnicianModel.id == user_id) | (TechnicianModel.name == user.name)
        ).first()
        technician_id = technician.id if technician else user_id
        query = query.filter(ServiceRequestModel.technician_id == technician_id)
    reqs = query.order_by(ServiceRequestModel.created_at.desc()).all()
    return [format_request_detail(r, db) for r in reqs]

@router.get("/{request_id}", response_model=ServiceRequestDetail)
def get_request(request_id: str, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")
    if user.role == "customer" and req.customer_id != user_id:
        raise HTTPException(status_code=403, detail="Not allowed to view this service request")
    if user.role == "technician":
        technician = db.query(TechnicianModel).filter(
            (TechnicianModel.id == user_id) | (TechnicianModel.name == user.name)
        ).first()
        if req.technician_id != (technician.id if technician else user_id):
            raise HTTPException(status_code=403, detail="Not allowed to view this service request")
    return format_request_detail(req, db)

@router.post("", response_model=ServiceRequestDetail)
def create_request(payload: ServiceBookingCreate, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can create service requests")

    appliance = db.query(ApplianceModel).filter(ApplianceModel.id == payload.appliance_id).first()
    app_name = f"{appliance.brand} {appliance.category}" if appliance else "Home Appliance"
    app_brand = appliance.brand if appliance else "Authorized Brand"
    app_model = appliance.model_no if appliance else "STD-01"

    req_num = random.randint(7850, 9999)
    new_id = f"SR-{req_num}"
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    otp_code = str(random.randint(1000, 9999))

    # Fetch default technician
    tech = db.query(TechnicianModel).first()

    initial_timeline = [
        {
            "id": "step_1",
            "title": "Request Created",
            "timestamp": now_str,
            "description": "Service ticket registered in Servora platform",
            "state": "completed"
        },
        {
            "id": "step_2",
            "title": "Technician Assigned",
            "timestamp": now_str,
            "description": f"Assigned to {tech.name} ({tech.title})" if tech else "Assigning technician",
            "state": "current"
        },
        {
            "id": "step_3",
            "title": "Technician on the Way",
            "timestamp": None,
            "description": "Live tracking will activate prior to appointment",
            "state": "pending"
        },
        {
            "id": "step_4",
            "title": "Service In Progress",
            "timestamp": None,
            "description": "Doorstep OTP verification & diagnostic inspection",
            "state": "pending"
        },
        {
            "id": "step_5",
            "title": "Completed",
            "timestamp": None,
            "description": "Digital job card closure & customer approval",
            "state": "pending"
        }
    ]

    new_req = ServiceRequestModel(
        id=new_id,
        customer_id=user.id,
        customer_name=user.name,
        customer_phone=user.phone,
        customer_address=payload.address or user.address or "12, Sector 4, Greater Noida",
        appliance_id=payload.appliance_id,
        appliance_name=app_name,
        brand=app_brand,
        model_no=app_model,
        issue=payload.issue,
        description=payload.description or f"Requested on-site repair service for {app_name}.",
        priority=payload.priority,
        status="Technician Assigned",
        status_badge="Scheduled",
        created_at=now_str,
        appointment_date=payload.preferred_date,
        appointment_slot=payload.preferred_slot,
        technician_id=tech.id if tech else None,
        verification_otp=otp_code,
        timeline_json=json.dumps(initial_timeline)
    )

    db.add(new_req)
    db.commit()
    db.refresh(new_req)
    return format_request_detail(new_req, db)

@router.post("/{request_id}/advance-status")
def advance_status(request_id: str, db: Session = Depends(get_db)):
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    states = [
        ("Request Created", "step_1"),
        ("Technician Assigned", "step_2"),
        ("Technician on the Way", "step_3"),
        ("Service In Progress", "step_4"),
        ("Completed", "step_5")
    ]

    current_idx = 0
    for idx, (s_title, _) in enumerate(states):
        if req.status == s_title:
            current_idx = idx
            break

    if current_idx < len(states) - 1:
        next_idx = current_idx + 1
        req.status = states[next_idx][0]
        now_time = datetime.now().strftime("%d %b %Y, %I:%M %p")

        timeline = json.loads(req.timeline_json) if req.timeline_json else []
        for idx, (s_title, s_id) in enumerate(states):
            for step in timeline:
                if step.get("id") == s_id:
                    if idx < next_idx:
                        step["state"] = "completed"
                    elif idx == next_idx:
                        step["state"] = "current"
                        step["timestamp"] = now_time
                    else:
                        step["state"] = "pending"

        req.timeline_json = json.dumps(timeline)
        if req.status == "Completed":
            req.status_badge = "Completed"
        else:
            req.status_badge = "In Progress"

        db.commit()
        db.refresh(req)

    return {"status": "success", "new_status": req.status, "request": format_request_detail(req, db)}
