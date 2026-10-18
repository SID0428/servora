import hashlib
import hmac
import html
import logging
import os
import secrets
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.models import ApplianceModel, BranchOnboardingModel, CompanyBranchModel, UserModel
from app.db.session import get_db
from app.email_service import send_brevo_email
from app.schemas import BranchCredentialsEmail, CompanyBranchCreate, CompanyOtpVerify, CompanyPasswordSetup
from app.security import get_authenticated_user

router = APIRouter(prefix="/api/company", tags=["company portal"])
onboarding_router = APIRouter(prefix="/api/onboarding/franchise", tags=["franchise onboarding"])
logger = logging.getLogger(__name__)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def make_password_hash(password: str) -> str:
    rounds, salt = 310_000, secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds).hex()
    return f"pbkdf2_sha256${rounds}${salt.hex()}${hashed}"


def require_company(request: Request, db: Session) -> UserModel:
    user = get_authenticated_user(request, db)
    if user.role != "company":
        raise HTTPException(status_code=403, detail="Company portal access required")
    return user


def branch_payload(branch: CompanyBranchModel, onboarding: BranchOnboardingModel | None = None) -> dict:
    return {
        "id": branch.id,
        "branch_name": branch.branch_name,
        "manager_name": branch.manager_name,
        "email": branch.email,
        "mobile": branch.mobile,
        "address": branch.address,
        "pincode": branch.pincode,
        "password_set": bool(onboarding and onboarding.password_set_at),
        "password_set_at": onboarding.password_set_at.isoformat() if onboarding and onboarding.password_set_at else None,
        "created_at": branch.created_at.isoformat(),
    }


def issue_franchise_invite(branch: CompanyBranchModel, onboarding: BranchOnboardingModel, company: UserModel) -> str:
    token = secrets.token_urlsafe(32)
    onboarding.invite_token_hash = digest(token)
    onboarding.invite_expires_at = datetime.utcnow() + timedelta(hours=48)
    onboarding.pending_password_hash = None
    onboarding.otp_hash = None
    onboarding.otp_expires_at = None
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://servora-frontend-xi.vercel.app").rstrip("/")
    setup_url = f"{frontend_url}/franchise-setup.html?token={token}"
    values = {
        "branch": branch.branch_name,
        "manager": branch.manager_name,
        "email": branch.email,
        "mobile": branch.mobile,
        "address": branch.address,
        "pincode": branch.pincode,
        "company": company.name,
    }
    details_text = "\n".join(f"{label}: {value}" for label, value in values.items())
    details_html = "".join(f"<li><strong>{html.escape(label.title())}:</strong> {html.escape(value)}</li>" for label, value in values.items())
    send_brevo_email(
        branch.email,
        branch.manager_name,
        "Your Servora franchise portal is ready",
        f"Hello {branch.manager_name},\n\nYour franchise branch has been added to Servora by {company.name}. Here are your branch details:\n\n{details_text}\n\nSet up your password and verify your email using this link (valid for 48 hours):\n{setup_url}\n\nYour registered login email is {branch.email}.",
        f"<p>Hello {html.escape(branch.manager_name)},</p><p>Your franchise branch has been added to Servora by <strong>{html.escape(company.name)}</strong>. Branch details:</p><ul>{details_html}</ul><p>Create your password and verify your email using the link below. The link expires in 48 hours.</p><p><a href=\"{html.escape(setup_url, quote=True)}\">Set up your franchise portal password</a></p><p>Registered login email: <strong>{html.escape(branch.email)}</strong></p>",
    )
    return setup_url


@router.get("/branches")
def list_company_branches(request: Request, db: Session = Depends(get_db)):
    company = require_company(request, db)
    branches = (
        db.query(CompanyBranchModel)
        .filter(CompanyBranchModel.company_id == company.id)
        .order_by(CompanyBranchModel.branch_name)
        .all()
    )
    onboarding = {item.branch_id: item for item in db.query(BranchOnboardingModel).all()}
    return [branch_payload(branch, onboarding.get(branch.id)) for branch in branches]


