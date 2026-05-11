"""
Follow-up email automation system.

Scheduler calls process_due_followups() every 15 minutes.
schedule_followups() is called after every successful initial send.

Intelligence logic:
  - Original email NOT opened → use FOLLOWUP_x_DAYS_UNOPENED delays
  - Original email OPENED but no reply → use FOLLOWUP_x_DAYS_OPENED delays (shorter/warmer)
  - replied_at is set on the parent log → skip all follow-ups for that lead
"""
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Company, EmailLog, FollowUpLog, TenantSettings, User
from app.services import email_service
from app.config import settings as global_settings

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Settings helpers ──────────────────────────────────────────────────────────

_FOLLOWUP_KEYS = [
    "FOLLOWUP_ENABLED", "FOLLOWUP_MAX_ROUNDS",
    "FOLLOWUP_1_DAYS_UNOPENED", "FOLLOWUP_2_DAYS_UNOPENED", "FOLLOWUP_3_DAYS_UNOPENED",
    "FOLLOWUP_1_DAYS_OPENED", "FOLLOWUP_2_DAYS_OPENED",
]


def _get_followup_settings(tenant_id: Optional[int], db: Session) -> dict:
    """Load follow-up configuration for a tenant, falling back to global defaults."""
    saved: dict = {}
    if tenant_id:
        rows = (
            db.query(TenantSettings)
            .filter(TenantSettings.tenant_id == tenant_id, TenantSettings.key.in_(_FOLLOWUP_KEYS))
            .all()
        )
        saved = {r.key: r.value for r in rows if r.value}

    def _int(key, default: int) -> int:
        try:
            return int(saved.get(key) or default)
        except (ValueError, TypeError):
            return default

    enabled_raw = (saved.get("FOLLOWUP_ENABLED") or str(global_settings.FOLLOWUP_ENABLED)).lower()
    return {
        "enabled": enabled_raw in ("true", "1", "yes"),
        "max_rounds": _int("FOLLOWUP_MAX_ROUNDS", global_settings.FOLLOWUP_MAX_ROUNDS),
        "days_unopened": [
            _int("FOLLOWUP_1_DAYS_UNOPENED", global_settings.FOLLOWUP_1_DAYS_UNOPENED),
            _int("FOLLOWUP_2_DAYS_UNOPENED", global_settings.FOLLOWUP_2_DAYS_UNOPENED),
            _int("FOLLOWUP_3_DAYS_UNOPENED", global_settings.FOLLOWUP_3_DAYS_UNOPENED),
        ],
        "days_opened": [
            _int("FOLLOWUP_1_DAYS_OPENED", global_settings.FOLLOWUP_1_DAYS_OPENED),
            _int("FOLLOWUP_2_DAYS_OPENED", global_settings.FOLLOWUP_2_DAYS_OPENED),
            _int("FOLLOWUP_3_DAYS_UNOPENED", global_settings.FOLLOWUP_3_DAYS_UNOPENED),
        ],
    }


# ─── SMTP creds helper for scheduler (no user context) ────────────────────────

def _smtp_creds_for_log(parent_log: EmailLog, db: Session) -> dict:
    """Resolve SMTP credentials in the scheduler context (no HTTP request/user)."""
    from app.api.emails import _load_email_creds

    # Use the first active user — fine for single-tenant, and best-effort for multi-tenant
    user = db.query(User).filter(User.is_active == True).first()
    if user:
        return _load_email_creds(user, db)

    # Absolute fallback: global env
    return {
        "smtp_host": global_settings.SMTP_HOST,
        "smtp_port": global_settings.SMTP_PORT,
        "smtp_user": global_settings.SMTP_USER,
        "smtp_password": global_settings.SMTP_PASSWORD,
        "from_email": global_settings.SMTP_FROM_EMAIL,
        "from_name": global_settings.SMTP_FROM_NAME,
        "sender_full_name": global_settings.SENDER_FULL_NAME or "",
        "tracking_base_url": global_settings.TRACKING_BASE_URL or "",
    }


# ─── AI body generation ────────────────────────────────────────────────────────

