import hashlib
import hmac
import html
import logging
import os
import secrets
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.models import (
    BranchTechnicianModel,
    CompanyBranchModel,
    TechnicianModel,
    TechnicianOnboardingModel,
    UserModel,
)
from app.db.session import get_db
from app.email_service import send_brevo_email
from app.schemas import (
    CompanyOtpVerify,
    CompanyPasswordSetup,
    FranchiseTechnicianCreate,
    TechnicianCredentialsEmail,
)
from app.security import get_authenticated_user

router = APIRouter(prefix="/api/franchise", tags=["franchise portal"])
onboarding_router = APIRouter(prefix="/api/onboarding/technician", tags=["technician onboarding"])
logger = logging.getLogger(__name__)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def make_password_hash(password: str) -> str:
    rounds, salt = 310_000, secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds).hex()
    return f"pbkdf2_sha256${rounds}${salt.hex()}${hashed}"


def require_franchise(request: Request, db: Session) -> tuple[UserModel, CompanyBranchModel]:
    user = get_authenticated_user(request, db)
    if user.role != "branch":
        raise HTTPException(status_code=403, detail="Franchise portal access required")
    branch = db.query(CompanyBranchModel).filter_by(id=user.id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Franchise branch record not found")
    return user, branch


def technician_payload(
    technician: TechnicianModel,
    profile: BranchTechnicianModel,
    user: UserModel,
    onboarding: TechnicianOnboardingModel | None,
) -> dict:
    return {
        "id": technician.id,
        "name": technician.name,
        "title": technician.title,
        "email": user.email,
        "mobile": technician.phone,
        "address": profile.address,
        "pincode": profile.pincode,
        "password_set": bool(onboarding and onboarding.password_set_at),
        "password_set_at": onboarding.password_set_at.isoformat() if onboarding and onboarding.password_set_at else None,
        "created_at": profile.created_at.isoformat(),
    }


def issue_technician_invite(
    technician: TechnicianModel,
    profile: BranchTechnicianModel,
    user: UserModel,
    onboarding: TechnicianOnboardingModel,
    branch: CompanyBranchModel,
) -> str:
    token = secrets.token_urlsafe(32)
    onboarding.invite_token_hash = digest(token)
    onboarding.invite_expires_at = datetime.utcnow() + timedelta(hours=48)
    onboarding.pending_password_hash = None
    onboarding.otp_hash = None
    onboarding.otp_expires_at = None
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://servora-frontend-xi.vercel.app").rstrip("/")
    setup_url = f"{frontend_url}/technician-setup.html?token={token}"
    values = {
        "technician": technician.name,
        "title": technician.title,
        "email": user.email,
        "mobile": technician.phone,
        "address": profile.address,
        "pincode": profile.pincode,
        "franchise branch": branch.branch_name,
    }
    details_text = "\n".join(f"{label}: {value}" for label, value in values.items())
    details_html = "".join(
        f"<li><strong>{html.escape(label.title())}:</strong> {html.escape(value)}</li>"
        for label, value in values.items()
    )
    send_brevo_email(
        user.email,
        technician.name,
        "Set up your Servora technician portal",
        f"Hello {technician.name},\n\n{branch.branch_name} has added you as a Servora technician. Your details are:\n\n{details_text}\n\nCreate your password and verify your email using this link (valid for 48 hours):\n{setup_url}\n\nUse {user.email} to sign in to the technician portal.",
        f"<p>Hello {html.escape(technician.name)},</p><p><strong>{html.escape(branch.branch_name)}</strong> has added you as a Servora technician. Your details:</p><ul>{details_html}</ul><p>Create your password and verify your email using the link below. The link expires in 48 hours.</p><p><a href=\"{html.escape(setup_url, quote=True)}\">Set up your technician portal password</a></p><p>Registered login email: <strong>{html.escape(user.email)}</strong></p>",
    )
    return setup_url


@router.get("/technicians")
def list_franchise_technicians(request: Request, db: Session = Depends(get_db)):
    _, branch = require_franchise(request, db)
    rows = (
        db.query(BranchTechnicianModel, TechnicianModel, UserModel, TechnicianOnboardingModel)
        .join(TechnicianModel, TechnicianModel.id == BranchTechnicianModel.technician_id)
        .join(UserModel, UserModel.id == TechnicianModel.id)
        .outerjoin(TechnicianOnboardingModel, TechnicianOnboardingModel.technician_id == UserModel.id)
        .filter(BranchTechnicianModel.branch_id == branch.id)
        .order_by(TechnicianModel.name)
        .all()
    )
    return [technician_payload(tech, profile, user, onboarding) for profile, tech, user, onboarding in rows]


@router.post("/technicians", status_code=201)
def create_franchise_technician(
    payload: FranchiseTechnicianCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    _, branch = require_franchise(request, db)
    email = payload.email.strip().lower()
    if db.query(UserModel).filter(UserModel.email.ilike(email)).first():
        raise HTTPException(status_code=409, detail="A Servora account with this email already exists")
    if not os.getenv("BREVO_API_KEY") or not os.getenv("BREVO_SENDER_EMAIL"):
        raise HTTPException(status_code=503, detail="Brevo is not configured on the backend.")

    technician_id = f"technician_{uuid4().hex[:12]}"
    technician = TechnicianModel(
        id=technician_id,
        name=payload.name.strip(),
        title=payload.title.strip(),
        company_branch=branch.branch_name,
        phone=payload.mobile.strip(),
        is_verified=False,
    )
    user = UserModel(
        id=technician_id,
        name=technician.name,
        email=email,
        phone=technician.phone,
        role="technician",
        address=f"{payload.address.strip()}, {payload.pincode.strip()}",
        password_hash=None,
    )
    profile = BranchTechnicianModel(
        technician_id=technician_id,
        branch_id=branch.id,
        address=payload.address.strip(),
        pincode=payload.pincode.strip(),
    )
    onboarding = TechnicianOnboardingModel(technician_id=technician_id)
    try:
        db.add(user)
        db.flush()
        db.add(technician)
        db.flush()
        db.add_all([profile, onboarding])
        db.flush()
        issue_technician_invite(technician, profile, user, onboarding, branch)
        db.commit()
        return technician_payload(technician, profile, user, onboarding)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to create a franchise technician or send its setup link")
        raise HTTPException(status_code=500, detail="Could not add the technician. Check the backend service logs for details.") from exc


@router.post("/technicians/send-setup-link")
def resend_technician_setup_link(
    payload: TechnicianCredentialsEmail,
    request: Request,
    db: Session = Depends(get_db),
):
    _, branch = require_franchise(request, db)
    profile = db.query(BranchTechnicianModel).filter_by(
        technician_id=payload.technician_id,
        branch_id=branch.id,
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Technician not found in this franchise")
    technician = db.query(TechnicianModel).filter_by(id=profile.technician_id).first()
    user = db.query(UserModel).filter_by(id=profile.technician_id, role="technician").first()
    if not technician or not user:
        raise HTTPException(status_code=404, detail="Technician account not found")
    onboarding = db.query(TechnicianOnboardingModel).filter_by(technician_id=user.id).first()
    if onboarding and onboarding.password_set_at:
        raise HTTPException(status_code=409, detail="This technician has already set a password")
    if not onboarding:
        onboarding = TechnicianOnboardingModel(technician_id=user.id)
        db.add(onboarding)
    try:
        db.flush()
        issue_technician_invite(technician, profile, user, onboarding, branch)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to resend a technician setup link")
        raise HTTPException(status_code=500, detail="Could not resend the technician setup link. Check the backend service logs for details.") from exc
    return {"status": "sent", "email": user.email, "message": "Technician setup link sent"}


def get_technician_setup_context(token: str, email: str, db: Session):
    onboarding = db.query(TechnicianOnboardingModel).filter_by(invite_token_hash=digest(token)).first()
    if not onboarding or not onboarding.invite_expires_at or onboarding.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This setup link is invalid or expired. Ask your franchise manager to resend it.")
    user = db.query(UserModel).filter_by(id=onboarding.technician_id, role="technician").first()
    technician = db.query(TechnicianModel).filter_by(id=onboarding.technician_id).first()
    profile = db.query(BranchTechnicianModel).filter_by(technician_id=onboarding.technician_id).first()
    if not user or not technician or not profile or not hmac.compare_digest(user.email.lower(), email.strip().lower()):
        raise HTTPException(status_code=400, detail="Enter the email address registered with your franchise")
    if onboarding.password_set_at:
        raise HTTPException(status_code=400, detail="This technician account is already set up. Please sign in.")
    return user, technician, profile, onboarding


@onboarding_router.post("/password")
def begin_technician_password_setup(payload: CompanyPasswordSetup, db: Session = Depends(get_db)):
    user, _, _, onboarding = get_technician_setup_context(payload.token, payload.email, db)
    otp = f"{secrets.randbelow(1_000_000):06d}"
    onboarding.pending_password_hash = make_password_hash(payload.password)
    onboarding.otp_hash = digest(f"{user.id}:{otp}")
    onboarding.otp_expires_at = datetime.utcnow() + timedelta(minutes=10)
    try:
        send_brevo_email(
            user.email,
            user.name,
            "Your Servora technician verification code",
            f"Your Servora verification code is {otp}. It expires in 10 minutes. If you did not request this, ignore this email.",
            f"<p>Your Servora verification code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{otp}</p><p>This code expires in 10 minutes.</p>",
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"status": "otp_sent", "email": user.email, "message": "Verification code sent to your registered email"}


@onboarding_router.post("/verify-otp")
def verify_technician_setup_otp(payload: CompanyOtpVerify, db: Session = Depends(get_db)):
    user, technician, profile, onboarding = get_technician_setup_context(payload.token, payload.email, db)
    if not onboarding.pending_password_hash or not onboarding.otp_hash or not onboarding.otp_expires_at:
        raise HTTPException(status_code=400, detail="Request a verification code first")
    if onboarding.otp_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code expired. Go back and request a new code.")
    submitted = digest(f"{user.id}:{payload.otp}")
    if not hmac.compare_digest(onboarding.otp_hash, submitted):
        raise HTTPException(status_code=400, detail="The verification code is incorrect")

    user.password_hash = onboarding.pending_password_hash
    onboarding.password_set_at = datetime.utcnow()
    onboarding.pending_password_hash = None
    onboarding.otp_hash = None
    onboarding.otp_expires_at = None
    onboarding.invite_token_hash = None
    onboarding.invite_expires_at = None
    technician.is_verified = True
    db.commit()

    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://servora-frontend-xi.vercel.app").rstrip("/")
    portal_url = f"{frontend_url}/technician-login.html"
    branch = db.query(CompanyBranchModel).filter_by(id=profile.branch_id).first()
    branch_name = branch.branch_name if branch else "your franchise"
    confirmation_email_sent = False
    try:
        send_brevo_email(
            user.email,
            user.name,
            "Your Servora technician password is set",
            f"Hello {user.name},\n\nYour password is set. You can now access the technician portal for {branch_name} using your registered email and password:\n{portal_url}",
            f"<p>Hello {html.escape(user.name)},</p><p>Your password is set. You can now access the technician portal for <strong>{html.escape(branch_name)}</strong>.</p><p><a href=\"{html.escape(portal_url, quote=True)}\">Open the Servora technician portal</a></p>",
        )
        confirmation_email_sent = True
    except Exception:
        logger.exception("Technician password was set, but its confirmation email could not be sent")
    return {
        "status": "password_set",
        "email": user.email,
        "password_set_at": onboarding.password_set_at.isoformat(),
        "confirmation_email_sent": confirmation_email_sent,
        "portal_login_url": portal_url,
    }