@router.get("/customers")
def list_company_customers(request: Request, db: Session = Depends(get_db)):
    company = require_company(request, db)
    # Query all appliances registered for this company, joined with customer UserModel
    rows = (
        db.query(ApplianceModel, UserModel)
        .join(UserModel, ApplianceModel.user_id == UserModel.id)
        .filter(
            or_(
                ApplianceModel.company_id == company.id,
                ApplianceModel.brand.ilike(company.name.strip()),
            )
        )
        .order_by(ApplianceModel.registered_on.desc())
        .all()
    )
    customers_data = []
    for appliance, customer in rows:
        customers_data.append({
            "appliance_id": appliance.id,
            "category": appliance.category,
            "brand": appliance.brand,
            "model_no": appliance.model_no,
            "serial_no": appliance.serial_no or "Not provided",
            "warranty_status": appliance.warranty_status or "Standard Active",
            "registered_on": appliance.registered_on,
            "customer_id": customer.id,
            "customer_name": customer.name,
            "customer_email": customer.email,
            "customer_phone": customer.phone,
            "customer_address": customer.address or "Address not provided",
        })
    return customers_data


@router.post("/branches", status_code=201)
def create_company_branch(payload: CompanyBranchCreate, request: Request, db: Session = Depends(get_db)):
    company = require_company(request, db)
    email = payload.email.strip().lower()
    if db.query(UserModel).filter(UserModel.email.ilike(email)).first():
        raise HTTPException(status_code=409, detail="A Servora account with this email already exists")
    if not os.getenv("BREVO_API_KEY") or not os.getenv("BREVO_SENDER_EMAIL"):
        raise HTTPException(status_code=503, detail="Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL on the backend.")

    branch_id = f"branch_{uuid4().hex[:12]}"
    branch = CompanyBranchModel(
        id=branch_id,
        company_id=company.id,
        branch_name=payload.branch_name.strip(),
        manager_name=payload.manager_name.strip(),
        email=email,
        mobile=payload.mobile.strip(),
        address=payload.address.strip(),
        pincode=payload.pincode.strip(),
    )
    branch_user = UserModel(
        id=branch_id,
        name=branch.manager_name,
        email=email,
        phone=branch.mobile,
        role="branch",
        address=f"{branch.address}, {branch.pincode}",
        password_hash=None,
    )
    onboarding = BranchOnboardingModel(branch_id=branch_id)
    # The onboarding row references users.id. Flush the franchise user first
    # because SQLAlchemy has no ORM relationship to infer this insert order.
    db.add(branch_user)
    try:
        db.flush()
        db.add_all([branch, onboarding])
        db.flush()
        issue_franchise_invite(branch, onboarding, company)
        db.commit()
        db.refresh(branch)
        return branch_payload(branch, onboarding)
    except Exception:
        db.rollback()
        raise


