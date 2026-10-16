import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.session import SessionLocal
from app.seeds import seed_database
from app.routes import auth, appliances, requests as requests_route

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema & seed default demo data on startup
    db = SessionLocal()
    try:
        seed_database(db)
        print("✓ Database initialized & seeded successfully!")
    finally:
        db.close()
    yield

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
