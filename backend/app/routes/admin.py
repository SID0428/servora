import hashlib
import hmac
import html
import os
import secrets
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.models import (
    CompanyOnboardingModel, UserModel, CompanyBranchModel,
    TechnicianModel, BranchTechnicianModel, ApplianceModel, ServiceRequestModel,
    JobCardModel
)
from app.db.session import get_db
from app.schemas import AccessTogglePayload, CompanyCreate, CompanyCredentialsEmail, CompanyOtpVerify, CompanyPasswordSetup
from app.security import get_authenticated_user, revoke_all_user_sessions
from app.email_service import send_brevo_email

router = APIRouter(prefix="/api/admin", tags=["admin"])
onboarding_router = APIRouter(prefix="/api/onboarding", tags=["company onboarding"])


def require_admin(request: Request, db: Session) -> UserModel:
    user = get_authenticated_user(request, db)
    if user.role != "admin":
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
        "is_active": getattr(user, "is_active", True),
        "password_set": bool(onboarding and onboarding.password_set_at),
        "password_set_at": f"{onboarding.password_set_at.isoformat()}Z" if onboarding and onboarding.password_set_at else None,
    }


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
        company.email, company.name, "Set up your ServSure company admin account",
        f"Hello {company.name},\n\nYour company has been added to ServSure. To set up your company admin password, verify your registered email and follow this link (valid for 48 hours):\n{link}\n\nYour registered login email is {company.email}.",
        f"<p>Hello {safe_name},</p><p>Your company has been added to ServSure. Use the link below to verify your registered email and create your company admin password. This link expires in 48 hours.</p><p><a href=\"{link}\">Create your ServSure password</a></p><p>Registered login email: <strong>{safe_email}</strong></p>",
    )
    return link


