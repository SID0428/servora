import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import ServiceRequestModel, EstimateModel, TechnicianModel, UserModel, ApplianceModel, SparePartModel
from app.schemas import (
    EstimateCreatePayload,
    EstimateResponse,
    EstimateRespondPayload,
    EstimatePartItem
)
from app.security import get_authenticated_user
from app.notification_service import notify_estimate_submitted

router = APIRouter(prefix="/api/requests", tags=["estimates"])

def format_estimate(est: EstimateModel) -> EstimateResponse:
    parts_raw = json.loads(est.parts_json) if est.parts_json else []
    parts = [EstimatePartItem(**p) if isinstance(p, dict) else p for p in parts_raw]
    covered_parts_cost = sum(p.total_price if p.total_price else (p.quantity * p.unit_price) for p in parts if getattr(p, "is_covered", False))
    customer_parts_cost = sum(p.total_price if p.total_price else (p.quantity * p.unit_price) for p in parts if not getattr(p, "is_covered", False))
    parts_total = covered_parts_cost + customer_parts_cost
    return EstimateResponse(
        id=est.id,
        request_id=est.request_id,
        technician_id=est.technician_id,
        technician_name=est.technician_name,
        parts=parts,
        labor_estimate=est.labor_estimate,
        inspection_fee=est.inspection_fee,
        parts_total=round(parts_total, 2),
        covered_parts_cost=round(covered_parts_cost, 2),
        customer_parts_cost=round(customer_parts_cost, 2),
        total_estimate=est.total_estimate,
        status=est.status,
        customer_remarks=est.customer_remarks,
        created_at=est.created_at,
        responded_at=est.responded_at
    )

@router.get("/{request_id}/estimate", response_model=EstimateResponse)
def get_estimate(request_id: str, db: Session = Depends(get_db)):
    est = db.query(EstimateModel).filter(EstimateModel.request_id == request_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="No estimate found for this service request")
    return format_estimate(est)

