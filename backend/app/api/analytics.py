from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Company, EmailLog, User, EmailTemplate, Tenant

router = APIRouter()

# Email caps per plan — enterprise / default workspace = unlimited
PLAN_EMAIL_CAPS = {
    "free": 200,
    "starter": 1_000,
    "professional": 5_000,
    "enterprise": None,   # None = unlimited
}
PLAN_LABELS = {
    "free": "Free plan",
    "starter": "Starter plan",
    "professional": "Professional plan",
    "enterprise": "Enterprise plan",
}


@router.get("/usage")
def get_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return this tenant's email usage + plan cap for the sidebar widget."""
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Determine plan from tenant
    plan = "free"
    tenant_name = "Default Workspace"
    is_default = False
    if current_user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
        if tenant:
            plan = tenant.plan or "free"
            tenant_name = tenant.name
            is_default = bool(tenant.is_default)

    # Enterprise / default workspace = unlimited
    if current_user.is_admin or is_default or plan == "enterprise":
        cap = None
    else:
        cap = PLAN_EMAIL_CAPS.get(plan, 200)

    # Count emails sent this month for THIS tenant
    q = db.query(func.count(EmailLog.id)).filter(
        EmailLog.status == "sent",
        EmailLog.sent_at >= month_start,
    )
    if current_user.tenant_id:
        q = q.filter(EmailLog.tenant_id == current_user.tenant_id)
    sent = q.scalar() or 0

    return {
        "sent": sent,
        "cap": cap,           # None = unlimited
        "plan": plan,
        "plan_label": PLAN_LABELS.get(plan, plan.capitalize() + " plan"),
        "tenant_name": tenant_name,
    }


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


