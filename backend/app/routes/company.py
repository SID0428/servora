from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.models import CompanyBranchModel, UserModel
from app.db.session import get_db
from app.schemas import CompanyBranchCreate
from app.security import get_authenticated_user

router = APIRouter(prefix="/api/company", tags=["company portal"])


def require_company(request: Request, db: Session) -> UserModel:
    user = get_authenticated_user(request, db)
    if user.role != "company":
        raise HTTPException(status_code=403, detail="Company portal access required")
    return user


def branch_payload(branch: CompanyBranchModel) -> dict:
    return {
        "id": branch.id,
        "branch_name": branch.branch_name,
        "manager_name": branch.manager_name,
        "email": branch.email,
        "mobile": branch.mobile,
        "address": branch.address,
        "pincode": branch.pincode,
        "created_at": branch.created_at.isoformat(),
    }


@router.get("/branches")
def list_company_branches(request: Request, db: Session = Depends(get_db)):
    company = require_company(request, db)
    branches = (
        db.query(CompanyBranchModel)
        .filter(CompanyBranchModel.company_id == company.id)
        .order_by(CompanyBranchModel.branch_name)
        .all()
    )
    return [branch_payload(branch) for branch in branches]


@router.post("/branches", status_code=201)
def create_company_branch(payload: CompanyBranchCreate, request: Request, db: Session = Depends(get_db)):
    company = require_company(request, db)
    email = payload.email.strip().lower()
    duplicate = db.query(CompanyBranchModel).filter(
        CompanyBranchModel.company_id == company.id,
        CompanyBranchModel.email.ilike(email),
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="A branch with this email already exists")

    branch = CompanyBranchModel(
        id=f"branch_{uuid4().hex[:12]}",
        company_id=company.id,
        branch_name=payload.branch_name.strip(),
        manager_name=payload.manager_name.strip(),
        email=email,
        mobile=payload.mobile.strip(),
        address=payload.address.strip(),
        pincode=payload.pincode.strip(),
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch_payload(branch)