@router.post("/{request_id}/estimate", response_model=EstimateResponse)
def create_or_update_estimate(
    request_id: str,
    payload: EstimateCreatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    if user.role not in ("technician", "franchise", "branch", "company", "admin"):
        raise HTTPException(status_code=403, detail="Only technicians or franchise staff can submit pre-repair estimates")

    tech_id = req.technician_id or user.id
    tech_name = user.name
    if req.technician_id:
        tech_model = db.query(TechnicianModel).filter(TechnicianModel.id == req.technician_id).first()
        if tech_model:
            tech_name = tech_model.name

    is_under_warranty = bool(getattr(req, "is_under_warranty", False))

    # Calculate parts and split totals (Covered vs Customer Billable)
    parts_list = []
    parts_total = 0.0
    covered_parts_total = 0.0
    customer_parts_total = 0.0

    for p in payload.parts:
        item_total = round(p.quantity * p.unit_price, 2)
        parts_total += item_total
        p_dict = p.model_dump() if hasattr(p, "model_dump") else p.dict()
        p_dict["total_price"] = item_total

        is_covered = p.is_covered
        if is_covered is None:
            is_consumable = any(word in (p.part_name or "").lower() for word in ["gas", "filter", "gasket", "seal", "cleaning", "pipe"])
            is_covered = is_under_warranty and not is_consumable

        p_dict["is_covered"] = bool(is_covered)
        if is_covered:
            p_dict["coverage_type"] = "oem_warranty"
            p_dict["non_coverage_reason"] = None
            covered_parts_total += item_total
        else:
            p_dict["coverage_type"] = "customer_billable"
            p_dict["non_coverage_reason"] = p.non_coverage_reason or ("Consumable / Wear & Tear" if any(w in (p.part_name or "").lower() for w in ["gas", "filter", "seal"]) else "Out of Warranty / Excluded")
            customer_parts_total += item_total

        parts_list.append(p_dict)

    if is_under_warranty:
        inspection_fee = 0.0
        labor_estimate = 0.0 if covered_parts_total > 0 and customer_parts_total == 0 else round(payload.labor_estimate, 2)
    else:
        inspection_fee = payload.inspection_fee if payload.inspection_fee is not None else 299.0
        labor_estimate = round(payload.labor_estimate, 2)

    total_estimate = round(customer_parts_total + labor_estimate + inspection_fee, 2)
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")

    est_id = f"EST-{req.id.replace('SR-', '')}"
    est = db.query(EstimateModel).filter(EstimateModel.request_id == request_id).first()
    if est:
        est.parts_json = json.dumps(parts_list)
        est.labor_estimate = labor_estimate
        est.inspection_fee = inspection_fee
        est.total_estimate = total_estimate
        est.status = "pending"
        est.customer_remarks = None
        est.created_at = now_str
        est.responded_at = None
    else:
        est = EstimateModel(
            id=est_id,
            request_id=req.id,
            technician_id=tech_id,
            technician_name=tech_name,
            parts_json=json.dumps(parts_list),
            labor_estimate=labor_estimate,
            inspection_fee=inspection_fee,
            total_estimate=total_estimate,
            status="pending",
            customer_remarks=None,
            created_at=now_str,
            responded_at=None
        )
        db.add(est)

    # Transition request status to "Estimate Pending Approval"
    req.status = "Estimate Pending Approval"
    req.status_badge = "Estimate Pending"

    # Update timeline
    timeline = json.loads(req.timeline_json) if req.timeline_json else []
    estimate_timeline_step = {
        "id": "step_estimate",
        "title": "Estimate Pending Approval",
        "timestamp": now_str,
        "description": f"Pre-repair estimate of ₹{total_estimate:.2f} submitted by {tech_name}. Awaiting customer approval.",
        "state": "current"
    }
    # Replace existing or insert before completed
    existing_idx = next((i for i, s in enumerate(timeline) if s.get("id") == "step_estimate"), None)
    if existing_idx is not None:
        timeline[existing_idx] = estimate_timeline_step
    else:
        # Insert before step_5 (completed)
        step_5_idx = next((i for i, s in enumerate(timeline) if s.get("id") == "step_5"), len(timeline))
        timeline.insert(step_5_idx, estimate_timeline_step)
    
    req.timeline_json = json.dumps(timeline)

    db.commit()
    db.refresh(est)
    db.refresh(req)

    # Send Brevo email notification to customer
    notify_estimate_submitted(req, est, db)

    return format_estimate(est)

@router.post("/{request_id}/estimate/respond", response_model=EstimateResponse)
def respond_to_estimate(
    request_id: str,
    payload: EstimateRespondPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    if user.role != "customer" and user.role != "admin":
        if req.customer_id != user.id:
            raise HTTPException(status_code=403, detail="Only the booking customer or admin can approve/reject estimates")

    est = db.query(EstimateModel).filter(EstimateModel.request_id == request_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="No estimate found to respond to")

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    timeline = json.loads(req.timeline_json) if req.timeline_json else []

    if payload.action == "approve":
        est.status = "approved"
        est.customer_remarks = payload.remarks or "Approved by customer"
        est.responded_at = now_str

        req.status = "Repair in Progress"
        req.status_badge = "In Progress"

        for step in timeline:
            if step.get("id") == "step_estimate":
                step["state"] = "completed"
                step["timestamp"] = now_str
                step["description"] = f"Customer approved estimate of ₹{est.total_estimate:.2f}. Repair authorized."
            elif step.get("id") == "step_4":
                step["state"] = "current"
                step["description"] = "Parts replacement and repair in progress after customer estimate approval."

    elif payload.action == "reject":
        est.status = "rejected"
        est.customer_remarks = payload.remarks or "Customer declined the repair estimate."
        est.responded_at = now_str

        req.status = "Estimate Rejected"
        req.status_badge = "Estimate Rejected"

        for step in timeline:
            if step.get("id") == "step_estimate":
                step["state"] = "completed"
                step["timestamp"] = now_str
                step["description"] = f"Customer rejected estimate (Remarks: {est.customer_remarks})."

    req.timeline_json = json.dumps(timeline)
    db.commit()
    db.refresh(est)
    db.refresh(req)

    return format_estimate(est)