@router.get("/companies")
def list_companies(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    rows = db.query(UserModel).filter(UserModel.role == "company").order_by(UserModel.name).all()
    onboarding = {item.company_id: item for item in db.query(CompanyOnboardingModel).all()}
    return [company_payload(user, onboarding.get(user.id)) for user in rows]


@router.put("/companies/{company_id}/access")
def toggle_company_access(company_id: str, payload: AccessTogglePayload, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    company = db.query(UserModel).filter(UserModel.id == company_id, UserModel.role == "company").first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    company.is_active = payload.is_active

    # If disabling company, immediately revoke active sessions for company, its branches, and technicians
    if not payload.is_active:
        revoke_all_user_sessions(company.id, db)
        branches = db.query(CompanyBranchModel).filter(CompanyBranchModel.company_id == company.id).all()
        for b in branches:
            revoke_all_user_sessions(b.id, db)
            b_user = db.query(UserModel).filter((UserModel.id == b.id) | (UserModel.email == b.email)).first()
            if b_user:
                revoke_all_user_sessions(b_user.id, db)
            tech_links = db.query(BranchTechnicianModel).filter(BranchTechnicianModel.branch_id == b.id).all()
            for bt in tech_links:
                revoke_all_user_sessions(bt.technician_id, db)

    db.commit()
    db.refresh(company)
    onboarding = db.query(CompanyOnboardingModel).filter_by(company_id=company.id).first()
    return {
        "status": "success",
        "message": f"Company access {'enabled' if payload.is_active else 'disabled'} successfully",
        "company": company_payload(company, onboarding)
    }


@router.get("/companies/{company_id}")
def get_company_details(company_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    company = db.query(UserModel).filter(UserModel.id == company_id, UserModel.role == "company").first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    onboarding = db.query(CompanyOnboardingModel).filter_by(company_id=company.id).first()

    branches = (
        db.query(CompanyBranchModel)
        .filter(CompanyBranchModel.company_id == company.id)
        .order_by(CompanyBranchModel.branch_name)
        .all()
    )
    branch_ids = [b.id for b in branches]

    branch_tech_links = (
        db.query(BranchTechnicianModel)
        .filter(BranchTechnicianModel.branch_id.in_(branch_ids))
        .all()
    ) if branch_ids else []
    tech_ids = [bt.technician_id for bt in branch_tech_links]

    technicians = (
        db.query(TechnicianModel)
        .filter(TechnicianModel.id.in_(tech_ids))
        .all()
    ) if tech_ids else []

    if not technicians and branches:
        branch_names = [b.branch_name for b in branches]
        technicians = (
            db.query(TechnicianModel)
            .filter(
                or_(
                    TechnicianModel.company_branch.in_(branch_names),
                    TechnicianModel.company_branch.ilike(f"%{company.name}%")
                )
            )
            .all()
        )

    products = (
        db.query(ApplianceModel)
        .filter(
            or_(
                ApplianceModel.company_id == company.id,
                ApplianceModel.brand.ilike(company.name.strip())
            )
        )
        .all()
    )

    services = (
        db.query(ServiceRequestModel)
        .filter(
            or_(
                ServiceRequestModel.company_id == company.id,
                ServiceRequestModel.brand.ilike(company.name.strip())
            )
        )
        .order_by(ServiceRequestModel.created_at.desc())
        .all()
    )

    ongoing_services = [s for s in services if s.status_badge in ("In Progress", "Scheduled") or s.status not in ("Completed", "Cancelled")]
    completed_services = [s for s in services if s.status_badge == "Completed" or s.status == "Completed"]
    pending_services = [s for s in services if not s.technician_id]

    tech_map = {t.id: t.name for t in technicians}

    return {
        "company": company_payload(company, onboarding),
        "stats": {
            "total_branches": len(branches),
            "total_technicians": len(technicians),
            "total_products": len(products),
            "total_services": len(services),
            "ongoing_services": len(ongoing_services),
            "completed_services": len(completed_services),
            "pending_services": len(pending_services),
        },
        "branches": [
            {
                "id": b.id,
                "branch_name": b.branch_name,
                "manager_name": b.manager_name,
                "email": b.email,
                "mobile": b.mobile,
                "address": b.address,
                "pincode": b.pincode,
                "technicians_count": sum(1 for bt in branch_tech_links if bt.branch_id == b.id)
            }
            for b in branches
        ],
        "technicians": [
            {
                "id": t.id,
                "name": t.name,
                "title": t.title,
                "company_branch": t.company_branch,
                "rating": t.rating,
                "total_jobs": t.total_jobs,
                "phone": t.phone,
                "avatar": t.avatar,
                "is_verified": t.is_verified,
            }
            for t in technicians
        ],
        "products": [
            {
                "id": p.id,
                "brand": p.brand,
                "category": p.category,
                "model_no": p.model_no,
                "serial_no": p.serial_no or "Standard",
                "warranty_status": p.warranty_status or "Active",
                "registered_on": p.registered_on,
                "customer_id": p.user_id,
            }
            for p in products
        ],
        "services": [
            {
                "id": s.id,
                "customer_name": s.customer_name,
                "customer_phone": s.customer_phone,
                "customer_address": s.customer_address,
                "appliance_name": s.appliance_name,
                "issue": s.issue,
                "priority": s.priority,
                "status": s.status,
                "status_badge": s.status_badge,
                "appointment_date": s.appointment_date,
                "appointment_slot": s.appointment_slot,
                "technician_id": s.technician_id,
                "technician_name": tech_map.get(s.technician_id, "Unassigned"),
                "pincode": s.pincode,
            }
            for s in services
        ]
    }


@router.get("/directory/{role}")
def list_directory(role: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    if role not in {"branch", "technician", "customer"}:
        raise HTTPException(status_code=404, detail="Directory not found")

    if role == "branch":
        branches = db.query(CompanyBranchModel).order_by(CompanyBranchModel.branch_name).all()
        companies_by_id = {u.id: u for u in db.query(UserModel).filter(UserModel.role == "company").all()}
        branch_users_by_id = {u.id: u for u in db.query(UserModel).filter(UserModel.role == "branch").all()}
        branch_users_by_email = {u.email.lower(): u for u in db.query(UserModel).filter(UserModel.role == "branch").all()}

        result = []
        for b in branches:
            company = companies_by_id.get(b.company_id)
            b_user = branch_users_by_id.get(b.id) or branch_users_by_email.get(b.email.lower())
            
            branch_ids = [b.id]
            if b_user and b_user.id != b.id:
                branch_ids.append(b_user.id)

            tech_links = db.query(BranchTechnicianModel).filter(BranchTechnicianModel.branch_id.in_(branch_ids)).all()
            linked_tech_ids = [tl.technician_id for tl in tech_links]
            named_tech_ids = [
                t.id for t in db.query(TechnicianModel).filter(
                    TechnicianModel.company_branch.ilike(b.branch_name.strip())
                ).all()
            ] if b.branch_name else []
            assigned_tech_ids = list(set(linked_tech_ids + named_tech_ids))
            tech_count = len(assigned_tech_ids)

            job_filters = [ServiceRequestModel.branch_id.in_(branch_ids)]
            if assigned_tech_ids:
                job_filters.append(ServiceRequestModel.technician_id.in_(assigned_tech_ids))
            if b.pincode and len(b.pincode.strip()) == 6:
                job_filters.append(ServiceRequestModel.pincode == b.pincode.strip())

            jobs_query = db.query(ServiceRequestModel).filter(or_(*job_filters))
            jobs_count = jobs_query.count()
            ongoing_jobs = jobs_query.filter(ServiceRequestModel.status_badge != "Completed").count()

            result.append({
                "id": b.id,
                "name": b.branch_name,
                "branch_name": b.branch_name,
                "manager_name": b.manager_name,
                "company_id": b.company_id,
                "company_name": company.name if company else "ServSure Network",
                "email": b.email,
                "phone": b.mobile,
                "mobile": b.mobile,
                "address": b.address,
                "pincode": b.pincode,
                "is_active": b_user.is_active if b_user else True,
                "total_techs": tech_count,
                "total_jobs": jobs_count,
                "ongoing_jobs": ongoing_jobs,
                "role": "branch",
                "avatar": b.branch_name[:2].upper()
            })
        return result

    elif role == "technician":
        techs = db.query(TechnicianModel).order_by(TechnicianModel.name).all()
        bt_links = {l.technician_id: l for l in db.query(BranchTechnicianModel).all()}
        branches_by_id = {b.id: b for b in db.query(CompanyBranchModel).all()}
        companies_by_id = {u.id: u for u in db.query(UserModel).filter(UserModel.role == "company").all()}
        tech_users_by_id = {u.id: u for u in db.query(UserModel).filter(UserModel.role == "technician").all()}
        tech_users_by_phone = {u.phone: u for u in db.query(UserModel).filter(UserModel.role == "technician").all()}

        result = []
        for t in techs:
            link = bt_links.get(t.id)
            branch = branches_by_id.get(link.branch_id) if link else None
            company = companies_by_id.get(branch.company_id) if branch else None
            t_user = tech_users_by_id.get(t.id) or tech_users_by_phone.get(t.phone)

            completed_jobs = db.query(ServiceRequestModel).filter(
                ServiceRequestModel.technician_id == t.id,
                ServiceRequestModel.status_badge == "Completed"
            ).count()
            active_jobs = db.query(ServiceRequestModel).filter(
                ServiceRequestModel.technician_id == t.id,
                ServiceRequestModel.status_badge != "Completed"
            ).count()
            total_jobs = completed_jobs + active_jobs
            if total_jobs == 0 and t.total_jobs:
                total_jobs = t.total_jobs

            result.append({
                "id": t.id,
                "name": t.name,
                "title": t.title or "Field Service Engineer",
                "phone": t.phone,
                "email": t_user.email if t_user else f"{t.name.lower().replace(' ', '.')}@servsure.com",
                "rating": round(t.rating or 5.0, 1),
                "total_jobs": total_jobs,
                "completed_jobs": completed_jobs,
                "active_jobs": active_jobs,
                "branch_id": branch.id if branch else None,
                "branch_name": branch.branch_name if branch else (t.company_branch or "Main Service Center"),
                "company_id": company.id if company else None,
                "company_name": company.name if company else "ServSure Certified Partner",
                "address": (link.address if link else None) or (branch.address if branch else "Field Service Territory"),
                "pincode": (link.pincode if link else None) or (branch.pincode if branch else ""),
                "is_active": t_user.is_active if t_user else True,
                "is_verified": t.is_verified,
                "role": "technician",
                "avatar": t.avatar or t.name[:2].upper()
            })
        return result

    elif role == "customer":
        customers = db.query(UserModel).filter(UserModel.role == "customer").order_by(UserModel.name).all()
        result = []
        for c in customers:
            appliances_cnt = db.query(ApplianceModel).filter(ApplianceModel.user_id == c.id).count()
            total_reqs = db.query(ServiceRequestModel).filter(ServiceRequestModel.customer_id == c.id).count()
            ongoing_reqs = db.query(ServiceRequestModel).filter(
                ServiceRequestModel.customer_id == c.id,
                ServiceRequestModel.status_badge != "Completed"
            ).count()
            completed_reqs = db.query(ServiceRequestModel).filter(
                ServiceRequestModel.customer_id == c.id,
                ServiceRequestModel.status_badge == "Completed"
            ).count()

            result.append({
                "id": c.id,
                "name": c.name,
                "email": c.email,
                "phone": c.phone,
                "address": c.address or "Address not provided",
                "appliances_count": appliances_cnt,
                "total_requests": total_reqs,
                "ongoing_requests": ongoing_reqs,
                "completed_requests": completed_reqs,
                "is_active": c.is_active,
                "role": "customer",
                "avatar": c.name[:2].upper()
            })
        return result


@router.get("/customers/{customer_id}")
def get_admin_customer_details(customer_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    customer = db.query(UserModel).filter(UserModel.id == customer_id, UserModel.role == "customer").first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    appliances = db.query(ApplianceModel).filter(ApplianceModel.user_id == customer.id).order_by(ApplianceModel.registered_on.desc()).all()
    companies_by_id = {u.id: u for u in db.query(UserModel).filter(UserModel.role == "company").all()}

    products_list = []
    for a in appliances:
        comp = companies_by_id.get(a.company_id)
        is_w_active = (a.warranty_status or "").lower() == "active"
        products_list.append({
            "id": a.id,
            "category": a.category,
            "brand": a.brand,
            "company_id": a.company_id,
            "company_name": comp.name if comp else a.brand,
            "model_no": a.model_no,
            "serial_no": a.serial_no or "Not registered",
            "registered_on": a.registered_on,
            "warranty_status": a.warranty_status or "Active",
            "warranty_start_date": a.warranty_start_date or a.registered_on,
            "warranty_end_date": a.warranty_end_date or "Standard 1-Year",
            "is_under_warranty": is_w_active,
            "amc_active": bool(a.amc_active),
            "amc_plan_name": a.amc_plan_name or "None",
            "amc_end_date": a.amc_end_date or "—"
        })

    reqs = db.query(ServiceRequestModel).filter(
        ServiceRequestModel.customer_id == customer.id
    ).order_by(ServiceRequestModel.created_at.desc()).all()

    techs_by_id = {t.id: t for t in db.query(TechnicianModel).all()}
    branches_by_id = {b.id: b for b in db.query(CompanyBranchModel).all()}

    ongoing = []
    completed = []
    for r in reqs:
        t = techs_by_id.get(r.technician_id)
        b = branches_by_id.get(r.branch_id)
        comp = companies_by_id.get(r.company_id)
        jc = db.query(JobCardModel).filter(JobCardModel.request_id == r.id).first()
        item = {
            "id": r.id,
            "appliance_id": r.appliance_id,
            "appliance_name": r.appliance_name,
            "brand": r.brand,
            "model_no": r.model_no,
            "issue": r.issue,
            "status": r.status,
            "status_badge": r.status_badge,
            "priority": r.priority,
            "appointment_date": r.appointment_date,
            "appointment_slot": r.appointment_slot,
            "technician_id": r.technician_id,
            "technician_name": t.name if t else "Unassigned",
            "branch_id": r.branch_id,
            "branch_name": b.branch_name if b else "Authorized Hub",
            "company_id": r.company_id,
            "company_name": comp.name if comp else r.brand,
            "created_at": r.created_at,
            "payment_status": r.payment_status or "Pending",
            "total_amount": jc.total_amount if jc else 0.0
        }
        if r.status == "Completed" or r.status_badge == "Completed":
            completed.append(item)
        else:
            ongoing.append(item)

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "email": customer.email,
            "phone": customer.phone,
            "address": customer.address or "Address not provided",
            "avatar": customer.name[:2].upper(),
            "is_active": customer.is_active,
            "appliances_count": len(products_list),
            "total_requests": len(reqs),
            "ongoing_requests": len(ongoing),
            "completed_requests": len(completed)
        },
        "stats": {
            "total_products": len(products_list),
            "active_warranties": sum(1 for p in products_list if p.get("is_under_warranty")),
            "ongoing_services": len(ongoing),
            "completed_services": len(completed)
        },
        "products": products_list,
        "appliances": products_list,
        "ongoing_services": ongoing,
        "completed_services": completed,
        "requests": ongoing + completed
    }


@router.get("/technicians/{technician_id}")
def get_admin_technician_details(technician_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    t = db.query(TechnicianModel).filter(TechnicianModel.id == technician_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Technician not found")

    link = db.query(BranchTechnicianModel).filter(BranchTechnicianModel.technician_id == t.id).first()
    branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == link.branch_id).first() if link else None
    company = db.query(UserModel).filter(UserModel.id == branch.company_id).first() if branch else None
    t_user = db.query(UserModel).filter(or_(UserModel.id == t.id, UserModel.phone == t.phone)).first()

    reqs = db.query(ServiceRequestModel).filter(
        ServiceRequestModel.technician_id == t.id
    ).order_by(ServiceRequestModel.created_at.desc()).all()

    assigned_services = []
    for r in reqs:
        assigned_services.append({
            "id": r.id,
            "customer_name": r.customer_name,
            "customer_phone": r.customer_phone,
            "appliance_name": r.appliance_name,
            "brand": r.brand,
            "issue": r.issue,
            "status": r.status,
            "status_badge": r.status_badge,
            "appointment_date": r.appointment_date,
            "appointment_slot": r.appointment_slot
        })

    return {
        "technician": {
            "id": t.id,
            "name": t.name,
            "title": t.title or "Field Service Engineer",
            "phone": t.phone,
            "email": t_user.email if t_user else f"{t.name.lower().replace(' ', '.')}@servsure.com",
            "rating": round(t.rating or 5.0, 1),
            "total_jobs": len(reqs) if len(reqs) > 0 else (t.total_jobs or 0),
            "branch_id": branch.id if branch else None,
            "branch_name": branch.branch_name if branch else (t.company_branch or "Main Service Center"),
            "branch_address": branch.address if branch else "—",
            "manager_name": branch.manager_name if branch else "—",
            "company_id": company.id if company else None,
            "company_name": company.name if company else "ServSure Certified Partner",
            "address": (link.address if link else None) or (branch.address if branch else "Field Service Territory"),
            "pincode": (link.pincode if link else None) or (branch.pincode if branch else ""),
            "is_active": t_user.is_active if t_user else True,
            "is_verified": t.is_verified,
            "avatar": t.avatar or t.name[:2].upper()
        },
        "services": assigned_services
    }


@router.get("/branches/{branch_id}")
def get_admin_branch_details(branch_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    from app.routes.company import get_company_branch_details
    return get_company_branch_details(branch_id, request, db)


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
        raise HTTPException(status_code=400, detail="This password setup link is invalid or expired. Ask ServSure to send a new one.")
    company = db.query(UserModel).filter_by(id=onboarding.company_id, role="company").first()
    if not company or not hmac.compare_digest(company.email.lower(), email.strip().lower()):
        raise HTTPException(status_code=400, detail="Enter the email address registered with ServSure")
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
            company.email, company.name, "Your ServSure verification code",
            f"Your ServSure verification code is {otp}. It expires in 10 minutes. If you did not request this, ignore this email.",
            f"<p>Your ServSure verification code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{otp}</p><p>This code expires in 10 minutes.</p>",
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
    frontend_url = os.getenv("FRONTEND_BASE_URL", "https://servora-frontend-xi.vercel.app").rstrip("/")
    portal_url = f"{frontend_url}/company-login.html"
    confirmation_email_sent = False
    safe_name = html.escape(company.name)
    safe_url = html.escape(portal_url, quote=True)
    try:
        send_brevo_email(
            company.email, company.name, "Your ServSure company password is set",
            f"Hello {company.name},\n\nYour ServSure company admin password has been set successfully. You can now access your company portal using your registered email and password:\n{portal_url}\n\nIf you did not make this change, please contact ServSure support.",
            f"<p>Hello {safe_name},</p><p>Your ServSure company admin password has been set successfully. You can now access your company portal using your registered email and password.</p><p><a href=\"{safe_url}\">Open the ServSure company portal</a></p><p>If you did not make this change, please contact ServSure support.</p>",
        )
        confirmation_email_sent = True
    except Exception:
        # Password setup is already committed; report email delivery separately
        # so the company is not incorrectly prompted to repeat OTP verification.
        pass
    return {
        "status": "password_set", "email": company.email,
        "password_set_at": onboarding.password_set_at.isoformat(),
        "confirmation_email_sent": confirmation_email_sent,
        "portal_login_url": portal_url,
    }
