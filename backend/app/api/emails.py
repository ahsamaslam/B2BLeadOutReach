import json
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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

    return {
        # SMTP connection — settings page values take priority over .env
        "smtp_host": saved.get("SMTP_HOST") or settings.SMTP_HOST,
        "smtp_port": int(saved.get("SMTP_PORT") or settings.SMTP_PORT),
        "smtp_user": saved.get("SMTP_USER") or settings.SMTP_USER,
        "smtp_password": saved.get("SMTP_PASSWORD") or settings.SMTP_PASSWORD,
        # Sender identity
        "from_email": saved.get("SMTP_FROM_EMAIL") or settings.SMTP_FROM_EMAIL,
        "from_name": saved.get("SMTP_FROM_NAME") or settings.SMTP_FROM_NAME,
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
        result = email_service.send_email(
            to_email=recipient,
            to_name=primary_contact.name if primary_contact else None,
            subject=template.subject,
            body_html=template.body,
            attach_portfolio=payload.attach_portfolio,
            user_id=current_user.id,
            tracking_token=tracking_token,
            **creds,
        )

        status = "sent" if result["success"] else "failed"
        log = EmailLog(
            template_id=template.id,
            company_id=company.id,
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

@router.get("/campaign-templates", response_model=list[CampaignTemplateResponse])
def list_campaign_templates(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(CampaignTemplate).order_by(CampaignTemplate.created_at.desc()).all()


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
    return tmpl


@router.get("/campaign-templates/{template_id}", response_model=CampaignTemplateResponse)
def get_campaign_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tmpl = db.query(CampaignTemplate).filter(CampaignTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Campaign template not found")
    return tmpl


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
    return tmpl


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
        result = email_service.send_email(
            to_email=recipient_email,
            to_name=owner_name or None,
            subject=subject,
            body_html=body,
            attach_portfolio=payload.attach_portfolio or tmpl.attach_portfolio,
            user_id=current_user.id,
            tracking_token=tracking_token,
            **creds,
        )

        status = "sent" if result["success"] else "failed"
        log = EmailLog(
            company_id=company.id,
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
        result = email_service.send_email(
            to_email=email.recipient_email,
            to_name=email.recipient_name or None,
            subject=email.subject,
            body_html=email.body,
            attach_portfolio=payload.attach_portfolio,
            user_id=current_user.id,
            tracking_token=tracking_token,
            tracking_base_url=tracking_base_url,
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