def _generate_followup_body(
    parent_log: EmailLog,
    round_number: int,
    was_opened: bool,
    company: Optional[Company],
    sender_full_name: str,
) -> dict:
    """Generate a follow-up email using Claude. Returns {subject, body}."""

    company_name = company.name if company else "your company"
    niche = (company.niche if company else None) or "their industry"
    location = (company.location if company else None) or "their area"
    recipient = parent_log.recipient_name or "there"

    # Fallback in case Anthropic key is not configured
    if not global_settings.ANTHROPIC_API_KEY:
        if was_opened:
            return {
                "subject": f"Following up — {parent_log.subject}",
                "body": (
                    f"<p>Hi {recipient},</p>"
                    f"<p>I noticed you had a chance to look at my previous message. "
                    f"I'd love to find a time to chat about how we could help {company_name}.</p>"
                    f"<p>Would you have 15 minutes this week?</p>"
                    f"<p>Best,<br>{sender_full_name}</p>"
                ),
            }
        else:
            return {
                "subject": f"Quick follow-up for {company_name}",
                "body": (
                    f"<p>Hi {recipient},</p>"
                    f"<p>I wanted to circle back on my previous email. "
                    f"I understand things get busy — I'll keep this brief.</p>"
                    f"<p>We've been helping {niche} businesses in {location} with AI automation. "
                    f"Would a quick call make sense?</p>"
                    f"<p>Best,<br>{sender_full_name}</p>"
                ),
            }

    from anthropic import Anthropic
    client = Anthropic(api_key=global_settings.ANTHROPIC_API_KEY)

    if was_opened:
        context_line = (
            f"The recipient opened the original email (round {round_number} follow-up) but did not reply. "
            "They showed interest. Write a warm, brief follow-up that gently nudges them without being pushy. "
            "Reference that you're following up, not that you know they opened it."
        )
    else:
        context_line = (
            f"The recipient did NOT open the original email (round {round_number} follow-up). "
            "Try a fresh angle or a slightly different hook. Keep it short and direct."
        )

    system_prompt = (
        "You are an expert B2B outreach copywriter specialising in follow-up cold emails. "
        "Write a concise follow-up email (3–4 short paragraphs). "
        "Return a JSON object with exactly two keys: \"subject\" and \"body\". "
        "The \"body\" MUST be valid HTML — use <p> tags for paragraphs, <br> for line breaks. "
        "IMPORTANT for subject: 4–8 words, conversational, no spam words, no ALL CAPS. "
        "Do NOT wrap the HTML in <html> or <body> tags. No markdown outside the JSON."
    )

    user_prompt = (
        f"Follow-up round: {round_number}\n"
        f"Context: {context_line}\n\n"
        f"Original subject: {parent_log.subject}\n"
        f"Recipient: {recipient} at {company_name} ({niche}, {location})\n"
        f"Sender: {sender_full_name}\n\n"
        "Write the follow-up email now."
    )

    try:
        message = client.messages.create(
            model=global_settings.ANTHROPIC_MODEL,
            max_tokens=700,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        data = json.loads(raw)
        return {"subject": data.get("subject", ""), "body": data.get("body", "")}
    except Exception as exc:
        logger.error("AI follow-up generation failed: %s", exc)
        return {
            "subject": f"Following up — {parent_log.subject}",
            "body": (
                f"<p>Hi {recipient},</p>"
                f"<p>Just circling back on my previous message. "
                f"Would love to connect when you have a moment.</p>"
                f"<p>Best,<br>{sender_full_name}</p>"
            ),
        }


# ─── Core scheduling logic ─────────────────────────────────────────────────────

def schedule_followups(parent_log: EmailLog, db: Session, tenant_id: Optional[int] = None) -> None:
    """
    Create FollowUpLog rows for a newly sent email.
    Called immediately after each successful initial send.
    """
    fs = _get_followup_settings(tenant_id, db)

    if not fs["enabled"]:
        return

    if parent_log.replied_at:
        return  # Already replied — no follow-ups needed

    sent_at = parent_log.sent_at or datetime.utcnow()
    was_opened = bool(parent_log.opened_at)
    delays = fs["days_opened"] if was_opened else fs["days_unopened"]
    max_rounds = min(fs["max_rounds"], 3)

    for round_num in range(1, max_rounds + 1):
        delay_days = delays[round_num - 1] if (round_num - 1) < len(delays) else delays[-1]
        scheduled_at = sent_at + timedelta(days=delay_days)

        # Idempotent: skip if row already exists for this round
        existing = (
            db.query(FollowUpLog)
            .filter(FollowUpLog.parent_log_id == parent_log.id, FollowUpLog.round_number == round_num)
            .first()
        )
        if existing:
            continue

        db.add(FollowUpLog(
            parent_log_id=parent_log.id,
            company_id=parent_log.company_id,
            round_number=round_num,
            recipient_email=parent_log.recipient_email,
            recipient_name=parent_log.recipient_name,
            status="pending",
            scheduled_at=scheduled_at,
        ))

    db.commit()
    logger.info("Scheduled %d follow-up(s) for email_log id=%d (enabled=%s)", max_rounds, parent_log.id, fs["enabled"])


# ─── Scheduler job ─────────────────────────────────────────────────────────────

def process_due_followups(db: Session) -> int:
    """
    Process all pending follow-ups whose scheduled_at has passed.
    Called by APScheduler every 15 minutes and via the manual trigger endpoint.
    Returns the number of follow-ups acted on.
    """
    now = datetime.utcnow()
    due = (
        db.query(FollowUpLog)
        .filter(FollowUpLog.status == "pending", FollowUpLog.scheduled_at <= now)
        .all()
    )

    processed = 0
    for fu in due:
        parent_log = db.query(EmailLog).filter(EmailLog.id == fu.parent_log_id).first()

        if not parent_log:
            fu.status = "skipped"
            fu.error_message = "Parent email log deleted"
            db.commit()
            continue

        # Skip if lead has replied
        if parent_log.replied_at:
            fu.status = "skipped"
            fu.error_message = "Lead has replied — follow-up not needed"
            db.commit()
            logger.info("Skipped follow-up %d — replied_at is set", fu.id)
            continue

        company = db.query(Company).filter(Company.id == fu.company_id).first()
        creds = _smtp_creds_for_log(parent_log, db)

        sender_full_name = creds.get("sender_full_name") or ""
        tracking_base_url = creds.get("tracking_base_url") or ""
        was_opened = bool(parent_log.opened_at)

        # Generate AI body
        email_data = _generate_followup_body(parent_log, fu.round_number, was_opened, company, sender_full_name)
        fu.subject = email_data["subject"]
        fu.body = email_data["body"]

        tracking_token = str(uuid.uuid4())
        send_creds = {k: v for k, v in creds.items() if k not in {"sender_full_name", "tracking_base_url"}}

        result = email_service.send_email(
            to_email=fu.recipient_email,
            to_name=fu.recipient_name or None,
            subject=fu.subject,
            body_html=fu.body,
            tracking_token=tracking_token,
            tracking_base_url=tracking_base_url,
            **send_creds,
        )

        if result["success"]:
            fu.status = "sent"
            fu.sent_at = datetime.utcnow()
            fu.tracking_token = tracking_token
            logger.info(
                "Sent follow-up round %d for email_log %d → %s",
                fu.round_number, parent_log.id, fu.recipient_email,
            )
        else:
            fu.status = "failed"
            fu.error_message = result.get("error", "Unknown error")
            logger.error("Follow-up failed for email_log %d: %s", parent_log.id, fu.error_message)

        db.commit()
        processed += 1

    return processed


# ─── REST endpoints ────────────────────────────────────────────────────────────

@router.get("/company/{company_id}")
def get_company_followups(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return all follow-up logs for a company, ordered by round number."""
    rows = (
        db.query(FollowUpLog)
        .filter(FollowUpLog.company_id == company_id)
        .order_by(FollowUpLog.round_number.asc(), FollowUpLog.created_at.asc())
        .all()
    )
    return [
        {
            "id": fu.id,
            "round_number": fu.round_number,
            "status": fu.status,
            "subject": fu.subject,
            "body": fu.body,
            "recipient_email": fu.recipient_email,
            "recipient_name": fu.recipient_name,
            "scheduled_at": fu.scheduled_at.isoformat() if fu.scheduled_at else None,
            "sent_at": fu.sent_at.isoformat() if fu.sent_at else None,
            "opened_at": fu.opened_at.isoformat() if fu.opened_at else None,
            "open_count": fu.open_count,
            "error_message": fu.error_message,
        }
        for fu in rows
    ]


@router.post("/send-due")
def trigger_send_due(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Manually trigger processing of all due follow-ups (same job the scheduler runs)."""
    count = process_due_followups(db)
    return {"message": f"Processed {count} follow-up(s)", "processed": count}
