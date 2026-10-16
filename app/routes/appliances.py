from fastapi import APIRouter, Request, HTTPException
from typing import List
import uuid
from datetime import datetime
from app.database import APPLIANCES, USERS
from app.models import Appliance, NewApplianceCreate

router = APIRouter(prefix="/api/appliances", tags=["appliances"])

def get_current_user_id(request: Request) -> str:
    return request.cookies.get("servora_user_id", "customer_1")

@router.get("", response_model=List[Appliance])
def get_user_appliances(request: Request):
    user_id = get_current_user_id(request)
    return APPLIANCES.get(user_id, APPLIANCES.get("customer_1", []))

@router.post("", response_model=Appliance)
def add_appliance(payload: NewApplianceCreate, request: Request):
    user_id = get_current_user_id(request)
    if user_id not in APPLIANCES:
        APPLIANCES[user_id] = []
    
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

    new_app = Appliance(
        id=f"app_{uuid.uuid4().hex[:6]}",
        brand=payload.brand,
        category=payload.category,
        model_no=payload.model_no,
        registered_on=datetime.now().strftime("%d %b %Y"),
        warranty_status="Standard 1 Year Active",
        serial_no=payload.serial_no or f"{payload.brand[:3].upper()}-{uuid.uuid4().hex[:6].upper()}",
        icon=icon
    )
    
    APPLIANCES[user_id].insert(0, new_app)
    return new_app
