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

from app.db.models import (
    ApplianceModel,
    BranchTechnicianModel,
    CompanyBranchModel,
    JobCardModel,
    ServiceRequestModel,
    TechnicianModel,
    TechnicianOnboardingModel,
    UserModel,
)
from app.db.session import get_db
from app.email_service import send_brevo_email
from app.schemas import (
    AccessTogglePayload,
    CompanyOtpVerify,
    CompanyPasswordSetup,
    FranchiseTechnicianCreate,
    FranchiseTechnicianUpdate,
    TechnicianCredentialsEmail,
)
from app.security import get_authenticated_user, revoke_all_user_sessions

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
    if user.role not in ("branch", "franchise"):
        raise HTTPException(status_code=403, detail="Franchise portal access required")
    branch = db.query(CompanyBranchModel).filter(
        or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
    ).first()
    if not branch and user.phone:
        branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.mobile == user.phone).first()
    if not branch:
        branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.manager_name == user.name).first()
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
        "is_active": getattr(user, "is_active", False if (onboarding and not onboarding.password_set_at) else True),
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
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://servsure.vercel.app").rstrip("/")
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
        "Set up your ServSure technician portal",
        f"Hello {technician.name},\n\n{branch.branch_name} has added you as a ServSure technician. Your details are:\n\n{details_text}\n\nCreate your password and verify your email using this link (valid for 48 hours):\n{setup_url}\n\nUse {user.email} to sign in to the technician portal.",
        f"<p>Hello {html.escape(technician.name)},</p><p><strong>{html.escape(branch.branch_name)}</strong> has added you as a ServSure technician. Your details:</p><ul>{details_html}</ul><p>Create your password and verify your email using the link below. The link expires in 48 hours.</p><p><a href=\"{html.escape(setup_url, quote=True)}\">Set up your technician portal password</a></p><p>Registered login email: <strong>{html.escape(user.email)}</strong></p>",
    )
    return setup_url


@router.get("/technicians")
def list_franchise_technicians(request: Request, db: Session = Depends(get_db)):
    _, branch = require_franchise(request, db)
    rows = (
        db.query(BranchTechnicianModel, TechnicianModel, UserModel, TechnicianOnboardingModel)
        .join(TechnicianModel, TechnicianModel.id == BranchTechnicianModel.technician_id)
        .join(UserModel, UserModel.id == TechnicianModel.id)
        .filter(
            BranchTechnicianModel.branch_id == branch.id,
            ~TechnicianModel.id.in_(["tech_1", "tech_2"]),
            ~TechnicianModel.name.in_(["Rahul Sharma", "Suresh Kumar"])
        )
        .order_by(TechnicianModel.name)
        .all()
    )
    return [technician_payload(tech, profile, user, onboarding) for profile, tech, user, onboarding in rows]


