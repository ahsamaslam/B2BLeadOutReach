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
