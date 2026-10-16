from fastapi import APIRouter, Depends, Response, Request, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import CompanyOnboardingModel, UserModel
from app.schemas import LoginRequest, UserBase
import hashlib
import hmac
import os

router = APIRouter(prefix="/api/auth", tags=["auth"])

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

    if payload.role and user.role != payload.role:
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

    return {
        "status": "success",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "role": user.role,
            "avatar": user.avatar,
            "address": user.address
        }
    }

@router.get("/me")
def get_current_user(request: Request, db: Session = Depends(get_db)):
    user_id = request.cookies.get("servora_user_id") or request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": user}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="servora_user_id", path="/", samesite="none", secure=True)
    return {"status": "success", "message": "Logged out successfully"}

@router.get("/demo-users")
def get_demo_users(db: Session = Depends(get_db)):
    users = db.query(UserModel).all()
    return users
