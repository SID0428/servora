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
    ApplianceModel, BranchOnboardingModel, CompanyBranchModel, UserModel,
    BranchTechnicianModel, TechnicianModel, FranchiseInventoryModel,
    SparePartModel, InventoryTransactionModel, ServiceRequestModel, WarrantyClaimModel,
    JobCardModel
)
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


@router.get("/branches/{branch_id}")
def get_company_branch_details(
    branch_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Company or admin access required")

    branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    if user.role == "company" and branch.company_id != user.id:
        if branch.company_id not in (user.email, user.name):
            comp_user = db.query(UserModel).filter(UserModel.id == branch.company_id).first()
            if not comp_user or (comp_user.email != user.email and comp_user.name != user.name):
                raise HTTPException(status_code=403, detail="Branch does not belong to your company network")

    onboarding = db.query(BranchOnboardingModel).filter_by(branch_id=branch.id).first()
    base_info = branch_payload(branch, onboarding)
    base_info["name"] = branch.branch_name
    base_info["status"] = "Active" if (onboarding and onboarding.password_set_at) else "Pending Setup"
    base_info["avatar"] = branch.branch_name[:2].upper()

    # 1. PEOPLE & STAFF (Manager + Technicians)
    manager_info = {
        "id": branch.id,
        "name": branch.manager_name,
        "designation": "Branch Manager & Operations Lead",
        "department": "Franchise Leadership",
        "email": branch.email,
        "phone": branch.mobile,
        "address": branch.address,
        "pincode": branch.pincode,
        "role": "manager",
        "rating": 5.0,
        "total_jobs": db.query(ServiceRequestModel).filter(ServiceRequestModel.branch_id == branch.id).count(),
        "status": "Active" if (onboarding and onboarding.password_set_at) else "Pending Setup",
        "avatar": branch.manager_name[:2].upper()
    }
    people = [manager_info]

    tech_links = db.query(BranchTechnicianModel).filter(BranchTechnicianModel.branch_id == branch.id).all()
    tech_ids = [l.technician_id for l in tech_links]

    tech_query = db.query(TechnicianModel).filter(
        or_(
            TechnicianModel.id.in_(tech_ids),
            TechnicianModel.company_branch.ilike(f"%{branch.branch_name}%"),
            TechnicianModel.company_branch == branch.id
        )
    )
    technicians = tech_query.all()

    for t in technicians:
        t_user = db.query(UserModel).filter(
            or_(UserModel.id == t.id, UserModel.phone == t.phone)
        ).first()
        t_email = t_user.email if t_user else f"{t.name.lower().replace(' ', '.')}@servora.com"

        completed_jobs = db.query(ServiceRequestModel).filter(
            ServiceRequestModel.technician_id == t.id,
            ServiceRequestModel.status == "Completed"
        ).count()

        people.append({
            "id": t.id,
            "name": t.name,
            "designation": t.title or "Field Service Engineer",
            "department": "Field Service Operations",
            "email": t_email,
            "phone": t.phone,
            "address": getattr(t, "address", branch.address),
            "pincode": getattr(t, "pincode", branch.pincode),
            "role": "technician",
            "rating": round(t.rating or 4.9, 1),
            "total_jobs": completed_jobs if completed_jobs > 0 else (t.total_jobs or 0),
            "status": "Active / Field Ready",
            "avatar": t.avatar or t.name[:2].upper()
        })

    # 2. TOTAL STOCK ITEMS (Warehouse Inventory)
    inv_items = db.query(FranchiseInventoryModel, SparePartModel).join(
        SparePartModel, FranchiseInventoryModel.part_id == SparePartModel.id
    ).filter(FranchiseInventoryModel.branch_id == branch.id).all()

    # If empty warehouse, seed initial catalog parts
    if not inv_items:
        all_parts = db.query(SparePartModel).all()
        for p in all_parts:
            inv = FranchiseInventoryModel(
                id=f"inv_{branch.id[:6]}_{p.id[:6]}",
                branch_id=branch.id,
                part_id=p.id,
                quantity_available=12,
                reorder_level=4
            )
            db.add(inv)
        db.commit()
        inv_items = db.query(FranchiseInventoryModel, SparePartModel).join(
            SparePartModel, FranchiseInventoryModel.part_id == SparePartModel.id
        ).filter(FranchiseInventoryModel.branch_id == branch.id).all()

    stock_list = []
    total_stock_qty = 0
    total_stock_val = 0.0
    low_stock_count = 0

    for inv, part in inv_items:
        is_low = inv.quantity_available <= inv.reorder_level
        if is_low:
            low_stock_count += 1
        total_stock_qty += inv.quantity_available
        total_stock_val += round(inv.quantity_available * (part.unit_price or 0.0), 2)

        stock_list.append({
            "part_id": part.id,
            "part_code": part.part_code,
            "name": part.name,
            "brand": part.brand,
            "category": part.category,
            "hsn_code": part.hsn_code or "841890",
            "unit_price": part.unit_price or 0.0,
            "quantity_available": inv.quantity_available,
            "reorder_level": inv.reorder_level,
            "is_low_stock": is_low,
            "last_restocked_at": inv.last_restocked_at.strftime("%d %b %Y, %I:%M %p") if inv.last_restocked_at else "Initial Setup"
        })

    # 3. STOCK MOVEMENTS (Sent & Received Logistics History)
    txns = db.query(InventoryTransactionModel, SparePartModel).join(
        SparePartModel, InventoryTransactionModel.part_id == SparePartModel.id
    ).filter(InventoryTransactionModel.branch_id == branch.id).order_by(
        InventoryTransactionModel.created_at.desc()
    ).all()

    stock_movements = []
    for txn, part in txns:
        is_in = txn.transaction_type.lower() in ("stock_in", "restock")
        stock_movements.append({
            "id": txn.id,
            "timestamp": txn.created_at.strftime("%d %b %Y, %I:%M %p"),
            "transaction_type": txn.transaction_type,
            "movement_type": "STOCK_IN" if is_in else "STOCK_OUT",
            "quantity": txn.quantity,
            "part_id": part.id,
            "part_name": part.name,
            "part_code": part.part_code,
            "unit_price": part.unit_price or 0.0,
            "reference_id": txn.reference_id or "—",
            "performed_by": txn.performed_by or "System",
            "notes": txn.notes or ""
        })

    # 4. SERVICE REQUESTS & HISTORY (Ongoing & Completed)
    reqs = db.query(ServiceRequestModel).filter(
        ServiceRequestModel.branch_id == branch.id
    ).order_by(ServiceRequestModel.created_at.desc()).all()

    ongoing_services = []
    completed_services = []
    for r in reqs:
        tech_name = r.previous_technician_name or "Unassigned"
        if r.technician_id:
            tech_obj = db.query(TechnicianModel).filter(TechnicianModel.id == r.technician_id).first()
            if tech_obj:
                tech_name = tech_obj.name

        service_item = {
            "id": r.id,
            "customer_name": r.customer_name or "Customer",
            "customer_phone": r.customer_phone or "",
            "customer_address": r.customer_address or "",
            "pincode": r.pincode or branch.pincode,
            "appliance_name": r.appliance_name or "Appliance",
            "brand": r.brand or "",
            "model_no": r.model_no or "Standard",
            "issue": r.issue or "Service Request",
            "status": r.status or "In Progress",
            "status_badge": r.status_badge or "In Progress",
            "appointment_date": r.appointment_date or "Scheduled",
            "appointment_slot": r.appointment_slot or "Standard",
            "technician_id": r.technician_id,
            "technician_name": tech_name,
            "payment_status": r.payment_status or "Pending",
            "is_under_warranty": bool(r.is_under_warranty),
            "created_at": r.created_at or ""
        }

        if r.status == "Completed" or r.status_badge == "Completed":
            completed_services.append(service_item)
        else:
            ongoing_services.append(service_item)

    # 5. WARRANTY CLAIMS
    claims = db.query(WarrantyClaimModel).filter(WarrantyClaimModel.branch_id == branch.id).all()
    total_claim_amt = sum(c.claim_amount or 0.0 for c in claims)

    return {
        "branch": base_info,
        "stats": {
            "total_people": len(people),
            "total_technicians": len(technicians),
            "total_stock_items": len(stock_list),
            "total_stock_quantity": total_stock_qty,
            "total_stock_value": round(total_stock_val, 2),
            "low_stock_count": low_stock_count,
            "total_services": len(reqs),
            "ongoing_services": len(ongoing_services),
            "completed_services": len(completed_services),
            "warranty_claims_count": len(claims),
            "total_claim_amount": round(total_claim_amt, 2)
        },
        "people": people,
        "inventory": stock_list,
        "stock_movements": stock_movements,
        "ongoing_services": ongoing_services,
        "completed_services": completed_services
    }


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

    customers_map = {}
    for appliance, customer in rows:
        if customer.id not in customers_map:
            addr = customer.address or "Address not provided"
            addr_parts = [p.strip() for p in addr.split(",") if p.strip()]
            short_loc = addr_parts[-2] if len(addr_parts) >= 2 else (addr_parts[0] if addr_parts else "Location")

            customers_map[customer.id] = {
                "customer_id": customer.id,
                "customer_name": customer.name,
                "customer_email": customer.email,
                "customer_phone": customer.phone,
                "customer_address": addr,
                "short_location": short_loc,
                "avatar": customer.name[:2].upper(),
                "products": [],
                "active_warranties_count": 0,
                "ongoing_services_count": 0,
                "completed_services_count": 0,
                "total_services_count": 0,
            }

        is_w_active = (appliance.warranty_status or "").lower() == "active"
        if is_w_active:
            customers_map[customer.id]["active_warranties_count"] += 1

        customers_map[customer.id]["products"].append({
            "appliance_id": appliance.id,
            "category": appliance.category,
            "brand": appliance.brand,
            "model_no": appliance.model_no,
            "serial_no": appliance.serial_no or "Not provided",
            "warranty_status": appliance.warranty_status or "Active",
            "warranty_start_date": appliance.warranty_start_date or appliance.registered_on,
            "warranty_end_date": appliance.warranty_end_date or "",
            "is_under_warranty": is_w_active,
            "amc_active": bool(appliance.amc_active),
            "amc_plan_name": appliance.amc_plan_name or "",
            "amc_end_date": appliance.amc_end_date or "",
            "registered_on": appliance.registered_on,
        })

    customers_list = []
    for cust_id, cust_data in customers_map.items():
        reqs = db.query(ServiceRequestModel).filter(
            ServiceRequestModel.customer_id == cust_id,
            or_(
                ServiceRequestModel.company_id == company.id,
                ServiceRequestModel.brand.ilike(company.name.strip())
            )
        ).all()
        ongoing_cnt = sum(1 for r in reqs if r.status != "Completed" and r.status_badge != "Completed")
        completed_cnt = sum(1 for r in reqs if r.status == "Completed" or r.status_badge == "Completed")
        cust_data["ongoing_services_count"] = ongoing_cnt
        cust_data["completed_services_count"] = completed_cnt
        cust_data["total_services_count"] = len(reqs)
        cust_data["total_products_count"] = len(cust_data["products"])

        p_names = [f"{p['brand']} {p['category']}" for p in cust_data["products"]]
        cust_data["products_summary"] = ", ".join(p_names[:2]) + ("..." if len(p_names) > 2 else "")
        cust_data["warranty_summary"] = f"Active ({cust_data['active_warranties_count']})" if cust_data["active_warranties_count"] > 0 else "Expired"
        cust_data["registered_on"] = cust_data["products"][0]["registered_on"] if cust_data["products"] else "—"

        cust_data["brand"] = cust_data["products"][0]["brand"] if cust_data["products"] else company.name
        cust_data["category"] = cust_data["products"][0]["category"] if cust_data["products"] else "Appliances"
        cust_data["model_no"] = cust_data["products"][0]["model_no"] if cust_data["products"] else "—"
        cust_data["serial_no"] = cust_data["products"][0]["serial_no"] if cust_data["products"] else "—"
        cust_data["warranty_status"] = cust_data["warranty_summary"]

        customers_list.append(cust_data)

    return customers_list


@router.get("/customers/{customer_id}")
def get_company_customer_details(customer_id: str, request: Request, db: Session = Depends(get_db)):
    company = require_company(request, db)
    customer = db.query(UserModel).filter(UserModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer record not found")

    appliances = db.query(ApplianceModel).filter(
        ApplianceModel.user_id == customer.id,
        or_(
            ApplianceModel.company_id == company.id,
            ApplianceModel.brand.ilike(company.name.strip())
        )
    ).order_by(ApplianceModel.registered_on.desc()).all()

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
            "amc_end_date": a.amc_end_date or "—"
        })

    reqs = db.query(ServiceRequestModel).filter(
        ServiceRequestModel.customer_id == customer.id,
        or_(
            ServiceRequestModel.company_id == company.id,
            ServiceRequestModel.brand.ilike(company.name.strip())
        )
    ).order_by(ServiceRequestModel.created_at.desc()).all()

    ongoing = []
    completed = []
    for r in reqs:
        tech_name = "Unassigned"
        if r.technician_id:
            t = db.query(TechnicianModel).filter(TechnicianModel.id == r.technician_id).first()
            if t:
                tech_name = t.name
        branch_name = "Authorized Service Hub"
        if r.branch_id:
            b = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == r.branch_id).first()
            if b:
                branch_name = b.branch_name

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
            "is_under_warranty": bool(r.is_under_warranty)
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
            "avatar": customer.name[:2].upper()
        },
        "stats": {
            "total_products": len(products_list),
            "active_warranties": active_warranties,
            "ongoing_services": len(ongoing),
            "completed_services": len(completed),
            "total_services": len(reqs)
        },
        "products": products_list,
        "ongoing_services": ongoing,
        "completed_services": completed
    }


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
