from sqlalchemy import Column, String, Float, Integer, Boolean, Text, ForeignKey, DateTime, UniqueConstraint
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

class UserSessionModel(Base):
    __tablename__ = "user_sessions"

    token_hash = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)

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
    brand = Column(String(64), nullable=False)
    category = Column(String(64), nullable=False)
    model_no = Column(String(64), nullable=False)
    registered_on = Column(String(64), nullable=False)
    warranty_status = Column(String(64), default="Active")
    serial_no = Column(String(64), nullable=True)
    icon = Column(String(64), default="box")

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
    verification_otp = Column(String(16), nullable=False, default="8492")
    timeline_json = Column(Text, nullable=False) # JSON string serialized timeline steps
