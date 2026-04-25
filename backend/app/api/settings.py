"""
Tenant Settings API — read and write per-tenant configuration.

Settings are stored in the tenant_settings table as key-value pairs.
They override (but do not replace) global env vars.
"""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.config import settings as global_settings
from app.database import get_db
from app.models import Tenant, TenantSettings, User

router = APIRouter()

# Settings keys grouped by category — defines what the UI shows
SETTINGS_SCHEMA = {
    "branding": [
        {"key": "MY_COMPANY_NAME", "label": "Company Name", "type": "text"},
        {"key": "MY_COMPANY_SERVICES", "label": "Services Description", "type": "text"},
        {"key": "MY_COMPANY_VALUE_PROP", "label": "Value Proposition", "type": "text"},
        {"key": "MY_COMPANY_WEBSITE", "label": "Company Website", "type": "text"},
        {"key": "MY_COMPANY_CONTACT", "label": "Contact Email", "type": "text"},
    ],
    "email": [
        {"key": "SMTP_FROM_EMAIL", "label": "From Email Address", "type": "text",
         "hint": "Your outreach sending address — must be on a domain your provider has verified"},
        {"key": "SMTP_FROM_NAME", "label": "From Name", "type": "text"},
    ],
    "ai": [
        {"key": "ANTHROPIC_API_KEY", "label": "Anthropic API Key", "type": "password"},
    ],
    "linkedin": [
        {"key": "LINKEDIN_CLIENT_ID", "label": "LinkedIn Client ID", "type": "text"},
        {"key": "LINKEDIN_CLIENT_SECRET", "label": "LinkedIn Client Secret", "type": "password"},
        {"key": "LINKEDIN_REDIRECT_URI", "label": "LinkedIn Redirect URI", "type": "text"},
    ],
    "search": [
        {"key": "GOOGLE_CSE_API_KEY", "label": "Google CSE API Key", "type": "password"},
        {"key": "GOOGLE_CSE_CX", "label": "Google CSE CX", "type": "text"},
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
        "SMTP_HOST": global_settings.SMTP_HOST,
        "SMTP_PORT": str(global_settings.SMTP_PORT),
        "SMTP_USER": global_settings.SMTP_USER,
        "SMTP_PASSWORD": global_settings.SMTP_PASSWORD,
        "SMTP_FROM_EMAIL": global_settings.SMTP_FROM_EMAIL,
        "SMTP_FROM_NAME": global_settings.SMTP_FROM_NAME,
        "ANTHROPIC_API_KEY": global_settings.ANTHROPIC_API_KEY,
        "LINKEDIN_CLIENT_ID": global_settings.LINKEDIN_CLIENT_ID or "",
        "LINKEDIN_CLIENT_SECRET": global_settings.LINKEDIN_CLIENT_SECRET or "",
        "LINKEDIN_REDIRECT_URI": global_settings.LINKEDIN_REDIRECT_URI,
        "GOOGLE_CSE_API_KEY": global_settings.GOOGLE_CSE_API_KEY or "",
        "GOOGLE_CSE_CX": global_settings.GOOGLE_CSE_CX or "",
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
            # For password fields, don't expose the value — just indicate if overridden
            if field["type"] == "password":
                tenant_val = saved.get(key)
                result["values"][key] = "********" if tenant_val else _global_default(key)
            else:
                result["values"][key] = saved.get(key) or _global_default(key)

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
