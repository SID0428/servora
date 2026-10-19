import json
import random
import re
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy import false, or_
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import (
    ServiceRequestModel,
    ApplianceModel,
    TechnicianModel,
    CompanyBranchModel,
    BranchTechnicianModel,
    UserModel,
    JobCardModel,
    ServiceFeedbackModel,
    SparePartModel,
    FranchiseInventoryModel,
    InventoryTransactionModel,
    WarrantyClaimModel,
    AMCSubscriptionModel
)
from app.schemas import (
    ServiceRequestDetail,
    ServiceBookingCreate,
    TechnicianBase,
    TimelineStep,
    FranchiseAssignPayload,
    TechnicianActionPayload,
    JobCardPartItem,
    JobCardCreatePayload,
    JobCardResponse,
    JobCardCustomerActionPayload,
    ServiceFeedbackPayload,
    ServiceFeedbackResponse,
    TicketReopenPayload,
    PaymentCheckoutPayload,
    PaymentResponse
)
from app.security import get_authenticated_user

router = APIRouter(prefix="/api/requests", tags=["requests"])

def format_job_card(jc: JobCardModel) -> JobCardResponse:
    parts_raw = json.loads(jc.parts_used_json) if jc.parts_used_json else []
    parts = [JobCardPartItem(**p) if isinstance(p, dict) else p for p in parts_raw]
    return JobCardResponse(
        id=jc.id,
        request_id=jc.request_id,
        technician_id=jc.technician_id,
        customer_id=jc.customer_id,
        work_summary=jc.work_summary,
        parts_used=parts,
        inspection_fee=getattr(jc, "inspection_fee", 299.0) if getattr(jc, "inspection_fee", 299.0) is not None else 299.0,
        labor_cost=jc.labor_cost,
        parts_cost=jc.parts_cost,
        discount_amount=getattr(jc, "discount_amount", 0.0) if getattr(jc, "discount_amount", 0.0) is not None else 0.0,
        cgst_amount=getattr(jc, "cgst_amount", 0.0) if getattr(jc, "cgst_amount", 0.0) is not None else round(jc.tax_amount / 2, 2),
        sgst_amount=getattr(jc, "sgst_amount", 0.0) if getattr(jc, "sgst_amount", 0.0) is not None else round(jc.tax_amount / 2, 2),
        tax_amount=jc.tax_amount,
        total_amount=jc.total_amount,
        is_warranty_covered=bool(getattr(jc, "is_warranty_covered", False)),
        technician_signature=jc.technician_signature,
        customer_signature=jc.customer_signature,
        customer_status=jc.customer_status,
        customer_remarks=jc.customer_remarks,
        completed_at=jc.completed_at
    )

