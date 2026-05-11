from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.config import settings
from app.database import engine, Base
from app.api import auth, companies, emails, analytics, portfolio as portfolio_api
from app.api import tracking as tracking_api
from app.api import settings as settings_api
from app.api import admin as admin_api
from app.api import followups as followups_api

# Create all tables (new tables only — existing tables are not modified)
Base.metadata.create_all(bind=engine)

# ── Runtime migrations: add columns that may not exist in older DB schemas ────
def _run_migrations():
    with engine.connect() as conn:
        stmts = [
            # Multi-tenant columns on users
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
            # business_type — ensure it exists and existing rows default to 'independent'
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type VARCHAR(20) DEFAULT 'independent'",
            "UPDATE companies SET business_type = 'independent' WHERE business_type IS NULL",
            # Email open tracking — open count and last user agent
            "ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0",
            "ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS last_open_user_agent TEXT",
            # Email body storage for history view
            "ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS body TEXT",
            # Follow-up automation table
            """
            CREATE TABLE IF NOT EXISTS follow_up_logs (
                id SERIAL PRIMARY KEY,
                parent_log_id INTEGER REFERENCES email_logs(id) ON DELETE CASCADE,
                company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
                round_number INTEGER NOT NULL DEFAULT 1,
                recipient_email VARCHAR(255) NOT NULL,
                recipient_name VARCHAR(255),
                subject VARCHAR(500),
                body TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                scheduled_at TIMESTAMP,
                sent_at TIMESTAMP,
                error_message TEXT,
                tracking_token VARCHAR(36) UNIQUE,
                opened_at TIMESTAMP,
                open_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
            """,
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
app.include_router(emails.router, prefix="/api/emails", tags=["Emails"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(portfolio_api.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(tracking_api.router, prefix="/api/tracking", tags=["Tracking"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["Settings"])
app.include_router(admin_api.router, prefix="/api/admin", tags=["Admin"])
app.include_router(followups_api.router, prefix="/api/followups", tags=["Followups"])

# ── Follow-up scheduler (APScheduler, runs inside FastAPI process) ────────────
from apscheduler.schedulers.background import BackgroundScheduler

_scheduler = BackgroundScheduler(timezone="UTC")

@app.on_event("startup")
def start_followup_scheduler():
    from app.api.followups import process_due_followups
    from app.database import SessionLocal

    def _run_followup_job():
        db = SessionLocal()
        try:
            count = process_due_followups(db)
            if count:
                import logging
                logging.getLogger(__name__).info("Follow-up scheduler: processed %d follow-up(s)", count)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Follow-up scheduler error: %s", exc)
        finally:
            db.close()

    _scheduler.add_job(_run_followup_job, "interval", minutes=15, id="followup_job", replace_existing=True)
    _scheduler.start()

@app.on_event("shutdown")
def stop_followup_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)

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
