import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.db.models import (
    UserModel, SparePartModel, PartRequestModel, FranchiseInventoryModel,
    InventoryTransactionModel, CompanyBranchModel
)
from app.schemas import (
    SparePartSchema, SparePartCreatePayload,
    CompanyPartCreatePayload, CompanyPartUpdatePayload, CompanyStockUpdatePayload,
    PartRequestCreatePayload, PartRequestResponseSchema,
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
            stock_quantity=getattr(p, "stock_quantity", 0) or 0,
            company_id=getattr(p, "company_id", None),
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
        stock_quantity=getattr(part, "stock_quantity", 0) or 0,
        company_id=getattr(part, "company_id", None),
        is_active=part.is_active
    )

@router.get("/company/parts", response_model=List[SparePartSchema])
def get_company_inventory_parts(
    search: Optional[str] = None,
    category: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only company or admin can view company inventory")

    query = db.query(SparePartModel).filter(SparePartModel.is_active == True)
    if user.role == "company":
        comp_name = user.name or ""
        query = query.filter(
            or_(
                SparePartModel.company_id == user.id,
                SparePartModel.company_id == None,
                SparePartModel.brand.ilike(f"%{comp_name}%"),
                SparePartModel.brand.ilike("%universal%")
            )
        )
    if category and category.lower() != "all":
        query = query.filter(SparePartModel.category.ilike(f"%{category}%"))
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
            stock_quantity=getattr(p, "stock_quantity", 0) or 0,
            company_id=getattr(p, "company_id", None),
            is_active=p.is_active
        )
        for p in parts
    ]

