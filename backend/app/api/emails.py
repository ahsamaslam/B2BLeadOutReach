from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Company, EmailTemplate, EmailLog, Contact, User
from app.schemas import EmailTemplateResponse, EmailTemplateUpdate, EmailLogResponse
from app.services import email_service


class SendEmailRequest(BaseModel):
    attach_portfolio: bool = False

router = APIRouter()


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

        result = email_service.send_email(
            to_email=recipient,
            to_name=primary_contact.name if primary_contact else None,
            subject=template.subject,
            body_html=template.body,
            attach_portfolio=payload.attach_portfolio,
            user_id=current_user.id,
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
def test_smtp(_: User = Depends(get_current_user)):
    """Verify that Hostinger SMTP credentials are working."""
    return email_service.test_smtp_connection()


@router.get("/logs", response_model=list[EmailLogResponse])
def get_logs(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(EmailLog).order_by(EmailLog.created_at.desc()).limit(500).all()
