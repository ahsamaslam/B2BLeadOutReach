"""
Tenant Settings API — read and write per-tenant configuration.

Settings are stored in the tenant_settings table as key-value pairs.
They override (but do not replace) global env vars.
"""
import json
import secrets
import smtplib
import string
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.config import settings as global_settings
from app.database import get_db
from app.models import Tenant, TenantSettings, User
from app.services.email_service import send_email

router = APIRouter()

# Settings keys grouped by category — defines what the UI shows
SETTINGS_SCHEMA = {
    "branding": [
        {"key": "MY_COMPANY_NAME", "label": "Company Name", "type": "text"},
        {"key": "MY_COMPANY_SERVICES", "label": "Services Description", "type": "text"},
        {"key": "MY_COMPANY_VALUE_PROP", "label": "Value Proposition", "type": "text"},
        {"key": "MY_COMPANY_WEBSITE", "label": "Company Website", "type": "text"},
        {"key": "MY_COMPANY_CONTACT", "label": "Contact Email", "type": "text"},
        {"key": "SENDER_FULL_NAME", "label": "Sender Full Name", "type": "text"},
    ],
    "email": [
        {"key": "SMTP_HOST", "label": "SMTP Host", "type": "text"},
        {"key": "SMTP_PORT", "label": "SMTP Port", "type": "text"},
        {"key": "SMTP_USER", "label": "SMTP Username", "type": "text"},
        {"key": "SMTP_PASSWORD", "label": "SMTP Password", "type": "password"},
        {"key": "SMTP_FROM_EMAIL", "label": "From Email Address", "type": "text"},
        {"key": "SMTP_FROM_NAME", "label": "From Name", "type": "text"},
    ],
    "tracking": [
        {
            "key": "TRACKING_ENABLED",
            "label": "Enable Open Tracking (true / false)",
            "type": "text",
        },
        {
            "key": "TRACKING_BASE_URL",
            "label": "Tracking Base URL",
            "type": "text",
            "hint": "Public URL of your backend, e.g. https://api.myapp.com — required for open tracking to work",
        },
    ],
    "followup": [
        {"key": "FOLLOWUP_ENABLED", "label": "Enable Follow-up Automation (true / false)", "type": "text"},
        {"key": "FOLLOWUP_MAX_ROUNDS", "label": "Max Follow-up Rounds (1–3)", "type": "text"},
        {"key": "FOLLOWUP_1_DAYS_UNOPENED", "label": "Round 1 — Not Opened (days)", "type": "text"},
        {"key": "FOLLOWUP_2_DAYS_UNOPENED", "label": "Round 2 — Not Opened (days)", "type": "text"},
        {"key": "FOLLOWUP_3_DAYS_UNOPENED", "label": "Round 3 — Not Opened (days)", "type": "text"},
        {"key": "FOLLOWUP_1_DAYS_OPENED", "label": "Round 1 — Opened, No Reply (days)", "type": "text"},
        {"key": "FOLLOWUP_2_DAYS_OPENED", "label": "Round 2 — Opened, No Reply (days)", "type": "text"},
    ],
}


def _get_or_create_tenant(db: Session, user: User) -> Tenant:
    """Ensure the user has a tenant; create one if not."""
    if user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant:
            return tenant
    # Create a default tenant for this user
    tenant = Tenant(name=user.email.split("@")[0].title() + "'s Workspace", plan="free")
    db.add(tenant)
    db.flush()
    user.tenant_id = tenant.id
    db.commit()
    db.refresh(tenant)
    return tenant


