import uuid
import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.db.models import (
    UserModel, SparePartModel, PartRequestModel, FranchiseInventoryModel,
    InventoryTransactionModel, CompanyBranchModel, PartSerialNumberModel,
    TechnicianModel, ServiceRequestModel
)
from app.schemas import (
    SparePartSchema, SparePartCreatePayload,
    CompanyPartCreatePayload, CompanyPartUpdatePayload, CompanyStockUpdatePayload,
    PartRequestCreatePayload, PartRequestResponseSchema,
    FranchiseInventoryItemSchema, StockMovementPayload,
    PartSerialNumberSchema, PartSerialNumberAssignPayload, PartSerialNumberCreatePayload
)
from app.security import get_authenticated_user

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

@router.get("/parts", response_model=List[SparePartSchema])
def get_parts_catalog(
    category: Optional[str] = None,
    brand: Optional[str] = None,
    search: Optional[str] = None,
    company_id: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    query = db.query(SparePartModel).filter(SparePartModel.is_active == True)

    user = None
    if request:
        try:
            user = get_authenticated_user(request, db)
        except Exception:
            user = None

    if user:
        if user.role == "company":
            query = query.filter(SparePartModel.company_id == user.id)
        elif user.role in ("franchise", "branch"):
            branch = db.query(CompanyBranchModel).filter(
                or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
            ).first()
            if branch and branch.company_id:
                query = query.filter(SparePartModel.company_id == branch.company_id)
            elif branch and getattr(branch, "brand", None):
                query = query.filter(SparePartModel.brand.ilike(f"%{branch.brand}%"))
            else:
                query = query.filter(SparePartModel.company_id == "__unassociated__")
        elif user.role == "technician":
            if company_id:
                query = query.filter(SparePartModel.company_id == company_id)
            else:
                tech = db.query(TechnicianModel).filter(TechnicianModel.id == user.id).first()
                tech_company_id = getattr(tech, "company_id", None)
                if not tech_company_id and getattr(tech, "branch_id", None):
                    b = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == tech.branch_id).first()
                    if b and b.company_id:
                        tech_company_id = b.company_id
                if tech_company_id:
                    query = query.filter(SparePartModel.company_id == tech_company_id)
                else:
                    query = query.filter(SparePartModel.company_id == "__unassociated__")
        elif user.role == "admin" and company_id:
            query = query.filter(SparePartModel.company_id == company_id)
    elif company_id:
        query = query.filter(SparePartModel.company_id == company_id)

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
            is_tax_inclusive=getattr(p, "is_tax_inclusive", False) or False,
            hsn_code=p.hsn_code,
            description=p.description,
            stock_quantity=getattr(p, "stock_quantity", 0) or 0,
            part_type=getattr(p, "part_type", "functional") or "functional",
            is_warranty_eligible=getattr(p, "is_warranty_eligible", True) if getattr(p, "is_warranty_eligible", True) is not None else True,
            warranty_component_type=getattr(p, "warranty_component_type", None),
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

    part_code = payload.part_code.strip().upper()
    target_company_id = user.id if user.role == "company" else getattr(payload, "company_id", None)

    if target_company_id:
        existing = db.query(SparePartModel).filter(
            SparePartModel.part_code == part_code,
            SparePartModel.company_id == target_company_id
        ).first()
    else:
        existing = db.query(SparePartModel).filter(
            SparePartModel.part_code == part_code,
            SparePartModel.company_id == None
        ).first()

    if existing:
        existing.name = payload.name.strip()
        existing.category = payload.category.strip()
        existing.brand = payload.brand.strip()
        existing.unit_price = payload.unit_price
        if payload.is_tax_inclusive is not None:
            existing.is_tax_inclusive = bool(payload.is_tax_inclusive)
        existing.hsn_code = payload.hsn_code.strip()
        if payload.description:
            existing.description = payload.description.strip()
        db.commit()
        db.refresh(existing)
        part = existing
    else:
        part = SparePartModel(
            id=f"part_{uuid.uuid4().hex[:12]}",
            part_code=part_code,
            name=payload.name.strip(),
            category=payload.category.strip(),
            brand=payload.brand.strip(),
            unit_price=payload.unit_price,
            is_tax_inclusive=bool(payload.is_tax_inclusive) if payload.is_tax_inclusive is not None else True,
            hsn_code=payload.hsn_code.strip(),
            description=payload.description,
            company_id=target_company_id,
            is_active=True
        )
        db.add(part)
        try:
            db.commit()
            db.refresh(part)
        except IntegrityError as exc:
            db.rollback()
            err_str = str(exc).lower()
            if "ix_spare_parts_part_code" in err_str or "duplicate entry" in err_str:
                try:
                    is_mysql = "mysql" in db.bind.dialect.name.lower()
                    with db.bind.begin() as conn:
                        if is_mysql:
                            conn.execute(text("ALTER TABLE spare_parts DROP INDEX ix_spare_parts_part_code"))
                            conn.execute(text("CREATE INDEX ix_spare_parts_part_code ON spare_parts (part_code)"))
                        else:
                            conn.execute(text("DROP INDEX IF EXISTS ix_spare_parts_part_code"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_spare_parts_part_code ON spare_parts (part_code)"))
                except Exception:
                    pass
                db.add(part)
                db.commit()
                db.refresh(part)
            else:
                raise exc

    return SparePartSchema(
        id=part.id,
        part_code=part.part_code,
        name=part.name,
        category=part.category,
        brand=part.brand,
        unit_price=part.unit_price,
        is_tax_inclusive=getattr(part, "is_tax_inclusive", False) or False,
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
        query = query.filter(SparePartModel.company_id == user.id)
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
            is_tax_inclusive=getattr(p, "is_tax_inclusive", False) or False,
            hsn_code=p.hsn_code,
            description=p.description,
            stock_quantity=getattr(p, "stock_quantity", 0) or 0,
            part_type=getattr(p, "part_type", "functional") or "functional",
            is_warranty_eligible=getattr(p, "is_warranty_eligible", True) if getattr(p, "is_warranty_eligible", True) is not None else True,
            warranty_component_type=getattr(p, "warranty_component_type", None),
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
    brand_name = payload.brand.strip() if payload.brand else (user.name if user.role == "company" else "Universal")
    part_type = payload.part_type or "functional"
    is_w_eligible = bool(payload.is_warranty_eligible if payload.is_warranty_eligible is not None else (part_type == "functional"))

    comp_type = payload.warranty_component_type.strip().lower() if (payload.warranty_component_type and payload.warranty_component_type.strip()) else None

    is_tax_inc = bool(payload.is_tax_inclusive) if payload.is_tax_inclusive is not None else True

    target_company_id = user.id if user.role == "company" else getattr(payload, "company_id", None)

    if target_company_id:
        existing = db.query(SparePartModel).filter(
            SparePartModel.part_code == part_code,
            SparePartModel.company_id == target_company_id
        ).first()
    else:
        existing = db.query(SparePartModel).filter(
            SparePartModel.part_code == part_code,
            SparePartModel.company_id == None
        ).first()

    if existing:
        existing.name = payload.name.strip()
        existing.category = payload.category.strip()
        existing.brand = brand_name
        existing.unit_price = payload.unit_price
        existing.is_tax_inclusive = is_tax_inc
        existing.hsn_code = payload.hsn_code.strip() if payload.hsn_code else "841890"
        if payload.description:
            existing.description = payload.description.strip()
        existing.stock_quantity = payload.stock_quantity
        existing.part_type = part_type
        existing.is_warranty_eligible = is_w_eligible
        existing.warranty_component_type = comp_type
        if target_company_id and not existing.company_id:
            existing.company_id = target_company_id
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
            is_tax_inclusive=is_tax_inc,
            hsn_code=payload.hsn_code.strip() if payload.hsn_code else "841890",
            description=payload.description.strip() if payload.description else None,
            stock_quantity=payload.stock_quantity,
            part_type=part_type,
            is_warranty_eligible=is_w_eligible,
            warranty_component_type=comp_type,
            company_id=target_company_id,
            is_active=True
        )
        db.add(part)
        try:
            db.commit()
            db.refresh(part)
        except IntegrityError as exc:
            db.rollback()
            err_str = str(exc).lower()
            if "ix_spare_parts_part_code" in err_str or "duplicate entry" in err_str:
                try:
                    is_mysql = "mysql" in db.bind.dialect.name.lower()
                    with db.bind.begin() as conn:
                        if is_mysql:
                            conn.execute(text("ALTER TABLE spare_parts DROP INDEX ix_spare_parts_part_code"))
                            conn.execute(text("CREATE INDEX ix_spare_parts_part_code ON spare_parts (part_code)"))
                        else:
                            conn.execute(text("DROP INDEX IF EXISTS ix_spare_parts_part_code"))
                            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_spare_parts_part_code ON spare_parts (part_code)"))
                except Exception:
                    pass
                db.add(part)
                db.commit()
                db.refresh(part)
            else:
                raise exc

    return SparePartSchema(
        id=part.id,
        part_code=part.part_code,
        name=part.name,
        category=part.category,
        brand=part.brand,
        unit_price=part.unit_price,
        is_tax_inclusive=getattr(part, "is_tax_inclusive", False) or False,
        hsn_code=part.hsn_code,
        description=part.description,
        stock_quantity=part.stock_quantity,
        part_type=getattr(part, "part_type", "functional") or "functional",
        is_warranty_eligible=getattr(part, "is_warranty_eligible", True) if getattr(part, "is_warranty_eligible", True) is not None else True,
        warranty_component_type=getattr(part, "warranty_component_type", None),
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
    if user.role == "company" and part.company_id and part.company_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify another company's spare part")
    if user.role == "company" and not part.company_id:
        part.company_id = user.id

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
    if user.role == "company" and part.company_id and part.company_id != user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify another company's spare part")
    if user.role == "company" and not part.company_id:
        part.company_id = user.id

    part.name = payload.name.strip()
    part.category = payload.category.strip()
    if payload.brand:
        part.brand = payload.brand.strip()
    part.unit_price = payload.unit_price
    if payload.is_tax_inclusive is not None:
        part.is_tax_inclusive = bool(payload.is_tax_inclusive)
    if payload.hsn_code:
        part.hsn_code = payload.hsn_code.strip()
    part.description = payload.description.strip() if payload.description else None
    if payload.part_type:
        part.part_type = payload.part_type
    if payload.is_warranty_eligible is not None:
        part.is_warranty_eligible = payload.is_warranty_eligible
    if payload.warranty_component_type is not None:
        part.warranty_component_type = payload.warranty_component_type.strip().lower() if payload.warranty_component_type.strip() else None

    db.commit()
    db.refresh(part)

    return SparePartSchema(
        id=part.id,
        part_code=part.part_code,
        name=part.name,
        category=part.category,
        brand=part.brand,
        unit_price=part.unit_price,
        is_tax_inclusive=getattr(part, "is_tax_inclusive", False) or False,
        hsn_code=part.hsn_code,
        description=part.description,
        stock_quantity=getattr(part, "stock_quantity", 0) or 0,
        part_type=getattr(part, "part_type", "functional") or "functional",
        is_warranty_eligible=getattr(part, "is_warranty_eligible", True) if getattr(part, "is_warranty_eligible", True) is not None else True,
        warranty_component_type=getattr(part, "warranty_component_type", None),
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

    # Enforce company brand isolation: part must belong to the franchise's company
    if branch.company_id and part.company_id and part.company_id != branch.company_id:
        raise HTTPException(status_code=400, detail="Cannot request spare parts registered by another company")

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
        request_id=payload.request_id,
        technician_id=payload.technician_id or (user.id if user.role == "technician" else None),
        technician_name=payload.technician_name or (user.name if user.role == "technician" else None),
        stock_status_at_request=payload.stock_status_at_request or "in_stock",
        created_at=datetime.utcnow()
    )
    db.add(req_obj)

    # If linked to a service request, update service request state if out of stock
    if payload.request_id:
        sr = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == payload.request_id).first()
        if sr and payload.stock_status_at_request == "out_of_stock":
            sr.status = "Part Requested but Out of Stock"
            sr.status_badge = "Part Requested but Out of Stock"
            now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
            timeline = json.loads(sr.timeline_json) if sr.timeline_json else []
            for step in timeline:
                if step.get("id") == "step_4":
                    step["state"] = "current"
                    step["timestamp"] = now_str
                    step["description"] = f"Part {part.name} requested by technician {req_obj.technician_name or user.name}, but out of stock at branch. OEM supply order placed."
            sr.timeline_json = json.dumps(timeline)

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
        request_id=req_obj.request_id,
        technician_id=req_obj.technician_id,
        technician_name=req_obj.technician_name,
        stock_status_at_request=req_obj.stock_status_at_request,
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
    elif user.role == "technician":
        query = query.filter(
            or_(
                PartRequestModel.technician_id == user.id,
                PartRequestModel.requested_by.ilike(f"%{user.name}%")
            )
        )

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
                request_id=req_obj.request_id,
                technician_id=req_obj.technician_id,
                technician_name=req_obj.technician_name,
                stock_status_at_request=getattr(req_obj, "stock_status_at_request", "in_stock"),
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

    # 5. Automatically generate serialized units for franchise stock
    for _ in range(req_obj.quantity):
        brand_prefix = (part.brand[:3] if part.brand else "OEM").upper()
        new_sn = f"SN-{brand_prefix}-{uuid.uuid4().hex[:6].upper()}"
        psn = PartSerialNumberModel(
            id=f"PSN-{uuid.uuid4().hex[:8].upper()}",
            serial_number=new_sn,
            part_id=part.id,
            branch_id=req_obj.branch_id,
            company_id=req_obj.company_id,
            status="in_stock",
            created_at=datetime.utcnow()
        )
        db.add(psn)

    # 6. If request was linked to a service request awaiting out of stock part, transition to "Part Requested"
    if req_obj.request_id:
        sr = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == req_obj.request_id).first()
        if sr and sr.status == "Part Requested but Out of Stock":
            sr.status = "Part Requested"
            sr.status_badge = "Part Requested"
            now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
            timeline = json.loads(sr.timeline_json) if sr.timeline_json else []
            for step in timeline:
                if step.get("id") == "step_4":
                    step["state"] = "current"
                    step["timestamp"] = now_str
                    step["description"] = f"Part {part.name} dispatched by Brand OEM to local branch '{branch_name}'. Part received and ready for technician assignment."
            sr.timeline_json = json.dumps(timeline)

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
        request_id=req_obj.request_id,
        technician_id=req_obj.technician_id,
        technician_name=req_obj.technician_name,
        stock_status_at_request=getattr(req_obj, "stock_status_at_request", "in_stock"),
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
    branch = None
    if branch_id == "me" or not branch_id:
        branch = db.query(CompanyBranchModel).filter(
            or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
        ).first()
        branch_id = branch.id if branch else user.id
    else:
        branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == branch_id).first()

    # Join inventories with parts
    query = db.query(FranchiseInventoryModel, SparePartModel).join(
        SparePartModel, FranchiseInventoryModel.part_id == SparePartModel.id
    ).filter(FranchiseInventoryModel.branch_id == branch_id)

    # Strictly isolate warehouse inventory to parts registered by this branch's company
    if branch and branch.company_id:
        query = query.filter(SparePartModel.company_id == branch.company_id)
    elif user.role == "company":
        query = query.filter(SparePartModel.company_id == user.id)

    items = query.all()

    # If warehouse is empty, return empty list without auto-populating
    if not items:
        return []

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

