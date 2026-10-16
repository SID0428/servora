import hashlib
import hmac
import html
import json
import os
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.models import CompanyOnboardingModel, UserModel
from app.db.session import get_db
from app.schemas import CompanyCreate, CompanyCredentialsEmail, CompanyOtpVerify, CompanyPasswordSetup

router = APIRouter(prefix="/api/admin", tags=["admin"])
onboarding_router = APIRouter(prefix="/api/onboarding", tags=["company onboarding"])


def require_admin(request: Request, db: Session) -> UserModel:
    user_id = request.cookies.get("servora_user_id") or request.headers.get("x-user-id")
    user = db.query(UserModel).filter(UserModel.id == user_id).first() if user_id else None
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


def make_password_hash(password: str) -> str:
    rounds, salt = 310_000, secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds).hex()
    return f"pbkdf2_sha256${rounds}${salt.hex()}${digest}"


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def company_payload(user: UserModel, onboarding: CompanyOnboardingModel | None = None) -> dict:
    return {
        "id": user.id, "name": user.name, "email": user.email, "phone": user.phone,
        "address": user.address, "role": user.role,
        "password_set": bool(onboarding and onboarding.password_set_at),
        "password_set_at": f"{onboarding.password_set_at.isoformat()}Z" if onboarding and onboarding.password_set_at else None,
    }


def send_brevo_email(to_email: str, to_name: str, subject: str, text: str, html: str | None = None) -> None:
    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    if not api_key or not sender_email:
        raise HTTPException(status_code=503, detail="Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL on the backend.")
    body = {
        "sender": {"name": os.getenv("BREVO_SENDER_NAME", "Servora"), "email": sender_email},
        "to": [{"email": to_email, "name": to_name}], "subject": subject, "textContent": text,
    }
    if html:
        body["htmlContent"] = html
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email", data=json.dumps(body).encode(),
        headers={"api-key": api_key, "accept": "application/json", "content-type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status >= 300:
                raise HTTPException(status_code=502, detail="Brevo did not accept the message")
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Brevo could not send the email") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Could not connect to Brevo") from exc


def issue_invite(company: UserModel, onboarding: CompanyOnboardingModel) -> str:
    token = secrets.token_urlsafe(32)
    onboarding.invite_token_hash = digest(token)
    onboarding.invite_expires_at = datetime.utcnow() + timedelta(hours=48)
    onboarding.pending_password_hash = None
    onboarding.otp_hash = None
    onboarding.otp_expires_at = None
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://servora-frontend-xi.vercel.app").rstrip("/")
    link = f"{frontend_url}/company-setup.html?token={token}"
    safe_name = html.escape(company.name)
    safe_email = html.escape(company.email)
    send_brevo_email(
        company.email, company.name, "Set up your Servora company admin account",
        f"Hello {company.name},\n\nYour company has been added to Servora. To set up your company admin password, verify your registered email and follow this link (valid for 48 hours):\n{link}\n\nYour registered login email is {company.email}.",
        f"<p>Hello {safe_name},</p><p>Your company has been added to Servora. Use the link below to verify your registered email and create your company admin password. This link expires in 48 hours.</p><p><a href=\"{link}\">Create your Servora password</a></p><p>Registered login email: <strong>{safe_email}</strong></p>",
    )
    return link