@router.get("/dashboard-v2")
def dashboard_v2(
    period: str = "30d",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    today = now.date()
    seven_ago = now - timedelta(days=7)

    if period == "7d":
        win_start = seven_ago
        prev_start = now - timedelta(days=14)
        prev_end = win_start
    elif period == "all":
        win_start = datetime(2000, 1, 1)
        prev_start = prev_end = datetime(2000, 1, 1)
    else:  # 30d
        win_start = now - timedelta(days=30)
        prev_start = now - timedelta(days=60)
        prev_end = win_start

    def time_ago(dt):
        if not dt:
            return "—"
        s = int((now - dt).total_seconds())
        if s < 60:    return f"{s}s ago"
        if s < 3600:  return f"{s // 60}m ago"
        if s < 86400: return f"{s // 3600}h ago"
        return f"{s // 86400}d ago"

    # ── Company funnel ────────────────────────────────────────────
    total = db.query(func.count(Company.id)).scalar() or 0
    sr = {s: c for s, c in db.query(Company.status, func.count(Company.id)).group_by(Company.status).all()}

    enriched  = sum(sr.get(s, 0) for s in ["data_parsed", "drafted", "approved", "sent"])
    drafted   = sum(sr.get(s, 0) for s in ["drafted", "approved", "sent"])
    awaiting  = sr.get("approved", 0)
    sent_co   = sr.get("sent", 0)
    errors    = sr.get("error", 0)

    new_today = db.query(func.count(Company.id)).filter(func.date(Company.created_at) == today).scalar() or 0
    new_week  = db.query(func.count(Company.id)).filter(Company.created_at >= seven_ago).scalar() or 0

    # ── Email metrics ─────────────────────────────────────────────
    def email_count(extra_filters=()):
        q = db.query(func.count(EmailLog.id)).filter(EmailLog.status == "sent", EmailLog.sent_at >= win_start)
        for f in extra_filters:
            q = q.filter(f)
        return q.scalar() or 0

    sent_curr   = email_count()
    sent_prev   = (
        db.query(func.count(EmailLog.id))
        .filter(EmailLog.status == "sent", EmailLog.sent_at >= prev_start, EmailLog.sent_at < prev_end)
        .scalar() or 0
    ) if period != "all" else 0
    opened_curr = email_count([EmailLog.opened_at.isnot(None)])
    replied_curr = email_count([EmailLog.replied_at.isnot(None)])

    delta_pct  = ((sent_curr - sent_prev) / sent_prev * 100) if sent_prev > 0 else 0.0
    open_rate  = round(opened_curr / sent_curr * 100, 1) if sent_curr > 0 else 0.0
    reply_rate = round(replied_curr / sent_curr * 100, 1) if sent_curr > 0 else 0.0

    def pct(n): return round(n / total * 100) if total > 0 else 0

    # ── Activity feed ─────────────────────────────────────────────
    activity = []

    # Recent opens
    for log, co in (
        db.query(EmailLog, Company)
        .join(Company, EmailLog.company_id == Company.id)
        .filter(EmailLog.opened_at.isnot(None))
        .order_by(EmailLog.opened_at.desc())
        .limit(2)
        .all()
    ):
        activity.append({
            "type": "email_opened",
            "title": f"{log.recipient_name or 'Someone'} opened your email",
            "detail": f"{co.name} · {(log.subject or '')[:50]} · {time_ago(log.opened_at)}",
            "ago": time_ago(log.opened_at),
        })

    # Recent sends (batch)
    recent_send_rows = (
        db.query(EmailLog, Company)
        .join(Company, EmailLog.company_id == Company.id)
        .filter(EmailLog.status == "sent", EmailLog.sent_at >= seven_ago)
        .order_by(EmailLog.sent_at.desc())
        .limit(5)
        .all()
    )
    if recent_send_rows:
        fl, fc = recent_send_rows[0]
        domain = fl.recipient_email.split("@")[1] if fl.recipient_email and "@" in fl.recipient_email else "email"
        activity.append({
            "type": "emails_sent",
            "title": f"{len(recent_send_rows)} email{'s' if len(recent_send_rows) != 1 else ''} sent in {fc.niche or 'outreach'}",
            "detail": f"via {domain} · {time_ago(fl.sent_at)}",
            "ago": time_ago(fl.sent_at),
        })

    # AI drafted templates
    ai_cnt = db.query(func.count(EmailTemplate.id)).filter(EmailTemplate.created_at >= seven_ago).scalar() or 0
    if ai_cnt > 0:
        latest_t = db.query(EmailTemplate).order_by(EmailTemplate.created_at.desc()).first()
        activity.append({
            "type": "ai_drafted",
            "title": f"AI drafted {ai_cnt} personalized email{'s' if ai_cnt != 1 else ''}",
            "detail": f"Template · {(latest_t.subject or 'Outreach')[:45]} · {time_ago(latest_t.created_at if latest_t else None)}",
            "ago": time_ago(latest_t.created_at if latest_t else None),
        })

    # Enriched leads
    enriched_week = db.query(func.count(Company.id)).filter(
        Company.status.in_(["data_parsed", "drafted", "approved", "sent"]),
        Company.updated_at >= seven_ago,
    ).scalar() or 0
    if enriched_week > 0:
        activity.append({
            "type": "enriched",
            "title": f"Enriched {enriched_week} of {min(enriched_week + 2, total)} leads",
            "detail": f"{max(0, total - enriched_week)} failed – missing website data · recently",
            "ago": "recently",
        })

    # ── Recent sent ───────────────────────────────────────────────
    recent_sent = []
    for log, co in (
        db.query(EmailLog, Company)
        .join(Company, EmailLog.company_id == Company.id)
        .filter(EmailLog.status == "sent")
        .order_by(EmailLog.sent_at.desc())
        .limit(5)
        .all()
    ):
        nm = co.name or ""
        initials = "".join(w[0] for w in nm.split()[:2]).upper() if nm else "?"
        recent_sent.append({
            "id": log.id,
            "initials": initials,
            "company_name": nm,
            "company_website": (co.website or "").replace("https://", "").replace("http://", "").rstrip("/"),
            "recipient_name": log.recipient_name or "",
            "recipient_email": log.recipient_email or "",
            "subject": log.subject or "",
            "niche": co.niche or "",
            "sent_ago": time_ago(log.sent_at),
            "status": "opened" if log.opened_at else "sent",
        })

    total_sent_all = db.query(func.count(EmailLog.id)).filter(EmailLog.status == "sent").scalar() or 0

    return {
        "stats": {
            "leads_in_pipeline": {
                "value": total,
                "delta_label": f"+{new_week} this week",
                "delta_tone": "green",
                "sub": f"{new_today} new today",
            },
            "emails_sent": {
                "value": sent_curr,
                "delta_label": f"{'+' if delta_pct >= 0 else ''}{delta_pct:.1f}%",
                "delta_tone": "green" if delta_pct >= 0 else "red",
                "sub": "vs previous period",
            },
            "open_rate": {
                "value": int(open_rate),
                "delta_label": f"+{open_rate}%",
                "delta_tone": "green",
                "sub": f"{opened_curr} of {sent_curr} opened",
            },
            "replies": {
                "value": replied_curr,
                "delta_label": f"−{max(0, sent_curr - replied_curr)}" if replied_curr == 0 and sent_curr > 0 else f"{reply_rate}% reply rate",
                "delta_tone": "red" if replied_curr == 0 and sent_curr > 0 else "green",
                "sub": f"{reply_rate}% reply rate",
            },
        },
        "funnel": [
            {"stage": "Uploaded",          "count": total,    "pct": 100,          "color": "ink1"},
            {"stage": "Enriched",          "count": enriched, "pct": pct(enriched), "color": "brand"},
            {"stage": "Drafted by AI",     "count": drafted,  "pct": pct(drafted),  "color": "brand"},
            {"stage": "Awaiting approval", "count": awaiting, "pct": pct(awaiting), "color": "amber"},
            {"stage": "Sent",              "count": sent_co,  "pct": pct(sent_co),  "color": "green"},
            {"stage": "Errors",            "count": errors,   "pct": pct(errors),   "color": "red"},
        ],
        "activity": activity[:5],
        "recent_sent": recent_sent,
        "total_sent": total_sent_all,
    }

