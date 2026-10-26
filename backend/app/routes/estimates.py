import re
import json
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import (
    ServiceRequestModel, EstimateModel, TechnicianModel, UserModel, ApplianceModel,
    SparePartModel, PartRequestModel, FranchiseInventoryModel, CompanyBranchModel, BranchTechnicianModel
)
from app.schemas import (
    EstimateCreatePayload,
    EstimateResponse,
    EstimateRespondPayload,
    EstimatePartItem
)
from app.security import get_authenticated_user
from app.notification_service import notify_estimate_submitted
from app.routes.warranty_amc import evaluate_part_warranty_status

router = APIRouter(prefix="/api/requests", tags=["estimates"])

def format_estimate(est: EstimateModel) -> EstimateResponse:
    parts_raw = json.loads(est.parts_json) if est.parts_json else []
    parts = [EstimatePartItem(**p) if isinstance(p, dict) else p for p in parts_raw]
    covered_parts_cost = sum(p.total_price if p.total_price else (p.quantity * p.unit_price) for p in parts if getattr(p, "is_covered", False))
    customer_parts_cost = sum(p.total_price if p.total_price else (p.quantity * p.unit_price) for p in parts if not getattr(p, "is_covered", False))
    parts_total = covered_parts_cost + customer_parts_cost
    return EstimateResponse(
        id=est.id,
        request_id=est.request_id,
        technician_id=est.technician_id,
        technician_name=est.technician_name,
        parts=parts,
        labor_estimate=est.labor_estimate,
        inspection_fee=est.inspection_fee,
        parts_total=round(parts_total, 2),
        covered_parts_cost=round(covered_parts_cost, 2),
        customer_parts_cost=round(customer_parts_cost, 2),
        total_estimate=est.total_estimate,
        status=est.status,
        customer_remarks=est.customer_remarks,
        created_at=est.created_at,
        responded_at=est.responded_at
    )

