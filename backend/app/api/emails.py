import json
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Company, EmailTemplate, EmailLog, Contact, User, CampaignTemplate, TenantSettings
from app.schemas import (
    EmailTemplateResponse,
    EmailTemplateUpdate,
    EmailLogResponse,
    CampaignTemplateCreate,
    CampaignTemplateUpdate,
    CampaignTemplateResponse,
)
from app.services import email_service
from app.config import settings

class SendEmailRequest(BaseModel):
    attach_portfolio: bool = False


class BulkSendRequest(BaseModel):
    company_ids: List[int]
    campaign_template_id: int
    attach_portfolio: bool = False


class AiEmailLeadItem(BaseModel):
    company_name: str = ""
    niche: str = ""
    domain: str = ""
    location: str = ""
    platform: str = ""
    decision_maker: str = ""
    role: str = ""
    linkedin_profile: str = ""
    company_linkedin: str = ""
    email_pattern: str = ""
    recipient_email: str = ""
    ai_gap_insight: str = ""
    remarks: str = ""
    template_name: str = ""
    template_subject: str = ""
    template_body: str = ""
    template_instructions: str = ""


class GenerateAiEmailsRequest(BaseModel):
    prompt: str = ""
    leads: List[AiEmailLeadItem]


class SendAiEmailItem(BaseModel):
    lead_index: int
    company_id: Optional[int] = None
    recipient_name: str = ""
    company_name: str = ""
    recipient_email: str
    subject: str
    body: str


class SendAiEmailsRequest(BaseModel):
    emails: List[SendAiEmailItem]
    attach_portfolio: bool = False


class BroadcastGenerateRequest(BaseModel):
    company_ids: List[int]
    campaign_template_id: int
    attach_portfolio: bool = False
    use_ai: bool = False


class BroadcastSendRequest(BaseModel):
    template_ids: List[int]
    attach_portfolio: bool = False


router = APIRouter()


_ALL_SMTP_KEYS = [
    "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD",
    "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "SENDER_FULL_NAME", "TRACKING_BASE_URL",
]


def _load_email_creds(user: User, db: Session) -> dict:
    """Return all per-tenant SMTP settings, falling back to global .env values."""
    saved: dict = {}
    if user.tenant_id:
        rows = (
            db.query(TenantSettings)
            .filter(
                TenantSettings.tenant_id == user.tenant_id,
                TenantSettings.key.in_(_ALL_SMTP_KEYS),
            )
            .all()
        )
        saved = {r.key: r.value for r in rows if r.value}

    # If SendGrid is configured, use SendGrid from_email/from_name. Otherwise use SMTP.
    if settings.SENDGRID_API_KEY:
        from_email = settings.SENDGRID_FROM_EMAIL or ""
        from_name = settings.SENDGRID_FROM_NAME or ""
    else:
        from_email = saved.get("SMTP_FROM_EMAIL") or settings.SMTP_FROM_EMAIL
        from_name = saved.get("SMTP_FROM_NAME") or settings.SMTP_FROM_NAME

    return {
        # SMTP connection — settings page values take priority over .env
        "smtp_host": saved.get("SMTP_HOST") or settings.SMTP_HOST,
        "smtp_port": int(saved.get("SMTP_PORT") or settings.SMTP_PORT),
        "smtp_user": saved.get("SMTP_USER") or settings.SMTP_USER,
        "smtp_password": saved.get("SMTP_PASSWORD") or settings.SMTP_PASSWORD,
        # Sender identity — use SendGrid settings if configured, else SMTP
        "from_email": from_email,
        "from_name": from_name,
        # Non-SMTP extras — stripped before **spreading into send_email()
        "sender_full_name": saved.get("SENDER_FULL_NAME") or settings.SENDER_FULL_NAME or "",
        "tracking_base_url": saved.get("TRACKING_BASE_URL") or settings.TRACKING_BASE_URL or "",
    }


def _get_sender_full_name(user: User, db: Session) -> str:
    """Return the configured sender full name for AI prompt injection."""
    return _load_email_creds(user, db).get("sender_full_name") or ""


def _assert_email_sending_configured(creds: dict) -> None:
    """Fail fast with a clear message when SMTP credentials are missing."""
    if not creds.get("smtp_user") or not creds.get("smtp_password"):
        raise HTTPException(
            status_code=400,
            detail="Email sending is not configured. Please set SMTP_USER and SMTP_PASSWORD in Settings before sending.",
        )


def _is_first_touch(db: Session, company_id: Optional[int], recipient_email: Optional[str]) -> bool:
    """Return True when we have no previously sent emails for this target."""
    query = db.query(EmailLog.id).filter(EmailLog.status == "sent")

    if company_id:
        query = query.filter(EmailLog.company_id == company_id)
    elif recipient_email:
        query = query.filter(EmailLog.recipient_email == recipient_email)
    else:
        # If we cannot identify the target, choose safer first-touch mode.
        return True

    return query.first() is None



def _resolve_template(db: Session, template_or_company_id: int) -> EmailTemplate | None:
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_or_company_id).first()
    if template:
        return template
    return db.query(EmailTemplate).filter(EmailTemplate.company_id == template_or_company_id).first()