@router.put("/technicians/{technician_id}/access")
def toggle_technician_access(technician_id: str, payload: AccessTogglePayload, request: Request, db: Session = Depends(get_db)):
    _, branch = require_franchise(request, db)
    link = db.query(BranchTechnicianModel).filter(
        BranchTechnicianModel.technician_id == technician_id,
        BranchTechnicianModel.branch_id == branch.id
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Technician not found in your franchise branch")

    tech_user = db.query(UserModel).filter(UserModel.id == technician_id).first()
    if not tech_user:
        raise HTTPException(status_code=404, detail="Technician account not found")

    tech_user.is_active = payload.is_active
    if not payload.is_active:
        revoke_all_user_sessions(tech_user.id, db)

    db.commit()
    db.refresh(tech_user)

    technician = db.query(TechnicianModel).filter(TechnicianModel.id == technician_id).first()
    onboarding = db.query(TechnicianOnboardingModel).filter_by(technician_id=technician_id).first()
    return {
        "status": "success",
        "message": f"Technician access {'enabled' if payload.is_active else 'disabled'} successfully",
        "technician": technician_payload(technician, link, tech_user, onboarding)
    }


@router.post("/technicians", status_code=201)
def create_franchise_technician(
    payload: FranchiseTechnicianCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    _, branch = require_franchise(request, db)
    email = payload.email.strip().lower()
    if db.query(UserModel).filter(UserModel.email.ilike(email)).first():
        raise HTTPException(status_code=409, detail="A ServSure account with this email already exists")
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
        is_active=False,
        created_at=datetime.utcnow(),
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


@router.put("/technicians/{technician_id}")
def update_franchise_technician(
    technician_id: str,
    payload: FranchiseTechnicianUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    _, branch = require_franchise(request, db)
    profile = db.query(BranchTechnicianModel).filter_by(
        technician_id=technician_id,
        branch_id=branch.id,
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Technician not found in this franchise")

    technician = db.query(TechnicianModel).filter_by(id=technician_id).first()
    user = db.query(UserModel).filter_by(id=technician_id, role="technician").first()
    if not user and technician:
        user = db.query(UserModel).filter(UserModel.phone == technician.phone, UserModel.role == "technician").first()
    if not technician or not user:
        raise HTTPException(status_code=404, detail="Technician account not found")

    onboarding = db.query(TechnicianOnboardingModel).filter_by(technician_id=technician_id).first()

    name = payload.name.strip()
    title = payload.title.strip()
    mobile = payload.mobile.strip()
    address = payload.address.strip()
    pincode = payload.pincode.strip()

    technician.name = name
    technician.title = title
    technician.phone = mobile

    user.name = name
    user.phone = mobile
    user.address = f"{address}, {pincode}"

    profile.address = address
    profile.pincode = pincode

    db.commit()
    db.refresh(technician)
    db.refresh(user)
    db.refresh(profile)

    return technician_payload(technician, profile, user, onboarding)


@router.get("/customers")
def list_franchise_customers(request: Request, db: Session = Depends(get_db)):
    user, branch = require_franchise(request, db)

    reqs = (
        db.query(ServiceRequestModel)
        .filter(
            or_(
                ServiceRequestModel.branch_id == branch.id,
                ServiceRequestModel.pincode == branch.pincode,
            )
        )
        .order_by(ServiceRequestModel.created_at.desc())
        .all()
    )

    cust_ids = {r.customer_id for r in reqs if r.customer_id}
    users = (
        db.query(UserModel)
        .filter(
            or_(
                UserModel.id.in_(cust_ids),
                UserModel.address.ilike(f"%{branch.pincode}%"),
            )
        )
        .all()
        if cust_ids
        else []
    )
    user_map = {u.id: u for u in users}

    customers_map = {}
    for r in reqs:
        cid = r.customer_id or f"cust_{r.id}"
        if cid not in customers_map:
            u = user_map.get(cid)
            c_name = r.customer_name or (u.name if u else "Customer")
            c_phone = r.customer_phone or (u.phone if u else "—")
            c_email = u.email if u else ""
            c_addr = r.customer_address or (u.address if u else "Address not provided")

            addr_parts = [p.strip() for p in c_addr.split(",") if p.strip()]
            short_loc = addr_parts[-2] if len(addr_parts) >= 2 else (addr_parts[0] if addr_parts else "Location")

            customers_map[cid] = {
                "customer_id": cid,
                "customer_name": c_name,
                "customer_email": c_email,
                "customer_phone": c_phone,
                "customer_address": c_addr,
                "short_location": short_loc,
                "pincode": r.pincode or branch.pincode or "",
                "avatar": c_name[:2].upper(),
                "products": [],
                "active_warranties_count": 0,
                "ongoing_services_count": 0,
                "completed_services_count": 0,
                "total_services_count": 0,
            }

        c_entry = customers_map[cid]
        c_entry["total_services_count"] += 1
        is_completed = r.status == "Completed" or r.status_badge == "Completed"
        if is_completed:
            c_entry["completed_services_count"] += 1
        else:
            c_entry["ongoing_services_count"] += 1

        if r.is_under_warranty:
            c_entry["active_warranties_count"] += 1

        prod_key = f"{r.brand} {r.appliance_name}".strip()
        if prod_key and not any(p.get("summary_name") == prod_key for p in c_entry["products"]):
            c_entry["products"].append({
                "summary_name": prod_key,
                "appliance_id": r.appliance_id or f"app_{r.id}",
                "category": r.appliance_name or "Home Appliance",
                "brand": r.brand or "Brand",
                "model_no": r.model_no or "—",
                "serial_no": "Registered for service",
                "warranty_status": "Active" if r.is_under_warranty else "Standard",
                "is_under_warranty": bool(r.is_under_warranty),
                "registered_on": r.appointment_date or r.created_at or "Recent",
            })

    for cid, c_entry in customers_map.items():
        apps = db.query(ApplianceModel).filter(ApplianceModel.user_id == cid).all()
        for a in apps:
            prod_key = f"{a.brand} {a.category}".strip()
            if not any(p.get("summary_name") == prod_key for p in c_entry["products"]):
                is_w = (a.warranty_status or "").lower() == "active"
                if is_w:
                    c_entry["active_warranties_count"] += 1
                c_entry["products"].append({
                    "summary_name": prod_key,
                    "appliance_id": a.id,
                    "category": a.category,
                    "brand": a.brand,
                    "model_no": a.model_no,
                    "serial_no": a.serial_no or "Not provided",
                    "warranty_status": a.warranty_status or ("Active" if is_w else "Standard"),
                    "warranty_start_date": a.warranty_start_date or a.registered_on,
                    "warranty_end_date": a.warranty_end_date or "",
                    "is_under_warranty": is_w,
                    "amc_active": bool(a.amc_active),
                    "amc_plan_name": a.amc_plan_name or "",
                    "amc_end_date": a.amc_end_date or "",
                    "registered_on": a.registered_on,
                })

        c_entry["total_products_count"] = len(c_entry["products"])
        p_names = [p.get("summary_name") or f"{p['brand']} {p['category']}" for p in c_entry["products"]]
        c_entry["products_summary"] = ", ".join(p_names[:2]) + ("..." if len(p_names) > 2 else "")
        c_entry["warranty_summary"] = f"Active ({c_entry['active_warranties_count']})" if c_entry["active_warranties_count"] > 0 else "Standard"
        c_entry["warranty_status"] = c_entry["warranty_summary"]
        c_entry["brand"] = c_entry["products"][0]["brand"] if c_entry["products"] else "Appliance"
        c_entry["category"] = c_entry["products"][0]["category"] if c_entry["products"] else "Appliance"
        c_entry["model_no"] = c_entry["products"][0]["model_no"] if c_entry["products"] else "—"
        c_entry["serial_no"] = c_entry["products"][0]["serial_no"] if c_entry["products"] else "—"
        c_entry["registered_on"] = c_entry["products"][0]["registered_on"] if c_entry["products"] else "Recent"

    return list(customers_map.values())


@router.get("/customers/{customer_id}")
def get_franchise_customer_details(customer_id: str, request: Request, db: Session = Depends(get_db)):
    user, branch = require_franchise(request, db)

    customer = db.query(UserModel).filter(UserModel.id == customer_id).first()
    c_name = customer.name if customer else "Customer"
    c_email = customer.email if customer else ""
    c_phone = customer.phone if customer else ""
    c_addr = customer.address if customer else "Address not provided"

    reqs = (
        db.query(ServiceRequestModel)
        .filter(
            ServiceRequestModel.customer_id == customer_id,
            or_(
                ServiceRequestModel.branch_id == branch.id,
                ServiceRequestModel.pincode == branch.pincode,
            ),
        )
        .order_by(ServiceRequestModel.created_at.desc())
        .all()
    )

    if not customer and reqs:
        c_name = reqs[0].customer_name or c_name
        c_phone = reqs[0].customer_phone or c_phone
        c_addr = reqs[0].customer_address or c_addr

    appliances = (
        db.query(ApplianceModel)
        .filter(ApplianceModel.user_id == customer_id)
        .order_by(ApplianceModel.registered_on.desc())
        .all()
    )

    products_list = []
    active_warranties = 0
    for a in appliances:
        is_w_active = (a.warranty_status or "").lower() == "active"
        if is_w_active:
            active_warranties += 1
        products_list.append({
            "id": a.id,
            "category": a.category,
            "brand": a.brand,
            "model_no": a.model_no,
            "serial_no": a.serial_no or "Not provided",
            "registered_on": a.registered_on,
            "warranty_status": a.warranty_status or "Active",
            "warranty_start_date": a.warranty_start_date or a.registered_on,
            "warranty_end_date": a.warranty_end_date or "Standard 1-Year",
            "is_under_warranty": is_w_active,
            "amc_active": bool(a.amc_active),
            "amc_plan_name": a.amc_plan_name or "None",
            "amc_end_date": a.amc_end_date or "—",
        })

    if not products_list and reqs:
        seen_keys = set()
        for r in reqs:
            pkey = f"{r.brand} {r.appliance_name}".strip()
            if pkey not in seen_keys:
                seen_keys.add(pkey)
                if r.is_under_warranty:
                    active_warranties += 1
                products_list.append({
                    "id": r.appliance_id or f"app_{r.id}",
                    "category": r.appliance_name,
                    "brand": r.brand,
                    "model_no": r.model_no,
                    "serial_no": "Registered for service",
                    "registered_on": r.appointment_date or r.created_at,
                    "warranty_status": "Active" if r.is_under_warranty else "Standard",
                    "warranty_start_date": r.appointment_date or r.created_at,
                    "warranty_end_date": "Standard 1-Year",
                    "is_under_warranty": bool(r.is_under_warranty),
                    "amc_active": False,
                    "amc_plan_name": "None",
                    "amc_end_date": "—",
                })

    ongoing = []
    completed = []
    for r in reqs:
        tech_name = "Unassigned"
        if r.technician_id:
            t = db.query(TechnicianModel).filter(TechnicianModel.id == r.technician_id).first()
            if t:
                tech_name = t.name
        branch_name = branch.branch_name
        jc = db.query(JobCardModel).filter(JobCardModel.request_id == r.id).first()
        total_amt = jc.total_amount if jc else 0.0
        item = {
            "id": r.id,
            "appliance_id": r.appliance_id,
            "appliance_name": r.appliance_name,
            "brand": r.brand,
            "model_no": r.model_no,
            "issue": r.issue,
            "description": r.description or "",
            "status": r.status or "In Progress",
            "status_badge": r.status_badge or "In Progress",
            "created_at": r.created_at,
            "appointment_date": r.appointment_date,
            "appointment_slot": r.appointment_slot,
            "technician_name": tech_name,
            "branch_name": branch_name,
            "total_amount": total_amt,
            "payment_status": r.payment_status or "Pending",
            "is_under_warranty": bool(r.is_under_warranty),
        }
        if r.status == "Completed" or r.status_badge == "Completed":
            completed.append(item)
        else:
            ongoing.append(item)

    return {
        "customer": {
            "id": customer_id,
            "name": c_name,
            "email": c_email,
            "phone": c_phone,
            "address": c_addr,
            "avatar": c_name[:2].upper(),
        },
        "stats": {
            "total_products": len(products_list),
            "active_warranties": active_warranties,
            "ongoing_services": len(ongoing),
            "completed_services": len(completed),
        },
        "products": products_list,
        "ongoing_services": ongoing,
        "completed_services": completed,
    }


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
            "Your ServSure technician verification code",
            f"Your ServSure verification code is {otp}. It expires in 10 minutes. If you did not request this, ignore this email.",
            f"<p>Your ServSure verification code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{otp}</p><p>This code expires in 10 minutes.</p>",
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
    user.is_active = True
    onboarding.password_set_at = datetime.utcnow()
    onboarding.pending_password_hash = None
    onboarding.otp_hash = None
    onboarding.otp_expires_at = None
    onboarding.invite_token_hash = None
    onboarding.invite_expires_at = None
    technician.is_verified = True
    db.commit()

    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://servsure.vercel.app").rstrip("/")
    portal_url = f"{frontend_url}/technician-login.html"
    branch = db.query(CompanyBranchModel).filter_by(id=profile.branch_id).first()
    branch_name = branch.branch_name if branch else "your franchise"
    confirmation_email_sent = False
    try:
        send_brevo_email(
            user.email,
            user.name,
            "Your ServSure technician password is set",
            f"Hello {user.name},\n\nYour password is set. You can now access the technician portal for {branch_name} using your registered email and password:\n{portal_url}",
            f"<p>Hello {html.escape(user.name)},</p><p>Your password is set. You can now access the technician portal for <strong>{html.escape(branch_name)}</strong>.</p><p><a href=\"{html.escape(portal_url, quote=True)}\">Open the ServSure technician portal</a></p>",
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