@router.get("/{request_id}/estimate/parts-catalog")
def get_estimate_parts_catalog(
    request_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    appliance = db.query(ApplianceModel).filter(ApplianceModel.id == req.appliance_id).first() if req.appliance_id else None

    # Resolve company_ids for this ticket (matching company_id, brand name, and brand tokens)
    company_ids = set()
    if req.company_id:
        company_ids.add(req.company_id)
    if appliance and appliance.company_id:
        company_ids.add(appliance.company_id)

    brand_val = (req.brand or (appliance.brand if appliance else "") or "").strip()
    brand_tokens = [t for t in re.split(r"[\s\-_]+", brand_val) if len(t) >= 3] if brand_val else []

    if brand_val:
        comp_filters = [
            UserModel.name.ilike(f"%{brand_val}%"),
            UserModel.email.ilike(f"%{brand_val}%"),
            UserModel.id.ilike(f"%{brand_val}%")
        ]
        for token in brand_tokens:
            comp_filters.append(UserModel.name.ilike(f"%{token}%"))
            comp_filters.append(UserModel.email.ilike(f"%{token}%"))

        comp_users = db.query(UserModel).filter(
            UserModel.role == "company",
            or_(*comp_filters)
        ).all()
        for c in comp_users:
            company_ids.add(c.id)

    resolved_company_id = req.company_id or (appliance.company_id if appliance else None)
    if not resolved_company_id and company_ids:
        resolved_company_id = next(iter(company_ids))

    is_comprehensive_active = bool(getattr(req, "is_under_warranty", False))
    if not is_comprehensive_active and appliance and appliance.warranty_status:
        st = appliance.warranty_status.lower()
        if "active" in st or "under" in st or "approved" in st:
            if appliance.warranty_end_date:
                try:
                    for fmt in ("%d %b %Y", "%Y-%m-%d", "%d/%m/%Y"):
                        try:
                            end_dt = datetime.strptime(appliance.warranty_end_date.strip(), fmt).date()
                            if datetime.now().date() <= end_dt:
                                is_comprehensive_active = True
                            break
                        except ValueError:
                            pass
                except Exception:
                    is_comprehensive_active = True
            else:
                is_comprehensive_active = True

    part_filters = []
    if company_ids:
        part_filters.append(SparePartModel.company_id.in_(list(company_ids)))
    if brand_val:
        part_filters.append(SparePartModel.brand.ilike(f"%{brand_val}%"))
        for token in brand_tokens:
            part_filters.append(SparePartModel.brand.ilike(f"%{token}%"))

    query = db.query(SparePartModel).filter(SparePartModel.is_active == True)
    if part_filters:
        query = query.filter(or_(*part_filters))
    else:
        query = query.filter(SparePartModel.company_id == "__none__")

    parts = query.order_by(SparePartModel.name.asc()).all()

    catalog = []
    for p in parts:
        is_cov, cov_type, reason = evaluate_part_warranty_status(
            part_name=p.name,
            part_code=p.part_code,
            db_part=p,
            req=req,
            appliance=appliance,
            is_comprehensive_active=is_comprehensive_active,
            db=db
        )
        catalog.append({
            "id": p.id,
            "part_code": p.part_code,
            "name": p.name,
            "category": p.category,
            "brand": p.brand,
            "unit_price": p.unit_price,
            "stock_quantity": getattr(p, "stock_quantity", 0) or 0,
            "part_type": getattr(p, "part_type", "functional") or "functional",
            "is_warranty_eligible": getattr(p, "is_warranty_eligible", True),
            "warranty_component_type": getattr(p, "warranty_component_type", None),
            "is_covered": bool(is_cov),
            "coverage_type": cov_type,
            "coverage_reason": reason
        })

    company_name = req.brand
    if resolved_company_id:
        c_user = db.query(UserModel).filter(UserModel.id == resolved_company_id).first()
        if c_user:
            company_name = c_user.name

    return {
        "request_id": req.id,
        "company_id": resolved_company_id,
        "company_name": company_name,
        "appliance_name": req.appliance_name,
        "brand": req.brand,
        "is_under_warranty": is_comprehensive_active,
        "parts": catalog
    }

@router.get("/{request_id}/estimate", response_model=EstimateResponse)
def get_estimate(request_id: str, db: Session = Depends(get_db)):
    est = db.query(EstimateModel).filter(EstimateModel.request_id == request_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="No estimate found for this service request")
    return format_estimate(est)

@router.post("/{request_id}/estimate", response_model=EstimateResponse)
def create_or_update_estimate(
    request_id: str,
    payload: EstimateCreatePayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    if user.role not in ("technician", "franchise", "branch", "company", "admin"):
        raise HTTPException(status_code=403, detail="Only technicians or franchise staff can submit pre-repair estimates")

    tech_id = req.technician_id or user.id
    tech_name = user.name
    if req.technician_id:
        tech_model = db.query(TechnicianModel).filter(TechnicianModel.id == req.technician_id).first()
        if tech_model:
            tech_name = tech_model.name

    is_under_warranty = bool(getattr(req, "is_under_warranty", False))
    appliance_rec = db.query(ApplianceModel).filter(ApplianceModel.id == req.appliance_id).first() if req.appliance_id else None

    # Calculate parts and split totals (Covered vs Customer Billable)
    parts_list = []
    parts_total = 0.0
    covered_parts_total = 0.0
    customer_parts_total = 0.0

    for p in payload.parts:
        item_total = round(p.quantity * p.unit_price, 2)
        parts_total += item_total
        p_dict = p.model_dump() if hasattr(p, "model_dump") else p.dict()
        p_dict["total_price"] = item_total

        is_covered = p.is_covered
        cov_type = getattr(p, "coverage_type", None)
        reason = getattr(p, "non_coverage_reason", None)

        db_part = None
        if getattr(p, "part_id", None):
            db_part = db.query(SparePartModel).filter(SparePartModel.id == p.part_id).first()
        if not db_part and getattr(p, "part_code", None):
            req_comp_id = getattr(req, "company_id", None) or (appliance_rec.company_id if appliance_rec else None)
            if req_comp_id:
                db_part = db.query(SparePartModel).filter(
                    SparePartModel.part_code == p.part_code,
                    SparePartModel.company_id == req_comp_id
                ).first()
            else:
                db_part = db.query(SparePartModel).filter(SparePartModel.part_code == p.part_code).first()

        if is_covered is None:
            is_covered, cov_type, reason = evaluate_part_warranty_status(
                part_name=p.part_name,
                part_code=getattr(p, "part_code", None),
                db_part=db_part,
                req=req,
                appliance=appliance_rec,
                is_comprehensive_active=is_under_warranty,
                db=db
            )

        p_dict["is_covered"] = bool(is_covered)
        p_dict["coverage_type"] = cov_type or ("oem_warranty" if is_covered else "customer_billable")
        p_dict["non_coverage_reason"] = reason if not is_covered else None
        p_dict["warranty_component_type"] = getattr(db_part, "warranty_component_type", None) if db_part else getattr(p, "warranty_component_type", None)

        if is_covered:
            covered_parts_total += item_total
        else:
            customer_parts_total += item_total

        parts_list.append(p_dict)

    if is_under_warranty:
        inspection_fee = 0.0
        labor_estimate = 0.0 if covered_parts_total > 0 and customer_parts_total == 0 else round(payload.labor_estimate, 2)
    else:
        inspection_fee = payload.inspection_fee if payload.inspection_fee is not None else 299.0
        labor_estimate = round(payload.labor_estimate, 2)

    total_estimate = round(customer_parts_total + labor_estimate + inspection_fee, 2)
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")

    est_id = f"EST-{req.id.replace('SR-', '')}"
    est = db.query(EstimateModel).filter(EstimateModel.request_id == request_id).first()
    if est:
        est.parts_json = json.dumps(parts_list)
        est.labor_estimate = labor_estimate
        est.inspection_fee = inspection_fee
        est.total_estimate = total_estimate
        est.status = "pending"
        est.customer_remarks = None
        est.created_at = now_str
        est.responded_at = None
    else:
        est = EstimateModel(
            id=est_id,
            request_id=req.id,
            technician_id=tech_id,
            technician_name=tech_name,
            parts_json=json.dumps(parts_list),
            labor_estimate=labor_estimate,
            inspection_fee=inspection_fee,
            total_estimate=total_estimate,
            status="pending",
            customer_remarks=None,
            created_at=now_str,
            responded_at=None
        )
        db.add(est)

    # Transition request status to "Estimate Pending Approval"
    req.status = "Estimate Pending Approval"
    req.status_badge = "Estimate Pending"

    # Update timeline
    timeline = json.loads(req.timeline_json) if req.timeline_json else []
    estimate_timeline_step = {
        "id": "step_estimate",
        "title": "Estimate Pending Approval",
        "timestamp": now_str,
        "description": f"Pre-repair estimate of ₹{total_estimate:.2f} submitted by {tech_name}. Awaiting customer approval.",
        "state": "current"
    }
    # Replace existing or insert before completed
    existing_idx = next((i for i, s in enumerate(timeline) if s.get("id") == "step_estimate"), None)
    if existing_idx is not None:
        timeline[existing_idx] = estimate_timeline_step
    else:
        # Insert before step_5 (completed)
        step_5_idx = next((i for i, s in enumerate(timeline) if s.get("id") == "step_5"), len(timeline))
        timeline.insert(step_5_idx, estimate_timeline_step)
    
    req.timeline_json = json.dumps(timeline)

    db.commit()
    db.refresh(est)
    db.refresh(req)

    # Send Brevo email notification to customer
    notify_estimate_submitted(req, est, db)

    return format_estimate(est)

@router.post("/{request_id}/estimate/respond", response_model=EstimateResponse)
def respond_to_estimate(
    request_id: str,
    payload: EstimateRespondPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_authenticated_user(request, db)
    req = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")

    if user.role != "customer" and user.role != "admin":
        if req.customer_id != user.id:
            raise HTTPException(status_code=403, detail="Only the booking customer or admin can approve/reject estimates")

    est = db.query(EstimateModel).filter(EstimateModel.request_id == request_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="No estimate found to respond to")

    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    timeline = json.loads(req.timeline_json) if req.timeline_json else []

    if payload.action == "approve":
        est.status = "approved"
        est.customer_remarks = payload.remarks or "Approved by customer"
        est.responded_at = now_str

        # Parse parts from estimate
        parts_list = json.loads(est.parts_json) if est.parts_json else []

        if parts_list:
            # Resolve technician and branch
            tech_id = est.technician_id or req.technician_id
            tech_name = est.technician_name
            if not tech_name and tech_id:
                tech_obj = db.query(TechnicianModel).filter(TechnicianModel.id == tech_id).first()
                tech_name = tech_obj.name if tech_obj else "Field Technician"
            elif not tech_name:
                tech_name = "Field Technician"

            branch_id = req.branch_id
            if not branch_id and tech_id:
                bt = db.query(BranchTechnicianModel).filter(BranchTechnicianModel.technician_id == tech_id).first()
                if bt:
                    branch_id = bt.branch_id
            if not branch_id:
                first_branch = db.query(CompanyBranchModel).first()
                branch_id = first_branch.id if first_branch else "branch_1"
            req.branch_id = branch_id

            has_out_of_stock = False
            part_descriptions = []

            for p in parts_list:
                part_name = p.get("part_name", "")
                part_code = p.get("part_code", "")
                part_id = p.get("part_id", "")
                p_qty = p.get("quantity", 1)

                part_obj = None
                if part_id:
                    part_obj = db.query(SparePartModel).filter(SparePartModel.id == part_id).first()
                if not part_obj and part_code:
                    if req and getattr(req, "company_id", None):
                        part_obj = db.query(SparePartModel).filter(
                            SparePartModel.part_code == part_code,
                            or_(SparePartModel.company_id == req.company_id, SparePartModel.company_id == None)
                        ).first()
                    else:
                        part_obj = db.query(SparePartModel).filter(SparePartModel.part_code == part_code).first()
                if not part_obj and part_name:
                    if req and getattr(req, "company_id", None):
                        part_obj = db.query(SparePartModel).filter(
                            SparePartModel.name.ilike(f"%{part_name}%"),
                            or_(SparePartModel.company_id == req.company_id, SparePartModel.company_id == None)
                        ).first()
                    else:
                        part_obj = db.query(SparePartModel).filter(SparePartModel.name.ilike(f"%{part_name}%")).first()

                inv = None
                qty_avail = 0
                if part_obj:
                    inv = db.query(FranchiseInventoryModel).filter(
                        FranchiseInventoryModel.branch_id == branch_id,
                        FranchiseInventoryModel.part_id == part_obj.id
                    ).first()
                    qty_avail = inv.quantity_available if inv else 0

                is_in_stock = (qty_avail >= p_qty)
                if not is_in_stock:
                    has_out_of_stock = True

                part_descriptions.append(f"{part_name} (Qty: {p_qty})")

                # Automatically create part request for franchise under technician name
                comp_id = (part_obj.company_id if part_obj else None) or req.company_id or "company_1"
                part_db_id = part_obj.id if part_obj else (part_id or f"part_misc_{uuid.uuid4().hex[:6]}")

                existing_pr = db.query(PartRequestModel).filter(
                    PartRequestModel.request_id == req.id,
                    PartRequestModel.part_id == part_db_id
                ).first()

                if not existing_pr:
                    pr = PartRequestModel(
                        id=f"REQ-{uuid.uuid4().hex[:8].upper()}",
                        company_id=comp_id,
                        branch_id=branch_id,
                        part_id=part_db_id,
                        quantity=p_qty,
                        status="Pending",
                        notes=f"Service Requisition for {req.id} ({req.appliance_name} - {req.issue}) · Customer: {req.customer_name}",
                        requested_by=f"{tech_name} ({tech_id or 'Technician'})",
                        request_id=req.id,
                        technician_id=tech_id,
                        technician_name=tech_name,
                        stock_status_at_request="in_stock" if is_in_stock else "out_of_stock",
                        created_at=datetime.utcnow()
                    )
                    db.add(pr)

            parts_str = ", ".join(part_descriptions)
            if has_out_of_stock:
                req.status = "Part Requested but Out of Stock"
                req.status_badge = "Part Requested but Out of Stock"
                desc = f"Parts requisition automatically sent to franchise under technician {tech_name} ({parts_str}). One or more required parts are currently out of stock at franchise; brand OEM supply requisition initiated."
            else:
                req.status = "Part Requested"
                req.status_badge = "Part Requested"
                desc = f"Parts requisition automatically sent to franchise under technician {tech_name} ({parts_str}). In-stock at branch, awaiting serialized unit allocation."

            for step in timeline:
                if step.get("id") == "step_estimate":
                    step["state"] = "completed"
                    step["timestamp"] = now_str
                    step["description"] = f"Customer approved estimate of ₹{est.total_estimate:.2f}."
                elif step.get("id") == "step_4":
                    step["state"] = "current"
                    step["timestamp"] = now_str
                    step["description"] = desc

        else:
            req.status = "Repair in Progress"
            req.status_badge = "In Progress"
            for step in timeline:
                if step.get("id") == "step_estimate":
                    step["state"] = "completed"
                    step["timestamp"] = now_str
                    step["description"] = f"Customer approved estimate of ₹{est.total_estimate:.2f}. Repair authorized."
                elif step.get("id") == "step_4":
                    step["state"] = "current"
                    step["description"] = "Repair and service overhaul in progress."

    elif payload.action == "reject":
        est.status = "rejected"
        est.customer_remarks = payload.remarks or "Customer declined the repair estimate."
        est.responded_at = now_str

        req.status = "Estimate Rejected"
        req.status_badge = "Estimate Rejected"

        for step in timeline:
            if step.get("id") == "step_estimate":
                step["state"] = "completed"
                step["timestamp"] = now_str
                step["description"] = f"Customer rejected estimate (Remarks: {est.customer_remarks})."

    req.timeline_json = json.dumps(timeline)
    db.commit()
    db.refresh(est)
    db.refresh(req)

    return format_estimate(est)
