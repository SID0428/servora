from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class UserRole(str, Enum):
    CUSTOMER = "customer"
    TECHNICIAN = "technician"
    BRANCH = "branch"
    COMPANY = "company"
    ADMIN = "admin"

class UserBase(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    role: str
    avatar: Optional[str] = None
    address: Optional[str] = None

class LoginRequest(BaseModel):
    identifier: str
    password: str = Field(min_length=1)
    role: Optional[str] = None

class CustomerRegistration(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str = Field(min_length=7, max_length=32)
    password: str = Field(min_length=10, max_length=128)
    address: Optional[str] = Field(default=None, max_length=512)

class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    email: str
    phone: str = Field(min_length=5, max_length=32)
    address: Optional[str] = None

class CompanyBranchCreate(BaseModel):
    branch_name: str = Field(min_length=2, max_length=128)
    manager_name: str = Field(min_length=2, max_length=128)
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    mobile: str = Field(min_length=7, max_length=32)
    address: str = Field(min_length=5, max_length=512)
    pincode: str = Field(min_length=6, max_length=10)

class BranchCredentialsEmail(BaseModel):
    branch_id: str

class FranchiseTechnicianCreate(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    title: str = Field(min_length=2, max_length=128)
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    mobile: str = Field(min_length=7, max_length=32)
    address: str = Field(min_length=5, max_length=512)
    pincode: str = Field(min_length=6, max_length=10)

class TechnicianCredentialsEmail(BaseModel):
    technician_id: str

class CompanyCredentialsEmail(BaseModel):
    company_id: str

class CompanyPasswordSetup(BaseModel):
    token: str
    email: str
    password: str = Field(min_length=10, max_length=128)

class CompanyOtpVerify(BaseModel):
    token: str
    email: str
    otp: str = Field(min_length=6, max_length=6)

class ApplianceBase(BaseModel):
    id: str
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    brand: str
    category: str
    model_no: str
    registered_on: str
    warranty_status: str
    serial_no: Optional[str] = None
    icon: str

class NewApplianceCreate(BaseModel):
    company_id: str = Field(min_length=1, max_length=64)
    brand: str
    category: str
    model_no: str
    serial_no: Optional[str] = None

class TechnicianBase(BaseModel):
    id: str
    name: str
    title: str
    company_branch: str
    rating: float
    total_jobs: int
    phone: str
    avatar: Optional[str] = None
    is_verified: bool = True

class TimelineStep(BaseModel):
    id: str
    title: str
    timestamp: Optional[str] = None
    description: Optional[str] = None
    state: str # completed, current, pending

class JobCardPartItem(BaseModel):
    part_name: str
    quantity: int = 1
    unit_price: float = 0.0
    total_price: float = 0.0

class JobCardResponse(BaseModel):
    id: str
    request_id: str
    technician_id: str
    customer_id: str
    work_summary: str
    parts_used: List[JobCardPartItem] = Field(default_factory=list)
    labor_cost: float
    parts_cost: float
    tax_amount: float
    total_amount: float
    technician_signature: Optional[str] = None
    customer_signature: Optional[str] = None
    customer_status: str # pending_acceptance, accepted, disputed
    customer_remarks: Optional[str] = None
    completed_at: str

class ServiceRequestDetail(BaseModel):
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
    priority: str
    status: str
    status_badge: str
    created_at: str
    appointment_date: str
    appointment_slot: str
    technician: Optional[TechnicianBase] = None
    timeline: List[TimelineStep] = Field(default_factory=list)
    verification_otp: str
    start_otp: Optional[str] = None
    completion_otp: Optional[str] = None
    previous_technician_id: Optional[str] = None
    previous_technician_name: Optional[str] = None
    previous_job_card: Optional[JobCardResponse] = None
    is_reopened: Optional[bool] = False
    payment_status: Optional[str] = "Pending"
    branch_id: Optional[str] = None
    company_id: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    defect_photo: Optional[str] = None
    reopened_reason: Optional[str] = None
    reopened_at: Optional[str] = None

class ServiceBookingCreate(BaseModel):
    appliance_id: str
    issue: str
    description: Optional[str] = None
    priority: str = "Medium"
    preferred_date: str
    preferred_slot: str
    address: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    defect_photo: Optional[str] = None

class JobCardCreatePayload(BaseModel):
    work_summary: str = Field(min_length=5, max_length=2000)
    parts_used: List[JobCardPartItem] = Field(default_factory=list)
    labor_cost: float = Field(default=0.0, ge=0.0)
    technician_signature: Optional[str] = None
    completion_otp: Optional[str] = None

class JobCardCustomerActionPayload(BaseModel):
    action: str # "accept" or "dispute"
    customer_signature: Optional[str] = None
    remarks: Optional[str] = None

class ServiceFeedbackPayload(BaseModel):
    rating_overall: int = Field(ge=1, le=5)
    rating_quality: int = Field(default=5, ge=1, le=5)
    rating_behavior: int = Field(default=5, ge=1, le=5)
    rating_pricing: int = Field(default=5, ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=1000)

class ServiceFeedbackResponse(BaseModel):
    id: str
    request_id: str
    customer_id: str
    technician_id: str
    rating_overall: int
    rating_quality: int
    rating_behavior: int
    rating_pricing: int
    comment: Optional[str] = None
    created_at: str

class TicketReopenPayload(BaseModel):
    reason: str = Field(min_length=3, max_length=256)
    notes: Optional[str] = Field(default=None, max_length=1000)

class UserProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    phone: str = Field(min_length=7, max_length=32)
    email: Optional[str] = None
    address: Optional[str] = None

class FranchiseAssignPayload(BaseModel):
    technician_id: str
    request_id: Optional[str] = None
    priority: Optional[str] = None
    reassign_mode: Optional[str] = None # "same_technician" or "new_technician"
    reassign_notes: Optional[str] = None

class TechnicianActionPayload(BaseModel):
    action: str # "accept", "start_visit", "start_service", "complete"
    verification_otp: Optional[str] = None

class CustomerAddressUpdate(BaseModel):
    house_flat: str = Field(min_length=1, max_length=128)
    street_area: str = Field(min_length=1, max_length=256)
    landmark: Optional[str] = Field(default=None, max_length=128)
    city: str = Field(min_length=1, max_length=128)
    state: str = Field(min_length=1, max_length=128)
    pincode: str = Field(min_length=6, max_length=10, pattern=r"^\d{6}$")

class CompanyCustomerProductResponse(BaseModel):
    appliance_id: str
    category: str
    brand: str
    model_no: str
    serial_no: Optional[str] = None
    warranty_status: str
    registered_on: str
    customer_id: str
    customer_name: str
    customer_email: str
    customer_phone: str
    customer_address: Optional[str] = None
