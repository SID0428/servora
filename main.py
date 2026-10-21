import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.routes import auth, appliances, requests as requests_route, views

app = FastAPI(
    title="SERVSURE - Unified Service Intelligence Platform",
    description="Multi-brand, multi-provider home-appliance service operations platform",
    version="1.0.0"
)

# Mount static directory
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Include routes
app.include_router(views.router)
app.include_router(auth.router)
app.include_router(appliances.router)
app.include_router(requests_route.router)

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 ServSure (USIP) is starting at http://127.0.0.1:8000")
    print("=" * 60)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
