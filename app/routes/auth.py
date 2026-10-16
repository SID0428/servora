from fastapi import APIRouter, Response, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import USERS
from app.models import User, UserRole

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    identifier: str # Email or phone or userId
    password: Optional[str] = "password123"
    role: Optional[str] = None

@router.post("/login")
def login(payload: LoginRequest, response: Response):
    ident = payload.identifier.strip().lower()
    
    # Check directly by ID
    if ident in USERS:
        user = USERS[ident]
    else:
        # Match by email or phone or name
        user = next(
            (u for u in USERS.values() if u.email.lower() == ident or u.phone.replace(" ", "") == ident.replace(" ", "")),
            None
        )
    
    # If role is provided, or identifier is a role name (customer, technician, branch, company, admin)
    if not user:
        role_map = {
            "customer": "customer_1",
            "technician": "tech_1",
            "branch": "branch_1",
            "company": "company_1",
            "admin": "admin_1"
        }
        if ident in role_map:
            user = USERS[role_map[ident]]
        elif payload.role and payload.role in role_map:
            user = USERS[role_map[payload.role]]

    if not user:
        # Default fallback to customer for seamless testing if any arbitrary username entered
        user = USERS["customer_1"]

    # Set cookie for session persistence
    response.set_cookie(
        key="servora_user_id",
        value=user.id,
        httponly=False,
        max_age=86400 * 7,
        path="/"
    )
    return {"status": "success", "user": user}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="servora_user_id", path="/")
    return {"status": "success", "message": "Logged out successfully"}

@router.get("/me")
def get_current_user(request: Request):
    user_id = request.cookies.get("servora_user_id", "customer_1")
    user = USERS.get(user_id, USERS["customer_1"])
    return {"user": user}

@router.get("/demo-users")
def get_demo_users():
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "title": "Customer" if u.role == UserRole.CUSTOMER else u.name
        }
        for u in USERS.values()
    ]
