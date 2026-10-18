import json
import random
import re
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
    UserModel
)
from app.schemas import (
    ServiceRequestDetail,
    ServiceBookingCreate,
    TechnicianBase,
    TimelineStep,
    FranchiseAssignPayload,
    TechnicianActionPayload
)
from app.security import get_authenticated_user

router = APIRouter(prefix="/api/requests", tags=["requests"])

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
        verification_otp=req.verification_otp,
        branch_id=req.branch_id,
        company_id=req.company_id,
        pincode=req.pincode,
        latitude=req.latitude,
        longitude=req.longitude
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
            req.brand.lower() == user.name.lower() or
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
    otp_code = str(random.randint(1000, 9999))

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
        verification_otp=otp_code,
        timeline_json=json.dumps(initial_timeline)
    )

    db.add(new_req)
    db.commit()
    db.refresh(new_req)
    return format_request_detail(new_req, db)

@router.post("/{request_id}/assign", response_model=ServiceRequestDetail)
def assign_technician(request_id: str, payload: FranchiseAssignPayload, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role not in ("branch", "franchise", "company", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized to assign technicians")

    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    tech = db.query(TechnicianModel).filter(TechnicianModel.id == payload.technician_id).first()
    if not tech:
        raise HTTPException(status_code=404, detail="Technician not found")

    req.technician_id = tech.id
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    
    timeline = json.loads(req.timeline_json) if req.timeline_json else []
    for step in timeline:
        if step.get("id") == "step_2":
            step["state"] = "completed"
            step["timestamp"] = now_str
            step["description"] = f"Assigned to {tech.name} ({tech.title})"
        elif step.get("id") == "step_3" and step.get("state") == "pending":
            step["state"] = "current"
            step["description"] = "Technician notified; ready for dispatch"
    
    req.timeline_json = json.dumps(timeline)
    req.status = "Technician Assigned"
    req.status_badge = "Scheduled"
    db.commit()
    db.refresh(req)
    return format_request_detail(req, db)

@router.post("/{request_id}/action", response_model=ServiceRequestDetail)
def technician_action(request_id: str, payload: TechnicianActionPayload, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    timeline = json.loads(req.timeline_json) if req.timeline_json else []

    action = payload.action.lower()
    if action == "accept":
        req.status = "Technician Assigned"
        req.status_badge = "Scheduled"
        for step in timeline:
            if step.get("id") == "step_2":
                step["state"] = "completed"
            elif step.get("id") == "step_3":
                step["state"] = "current"
                step["timestamp"] = now_str
    elif action in ("start_visit", "on_the_way"):
        req.status = "Technician on the Way"
        req.status_badge = "In Progress"
        for step in timeline:
            if step.get("id") in ("step_1", "step_2"):
                step["state"] = "completed"
            elif step.get("id") == "step_3":
                step["state"] = "completed"
                step["timestamp"] = now_str
            elif step.get("id") == "step_4":
                step["state"] = "current"
    elif action in ("diagnose", "in_progress"):
        req.status = "Service In Progress"
        req.status_badge = "In Progress"
        for step in timeline:
            if step.get("id") in ("step_1", "step_2", "step_3"):
                step["state"] = "completed"
            elif step.get("id") == "step_4":
                step["state"] = "current"
                step["timestamp"] = now_str
    elif action == "complete":
        if payload.verification_otp and payload.verification_otp != req.verification_otp:
            raise HTTPException(status_code=400, detail="Invalid customer verification OTP")
        req.status = "Completed"
        req.status_badge = "Completed"
        for step in timeline:
            step["state"] = "completed"
            if step.get("id") == "step_5":
                step["timestamp"] = now_str
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
