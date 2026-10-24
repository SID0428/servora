import json
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.db.models import (
    UserModel, WarrantyClaimModel, AMCPlanModel, AMCSubscriptionModel,
    ApplianceModel, ServiceRequestModel, CompanyBranchModel
)
from app.schemas import (
    WarrantyClaimSchema, WarrantyClaimVerifyPayload,
    WarrantyRegistrationItem, WarrantyRegistrationVerifyPayload,
    AMCPlanSchema, AMCSubscriptionCreatePayload, AMCSubscriptionSchema,
    JobCardPartItem
)
from app.security import get_authenticated_user

router = APIRouter(prefix="/api/warranty-amc", tags=["warranty-amc"])

# ==========================================
# 1. WARRANTY CLAIMS (OEM Billing)
# ==========================================

@router.get("/claims", response_model=List[WarrantyClaimSchema])
def list_warranty_claims(
    request: Request,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    query = db.query(WarrantyClaimModel)

    if user.role == "company":
        query = query.filter(
            or_(
                WarrantyClaimModel.company_id == user.id,
                WarrantyClaimModel.company_id == user.email,
                WarrantyClaimModel.company_id == user.name
            )
        )
    elif user.role in ("branch", "franchise"):
        query = query.filter(WarrantyClaimModel.branch_id == user.id)
    elif user.role != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized to access warranty claims")

    if status and status.lower() != "all":
        query = query.filter(WarrantyClaimModel.status.ilike(status))

    claims = query.order_by(WarrantyClaimModel.submitted_at.desc()).all()
    results = []
    for c in claims:
        # Load related branch and company names
        comp = db.query(UserModel).filter(UserModel.id == c.company_id).first()
        branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == c.branch_id).first()
        appliance = db.query(ApplianceModel).filter(ApplianceModel.id == c.appliance_id).first()

        parts = []
        if c.parts_claimed_json:
            try:
                raw_parts = json.loads(c.parts_claimed_json)
                parts = [JobCardPartItem(**p) for p in raw_parts]
            except Exception:
                pass

        results.append(
            WarrantyClaimSchema(
                id=c.id,
                request_id=c.request_id,
                company_id=c.company_id,
                company_name=comp.name if comp else "OEM Partner",
                branch_id=c.branch_id,
                branch_name=branch.branch_name if branch else "Franchise Branch",
                appliance_id=c.appliance_id,
                appliance_name=f"{appliance.brand} {appliance.category}" if appliance else "Appliance",
                brand=appliance.brand if appliance else None,
                claim_amount=c.claim_amount,
                parts_claimed=parts,
                status=c.status,
                claim_notes=c.claim_notes,
                submitted_at=c.submitted_at,
                settled_at=c.settled_at
            )
        )
    return results

