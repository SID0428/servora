from fastapi import APIRouter, Depends, Response, Request, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from uuid import uuid4
from app.db.session import get_db
from app.db.models import BranchOnboardingModel, BranchTechnicianModel, CompanyOnboardingModel, TechnicianOnboardingModel, UserModel, CompanyBranchModel, TechnicianModel
from app.security import create_user_session, get_authenticated_user, revoke_user_session
from app.schemas import CustomerAddressUpdate, CustomerRegistration, LoginRequest, UserProfileUpdate
import hashlib
import hmac
import os

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
