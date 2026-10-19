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
