import hashlib
import hmac
import os
import secrets
import string
import urllib.error
import urllib.request
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.models import UserModel
from app.db.session import get_db
from app.schemas import CompanyCreate, CompanyCredentialsEmail

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(request: Request, db: Session) -> UserModel:
    user_id = request.cookies.get("servora_user_id") or request.headers.get("x-user-id")
    user = db.query(UserModel).filter(UserModel.id == user_id).first() if user_id else None
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


def company_payload(user: UserModel) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone, "address": user.address, "role": user.role}


@router.get("/companies")
def list_companies(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return [company_payload(user) for user in db.query(UserModel).filter(UserModel.role == "company").order_by(UserModel.name).all()]


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
    company = UserModel(
        id=f"company_{uuid4().hex[:12]}", name=payload.name.strip(), email=email,
        phone=payload.phone.strip(), role="company", address=(payload.address or "").strip() or None,
        password_hash=None,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company_payload(company)


@router.post("/companies/send-credentials")
def send_company_credentials(payload: CompanyCredentialsEmail, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    company = db.query(UserModel).filter(UserModel.id == payload.company_id, UserModel.role == "company").first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    sender_name = os.getenv("BREVO_SENDER_NAME", "Servora")
    if not api_key or not sender_email:
        raise HTTPException(status_code=503, detail="Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.")

    # Provision a fresh one-time-shared initial password, retain only its hash.
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    password = "".join(secrets.choice(alphabet) for _ in range(16))
    rounds = 310_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds).hex()
    company.password_hash = f"pbkdf2_sha256${rounds}${salt.hex()}${digest}"
    db.commit()

    body = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": company.email, "name": company.name}],
        "subject": "Your Servora company portal login",
        "textContent": (
            f"Hello {company.name},\n\nYour Servora company portal is ready.\n"
            f"Login: https://servora.vercel.app/company-login.html\nEmail: {company.email}\n"
            f"Temporary password: {password}\n\nPlease sign in and change this password after your first login."
        ),
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email", data=json.dumps(body).encode(),
        headers={"api-key": api_key, "accept": "application/json", "content-type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status >= 300:
                raise HTTPException(status_code=502, detail="Brevo did not accept the message")
    except urllib.error.HTTPError as exc:
        # Keep response details out of the client message; they may contain provider metadata.
        raise HTTPException(status_code=502, detail="Brevo could not send the credentials email") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Could not connect to Brevo") from exc
    return {"status": "sent", "email": company.email}