def format_feedback(fb: ServiceFeedbackModel) -> ServiceFeedbackResponse:
    return ServiceFeedbackResponse(
        id=fb.id,
        request_id=fb.request_id,
        customer_id=fb.customer_id,
        technician_id=fb.technician_id,
        rating_overall=fb.rating_overall,
        rating_quality=fb.rating_quality,
        rating_behavior=fb.rating_behavior,
        rating_pricing=fb.rating_pricing,
        comment=fb.comment,
        created_at=fb.created_at
    )

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

    previous_job_card = None
    if getattr(req, "previous_job_card_json", None):
        try:
            pjc_data = json.loads(req.previous_job_card_json)
            if isinstance(pjc_data, dict):
                parts_raw = pjc_data.get("parts_used", [])
                parts = [JobCardPartItem(**p) if isinstance(p, dict) else p for p in parts_raw]
                previous_job_card = JobCardResponse(
                    id=pjc_data.get("id", f"JC-{req.id.replace('SR-', '')}-PREV"),
                    request_id=req.id,
                    technician_id=pjc_data.get("technician_id", getattr(req, "previous_technician_id", "") or ""),
                    customer_id=req.customer_id,
                    work_summary=pjc_data.get("work_summary", "Previous service completion"),
                    parts_used=parts,
                    labor_cost=float(pjc_data.get("labor_cost", 0.0)),
                    parts_cost=float(pjc_data.get("parts_cost", 0.0)),
                    tax_amount=float(pjc_data.get("tax_amount", 0.0)),
                    total_amount=float(pjc_data.get("total_amount", 0.0)),
                    technician_signature=pjc_data.get("technician_signature"),
                    customer_signature=pjc_data.get("customer_signature"),
                    customer_status=pjc_data.get("customer_status", "accepted"),
                    customer_remarks=pjc_data.get("customer_remarks"),
                    completed_at=pjc_data.get("completed_at", "")
                )
        except Exception:
            previous_job_card = None

    start_otp_val = getattr(req, "start_otp", None) or req.verification_otp
    completion_otp_val = getattr(req, "completion_otp", None)
    payment_status_val = getattr(req, "payment_status", None) or ("Paid" if req.status == "Completed" else "Pending")

    current_jc = db.query(JobCardModel).filter(JobCardModel.request_id == req.id).first()
    current_job_card = format_job_card(current_jc) if current_jc else None

    # Status badge normalization: Reopened warranty revisits should display as "Reopened", not "Disputed"
    computed_badge = req.status_badge or "Pending"
    if req.status == "Completed":
        computed_badge = "Completed"
    elif req.is_reopened and req.status != "Completed":
        computed_badge = "Reopened"
    elif req.status == "Reopened / Under Review":
        computed_badge = "Reopened"

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
        status_badge=computed_badge,
        created_at=req.created_at,
        appointment_date=req.appointment_date,
        appointment_slot=req.appointment_slot,
        technician=tech,
        timeline=timeline,
        verification_otp=req.verification_otp,
        start_otp=start_otp_val,
        completion_otp=completion_otp_val,
        previous_technician_id=getattr(req, "previous_technician_id", None),
        previous_technician_name=getattr(req, "previous_technician_name", None),
        previous_job_card=previous_job_card,
        job_card=current_job_card,
        is_reopened=bool(getattr(req, "is_reopened", False)),
        is_under_warranty=bool(getattr(req, "is_under_warranty", False)),
        payment_status=payment_status_val,
        payment_method=getattr(req, "payment_method", None),
        payment_transaction_id=getattr(req, "payment_transaction_id", None),
        paid_at=getattr(req, "paid_at", None),
        branch_id=req.branch_id,
        company_id=req.company_id,
        pincode=req.pincode,
        latitude=req.latitude,
        longitude=req.longitude,
        defect_photo=req.defect_photo,
        reopened_reason=req.reopened_reason,
        reopened_at=req.reopened_at
    )

@router.get("", response_model=List[ServiceRequestDetail])
def list_requests(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    user_id = user.id
    query = db.query(ServiceRequestModel)
    if user.role == "customer":
        query = query.filter(ServiceRequestModel.customer_id == user_id)
    elif user.role == "technician":
        technician = db.query(TechnicianModel).filter(
            (TechnicianModel.id == user_id) | (TechnicianModel.name == user.name)
        ).first()
        technician_id = technician.id if technician else user_id
        query = query.filter(ServiceRequestModel.technician_id == technician_id)
    elif user.role == "company":
        company_app_ids = [
            app_id for (app_id,) in db.query(ApplianceModel.id).filter(
                (ApplianceModel.company_id == user.id) | (ApplianceModel.brand.ilike(user.name.strip()))
            ).all()
        ]
        query = query.filter(
            or_(
                ServiceRequestModel.company_id == user.id,
                ServiceRequestModel.appliance_id.in_(company_app_ids),
                ServiceRequestModel.brand.ilike(user.name.strip())
            )
        )
    elif user.role in ("branch", "franchise"):
        branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == user_id).first()
        if branch:
            query = query.filter(
                or_(
                    ServiceRequestModel.branch_id == branch.id,
                    ServiceRequestModel.pincode == branch.pincode
                )
            )
        else:
            query = query.filter(ServiceRequestModel.branch_id == user_id)
    reqs = query.order_by(ServiceRequestModel.created_at.desc()).all()
    return [format_request_detail(r, db) for r in reqs]

