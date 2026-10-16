from fastapi import APIRouter, Request, HTTPException
from typing import List, Optional
import random
from datetime import datetime
from app.database import SERVICE_REQUESTS, APPLIANCES, TECHNICIANS, USERS
from app.models import ServiceRequest, ServiceBookingCreate, TimelineStep

router = APIRouter(prefix="/api/requests", tags=["requests"])

def get_current_user_id(request: Request) -> str:
    return request.cookies.get("servora_user_id", "customer_1")

@router.get("", response_model=List[ServiceRequest])
def list_service_requests(request: Request, status: Optional[str] = None):
    user_id = get_current_user_id(request)
    reqs = [r for r in SERVICE_REQUESTS.values() if r.customer_id == user_id]
    
    # If user is admin/branch/technician, can also see other requests
    current_user = USERS.get(user_id)
    if current_user and current_user.role != "customer":
        reqs = list(SERVICE_REQUESTS.values())
        
    if status:
        reqs = [r for r in reqs if r.status_badge.lower() == status.lower()]
    return reqs

@router.get("/{request_id}", response_model=ServiceRequest)
def get_service_request(request_id: str):
    if request_id not in SERVICE_REQUESTS:
        raise HTTPException(status_code=404, detail="Service request not found")
    return SERVICE_REQUESTS[request_id]

@router.post("", response_model=ServiceRequest)
def create_service_request(payload: ServiceBookingCreate, request: Request):
    user_id = get_current_user_id(request)
    user = USERS.get(user_id, USERS["customer_1"])
    
    # Find appliance
    user_apps = APPLIANCES.get(user_id, [])
    appliance = next((a for a in user_apps if a.id == payload.appliance_id), None)
    
    if not appliance and user_apps:
        appliance = user_apps[0]
        
    app_name = f"{appliance.brand} {appliance.category}" if appliance else "Home Appliance"
    app_brand = appliance.brand if appliance else "Authorized Brand"
    app_model = appliance.model_no if appliance else "STD-01"

    # Generate new Ticket ID like SR-7846
    req_num = random.randint(7850, 9999)
    new_id = f"SR-{req_num}"
    
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    otp_code = str(random.randint(1000, 9999))
    
    new_request = ServiceRequest(
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
        technician=TECHNICIANS["tech_1"],
        verification_otp=otp_code,
        timeline=[
            TimelineStep(
                id="step_1",
                title="Request Created",
                timestamp=now_str,
                description="Service ticket registered in Servora platform",
                state="completed"
            ),
            TimelineStep(
                id="step_2",
                title="Technician Assigned",
                timestamp=now_str,
                description=f"Assigned to {TECHNICIANS['tech_1'].name} ({TECHNICIANS['tech_1'].title})",
                state="current"
            ),
            TimelineStep(
                id="step_3",
                title="Technician on the Way",
                timestamp=None,
                description="Live tracking will activate prior to appointment",
                state="pending"
            ),
            TimelineStep(
                id="step_4",
                title="Service In Progress",
                timestamp=None,
                description="Doorstep OTP verification & diagnostic inspection",
                state="pending"
            ),
            TimelineStep(
                id="step_5",
                title="Completed",
                timestamp=None,
                description="Digital job card closure & customer approval",
                state="pending"
            )
        ]
    )
    
    SERVICE_REQUESTS[new_id] = new_request
    return new_request

@router.post("/{request_id}/advance-status")
def advance_request_status(request_id: str):
    """Simulate next workflow state for demo and live tracking inspection"""
    if request_id not in SERVICE_REQUESTS:
        raise HTTPException(status_code=404, detail="Service request not found")
        
    req = SERVICE_REQUESTS[request_id]
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
        
        # update timeline
        for idx, (s_title, s_id) in enumerate(states):
            for step in req.timeline:
                if step.id == s_id:
                    if idx < next_idx:
                        step.state = "completed"
                    elif idx == next_idx:
                        step.state = "current"
                        step.timestamp = now_time
                    else:
                        step.state = "pending"
                        
        if req.status == "Completed":
            req.status_badge = "Completed"
        else:
            req.status_badge = "In Progress"
            
    return {"status": "success", "new_status": req.status, "request": req}
