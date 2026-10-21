from datetime import datetime, timedelta
import hashlib
import hmac
import json
import os
import secrets
import urllib.error
import urllib.request
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    AuthOtpModel,
    BranchOnboardingModel,
    BranchTechnicianModel,
    CompanyBranchModel,
    CompanyOnboardingModel,
    TechnicianModel,
    TechnicianOnboardingModel,
    UserModel,
)
from app.db.session import get_db
from app.email_service import send_brevo_email
from app.schemas import (
    CustomerAddressUpdate,
    CustomerLoginRequestOtp,
    CustomerLoginVerifyOtp,
    CustomerRegistration,
    CustomerRegistrationRequestOtp,
    CustomerRegistrationVerifyOtp,
    GoogleAuthPayload,
    LoginRequest,
    UserProfileUpdate,
)
from app.security import create_user_session, get_authenticated_user, revoke_user_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


def send_otp_email(email: str, name: str, otp: str, purpose: str) -> None:
    purpose_label = "account creation" if purpose == "signup" else "sign in"
    subject = f"{otp} is your Servora verification code"
    text_content = (
        f"Hello {name},\n\n"
        f"Your Servora verification code for {purpose_label} is: {otp}\n\n"
        f"This code will expire in 10 minutes.\n"
        f"If you did not request this, please disregard this email."
    )
    html_content = f"""
    <div style="font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
      <div style="margin-bottom:24px">
        <span style="font-size:24px;font-weight:800;color:#0b2545;letter-spacing:-0.5px">s<span style="color:#0ea5e9">.</span> servora</span>
      </div>
      <h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 12px">Verify your email address</h2>
      <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px">
        Use the verification code below to complete your {purpose_label}. This code is valid for <strong>10 minutes</strong>.
      </p>
      <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:18px 24px;text-align:center;margin:0 0 24px">
        <span style="font-family:monospace;font-size:32px;font-weight:800;letter-spacing:6px;color:#0284c7">{otp}</span>
      </div>
      <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0 0 16px">
        If you did not request this code, no action is needed. Your account remains secure.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 16px">
      <p style="font-size:11px;color:#94a3b8;margin:0">
        © 2026 Servora Unified Service Intelligence Platform.
      </p>
    </div>
    """
    try:
        send_brevo_email(to_email=email, to_name=name or "Customer", subject=subject, text=text_content, html=html_content)
    except Exception as exc:
        print(f"[AUTH OTP] {purpose.upper()} OTP for {email} ({name}): {otp} (Brevo notification: {exc})")
        if os.getenv("BREVO_API_KEY"):
            raise HTTPException(status_code=502, detail="Failed to send verification email. Please try again.")


def make_password_hash(password: str) -> str:
    rounds, salt = 310_000, os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds).hex()
    return f"pbkdf2_sha256${rounds}${salt.hex()}${digest}"


def user_payload(user: UserModel, db: Session = None) -> dict:
    data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": "franchise" if user.role == "branch" else user.role,
        "avatar": user.avatar,
        "address": user.address,
    }
    if db is not None:
        if user.role in ("branch", "franchise"):
            branch = db.query(CompanyBranchModel).filter(
                (CompanyBranchModel.id == user.id) | (CompanyBranchModel.email == user.email)
            ).first()
            if branch:
                data["branch_id"] = branch.id
                data["branch_name"] = branch.branch_name
                data["pincode"] = branch.pincode
                data["company_id"] = branch.company_id
                company = db.query(UserModel).filter(UserModel.id == branch.company_id).first()
                if company:
                    data["company_name"] = company.name
        elif user.role == "technician":
            tech = db.query(TechnicianModel).filter_by(id=user.id).first()
            if not tech:
                tech = db.query(TechnicianModel).filter(
                    (TechnicianModel.phone == user.phone) | (TechnicianModel.name == user.name)
                ).first()
            if tech:
                data["name"] = tech.name
                data["title"] = tech.title
                data["phone"] = tech.phone
                data["company_branch"] = tech.company_branch
                data["rating"] = tech.rating
                data["total_jobs"] = tech.total_jobs
                if tech.avatar:
                    data["avatar"] = tech.avatar
            b_tech = db.query(BranchTechnicianModel).filter_by(technician_id=user.id).first()
            if b_tech:
                data["address"] = b_tech.address
                data["pincode"] = b_tech.pincode
                branch = db.query(CompanyBranchModel).filter_by(id=b_tech.branch_id).first()
                if branch:
                    data["branch_id"] = branch.id
                    data["branch_name"] = branch.branch_name
    return data


