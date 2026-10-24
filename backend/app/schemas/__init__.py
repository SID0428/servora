from enum import Enum
from typing import List, Optional, Union
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
    is_active: bool = True

class AccessTogglePayload(BaseModel):
    is_active: bool

class ForgotPasswordRequestOtp(BaseModel):
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: Optional[str] = None

class ForgotPasswordReset(BaseModel):
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)

class ChangePasswordPayload(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

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

class CustomerRegistrationRequestOtp(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str = Field(min_length=7, max_length=32)
    password: str = Field(min_length=10, max_length=128)
    address: Optional[str] = Field(default=None, max_length=512)

class CustomerRegistrationVerifyOtp(BaseModel):
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    otp: str = Field(min_length=6, max_length=6)

class CustomerLoginRequestOtp(BaseModel):
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class CustomerLoginVerifyOtp(BaseModel):
    email: str = Field(min_length=5, max_length=128, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    otp: str = Field(min_length=6, max_length=6)

class GoogleAuthPayload(BaseModel):
    credential: str = Field(min_length=10)

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

class FranchiseTechnicianUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    title: str = Field(min_length=2, max_length=128)
    mobile: str = Field(min_length=7, max_length=32)
    address: str = Field(min_length=5, max_length=512)
    pincode: str = Field(min_length=6, max_length=10)
    email: Optional[str] = None

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
    purchase_date: Optional[str] = None
    warranty_months: Optional[int] = 12
    warranty_status: str
    warranty_start_date: Optional[str] = None
    warranty_end_date: Optional[str] = None
    warranty_rejection_reason: Optional[str] = None
    matched_policy_id: Optional[str] = None
    matched_policy_name: Optional[str] = None
    policy_snapshot_json: Optional[str] = None
    amc_active: Optional[bool] = False
    amc_plan_name: Optional[str] = None
    amc_end_date: Optional[str] = None
    serial_no: Optional[str] = None
    icon: str
    invoice_url: Optional[str] = None

class NewApplianceCreate(BaseModel):
    company_id: str = Field(min_length=1, max_length=64)
    brand: str
    category: Optional[str] = "Air Conditioner"
    appliance_name: Optional[str] = None
    model_no: str
    serial_no: Optional[str] = None
    invoice_url: Optional[str] = None
    purchase_date: Optional[str] = None

class CompanyApplianceCreate(BaseModel):
    appliance_name: str = Field(min_length=2, max_length=128)
    brand: Optional[str] = None
    category: str = Field(min_length=2, max_length=64)
    model_numbers: Union[List[str], str]
    warranty_months: Optional[int] = 12
    description: Optional[str] = None

class CompanyApplianceResponse(BaseModel):
    id: str
    company_id: str
    company_name: Optional[str] = None
    appliance_name: str
    brand: str
    category: str
    model_numbers: List[str]
    warranty_months: int
    description: Optional[str] = None
    created_at: Optional[str] = None

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
    part_id: Optional[str] = None
    part_code: Optional[str] = None
    part_name: str
    quantity: int = 1
    unit_price: float = 0.0
    total_price: float = 0.0
    hsn_code: Optional[str] = "8418"
    is_covered: Optional[bool] = False
    coverage_type: Optional[str] = "oem_warranty" # oem_warranty or customer_billable
    non_coverage_reason: Optional[str] = None

class JobCardResponse(BaseModel):
    id: str
    request_id: str
    technician_id: str
    customer_id: str
    work_summary: str
    parts_used: List[JobCardPartItem] = Field(default_factory=list)
    inspection_fee: float = 299.0
    labor_cost: float = 0.0
    parts_cost: float = 0.0
    covered_parts_cost: Optional[float] = 0.0
    customer_parts_cost: Optional[float] = 0.0
    discount_amount: float = 0.0
    cgst_amount: float = 0.0
    sgst_amount: float = 0.0
    tax_amount: float = 0.0
    total_amount: float = 0.0
    is_warranty_covered: bool = False
    technician_signature: Optional[str] = None
    customer_signature: Optional[str] = None
    customer_status: str # pending_acceptance, accepted, disputed
    customer_remarks: Optional[str] = None
    completed_at: str

class ServiceRequestDetail(BaseModel):
    id: str
    customer_id: str
    customer_name: Optional[str] = "Customer"
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    appliance_id: Optional[str] = None
    appliance_name: Optional[str] = None
    brand: Optional[str] = None
    model_no: Optional[str] = None
    issue: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = "Medium"
    status: Optional[str] = "Pending"
    status_badge: Optional[str] = "Pending"
    created_at: Optional[str] = None
    appointment_date: Optional[str] = None
    appointment_slot: Optional[str] = None
    technician: Optional[TechnicianBase] = None
    timeline: List[TimelineStep] = Field(default_factory=list)
    verification_otp: Optional[str] = None
    start_otp: Optional[str] = None
    completion_otp: Optional[str] = None
    previous_technician_id: Optional[str] = None
    previous_technician_name: Optional[str] = None
    previous_job_card: Optional[JobCardResponse] = None
    job_card: Optional[JobCardResponse] = None
    is_reopened: Optional[bool] = False
    is_under_warranty: Optional[bool] = False
    payment_status: Optional[str] = "Pending"
    payment_method: Optional[str] = None
    payment_transaction_id: Optional[str] = None
    paid_at: Optional[str] = None
    branch_id: Optional[str] = None
    company_id: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    tech_latitude: Optional[float] = None
    tech_longitude: Optional[float] = None
    tech_location_updated_at: Optional[str] = None
    defect_photo: Optional[str] = None
    reopened_reason: Optional[str] = None
    reopened_at: Optional[str] = None
    is_escalated: Optional[bool] = False
    escalation_level: Optional[int] = 0
    has_estimate: Optional[bool] = False

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
    inspection_fee: Optional[float] = Field(default=299.0, ge=0.0)
    labor_cost: float = Field(default=0.0, ge=0.0)
    discount_amount: Optional[float] = Field(default=0.0, ge=0.0)
    is_warranty_covered: Optional[bool] = False
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
    phone: Optional[str] = Field(default="", max_length=32)
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
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class TechnicianLocationPayload(BaseModel):
    latitude: float
    longitude: float

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

# ==========================================
# Phase 2: Inventory & Spare Parts Schemas
# ==========================================
class SparePartSchema(BaseModel):
    id: str
    part_code: str
    name: str
    category: str
    brand: str
    unit_price: float
    hsn_code: str
    description: Optional[str] = None
    stock_quantity: int = 0
    part_type: Optional[str] = "functional"
    is_warranty_eligible: Optional[bool] = True
    company_id: Optional[str] = None
    is_active: bool = True

class SparePartCreatePayload(BaseModel):
    part_code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=128)
    category: str = Field(min_length=2, max_length=64)
    brand: str = Field(min_length=2, max_length=64)
    unit_price: float = Field(ge=0.0)
    hsn_code: str = Field(default="8418", max_length=32)
    part_type: Optional[str] = "functional"
    is_warranty_eligible: Optional[bool] = True
    description: Optional[str] = None

class CompanyPartCreatePayload(BaseModel):
    part_code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=128)
    category: str = Field(min_length=2, max_length=64)
    brand: Optional[str] = None
    unit_price: float = Field(ge=0.0)
    stock_quantity: int = Field(default=0, ge=0)
    part_type: Optional[str] = "functional"
    is_warranty_eligible: Optional[bool] = True
    hsn_code: Optional[str] = "8418"
    description: Optional[str] = None

class CompanyPartUpdatePayload(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    category: str = Field(min_length=2, max_length=64)
    brand: Optional[str] = None
    unit_price: float = Field(ge=0.0)
    part_type: Optional[str] = None
    is_warranty_eligible: Optional[bool] = None
    hsn_code: Optional[str] = "8418"
    description: Optional[str] = None

class CompanyStockUpdatePayload(BaseModel):
    quantity: int = Field(ge=0)
    mode: Optional[str] = "set" # "set" or "add"
    notes: Optional[str] = None

class PartRequestCreatePayload(BaseModel):
    part_id: str
    quantity: int = Field(ge=1)
    notes: Optional[str] = None

class PartRequestResponseSchema(BaseModel):
    id: str
    company_id: str
    company_name: Optional[str] = None
    branch_id: str
    branch_name: Optional[str] = None
    part_id: str
    part_name: Optional[str] = None
    part_code: Optional[str] = None
    category: Optional[str] = None
    unit_price: Optional[float] = None
    quantity: int
    status: str
    notes: Optional[str] = None
    requested_by: Optional[str] = None
    created_at: str
    sent_at: Optional[str] = None
    sent_by: Optional[str] = None

class FranchiseInventoryItemSchema(BaseModel):
    id: str
    branch_id: str
    part_id: str
    part_code: str
    name: str
    category: str
    brand: str
    unit_price: float
    hsn_code: str
    quantity_available: int
    reorder_level: int
    is_low_stock: bool
    last_restocked_at: Optional[str] = None

class StockMovementPayload(BaseModel):
    branch_id: str
    part_id: str
    transaction_type: str # stock_in, stock_out, transfer
    quantity: int = Field(ge=1)
    notes: Optional[str] = None

# ==========================================
# Phase 2: Billing & Payment Schemas
# ==========================================
class PaymentCheckoutPayload(BaseModel):
    payment_method: str = Field(pattern=r"^(upi|card|netbanking|cash)$")
    amount: float = Field(ge=0.0)
    transaction_ref: Optional[str] = None
    payment_details: Optional[dict] = None

class PaymentResponse(BaseModel):
    success: bool
    request_id: str
    payment_status: str
    payment_method: str
    amount_paid: float
    transaction_ref: str
    receipt_no: str
    paid_at: str

# ==========================================
# Phase 2: Warranty & AMC Claims Schemas
# ==========================================
class WarrantyClaimSchema(BaseModel):
    id: str
    request_id: str
    company_id: str
    company_name: Optional[str] = None
    branch_id: str
    branch_name: Optional[str] = None
    appliance_id: str
    appliance_name: Optional[str] = None
    brand: Optional[str] = None
    claim_amount: float
    parts_claimed: List[JobCardPartItem] = Field(default_factory=list)
    status: str # Pending Review, Approved, Settled, Rejected
    claim_notes: Optional[str] = None
    submitted_at: str
    settled_at: Optional[str] = None

class WarrantyClaimVerifyPayload(BaseModel):
    action: str = Field(pattern=r"^(approve|reject)$")
    notes: Optional[str] = None

class WarrantyRegistrationVerifyPayload(BaseModel):
    action: str = Field(pattern=r"^(approve|reject)$")
    rejection_reason: Optional[str] = None
    warranty_months: Optional[int] = None
    notes: Optional[str] = None

class WarrantyInvoiceReuploadPayload(BaseModel):
    invoice_url: str
    purchase_date: Optional[str] = None

class WarrantyRegistrationItem(BaseModel):
    id: str
    appliance_id: str
    user_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    company_id: str
    company_name: Optional[str] = None
    brand: str
    category: str
    model_no: str
    serial_no: Optional[str] = None
    registered_on: str
    purchase_date: Optional[str] = None
    warranty_months: int
    warranty_status: str
    warranty_start_date: Optional[str] = None
    warranty_end_date: Optional[str] = None
    warranty_rejection_reason: Optional[str] = None
    matched_policy_id: Optional[str] = None
    matched_policy_name: Optional[str] = None
    policy_snapshot_json: Optional[str] = None
    invoice_url: Optional[str] = None
    verified_at: Optional[str] = None
    verified_by: Optional[str] = None

class CompanyWarrantyPolicyCreate(BaseModel):
    policy_code: str = Field(min_length=2, max_length=64)
    policy_name: str = Field(min_length=2, max_length=128)
    category: Optional[str] = "All"
    effective_from: str # YYYY-MM-DD
    effective_to: Optional[str] = None # YYYY-MM-DD or None for ongoing
    comprehensive_months: Optional[int] = 12
    component_warranty_json: Optional[Union[dict, str]] = "{}"
    consumables_covered: Optional[bool] = False
    terms_and_conditions: Optional[str] = None

class CompanyWarrantyPolicyUpdate(BaseModel):
    policy_name: Optional[str] = None
    category: Optional[str] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    comprehensive_months: Optional[int] = None
    component_warranty_json: Optional[Union[dict, str]] = None
    consumables_covered: Optional[bool] = None
    terms_and_conditions: Optional[str] = None
    is_active: Optional[bool] = None

class CompanyWarrantyPolicyResponse(BaseModel):
    id: str
    company_id: str
    company_name: Optional[str] = None
    policy_code: str
    policy_name: str
    category: str
    effective_from: str
    effective_to: Optional[str] = None
    comprehensive_months: int
    component_warranty: dict = Field(default_factory=dict)
    consumables_covered: bool
    terms_and_conditions: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None

class AMCPlanSchema(BaseModel):
    id: str
    name: str
    category: str
    duration_months: int
    price: float
    free_services: int
    discount_parts_pct: float
    zero_labor: bool
    description: Optional[str] = None

class AMCSubscriptionCreatePayload(BaseModel):
    appliance_id: str
    plan_id: str
    payment_method: str = "card"

class AMCSubscriptionSchema(BaseModel):
    id: str
    customer_id: str
    appliance_id: str
    appliance_name: Optional[str] = None
    brand: Optional[str] = None
    plan_id: str
    plan_name: str
    start_date: str
    end_date: str
    status: str # Active, Renewal Due, Expired
    services_included: int
    services_used: int
    amount_paid: float
    created_at: str

# ==========================================
# Phase 3: Estimate, Escalation & Notification Schemas
# ==========================================
class EstimatePartItem(BaseModel):
    part_id: Optional[str] = None
    part_name: str
    part_code: Optional[str] = None
    quantity: int = Field(default=1, ge=1)
    unit_price: float = Field(default=0.0, ge=0.0)
    total_price: Optional[float] = None
    is_covered: Optional[bool] = False
    coverage_type: Optional[str] = "oem_warranty" # oem_warranty or customer_billable
    non_coverage_reason: Optional[str] = None

class EstimateCreatePayload(BaseModel):
    parts: List[EstimatePartItem] = Field(default_factory=list)
    labor_estimate: float = Field(default=0.0, ge=0.0)
    inspection_fee: Optional[float] = 299.0
    notes: Optional[str] = None

class EstimateResponse(BaseModel):
    id: str
    request_id: str
    technician_id: str
    technician_name: Optional[str] = None
    parts: List[EstimatePartItem] = Field(default_factory=list)
    labor_estimate: float
    inspection_fee: float
    parts_total: Optional[float] = 0.0
    covered_parts_cost: Optional[float] = 0.0
    customer_parts_cost: Optional[float] = 0.0
    total_estimate: float
    status: str # pending, approved, rejected
    customer_remarks: Optional[str] = None
    created_at: str
    responded_at: Optional[str] = None

class EstimateRespondPayload(BaseModel):
    action: str = Field(pattern=r"^(approve|reject)$")
    remarks: Optional[str] = None

class EscalationCreatePayload(BaseModel):
    request_id: str
    reason: str = Field(min_length=3)
    level: Optional[int] = Field(default=1, ge=1, le=3)
    target_role: Optional[str] = "franchise"
    due_date: Optional[str] = None

class EscalationResolvePayload(BaseModel):
    resolution_note: str = Field(min_length=5)

class EscalationResponse(BaseModel):
    id: str
    request_id: str
    level: int
    target_role: str
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    reason: str
    status: str
    due_date: Optional[str] = None
    resolution_note: Optional[str] = None
    created_at: str
    resolved_at: Optional[str] = None

class NotificationLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    recipient_email: str
    recipient_name: str
    title: str
    body: str
    channel: str
    event_type: str
    reference_id: Optional[str] = None
    delivery_status: str
    created_at: str

