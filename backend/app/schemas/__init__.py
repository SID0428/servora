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
    brand: str
    category: str
    model_no: str
    registered_on: str
    warranty_status: str
    serial_no: Optional[str] = None
    icon: str

class NewApplianceCreate(BaseModel):
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

class ServiceBookingCreate(BaseModel):
    appliance_id: str
    issue: str
    description: Optional[str] = None
    priority: str = "Medium"
    preferred_date: str
    preferred_slot: str
    address: Optional[str] = None