# ==========================================
# Serialized Spare Parts & Allocation Engine
# ==========================================

@router.get("/serialized-parts", response_model=List[PartSerialNumberSchema])
def list_serialized_parts(
    branch_id: Optional[str] = None,
    part_id: Optional[str] = None,
    status: Optional[str] = None,
    technician_id: Optional[str] = None,
    request_id: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    query = db.query(PartSerialNumberModel, SparePartModel, CompanyBranchModel).join(
        SparePartModel, PartSerialNumberModel.part_id == SparePartModel.id
    ).join(
        CompanyBranchModel, PartSerialNumberModel.branch_id == CompanyBranchModel.id
    )

    if user.role in ("branch", "franchise"):
        branch = db.query(CompanyBranchModel).filter(
            or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
        ).first()
        b_id = branch.id if branch else user.id
        query = query.filter(PartSerialNumberModel.branch_id == b_id)
        if branch and branch.company_id:
            query = query.filter(SparePartModel.company_id == branch.company_id)
    elif user.role == "company":
        query = query.filter(SparePartModel.company_id == user.id)
    elif user.role == "technician":
        query = query.filter(
            or_(
                PartSerialNumberModel.assigned_tech_id == user.id,
                PartSerialNumberModel.assigned_tech_name.ilike(f"%{user.name}%")
            )
        )
    elif branch_id:
        query = query.filter(PartSerialNumberModel.branch_id == branch_id)

    if part_id:
        query = query.filter(PartSerialNumberModel.part_id == part_id)
    if status and status.lower() != "all":
        query = query.filter(PartSerialNumberModel.status == status)
    if technician_id:
        query = query.filter(PartSerialNumberModel.assigned_tech_id == technician_id)
    if request_id:
        query = query.filter(PartSerialNumberModel.request_id == request_id)

    results = query.order_by(PartSerialNumberModel.created_at.desc()).all()

    sr_ids = [psn.request_id for psn, _, _ in results if psn.request_id]
    sr_map = {}
    if sr_ids:
        srs = db.query(ServiceRequestModel).filter(ServiceRequestModel.id.in_(sr_ids)).all()
        sr_map = {s.id: s for s in srs}

    items = []
    for psn, part, branch in results:
        sr = sr_map.get(psn.request_id) if psn.request_id else None
        items.append(
            PartSerialNumberSchema(
                id=psn.id,
                serial_number=psn.serial_number,
                part_id=part.id,
                part_name=part.name,
                part_code=part.part_code,
                category=part.category,
                unit_price=part.unit_price,
                hsn_code=part.hsn_code,
                branch_id=branch.id,
                branch_name=branch.branch_name,
                company_id=psn.company_id or part.company_id,
                assigned_tech_id=psn.assigned_tech_id,
                assigned_tech_name=psn.assigned_tech_name,
                request_id=psn.request_id,
                customer_name=sr.customer_name if sr else None,
                appliance_name=sr.appliance_name if sr else None,
                status=psn.status,
                assigned_at=psn.assigned_at.strftime("%d %b %Y, %I:%M %p") if psn.assigned_at else None,
                installed_at=psn.installed_at.strftime("%d %b %Y, %I:%M %p") if psn.installed_at else None,
                created_at=psn.created_at.strftime("%d %b %Y, %I:%M %p") if psn.created_at else ""
            )
        )
    return items

@router.post("/serialized-parts/assign", response_model=PartSerialNumberSchema)
def assign_serialized_part(
    payload: PartSerialNumberAssignPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("branch", "franchise", "admin", "company"):
        raise HTTPException(status_code=403, detail="Only franchise branch managers or platform admins can assign parts to technicians")

    psn = db.query(PartSerialNumberModel).filter(
        PartSerialNumberModel.serial_number == payload.serial_number.strip().upper()
    ).first()
    if not psn:
        raise HTTPException(status_code=404, detail=f"Serial Number '{payload.serial_number}' not found")

    if psn.status != "in_stock":
        raise HTTPException(status_code=400, detail=f"Serial Number '{payload.serial_number}' is not available in stock (Current status: {psn.status})")

    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == payload.request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    tech_id = payload.technician_id
    tech_name = payload.technician_name
    if not tech_name:
        tech_obj = db.query(TechnicianModel).filter(TechnicianModel.id == tech_id).first()
        tech_name = tech_obj.name if tech_obj else tech_id

    part = db.query(SparePartModel).filter(SparePartModel.id == psn.part_id).first()
    part_name = part.name if part else "Spare Part"

    now = datetime.utcnow()
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")

    # 1. Update Serialized Part status
    psn.assigned_tech_id = tech_id
    psn.assigned_tech_name = tech_name
    psn.request_id = req.id
    psn.status = "assigned_to_tech"
    psn.assigned_at = now

    # 2. Update Franchise Warehouse Inventory count
    inv = db.query(FranchiseInventoryModel).filter(
        FranchiseInventoryModel.branch_id == psn.branch_id,
        FranchiseInventoryModel.part_id == psn.part_id
    ).first()
    if inv:
        inv.quantity_available = max(0, inv.quantity_available - 1)

    # 3. Record Inventory Transaction
    txn = InventoryTransactionModel(
        id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
        branch_id=psn.branch_id,
        part_id=psn.part_id,
        transaction_type="tech_dispatch",
        quantity=1,
        reference_id=req.id,
        performed_by=f"{user.name} ({user.role})",
        notes=f"Assigned serialized unit {psn.serial_number} to {tech_name} for ticket {req.id}"
    )
    db.add(txn)

    # 4. Update PartRequestModel if exists for this request & part
    pr = db.query(PartRequestModel).filter(
        PartRequestModel.request_id == req.id,
        PartRequestModel.part_id == psn.part_id
    ).first()
    if pr:
        pr.status = "Assigned"

    # 5. Transition Service Request Status to "Part Assigned to Technician"
    req.status = "Part Assigned to Technician"
    req.status_badge = "Part Assigned to Technician"

    timeline = json.loads(req.timeline_json) if req.timeline_json else []
    for step in timeline:
        if step.get("id") == "step_4":
            step["state"] = "current"
            step["timestamp"] = now_str
            step["description"] = f"Part {part_name} (S/N: {psn.serial_number}) assigned to technician {tech_name} by franchise. Doorstep installation authorized."
    req.timeline_json = json.dumps(timeline)

    db.commit()
    db.refresh(psn)
    db.refresh(req)

    branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == psn.branch_id).first()

    return PartSerialNumberSchema(
        id=psn.id,
        serial_number=psn.serial_number,
        part_id=part.id if part else psn.part_id,
        part_name=part.name if part else "",
        part_code=part.part_code if part else "",
        category=part.category if part else "",
        unit_price=part.unit_price if part else 0.0,
        hsn_code=part.hsn_code if part else "8418",
        branch_id=psn.branch_id,
        branch_name=branch.branch_name if branch else psn.branch_id,
        company_id=psn.company_id,
        assigned_tech_id=psn.assigned_tech_id,
        assigned_tech_name=psn.assigned_tech_name,
        request_id=psn.request_id,
        customer_name=req.customer_name,
        appliance_name=req.appliance_name,
        status=psn.status,
        assigned_at=psn.assigned_at.strftime("%d %b %Y, %I:%M %p") if psn.assigned_at else None,
        installed_at=None,
        created_at=psn.created_at.strftime("%d %b %Y, %I:%M %p") if psn.created_at else ""
    )

@router.post("/serialized-parts/create", response_model=List[PartSerialNumberSchema])
def create_serialized_parts(
    payload: PartSerialNumberCreatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    if user.role not in ("branch", "franchise", "company", "admin"):
        raise HTTPException(status_code=403, detail="Unauthorized to add serialized parts")

    branch_id = payload.branch_id
    if not branch_id:
        if user.role in ("branch", "franchise"):
            branch = db.query(CompanyBranchModel).filter(
                or_(CompanyBranchModel.id == user.id, CompanyBranchModel.email == user.email)
            ).first()
            branch_id = branch.id if branch else user.id
        else:
            first_br = db.query(CompanyBranchModel).first()
            branch_id = first_br.id if first_br else "branch_1"

    part = db.query(SparePartModel).filter(SparePartModel.id == payload.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Spare part not found")

    created = []
    now = datetime.utcnow()
    for sn in payload.serial_numbers:
        sn_clean = sn.strip().upper()
        if not sn_clean:
            continue
        exists = db.query(PartSerialNumberModel).filter(PartSerialNumberModel.serial_number == sn_clean).first()
        if exists:
            continue
        item = PartSerialNumberModel(
            id=f"PSN-{uuid.uuid4().hex[:8].upper()}",
            serial_number=sn_clean,
            part_id=part.id,
            branch_id=branch_id,
            company_id=part.company_id,
            status="in_stock",
            created_at=now
        )
        db.add(item)
        created.append(item)

    if created:
        inv = db.query(FranchiseInventoryModel).filter(
            FranchiseInventoryModel.branch_id == branch_id,
            FranchiseInventoryModel.part_id == part.id
        ).first()
        if not inv:
            inv = FranchiseInventoryModel(
                id=f"inv_{uuid.uuid4().hex[:10]}",
                branch_id=branch_id,
                part_id=part.id,
                quantity_available=0,
                reorder_level=5
            )
            db.add(inv)
        inv.quantity_available += len(created)
        inv.last_restocked_at = now

        txn = InventoryTransactionModel(
            id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
            branch_id=branch_id,
            part_id=part.id,
            transaction_type="stock_in",
            quantity=len(created),
            performed_by=f"{user.name} ({user.role})",
            notes=f"Registered {len(created)} new serialized units for {part.name}"
        )
        db.add(txn)

    db.commit()

    branch = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == branch_id).first()
    return [
        PartSerialNumberSchema(
            id=it.id,
            serial_number=it.serial_number,
            part_id=part.id,
            part_name=part.name,
            part_code=part.part_code,
            category=part.category,
            unit_price=part.unit_price,
            hsn_code=part.hsn_code,
            branch_id=branch_id,
            branch_name=branch.branch_name if branch else branch_id,
            company_id=it.company_id,
            status=it.status,
            created_at=it.created_at.strftime("%d %b %Y, %I:%M %p")
        )
        for it in created
    ]