@router.post("/claims/{claim_id}/verify")
def verify_warranty_claim(
    claim_id: str,
    payload: WarrantyClaimVerifyPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only brand/company managers can verify warranty reimbursement claims")

    claim = db.query(WarrantyClaimModel).filter(WarrantyClaimModel.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Warranty claim not found")

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    if payload.action == "approve":
        claim.status = "Approved"
        claim.settled_at = now_str
        claim.claim_notes = (claim.claim_notes or "") + f" [Approved by {user.name} on {now_str}. {payload.notes or ''}]".strip()
    elif payload.action == "reject":
        claim.status = "Rejected"
        claim.settled_at = now_str
        claim.claim_notes = (claim.claim_notes or "") + f" [Rejected by {user.name} on {now_str}. Reason: {payload.notes or 'Policy discrepancy'}]".strip()

    db.commit()
    db.refresh(claim)
    return {
        "status": "success",
        "claim_id": claim.id,
        "new_status": claim.status,
        "settled_at": claim.settled_at,
        "notes": claim.claim_notes
    }

# ==========================================
# 1B. WARRANTY REGISTRATIONS (OEM Product Registration Audit)
# ==========================================

@router.get("/registrations", response_model=List[WarrantyRegistrationItem])
def list_warranty_registrations(
    request: Request,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Unauthorized to view warranty registrations")

    query = db.query(ApplianceModel)
    if user.role == "company":
        query = query.filter(
            or_(
                ApplianceModel.company_id == user.id,
                ApplianceModel.brand.ilike(user.name.strip())
            )
        )

    if status and status.lower() != "all":
        query = query.filter(ApplianceModel.warranty_status.ilike(f"%{status}%"))

    appliances = query.all()
    results = []
    for app in appliances:
        customer = db.query(UserModel).filter(UserModel.id == app.user_id).first()
        company = db.query(UserModel).filter(UserModel.id == app.company_id).first()
        results.append(
            WarrantyRegistrationItem(
                id=app.id,
                appliance_id=app.id,
                user_id=app.user_id,
                customer_name=customer.name if customer else "Customer",
                customer_phone=customer.phone if customer else None,
                customer_email=customer.email if customer else None,
                company_id=app.company_id or (company.id if company else ""),
                company_name=company.name if company else (app.brand or "OEM Brand"),
                brand=app.brand,
                category=app.category,
                model_no=app.model_no,
                serial_no=app.serial_no,
                registered_on=app.registered_on,
                purchase_date=getattr(app, "purchase_date", None),
                warranty_months=getattr(app, "warranty_months", 12) or 12,
                warranty_status=app.warranty_status,
                warranty_start_date=app.warranty_start_date,
                warranty_end_date=app.warranty_end_date,
                warranty_rejection_reason=getattr(app, "warranty_rejection_reason", None),
                invoice_url=app.invoice_url,
                verified_at=app.verified_at.strftime("%d %b %Y, %I:%M %p") if getattr(app, "verified_at", None) else None,
                verified_by=getattr(app, "verified_by", None)
            )
        )
    return results

@router.post("/registrations/{appliance_id}/verify")
def verify_warranty_registration(
    appliance_id: str,
    payload: WarrantyRegistrationVerifyPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only brand/company managers can verify warranty registrations")

    app = db.query(ApplianceModel).filter(ApplianceModel.id == appliance_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Appliance not found")

    if user.role == "company" and app.company_id != user.id and (app.brand and app.brand.lower() != user.name.lower()):
        raise HTTPException(status_code=403, detail="Not authorized to verify warranties for another brand")

    now = datetime.utcnow()
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")

    if payload.action == "approve":
        app.warranty_status = "Active"
        app.warranty_rejection_reason = None
        app.verified_at = now
        app.verified_by = user.id

        if payload.warranty_months and payload.warranty_months > 0:
            app.warranty_months = payload.warranty_months

        # Recalculate end date based on purchase_date or approval date
        base_date = None
        if app.purchase_date:
            for fmt in ("%Y-%m-%d", "%d %b %Y", "%d/%m/%Y", "%Y/%m/%d"):
                try:
                    base_date = datetime.strptime(app.purchase_date.strip(), fmt)
                    break
                except Exception:
                    pass
        if not base_date:
            base_date = datetime.now()
            app.purchase_date = base_date.strftime("%Y-%m-%d")

        w_months = app.warranty_months or 12
        app.warranty_start_date = base_date.strftime("%d %b %Y")
        app.warranty_end_date = (base_date + timedelta(days=w_months * 30)).strftime("%d %b %Y")

    elif payload.action == "reject":
        app.warranty_status = "Rejected"
        app.warranty_rejection_reason = payload.rejection_reason or payload.notes or "Invoice verification failed (illegible document or mismatched serial/model)"
        app.verified_at = now
        app.verified_by = user.id

    db.commit()
    db.refresh(app)

    return {
        "status": "success",
        "appliance_id": app.id,
        "warranty_status": app.warranty_status,
        "warranty_start_date": app.warranty_start_date,
        "warranty_end_date": app.warranty_end_date,
        "warranty_months": app.warranty_months,
        "rejection_reason": app.warranty_rejection_reason,
        "warranty_rejection_reason": app.warranty_rejection_reason,
        "verified_at": now_str,
        "verified_by": user.name
    }

# ==========================================
# 2. AMC PACKAGES & SUBSCRIPTIONS
# ==========================================

@router.get("/amc/plans", response_model=List[AMCPlanSchema])
def get_amc_plans(db: Session = Depends(get_db)):
    plans = db.query(AMCPlanModel).all()
    return [
        AMCPlanSchema(
            id=p.id,
            name=p.name,
            category=p.category,
            duration_months=p.duration_months,
            price=p.price,
            free_services=p.free_services,
            discount_parts_pct=p.discount_parts_pct,
            zero_labor=p.zero_labor,
            description=p.description
        )
        for p in plans
    ]

@router.post("/amc/subscribe", response_model=AMCSubscriptionSchema)
def subscribe_amc_plan(
    payload: AMCSubscriptionCreatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    appliance = db.query(ApplianceModel).filter(
        ApplianceModel.id == payload.appliance_id,
        ApplianceModel.user_id == user.id
    ).first()
    if not appliance:
        raise HTTPException(status_code=404, detail="Appliance not found in your account")

    plan = db.query(AMCPlanModel).filter(AMCPlanModel.id == payload.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Selected AMC plan does not exist")

    now = datetime.now()
    start_str = now.strftime("%d %b %Y")
    end_date = now + timedelta(days=plan.duration_months * 30)
    end_str = end_date.strftime("%d %b %Y")

    sub = AMCSubscriptionModel(
        id=f"SUB-AMC-{uuid.uuid4().hex[:8].upper()}",
        customer_id=user.id,
        appliance_id=appliance.id,
        plan_id=plan.id,
        plan_name=plan.name,
        start_date=start_str,
        end_date=end_str,
        status="Active",
        services_included=plan.free_services,
        services_used=0,
        amount_paid=plan.price,
        created_at=now.strftime("%d %b %Y, %I:%M %p")
    )
    db.add(sub)

    # Update appliance AMC state
    appliance.amc_active = True
    appliance.amc_plan_name = plan.name
    appliance.amc_end_date = end_str
    appliance.warranty_status = f"AMC Active ({plan.name})"

    db.commit()
    db.refresh(sub)

    return AMCSubscriptionSchema(
        id=sub.id,
        customer_id=sub.customer_id,
        appliance_id=sub.appliance_id,
        appliance_name=f"{appliance.brand} {appliance.category} ({appliance.model_no})",
        brand=appliance.brand,
        plan_id=sub.plan_id,
        plan_name=sub.plan_name,
        start_date=sub.start_date,
        end_date=sub.end_date,
        status=sub.status,
        services_included=sub.services_included,
        services_used=sub.services_used,
        amount_paid=sub.amount_paid,
        created_at=sub.created_at
    )

@router.get("/amc/my-subscriptions", response_model=List[AMCSubscriptionSchema])
def get_customer_amc_subscriptions(
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    subs = db.query(AMCSubscriptionModel).filter(
        AMCSubscriptionModel.customer_id == user.id
    ).order_by(AMCSubscriptionModel.created_at.desc()).all()

    results = []
    for s in subs:
        appliance = db.query(ApplianceModel).filter(ApplianceModel.id == s.appliance_id).first()
        results.append(
            AMCSubscriptionSchema(
                id=s.id,
                customer_id=s.customer_id,
                appliance_id=s.appliance_id,
                appliance_name=f"{appliance.brand} {appliance.category} ({appliance.model_no})" if appliance else "Appliance",
                brand=appliance.brand if appliance else None,
                plan_id=s.plan_id,
                plan_name=s.plan_name,
                start_date=s.start_date,
                end_date=s.end_date,
                status=s.status,
                services_included=s.services_included,
                services_used=s.services_used,
                amount_paid=s.amount_paid,
                created_at=s.created_at
            )
        )
    return results