@router.get("/templates", response_model=list[EmailTemplateResponse])
def get_templates(
    status: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(EmailTemplate)
    if status:
        query = query.filter(EmailTemplate.status == status)
    return query.order_by(EmailTemplate.updated_at.desc()).all()


@router.get("/templates/{template_or_company_id}", response_model=EmailTemplateResponse)
def get_template(
    template_or_company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    template = _resolve_template(db, template_or_company_id)
    if not template:
        raise HTTPException(status_code=404, detail="Email template not found")
    return template


@router.put("/templates/{template_or_company_id}", response_model=EmailTemplateResponse)
def update_template(
    template_or_company_id: int,
    payload: EmailTemplateUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    template = _resolve_template(db, template_or_company_id)
    if not template:
        raise HTTPException(status_code=404, detail="Email template not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


@router.post("/templates/{template_or_company_id}/approve", response_model=EmailTemplateResponse)
def approve_template(
    template_or_company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    template = _resolve_template(db, template_or_company_id)
    if not template:
        raise HTTPException(status_code=404, detail="Email template not found")

    template.status = "approved"
    template.approved_at = datetime.utcnow()

    company = db.query(Company).filter(Company.id == template.company_id).first()
    if company:
        company.status = "approved"

    db.commit()
    db.refresh(template)
    return template


@router.post("/send")
def send_approved_emails(
    payload: SendEmailRequest = SendEmailRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    creds = _load_email_creds(current_user, db)
    _assert_email_sending_configured(creds)

    templates = db.query(EmailTemplate).filter(EmailTemplate.status == "approved").all()

    sent = 0
    failed = 0
    for template in templates:
        company = db.query(Company).filter(Company.id == template.company_id).first()
        if not company:
            failed += 1
            continue

        primary_contact = (
            db.query(Contact)
            .filter(Contact.company_id == company.id)
            .filter(Contact.role.in_(["CEO", "CTO", "CFO"]))
            .first()
        )
        recipient = primary_contact.email if primary_contact and primary_contact.email else None

        if not recipient or recipient == "unknown@example.com":
            failed += 1
            continue

        tracking_token = str(uuid.uuid4())
        deliverability_mode = settings.DELIVERABILITY_MODE_ENABLED and _is_first_touch(
            db,
            company.id,
            recipient,
        )
        result = email_service.send_email(
            to_email=recipient,
            to_name=primary_contact.name if primary_contact else None,
            subject=template.subject,
            body_html=template.body,
            attach_portfolio=payload.attach_portfolio,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            tracking_token=tracking_token,
            deliverability_mode=deliverability_mode,
            **creds,
        )

        status = "sent" if result["success"] else "failed"
        log = EmailLog(
            template_id=template.id,
            company_id=company.id,
            tenant_id=current_user.tenant_id,
            recipient_email=recipient,
            recipient_name=primary_contact.name if primary_contact else None,
            subject=template.subject,
            body=template.body,
            status=status,
            sent_at=datetime.utcnow() if result["success"] else None,
            tracking_token=tracking_token if result["success"] else None,
        )
        db.add(log)

        if result["success"]:
            template.status = "sent"
            company.status = "sent"
            sent += 1
            # Schedule follow-ups for this lead
            db.flush()  # get log.id
            from app.api.followups import schedule_followups
            schedule_followups(log, db, tenant_id=current_user.tenant_id)
        else:
            failed += 1

    db.commit()
    return {"message": "Send completed", "sent": sent, "failed": failed}


@router.post("/test-smtp")
def test_smtp(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify SMTP credentials (uses tenant settings if configured, else global)."""
    creds = _load_email_creds(current_user, db)
    return email_service.test_smtp_connection(
        smtp_host=creds.get("smtp_host"),
        smtp_port=creds.get("smtp_port"),
        smtp_user=creds.get("smtp_user"),
        smtp_password=creds.get("smtp_password"),
        from_email=creds.get("from_email"),
    )


@router.get("/logs", response_model=list[EmailLogResponse])
def get_logs(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(EmailLog).order_by(EmailLog.created_at.desc()).limit(500).all()


# ─────────────────────────────────────────────
# Campaign Template CRUD
# ─────────────────────────────────────────────

def _template_with_stats(tmpl: CampaignTemplate, db: Session) -> dict:
    """Attach sent_count, open_rate, reply_rate to a CampaignTemplate row."""
    logs = db.query(EmailLog).filter(EmailLog.campaign_template_id == tmpl.id).all()
    sent = len([l for l in logs if l.status == "sent"])
    opens = len([l for l in logs if l.open_count and l.open_count > 0])
    replies = len([l for l in logs if l.replied_at is not None])
    open_rate  = round(opens  / sent * 100, 1) if sent else 0.0
    reply_rate = round(replies / sent * 100, 1) if sent else 0.0
    d = {c.key: getattr(tmpl, c.key) for c in tmpl.__table__.columns}
    d["sent_count"]  = sent
    d["open_rate"]   = open_rate
    d["reply_rate"]  = reply_rate
    return d


@router.get("/campaign-templates", response_model=list[CampaignTemplateResponse])
def list_campaign_templates(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    templates = db.query(CampaignTemplate).order_by(CampaignTemplate.created_at.desc()).all()
    return [_template_with_stats(t, db) for t in templates]


@router.post("/campaign-templates", response_model=CampaignTemplateResponse, status_code=201)
def create_campaign_template(
    payload: CampaignTemplateCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tmpl = CampaignTemplate(**payload.model_dump())
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return _template_with_stats(tmpl, db)


@router.get("/campaign-templates/{template_id}", response_model=CampaignTemplateResponse)
def get_campaign_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tmpl = db.query(CampaignTemplate).filter(CampaignTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Campaign template not found")
    return _template_with_stats(tmpl, db)


@router.put("/campaign-templates/{template_id}", response_model=CampaignTemplateResponse)
def update_campaign_template(
    template_id: int,
    payload: CampaignTemplateUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tmpl = db.query(CampaignTemplate).filter(CampaignTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Campaign template not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tmpl, key, value)
    db.commit()
    db.refresh(tmpl)
    return _template_with_stats(tmpl, db)


@router.post("/campaign-templates/{template_id}/duplicate", response_model=CampaignTemplateResponse, status_code=201)
def duplicate_campaign_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    src = db.query(CampaignTemplate).filter(CampaignTemplate.id == template_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Campaign template not found")
    copy = CampaignTemplate(
        name=f"{src.name} (copy)",
        subject_template=src.subject_template,
        body_template=src.body_template,
        instructions=src.instructions,
        attach_portfolio=src.attach_portfolio,
        tags=src.tags,
        is_default=False,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return _template_with_stats(copy, db)


@router.post("/campaign-templates/{template_id}/preview")
def preview_campaign_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Render template with sample/placeholder data for preview."""
    tmpl = db.query(CampaignTemplate).filter(CampaignTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Campaign template not found")
    sample = {
        "company_name": "Acme Corp",
        "owner_name": "Jane Smith",
        "niche": "SaaS",
        "location": "San Francisco, CA",
        "address": "123 Market St, San Francisco, CA 94103",
        "specific_page": "acmecorp.com/about",
        "date": datetime.utcnow().strftime("%B %d, %Y"),
    }
    def render(text: str) -> str:
        for k, v in sample.items():
            text = text.replace("{{" + k + "}}", v)
        return text
    return {
        "subject": render(tmpl.subject_template),
        "body": render(tmpl.body_template),
        "sample": sample,
    }


@router.delete("/campaign-templates/{template_id}")
def delete_campaign_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tmpl = db.query(CampaignTemplate).filter(CampaignTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Campaign template not found")
    db.delete(tmpl)
    db.commit()
    return {"message": "Campaign template deleted"}


# ─────────────────────────────────────────────
# Bulk send using a campaign template
# ─────────────────────────────────────────────

@router.post("/send-bulk")
async def send_bulk_emails(
    payload: BulkSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send emails to a list of companies using a campaign template.
    Template variables like {{company_name}}, {{owner_name}}, {{address}},
    {{niche}}, {{location}} are substituted with company data.
    """
    tmpl = db.query(CampaignTemplate).filter(CampaignTemplate.id == payload.campaign_template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Campaign template not found")

    companies = db.query(Company).filter(Company.id.in_(payload.company_ids)).all()
    if not companies:
        raise HTTPException(status_code=404, detail="No matching companies found")

    sent = 0
    failed = 0
    errors: list[str] = []
    creds = _load_email_creds(current_user, db)
    _assert_email_sending_configured(creds)

    for company in companies:
        contacts_by_role: dict[str, Contact] = {}
        for ct in company.contacts:
            contacts_by_role[ct.role.upper()] = ct

        primary = (
            contacts_by_role.get("CEO")
            or contacts_by_role.get("CTO")
            or contacts_by_role.get("CFO")
        )
        recipient_email = primary.email if primary else None

        if not recipient_email:
            failed += 1
            errors.append(f"{company.name}: no recipient email found")
            continue

        owner_name = primary.name if primary else ""

        def _substitute(text: str) -> str:
            return (
                text
                .replace("{{company_name}}", company.name or "")
                .replace("{{owner_name}}", owner_name or "")
                .replace("{{address}}", company.address or "")
                .replace("{{niche}}", company.niche or "")
                .replace("{{location}}", company.location or "")
                .replace("{{website}}", company.website or "")
            )

        subject = _substitute(tmpl.subject_template)
        body = _substitute(tmpl.body_template)

        tracking_token = str(uuid.uuid4())
        deliverability_mode = settings.DELIVERABILITY_MODE_ENABLED and _is_first_touch(
            db,
            company.id,
            recipient_email,
        )
        result = email_service.send_email(
            to_email=recipient_email,
            to_name=owner_name or None,
            subject=subject,
            body_html=body,
            attach_portfolio=payload.attach_portfolio or tmpl.attach_portfolio,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            tracking_token=tracking_token,
            deliverability_mode=deliverability_mode,
            **creds,
        )

        status = "sent" if result["success"] else "failed"
        log = EmailLog(
            company_id=company.id,
            campaign_template_id=tmpl.id,
            tenant_id=current_user.tenant_id,
            recipient_email=recipient_email,
            recipient_name=owner_name or None,
            subject=subject,
            body=body,
            status=status,
            sent_at=datetime.utcnow() if result["success"] else None,
            error_message=result.get("error") if not result["success"] else None,
            tracking_token=tracking_token if result["success"] else None,
        )
        db.add(log)

        if result["success"]:
            company.status = "sent"
            sent += 1
            # Schedule follow-ups for this lead
            db.flush()  # get log.id
            from app.api.followups import schedule_followups
            schedule_followups(log, db, tenant_id=current_user.tenant_id)
        else:
            failed += 1
            errors.append(f"{company.name}: {result.get('error', 'send failed')}")

    db.commit()
    return {
        "message": "Bulk send completed",
        "sent": sent,
        "failed": failed,
        "errors": errors,
    }


# ─────────────────────────────────────────────
# AI-powered email generation
# ─────────────────────────────────────────────

@router.post("/generate-ai")
def generate_ai_emails(
    payload: GenerateAiEmailsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Use Anthropic Claude to generate personalised emails for each lead."""
    from anthropic import Anthropic

    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=400, detail="ANTHROPIC_API_KEY is not configured")

    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    sender_name = _get_sender_full_name(current_user, db)
    items = []

    for idx, lead in enumerate(payload.leads):
        instructions_block = (
            f"\n\nAdditional instructions from the sender:\n{lead.template_instructions.strip()}"
            if lead.template_instructions and lead.template_instructions.strip()
            else ""
        )
        sender_block = (
            f" After the closing (e.g. 'Regards,' or 'Best,'), sign with the sender's full name: {sender_name}."
            if sender_name
            else ""
        )
        system_prompt = (
            "You are an expert B2B outreach copywriter. "
            "Write a single personalised cold email for the lead below. "
            "Use the template as a structural and stylistic guide, but tailor every sentence specifically to the recipient's company and context. "
            "Return a JSON object with exactly two keys: \"subject\" and \"body\". "
            "The \"body\" value MUST be valid HTML — use <p> tags for paragraphs, <br> for line breaks, <strong> for bold text. "
            "Do NOT use plain newlines for line breaks. Do NOT wrap the HTML in <html> or <body> tags. No markdown, no extra text outside the JSON. "
            "IMPORTANT for subject lines: write like a message from a real colleague — short, specific, no spam trigger words. "
            "Never use: ALL CAPS, excessive punctuation (!!!, ???), words like FREE, URGENT, LIMITED TIME, GUARANTEED, DISCOUNT, OFFER, DEAL, CLICK HERE, ACT NOW, or any monetary symbols ($$$). "
            "Subject lines should be 4–9 words, conversational, and reference something specific about the recipient's company."
            + sender_block
            + instructions_block
        )
        user_prompt = f"""Template name: {lead.template_name}
Subject template: {lead.template_subject}
Body template:
{lead.template_body}

Lead details:
- Company: {lead.company_name}
- Niche: {lead.niche}
- Domain: {lead.domain}
- Location: {lead.location}
- Platform: {lead.platform}
- Decision maker: {lead.decision_maker} ({lead.role})
- LinkedIn: {lead.linkedin_profile}
- AI gap insight: {lead.ai_gap_insight}
- Remarks: {lead.remarks}
- Recipient email: {lead.recipient_email}
- Sender name: {sender_name}"""

        try:
            message = client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw = message.content[0].text.strip()
            # Strip markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            data = json.loads(raw)
            items.append({
                "lead_index": idx,
                "recipient_name": lead.decision_maker,
                "company_name": lead.company_name,
                "recipient_email": lead.recipient_email,
                "subject": data.get("subject", ""),
                "body": data.get("body", ""),
            })
        except Exception as exc:
            items.append({
                "lead_index": idx,
                "recipient_name": lead.decision_maker,
                "company_name": lead.company_name,
                "recipient_email": lead.recipient_email,
                "subject": "",
                "body": "",
                "error": str(exc),
            })

    return {"items": items}


# ─────────────────────────────────────────────
# Send AI-generated emails
# ─────────────────────────────────────────────

@router.post("/send-ai")
async def send_ai_emails(
    payload: SendAiEmailsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send emails that were AI-generated and approved by the user."""
    sent = 0
    failed = 0
    items = []

    creds = _load_email_creds(current_user, db)
    _assert_email_sending_configured(creds)
    # Strip keys that don't belong in send_email() signature
    _EXTRA_KEYS = {"sender_full_name", "tracking_base_url"}
    send_creds = {k: v for k, v in creds.items() if k not in _EXTRA_KEYS}
    tracking_base_url = creds.get("tracking_base_url") or ""

    for email in payload.emails:
        if not email.recipient_email:
            failed += 1
            items.append({"lead_index": email.lead_index, "success": False, "error": "No recipient email"})
            continue

        tracking_token = str(uuid.uuid4())
        deliverability_mode = settings.DELIVERABILITY_MODE_ENABLED and _is_first_touch(
            db,
            email.company_id,
            email.recipient_email,
        )
        result = email_service.send_email(
            to_email=email.recipient_email,
            to_name=email.recipient_name or None,
            subject=email.subject,
            body_html=email.body,
            attach_portfolio=payload.attach_portfolio,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            tracking_token=tracking_token,
            tracking_base_url=tracking_base_url,
            deliverability_mode=deliverability_mode,
            **send_creds,
        )

        if result["success"]:
            sent += 1
            # Update company status so it moves to History
            if email.company_id:
                company_obj = db.query(Company).filter(Company.id == email.company_id).first()
                if company_obj:
                    company_obj.status = "sent"
            log = EmailLog(
                company_id=email.company_id,
                tenant_id=current_user.tenant_id,
                recipient_email=email.recipient_email,
                recipient_name=email.recipient_name or None,
                subject=email.subject,
                body=email.body,
                status="sent",
                sent_at=datetime.utcnow(),
                tracking_token=tracking_token,
            )
            db.add(log)
            # Schedule follow-ups for this lead
            db.flush()  # get log.id
            from app.api.followups import schedule_followups
            schedule_followups(log, db, tenant_id=current_user.tenant_id)
            items.append({"lead_index": email.lead_index, "success": True})
        else:
            failed += 1
            items.append({
                "lead_index": email.lead_index,
                "success": False,
                "error": result.get("error", "Send failed"),
            })

    db.commit()
    return {"items": items, "sent": sent, "failed": failed}


# ─────────────────────────────────────────────
# Broadcast: generate drafts, list drafts, reject, send-approved
# ─────────────────────────────────────────────

def _primary_contact(company: Company):
    """Return the highest-priority contact for a company."""
    by_role = {ct.role.upper(): ct for ct in company.contacts}
    return (
        by_role.get("CEO")
        or by_role.get("CTO")
        or by_role.get("CFO")
        or next(iter(company.contacts), None)
    )


def _substitute_placeholders(text: str, company: Company, owner_name: str) -> str:
    first_name = (owner_name or "").split()[0] if owner_name else ""
    return (
        text
        # company name variants
        .replace("{{company_name}}", company.name or "")
        .replace("{{company}}", company.name or "")
        .replace("{{PROSPECT_COMPANY}}", company.name or "")
        # owner/contact name variants
        .replace("{{owner_name}}", owner_name or "")
        .replace("{{owner}}", owner_name or "")
        .replace("{{PROSPECT_FIRST_NAME}}", first_name)
        # other lead fields
        .replace("{{address}}", company.address or "")
        .replace("{{niche}}", company.niche or "")
        .replace("{{PROSPECT_INDUSTRY}}", company.niche or "")
        .replace("{{location}}", company.location or "")
        .replace("{{website}}", company.website or "")
    )


@router.post("/broadcast/generate")
async def broadcast_generate(
    payload: BroadcastGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    For each selected company, generate a personalised email draft from the
    campaign template and store/update it as an EmailTemplate record.
    If use_ai=True and ANTHROPIC_API_KEY is configured, calls Claude for
    deeper personalisation; otherwise falls back to placeholder substitution.
    """
    tmpl = db.query(CampaignTemplate).filter(CampaignTemplate.id == payload.campaign_template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Campaign template not found")

    companies = db.query(Company).filter(Company.id.in_(payload.company_ids)).all()
    sender_name = _get_sender_full_name(current_user, db)

    ai_client = None
    if payload.use_ai and settings.ANTHROPIC_API_KEY:
        try:
            from anthropic import Anthropic
            ai_client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        except Exception:
            pass

    results = []
    for company in companies:
        primary = _primary_contact(company)
        owner_name = primary.name if primary else ""
        recipient_email = primary.email if primary else ""
        recipient_role = primary.role if primary else ""

        subject = _substitute_placeholders(tmpl.subject_template, company, owner_name)
        body = _substitute_placeholders(tmpl.body_template, company, owner_name)

        # Attempt AI generation
        if ai_client:
            try:
                import re as _re
                import logging as _logging
                _log = _logging.getLogger(__name__)

                domain = (company.website or "").replace("https://", "").replace("http://", "").split("/")[0]
                first_name = owner_name.split()[0] if owner_name else ""
                niche = company.niche or "general business"
                location = company.location or "unknown"

                # Find every {{PLACEHOLDER}} in subject + body (all-caps style = AI must fill)
                all_text = tmpl.subject_template + "\n" + tmpl.body_template
                ai_placeholders = list(dict.fromkeys(
                    _re.findall(r"\{\{([A-Z][A-Z0-9_]*)\}\}", all_text)
                ))
                _log.warning("DEBUG ai_placeholders found: %s", ai_placeholders)

                if ai_placeholders:
                    # STEP 1: Ask Claude for a values dictionary only
                    placeholder_json_keys = json.dumps(ai_placeholders, indent=2)
                    instr_block = (
                        f"\n\nExtra campaign instructions: {tmpl.instructions.strip()}"
                        if tmpl.instructions else ""
                    )
                    step1 = ai_client.messages.create(
                        model=settings.ANTHROPIC_MODEL,
                        max_tokens=2500,
                        system=(
                            "You are an expert B2B cold email copywriter. "
                            "You will receive a list of placeholder names and lead data. "
                            "Your job: return a JSON object where each key is a placeholder name and the value is the text to replace it with. "
                            "Rules:\n"
                            "- Every key in the input list MUST appear in your output.\n"
                            "- Values must be specific to the lead's industry/niche — never generic.\n"
                            "- You have full creative freedom to invent realistic, specific content.\n"
                            "- Values should be short phrases or sentences, not placeholders or template text.\n"
                            "- Do NOT include {{...}} brackets in your values — write the actual content.\n"
                            "- Return ONLY valid JSON, no markdown, no explanation.\n"
                            "Niche-specific guidance:\n"
                            "  SPECIFIC_PAGE_OR_SERVICE → a real page/service that niche typically has (e.g. 'Property Listings page', 'Booking & Scheduling section')\n"
                            "  CURRENT_BUSINESS_ACTIVITY → what they're likely doing right now in their niche\n"
                            "  SPECIFIC_COMPLIMENT_ABOUT_THEIR_BUSINESS → genuine compliment based on their niche and location\n"
                            "  INDUSTRY_PAIN_POINT → real problem businesses in this niche face daily\n"
                            "  COST_ESTIMATE → realistic dollar/time cost (e.g. '$40,000' or '200 hours')\n"
                            "  RESOURCE_TYPE → time, money, staff, leads, etc.\n"
                            "  AUTOMATION_OPPORTUNITY_1/2/3 → specific task in their niche that can be automated\n"
                            "  CURRENT_MANUAL_PROCESS → what they're doing manually now\n"
                            "  BENEFIT_1/2/3 → concrete benefit from automating (e.g. 'respond to inquiries 10x faster')\n"
                            "  SPECIFIC_OBSERVATION → something observable about a business in their niche\n"
                            "  SPECIFIC_INSIGHT → insight about their niche operations\n"
                            "  INDUSTRY_TREND_OR_URGENCY → current trend driving urgency in their niche\n"
                            "  INDUSTRY_BENCHMARK_RESULT → stat like '30% more leads' or '2x response rates'\n"
                            "  MY_COMPANY_SPECIALIZATION → describe specialization relevant to their niche\n"
                            "  UNIQUE_VALUE_PROPOSITION → value prop tailored to their niche problems\n"
                            "  SPECIFIC_RESULT → result we've helped similar companies achieve\n"
                            "  PROBLEM_1/2/3 → real problems in their niche\n"
                            "  SOLUTION_1/2/3 → solutions matching those problems\n"
                            "  MOST_RELEVANT_OPPORTUNITY → single most impactful automation for their niche\n"
                            "  SPECIFIC_TECHNOLOGY → relevant AI/automation technology for their niche\n"
                            "  SPECIFIC_METRIC → key metric that matters in their niche\n"
                            "  SPECIFIC_PROCESS → a process in their niche ripe for automation\n"
                            "  ESTIMATED_SAVINGS → realistic savings claim (e.g. '15 hours/week' or '$2,000/month')\n"
                            "  SPECIFIC_PERSONALIZED_PS_ABOUT_THEIR_BUSINESS_OR_RECENT_NEWS → short PS line relevant to their niche\n"
                            + instr_block
                        ),
                        messages=[{
                            "role": "user",
                            "content": (
                                f"Lead info:\n"
                                f"  First name: {first_name or 'there'}\n"
                                f"  Full name: {owner_name or 'the owner'}\n"
                                f"  Company: {company.name or 'their company'}\n"
                                f"  Domain: {domain or 'unknown'}\n"
                                f"  Industry/Niche: {niche}\n"
                                f"  Location: {location}\n"
                                f"  Role: {recipient_role or 'owner'}\n"
                                f"  Company info: {(company.company_info or '')[:600]}\n\n"
                                f"Placeholder names to fill (return as JSON object):\n{placeholder_json_keys}\n\n"
                                f"Return ONLY a JSON object mapping each placeholder name to its value. "
                                f"Make every value specific to a {niche} business in {location}."
                            ),
                        }],
                    )
                    raw1 = step1.content[0].text.strip()
                    _log.warning("DEBUG step1 raw response: %s", raw1[:500])
                    if raw1.startswith("```"):
                        raw1 = raw1.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                    values_map = json.loads(raw1)
                    _log.warning("DEBUG values_map keys: %s", list(values_map.keys()))

                    # STEP 2: substitute all AI-filled values into subject and body
                    for key, val in values_map.items():
                        if isinstance(val, str):
                            subject = subject.replace(f"{{{{{key}}}}}", val)
                            body = body.replace(f"{{{{{key}}}}}", val)
                    _log.warning("DEBUG after substitution subject: %s", subject[:200])

                # STEP 3: Ask Claude to polish the final email into clean HTML
                polish = ai_client.messages.create(
                    model=settings.ANTHROPIC_MODEL,
                    max_tokens=2500,
                    system=(
                        "You are a B2B email editor. You receive a nearly-complete cold email. "
                        "Your job:\n"
                        "1. If any {{PLACEHOLDER}} still remains, replace it with a realistic value based on context.\n"
                        "2. Make the email flow naturally — fix any awkward phrasing from substitution.\n"
                        "3. Return ONLY valid JSON with 'subject' and 'body' keys.\n"
                        "4. Body must be valid HTML using <p> and <br> tags.\n"
                        "5. Do NOT add new sections or change the structure significantly.\n"
                        "6. Human, warm, consultative tone."
                        + (f" Sign off as: {sender_name}." if sender_name else "")
                    ),
                    messages=[{
                        "role": "user",
                        "content": (
                            f"Subject: {subject}\n\n"
                            f"Body:\n{body}\n\n"
                            f"Return as JSON with 'subject' and 'body' keys."
                        ),
                    }],
                )
                raw2 = polish.content[0].text.strip()
                if raw2.startswith("```"):
                    raw2 = raw2.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                data = json.loads(raw2)
                subject = data.get("subject", subject)
                body = data.get("body", body)

            except Exception as e:
                import logging
                logging.getLogger(__name__).error("AI generation failed: %s", e, exc_info=True)

        # Upsert EmailTemplate record (skip if already sent)
        existing = (
            db.query(EmailTemplate)
            .filter(EmailTemplate.company_id == company.id)
            .filter(EmailTemplate.status.notin_(["sent"]))
            .order_by(EmailTemplate.updated_at.desc())
            .first()
        )
        if existing:
            existing.subject = subject
            existing.body = body
            existing.status = "drafted"
            existing.updated_at = datetime.utcnow()
            existing.campaign_template_id = tmpl.id
            et = existing
        else:
            et = EmailTemplate(company_id=company.id, campaign_template_id=tmpl.id, subject=subject, body=body, status="drafted")
            db.add(et)
        db.flush()

        domain = (company.website or "").replace("https://", "").replace("http://", "").split("/")[0]
        results.append({
            "company_id": company.id,
            "template_id": et.id,
            "company_name": company.name,
            "domain": domain,
            "niche": company.niche or "",
            "location": company.location or "",
            "contact_name": owner_name,
            "contact_email": recipient_email,
            "status": "drafted",
            "subject": subject,
            "body": body,
            "filled_vars": {
                "company": company.name or "",
                "niche": company.niche or "",
                "owner": owner_name,
                "location": company.location or "",
                "domain": domain,
            },
        })

    db.commit()
    return {"results": results, "generated": len(results)}


@router.get("/broadcast/drafts")
def broadcast_get_drafts(
    company_ids: str = "",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return the latest draft for each requested company ID."""
    if not company_ids:
        return []
    ids = [int(x) for x in company_ids.split(",") if x.strip().isdigit()]
    companies = db.query(Company).filter(Company.id.in_(ids)).all()

    result = []
    for company in companies:
        primary = _primary_contact(company)
        et = (
            db.query(EmailTemplate)
            .filter(EmailTemplate.company_id == company.id)
            .filter(EmailTemplate.status.notin_(["sent"]))
            .order_by(EmailTemplate.updated_at.desc())
            .first()
        )
        domain = (company.website or "").replace("https://", "").replace("http://", "").split("/")[0]
        result.append({
            "company_id": company.id,
            "company_name": company.name,
            "domain": domain,
            "niche": company.niche or "",
            "location": company.location or "",
            "contact_name": primary.name if primary else "",
            "contact_email": primary.email if primary else "",
            "template_id": et.id if et else None,
            "status": et.status if et else "pending",
            "subject": et.subject if et else "",
            "body": et.body if et else "",
            "filled_vars": {
                "company": company.name or "",
                "niche": company.niche or "",
                "owner": primary.name if primary else "",
                "location": company.location or "",
                "domain": domain,
            },
        })
    return result


@router.post("/templates/{template_id}/reject")
def reject_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Mark an email draft as rejected."""
    et = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not et:
        raise HTTPException(status_code=404, detail="Template not found")
    et.status = "rejected"
    db.commit()
    return {"id": et.id, "status": "rejected"}


@router.post("/broadcast/send-approved")
def broadcast_send_approved(
    payload: BroadcastSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send all approved EmailTemplate drafts in the given list."""
    templates = (
        db.query(EmailTemplate)
        .filter(EmailTemplate.id.in_(payload.template_ids))
        .filter(EmailTemplate.status == "approved")
        .all()
    )
    if not templates:
        return {"sent": 0, "failed": 0, "errors": []}

    creds = _load_email_creds(current_user, db)
    _assert_email_sending_configured(creds)
    _EXTRA = {"sender_full_name", "tracking_base_url"}
    send_creds = {k: v for k, v in creds.items() if k not in _EXTRA}
    tracking_base_url = creds.get("tracking_base_url") or ""

    sent = 0
    failed = 0
    errors: list[str] = []

    for et in templates:
        company = db.query(Company).filter(Company.id == et.company_id).first()
        primary = _primary_contact(company) if company else None
        recipient_email = primary.email if primary else None

        if not recipient_email:
            failed += 1
            errors.append(f"company {et.company_id}: no recipient email")
            continue

        tracking_token = str(uuid.uuid4())
        deliverability_mode = settings.DELIVERABILITY_MODE_ENABLED and _is_first_touch(
            db, et.company_id, recipient_email
        )
        result = email_service.send_email(
            to_email=recipient_email,
            to_name=primary.name if primary else None,
            subject=et.subject,
            body_html=et.body,
            attach_portfolio=payload.attach_portfolio,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            tracking_token=tracking_token,
            tracking_base_url=tracking_base_url,
            deliverability_mode=deliverability_mode,
            **send_creds,
        )

        if result["success"]:
            sent += 1
            et.status = "sent"
            if company:
                company.status = "sent"
            log = EmailLog(
                template_id=et.id,
                campaign_template_id=et.campaign_template_id,
                company_id=et.company_id,
                tenant_id=current_user.tenant_id,
                recipient_email=recipient_email,
                recipient_name=primary.name if primary else None,
                subject=et.subject,
                body=et.body,
                status="sent",
                sent_at=datetime.utcnow(),
                tracking_token=tracking_token,
            )
            db.add(log)
            db.flush()
            from app.api.followups import schedule_followups
            schedule_followups(log, db, tenant_id=current_user.tenant_id)
        else:
            failed += 1
            errors.append(f"company {et.company_id}: {result.get('error', 'send failed')}")

    db.commit()
    return {"sent": sent, "failed": failed, "errors": errors}


# ─────────────────────────────────────────────────────────────────────────────
# Sent History endpoints
# ─────────────────────────────────────────────────────────────────────────────

def _days_ago(n: int) -> datetime:
    from datetime import timedelta
    return datetime.utcnow() - timedelta(days=n)


@router.get("/history/stats")
def get_history_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return aggregate stats for the sent-history page."""
    from datetime import timedelta
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    base = db.query(EmailLog).filter(EmailLog.status == "sent")
    total = base.count()
    this_week = base.filter(EmailLog.sent_at >= week_ago).count()
    last_week = (
        db.query(EmailLog)
        .filter(EmailLog.status == "sent", EmailLog.sent_at >= two_weeks_ago, EmailLog.sent_at < week_ago)
        .count()
    )
    opened = db.query(EmailLog).filter(EmailLog.status == "sent", EmailLog.open_count > 0).count()
    replied = db.query(EmailLog).filter(EmailLog.status == "sent", EmailLog.replied_at.isnot(None)).count()
    bounced = db.query(EmailLog).filter(EmailLog.status == "bounced").count()
    bounced_total = db.query(EmailLog).filter(EmailLog.status.in_(["sent", "bounced"])).count()

    open_rate = round(opened / total * 100, 1) if total else 0.0
    reply_rate = round(replied / total * 100, 1) if total else 0.0

    return {
        "total_sent": total,
        "this_week": this_week,
        "last_week": last_week,
        "delta_week": this_week - last_week,
        "opened": opened,
        "open_rate": open_rate,
        "replied": replied,
        "reply_rate": reply_rate,
        "bounced": bounced,
        "window_label": "7-day window",
    }


@router.get("/history/chart")
def get_history_chart(
    days: int = 14,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return daily sent / opened counts for the last N days."""
    from datetime import timedelta, date as date_type
    import calendar

    cutoff = datetime.utcnow() - timedelta(days=days)
    logs = (
        db.query(EmailLog)
        .filter(EmailLog.status.in_(["sent", "bounced"]), EmailLog.sent_at >= cutoff)
        .all()
    )

    from collections import defaultdict
    sent_by_day: dict = defaultdict(int)
    opened_by_day: dict = defaultdict(int)

    for log in logs:
        if log.sent_at:
            d = log.sent_at.date().isoformat()
            sent_by_day[d] += 1
            if log.open_count and log.open_count > 0:
                opened_by_day[d] += 1

    today = datetime.utcnow().date()
    result = []
    for i in range(days, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        result.append({"date": d, "sent": sent_by_day.get(d, 0), "opened": opened_by_day.get(d, 0)})

    return result


@router.get("/history")
def get_history(
    q: Optional[str] = None,
    status: Optional[str] = None,
    date_range: str = "7d",
    niche: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Paginated email history with company + contact enrichment."""
    from datetime import timedelta

    query = db.query(EmailLog).join(Company, EmailLog.company_id == Company.id, isouter=True)

    # Date filter
    if date_range == "7d":
        query = query.filter(EmailLog.sent_at >= _days_ago(7))
    elif date_range == "30d":
        query = query.filter(EmailLog.sent_at >= _days_ago(30))
    elif date_range == "90d":
        query = query.filter(EmailLog.sent_at >= _days_ago(90))

    # Status filter
    if status == "opened":
        query = query.filter(EmailLog.open_count > 0)
    elif status == "replied":
        query = query.filter(EmailLog.replied_at.isnot(None))
    elif status == "bounced":
        query = query.filter(EmailLog.status == "bounced")
    elif status == "not_opened":
        query = query.filter(EmailLog.open_count == 0, EmailLog.status == "sent")
    elif status and status != "all":
        query = query.filter(EmailLog.status == status)

    # Niche filter
    if niche:
        query = query.filter(Company.niche.ilike(f"%{niche}%"))

    # Search
    if q:
        like = f"%{q}%"
        query = query.filter(
            Company.name.ilike(like)
            | EmailLog.recipient_email.ilike(like)
            | EmailLog.recipient_name.ilike(like)
            | EmailLog.subject.ilike(like)
            | Company.niche.ilike(like)
            | Company.location.ilike(like)
        )

    total = query.count()
    logs = (
        query.order_by(EmailLog.sent_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for log in logs:
        company = log.company
        domain = ""
        if company and company.website:
            domain = company.website.replace("https://", "").replace("http://", "").split("/")[0]
        items.append({
            "id": log.id,
            "company_id": log.company_id,
            "company_name": company.name if company else "",
            "company_domain": domain,
            "niche": company.niche if company else None,
            "location": company.location if company else None,
            "recipient_name": log.recipient_name,
            "recipient_email": log.recipient_email,
            "subject": log.subject,
            "status": log.status,
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "opened_at": log.opened_at.isoformat() if log.opened_at else None,
            "open_count": log.open_count or 0,
            "replied_at": log.replied_at.isoformat() if log.replied_at else None,
            "error_message": log.error_message,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size)}


@router.delete("/logs/{log_id}", status_code=204)
def delete_log(
    log_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    log = db.query(EmailLog).filter(EmailLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    db.delete(log)
    db.commit()


@router.get("/history/niches")
def get_history_niches(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return distinct niches from sent emails for the filter dropdown."""
    rows = (
        db.query(Company.niche)
        .join(EmailLog, EmailLog.company_id == Company.id)
        .filter(Company.niche.isnot(None), Company.niche != "")
        .distinct()
        .all()
    )
    return sorted([r[0] for r in rows if r[0]])