@router.post("/branches/send-setup-link")
def resend_franchise_setup_link(payload: BranchCredentialsEmail, request: Request, db: Session = Depends(get_db)):
    try:
        company = require_company(request, db)
        branch = db.query(CompanyBranchModel).filter(
            CompanyBranchModel.id == payload.branch_id,
            CompanyBranchModel.company_id == company.id,
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        onboarding = db.query(BranchOnboardingModel).filter_by(branch_id=branch.id).first()
        if onboarding and onboarding.password_set_at:
            raise HTTPException(status_code=409, detail="This franchise account has already set its password")

        branch_user = db.query(UserModel).filter_by(id=branch.id).first()
        if branch_user and (branch_user.role != "branch" or branch_user.email.lower() != branch.email.lower()):
            raise HTTPException(status_code=409, detail="This branch ID is already linked to a different Servora account")
        if not branch_user:
            existing_email = db.query(UserModel).filter(UserModel.email.ilike(branch.email)).first()
            if existing_email:
                raise HTTPException(status_code=409, detail="This email already belongs to another Servora account")
            branch_user = UserModel(
                id=branch.id,
                name=branch.manager_name,
                email=branch.email,
                phone=branch.mobile,
                role="branch",
                address=f"{branch.address}, {branch.pincode}",
                password_hash=None,
            )
            db.add(branch_user)
            # branch_onboarding.branch_id is a foreign key to users.id.
            db.flush()

        if not onboarding:
            onboarding = BranchOnboardingModel(branch_id=branch.id)
            db.add(onboarding)
        db.flush()
        issue_franchise_invite(branch, onboarding, company)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("Failed to provision a franchise account or resend its setup link")
        raise HTTPException(status_code=500, detail="Could not resend the franchise setup link. Check the backend service logs for details.")
    return {"status": "sent", "email": branch.email, "message": "Franchise setup link sent"}


def get_franchise_setup_context(token: str, email: str, db: Session):
    onboarding = db.query(BranchOnboardingModel).filter_by(invite_token_hash=digest(token)).first()
    if not onboarding or not onboarding.invite_expires_at or onboarding.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This setup link is invalid or expired. Ask your company administrator to resend it.")
    branch_user = db.query(UserModel).filter_by(id=onboarding.branch_id, role="branch").first()
    branch = db.query(CompanyBranchModel).filter_by(id=onboarding.branch_id).first()
    if not branch_user or not branch or not hmac.compare_digest(branch_user.email.lower(), email.strip().lower()):
        raise HTTPException(status_code=400, detail="Enter the email address registered with your company")
    if onboarding.password_set_at:
        raise HTTPException(status_code=400, detail="This franchise account is already set up. Please sign in.")
    return branch_user, branch, onboarding


@onboarding_router.post("/password")
def begin_franchise_password_setup(payload: CompanyPasswordSetup, db: Session = Depends(get_db)):
    branch_user, _, onboarding = get_franchise_setup_context(payload.token, payload.email, db)
    otp = f"{secrets.randbelow(1_000_000):06d}"
    onboarding.pending_password_hash = make_password_hash(payload.password)
    onboarding.otp_hash = digest(f"{branch_user.id}:{otp}")
    onboarding.otp_expires_at = datetime.utcnow() + timedelta(minutes=10)
    try:
        send_brevo_email(
            branch_user.email,
            branch_user.name,
            "Your Servora franchise verification code",
            f"Your Servora verification code is {otp}. It expires in 10 minutes. If you did not request this, ignore this email.",
            f"<p>Your Servora verification code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{otp}</p><p>This code expires in 10 minutes.</p>",
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"status": "otp_sent", "email": branch_user.email, "message": "Verification code sent to your registered email"}


@onboarding_router.post("/verify-otp")
def verify_franchise_setup_otp(payload: CompanyOtpVerify, db: Session = Depends(get_db)):
    branch_user, branch, onboarding = get_franchise_setup_context(payload.token, payload.email, db)
    if not onboarding.pending_password_hash or not onboarding.otp_hash or not onboarding.otp_expires_at:
        raise HTTPException(status_code=400, detail="Request a verification code first")
    if onboarding.otp_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code expired. Go back and request a new code.")
    submitted = digest(f"{branch_user.id}:{payload.otp}")
    if not hmac.compare_digest(onboarding.otp_hash, submitted):
        raise HTTPException(status_code=400, detail="The verification code is incorrect")

    branch_user.password_hash = onboarding.pending_password_hash
    onboarding.password_set_at = datetime.utcnow()
    onboarding.pending_password_hash = None
    onboarding.otp_hash = None
    onboarding.otp_expires_at = None
    onboarding.invite_token_hash = None
    onboarding.invite_expires_at = None
    db.commit()

    company = db.query(UserModel).filter_by(id=branch.company_id, role="company").first()
    company_name = company.name if company else "your company"
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://servora-frontend-xi.vercel.app").rstrip("/")
    portal_url = f"{frontend_url}/franchise-login.html"
    confirmation_email_sent = False
    try:
        send_brevo_email(
            branch_user.email,
            branch_user.name,
            "Your Servora franchise password is set",
            f"Hello {branch_user.name},\n\nYour password for the {branch.branch_name} franchise portal, associated with {company_name}, has been set. You can now sign in with your registered email and password:\n{portal_url}",
            f"<p>Hello {html.escape(branch_user.name)},</p><p>Your password for the <strong>{html.escape(branch.branch_name)}</strong> franchise portal, associated with <strong>{html.escape(company_name)}</strong>, has been set.</p><p><a href=\"{html.escape(portal_url, quote=True)}\">Open the Servora franchise portal</a></p>",
        )
        confirmation_email_sent = True
    except Exception:
        pass
    return {
        "status": "password_set",
        "email": branch_user.email,
        "password_set_at": onboarding.password_set_at.isoformat(),
        "confirmation_email_sent": confirmation_email_sent,
        "portal_login_url": portal_url,
    }
