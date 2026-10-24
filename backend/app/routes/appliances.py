from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import json
from datetime import datetime
from app.db.session import get_db
from app.db.models import ApplianceModel, UserModel, CompanyApplianceCatalogModel
from app.schemas import ApplianceBase, NewApplianceCreate
from app.security import get_authenticated_user

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

    new_app = ApplianceModel(
        id=f"app_{uuid.uuid4().hex[:6]}",
        user_id=user.id,
        company_id=company.id,
        brand=payload.brand.strip(),
        category=cat,
        model_no=payload.model_no.strip(),
        registered_on=datetime.now().strftime("%d %b %Y"),
        warranty_status="Standard 1 Year Active",
        serial_no=payload.serial_no or f"{payload.brand[:3].upper()}-{uuid.uuid4().hex[:6].upper()}",
        icon=icon,
        invoice_url=payload.invoice_url.strip() if payload.invoice_url else None
    )
    db.add(new_app)
    db.commit()
    db.refresh(new_app)
    return appliance_payload(new_app, company.name)


def appliance_payload(appliance: ApplianceModel, company_name: str | None = None) -> dict:
    return {
        "id": appliance.id,
        "company_id": appliance.company_id,
        "company_name": company_name,
        "brand": appliance.brand,
        "category": appliance.category,
        "model_no": appliance.model_no,
        "registered_on": appliance.registered_on,
        "warranty_status": appliance.warranty_status,
        "warranty_start_date": appliance.warranty_start_date,
        "warranty_end_date": appliance.warranty_end_date,
        "amc_active": appliance.amc_active,
        "amc_plan_name": appliance.amc_plan_name,
        "amc_end_date": appliance.amc_end_date,
        "serial_no": appliance.serial_no,
        "icon": appliance.icon,
        "invoice_url": appliance.invoice_url,
    }

