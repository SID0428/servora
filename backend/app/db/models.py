from sqlalchemy import Column, String, Float, Integer, Boolean, Text, ForeignKey, DateTime, Date, UniqueConstraint, LargeBinary
from datetime import datetime
from app.db.session import Base

class UserModel(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    email = Column(String(128), unique=True, index=True, nullable=False)
    phone = Column(String(32), nullable=False)
    role = Column(String(32), nullable=False, default="customer") # customer, technician, branch, company, admin
    password_hash = Column(String(255), nullable=True)
    avatar = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

class UserSessionModel(Base):
    __tablename__ = "user_sessions"

    token_hash = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)

class AuthOtpModel(Base):
    __tablename__ = "auth_otps"

    id = Column(String(64), primary_key=True, index=True)
    email = Column(String(128), nullable=False, index=True)
    otp_hash = Column(String(64), nullable=False)
    purpose = Column(String(32), nullable=False)  # "signup", "login"
    payload_json = Column(Text, nullable=True)     # Pending user registration data
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class CompanyOnboardingModel(Base):
    __tablename__ = "company_onboarding"

    company_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    invite_token_hash = Column(String(64), nullable=True, index=True)
    invite_expires_at = Column(DateTime, nullable=True)
    pending_password_hash = Column(String(255), nullable=True)
    otp_hash = Column(String(64), nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    password_set_at = Column(DateTime, nullable=True)

class BranchOnboardingModel(Base):
    __tablename__ = "branch_onboarding"

    branch_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    invite_token_hash = Column(String(64), nullable=True, index=True)
    invite_expires_at = Column(DateTime, nullable=True)
    pending_password_hash = Column(String(255), nullable=True)
    otp_hash = Column(String(64), nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    password_set_at = Column(DateTime, nullable=True)

class CompanyBranchModel(Base):
    __tablename__ = "company_branches"
    __table_args__ = (UniqueConstraint("company_id", "email", name="uq_company_branch_email"),)

    id = Column(String(64), primary_key=True, index=True)
    company_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_name = Column(String(128), nullable=False)
    manager_name = Column(String(128), nullable=False)
    email = Column(String(128), nullable=False)
    mobile = Column(String(32), nullable=False)
    address = Column(Text, nullable=False)
    pincode = Column(String(10), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    opening_time = Column(String(8), nullable=True, default="09:00")
    closing_time = Column(String(8), nullable=True, default="19:00")
    slot_duration_minutes = Column(Integer, nullable=True, default=120)
    operating_days_json = Column(Text, nullable=True, default='["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]')
    calendar_exceptions_json = Column(Text, nullable=True, default='{}')
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class TechnicianModel(Base):
    __tablename__ = "technicians"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    title = Column(String(128), nullable=False)
    company_branch = Column(String(128), nullable=False)
    rating = Column(Float, default=5.0)
    total_jobs = Column(Integer, default=0)
    phone = Column(String(32), nullable=False)
    avatar = Column(Text, nullable=True)
    is_verified = Column(Boolean, default=True)

class BranchTechnicianModel(Base):
    __tablename__ = "branch_technicians"

    technician_id = Column(String(64), ForeignKey("technicians.id", ondelete="CASCADE"), primary_key=True)
    branch_id = Column(String(64), ForeignKey("company_branches.id", ondelete="CASCADE"), nullable=False, index=True)
    address = Column(Text, nullable=False)
    pincode = Column(String(10), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class TechnicianOnboardingModel(Base):
    __tablename__ = "technician_onboarding"

    technician_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    invite_token_hash = Column(String(64), nullable=True, index=True)
    invite_expires_at = Column(DateTime, nullable=True)
    pending_password_hash = Column(String(255), nullable=True)
    otp_hash = Column(String(64), nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    password_set_at = Column(DateTime, nullable=True)

class ApplianceModel(Base):
    __tablename__ = "appliances"

    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    company_id = Column(String(64), ForeignKey("users.id"), nullable=True, index=True)
    brand = Column(String(64), nullable=False)
    appliance_name = Column(String(128), nullable=True)
    category = Column(String(64), nullable=False)
    model_no = Column(String(64), nullable=False)
    registered_on = Column(String(64), nullable=False)
    purchase_date = Column(String(32), nullable=True)
    warranty_months = Column(Integer, default=12)
    warranty_status = Column(String(64), default="Pending Verification")
    warranty_start_date = Column(String(32), nullable=True)
    warranty_end_date = Column(String(32), nullable=True)
    warranty_rejection_reason = Column(String(256), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verified_by = Column(String(64), nullable=True)
    matched_policy_id = Column(String(64), nullable=True)
    matched_policy_name = Column(String(128), nullable=True)
    policy_snapshot_json = Column(Text, nullable=True)
    amc_active = Column(Boolean, default=False)
    amc_plan_name = Column(String(64), nullable=True)
    amc_end_date = Column(String(32), nullable=True)
    serial_no = Column(String(64), nullable=True)
    icon = Column(String(64), default="box")
    invoice_url = Column(Text, nullable=True)

class ServiceRequestModel(Base):
    __tablename__ = "service_requests"

    id = Column(String(64), primary_key=True, index=True) # e.g. SR-7845
    customer_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    customer_name = Column(String(128), nullable=False)
    customer_phone = Column(String(32), nullable=False)
    customer_address = Column(Text, nullable=False)
    appliance_id = Column(String(64), nullable=False)
    appliance_name = Column(String(128), nullable=False)
    brand = Column(String(64), nullable=False)
    model_no = Column(String(64), nullable=False)
    issue = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String(32), default="Medium")
    status = Column(String(64), default="Request Created")
    status_badge = Column(String(32), default="In Progress")
    created_at = Column(String(64), nullable=False)
    appointment_date = Column(String(64), nullable=False)
    appointment_slot = Column(String(64), nullable=False)
    technician_id = Column(String(64), ForeignKey("technicians.id"), nullable=True)
    branch_id = Column(String(64), nullable=True, index=True)
    company_id = Column(String(64), nullable=True, index=True)
    pincode = Column(String(10), nullable=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    tech_latitude = Column(Float, nullable=True)
    tech_longitude = Column(Float, nullable=True)
    tech_location_updated_at = Column(String(64), nullable=True)
    verification_otp = Column(String(16), nullable=False, default="8492")
    start_otp = Column(String(16), nullable=True)
    completion_otp = Column(String(16), nullable=True)
    previous_technician_id = Column(String(64), nullable=True)
    previous_technician_name = Column(String(128), nullable=True)
    previous_job_card_json = Column(Text, nullable=True)
    is_reopened = Column(Boolean, nullable=True, default=False)
    is_under_warranty = Column(Boolean, nullable=True, default=False)
    payment_status = Column(String(32), nullable=True, default="Pending")
    payment_method = Column(String(32), nullable=True) # upi, card, netbanking, cash
    payment_transaction_id = Column(String(64), nullable=True)
    paid_at = Column(String(64), nullable=True)
    timeline_json = Column(Text, nullable=False) # JSON string serialized timeline steps
    defect_photo = Column(Text, nullable=True)
    reopened_reason = Column(Text, nullable=True)
    reopened_at = Column(String(64), nullable=True)
    is_escalated = Column(Boolean, nullable=True, default=False)
    escalation_level = Column(Integer, nullable=True, default=0)
    is_outstation = Column(Boolean, nullable=True, default=False)
    distance_km = Column(Float, nullable=True)
    slot_applicable = Column(Boolean, nullable=True, default=True)
    outstation_note = Column(String(256), nullable=True)
    visiting_charge = Column(Float, nullable=True, default=299.0)
    is_visiting_charge_tax_inclusive = Column(Boolean, nullable=True, default=True)

class JobCardModel(Base):
    __tablename__ = "job_cards"

    id = Column(String(64), primary_key=True, index=True) # e.g. JC-7845
    request_id = Column(String(64), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    technician_id = Column(String(64), ForeignKey("technicians.id"), nullable=False, index=True)
    customer_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    work_summary = Column(Text, nullable=False)
    parts_used_json = Column(Text, nullable=False, default="[]") # JSON list of {part_code, part_name, quantity, unit_price, total_price, hsn_code}
    inspection_fee = Column(Float, nullable=False, default=299.0)
    labor_cost = Column(Float, nullable=False, default=0.0)
    parts_cost = Column(Float, nullable=False, default=0.0)
    covered_parts_cost = Column(Float, nullable=False, default=0.0)
    customer_parts_cost = Column(Float, nullable=False, default=0.0)
    discount_amount = Column(Float, nullable=False, default=0.0)
    cgst_amount = Column(Float, nullable=False, default=0.0)
    sgst_amount = Column(Float, nullable=False, default=0.0)
    tax_amount = Column(Float, nullable=False, default=0.0)
    total_amount = Column(Float, nullable=False, default=0.0)
    is_warranty_covered = Column(Boolean, nullable=False, default=False)
    technician_signature = Column(Text, nullable=True)
    customer_signature = Column(Text, nullable=True)
    customer_status = Column(String(32), nullable=False, default="pending_acceptance") # pending_acceptance, accepted, disputed
    customer_remarks = Column(Text, nullable=True)
    completed_at = Column(String(64), nullable=False)

class ServiceFeedbackModel(Base):
    __tablename__ = "service_feedbacks"

    id = Column(String(64), primary_key=True, index=True) # e.g. FB-7845
    request_id = Column(String(64), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    customer_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    technician_id = Column(String(64), ForeignKey("technicians.id"), nullable=False, index=True)
    rating_overall = Column(Integer, nullable=False, default=5)
    rating_quality = Column(Integer, nullable=False, default=5)
    rating_behavior = Column(Integer, nullable=False, default=5)
    rating_pricing = Column(Integer, nullable=False, default=5)
    comment = Column(Text, nullable=True)
    created_at = Column(String(64), nullable=False)

class SparePartModel(Base):
    __tablename__ = "spare_parts"
    __table_args__ = (UniqueConstraint("company_id", "part_code", name="uq_company_part_code"),)

    id = Column(String(64), primary_key=True, index=True) # e.g. PART-LG-COMP01
    part_code = Column(String(64), index=True, nullable=False)
    name = Column(String(128), nullable=False)
    category = Column(String(64), nullable=False) # Refrigerator, Washing Machine, AC, Microwave
    brand = Column(String(64), nullable=False) # LG, Samsung, Whirlpool, Universal
    unit_price = Column(Float, nullable=False, default=0.0)
    is_tax_inclusive = Column(Boolean, default=True, nullable=False)
    hsn_code = Column(String(32), nullable=False, default="8418")
    description = Column(Text, nullable=True)
    stock_quantity = Column(Integer, default=0, nullable=False)
    part_type = Column(String(32), default="functional", nullable=False) # functional, consumable, wear_and_tear, accessory
    is_warranty_eligible = Column(Boolean, default=True, nullable=False)
    warranty_component_type = Column(String(64), nullable=True, default=None) # e.g. compressor, motor, pcb, magnetron
    company_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    is_active = Column(Boolean, default=True)

class PartRequestModel(Base):
    __tablename__ = "part_requests"

    id = Column(String(64), primary_key=True, index=True) # e.g. REQ-PART-001
    company_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(String(64), ForeignKey("company_branches.id", ondelete="CASCADE"), nullable=False, index=True)
    part_id = Column(String(64), ForeignKey("spare_parts.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    status = Column(String(32), nullable=False, default="Pending") # Pending, Sent, Cancelled
    notes = Column(Text, nullable=True)
    requested_by = Column(String(128), nullable=True)
    request_id = Column(String(64), ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    technician_id = Column(String(64), ForeignKey("technicians.id", ondelete="SET NULL"), nullable=True, index=True)
    technician_name = Column(String(128), nullable=True)
    stock_status_at_request = Column(String(32), default="in_stock", nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    sent_by = Column(String(128), nullable=True)

class PartSerialNumberModel(Base):
    __tablename__ = "part_serial_numbers"

    id = Column(String(64), primary_key=True, index=True) # e.g. PSN-98412
    serial_number = Column(String(64), unique=True, index=True, nullable=False) # e.g. SN-COMP-98412
    part_id = Column(String(64), ForeignKey("spare_parts.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(String(64), ForeignKey("company_branches.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    assigned_tech_id = Column(String(64), ForeignKey("technicians.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_tech_name = Column(String(128), nullable=True)
    request_id = Column(String(64), ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="in_stock") # in_stock, assigned_to_tech, installed, returned
    assigned_at = Column(DateTime, nullable=True)
    installed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class FranchiseInventoryModel(Base):
    __tablename__ = "franchise_inventories"
    __table_args__ = (UniqueConstraint("branch_id", "part_id", name="uq_branch_part_inventory"),)

    id = Column(String(64), primary_key=True, index=True)
    branch_id = Column(String(64), ForeignKey("company_branches.id", ondelete="CASCADE"), nullable=False, index=True)
    part_id = Column(String(64), ForeignKey("spare_parts.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity_available = Column(Integer, nullable=False, default=0)
    reorder_level = Column(Integer, nullable=False, default=5)
    last_restocked_at = Column(DateTime, nullable=True)

class InventoryTransactionModel(Base):
    __tablename__ = "inventory_transactions"

    id = Column(String(64), primary_key=True, index=True) # e.g. TXN-INV-001
    branch_id = Column(String(64), ForeignKey("company_branches.id", ondelete="CASCADE"), nullable=False, index=True)
    part_id = Column(String(64), ForeignKey("spare_parts.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_type = Column(String(32), nullable=False) # stock_in, stock_out, job_consumption, transfer
    quantity = Column(Integer, nullable=False)
    reference_id = Column(String(64), nullable=True) # e.g. JC-7845, PO-1092
    performed_by = Column(String(128), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class WarrantyClaimModel(Base):
    __tablename__ = "warranty_claims"

    id = Column(String(64), primary_key=True, index=True) # e.g. CLM-2026-001
    request_id = Column(String(64), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    branch_id = Column(String(64), ForeignKey("company_branches.id"), nullable=False, index=True)
    appliance_id = Column(String(64), nullable=False)
    claim_amount = Column(Float, nullable=False, default=0.0)
    parts_claimed_json = Column(Text, nullable=False, default="[]")
    status = Column(String(32), nullable=False, default="Pending Review") # Pending Review, Approved, Settled, Rejected
    claim_notes = Column(Text, nullable=True)
    submitted_at = Column(String(64), nullable=False)
    settled_at = Column(String(64), nullable=True)

class AMCPlanModel(Base):
    __tablename__ = "amc_plans"

    id = Column(String(64), primary_key=True, index=True) # e.g. AMC-SILVER, AMC-GOLD, AMC-PLATINUM
    name = Column(String(64), nullable=False)
    category = Column(String(64), nullable=False) # Refrigerator, AC, Washing Machine, Microwave, All
    duration_months = Column(Integer, default=12)
    price = Column(Float, nullable=False)
    free_services = Column(Integer, default=2)
    discount_parts_pct = Column(Float, default=15.0)
    zero_labor = Column(Boolean, default=True)
    description = Column(Text, nullable=True)

class AMCSubscriptionModel(Base):
    __tablename__ = "amc_subscriptions"

    id = Column(String(64), primary_key=True, index=True) # e.g. SUB-AMC-001
    customer_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    appliance_id = Column(String(64), ForeignKey("appliances.id"), nullable=False, index=True)
    plan_id = Column(String(64), ForeignKey("amc_plans.id"), nullable=False, index=True)
    plan_name = Column(String(64), nullable=False)
    start_date = Column(String(32), nullable=False)
    end_date = Column(String(32), nullable=False)
    status = Column(String(32), default="Active") # Active, Renewal Due, Expired
    services_included = Column(Integer, default=2)
    services_used = Column(Integer, default=0)
    amount_paid = Column(Float, nullable=False, default=0.0)
    created_at = Column(String(64), nullable=False)

class EstimateModel(Base):
    __tablename__ = "estimates"

    id = Column(String(64), primary_key=True, index=True) # e.g. EST-7845
    request_id = Column(String(64), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id = Column(String(64), nullable=False, index=True)
    technician_name = Column(String(128), nullable=True)
    parts_json = Column(Text, default="[]") # JSON list of {part_id, part_name, part_code, quantity, unit_price, total_price}
    labor_estimate = Column(Float, default=0.0)
    inspection_fee = Column(Float, default=299.0)
    total_estimate = Column(Float, default=0.0)
    status = Column(String(32), default="pending") # pending, approved, rejected
    customer_remarks = Column(Text, nullable=True)
    created_at = Column(String(64), nullable=False)
    responded_at = Column(String(64), nullable=True)

class EscalationModel(Base):
    __tablename__ = "escalations"

    id = Column(String(64), primary_key=True, index=True) # e.g. ESC-1001
    request_id = Column(String(64), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    level = Column(Integer, default=1) # 1: Franchise, 2: Brand/Company, 3: Platform Admin
    target_role = Column(String(32), default="franchise") # franchise, company, admin
    owner_id = Column(String(64), nullable=True)
    owner_name = Column(String(128), nullable=True)
    reason = Column(Text, nullable=False)
    status = Column(String(32), default="Open") # Open, In Progress, Resolved, Closed
    due_date = Column(String(64), nullable=True)
    resolution_note = Column(Text, nullable=True)
    created_at = Column(String(64), nullable=False)
    resolved_at = Column(String(64), nullable=True)

class NotificationLogModel(Base):
    __tablename__ = "notification_logs"

    id = Column(String(64), primary_key=True, index=True) # e.g. NOTIF-1001
    user_id = Column(String(64), nullable=True, index=True)
    recipient_email = Column(String(128), nullable=False)
    recipient_name = Column(String(128), nullable=False)
    title = Column(String(256), nullable=False)
    body = Column(Text, nullable=False)
    channel = Column(String(32), default="email")
    event_type = Column(String(64), nullable=False)
    reference_id = Column(String(64), nullable=True)
    delivery_status = Column(String(32), default="sent") # sent, failed, simulated
    created_at = Column(String(64), nullable=False)

class CompanyApplianceCatalogModel(Base):
    __tablename__ = "company_appliances"

    id = Column(String(64), primary_key=True, index=True)
    company_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    appliance_name = Column(String(128), nullable=False)
    brand = Column(String(128), nullable=False)
    category = Column(String(64), nullable=False)
    model_numbers = Column(Text, nullable=False) # JSON-encoded list of model strings
    warranty_months = Column(Integer, default=12, nullable=False)
    visiting_charge = Column(Float, default=299.0, nullable=False)
    is_visiting_charge_tax_inclusive = Column(Boolean, default=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class CompanyWarrantyPolicyModel(Base):
    __tablename__ = "company_warranty_policies"

    id = Column(String(64), primary_key=True, index=True) # e.g. POL-SAMS-FY2526
    company_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    policy_code = Column(String(64), index=True, nullable=False) # e.g. FY25-26-AC
    policy_name = Column(String(128), nullable=False) # e.g. FY 2025-26 Split AC Standard Warranty
    category = Column(String(64), nullable=False, default="All") # Air Conditioner, Refrigerator, or All
    effective_from = Column(Date, nullable=False) # e.g. 2025-04-01
    effective_to = Column(Date, nullable=True) # e.g. 2026-03-31, None means ongoing
    comprehensive_months = Column(Integer, default=12, nullable=False)
    component_warranty_json = Column(Text, default="{}", nullable=False) # e.g. {"compressor": 120, "pcb": 60, "motor": 120}
    consumables_covered = Column(Boolean, default=False, nullable=False)
    terms_and_conditions = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class UploadedFileModel(Base):
    __tablename__ = "uploaded_files"

    filename = Column(String(255), primary_key=True, index=True)
    content_type = Column(String(64), nullable=False, default="application/octet-stream")
    file_data = Column(LargeBinary(length=2**24), nullable=False) # MediumBlob up to 16MB
    size = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


