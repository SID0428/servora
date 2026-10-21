import os
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()

class Settings:
    PROJECT_NAME: str = "SERVORA - Unified Service Intelligence Platform"
    VERSION: str = "1.0.0"
    
    # Database Configuration (Aiven MySQL or local fallback SQLite)
    # Aiven MySQL format: mysql+pymysql://avnadmin:PASSWORD@HOST:PORT/defaultdb?ssl_mode=REQUIRED
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./servora.db")
    
    # Comma-separated exact origins, including the Vercel production domain.
    ALLOWED_ORIGINS: list[str] = [
        origin.strip() for origin in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5500,https://servora.vercel.app,https://servora-frontend-xi.vercel.app",
        ).split(",") if origin.strip()
    ]

    # Google OAuth Client ID for GIS authentication
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

settings = Settings()
