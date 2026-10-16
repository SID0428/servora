from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class UserRole(str, Enum):
    CUSTOMER = "customer"
    TECHNICIAN = "technician"
    BRANCH = "branch"
    COMPANY = "company"
    ADMIN = "admin"

class User(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    role: UserRole
    avatar: str
    address: Optional[str] = None

class Appliance(BaseModel):
    id: str
    brand: str
    category: str
    model_no: str
    registered_on: str
    warranty_status: str  # "Active", "Expired", "AMC"
    serial_no: Optional[str] = None
    icon: str  # icon identifier or svg type

class Technician(BaseModel):
    id: str
    name: str
    title: str
    company_branch: str
    rating: float
    total_jobs: int
    phone: str
    avatar: str
    is_verified: bool = True

class TimelineStep(BaseModel):
    id: str
    title: str
    timestamp: Optional[str] = None
    description: Optional[str] = None
    state: str  # "completed", "current", "pending"

class ServiceRequest(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    customer_phone: str
    customer_address: str
    appliance_id: str
    appliance_name: str
    brand: str
    model_no: str
    issue: str
    description: Optional[str] = None
    priority: str  # "High", "Medium", "Low"
    status: str    # "Request Created", "Technician Assigned", "Technician on the Way", "In Progress", "Completed"
    status_badge: str # "In Progress", "Scheduled", "Pending", "Completed"
    created_at: str
    appointment_date: str
    appointment_slot: str
    technician: Optional[Technician] = None
    timeline: List[TimelineStep] = Field(default_factory=list)
    verification_otp: str
    service_type: str = "Repair"

class ServiceBookingCreate(BaseModel):
    appliance_id: str
    issue: str
    description: Optional[str] = None
    priority: str = "Medium"
    preferred_date: str
    preferred_slot: str
    address: Optional[str] = None

class NewApplianceCreate(BaseModel):
    brand: str
    category: str
    model_no: str
    serial_no: Optional[str] = None
    purchase_date: Optional[str] = None
