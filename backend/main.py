import asyncio
import logging
import os
import urllib.request
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.session import SessionLocal
from app.seeds import seed_database
from app.routes import (
    auth, appliances, requests as requests_route, admin, company, franchise,
    uploads, inventory, warranty_amc, estimates, escalations
)
from app.sla_engine import evaluate_sla_breaches
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger("keepalive")
sla_logger = logging.getLogger("sla_monitor")

async def keep_alive_ping_loop():
    """
    Background worker that pings the public health endpoint every 14 minutes
    so Render's 15-minute inactivity idle timer is continuously reset.
    """
    # Wait 45 seconds after startup before the initial ping
    await asyncio.sleep(45)

    external_url = (
        os.getenv("RENDER_EXTERNAL_URL")
        or os.getenv("PING_URL")
        or "https://servora-3v6b.onrender.com"
    ).rstrip("/")
    health_url = f"{external_url}/health"

    # 14 minutes = 840 seconds (safely under Render's 15-minute / 900s inactivity limit)
    interval = int(os.getenv("KEEP_ALIVE_INTERVAL_SECONDS", 14 * 60))

    while True:
        try:
            def _ping():
                req = urllib.request.Request(
                    health_url,
                    headers={"User-Agent": "ServSure-KeepAlive/1.0"}
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    return resp.status

            status = await asyncio.to_thread(_ping)
            logger.info("✓ Keep-alive self-ping to %s succeeded (status %s)", health_url, status)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("Keep-alive self-ping to %s failed: %s", health_url, exc)

        try:
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            break

async def sla_monitor_loop():
    """
    Background worker that runs SLA evaluations every 5 minutes (SRS 6.15).
    """
    await asyncio.sleep(10) # Initial brief pause after startup
    while True:
        try:
            def _check():
                db = SessionLocal()
                try:
                    return evaluate_sla_breaches(db)
                finally:
                    db.close()
            breaches = await asyncio.to_thread(_check)
            if breaches:
                sla_logger.info("SLA Scanner detected and processed %d breach escalations", len(breaches))
        except asyncio.CancelledError:
            break
        except Exception as exc:
            sla_logger.warning("SLA monitoring loop encounter error: %s", exc)

        try:
            await asyncio.sleep(300) # Check every 5 minutes
        except asyncio.CancelledError:
            break

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema & seed default demo data on startup
    try:
        db = SessionLocal()
        try:
            seed_database(db)
            print("✓ Database initialized & seeded successfully!")
        finally:
            db.close()
    except Exception as exc:
        print(f"⚠️ Warning: Database connection failed on startup: {exc}")
        print("⚠️ Verify that your Aiven MySQL service is powered on and DATABASE_URL is valid in Render settings.")

    # Automatically start keep-alive worker when running on Render or if explicitly enabled
    is_render = (
        os.getenv("RENDER") == "true"
        or bool(os.getenv("RENDER_EXTERNAL_URL"))
        or os.getenv("ENABLE_KEEPALIVE", "").lower() in {"1", "true", "yes"}
    )

    keepalive_task = None
    if is_render:
        keepalive_task = asyncio.create_task(keep_alive_ping_loop())
        print("✓ Background keep-alive task started (triggers every 14 min)")

    # Start SLA auto-escalation engine background worker
    sla_task = asyncio.create_task(sla_monitor_loop())
    print("✓ Background SLA monitoring task started (evaluates every 5 min)")

    try:
        yield
    finally:
        if keepalive_task:
            keepalive_task.cancel()
            try:
                await keepalive_task
            except asyncio.CancelledError:
                pass
        if sla_task:
            sla_task.cancel()
            try:
                await sla_task
            except asyncio.CancelledError:
                pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS Middleware for Vercel Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    headers = {}
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Headers"] = "*"
        headers["Access-Control-Allow-Methods"] = "*"

    exc_str = str(exc)
    if "Can't connect to MySQL" in exc_str or "OperationalError" in type(exc).__name__:
        return JSONResponse(
            status_code=503,
            content={"detail": "Database connection error. Your Aiven MySQL service may be powered off or unreachable."},
            headers=headers,
        )
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error: {exc_str}"},
        headers=headers,
    )

# Include API Routers
app.include_router(auth.router)
app.include_router(appliances.router)
app.include_router(requests_route.router)
app.include_router(admin.router)
app.include_router(admin.onboarding_router)
app.include_router(company.router)
app.include_router(company.onboarding_router)
app.include_router(franchise.router)
app.include_router(franchise.onboarding_router)
app.include_router(uploads.router)
app.include_router(inventory.router)
app.include_router(warranty_amc.router)
app.include_router(estimates.router)
app.include_router(escalations.router)

uploads_static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app", "static", "uploads")
os.makedirs(uploads_static_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_static_dir), name="uploads")

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "ServSure (USIP) Backend API",
        "version": settings.VERSION,
        "docs_url": "/docs"
    }

@app.get("/health")
def health():
    db_ok = True
    db_msg = "connected"
    try:
        from sqlalchemy import text
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception as exc:
        db_ok = False
        db_msg = f"unreachable: {exc}"
    return {
        "status": "healthy" if db_ok else "degraded",
        "database": db_msg
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 ServSure Backend running at http://127.0.0.1:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
