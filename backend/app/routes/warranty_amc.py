import json
import re
import uuid
from datetime import datetime, timedelta, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.db.models import (
    UserModel, WarrantyClaimModel, AMCPlanModel, AMCSubscriptionModel,
    ApplianceModel, ServiceRequestModel, CompanyBranchModel, CompanyWarrantyPolicyModel,
    SparePartModel, CompanyApplianceCatalogModel, JobCardModel
)
from app.schemas import (
    WarrantyClaimSchema, WarrantyClaimVerifyPayload,
    WarrantyRegistrationItem, WarrantyRegistrationVerifyPayload,
    AMCPlanSchema, AMCSubscriptionCreatePayload, AMCSubscriptionSchema,
    JobCardPartItem, CompanyWarrantyPolicyCreate, CompanyWarrantyPolicyUpdate,
    CompanyWarrantyPolicyResponse
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
        company_brand = (getattr(user, "company_name", None) or user.name or "").strip()
        brand_clean = re.sub(r'(?i)\b(company|pvt|ltd|inc|llc|corp|brand|appliances|electronics)\b', '', company_brand).strip()

        matching_company_users = db.query(UserModel).filter(
            UserModel.role == "company",
            or_(
                UserModel.id == user.id,
                UserModel.email == user.email,
                UserModel.name.ilike(f"%{brand_clean}%") if brand_clean else False,
                UserModel.name.ilike(f"%{company_brand}%") if company_brand else False,
                getattr(UserModel, "company_name", UserModel.name).ilike(f"%{brand_clean}%") if brand_clean else False
            )
        ).all()
        company_matches = list(set([u.id for u in matching_company_users] + [user.id]))
        if user.email:
            company_matches.append(user.email)
        if user.name:
            company_matches.append(user.name)

        # Related appliances
        app_subq = db.query(ApplianceModel.id).filter(
            or_(
                ApplianceModel.company_id.in_(company_matches),
                ApplianceModel.brand.ilike(f"%{company_brand}%") if company_brand else False,
                ApplianceModel.brand.ilike(f"%{brand_clean}%") if brand_clean else False
            )
        )

        # Related service requests
        req_subq = db.query(ServiceRequestModel).filter(
            or_(
                ServiceRequestModel.company_id.in_(company_matches),
                ServiceRequestModel.brand.ilike(f"%{company_brand}%") if company_brand else False,
                ServiceRequestModel.brand.ilike(f"%{brand_clean}%") if brand_clean else False,
                ServiceRequestModel.appliance_id.in_(app_subq)
            )
        ).all()

        candidate_req_ids = set()
        for r in req_subq:
            candidate_req_ids.add(r.id)
            candidate_req_ids.add(r.id.replace("-", "–"))  # en-dash
            candidate_req_ids.add(r.id.replace("–", "-"))  # hyphen

        claim_filters = [
            WarrantyClaimModel.company_id.in_(company_matches),
            WarrantyClaimModel.appliance_id.in_(app_subq)
        ]
        if company_brand:
            claim_filters.append(WarrantyClaimModel.company_id.ilike(f"%{company_brand}%"))
            claim_filters.append(WarrantyClaimModel.claim_notes.ilike(f"%{company_brand}%"))
        if brand_clean:
            claim_filters.append(WarrantyClaimModel.company_id.ilike(f"%{brand_clean}%"))
            claim_filters.append(WarrantyClaimModel.claim_notes.ilike(f"%{brand_clean}%"))
        if candidate_req_ids:
            claim_filters.append(WarrantyClaimModel.request_id.in_(list(candidate_req_ids)))

        query = query.filter(or_(*claim_filters))
    elif user.role in ("branch", "franchise"):
        branch_ids = [user.id]
        user_branches = db.query(CompanyBranchModel).filter(
            or_(
                CompanyBranchModel.id == user.id,
                CompanyBranchModel.email == user.email,
                CompanyBranchModel.manager_name.ilike(user.name if user.name else ""),
                CompanyBranchModel.branch_name.ilike(user.name if user.name else "")
            )
        ).all()
        for b in user_branches:
            if b.id not in branch_ids:
                branch_ids.append(b.id)

        branch_req_ids = db.query(ServiceRequestModel.id).filter(
            ServiceRequestModel.branch_id.in_(branch_ids)
        )
        query = query.filter(
            or_(
                WarrantyClaimModel.branch_id.in_(branch_ids),
                WarrantyClaimModel.request_id.in_(branch_req_ids)
            )
        )
    elif user.role != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized to access warranty claims")

    if status and status.lower() != "all":
        query = query.filter(WarrantyClaimModel.status.ilike(status))

    claims = query.order_by(WarrantyClaimModel.submitted_at.desc()).all()
    results = []
    for c in claims:
        # Normalize request ID to handle ASCII hyphen and Unicode dashes
        raw_req_id = c.request_id or ""
        clean_req_id = raw_req_id.replace("–", "-").replace("—", "-").strip()
        num_part = re.sub(r'^[^\d]*', '', clean_req_id)

        # Load related branch, company, appliance, request, and job card
        comp = db.query(UserModel).filter(UserModel.id == c.company_id).first()
        branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == c.branch_id).first()
        appliance = db.query(ApplianceModel).filter(ApplianceModel.id == c.appliance_id).first() if c.appliance_id else None

        req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == c.request_id).first()
        if not req and clean_req_id:
            req = db.query(ServiceRequestModel).filter(
                or_(
                    ServiceRequestModel.id == clean_req_id,
                    ServiceRequestModel.id.ilike(f"%{clean_req_id}%"),
                    *( [ServiceRequestModel.id.ilike(f"%{num_part}%")] if num_part else [] )
                )
            ).first()

        jc = None
        if c.request_id:
            jc = db.query(JobCardModel).filter(JobCardModel.request_id == c.request_id).first()
            if not jc and clean_req_id:
                jc = db.query(JobCardModel).filter(
                    or_(
                        JobCardModel.request_id == clean_req_id,
                        JobCardModel.request_id.ilike(f"%{clean_req_id}%"),
                        *( [JobCardModel.request_id.ilike(f"%{num_part}%")] if num_part else [] )
                    )
                ).first()
        if not jc and req:
            jc = db.query(JobCardModel).filter(JobCardModel.request_id == req.id).first()

        if not appliance and req and req.appliance_id:
            appliance = db.query(ApplianceModel).filter(ApplianceModel.id == req.appliance_id).first()

        if not comp and req and req.company_id:
            comp = db.query(UserModel).filter(UserModel.id == req.company_id).first()
        if not comp and req and req.brand:
            comp = db.query(UserModel).filter(
                UserModel.role == "company",
                or_(UserModel.name.ilike(req.brand), getattr(UserModel, "company_name", UserModel.name).ilike(req.brand))
            ).first()

        if not branch and req and req.branch_id:
            branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == req.branch_id).first()

        parts = []
        if c.parts_claimed_json:
            try:
                raw_parts = json.loads(c.parts_claimed_json)
                parts = [JobCardPartItem(**p) for p in raw_parts]
            except Exception:
                pass

        def get_item_total(p):
            t = getattr(p, "total", None) or getattr(p, "total_price", None)
            if t:
                return float(t)
            qty = getattr(p, "quantity", 1) or 1
            rate = getattr(p, "unit_price", 0.0) or 0.0
            return float(qty * rate)

        covered_parts_cost = sum(get_item_total(p) for p in parts if getattr(p, "is_covered", False)) if parts else 0.0
        if covered_parts_cost == 0.0 and parts:
            covered_parts_cost = sum(get_item_total(p) for p in parts)
        if covered_parts_cost == 0.0 and c.claim_amount:
            covered_parts_cost = float(c.claim_amount)

        customer_parts_cost = 0.0
        labor_cost = jc.labor_cost if jc else 0.0
        service_total = jc.total_amount if jc else (getattr(req, "total_amount", 0.0) if req else 0.0)
        if jc and jc.parts_used_json:
            try:
                all_jc_parts = json.loads(jc.parts_used_json)
                customer_parts_cost = sum(float(p.get("total") or p.get("total_price") or ((p.get("quantity", 1) or 1) * (p.get("unit_price", 0.0) or 0.0))) for p in all_jc_parts if not p.get("is_covered", False))
            except Exception:
                pass

        # If service_total is zero/empty, fallback to customer parts or regex in claim notes
        if (not service_total or service_total == 0.0) and customer_parts_cost > 0:
            service_total = customer_parts_cost + (labor_cost if not getattr(req, "is_under_warranty", False) else 0.0)
        if (not service_total or service_total == 0.0) and c.claim_notes:
            notes_match = re.search(r"Consumer billed\s*₹?\s*([\d,]+(?:\.\d+)?)", c.claim_notes)
            if notes_match:
                try:
                    service_total = float(notes_match.group(1).replace(",", ""))
                except Exception:
                    pass

        purchase_invoice = appliance.invoice_url if appliance and appliance.invoice_url else (getattr(req, "invoice_url", None) if req else None)
        service_inv_no = (
            f"INV-{jc.id.replace('JC-', '').replace('JC–', '')}"
            if jc
            else (f"INV-{req.id.replace('SR-', '').replace('SR–', '')}" if req else None)
        )

        tech_user = None
        if jc and jc.technician_id:
            tech_user = db.query(UserModel).filter(UserModel.id == jc.technician_id).first()
        elif req and req.technician_id:
            tech_user = db.query(UserModel).filter(UserModel.id == req.technician_id).first()
        tech_name = getattr(req, "technician_name", None) or (tech_user.name if tech_user else None)

        # Smart appliance name resolution: avoid "brand Other"
        raw_app_name = (
            getattr(req, "appliance_name", None)
            or (appliance.appliance_name if appliance else None)
            or (f"{appliance.brand} {appliance.category}" if appliance else None)
            or (f"{getattr(req, 'brand', '')} {getattr(req, 'appliance_category', '')}".strip() if req else None)
            or "Appliance"
        )
        if raw_app_name.lower().endswith(" other") or raw_app_name.lower() == "other":
            cleaner = getattr(req, "appliance_name", None) or (appliance.appliance_name if appliance else None)
            if cleaner and not cleaner.lower().endswith(" other"):
                raw_app_name = cleaner
            else:
                brand_str = appliance.brand if appliance else (getattr(req, "brand", "") or "")
                raw_app_name = f"{brand_str} Appliance".strip() if brand_str else "Appliance"
        app_name = raw_app_name

        brand_name = appliance.brand if appliance else (req.brand if req else (comp.name if comp else None))

        model_no = (
            (appliance.model_no if appliance and appliance.model_no else None)
            or (getattr(req, "model_no", None) if req else None)
        )
        serial_no = (
            (appliance.serial_no if appliance and appliance.serial_no else None)
            or (getattr(req, "serial_no", None) if req else None)
            or (getattr(req, "serial_number", None) if req else None)
        )
        p_raw = (
            (appliance.purchase_date if appliance and appliance.purchase_date else None)
            or (appliance.warranty_start_date if appliance and appliance.warranty_start_date else None)
            or (appliance.registered_on if appliance and appliance.registered_on else None)
            or (getattr(req, "purchase_date", None) if req else None)
            or (getattr(req, "appointment_date", None) if req else None)
            or (getattr(req, "created_at", None) if req else None)
        )
        if isinstance(p_raw, (datetime, date)):
            purchase_date = p_raw.strftime("%Y-%m-%d")
        elif p_raw:
            purchase_date = str(p_raw).split("T")[0].split(" ")[0]
        else:
            purchase_date = None
        issue_text = (
            (getattr(req, "issue", None) if req and req.issue else None)
            or (getattr(req, "description", None) if req and req.description else None)
            or (c.claim_notes if c.claim_notes and not c.claim_notes.startswith("OEM Warranty") else None)
            or "Reported defect during service"
        )

        results.append(
            WarrantyClaimSchema(
                id=c.id,
                request_id=c.request_id,
                company_id=c.company_id or (comp.id if comp else ""),
                company_name=comp.name if comp else (brand_name or "OEM Partner"),
                branch_id=c.branch_id or (branch.id if branch else ""),
                branch_name=branch.branch_name if branch else "Franchise Branch",
                appliance_id=c.appliance_id or (req.appliance_id if req else ""),
                appliance_name=app_name,
                brand=brand_name,
                claim_amount=c.claim_amount,
                parts_claimed=parts,
                status=c.status,
                claim_notes=c.claim_notes,
                submitted_at=c.submitted_at,
                settled_at=c.settled_at,
                customer_name=req.customer_name if req else None,
                customer_phone=req.customer_phone if req else None,
                customer_address=req.customer_address if req else None,
                model_no=model_no,
                serial_no=serial_no,
                purchase_date=purchase_date,
                invoice_url=purchase_invoice,
                service_invoice_no=service_inv_no,
                service_total_amount=service_total,
                labor_cost=labor_cost,
                covered_parts_cost=covered_parts_cost,
                customer_parts_cost=customer_parts_cost,
                issue=issue_text,
                defect_photo=getattr(req, "defect_photo", None) if req else None,
                technician_name=tech_name
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

# Helper functions for Policy Resolution
def parse_date(date_val):
    if not date_val:
        return None
    if isinstance(date_val, datetime):
        return date_val.date()
    if isinstance(date_val, date):
        return date_val
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(str(date_val).strip(), fmt).date()
        except Exception:
            pass
    return None

def resolve_policy_for_appliance(company_id: str, brand: str, category: str, purchase_date_val, db: Session):
    p_date = parse_date(purchase_date_val)
    if not p_date:
        p_date = datetime.now().date()

    query = db.query(CompanyWarrantyPolicyModel).filter(CompanyWarrantyPolicyModel.is_active == True)
    if company_id:
        query = query.filter(
            or_(
                CompanyWarrantyPolicyModel.company_id == company_id,
                CompanyWarrantyPolicyModel.company_id.in_(
                    db.query(UserModel.id).filter(UserModel.name.ilike(brand.strip() if brand else ""))
                )
            )
        )
    elif brand:
        company_users = db.query(UserModel.id).filter(UserModel.name.ilike(brand.strip())).all()
        comp_ids = [u[0] for u in company_users]
        if comp_ids:
            query = query.filter(CompanyWarrantyPolicyModel.company_id.in_(comp_ids))

    policies = query.order_by(CompanyWarrantyPolicyModel.effective_from.desc()).all()
    matched = None
    for pol in policies:
        if pol.category != "All" and category and pol.category.lower() != category.lower():
            continue
        eff_from = pol.effective_from
        eff_to = pol.effective_to
        if eff_from and p_date < eff_from:
            continue
        if eff_to and p_date > eff_to:
            continue
        matched = pol
        break

    return matched, p_date

def evaluate_part_warranty_status(
    part_name: str,
    part_code: Optional[str],
    db_part: Optional[SparePartModel],
    req: Optional[ServiceRequestModel],
    appliance: Optional[ApplianceModel],
    is_comprehensive_active: bool,
    db: Session
) -> tuple:
    """
    Evaluates whether a spare part is covered under Comprehensive Warranty or Component-Specific Warranty.
    Deterministic decision hierarchy:
    1. Consumable check (db_part.part_type or explicit non-warranty eligibility)
    2. Comprehensive warranty check (within active window)
    3. Explicit component warranty check (using db_part.warranty_component_type set by Brand OEM in inventory)
    Returns: (is_covered: bool, coverage_type: str, reason: Optional[str])
    """
    name_str = (part_name or "").strip()

    # 1. Consumable / Explicit ineligibility check
    is_consumable = False
    if db_part:
        if db_part.part_type in ("consumable", "wear_and_tear", "accessory") or not db_part.is_warranty_eligible:
            is_consumable = True
    else:
        is_consumable = any(w in name_str.lower() for w in ["gas", "filter", "gasket", "seal", "cleaning", "pipe"])

    consumables_covered_by_policy = False
    comp_warranty_map = {}
    p_date = None

    if appliance:
        p_date = parse_date(appliance.purchase_date)
        if getattr(appliance, "policy_snapshot_json", None):
            try:
                snap = json.loads(appliance.policy_snapshot_json)
                consumables_covered_by_policy = bool(snap.get("consumables_covered", False))
                comp_warranty_map = snap.get("component_warranty", {})
            except Exception:
                pass
        if not comp_warranty_map and getattr(appliance, "matched_policy_id", None):
            pol = db.query(CompanyWarrantyPolicyModel).filter(CompanyWarrantyPolicyModel.id == appliance.matched_policy_id).first()
            if pol:
                consumables_covered_by_policy = bool(pol.consumables_covered)
                try:
                    comp_warranty_map = json.loads(pol.component_warranty_json) if pol.component_warranty_json else {}
                except Exception:
                    pass

    # If it is a consumable and policy does not explicitly cover consumables:
    if is_consumable and not consumables_covered_by_policy:
        return False, "customer_billable", "Consumable / Wear & Tear (Excluded from Warranty)"

    # 2. Comprehensive Warranty Coverage (Within standard warranty period)
    if is_comprehensive_active and not is_consumable:
        return True, "oem_warranty", "Covered under Comprehensive Warranty"

    # 3. Explicit Component-Specific Warranty Tag Check
    # Strictly checks the component tag chosen during part creation in inventory
    comp_tag = (getattr(db_part, "warranty_component_type", None) or "").strip().lower() if db_part else ""

    if comp_tag and comp_warranty_map and p_date:
        today = datetime.now().date()
        age_days = (today - p_date).days
        age_months = max(0, int(age_days / 30.4375))

        # Check if the part's explicit component tag matches any key in policy's component warranty map (case-insensitive)
        comp_duration = comp_warranty_map.get(comp_tag)
        if comp_duration is None:
            for k, v in comp_warranty_map.items():
                if str(k).strip().lower() == comp_tag:
                    comp_duration = v
                    break
        if comp_duration is not None:
            try:
                max_months = int(comp_duration)
            except (ValueError, TypeError):
                max_months = 0

            if age_months <= max_months:
                return True, "oem_warranty", f"Covered under Component Warranty ({comp_tag.upper()}: {max_months}m, Appliance Age: {age_months}m)"
            else:
                return False, "customer_billable", f"Component Warranty Expired ({comp_tag.upper()}: {max_months}m limit exceeded, Age: {age_months}m)"

    # 4. Default out-of-warranty fallback
    reason = "Comprehensive Warranty Expired / Excluded" if not is_comprehensive_active else "Out of Warranty / Excluded"
    return False, "customer_billable", reason

# ==========================================
# 1.1 WARRANTY POLICIES (Fiscal Year / Time Windows)
# ==========================================

@router.get("/policies", response_model=List[CompanyWarrantyPolicyResponse])
def list_warranty_policies(
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    query = db.query(CompanyWarrantyPolicyModel)
    if user.role == "company":
        query = query.filter(CompanyWarrantyPolicyModel.company_id == user.id)
    elif user.role != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized to view company warranty policies")

    policies = query.order_by(CompanyWarrantyPolicyModel.effective_from.desc()).all()
    results = []
    for pol in policies:
        comp_obj = db.query(UserModel).filter(UserModel.id == pol.company_id).first()
        comp_dict = {}
        try:
            comp_dict = json.loads(pol.component_warranty_json) if pol.component_warranty_json else {}
        except Exception:
            pass
        results.append(
            CompanyWarrantyPolicyResponse(
                id=pol.id,
                company_id=pol.company_id,
                company_name=comp_obj.name if comp_obj else None,
                policy_code=pol.policy_code,
                policy_name=pol.policy_name,
                category=pol.category,
                effective_from=pol.effective_from.strftime("%Y-%m-%d") if pol.effective_from else "",
                effective_to=pol.effective_to.strftime("%Y-%m-%d") if pol.effective_to else None,
                comprehensive_months=pol.comprehensive_months,
                component_warranty=comp_dict,
                component_warranty_json=pol.component_warranty_json or "{}",
                consumables_covered=pol.consumables_covered,
                terms_and_conditions=pol.terms_and_conditions,
                is_active=pol.is_active,
                created_at=pol.created_at.strftime("%d %b %Y, %I:%M %p") if pol.created_at else None
            )
        )
    return results

@router.post("/policies", response_model=CompanyWarrantyPolicyResponse)
def create_warranty_policy(
    payload: CompanyWarrantyPolicyCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only brand companies or admins can create warranty policies")

    company_id = user.id

    # Parse effective dates
    eff_from = parse_date(payload.effective_from)
    if not eff_from:
        raise HTTPException(status_code=400, detail="Valid effective_from date (YYYY-MM-DD) is required")
    eff_to = parse_date(payload.effective_to) if payload.effective_to else None

    # Parse component warranty json
    comp_json_str = "{}"
    comp_dict = {}
    if payload.component_warranty_json:
        if isinstance(payload.component_warranty_json, dict):
            comp_dict = payload.component_warranty_json
            comp_json_str = json.dumps(payload.component_warranty_json)
        elif isinstance(payload.component_warranty_json, str):
            try:
                comp_dict = json.loads(payload.component_warranty_json)
                comp_json_str = payload.component_warranty_json
            except Exception:
                comp_dict = {}
                comp_json_str = "{}"

    policy_id = f"POL-{user.id[:4].upper()}-{uuid.uuid4().hex[:6].upper()}"
    new_pol = CompanyWarrantyPolicyModel(
        id=policy_id,
        company_id=company_id,
        policy_code=payload.policy_code.strip().upper(),
        policy_name=payload.policy_name.strip(),
        category=payload.category or "All",
        effective_from=eff_from,
        effective_to=eff_to,
        comprehensive_months=payload.comprehensive_months or 12,
        component_warranty_json=comp_json_str,
        consumables_covered=bool(payload.consumables_covered),
        terms_and_conditions=payload.terms_and_conditions,
        is_active=True,
        created_at=datetime.utcnow()
    )
    db.add(new_pol)
    db.commit()
    db.refresh(new_pol)

    return CompanyWarrantyPolicyResponse(
        id=new_pol.id,
        company_id=new_pol.company_id,
        company_name=user.name,
        policy_code=new_pol.policy_code,
        policy_name=new_pol.policy_name,
        category=new_pol.category,
        effective_from=new_pol.effective_from.strftime("%Y-%m-%d"),
        effective_to=new_pol.effective_to.strftime("%Y-%m-%d") if new_pol.effective_to else None,
        comprehensive_months=new_pol.comprehensive_months,
        component_warranty=comp_dict,
        component_warranty_json=comp_json_str,
        consumables_covered=new_pol.consumables_covered,
        terms_and_conditions=new_pol.terms_and_conditions,
        is_active=new_pol.is_active,
        created_at=new_pol.created_at.strftime("%d %b %Y, %I:%M %p")
    )

@router.put("/policies/{policy_id}", response_model=CompanyWarrantyPolicyResponse)
def update_warranty_policy(
    policy_id: str,
    payload: CompanyWarrantyPolicyUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only brand companies can update policies")

    pol = db.query(CompanyWarrantyPolicyModel).filter(CompanyWarrantyPolicyModel.id == policy_id).first()
    if not pol:
        raise HTTPException(status_code=404, detail="Warranty policy not found")
    if user.role == "company" and pol.company_id != user.id:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this policy")

    if payload.policy_name is not None:
        pol.policy_name = payload.policy_name.strip()
    if payload.category is not None:
        pol.category = payload.category.strip()
    if payload.effective_from is not None:
        d = parse_date(payload.effective_from)
        if d:
            pol.effective_from = d
    if payload.effective_to is not None:
        pol.effective_to = parse_date(payload.effective_to) if payload.effective_to.strip() else None
    if payload.comprehensive_months is not None:
        pol.comprehensive_months = payload.comprehensive_months
    if payload.component_warranty_json is not None:
        if isinstance(payload.component_warranty_json, dict):
            pol.component_warranty_json = json.dumps(payload.component_warranty_json)
        elif isinstance(payload.component_warranty_json, str):
            pol.component_warranty_json = payload.component_warranty_json
    if payload.consumables_covered is not None:
        pol.consumables_covered = payload.consumables_covered
    if payload.terms_and_conditions is not None:
        pol.terms_and_conditions = payload.terms_and_conditions
    if payload.is_active is not None:
        pol.is_active = payload.is_active

    db.commit()
    db.refresh(pol)

    comp_dict = {}
    try:
        comp_dict = json.loads(pol.component_warranty_json) if pol.component_warranty_json else {}
    except Exception:
        pass

    return CompanyWarrantyPolicyResponse(
        id=pol.id,
        company_id=pol.company_id,
        company_name=user.name,
        policy_code=pol.policy_code,
        policy_name=pol.policy_name,
        category=pol.category,
        effective_from=pol.effective_from.strftime("%Y-%m-%d"),
        effective_to=pol.effective_to.strftime("%Y-%m-%d") if pol.effective_to else None,
        comprehensive_months=pol.comprehensive_months,
        component_warranty=comp_dict,
        component_warranty_json=pol.component_warranty_json or "{}",
        consumables_covered=pol.consumables_covered,
        terms_and_conditions=pol.terms_and_conditions,
        is_active=pol.is_active,
        created_at=pol.created_at.strftime("%d %b %Y, %I:%M %p") if pol.created_at else None
    )

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
        company_brand = (getattr(user, "company_name", None) or user.name or "").strip()
        brand_clean = re.sub(r'(?i)\b(company|pvt|ltd|inc|llc|corp|brand|appliances|electronics)\b', '', company_brand).strip()
        matching_companies = db.query(UserModel).filter(
            UserModel.role == "company",
            or_(
                UserModel.id == user.id,
                UserModel.name.ilike(f"%{brand_clean}%") if brand_clean else False,
                UserModel.name.ilike(f"%{company_brand}%") if company_brand else False
            )
        ).all()
        comp_ids = list(set([c.id for c in matching_companies] + [user.id]))

        query = query.filter(
            or_(
                ApplianceModel.company_id.in_(comp_ids),
                ApplianceModel.brand.ilike(f"%{brand_clean}%") if brand_clean else False,
                ApplianceModel.brand.ilike(f"%{company_brand}%") if company_brand else False
            )
        )

    if status and status.lower() != "all":
        query = query.filter(ApplianceModel.warranty_status.ilike(f"%{status}%"))

    appliances = query.all()
    results = []
    for app in appliances:
        customer = db.query(UserModel).filter(UserModel.id == app.user_id).first()
        company = db.query(UserModel).filter(UserModel.id == app.company_id).first()

        # Resolve policy suggestion if not yet snapshotted
        matched_pol_id = getattr(app, "matched_policy_id", None)
        matched_pol_name = getattr(app, "matched_policy_name", None)
        policy_snapshot = getattr(app, "policy_snapshot_json", None)

        policy_code = matched_pol_id
        if policy_snapshot:
            try:
                snap = json.loads(policy_snapshot)
                if snap.get("policy_code"):
                    policy_code = snap["policy_code"]
            except Exception:
                pass

        if not matched_pol_name and app.purchase_date:
            pol_match, _ = resolve_policy_for_appliance(app.company_id, app.brand, app.category, app.purchase_date, db)
            if pol_match:
                matched_pol_id = pol_match.id
                matched_pol_name = pol_match.policy_name
                policy_code = pol_match.policy_code or pol_match.id
        # Resolve descriptive appliance name
        app_name = getattr(app, "appliance_name", None)
        if not app_name or not app_name.strip() or app_name.strip().lower() in (
            f"{(app.brand or '').strip().lower()} {(app.category or '').strip().lower()}",
            f"{(app.brand or '').strip().lower()} other",
            (app.brand or "").strip().lower(),
            "other", "appliance", "unknown"
        ) or app_name.strip().lower().endswith(" other"):
            cat_item = None
            if app.category and app.category.lower() != "other":
                cat_item = db.query(CompanyApplianceCatalogModel).filter(
                    CompanyApplianceCatalogModel.category.ilike(app.category.strip())
                ).first()
            if not cat_item and app.brand:
                cat_item = db.query(CompanyApplianceCatalogModel).filter(
                    CompanyApplianceCatalogModel.brand.ilike(app.brand.strip()),
                    CompanyApplianceCatalogModel.category.notilike("other")
                ).first()
            if cat_item and cat_item.appliance_name:
                app_name = cat_item.appliance_name
                app.appliance_name = app_name
                try:
                    db.add(app)
                    db.commit()
                except Exception:
                    db.rollback()
            else:
                app_name = f"{app.brand} Appliance".strip() if (not app.category or app.category.lower() == "other") else f"{app.brand} {app.category}".strip()

        results.append(
            WarrantyRegistrationItem(
                id=app.id,
                appliance_id=app.id,
                appliance_name=app_name,
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
                matched_policy_id=matched_pol_id,
                matched_policy_name=matched_pol_name,
                policy_code=policy_code,
                policy_snapshot_json=policy_snapshot,
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

        # Update purchase_date if edited by company admin
        if payload.purchase_date and payload.purchase_date.strip():
            app.purchase_date = payload.purchase_date.strip()

        # Resolve fiscal year policy matching purchase date
        matched_pol, p_date = resolve_policy_for_appliance(
            app.company_id, app.brand, app.category, app.purchase_date, db
        )

        # Set warranty duration
        if payload.warranty_months and payload.warranty_months > 0:
            app.warranty_months = payload.warranty_months
        elif matched_pol and matched_pol.comprehensive_months:
            app.warranty_months = matched_pol.comprehensive_months

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

        # Create immutable policy snapshot on ApplianceModel
        comp_dict = {}
        if matched_pol:
            try:
                comp_dict = json.loads(matched_pol.component_warranty_json) if matched_pol.component_warranty_json else {}
            except Exception:
                pass
            snapshot = {
                "policy_id": matched_pol.id,
                "policy_code": matched_pol.policy_code,
                "policy_name": matched_pol.policy_name,
                "effective_from": matched_pol.effective_from.strftime("%Y-%m-%d") if matched_pol.effective_from else None,
                "effective_to": matched_pol.effective_to.strftime("%Y-%m-%d") if matched_pol.effective_to else None,
                "comprehensive_months": w_months,
                "component_warranty": comp_dict,
                "consumables_covered": matched_pol.consumables_covered,
                "snapshotted_at": now_str
            }
            app.matched_policy_id = matched_pol.policy_code or matched_pol.id
            app.matched_policy_name = matched_pol.policy_name
            app.policy_snapshot_json = json.dumps(snapshot)
        else:
            # Fallback snapshot
            snapshot = {
                "policy_id": "DEFAULT",
                "policy_code": "STD-DEFAULT",
                "policy_name": "Standard Manufacturer Warranty",
                "comprehensive_months": w_months,
                "component_warranty": {"compressor": 60, "motor": 60},
                "consumables_covered": False,
                "snapshotted_at": now_str
            }
            app.matched_policy_id = "STD-DEFAULT"
            app.matched_policy_name = "Standard Manufacturer Warranty"
            app.policy_snapshot_json = json.dumps(snapshot)

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
        "matched_policy_id": app.matched_policy_id,
        "matched_policy_name": app.matched_policy_name,
        "policy_snapshot_json": app.policy_snapshot_json,
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