def _global_default(key: str) -> str:
    """Return current global env-var value for a key (shown as placeholder)."""
    mapping = {
        "MY_COMPANY_NAME": global_settings.MY_COMPANY_NAME,
        "MY_COMPANY_SERVICES": global_settings.MY_COMPANY_SERVICES,
        "MY_COMPANY_VALUE_PROP": global_settings.MY_COMPANY_VALUE_PROP,
        "MY_COMPANY_WEBSITE": global_settings.MY_COMPANY_WEBSITE,
        "MY_COMPANY_CONTACT": global_settings.MY_COMPANY_CONTACT,
        "SENDER_FULL_NAME": global_settings.SENDER_FULL_NAME,
        "SMTP_HOST": global_settings.SMTP_HOST,
        "SMTP_PORT": str(global_settings.SMTP_PORT),
        "SMTP_USER": global_settings.SMTP_USER,
        "SMTP_PASSWORD": global_settings.SMTP_PASSWORD,
        "SMTP_FROM_EMAIL": global_settings.SMTP_FROM_EMAIL,
        "SMTP_FROM_NAME": global_settings.SMTP_FROM_NAME,
        "TRACKING_BASE_URL": global_settings.TRACKING_BASE_URL or "",
        "FOLLOWUP_ENABLED": str(global_settings.FOLLOWUP_ENABLED).lower(),
        "FOLLOWUP_MAX_ROUNDS": str(global_settings.FOLLOWUP_MAX_ROUNDS),
        "FOLLOWUP_1_DAYS_UNOPENED": str(global_settings.FOLLOWUP_1_DAYS_UNOPENED),
        "FOLLOWUP_2_DAYS_UNOPENED": str(global_settings.FOLLOWUP_2_DAYS_UNOPENED),
        "FOLLOWUP_3_DAYS_UNOPENED": str(global_settings.FOLLOWUP_3_DAYS_UNOPENED),
        "FOLLOWUP_1_DAYS_OPENED": str(global_settings.FOLLOWUP_1_DAYS_OPENED),
        "FOLLOWUP_2_DAYS_OPENED": str(global_settings.FOLLOWUP_2_DAYS_OPENED),
    }
    return mapping.get(key, "")


@router.get("")
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return current tenant settings merged with global defaults."""
    tenant = _get_or_create_tenant(db, current_user)

    # Load saved tenant overrides
    saved = {
        row.key: row.value
        for row in db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant.id).all()
    }

    # Build response: all keys, tenant value if set, else global default
    result: Dict[str, Any] = {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "plan": tenant.plan,
        "schema": SETTINGS_SCHEMA,
        "values": {},
    }
    for category_fields in SETTINGS_SCHEMA.values():
        for field in category_fields:
            key = field["key"]
            # Return only the tenant's own saved value — never leak global platform defaults.
            # Global defaults are used only at send-time resolution, not as UI pre-fills.
            if field["type"] == "password":
                tenant_val = saved.get(key)
                result["values"][key] = "********" if tenant_val else ""
            else:
                result["values"][key] = saved.get(key) or ""

    return result


class SettingsUpdate(BaseModel):
    values: Dict[str, str]


@router.put("")
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, str]:
    """Upsert tenant settings. Pass empty string to clear an override."""
    tenant = _get_or_create_tenant(db, current_user)

    # Whitelist: only allow keys defined in SETTINGS_SCHEMA
    allowed_keys = {
        field["key"]
        for fields in SETTINGS_SCHEMA.values()
        for field in fields
    }

    for key, value in payload.values.items():
        if key not in allowed_keys:
            raise HTTPException(status_code=400, detail=f"Unknown settings key: {key}")

        existing = (
            db.query(TenantSettings)
            .filter(TenantSettings.tenant_id == tenant.id, TenantSettings.key == key)
            .first()
        )
        if value == "" or value == "********":
            # Clear the override (fall back to global env)
            if existing:
                db.delete(existing)
        elif existing:
            existing.value = value
        else:
            db.add(TenantSettings(tenant_id=tenant.id, key=key, value=value))

    db.commit()
    return {"status": "saved"}


@router.get("/schema")
def get_settings_schema():
    """Return the settings schema so the frontend knows what fields to show."""
    return SETTINGS_SCHEMA


def _upsert_setting(db: Session, tenant_id: int, key: str, value: str) -> None:
    existing = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == tenant_id, TenantSettings.key == key
    ).first()
    if existing:
        existing.value = value
    else:
        db.add(TenantSettings(tenant_id=tenant_id, key=key, value=value))


@router.post("/test-smtp")
def test_smtp_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test SMTP connection with current settings and store the result."""
    tenant = _get_or_create_tenant(db, current_user)
    saved = {
        row.key: row.value
        for row in db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant.id).all()
    }

    host = saved.get("SMTP_HOST") or _global_default("SMTP_HOST")
    port_str = saved.get("SMTP_PORT") or _global_default("SMTP_PORT") or "587"
    user = saved.get("SMTP_USER") or _global_default("SMTP_USER")
    password = saved.get("SMTP_PASSWORD") or _global_default("SMTP_PASSWORD")
    from_email = saved.get("SMTP_FROM_EMAIL") or _global_default("SMTP_FROM_EMAIL")

    if not host or not user:
        raise HTTPException(status_code=400, detail="SMTP host and username are required")

    try:
        port = int(port_str)
    except ValueError:
        port = 587

    start = time.time()
    try:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            if password:
                smtp.login(user, password)
        latency_ms = int((time.time() - start) * 1000)
        result = {
            "success": True,
            "message": f"TLS · authenticated · {latency_ms / 1000:.2f}s round-trip",
            "latency_ms": latency_ms,
            "tested_at": datetime.utcnow().isoformat(),
            "tested_email": from_email,
        }
    except Exception as exc:
        latency_ms = int((time.time() - start) * 1000)
        result = {
            "success": False,
            "message": str(exc),
            "latency_ms": latency_ms,
            "tested_at": datetime.utcnow().isoformat(),
            "tested_email": from_email,
        }

    _upsert_setting(db, tenant.id, "_SMTP_TEST_RESULT", json.dumps(result))
    db.commit()

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/smtp-status")
def get_smtp_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the last stored SMTP test result."""
    tenant = _get_or_create_tenant(db, current_user)
    row = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == tenant.id, TenantSettings.key == "_SMTP_TEST_RESULT"
    ).first()
    if not row:
        return {"success": None, "message": None, "tested_at": None, "tested_email": None, "latency_ms": None}
    try:
        return json.loads(row.value)
    except Exception:
        return {"success": None, "message": None, "tested_at": None, "tested_email": None, "latency_ms": None}


# ── Team management ────────────────────────────────────────────────────────────

def _temp_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class InviteTeamMemberPayload(BaseModel):
    email: str
    role: str = "member"
    display_name: Optional[str] = None


class TeamRoleUpdate(BaseModel):
    role: str


@router.get("/team")
def get_team_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list:
    """List all users in the current user's tenant. For super-admins (no tenant) return themselves."""
    if not current_user.tenant_id:
        # Super-admin: return just themselves so the UI isn't empty
        return [{
            "id": current_user.id,
            "email": current_user.email,
            "display_name": current_user.display_name or "",
            "role": "owner",
            "is_admin": True,
            "created_at": current_user.created_at.strftime("%b %d, %Y") if current_user.created_at else "",
        }]
    users = db.query(User).filter(User.tenant_id == current_user.tenant_id).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "display_name": u.display_name or "",
            "role": u.role or "member",
            "is_admin": bool(u.is_admin),
            "created_at": u.created_at.strftime("%b %d, %Y") if u.created_at else "",
        }
        for u in users
    ]


