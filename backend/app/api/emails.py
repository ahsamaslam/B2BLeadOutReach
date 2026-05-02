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

class SendEmailRequest(BaseModel):
    attach_portfolio: bool = False


class BulkSendRequest(BaseModel):
    company_ids: List[int]
    campaign_template_id: int
    attach_portfolio: bool = False

router = APIRouter()


def _load_email_creds(user: User, db: Session) -> dict:
    """Return per-tenant FROM address/name. API key always comes from platform .env."""
    if not user.tenant_id:
        return {}
    rows = (
        db.query(TenantSettings)
        .filter(
            TenantSettings.tenant_id == user.tenant_id,
            TenantSettings.key.in_(["SMTP_FROM_EMAIL", "SMTP_FROM_NAME"]),
        )
        .all()
    )
    saved = {r.key: r.value for r in rows if r.value}
    return {
        "from_email": saved.get("SMTP_FROM_EMAIL"),
        "from_name": saved.get("SMTP_FROM_NAME"),
    }



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
            **_load_email_creds(current_user, db),
        )

        status = "sent" if result["success"] else "failed"
        log = EmailLog(
            template_id=template.id,
            company_id=company.id,
            recipient_email=recipient,
            recipient_name=primary_contact.name if primary_contact else None,
            subject=template.subject,
            status=status,
            sent_at=datetime.utcnow() if result["success"] else None,
            tracking_token=tracking_token if result["success"] else None,
        )
        db.add(log)

        if result["success"]:
            template.status = "sent"
            company.status = "sent"
            sent += 1
        else:
            failed += 1

    db.commit()
    return {"message": "Send completed", "sent": sent, "failed": failed}


@router.post("/test-smtp")
def test_smtp(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify Resend credentials (uses tenant key if configured, else global)."""
    creds = _load_email_creds(current_user, db)
    return email_service.test_smtp_connection(
        api_key=creds.get("api_key"),
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
            **_load_email_creds(current_user, db),
        )

        status = "sent" if result["success"] else "failed"
        log = EmailLog(
            company_id=company.id,
            recipient_email=recipient_email,
            recipient_name=owner_name or None,
            subject=subject,
            status=status,
            sent_at=datetime.utcnow() if result["success"] else None,
            error_message=result.get("error") if not result["success"] else None,
            tracking_token=tracking_token if result["success"] else None,
        )
        db.add(log)

        if result["success"]:
            company.status = "sent"
            sent += 1
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
