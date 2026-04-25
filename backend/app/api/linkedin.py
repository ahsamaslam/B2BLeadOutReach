"""
LinkedIn OAuth2 + Outreach API endpoints.
"""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Company, LinkedInToken, User
from app.services.linkedin_service import linkedin_service

router = APIRouter()


# ─── OAuth ───────────────────────────────────────────────────────────────────

@router.get("/connect")
def linkedin_connect(
    current_user: User = Depends(get_current_user),
):
    """Redirect the logged-in user to LinkedIn's OAuth consent screen."""
    if not settings.LINKEDIN_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="LinkedIn integration is not configured. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env",
        )
    state = secrets.token_urlsafe(16)
    url = linkedin_service.get_authorization_url(state=state)
    return {"auth_url": url, "state": state}


@router.get("/callback")
def linkedin_callback(
    code: str,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Handle the OAuth2 callback from LinkedIn."""
    if error:
        raise HTTPException(status_code=400, detail=f"LinkedIn OAuth error: {error}")

    try:
        token_data = linkedin_service.exchange_code_for_token(code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {exc}")

    access_token = token_data.get("access_token")
    expires_in = token_data.get("expires_in", 5184000)  # default 60 days

    # Fetch profile info
    try:
        profile = linkedin_service.get_profile(access_token)
        member_id = profile.get("sub") or profile.get("id")
        name = profile.get("name") or f"{profile.get('given_name','')} {profile.get('family_name','')}".strip()
    except Exception:
        member_id = None
        name = None

    # Upsert token record
    lt = db.query(LinkedInToken).filter(LinkedInToken.user_id == current_user.id).first()
    if lt:
        lt.access_token = access_token
        lt.linkedin_member_id = member_id
        lt.linkedin_name = name
        lt.expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        lt.updated_at = datetime.utcnow()
    else:
        lt = LinkedInToken(
            user_id=current_user.id,
            access_token=access_token,
            linkedin_member_id=member_id,
            linkedin_name=name,
            expires_at=datetime.utcnow() + timedelta(seconds=expires_in),
        )
        db.add(lt)
    db.commit()

    return {"success": True, "linkedin_name": name}


@router.get("/status")
def linkedin_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return whether the current user has a valid LinkedIn token."""
    lt = db.query(LinkedInToken).filter(LinkedInToken.user_id == current_user.id).first()
    is_configured = bool(settings.LINKEDIN_CLIENT_ID and settings.LINKEDIN_CLIENT_SECRET)
    if not lt:
        return {"connected": False, "configured": is_configured}
    expired = lt.expires_at and lt.expires_at < datetime.utcnow()
    return {
        "connected": not expired,
        "configured": is_configured,
        "linkedin_name": lt.linkedin_name,
        "expires_at": lt.expires_at.isoformat() if lt.expires_at else None,
    }


@router.delete("/disconnect")
def linkedin_disconnect(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove stored LinkedIn token."""
    lt = db.query(LinkedInToken).filter(LinkedInToken.user_id == current_user.id).first()
    if lt:
        db.delete(lt)
        db.commit()
    return {"success": True}


# ─── Outreach ─────────────────────────────────────────────────────────────────

class LinkedInMessageRequest(BaseModel):
    company_id: int
    contact_linkedin_url: Optional[str] = None
    contact_name: Optional[str] = None
    message: str


@router.post("/send-message")
def send_linkedin_message(
    payload: LinkedInMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Attempt to send a LinkedIn message to a lead's contact.
    - If the user has a LinkedIn token AND the contact has a resolvable URN
      → sends via LinkedIn Messages API (works for 1st-degree connections).
    - Otherwise returns an InMail deep-link URL for manual sending.
    """
    company = db.query(Company).filter(Company.id == payload.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    lt = db.query(LinkedInToken).filter(LinkedInToken.user_id == current_user.id).first()

    # Build InMail URL as fallback
    inmail_url = None
    if payload.contact_linkedin_url:
        inmail_url = linkedin_service.build_inmail_url(payload.contact_linkedin_url)
    elif payload.contact_name:
        inmail_url = linkedin_service.build_sales_navigator_url(
            payload.contact_name, company.name
        )
    else:
        inmail_url = linkedin_service.build_sales_navigator_url("", company.name)

    # Try API send if user is connected
    api_attempted = False
    if lt and lt.access_token and (not lt.expires_at or lt.expires_at > datetime.utcnow()):
        if payload.contact_linkedin_url:
            slug = linkedin_service.profile_url_to_urn(payload.contact_linkedin_url)
            if slug:
                recipient_urn = f"urn:li:person:{slug}"
                sender_urn = f"urn:li:person:{lt.linkedin_member_id}"
                result = linkedin_service.send_message(
                    lt.access_token,
                    sender_urn,
                    recipient_urn,
                    payload.message,
                )
                api_attempted = True
                if result.get("success"):
                    # Update company linkedin status
                    company.linkedin_outreach_status = "sent"
                    company.linkedin_sent_at = datetime.utcnow()
                    db.commit()
                    return {
                        "method": "api",
                        "success": True,
                        "message": "Message sent via LinkedIn API",
                    }

    # Mark as pending (user will send via deep link)
    if not company.linkedin_outreach_status:
        company.linkedin_outreach_status = "pending"
        db.commit()

    return {
        "method": "deeplink",
        "success": False,
        "inmail_url": inmail_url,
        "note": (
            "Could not send via API (contact is not a 1st-degree connection or API not configured). "
            "Open the InMail URL to send manually."
        ),
    }


@router.post("/mark-sent/{company_id}")
def mark_linkedin_sent(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually mark a lead as having received a LinkedIn message."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company.linkedin_outreach_status = "sent"
    company.linkedin_sent_at = datetime.utcnow()
    db.commit()
    return {"success": True}


@router.get("/inmail-url/{company_id}")
def get_inmail_url(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the best InMail/Sales Navigator URL for a lead's primary contact."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    contacts = company.contacts or []
    best = (
        next((c for c in contacts if c.linkedin_url), None)
        or next((c for c in contacts if c.name), None)
    )

    if best and best.linkedin_url:
        url = linkedin_service.build_inmail_url(best.linkedin_url)
    elif best and best.name:
        url = linkedin_service.build_sales_navigator_url(best.name, company.name)
    else:
        url = linkedin_service.build_sales_navigator_url("", company.name)

    return {"inmail_url": url, "contact_name": best.name if best else None}
