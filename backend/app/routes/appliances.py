from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid
from datetime import datetime
from app.db.session import get_db
from app.db.models import ApplianceModel
from app.schemas import ApplianceBase, NewApplianceCreate

router = APIRouter(prefix="/api/appliances", tags=["appliances"])

def get_current_user_id(request: Request) -> str:
    user_id = request.cookies.get("servora_user_id") or request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id

@router.get("", response_model=List[ApplianceBase])
def get_user_appliances(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    apps = db.query(ApplianceModel).filter(ApplianceModel.user_id == user_id).all()
    return apps

@router.post("", response_model=ApplianceBase)
def add_appliance(payload: NewApplianceCreate, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    
    icon_map = {
        "air conditioner": "air-vent",
        "refrigerator": "refrigerator",
        "microwave": "microwave",
        "washing machine": "washing-machine",
        "water purifier": "droplets",
        "chimney": "wind",
        "dishwasher": "utensils"
    }
    
    cat_lower = payload.category.lower()
    icon = "box"
    for k, v in icon_map.items():
        if k in cat_lower:
            icon = v
            break

    new_app = ApplianceModel(
        id=f"app_{uuid.uuid4().hex[:6]}",
        user_id=user_id,
        brand=payload.brand,
        category=payload.category,
        model_no=payload.model_no,
        registered_on=datetime.now().strftime("%d %b %Y"),
        warranty_status="Standard 1 Year Active",
        serial_no=payload.serial_no or f"{payload.brand[:3].upper()}-{uuid.uuid4().hex[:6].upper()}",
        icon=icon
    )
    db.add(new_app)
    db.commit()
    db.refresh(new_app)
    return new_app