@router.get("/{request_id}", response_model=ServiceRequestDetail)
def get_request(request_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    user_id = user.id
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")
    if user.role == "customer" and req.customer_id != user_id:
        raise HTTPException(status_code=403, detail="Not allowed to view this service request")
    if user.role == "company":
        is_company_request = (
            req.company_id == user.id or
            (req.brand and user.name and (req.brand.lower() in user.name.lower() or user.name.lower() in req.brand.lower())) or
            db.query(ApplianceModel).filter(
                ApplianceModel.id == req.appliance_id,
                (ApplianceModel.company_id == user.id) | (ApplianceModel.brand.ilike(user.name.strip()))
            ).first() is not None
        )
        if not is_company_request:
            raise HTTPException(status_code=403, detail="Not allowed to view this service request")
    elif user.role in ("branch", "franchise"):
        branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == user_id).first()
        is_branch_request = (
            req.branch_id == user_id or
            (branch and (req.branch_id == branch.id or req.pincode == branch.pincode))
        )
        if not is_branch_request:
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
    user = get_authenticated_user(request, db)
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can create service requests")

    appliance = db.query(ApplianceModel).filter(ApplianceModel.id == payload.appliance_id).first()
    app_name = f"{appliance.brand} {appliance.category}" if appliance else "Home Appliance"
    app_brand = appliance.brand if appliance else "Authorized Brand"
    app_model = appliance.model_no if appliance else "STD-01"

    # Identify company
    company_id = None
    if appliance and appliance.company_id:
        company_id = appliance.company_id
    elif appliance and appliance.brand:
        company_user = db.query(UserModel).filter(
            UserModel.role == "company",
            UserModel.name.ilike(appliance.brand.strip())
        ).first()
        if company_user:
            company_id = company_user.id

    if not company_id:
        default_company = db.query(UserModel).filter(UserModel.role == "company").first()
        if default_company:
            company_id = default_company.id

    # Extract pincode from payload or address
    pincode = payload.pincode.strip() if payload.pincode else None
    addr_to_check = payload.address or user.address or ""
    if not pincode and addr_to_check:
        pin_match = re.search(r"\b(\d{6})\b", addr_to_check)
        if pin_match:
            pincode = pin_match.group(1)

    # Route to matching or nearest Franchise branch by PIN code
    branch_id = None
    matched_branch = None
    if pincode and company_id:
        matched_branch = db.query(CompanyBranchModel).filter(
            CompanyBranchModel.company_id == company_id,
            CompanyBranchModel.pincode == pincode
        ).first()

    if not matched_branch and company_id:
        matched_branch = db.query(CompanyBranchModel).filter(
            CompanyBranchModel.company_id == company_id
        ).first()

    if not matched_branch and pincode:
        matched_branch = db.query(CompanyBranchModel).filter(
            CompanyBranchModel.pincode == pincode
        ).first()

    if not matched_branch:
        matched_branch = db.query(CompanyBranchModel).first()

    if matched_branch:
        branch_id = matched_branch.id

    req_num = random.randint(7850, 9999)
    new_id = f"SR-{req_num}"
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    start_otp_code = str(random.randint(1000, 9999))
    completion_otp_code = str(random.randint(1000, 9999))
    while completion_otp_code == start_otp_code:
        completion_otp_code = str(random.randint(1000, 9999))

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
            "title": "Technician Assignment",
            "timestamp": None,
            "description": "Awaiting assignment by local franchise",
            "state": "pending"
        },
        {
            "id": "step_3",
            "title": "Technician on the Way",
            "timestamp": None,
            "description": "Live route tracking activates when technician starts visit",
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

    appliance_rec = db.query(ApplianceModel).filter(ApplianceModel.id == payload.appliance_id).first()
    is_warranty = False
    if appliance_rec:
        if appliance_rec.amc_active:
            is_warranty = True
        elif appliance_rec.warranty_status and ("under" in appliance_rec.warranty_status.lower() or "active" in appliance_rec.warranty_status.lower()):
            is_warranty = True

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
        status="Request Created",
        status_badge="Pending",
        created_at=now_str,
        appointment_date=payload.preferred_date,
        appointment_slot=payload.preferred_slot,
        technician_id=None,
        branch_id=branch_id,
        company_id=company_id,
        pincode=pincode or "201310",
        latitude=payload.latitude,
        longitude=payload.longitude,
        defect_photo=payload.defect_photo,
        verification_otp=start_otp_code,
        start_otp=start_otp_code,
        completion_otp=completion_otp_code,
        is_reopened=False,
        is_under_warranty=is_warranty,
        payment_status="Pending",
        timeline_json=json.dumps(initial_timeline)
    )

    db.add(new_req)
    db.commit()
    db.refresh(new_req)
    return format_request_detail(new_req, db)

