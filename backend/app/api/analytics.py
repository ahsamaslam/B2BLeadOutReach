from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Company, EmailLog, User

router = APIRouter()


@router.get("/dashboard")
def dashboard_metrics(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    total_companies = db.query(func.count(Company.id)).scalar() or 0

    status_rows = db.query(Company.status, func.count(Company.id)).group_by(Company.status).all()
    companies_by_status = {status: count for status, count in status_rows}

    total_emails_sent = db.query(func.count(EmailLog.id)).filter(EmailLog.status == "sent").scalar() or 0

    today = datetime.utcnow().date()
    emails_sent_today = (
        db.query(func.count(EmailLog.id))
        .filter(EmailLog.status == "sent")
        .filter(func.date(EmailLog.sent_at) == today)
        .scalar()
        or 0
    )

    drafted_approved_sent = sum(companies_by_status.get(s, 0) for s in ["drafted", "approved", "sent"])
    scraping_success_rate = (drafted_approved_sent / total_companies * 100) if total_companies else 0
    email_delivery_rate = (total_emails_sent / drafted_approved_sent * 100) if drafted_approved_sent else 0

    return {
        "total_companies": total_companies,
        "companies_by_status": companies_by_status,
        "total_emails_sent": total_emails_sent,
        "emails_sent_today": emails_sent_today,
        "scraping_success_rate": scraping_success_rate,
        "email_delivery_rate": email_delivery_rate,
    }


@router.get("/status-distribution")
def status_distribution(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.query(Company.status, func.count(Company.id)).group_by(Company.status).all()
    total = sum(count for _, count in rows) or 1
    return [
        {"status": status, "count": count, "percentage": round((count / total) * 100, 2)}
        for status, count in rows
    ]