@router.get("/companies")
def list_companies(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    rows = db.query(UserModel).filter(UserModel.role == "company").order_by(UserModel.name).all()
    onboarding = {item.company_id: item for item in db.query(CompanyOnboardingModel).all()}
    return [company_payload(user, onboarding.get(user.id)) for user in rows]


@router.get("/directory/{role}")
def list_directory(role: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    if role not in {"branch", "technician", "customer"}:
        raise HTTPException(status_code=404, detail="Directory not found")
    users = db.query(UserModel).filter(UserModel.role == role).order_by(UserModel.name).all()
    return [company_payload(user) for user in users]


@router.post("/companies", status_code=201)
def create_company(payload: CompanyCreate, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    email = payload.email.strip().lower()
    if db.query(UserModel).filter(UserModel.email.ilike(email)).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    # Fail before inserting the account when email delivery cannot be attempted.
    if not os.getenv("BREVO_API_KEY") or not os.getenv("BREVO_SENDER_EMAIL"):
        raise HTTPException(status_code=503, detail="Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL on the backend.")
    company = UserModel(
        id=f"company_{uuid4().hex[:12]}", name=payload.name.strip(), email=email,
        phone=payload.phone.strip(), role="company", address=(payload.address or "").strip() or None,
        password_hash=None,
    )
    db.add(company)
    db.flush()
    onboarding = CompanyOnboardingModel(company_id=company.id)
    db.add(onboarding)
    try:
        issue_invite(company, onboarding)
        db.commit()
        db.refresh(company)
        return company_payload(company, onboarding)
    except Exception:
        db.rollback()
        raise


@router.post("/companies/send-credentials")
def send_company_credentials(payload: CompanyCredentialsEmail, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    company = db.query(UserModel).filter(UserModel.id == payload.company_id, UserModel.role == "company").first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    onboarding = db.query(CompanyOnboardingModel).filter_by(company_id=company.id).first()
    if not onboarding:
        onboarding = CompanyOnboardingModel(company_id=company.id)
        db.add(onboarding)
    elif onboarding.password_set_at:
        raise HTTPException(status_code=409, detail="This company has already set its password")
    issue_invite(company, onboarding)
    db.commit()
    return {"status": "sent", "email": company.email, "message": "Password setup link sent"}


def get_setup_context(token: str, email: str, db: Session):
    onboarding = db.query(CompanyOnboardingModel).filter_by(invite_token_hash=digest(token)).first()
    if not onboarding or not onboarding.invite_expires_at or onboarding.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This password setup link is invalid or expired. Ask Servora to send a new one.")
    company = db.query(UserModel).filter_by(id=onboarding.company_id, role="company").first()
    if not company or not hmac.compare_digest(company.email.lower(), email.strip().lower()):
        raise HTTPException(status_code=400, detail="Enter the email address registered with Servora")
    if onboarding.password_set_at:
        raise HTTPException(status_code=400, detail="This company account is already set up. Please sign in.")
    return company, onboarding


@onboarding_router.post("/company/password")
def begin_company_password_setup(payload: CompanyPasswordSetup, db: Session = Depends(get_db)):
    company, onboarding = get_setup_context(payload.token, payload.email, db)
    otp = f"{secrets.randbelow(1_000_000):06d}"
    onboarding.pending_password_hash = make_password_hash(payload.password)
    onboarding.otp_hash = digest(f"{onboarding.company_id}:{otp}")
    onboarding.otp_expires_at = datetime.utcnow() + timedelta(minutes=10)
    try:
        send_brevo_email(
            company.email, company.name, "Your Servora verification code",
            f"Your Servora verification code is {otp}. It expires in 10 minutes. If you did not request this, ignore this email.",
            f"<p>Your Servora verification code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{otp}</p><p>This code expires in 10 minutes.</p>",
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"status": "otp_sent", "email": company.email, "message": "Verification code sent to your registered email"}


@onboarding_router.post("/company/verify-otp")
def verify_company_setup_otp(payload: CompanyOtpVerify, db: Session = Depends(get_db)):
    company, onboarding = get_setup_context(payload.token, payload.email, db)
    if not onboarding.pending_password_hash or not onboarding.otp_hash or not onboarding.otp_expires_at:
        raise HTTPException(status_code=400, detail="Request a verification code first")
    if onboarding.otp_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code expired. Go back and request a new code.")
    submitted = digest(f"{company.id}:{payload.otp}")
    if not hmac.compare_digest(onboarding.otp_hash, submitted):
        raise HTTPException(status_code=400, detail="The verification code is incorrect")
    company.password_hash = onboarding.pending_password_hash
    onboarding.password_set_at = datetime.utcnow()
    onboarding.pending_password_hash = None
    onboarding.otp_hash = None
    onboarding.otp_expires_at = None
    onboarding.invite_token_hash = None
    onboarding.invite_expires_at = None
    db.commit()
    return {"status": "password_set", "email": company.email, "password_set_at": onboarding.password_set_at.isoformat()}
