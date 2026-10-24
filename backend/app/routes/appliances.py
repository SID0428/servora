from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import json
from datetime import datetime, timedelta
from app.db.session import get_db
from app.db.models import ApplianceModel, UserModel, CompanyApplianceCatalogModel
from app.schemas import ApplianceBase, NewApplianceCreate, WarrantyInvoiceReuploadPayload
from app.security import get_authenticated_user
from app.routes.warranty_amc import resolve_policy_for_appliance

router = APIRouter(prefix="/api/appliances", tags=["appliances"])

@router.get("", response_model=List[ApplianceBase])
def get_user_appliances(request: Request, db: Session = Depends(get_db)):
    user = get_authenticated_user(request, db)
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    rows = db.query(ApplianceModel, UserModel.name).outerjoin(
        UserModel, ApplianceModel.company_id == UserModel.id
    ).filter(ApplianceModel.user_id == user.id).all()
    return [appliance_payload(appliance, company_name) for appliance, company_name in rows]


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
    
    # 3. If invoice attached -> Pending Verification by Company OEM; if not -> Invoice Required
    inv_url = payload.invoice_url.strip() if payload.invoice_url else None
    if inv_url:
        w_status = "Pending Verification"
    else:
        w_status = "Invoice Required"

    new_app = ApplianceModel(
        id=f"app_{uuid.uuid4().hex[:6]}",
        user_id=user.id,
        company_id=company.id,
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


def appliance_payload(appliance: ApplianceModel, company_name: str | None = None) -> dict:
    return {
        "id": appliance.id,
        "company_id": appliance.company_id,
        "company_name": company_name,
        "brand": appliance.brand,
        "category": appliance.category,
        "model_no": appliance.model_no,
        "registered_on": appliance.registered_on,
        "purchase_date": getattr(appliance, "purchase_date", None),
        "warranty_months": getattr(appliance, "warranty_months", 12),
        "warranty_status": appliance.warranty_status,
        "warranty_start_date": appliance.warranty_start_date,
        "warranty_end_date": appliance.warranty_end_date,
        "warranty_rejection_reason": getattr(appliance, "warranty_rejection_reason", None),
        "matched_policy_id": getattr(appliance, "matched_policy_id", None),
        "matched_policy_name": getattr(appliance, "matched_policy_name", None),
        "policy_snapshot_json": getattr(appliance, "policy_snapshot_json", None),
        "amc_active": appliance.amc_active,
        "amc_plan_name": appliance.amc_plan_name,
        "amc_end_date": appliance.amc_end_date,
        "serial_no": appliance.serial_no,
        "icon": appliance.icon,
        "invoice_url": appliance.invoice_url,
    }

