import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.db.models import (
    UserModel, SparePartModel, FranchiseInventoryModel,
    InventoryTransactionModel, CompanyBranchModel
)
from app.schemas import (
    SparePartSchema, SparePartCreatePayload,
    FranchiseInventoryItemSchema, StockMovementPayload
)
from app.security import get_authenticated_user

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

@router.get("/parts", response_model=List[SparePartSchema])
def get_parts_catalog(
    category: Optional[str] = None,
    brand: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(SparePartModel).filter(SparePartModel.is_active == True)
    if category and category.lower() != "all":
        query = query.filter(SparePartModel.category.ilike(f"%{category}%"))
    if brand and brand.lower() != "all":
        query = query.filter(SparePartModel.brand.ilike(f"%{brand}%"))
    if search:
        query = query.filter(
            or_(
                SparePartModel.name.ilike(f"%{search}%"),
                SparePartModel.part_code.ilike(f"%{search}%"),
                SparePartModel.description.ilike(f"%{search}%")
            )
        )
    parts = query.order_by(SparePartModel.name.asc()).all()
    return [
        SparePartSchema(
            id=p.id,
            part_code=p.part_code,
            name=p.name,
            category=p.category,
            brand=p.brand,
            unit_price=p.unit_price,
            hsn_code=p.hsn_code,
            description=p.description,
            is_active=p.is_active
        )
        for p in parts
    ]

@router.post("/parts", response_model=SparePartSchema)
def create_or_update_part(
    payload: SparePartCreatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("admin", "company", "franchise", "branch"):
        raise HTTPException(status_code=403, detail="Unauthorized to modify spare parts catalog")

    existing = db.query(SparePartModel).filter(SparePartModel.part_code == payload.part_code).first()
    if existing:
        existing.name = payload.name
        existing.category = payload.category
        existing.brand = payload.brand
        existing.unit_price = payload.unit_price
        existing.hsn_code = payload.hsn_code
        if payload.description:
            existing.description = payload.description
        db.commit()
        db.refresh(existing)
        part = existing
    else:
        part = SparePartModel(
            id=f"part_{uuid.uuid4().hex[:12]}",
            part_code=payload.part_code.strip().upper(),
            name=payload.name.strip(),
            category=payload.category.strip(),
            brand=payload.brand.strip(),
            unit_price=payload.unit_price,
            hsn_code=payload.hsn_code.strip(),
            description=payload.description
        )
        db.add(part)
        db.commit()
        db.refresh(part)

    return SparePartSchema(
        id=part.id,
        part_code=part.part_code,
        name=part.name,
        category=part.category,
        brand=part.brand,
        unit_price=part.unit_price,
        hsn_code=part.hsn_code,
        description=part.description,
        is_active=part.is_active
    )

@router.get("/branch/{branch_id}", response_model=List[FranchiseInventoryItemSchema])
def get_branch_inventory(
    branch_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    
    # If franchise/branch, resolve their assigned branch if "me" passed
    if branch_id == "me" or not branch_id:
        branch = db.query(CompanyBranchModel).filter(
            or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
        ).first()
        branch_id = branch.id if branch else user.id

    # Join inventories with parts
    items = db.query(FranchiseInventoryModel, SparePartModel).join(
        SparePartModel, FranchiseInventoryModel.part_id == SparePartModel.id
    ).filter(FranchiseInventoryModel.branch_id == branch_id).all()

    # If warehouse is empty, initialize from catalog with default stock
    if not items:
        all_parts = db.query(SparePartModel).all()
        for p in all_parts:
            inv = FranchiseInventoryModel(
                id=f"inv_{uuid.uuid4().hex[:10]}",
                branch_id=branch_id,
                part_id=p.id,
                quantity_available=10,
                reorder_level=4
            )
            db.add(inv)
        db.commit()
        items = db.query(FranchiseInventoryModel, SparePartModel).join(
            SparePartModel, FranchiseInventoryModel.part_id == SparePartModel.id
        ).filter(FranchiseInventoryModel.branch_id == branch_id).all()

    result = []
    for inv, part in items:
        is_low = inv.quantity_available <= inv.reorder_level
        restocked_str = inv.last_restocked_at.strftime("%d %b %Y, %I:%M %p") if inv.last_restocked_at else None
        result.append(
            FranchiseInventoryItemSchema(
                id=inv.id,
                branch_id=inv.branch_id,
                part_id=part.id,
                part_code=part.part_code,
                name=part.name,
                category=part.category,
                brand=part.brand,
                unit_price=part.unit_price,
                hsn_code=part.hsn_code,
                quantity_available=inv.quantity_available,
                reorder_level=inv.reorder_level,
                is_low_stock=is_low,
                last_restocked_at=restocked_str
            )
        )
    return result

@router.post("/stock-movement")
def record_stock_movement(
    payload: StockMovementPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("branch", "franchise", "admin", "company"):
        raise HTTPException(status_code=403, detail="Only franchise supervisor or admin can record stock movements")

    branch_id = payload.branch_id
    if branch_id == "me":
        branch = db.query(CompanyBranchModel).filter(
            or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
        ).first()
        branch_id = branch.id if branch else user.id

    inv = db.query(FranchiseInventoryModel).filter(
        FranchiseInventoryModel.branch_id == branch_id,
        FranchiseInventoryModel.part_id == payload.part_id
    ).first()

    if not inv:
        inv = FranchiseInventoryModel(
            id=f"inv_{uuid.uuid4().hex[:10]}",
            branch_id=branch_id,
            part_id=payload.part_id,
            quantity_available=0,
            reorder_level=5
        )
        db.add(inv)

    qty = payload.quantity
    if payload.transaction_type in ("stock_in", "restock"):
        inv.quantity_available += qty
        inv.last_restocked_at = datetime.utcnow()
    elif payload.transaction_type in ("stock_out", "adjustment"):
        if inv.quantity_available < qty:
            raise HTTPException(status_code=400, detail=f"Insufficient stock in warehouse. Current available: {inv.quantity_available}")
        inv.quantity_available -= qty
    else:
        inv.quantity_available += qty

    txn = InventoryTransactionModel(
        id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
        branch_id=branch_id,
        part_id=payload.part_id,
        transaction_type=payload.transaction_type,
        quantity=qty,
        performed_by=f"{user.name} ({user.role})",
        notes=payload.notes or f"Manual {payload.transaction_type} of {qty} units."
    )
    db.add(txn)
    db.commit()
    db.refresh(inv)

    return {
        "status": "success",
        "message": f"Recorded {payload.transaction_type} of {qty} units.",
        "quantity_available": inv.quantity_available,
        "is_low_stock": inv.quantity_available <= inv.reorder_level
    }