@router.get("/config")
def get_auth_config():
    return {
        "google_client_id": settings.GOOGLE_CLIENT_ID
    }


@router.post("/register/request-otp")
def request_registration_otp(payload: CustomerRegistrationRequestOtp, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    phone = payload.phone.strip()

    # Check if an account already exists with this email or phone
    existing = db.query(UserModel).filter(
        (UserModel.email.ilike(email)) | (UserModel.phone == phone)
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An account with this email or mobile number already exists. Please sign in instead."
        )

    # Invalidate previous signup OTPs for this email
    db.query(AuthOtpModel).filter(
        AuthOtpModel.email == email,
        AuthOtpModel.purpose == "signup"
    ).delete()

    otp = f"{secrets.randbelow(900000) + 100000}"
    otp_hash = hashlib.sha256(otp.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    pending_data = {
        "name": payload.name.strip(),
        "email": email,
        "phone": phone,
        "password_hash": make_password_hash(payload.password),
        "address": (payload.address or "").strip() or None,
    }

    record = AuthOtpModel(
        id=f"otp_{uuid4().hex[:16]}",
        email=email,
        otp_hash=otp_hash,
        purpose="signup",
        payload_json=json.dumps(pending_data),
        expires_at=expires_at,
        created_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()

    send_otp_email(email=email, name=payload.name.strip(), otp=otp, purpose="signup")
    return {"status": "success", "message": f"Verification code sent to {email}"}


@router.post("/register/verify-otp", status_code=201)
def verify_registration_otp(payload: CustomerRegistrationVerifyOtp, response: Response, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    submitted_hash = hashlib.sha256(payload.otp.strip().encode()).hexdigest()

    record = db.query(AuthOtpModel).filter(
        AuthOtpModel.email == email,
        AuthOtpModel.purpose == "signup",
        AuthOtpModel.expires_at > datetime.utcnow()
    ).order_by(AuthOtpModel.created_at.desc()).first()

    if not record or not hmac.compare_digest(record.otp_hash, submitted_hash):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code. Please check your code or request a new one.")

    user_data = json.loads(record.payload_json)

    # Re-check uniqueness in case of race condition
    if db.query(UserModel).filter(UserModel.email.ilike(email)).first():
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=409, detail="An account with this email already exists. Sign in instead.")

    user = UserModel(
        id=f"customer_{uuid4().hex[:12]}",
        name=user_data["name"],
        email=user_data["email"],
        phone=user_data["phone"],
        role="customer",
        password_hash=user_data["password_hash"],
        address=user_data.get("address"),
    )
    db.add(user)
    db.delete(record)

    try:
        db.flush()
        session_token = create_user_session(user, db)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists. Sign in instead.") from exc

    response.set_cookie(
        key="servora_user_id",
        value=user.id,
        httponly=True,
        max_age=86400 * 7,
        path="/",
        samesite="none",
        secure=True,
    )
    return {"status": "success", "session_token": session_token, "user": user_payload(user, db)}


@router.post("/login/request-otp")
def request_login_otp(payload: CustomerLoginRequestOtp, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(UserModel).filter(UserModel.email.ilike(email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email. Please create an account.")

    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Email OTP sign in is only available for customer accounts. Please sign in via the operational staff portal.")

    # Invalidate previous login OTPs
    db.query(AuthOtpModel).filter(
        AuthOtpModel.email == email,
        AuthOtpModel.purpose == "login"
    ).delete()

    otp = f"{secrets.randbelow(900000) + 100000}"
    otp_hash = hashlib.sha256(otp.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    record = AuthOtpModel(
        id=f"otp_{uuid4().hex[:16]}",
        email=email,
        otp_hash=otp_hash,
        purpose="login",
        payload_json=json.dumps({"user_id": user.id}),
        expires_at=expires_at,
        created_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()

    send_otp_email(email=email, name=user.name, otp=otp, purpose="login")
    return {"status": "success", "message": f"Verification code sent to {email}"}


@router.post("/login/verify-otp")
def verify_login_otp(payload: CustomerLoginVerifyOtp, response: Response, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    submitted_hash = hashlib.sha256(payload.otp.strip().encode()).hexdigest()

    record = db.query(AuthOtpModel).filter(
        AuthOtpModel.email == email,
        AuthOtpModel.purpose == "login",
        AuthOtpModel.expires_at > datetime.utcnow()
    ).order_by(AuthOtpModel.created_at.desc()).first()

    if not record or not hmac.compare_digest(record.otp_hash, submitted_hash):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code. Please check your code or request a new one.")

    user = db.query(UserModel).filter(UserModel.email.ilike(email)).first()
    if not user:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=404, detail="Account not found.")

    db.delete(record)
    session_token = create_user_session(user, db)
    db.commit()

    response.set_cookie(
        key="servora_user_id",
        value=user.id,
        httponly=True,
        max_age=86400 * 7,
        path="/",
        samesite="none",
        secure=True,
    )
    return {"status": "success", "session_token": session_token, "user": user_payload(user, db)}


@router.post("/google")
def google_auth(payload: GoogleAuthPayload, response: Response, db: Session = Depends(get_db)):
    credential = payload.credential.strip()
    data = None

    # First attempt: Verify with Google's tokeninfo API
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"
        req = urllib.request.Request(url, headers={"User-Agent": "Servora/1.0"})
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode("utf-8"))
    except Exception:
        # Fallback for dev / token payload decoding
        import base64
        try:
            parts = credential.split(".")
            if len(parts) >= 2:
                payload_b64 = parts[1]
                padded = payload_b64 + "=" * (-len(payload_b64) % 4)
                data = json.loads(base64.urlsafe_b64decode(padded.encode()).decode("utf-8"))
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Invalid Google authentication token.") from exc

    if not data or not data.get("email"):
        raise HTTPException(status_code=400, detail="Could not obtain a verified email address from Google.")

    email = data["email"].strip().lower()
    name = data.get("name") or data.get("given_name") or email.split("@")[0]
    picture = data.get("picture")

    user = db.query(UserModel).filter(UserModel.email.ilike(email)).first()
    if not user:
        user = UserModel(
            id=f"customer_{uuid4().hex[:12]}",
            name=name,
            email=email,
            phone="",
            role="customer",
            password_hash=None,
            avatar=picture,
            address=None,
        )
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            user = db.query(UserModel).filter(UserModel.email.ilike(email)).first()
    else:
        if user.role != "customer":
            raise HTTPException(
                status_code=403,
                detail="This email belongs to an operational staff account. Please use the appropriate staff portal."
            )
        if picture and not user.avatar:
            user.avatar = picture

    session_token = create_user_session(user, db)
    db.commit()

    response.set_cookie(
        key="servora_user_id",
        value=user.id,
        httponly=True,
        max_age=86400 * 7,
        path="/",
        samesite="none",
        secure=True,
    )
    return {"status": "success", "session_token": session_token, "user": user_payload(user, db)}


@router.post("/register", status_code=201)
def register_customer(payload: CustomerRegistration, response: Response, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if db.query(UserModel).filter(UserModel.email.ilike(email)).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Sign in instead.")

    user = UserModel(
        id=f"customer_{uuid4().hex[:12]}",
        name=payload.name.strip(),
        email=email,
        phone=payload.phone.strip(),
        role="customer",
        password_hash=make_password_hash(payload.password),
        address=(payload.address or "").strip() or None,
    )
    db.add(user)
    try:
        db.flush()
        session_token = create_user_session(user, db)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists. Sign in instead.") from exc

    response.set_cookie(
        key="servora_user_id",
        value=user.id,
        httponly=True,
        max_age=86400 * 7,
        path="/",
        samesite="none",
        secure=True,
    )
    return {"status": "success", "session_token": session_token, "user": user_payload(user, db)}

@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    ident = payload.identifier.strip().lower()
    
    # 1. Match by ID
    user = db.query(UserModel).filter(UserModel.id == ident).first()
    
    # 2. Match by email or phone
    if not user:
        user = db.query(UserModel).filter(
            (UserModel.email.ilike(ident)) | (UserModel.phone == ident)
        ).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email, phone, or password")

    if user.role == "company":
        onboarding = db.query(CompanyOnboardingModel).filter_by(company_id=user.id).first()
        if onboarding and not onboarding.password_set_at:
            raise HTTPException(status_code=403, detail="Finish setting up your company password from the invitation email before signing in")

    if user.role == "branch":
        onboarding = db.query(BranchOnboardingModel).filter_by(branch_id=user.id).first()
        if onboarding and not onboarding.password_set_at:
            raise HTTPException(status_code=403, detail="Finish setting up your franchise password from the invitation email before signing in")

    if user.role == "technician":
        onboarding = db.query(TechnicianOnboardingModel).filter_by(technician_id=user.id).first()
        if onboarding and not onboarding.password_set_at:
            raise HTTPException(status_code=403, detail="Finish setting up your technician password from the invitation email before signing in")

    expected_role = {"franchise": "branch"}.get(payload.role, payload.role)
    if expected_role and user.role != expected_role:
        raise HTTPException(status_code=403, detail="This account cannot access the selected portal")

    # Seed accounts accept the demo password; provisioned accounts use PBKDF2 hashes.
    password_ok = False
    if user.password_hash and user.password_hash.startswith("pbkdf2_sha256$"):
        try:
            _, rounds, salt, expected = user.password_hash.split("$", 3)
            actual = hashlib.pbkdf2_hmac("sha256", payload.password.encode(), bytes.fromhex(salt), int(rounds)).hex()
            password_ok = hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            password_ok = False
    elif user.password_hash:
        password_ok = hmac.compare_digest(user.password_hash, payload.password)
    else:
        password_ok = hmac.compare_digest(payload.password, os.getenv("DEMO_PASSWORD", "password123"))
    if not password_ok:
        raise HTTPException(status_code=401, detail="Invalid email, phone, or password")

    response.set_cookie(
        key="servora_user_id",
        value=user.id,
        httponly=True,
        max_age=86400 * 7,
        path="/",
        samesite="none",
        secure=True
    )
    session_token = create_user_session(user, db)
    db.commit()

    return {
        "status": "success",
        "session_token": session_token,
        "user": user_payload(user, db)
    }

@router.get("/me")
def get_current_user(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    token = get_session_token(request)
    session_token = token if (token and token.startswith("srv1.")) else create_user_session(user, db)
    try:
        db.commit()
    except Exception:
        db.rollback()
    return {"user": user_payload(user, db), "session_token": session_token}

@router.post("/refresh")
def refresh_session(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    revoke_user_session(request, db)
    new_token = create_user_session(user, db)
    db.commit()
    return {
        "status": "success",
        "session_token": new_token,
        "user": user_payload(user, db)
    }

@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    revoke_user_session(request, db)
    db.commit()
    response.delete_cookie(key="servora_user_id", path="/", samesite="none", secure=True)
    return {"status": "success", "message": "Logged out successfully"}

@router.put("/address")
def update_user_address(payload: CustomerAddressUpdate, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    parts = [payload.house_flat.strip(), payload.street_area.strip()]
    if payload.landmark and payload.landmark.strip():
        parts.append(f"Near {payload.landmark.strip()}")
    parts.append(payload.city.strip())
    parts.append(f"{payload.state.strip()} - {payload.pincode.strip()}")
    formatted_address = ", ".join(parts)

    user.address = formatted_address
    db.commit()
    db.refresh(user)
    return {
        "status": "success",
        "message": "Service address updated successfully",
        "address": formatted_address,
        "user": user_payload(user, db),
    }

@router.put("/profile")
def update_user_profile(payload: UserProfileUpdate, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if payload.email and payload.email.strip().lower() != user.email.lower():
        existing = db.query(UserModel).filter(UserModel.email.ilike(payload.email.strip().lower())).first()
        if existing and existing.id != user.id:
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        user.email = payload.email.strip().lower()
    user.name = payload.name.strip()
    user.phone = payload.phone.strip()
    if payload.address is not None:
        user.address = payload.address.strip()
    if user.role == "technician":
        tech = db.query(TechnicianModel).filter(TechnicianModel.id == user.id).first()
        if not tech:
            tech = db.query(TechnicianModel).filter(TechnicianModel.phone == user.phone).first()
        if tech:
            tech.name = user.name
            tech.phone = user.phone
    db.commit()
    db.refresh(user)
    return {
        "status": "success",
        "message": "Profile updated successfully",
        "user": user_payload(user, db),
    }

@router.get("/demo-users")
def get_demo_users(db: Session = Depends(get_db)):
    users = db.query(UserModel).all()
    return users
