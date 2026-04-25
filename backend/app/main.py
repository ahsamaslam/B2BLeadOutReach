from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.config import settings
from app.database import engine, Base
from app.api import auth, companies, scraping, emails, analytics, portfolio as portfolio_api
from app.api import discovery
from app.api import tracking as tracking_api
from app.api import linkedin as linkedin_api
from app.api import settings as settings_api
from app.api import admin as admin_api

# Create all tables (new tables only — existing tables are not modified)
Base.metadata.create_all(bind=engine)

# ── Runtime migrations: add columns that may not exist in older DB schemas ────
def _run_migrations():
    with engine.connect() as conn:
        stmts = [
            # Multi-tenant columns on users
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
            # linkedin_outreach columns on companies (in case they were added after initial schema)
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS linkedin_outreach_status VARCHAR(50)",
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS linkedin_sent_at TIMESTAMP",
            # business_type — ensure it exists and existing rows default to 'independent'
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type VARCHAR(20) DEFAULT 'independent'",
            "UPDATE companies SET business_type = 'independent' WHERE business_type IS NULL",
        ]
        for stmt in stmts:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass  # column already exists or table doesn't exist yet
        conn.commit()

_run_migrations()

# Ensure upload folder exists
Path("/app/uploads/portfolio").mkdir(parents=True, exist_ok=True)

# Initialize FastAPI app
app = FastAPI(
    title="B2B Lead Generation API",
    description="Automated B2B lead generation and outreach system with AI-powered email generation",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(companies.router, prefix="/api/companies", tags=["Companies"])
app.include_router(scraping.router, prefix="/api/scraping", tags=["Scraping"])
app.include_router(emails.router, prefix="/api/emails", tags=["Emails"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(portfolio_api.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(discovery.router, prefix="/api/discovery", tags=["Discovery"])
app.include_router(tracking_api.router, prefix="/api/tracking", tags=["Tracking"])
app.include_router(linkedin_api.router, prefix="/api/linkedin", tags=["LinkedIn"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["Settings"])
app.include_router(admin_api.router, prefix="/api/admin", tags=["Admin"])

# Serve uploaded files at /uploads/<filename>
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

@app.get("/")
def root():
    """API root endpoint"""
    return {
        "message": "B2B Lead Generation API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
