from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import json
from datetime import datetime, timedelta
from app.db.session import get_db
from app.db.models import ApplianceModel, UserModel, CompanyApplianceCatalogModel, ServiceRequestModel
from app.schemas import ApplianceBase, NewApplianceCreate, WarrantyInvoiceReuploadPayload, ApplianceUpdatePayload
from app.security import get_authenticated_user
from app.routes.warranty_amc import resolve_policy_for_appliance

router = APIRouter(prefix="/api/appliances", tags=["appliances"])

def is_generic_name(name: str | None, brand: str | None = None, category: str | None = None) -> bool:
    if not name or not name.strip():
        return True
    n = name.strip().lower()
    b = (brand or "").strip().lower()
    c = (category or "").strip().lower()
    if b and c and n == f"{b} {c}":
        return True
    if b and n in (f"{b} other", b):
        return True
    if n in ("other", "appliance", "unknown"):
        return True
    if n.endswith(" other"):
        return True
    return False


@router.get("", response_model=List[ApplianceBase])
def get_user_appliances(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    rows = db.query(ApplianceModel, UserModel.name).outerjoin(
        UserModel, ApplianceModel.company_id == UserModel.id
    ).filter(ApplianceModel.user_id == user.id).all()

    catalog_items = db.query(CompanyApplianceCatalogModel).all()
    
    catalog_by_model = {}
    catalog_by_brand_cat = {}
    catalog_by_comp_cat = {}
    catalog_by_brand = {}

    for ci in catalog_items:
        if not ci.appliance_name or is_generic_name(ci.appliance_name, ci.brand, ci.category):
            continue
        c_brand = (ci.brand or "").strip().lower()
        c_cat = (ci.category or "").strip().lower()
        c_comp = ci.company_id
        
        try:
            m_list = json.loads(ci.model_numbers) if ci.model_numbers else []
        except Exception:
            m_list = [m.strip() for m in str(ci.model_numbers).split(",") if m.strip()]
        for m in m_list:
            m_clean = m.strip().lower()
            if m_clean:
                catalog_by_model[(c_comp, m_clean)] = ci.appliance_name
                catalog_by_model[(c_brand, m_clean)] = ci.appliance_name
        
        if c_brand and c_cat:
            catalog_by_brand_cat[(c_brand, c_cat)] = ci.appliance_name
        if c_comp and c_cat:
            catalog_by_comp_cat[(c_comp, c_cat)] = ci.appliance_name
        if c_brand and c_brand not in catalog_by_brand:
            catalog_by_brand[c_brand] = ci.appliance_name

    payloads = []
    has_healed = False
    for appliance, company_name in rows:
        app_model = (appliance.model_no or "").strip().lower()
        app_brand = (appliance.brand or "").strip().lower()
        app_cat = (appliance.category or "").strip().lower()
        app_comp = appliance.company_id

        fallback = (
            catalog_by_model.get((app_comp, app_model)) or
            catalog_by_model.get((app_brand, app_model)) or
            catalog_by_brand_cat.get((app_brand, app_cat)) or
            catalog_by_comp_cat.get((app_comp, app_cat)) or
            catalog_by_brand_cat.get((app_brand, "other")) or
            catalog_by_comp_cat.get((app_comp, "other")) or
            catalog_by_brand.get(app_brand)
        )

        curr_name = getattr(appliance, "appliance_name", None)
        if is_generic_name(curr_name, appliance.brand, appliance.category) and fallback:
            appliance.appliance_name = fallback
            has_healed = True

        payloads.append(appliance_payload(appliance, company_name, fallback_appliance_name=fallback))

    if has_healed:
        try:
            db.commit()
        except Exception:
            db.rollback()

    return payloads


@router.get("/companies")
def get_registered_companies(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    companies = db.query(UserModel.id, UserModel.name).filter(
        UserModel.role == "company",
        UserModel.is_active == True
    ).order_by(UserModel.name).all()
    return [{"id": company_id, "name": name} for company_id, name in companies]


@router.get("/catalog")
def get_company_appliance_catalog(company_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role != "customer" and user.role != "company" and user.role != "admin":
        raise HTTPException(status_code=403, detail="Authorized user access required")
    company = db.query(UserModel).filter(
        UserModel.id == company_id,
        UserModel.role == "company"
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    catalog_rows = db.query(CompanyApplianceCatalogModel).filter(
        CompanyApplianceCatalogModel.company_id == company.id
    ).order_by(CompanyApplianceCatalogModel.appliance_name).all()

    brands_set = set()
    appliances_list = []
    for item in catalog_rows:
        if item.brand and item.brand.strip():
            brands_set.add(item.brand.strip())
        try:
            models = json.loads(item.model_numbers) if item.model_numbers else []
        except Exception:
            models = [m.strip() for m in str(item.model_numbers).split(",") if m.strip()]
        appliances_list.append({
            "id": item.id,
            "appliance_name": item.appliance_name,
            "brand": item.brand or company.name,
            "category": item.category,
            "model_numbers": models,
            "warranty_months": item.warranty_months,
            "description": item.description,
        })

    brands = sorted(list(brands_set)) if brands_set else [company.name]

    return {
        "company_id": company.id,
        "company_name": company.name,
        "brands": brands,
        "appliances": appliances_list,
    }


@router.post("", response_model=ApplianceBase)
def add_appliance(payload: NewApplianceCreate, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    company = db.query(UserModel).filter(
        UserModel.id == payload.company_id,
        UserModel.role == "company",
    ).first()
    if not company:
        raise HTTPException(status_code=422, detail="Choose a company registered on ServSure")
    
    icon_map = {
        "air conditioner": "air-vent",
        "refrigerator": "refrigerator",
        "microwave": "microwave",
        "washing machine": "washing-machine",
        "water purifier": "droplets",
        "chimney": "wind",
        "dishwasher": "utensils",
        "television": "tv",
        "tv": "tv"
    }
    
    cat = (payload.category or "Air Conditioner").strip()
    cat_lower = cat.lower()
    icon = "box"
    for k, v in icon_map.items():
        if k in cat_lower:
            icon = v
            break

    # 1. Determine warranty duration from catalog if available
    warranty_months = 12
    cat_match = db.query(CompanyApplianceCatalogModel).filter(
        CompanyApplianceCatalogModel.company_id == company.id,
        CompanyApplianceCatalogModel.category == cat
    ).all()
    for cm in cat_match:
        try:
            m_list = json.loads(cm.model_numbers) if cm.model_numbers else []
        except Exception:
            m_list = [m.strip() for m in str(cm.model_numbers).split(",") if m.strip()]
        if payload.model_no.strip() in m_list or cm.appliance_name.lower() in (payload.appliance_name or "").lower():
            if cm.warranty_months:
                warranty_months = int(cm.warranty_months)
                break

    # 2. Determine purchase date, matched policy, and warranty coverage dates
    p_date_str = None
    w_start = None
    w_end = None
    matched_pol_id = None
    matched_pol_name = None
    if payload.purchase_date and payload.purchase_date.strip():
        raw_p = payload.purchase_date.strip()
        parsed_dt = None
        for fmt in ("%Y-%m-%d", "%d %b %Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                parsed_dt = datetime.strptime(raw_p, fmt)
                break
            except Exception:
                pass
        if parsed_dt:
            p_date_str = parsed_dt.strftime("%Y-%m-%d")
            # Resolve policy for purchase date
            pol_match, _ = resolve_policy_for_appliance(company.id, payload.brand, cat, p_date_str, db)
            if pol_match:
                matched_pol_id = pol_match.id
                matched_pol_name = pol_match.policy_name
                if pol_match.comprehensive_months:
                    warranty_months = pol_match.comprehensive_months
            w_start = parsed_dt.strftime("%d %b %Y")
            w_end = (parsed_dt + timedelta(days=warranty_months * 30)).strftime("%d %b %Y")
    
    # 3. Invoice is mandatory for customer appliance registration
    inv_url = payload.invoice_url.strip() if (payload.invoice_url and payload.invoice_url.strip()) else None
    if not inv_url:
        raise HTTPException(
            status_code=422,
            detail="Invoice upload is mandatory. Please upload a clear copy of your purchase invoice (image or PDF)."
        )
    w_status = "Pending Verification"

    raw_app_name = payload.appliance_name.strip() if payload.appliance_name else None
    if is_generic_name(raw_app_name, payload.brand, cat):
        raw_app_name = None
    if not raw_app_name:
        for cm in cat_match:
            if cm.appliance_name and not is_generic_name(cm.appliance_name, payload.brand, cat):
                raw_app_name = cm.appliance_name
                break
    if not raw_app_name:
        all_comp_cats = db.query(CompanyApplianceCatalogModel).filter(
            CompanyApplianceCatalogModel.company_id == company.id
        ).all()
        for cc in all_comp_cats:
            if cc.appliance_name and not is_generic_name(cc.appliance_name, payload.brand, cat):
                raw_app_name = cc.appliance_name
                break
    if not raw_app_name:
        raw_app_name = f"{payload.brand.strip()} {cat}"

    new_app = ApplianceModel(
        id=f"app_{uuid.uuid4().hex[:6]}",
        user_id=user.id,
        company_id=company.id,
        appliance_name=raw_app_name,
        brand=payload.brand.strip(),
        category=cat,
        model_no=payload.model_no.strip(),
        registered_on=datetime.now().strftime("%d %b %Y"),
        purchase_date=p_date_str,
        warranty_months=warranty_months,
        warranty_status=w_status,
        warranty_start_date=w_start,
        warranty_end_date=w_end,
        matched_policy_id=matched_pol_id,
        matched_policy_name=matched_pol_name,
        serial_no=payload.serial_no or f"{payload.brand[:3].upper()}-{uuid.uuid4().hex[:6].upper()}",
        icon=icon,
        invoice_url=inv_url
    )
    db.add(new_app)
    db.commit()
    db.refresh(new_app)
    return appliance_payload(new_app, company.name)


@router.put("/{appliance_id}/invoice", response_model=ApplianceBase)
def reupload_appliance_invoice(
    appliance_id: str,
    payload: WarrantyInvoiceReuploadPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    app = db.query(ApplianceModel).filter(
        ApplianceModel.id == appliance_id,
        ApplianceModel.user_id == user.id
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Appliance not found")

    if not payload.invoice_url or not payload.invoice_url.strip():
        raise HTTPException(status_code=422, detail="Valid invoice URL required")

    app.invoice_url = payload.invoice_url.strip()
    app.warranty_status = "Pending Verification"
    app.warranty_rejection_reason = None

    if payload.purchase_date and payload.purchase_date.strip():
        raw_p = payload.purchase_date.strip()
        parsed_dt = None
        for fmt in ("%Y-%m-%d", "%d %b %Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                parsed_dt = datetime.strptime(raw_p, fmt)
                break
            except Exception:
                pass
        if parsed_dt:
            app.purchase_date = parsed_dt.strftime("%Y-%m-%d")
            app.warranty_start_date = parsed_dt.strftime("%d %b %Y")
            w_months = app.warranty_months or 12
            app.warranty_end_date = (parsed_dt + timedelta(days=w_months * 30)).strftime("%d %b %Y")

    db.commit()
    db.refresh(app)

    company = db.query(UserModel).filter(UserModel.id == app.company_id).first()
    return appliance_payload(app, company.name if company else None)


def serialize_app_date(val) -> str | None:
    if val is None:
        return None
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    return str(val)

def appliance_payload(appliance: ApplianceModel, company_name: str | None = None, fallback_appliance_name: str | None = None) -> dict:
    curr_name = getattr(appliance, "appliance_name", None)
    if is_generic_name(curr_name, appliance.brand, appliance.category):
        app_name = fallback_appliance_name or curr_name or f"{appliance.brand} {appliance.category}"
    else:
        app_name = curr_name

    policy_code = getattr(appliance, "matched_policy_id", None)
    if getattr(appliance, "policy_snapshot_json", None):
        try:
            snap = json.loads(appliance.policy_snapshot_json)
            if snap.get("policy_code"):
                policy_code = snap["policy_code"]
        except Exception:
            pass

    return {
        "id": appliance.id,
        "company_id": appliance.company_id,
        "company_name": company_name,
        "appliance_name": app_name,
        "brand": appliance.brand,
        "category": appliance.category,
        "model_no": appliance.model_no,
        "registered_on": serialize_app_date(appliance.registered_on) if hasattr(appliance.registered_on, "strftime") else str(appliance.registered_on or ""),
        "purchase_date": serialize_app_date(getattr(appliance, "purchase_date", None)),
        "warranty_months": getattr(appliance, "warranty_months", 12),
        "warranty_status": appliance.warranty_status,
        "warranty_start_date": serialize_app_date(appliance.warranty_start_date) if hasattr(appliance.warranty_start_date, "strftime") else (appliance.warranty_start_date or None),
        "warranty_end_date": serialize_app_date(appliance.warranty_end_date) if hasattr(appliance.warranty_end_date, "strftime") else (appliance.warranty_end_date or None),
        "warranty_rejection_reason": getattr(appliance, "warranty_rejection_reason", None),
        "matched_policy_id": getattr(appliance, "matched_policy_id", None),
        "matched_policy_name": getattr(appliance, "matched_policy_name", None),
        "policy_code": policy_code,
        "policy_snapshot_json": getattr(appliance, "policy_snapshot_json", None),
        "amc_active": appliance.amc_active,
        "amc_plan_name": appliance.amc_plan_name,
        "amc_end_date": serialize_app_date(appliance.amc_end_date) if hasattr(appliance.amc_end_date, "strftime") else (appliance.amc_end_date or None),
        "serial_no": appliance.serial_no,
        "icon": appliance.icon,
        "invoice_url": appliance.invoice_url,
    }


@router.patch("/{appliance_id}", response_model=ApplianceBase)
def update_user_appliance(
    appliance_id: str,
    payload: ApplianceUpdatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    app = db.query(ApplianceModel).filter(
        ApplianceModel.id == appliance_id,
        ApplianceModel.user_id == user.id
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Appliance not found")

    # Guard: Cannot edit once warranty is approved/active
    if app.warranty_status and app.warranty_status.strip().lower() in ("active", "approved"):
        raise HTTPException(
            status_code=400,
            detail="Cannot edit appliance details once warranty is approved by the manufacturer. Please contact support or the brand administrator for modifications."
        )

    if payload.model_no and payload.model_no.strip():
        app.model_no = payload.model_no.strip()
    if payload.serial_no is not None:
        app.serial_no = payload.serial_no.strip() or None
    if payload.appliance_name and payload.appliance_name.strip():
        app.appliance_name = payload.appliance_name.strip()

    db.commit()
    db.refresh(app)
    company = db.query(UserModel).filter(UserModel.id == app.company_id).first()
    return appliance_payload(app, company.name if company else None)


@router.delete("/{appliance_id}")
def delete_user_appliance(appliance_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    app = db.query(ApplianceModel).filter(
        ApplianceModel.id == appliance_id,
        ApplianceModel.user_id == user.id
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Appliance not found")

    # Guard: Cannot delete once warranty is approved/active
    if app.warranty_status and app.warranty_status.strip().lower() in ("active", "approved"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete an appliance with an active/approved warranty. Please contact support if this appliance was decommissioned."
        )

    # Guard: Cannot delete if active non-completed service request
    active_reqs = db.query(ServiceRequestModel).filter(
        ServiceRequestModel.appliance_id == appliance_id,
        ServiceRequestModel.status.notin_(["Completed", "Cancelled"])
    ).count()
    if active_reqs > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove this appliance because it has an active service request in progress."
        )

    db.delete(app)
    db.commit()
    return {"message": "Appliance removed successfully", "id": appliance_id}

