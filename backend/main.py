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
from app.routes import auth, appliances, requests as requests_route, admin, company, franchise

logger = logging.getLogger("keepalive")

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
                    headers={"User-Agent": "Servora-KeepAlive/1.0"}
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema & seed default demo data on startup
    db = SessionLocal()
    try:
        seed_database(db)
        print("✓ Database initialized & seeded successfully!")
    finally:
        db.close()

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

    try:
        yield
    finally:
        if keepalive_task:
            keepalive_task.cancel()
            try:
                await keepalive_task
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Servora (USIP) Backend API",
        "version": settings.VERSION,
        "docs_url": "/docs"
    }

@app.get("/health")
def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Servora Backend running at http://127.0.0.1:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