def _load_tenant_email_config(tenant_id: int, db: Session) -> dict:
    """Return SMTP + branding settings saved for a tenant, falling back to platform defaults."""
    rows = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == tenant_id,
        TenantSettings.key.in_([
            "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD",
            "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "MY_COMPANY_NAME",
        ]),
    ).all()
    saved = {r.key: r.value for r in rows if r.value}
    return {
        "smtp_host": saved.get("SMTP_HOST") or global_settings.SMTP_HOST,
        "smtp_port": int(saved.get("SMTP_PORT") or global_settings.SMTP_PORT),
        "smtp_user": saved.get("SMTP_USER") or global_settings.SMTP_USER,
        "smtp_password": saved.get("SMTP_PASSWORD") or global_settings.SMTP_PASSWORD,
        "from_email": saved.get("SMTP_FROM_EMAIL") or global_settings.SMTP_FROM_EMAIL,
        "from_name": saved.get("SMTP_FROM_NAME") or global_settings.SMTP_FROM_NAME,
        "company_name": saved.get("MY_COMPANY_NAME") or global_settings.PLATFORM_FROM_NAME or "SendMaster",
    }


def _send_team_invite_email(to_email: str, temp_password: str, company_name: str, email_config: dict) -> None:
    """Send a plain-text invite email to a new team member using the tenant's own SMTP config.

    Uses deliverability_mode=True so no HTML, no marketing headers, no unsubscribe
    footer — avoids spam filters on strict mail servers (Google Workspace, etc.).
    """
    body_plain = (
        f"Hi,\n\n"
        f"You have been invited to join {company_name}.\n\n"
        f"Use the credentials below to log in at http://182.187.139.173:3000:\n\n"
        f"  Email:              {to_email}\n"
        f"  Temporary password: {temp_password}\n\n"
        f"You will be asked to set a new password immediately after logging in.\n\n"
        f"Please do not share these credentials with anyone.\n\n"
        f"-- {company_name} Team"
    )
    import logging
    _log = logging.getLogger(__name__)
    try:
        smtp_kwargs = {k: v for k, v in email_config.items() if k != "company_name"}
        result = send_email(
            to_email=to_email,
            to_name=None,
            subject=f"You've been invited to {company_name}",
            body_html=body_plain,          # send_email converts to plain text in deliverability_mode
            deliverability_mode=True,      # plain text only, no spam-trigger headers
            **smtp_kwargs,
        )
        if result.get("success"):
            _log.warning("Team invite sent to %s", to_email)   # WARNING so it always shows in logs
        else:
            _log.warning("Team invite email FAILED for %s: %s", to_email, result.get("error"))
    except Exception as exc:
        _log.warning("Team invite email exception for %s: %s", to_email, exc)