@router.post("/{request_id}/assign", response_model=ServiceRequestDetail)
def assign_technician(request_id: str, payload: FranchiseAssignPayload, request: Request, db: Session = Depends(get_db)):
    try:
        user = get_authenticated_user(request, db)
    except HTTPException:
        user = None

    if user and user.role not in ("branch", "franchise", "company", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized to assign technicians")

    target_id = payload.request_id or request_id
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == target_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    tech = db.query(TechnicianModel).filter(
        or_(TechnicianModel.id == payload.technician_id, TechnicianModel.name == payload.technician_id)
    ).first()
    if not tech:
        u = db.query(UserModel).filter(
            or_(UserModel.id == payload.technician_id, UserModel.name == payload.technician_id)
        ).first()
        if u:
            tech = db.query(TechnicianModel).filter(
                or_(TechnicianModel.id == u.id, TechnicianModel.name == u.name)
            ).first()

    if not tech:
        tech = db.query(TechnicianModel).first()

    if not tech:
        raise HTTPException(status_code=404, detail="Technician not found")

    req.technician_id = tech.id
    if payload.priority:
        req.priority = payload.priority

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    
    if getattr(req, "is_reopened", False):
        if req.previous_technician_id and tech.id == req.previous_technician_id:
            assignment_desc = f"Reassigned to original technician {tech.name} ({tech.title}) for revisit"
        elif req.previous_technician_name:
            assignment_desc = f"Reassigned to new technician {tech.name} ({tech.title}) (Previously serviced by {req.previous_technician_name})"
        else:
            assignment_desc = f"Reassigned to technician {tech.name} ({tech.title}) for revisit"
    else:
        assignment_desc = f"Assigned to {tech.name} ({tech.title})"

    timeline = json.loads(req.timeline_json) if req.timeline_json else []
    for step in timeline:
        if step.get("id") == "step_2":
            step["state"] = "completed"
            step["timestamp"] = now_str
            step["description"] = assignment_desc
        elif step.get("id") == "step_3":
            step["state"] = "current"
            step["timestamp"] = None
            step["description"] = "Technician notified; ready for dispatch"
        elif step.get("id") in ("step_4", "step_5"):
            step["state"] = "pending"
            step["timestamp"] = None
    
    req.timeline_json = json.dumps(timeline)
    req.status = "Technician Assigned"
    req.status_badge = "Scheduled"
    db.commit()
    db.refresh(req)
    return format_request_detail(req, db)

@router.post("/{request_id}/action", response_model=ServiceRequestDetail)
def technician_action(request_id: str, payload: TechnicianActionPayload, request: Request, db: Session = Depends(get_db)):
    try:
        user = get_authenticated_user(request, db)
    except HTTPException:
        user = None

    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    # Link technician if not set
    if user and getattr(user, "role", "") == "technician" and not req.technician_id:
        req.technician_id = user.id
    elif not req.technician_id:
        first_tech = db.query(TechnicianModel).first()
        if first_tech:
            req.technician_id = first_tech.id

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    timeline = json.loads(req.timeline_json) if req.timeline_json else []

    action = payload.action.lower()
    if action == "accept":
        req.status = "Technician Assigned"
        req.status_badge = "Scheduled"
        for step in timeline:
            if step.get("id") == "step_2":
                step["state"] = "completed"
                if not step.get("timestamp"):
                    step["timestamp"] = now_str
            elif step.get("id") == "step_3":
                step["state"] = "current"
                step["timestamp"] = now_str
    elif action in ("start_visit", "on_the_way"):
        req.status = "Technician on the Way"
        req.status_badge = "In Progress"
        for step in timeline:
            if step.get("id") in ("step_1", "step_2"):
                step["state"] = "completed"
                if not step.get("timestamp"):
                    step["timestamp"] = now_str
            elif step.get("id") == "step_3":
                step["state"] = "current"
                step["timestamp"] = now_str
                step["description"] = "Technician on the way to customer doorstep (Live GPS active)"
            elif step.get("id") == "step_4":
                step["state"] = "pending"
    elif action in ("start_service",):
        expected_start_otp = getattr(req, "start_otp", None) or req.verification_otp
        if not payload.verification_otp or payload.verification_otp.strip() != expected_start_otp.strip():
            raise HTTPException(status_code=400, detail="Invalid Service Start OTP provided by customer. Please verify with customer at doorstep.")
        req.status = "Service In Progress"
        req.status_badge = "In Progress"
        for step in timeline:
            if step.get("id") in ("step_1", "step_2", "step_3"):
                step["state"] = "completed"
                if not step.get("timestamp"):
                    step["timestamp"] = now_str
            elif step.get("id") == "step_4":
                step["state"] = "current"
                step["timestamp"] = now_str
                step["description"] = "Doorstep arrival verified via Service Start OTP. Diagnostics & repair in progress."
            elif step.get("id") == "step_5":
                step["state"] = "pending"
    elif action in ("diagnose", "in_progress"):
        req.status = "Service In Progress"
        req.status_badge = "In Progress"
        for step in timeline:
            if step.get("id") in ("step_1", "step_2", "step_3"):
                step["state"] = "completed"
                if not step.get("timestamp"):
                    step["timestamp"] = now_str
            elif step.get("id") == "step_4":
                step["state"] = "current"
                step["timestamp"] = now_str
                step["description"] = "On-site diagnosis & inspection in progress"
    elif action == "complete":
        expected_comp_otp = getattr(req, "completion_otp", None) or req.verification_otp
        if payload.verification_otp and payload.verification_otp.strip() != expected_comp_otp.strip():
            raise HTTPException(status_code=400, detail="Invalid Service Completion OTP provided by customer. Please verify with customer upon repair completion.")
        req.status = "Completed"
        req.status_badge = "Completed"
        req.payment_status = "Paid"
        for step in timeline:
            step["state"] = "completed"
            if not step.get("timestamp"):
                step["timestamp"] = now_str
            if step.get("id") == "step_5":
                step["timestamp"] = now_str
                step["description"] = "Service successfully completed & verified via Completion OTP. Payment settled (PAID)."
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {payload.action}")

    req.timeline_json = json.dumps(timeline)
    db.commit()
    db.refresh(req)
    return format_request_detail(req, db)

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

@router.post("/{request_id}/job-card", response_model=JobCardResponse)
def create_job_card(request_id: str, payload: JobCardCreatePayload, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    if user.role not in ("technician", "admin", "franchise", "branch"):
        raise HTTPException(status_code=403, detail="Only assigned technicians or franchise can create job cards")

    if user.role == "technician":
        technician = db.query(TechnicianModel).filter(
            (TechnicianModel.id == user.id) | (TechnicianModel.name == user.name)
        ).first()
        tech_id = technician.id if technician else user.id
        if req.technician_id and req.technician_id != tech_id:
            raise HTTPException(status_code=403, detail="You are not assigned to this service request")
    else:
        tech_id = req.technician_id or "tech-default"

    # Phase 2 Price Engine (FR-BILL-001)
    is_warranty_covered = bool(payload.is_warranty_covered or getattr(req, "is_under_warranty", False))
    raw_parts_cost = round(sum(p.total_price if p.total_price else (p.quantity * p.unit_price) for p in payload.parts_used), 2)
    raw_labor_cost = round(payload.labor_cost, 2)
    raw_inspection_fee = round(payload.inspection_fee if payload.inspection_fee is not None else 299.0, 2)

    if is_warranty_covered:
        inspection_fee = 0.0
        labor_cost = 0.0
        parts_cost = 0.0
        discount_amount = 0.0
        subtotal = 0.0
        cgst_amount = 0.0
        sgst_amount = 0.0
        tax_amount = 0.0
        total_amount = 0.0
    else:
        inspection_fee = raw_inspection_fee
        labor_cost = raw_labor_cost
        parts_cost = raw_parts_cost
        discount_amount = round(payload.discount_amount or 0.0, 2)
        subtotal = max(0.0, round(inspection_fee + labor_cost + parts_cost - discount_amount, 2))
        cgst_amount = round(subtotal * 0.09, 2)
        sgst_amount = round(subtotal * 0.09, 2)
        tax_amount = round(cgst_amount + sgst_amount, 2)
        total_amount = round(subtotal + tax_amount, 2)

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")

    jc = db.query(JobCardModel).filter(JobCardModel.request_id == request_id).first()
    if jc:
        jc.work_summary = payload.work_summary
        jc.parts_used_json = json.dumps([(p.model_dump() if hasattr(p, "model_dump") else p.dict()) for p in payload.parts_used])
        jc.inspection_fee = inspection_fee
        jc.labor_cost = labor_cost
        jc.parts_cost = parts_cost
        jc.discount_amount = discount_amount
        jc.cgst_amount = cgst_amount
        jc.sgst_amount = sgst_amount
        jc.tax_amount = tax_amount
        jc.total_amount = total_amount
        jc.is_warranty_covered = is_warranty_covered
        if payload.technician_signature:
            jc.technician_signature = payload.technician_signature
        jc.completed_at = now_str
    else:
        jc_id = f"JC-{req.id.replace('SR-', '')}"
        jc = JobCardModel(
            id=jc_id,
            request_id=req.id,
            technician_id=tech_id,
            customer_id=req.customer_id,
            work_summary=payload.work_summary,
            parts_used_json=json.dumps([(p.model_dump() if hasattr(p, "model_dump") else p.dict()) for p in payload.parts_used]),
            inspection_fee=inspection_fee,
            labor_cost=labor_cost,
            parts_cost=parts_cost,
            discount_amount=discount_amount,
            cgst_amount=cgst_amount,
            sgst_amount=sgst_amount,
            tax_amount=tax_amount,
            total_amount=total_amount,
            is_warranty_covered=is_warranty_covered,
            technician_signature=payload.technician_signature,
            customer_signature=None,
            customer_status="pending_acceptance",
            customer_remarks=None,
            completed_at=now_str
        )
        db.add(jc)

    # Phase 2 FR-INV-003: Automatic inventory deduction for parts used
    branch_id = req.branch_id
    if not branch_id and tech_id:
        bt = db.query(BranchTechnicianModel).filter(BranchTechnicianModel.technician_id == tech_id).first()
        if bt:
            branch_id = bt.branch_id
        if not branch_id:
            first_branch = db.query(CompanyBranchModel).first()
            if first_branch:
                branch_id = first_branch.id
        req.branch_id = branch_id

    if payload.parts_used and branch_id:
        for p in payload.parts_used:
            part_id = getattr(p, "part_id", None)
            part_code = getattr(p, "part_code", None)
            part_obj = None
            if part_id:
                part_obj = db.query(SparePartModel).filter(SparePartModel.id == part_id).first()
            if not part_obj and part_code:
                part_obj = db.query(SparePartModel).filter(SparePartModel.part_code == part_code).first()
            if not part_obj and p.part_name:
                part_obj = db.query(SparePartModel).filter(SparePartModel.name.ilike(f"%{p.part_name}%")).first()

            if part_obj:
                inv = db.query(FranchiseInventoryModel).filter(
                    FranchiseInventoryModel.branch_id == branch_id,
                    FranchiseInventoryModel.part_id == part_obj.id
                ).first()
                if inv:
                    inv.quantity_available = max(0, inv.quantity_available - p.quantity)
                    txn = InventoryTransactionModel(
                        id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
                        branch_id=branch_id,
                        part_id=part_obj.id,
                        transaction_type="job_consumption",
                        quantity=p.quantity,
                        reference_id=jc.id,
                        performed_by=f"Technician ({tech_id})",
                        notes=f"Automatic deduction: {p.quantity}x {part_obj.name} consumed on {req.id}"
                    )
                    db.add(txn)

    # Phase 2 FR-WAR-002: Automatic OEM Warranty Claim creation
    if is_warranty_covered and (raw_parts_cost > 0 or raw_labor_cost > 0) and req.company_id:
        claim_id = f"CLM-{req.id.replace('SR-', '')}"
        existing_claim = db.query(WarrantyClaimModel).filter(WarrantyClaimModel.id == claim_id).first()
        if not existing_claim:
            w_claim = WarrantyClaimModel(
                id=claim_id,
                request_id=req.id,
                company_id=req.company_id,
                branch_id=req.branch_id or "branch_1",
                appliance_id=req.appliance_id,
                claim_amount=round(raw_parts_cost + raw_labor_cost, 2),
                parts_claimed_json=json.dumps([(p.model_dump() if hasattr(p, "model_dump") else p.dict()) for p in payload.parts_used]),
                status="Pending Review",
                claim_notes=f"OEM Warranty reimbursement claim for {req.appliance_name} ({req.model_no}). Consumer billed ₹0.00.",
                submitted_at=now_str
            )
            db.add(w_claim)

    # Update timeline and completion if completion_otp is provided
    timeline = json.loads(req.timeline_json) if req.timeline_json else []
    if payload.completion_otp:
        expected_comp_otp = getattr(req, "completion_otp", None) or req.verification_otp
        if payload.completion_otp.strip() != expected_comp_otp.strip():
            raise HTTPException(status_code=400, detail="Invalid Service Completion OTP provided by customer. Please verify with customer upon repair completion.")
        jc.customer_status = "accepted"
        req.status = "Completed"
        req.status_badge = "Completed"
        if is_warranty_covered or total_amount == 0:
            req.payment_status = "Paid (Warranty Covered)"
            req.paid_at = now_str
        elif not req.payment_status or req.payment_status == "Pending":
            req.payment_status = "Paid"
            req.paid_at = now_str
        for step in timeline:
            step["state"] = "completed"
            if not step.get("timestamp"):
                step["timestamp"] = now_str
            if step.get("id") == "step_5":
                step["timestamp"] = now_str
                if is_warranty_covered:
                    step["description"] = f"Job card finalized (₹0.00 - Covered under Manufacturer Warranty). Replaced spares & labor reimbursed by OEM Brand."
                else:
                    step["description"] = f"Job card generated (₹{total_amount:.2f}) & verified with customer Completion OTP. Service closed and payment settled (PAID)."
    else:
        for step in timeline:
            if step.get("id") == "step_5":
                step["timestamp"] = now_str
                step["description"] = f"Digital job card generated (₹{total_amount:.2f}). Awaiting customer sign-off or completion OTP."
    req.timeline_json = json.dumps(timeline)

    db.commit()
    db.refresh(jc)
    db.refresh(req)
    return format_job_card(jc)

@router.get("/{request_id}/job-card", response_model=JobCardResponse)
def get_job_card(request_id: str, request: Request, db: Session = Depends(get_db)):
    _ = get_authenticated_user(request, db)
    jc = db.query(JobCardModel).filter(JobCardModel.request_id == request_id).first()
    if not jc:
        raise HTTPException(status_code=404, detail="Job card not found for this service request")
    return format_job_card(jc)

@router.post("/{request_id}/job-card/respond", response_model=JobCardResponse)
def respond_job_card(request_id: str, payload: JobCardCustomerActionPayload, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")
    if user.role == "customer" and req.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to act on this job card")

    jc = db.query(JobCardModel).filter(JobCardModel.request_id == request_id).first()
    if not jc:
        raise HTTPException(status_code=404, detail="Job card not found for this service request")

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    timeline = json.loads(req.timeline_json) if req.timeline_json else []

    if payload.action == "accept":
        jc.customer_status = "accepted"
        if payload.customer_signature:
            jc.customer_signature = payload.customer_signature
        jc.customer_remarks = payload.remarks or "Customer accepted and signed job card."

        req.status = "Completed"
        req.status_badge = "Completed"
        req.payment_status = "Paid"
        for step in timeline:
            step["state"] = "completed"
            if not step.get("timestamp"):
                step["timestamp"] = now_str
            if step.get("id") == "step_5":
                step["timestamp"] = now_str
                step["description"] = "Job card approved & signed by customer. Service closed and payment settled (PAID)."
    elif payload.action == "dispute":
        jc.customer_status = "disputed"
        jc.customer_remarks = payload.remarks or "Customer disputed the job card charges/repairs."

        req.status = "Disputed"
        req.status_badge = "Disputed"
        for step in timeline:
            if step.get("id") == "step_5":
                step["timestamp"] = now_str
                step["description"] = f"Job card disputed by customer: {jc.customer_remarks}"
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {payload.action}")

    req.timeline_json = json.dumps(timeline)
    db.commit()
    db.refresh(jc)
    db.refresh(req)
    return format_job_card(jc)

@router.post("/{request_id}/payment", response_model=PaymentResponse)
def process_request_payment(
    request_id: str,
    payload: PaymentCheckoutPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    if user.role == "customer" and req.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to make payment for this request")

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    txn_ref = payload.transaction_ref or f"PAY-{uuid.uuid4().hex[:8].upper()}"
    receipt_no = f"REC-{req.id}"

    req.payment_status = "Paid"
    req.payment_method = payload.payment_method
    req.payment_transaction_id = txn_ref
    req.paid_at = now_str

    # Update timeline
    timeline = json.loads(req.timeline_json) if req.timeline_json else []
    for step in timeline:
        if step.get("id") == "step_5":
            step["description"] = f"Payment of ₹{payload.amount:.2f} received via {payload.payment_method.upper()} (Ref: {txn_ref}). Official tax invoice generated."
    req.timeline_json = json.dumps(timeline)

    # If job card exists and pending acceptance, mark accepted
    jc = db.query(JobCardModel).filter(JobCardModel.request_id == request_id).first()
    if jc:
        jc.customer_status = "accepted"
        if not jc.customer_remarks:
            jc.customer_remarks = f"Settled via online {payload.payment_method.upper()} payment."

    db.commit()
    db.refresh(req)

    return PaymentResponse(
        success=True,
        request_id=req.id,
        payment_status="Paid",
        payment_method=payload.payment_method,
        amount_paid=payload.amount,
        transaction_ref=txn_ref,
        receipt_no=receipt_no,
        paid_at=now_str
    )

@router.post("/{request_id}/feedback", response_model=ServiceFeedbackResponse)
def submit_feedback(request_id: str, payload: ServiceFeedbackPayload, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    if user.role == "customer" and req.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to submit feedback for this request")

    if req.status != "Completed":
        raise HTTPException(status_code=400, detail="Feedback can only be submitted for completed service requests")

    tech_id = req.technician_id or "tech-default"
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")

    fb = db.query(ServiceFeedbackModel).filter(ServiceFeedbackModel.request_id == request_id).first()
    if fb:
        fb.rating_overall = payload.rating_overall
        fb.rating_quality = payload.rating_quality
        fb.rating_behavior = payload.rating_behavior
        fb.rating_pricing = payload.rating_pricing
        fb.comment = payload.comment
        fb.created_at = now_str
    else:
        fb_id = f"FB-{req.id.replace('SR-', '')}"
        fb = ServiceFeedbackModel(
            id=fb_id,
            request_id=req.id,
            customer_id=req.customer_id,
            technician_id=tech_id,
            rating_overall=payload.rating_overall,
            rating_quality=payload.rating_quality,
            rating_behavior=payload.rating_behavior,
            rating_pricing=payload.rating_pricing,
            comment=payload.comment,
            created_at=now_str
        )
        db.add(fb)

    db.commit()
    db.refresh(fb)

    # Recalculate technician rating
    technician = db.query(TechnicianModel).filter(TechnicianModel.id == tech_id).first()
    if technician:
        all_fbs = db.query(ServiceFeedbackModel).filter(ServiceFeedbackModel.technician_id == tech_id).all()
        if all_fbs:
            avg_rating = round(sum(f.rating_overall for f in all_fbs) / len(all_fbs), 1)
            technician.rating = avg_rating
            db.commit()

    return format_feedback(fb)

@router.get("/{request_id}/feedback", response_model=Optional[ServiceFeedbackResponse])
def get_feedback(request_id: str, request: Request, db: Session = Depends(get_db)):
    _ = get_authenticated_user(request, db)
    fb = db.query(ServiceFeedbackModel).filter(ServiceFeedbackModel.request_id == request_id).first()
    if not fb:
        return None
    return format_feedback(fb)

@router.post("/{request_id}/reopen", response_model=ServiceRequestDetail)
def reopen_ticket(request_id: str, payload: TicketReopenPayload, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    if user.role == "customer" and req.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to reopen this request")

    if req.status != "Completed":
        raise HTTPException(status_code=400, detail="Only completed service requests can be reopened")

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    full_reason = payload.reason + (f": {payload.notes}" if payload.notes else "")

    # Snapshot current job card into previous_job_card_json if present
    existing_jc = db.query(JobCardModel).filter(JobCardModel.request_id == request_id).first()
    if existing_jc:
        parts_raw = json.loads(existing_jc.parts_used_json) if existing_jc.parts_used_json else []
        snapshot = {
            "id": existing_jc.id,
            "technician_id": existing_jc.technician_id,
            "work_summary": existing_jc.work_summary,
            "parts_used": parts_raw,
            "labor_cost": existing_jc.labor_cost,
            "parts_cost": existing_jc.parts_cost,
            "tax_amount": existing_jc.tax_amount,
            "total_amount": existing_jc.total_amount,
            "technician_signature": existing_jc.technician_signature,
            "customer_signature": existing_jc.customer_signature,
            "customer_status": existing_jc.customer_status,
            "customer_remarks": existing_jc.customer_remarks,
            "completed_at": existing_jc.completed_at
        }
        req.previous_job_card_json = json.dumps(snapshot)

    # Save previous technician details
    if req.technician_id:
        req.previous_technician_id = req.technician_id
        prev_tech = db.query(TechnicianModel).filter(TechnicianModel.id == req.technician_id).first()
        if prev_tech:
            req.previous_technician_name = prev_tech.name

    # Generate fresh OTPs for revisit
    new_start_otp = str(random.randint(1000, 9999))
    new_completion_otp = str(random.randint(1000, 9999))
    while new_completion_otp == new_start_otp:
        new_completion_otp = str(random.randint(1000, 9999))

    req.start_otp = new_start_otp
    req.verification_otp = new_start_otp
    req.completion_otp = new_completion_otp
    req.is_reopened = True
    req.status = "Reopened / Under Review"
    req.status_badge = "Reopened"
    req.reopened_reason = full_reason
    req.reopened_at = now_str

    timeline = json.loads(req.timeline_json) if req.timeline_json else []
    for step in timeline:
        if step.get("id") == "step_2":
            step["state"] = "current"
            step["timestamp"] = now_str
            step["description"] = "Ticket reopened by customer for repeat issue. Awaiting franchise reassignment."
        elif step.get("id") in ("step_3", "step_4", "step_5"):
            step["state"] = "pending"
            step["timestamp"] = None

    timeline.append({
        "id": f"step_reopen_{int(datetime.now().timestamp())}",
        "title": "Ticket Reopened by Customer",
        "timestamp": now_str,
        "description": f"Repeat issue reported: {full_reason}. Historical job card & payment receipt preserved.",
        "state": "completed"
    })
    req.timeline_json = json.dumps(timeline)

    db.commit()
    db.refresh(req)
    return format_request_detail(req, db)

