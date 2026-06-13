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
from app.api import scraping as scraping_api
from app.api import campaigns as campaigns_api
from app.api import test_imap

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
            # Campaign templates: keep older DB schemas in sync with model
            "ALTER TABLE campaign_templates ADD COLUMN IF NOT EXISTS instructions TEXT",
            "ALTER TABLE campaign_templates ADD COLUMN IF NOT EXISTS attach_portfolio BOOLEAN DEFAULT FALSE",
            "ALTER TABLE campaign_templates ADD COLUMN IF NOT EXISTS tags TEXT",
            "ALTER TABLE campaign_templates ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE",
            # Email logs: link to campaign template for stats
            "ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS campaign_template_id INTEGER REFERENCES campaign_templates(id) ON DELETE SET NULL",
            # Team / tenant user fields
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'member'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)",
            "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255)",
            # Force password reset on first invite login
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE",
            # Default / protected workspace flag
            "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE",
            # Per-tenant email tracking
            "ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
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

# ── Seed super-admin from env vars ────────────────────────────────────────────
def _seed_super_admin():
    """
    Ensure the super-admin user defined in SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
    exists in the DB and has is_admin=True.  Runs every startup — safe to re-run.
    """
    if not settings.SUPER_ADMIN_EMAIL or not settings.SUPER_ADMIN_PASSWORD:
        return  # env vars not set — skip
    from app.database import SessionLocal
    from app.services.auth_service import get_password_hash
    import logging
    _log = logging.getLogger(__name__)
    db = SessionLocal()
    try:
        from app.models import User
        user = db.query(User).filter(User.email == settings.SUPER_ADMIN_EMAIL).first()
        if user:
            changed = False
            if not user.is_admin:
                user.is_admin = True
                changed = True
            # Always re-hash password so a .env change takes effect on restart
            from app.services.auth_service import verify_password
            if not verify_password(settings.SUPER_ADMIN_PASSWORD, user.hashed_password):
                user.hashed_password = get_password_hash(settings.SUPER_ADMIN_PASSWORD)
                changed = True
            if changed:
                db.commit()
                _log.info("Super-admin updated: %s", settings.SUPER_ADMIN_EMAIL)
        else:
            new_admin = User(
                email=settings.SUPER_ADMIN_EMAIL,
                hashed_password=get_password_hash(settings.SUPER_ADMIN_PASSWORD),
                is_active=True,
                is_admin=True,
                role="owner",
            )
            db.add(new_admin)
            db.commit()
            _log.info("Super-admin created: %s", settings.SUPER_ADMIN_EMAIL)
    except Exception as exc:
        import logging as _l
        _l.getLogger(__name__).error("Super-admin seed failed: %s", exc)
    finally:
        db.close()

_seed_super_admin()


# ── Seed default (protected) workspace ────────────────────────────────────────
def _seed_default_workspace():
    """
    Ensure exactly one Tenant with is_default=True exists.
    The super-admin is attached to it if they have no tenant yet.
    Runs every startup — safe to re-run.
    """
    from app.database import SessionLocal
    import logging
    _log = logging.getLogger(__name__)
    db = SessionLocal()
    try:
        from app.models import Tenant, User
        default_tenant = db.query(Tenant).filter(Tenant.is_default == True).first()
        if not default_tenant:
            default_tenant = Tenant(
                name="Default Workspace",
                plan="enterprise",
                is_active=True,
                is_default=True,
            )
            db.add(default_tenant)
            db.flush()
            _log.info("Default workspace created (id=%s)", default_tenant.id)
        # Attach super-admin to the default workspace if they aren't in any tenant
        if settings.SUPER_ADMIN_EMAIL:
            admin_user = db.query(User).filter(User.email == settings.SUPER_ADMIN_EMAIL).first()
            if admin_user and admin_user.tenant_id is None:
                admin_user.tenant_id = default_tenant.id
                admin_user.role = "owner"
                default_tenant.owner_email = admin_user.email
        db.commit()
    except Exception as exc:
        import logging as _l
        _l.getLogger(__name__).error("Default workspace seed failed: %s", exc)
    finally:
        db.close()

_seed_default_workspace()


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
app.include_router(scraping_api.router, prefix="/api/scraping", tags=["Scraping"])
app.include_router(campaigns_api.router, prefix="/api/campaigns", tags=["Campaigns"])
app.include_router(test_imap.router, prefix="/api", tags=["Testing"])

# ── Follow-up scheduler (APScheduler, runs inside FastAPI process) ────────────
from apscheduler.schedulers.background import BackgroundScheduler

_scheduler = BackgroundScheduler(timezone="UTC")

@app.on_event("startup")
def start_followup_scheduler():
    from app.api.followups import process_due_followups
    from app.database import SessionLocal
    from app.services.imap_service import check_for_replies

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

    def _run_reply_checker_job():
        db = SessionLocal()
        try:
            count = check_for_replies(db)
            if count:
                import logging
                logging.getLogger(__name__).info("Reply checker: detected %d new replies", count)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Reply checker error: %s", exc)
        finally:
            db.close()

    _scheduler.add_job(_run_followup_job, "interval", minutes=15, id="followup_job", replace_existing=True)

    # Add reply checker if IMAP is enabled
    from app.config import settings
    if settings.IMAP_ENABLED:
        interval = settings.IMAP_CHECK_INTERVAL_MINUTES or 5
        _scheduler.add_job(_run_reply_checker_job, "interval", minutes=interval, id="reply_checker_job", replace_existing=True)

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
