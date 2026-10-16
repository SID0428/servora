from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from app.database import USERS

templates = Jinja2Templates(directory="app/templates")

router = APIRouter(tags=["views"])

@router.get("/", response_class=HTMLResponse)
def index(request: Request):
    user_id = request.cookies.get("servora_user_id")
    if user_id and user_id in USERS:
        return RedirectResponse(url="/dashboard")
    return RedirectResponse(url="/login")

@router.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@router.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(request: Request):
    user_id = request.cookies.get("servora_user_id", "customer_1")
    user = USERS.get(user_id, USERS["customer_1"])
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user})