@router.post("/company/parts", response_model=SparePartSchema)
def add_company_spare_part(
    payload: CompanyPartCreatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only company or admin can add parts to inventory")

    part_code = payload.part_code.strip().upper()
    existing = db.query(SparePartModel).filter(SparePartModel.part_code == part_code).first()
    brand_name = payload.brand.strip() if payload.brand else (user.name if user.role == "company" else "Universal")

    if existing:
        existing.name = payload.name.strip()
        existing.category = payload.category.strip()
        existing.brand = brand_name
        existing.unit_price = payload.unit_price
        existing.hsn_code = payload.hsn_code.strip() if payload.hsn_code else "841890"
        if payload.description:
            existing.description = payload.description.strip()
        existing.stock_quantity = payload.stock_quantity
        if user.role == "company" and not existing.company_id:
            existing.company_id = user.id
        db.commit()
        db.refresh(existing)
        part = existing
    else:
        part = SparePartModel(
            id=f"part_{uuid.uuid4().hex[:12]}",
            part_code=part_code,
            name=payload.name.strip(),
            category=payload.category.strip(),
            brand=brand_name,
            unit_price=payload.unit_price,
            hsn_code=payload.hsn_code.strip() if payload.hsn_code else "841890",
            description=payload.description.strip() if payload.description else None,
            stock_quantity=payload.stock_quantity,
            company_id=user.id if user.role == "company" else None,
            is_active=True
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
        stock_quantity=part.stock_quantity,
        company_id=part.company_id,
        is_active=part.is_active
    )

@router.put("/company/parts/{part_id}/stock")
def update_company_part_stock(
    part_id: str,
    payload: CompanyStockUpdatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only company or admin can update stock quantity")

    part = db.query(SparePartModel).filter(SparePartModel.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Spare part not found")

    old_stock = part.stock_quantity or 0
    if payload.mode == "add":
        new_stock = old_stock + payload.quantity
        delta = payload.quantity
    else:
        new_stock = payload.quantity
        delta = new_stock - old_stock

    if new_stock < 0:
        raise HTTPException(status_code=400, detail="Stock quantity cannot be negative")

    part.stock_quantity = new_stock
    db.commit()
    db.refresh(part)

    return {
        "status": "success",
        "message": f"Updated stock for {part.name} to {part.stock_quantity} units.",
        "part_id": part.id,
        "part_code": part.part_code,
        "stock_quantity": part.stock_quantity
    }

@router.put("/company/parts/{part_id}", response_model=SparePartSchema)
def update_company_part_details(
    part_id: str,
    payload: CompanyPartUpdatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only company or admin can edit spare parts")

    part = db.query(SparePartModel).filter(SparePartModel.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Spare part not found")

    part.name = payload.name.strip()
    part.category = payload.category.strip()
    if payload.brand:
        part.brand = payload.brand.strip()
    part.unit_price = payload.unit_price
    if payload.hsn_code:
        part.hsn_code = payload.hsn_code.strip()
    part.description = payload.description.strip() if payload.description else None

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
        stock_quantity=getattr(part, "stock_quantity", 0) or 0,
        company_id=getattr(part, "company_id", None),
        is_active=part.is_active
    )

@router.post("/part-requests", response_model=PartRequestResponseSchema)
def create_part_request(
    payload: PartRequestCreatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("branch", "franchise", "admin"):
        raise HTTPException(status_code=403, detail="Only franchise branches can request spare parts")

    branch = db.query(CompanyBranchModel).filter(
        or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
    ).first()
    if not branch and user.role == "admin":
        branch = db.query(CompanyBranchModel).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Franchise branch account not found")

    part = db.query(SparePartModel).filter(SparePartModel.id == payload.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Spare part not found")

    # Resolve parent company
    company_id = branch.company_id
    if not company_id:
        company_id = part.company_id
        if not company_id:
            comp_user = db.query(UserModel).filter(UserModel.role == "company").first()
            company_id = comp_user.id if comp_user else None

    if not company_id:
        raise HTTPException(status_code=400, detail="Parent company could not be resolved for this branch")

    req_obj = PartRequestModel(
        id=f"REQ-{uuid.uuid4().hex[:8].upper()}",
        company_id=company_id,
        branch_id=branch.id,
        part_id=part.id,
        quantity=payload.quantity,
        status="Pending",
        notes=payload.notes,
        requested_by=f"{user.name} ({branch.branch_name})",
        created_at=datetime.utcnow()
    )
    db.add(req_obj)
    db.commit()
    db.refresh(req_obj)

    company_user = db.query(UserModel).filter(UserModel.id == company_id).first()

    return PartRequestResponseSchema(
        id=req_obj.id,
        company_id=req_obj.company_id,
        company_name=company_user.name if company_user else "Parent Company",
        branch_id=req_obj.branch_id,
        branch_name=branch.branch_name,
        part_id=part.id,
        part_name=part.name,
        part_code=part.part_code,
        category=part.category,
        unit_price=part.unit_price,
        quantity=req_obj.quantity,
        status=req_obj.status,
        notes=req_obj.notes,
        requested_by=req_obj.requested_by,
        created_at=req_obj.created_at.strftime("%d %b %Y, %I:%M %p"),
        sent_at=None,
        sent_by=None
    )

@router.get("/part-requests", response_model=List[PartRequestResponseSchema])
def list_part_requests(
    status: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    query = db.query(PartRequestModel, SparePartModel, CompanyBranchModel, UserModel).join(
        SparePartModel, PartRequestModel.part_id == SparePartModel.id
    ).join(
        CompanyBranchModel, PartRequestModel.branch_id == CompanyBranchModel.id
    ).outerjoin(
        UserModel, PartRequestModel.company_id == UserModel.id
    )

    if user.role == "company":
        company_branches = db.query(CompanyBranchModel.id).filter(CompanyBranchModel.company_id == user.id).all()
        comp_branch_ids = [b[0] for b in company_branches]
        query = query.filter(
            or_(
                PartRequestModel.company_id == user.id,
                PartRequestModel.branch_id.in_(comp_branch_ids)
            )
        )
    elif user.role in ("branch", "franchise"):
        branch = db.query(CompanyBranchModel).filter(
            or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
        ).first()
        branch_id = branch.id if branch else user.id
        query = query.filter(PartRequestModel.branch_id == branch_id)

    if status and status.lower() != "all":
        query = query.filter(PartRequestModel.status.ilike(status))

    results = query.order_by(PartRequestModel.created_at.desc()).all()

    items = []
    for req_obj, part, branch, comp_user in results:
        items.append(
            PartRequestResponseSchema(
                id=req_obj.id,
                company_id=req_obj.company_id,
                company_name=comp_user.name if comp_user else "Parent Company",
                branch_id=req_obj.branch_id,
                branch_name=branch.branch_name,
                part_id=part.id,
                part_name=part.name,
                part_code=part.part_code,
                category=part.category,
                unit_price=part.unit_price,
                quantity=req_obj.quantity,
                status=req_obj.status,
                notes=req_obj.notes,
                requested_by=req_obj.requested_by,
                created_at=req_obj.created_at.strftime("%d %b %Y, %I:%M %p") if req_obj.created_at else "",
                sent_at=req_obj.sent_at.strftime("%d %b %Y, %I:%M %p") if req_obj.sent_at else None,
                sent_by=req_obj.sent_by
            )
        )
    return items

@router.post("/part-requests/{request_id}/send", response_model=PartRequestResponseSchema)
def send_part_request(
    request_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Only company or admin can send requested parts")

    req_obj = db.query(PartRequestModel).filter(PartRequestModel.id == request_id).first()
    if not req_obj:
        raise HTTPException(status_code=404, detail="Part request not found")

    if req_obj.status == "Sent":
        raise HTTPException(status_code=400, detail="This part request has already been sent")

    part = db.query(SparePartModel).filter(SparePartModel.id == req_obj.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Spare part not found")

    company_stock = part.stock_quantity or 0
    if company_stock < req_obj.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient company warehouse stock. Available: {company_stock}, Requested: {req_obj.quantity}. Please update/restock the part first."
        )

    branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == req_obj.branch_id).first()
    branch_name = branch.branch_name if branch else req_obj.branch_id

    # 1. Decrease stock from company warehouse
    part.stock_quantity -= req_obj.quantity

    # 2. Add stock to franchise warehouse
    inv = db.query(FranchiseInventoryModel).filter(
        FranchiseInventoryModel.branch_id == req_obj.branch_id,
        FranchiseInventoryModel.part_id == req_obj.part_id
    ).first()
    if not inv:
        inv = FranchiseInventoryModel(
            id=f"inv_{uuid.uuid4().hex[:10]}",
            branch_id=req_obj.branch_id,
            part_id=req_obj.part_id,
            quantity_available=0,
            reorder_level=5
        )
        db.add(inv)

    inv.quantity_available += req_obj.quantity
    inv.last_restocked_at = datetime.utcnow()

    # 3. Mark request as Sent
    req_obj.status = "Sent"
    req_obj.sent_at = datetime.utcnow()
    req_obj.sent_by = f"{user.name} ({user.role})"

    # 4. Record transactions
    txn_out = InventoryTransactionModel(
        id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
        branch_id=req_obj.branch_id,
        part_id=part.id,
        transaction_type="transfer_out",
        quantity=req_obj.quantity,
        reference_id=req_obj.id,
        performed_by=f"{user.name} ({user.role})",
        notes=f"Dispatched {req_obj.quantity} units to franchise branch '{branch_name}' (Request {req_obj.id})"
    )
    db.add(txn_out)

    txn_in = InventoryTransactionModel(
        id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
        branch_id=req_obj.branch_id,
        part_id=part.id,
        transaction_type="stock_in",
        quantity=req_obj.quantity,
        reference_id=req_obj.id,
        performed_by=f"{user.name} ({user.role})",
        notes=f"Received OEM shipment of {req_obj.quantity} units from {user.name} (Request {req_obj.id})"
    )
    db.add(txn_in)

    db.commit()
    db.refresh(req_obj)

    comp_user = db.query(UserModel).filter(UserModel.id == req_obj.company_id).first()

    return PartRequestResponseSchema(
        id=req_obj.id,
        company_id=req_obj.company_id,
        company_name=comp_user.name if comp_user else "Parent Company",
        branch_id=req_obj.branch_id,
        branch_name=branch_name,
        part_id=part.id,
        part_name=part.name,
        part_code=part.part_code,
        category=part.category,
        unit_price=part.unit_price,
        quantity=req_obj.quantity,
        status=req_obj.status,
        notes=req_obj.notes,
        requested_by=req_obj.requested_by,
        created_at=req_obj.created_at.strftime("%d %b %Y, %I:%M %p"),
        sent_at=req_obj.sent_at.strftime("%d %b %Y, %I:%M %p") if req_obj.sent_at else None,
        sent_by=req_obj.sent_by
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