@router.post("/team/invite")
def invite_team_member(
    payload: InviteTeamMemberPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Invite a user to the current tenant. Creates user if needed."""
    if not current_user.tenant_id:
        raise HTTPException(400, "You are not associated with a tenant")
    if current_user.role not in ("owner", "admin") and not current_user.is_admin:
        raise HTTPException(403, "Only tenant owners and admins can invite members")

    email_config = _load_tenant_email_config(current_user.tenant_id, db)
    company_name = email_config["company_name"]

    existing = db.query(User).filter(User.email == payload.email).first()

    if existing:
        existing.tenant_id = current_user.tenant_id
        existing.role = payload.role
        existing.must_change_password = True
        if payload.display_name:
            existing.display_name = payload.display_name
        db.commit()
        # Generate fresh temp password and send invite
        tmp_pwd = _temp_password()
        from app.api.auth import get_password_hash
        existing.hashed_password = get_password_hash(tmp_pwd)
        db.commit()
        _send_team_invite_email(existing.email, tmp_pwd, company_name, email_config)
        return {
            "id": existing.id,
            "email": existing.email,
            "display_name": existing.display_name or "",
            "role": existing.role,
            "temp_password": tmp_pwd,
        }
    else:
        tmp_pwd = _temp_password()
        from app.api.auth import get_password_hash
        new_user = User(
            email=payload.email,
            hashed_password=get_password_hash(tmp_pwd),
            display_name=payload.display_name,
            is_active=True,
            is_admin=False,
            role=payload.role,
            must_change_password=True,
            tenant_id=current_user.tenant_id,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        _send_team_invite_email(new_user.email, tmp_pwd, company_name, email_config)
        return {
            "id": new_user.id,
            "email": new_user.email,
            "display_name": new_user.display_name or "",
            "role": new_user.role,
            "temp_password": tmp_pwd,
        }


@router.delete("/team/{user_id}")
def remove_team_member(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Detach a user from the current tenant."""
    if not current_user.tenant_id:
        raise HTTPException(400, "You are not associated with a tenant")
    if current_user.role not in ("owner", "admin") and not current_user.is_admin:
        raise HTTPException(403, "Only tenant owners and admins can remove members")
    if user_id == current_user.id:
        raise HTTPException(400, "You cannot remove yourself")

    user = db.query(User).filter(
        User.id == user_id, User.tenant_id == current_user.tenant_id
    ).first()
    if not user:
        raise HTTPException(404, "User not found in your tenant")
    user.tenant_id = None
    db.commit()
    return {"status": "removed"}


@router.post("/team/{user_id}/resend-invite")
def resend_team_member_invite(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Generate a new temp password and resend the invite email to a team member."""
    if not current_user.tenant_id:
        raise HTTPException(400, "You are not associated with a tenant")
    if current_user.role not in ("owner", "admin") and not current_user.is_admin:
        raise HTTPException(403, "Only tenant owners and admins can resend invites")

    user = db.query(User).filter(
        User.id == user_id, User.tenant_id == current_user.tenant_id
    ).first()
    if not user:
        raise HTTPException(404, "User not found in your tenant")

    email_config = _load_tenant_email_config(current_user.tenant_id, db)
    from app.api.auth import get_password_hash
    tmp_pwd = _temp_password()
    user.hashed_password = get_password_hash(tmp_pwd)
    user.must_change_password = True
    db.commit()
    _send_team_invite_email(user.email, tmp_pwd, email_config["company_name"], email_config)
    return {"status": "sent"}


@router.put("/team/{user_id}/role")
def update_team_member_role(
    user_id: int,
    payload: TeamRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Change a team member's role."""
    if not current_user.tenant_id:
        raise HTTPException(400, "You are not associated with a tenant")
    if current_user.role not in ("owner", "admin") and not current_user.is_admin:
        raise HTTPException(403, "Only tenant owners and admins can change roles")

    user = db.query(User).filter(
        User.id == user_id, User.tenant_id == current_user.tenant_id
    ).first()
    if not user:
        raise HTTPException(404, "User not found in your tenant")
    user.role = payload.role
    db.commit()
    return {"status": "updated", "role": payload.role}
