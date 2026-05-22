"""
Admin API — tenant management (super-admin only).
"""
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_password_hash
from app.config import settings
from app.database import get_db
from app.models import EmailLog, Company, Tenant, TenantSettings, User
from app.services.email_service import send_email

router = APIRouter()

VALID_PLANS = ["free", "starter", "professional", "enterprise"]

# MRR price map (monthly USD)
PLAN_PRICE = {"free": 0, "starter": 49, "professional": 99, "enterprise": 299}


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _temp_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


import logging as _logging
_log = _logging.getLogger(__name__)


def _send_tenant_invite(
    to_email: str,
    tenant_name: str,
    plan: str,
    temp_password: Optional[str],
) -> None:
    """
    Send a workspace invitation email to the new tenant owner.
    Uses the platform sender (PLATFORM_FROM_EMAIL env var).
    Failures are logged but never bubble up — the tenant is already created.
    """
    plan_label = {
        "free": "Free", "starter": "Starter",
        "professional": "Professional", "enterprise": "Enterprise",
    }.get(plan, plan.capitalize())

    if temp_password:
        credentials_block = f"""
        <tr>
          <td style="padding:16px 24px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:#6b6870;font-weight:600;
                      text-transform:uppercase;letter-spacing:.06em;">Your login credentials</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#f4f3ee;
                   border-radius:8px;border:1px solid #ebe9e2;">
              <tr>
                <td style="padding:12px 16px;font-size:13px;color:#3d3c3a;">
                  <strong>Email:</strong>&nbsp; {to_email}
                </td>
              </tr>
              <tr>
                <td style="padding:0 16px 12px;font-size:13px;color:#3d3c3a;
                           border-top:1px solid #ebe9e2;padding-top:12px;">
                  <strong>Temporary password:</strong>&nbsp;
                  <code style="font-family:monospace;font-size:14px;background:#fff;
                               padding:2px 8px;border-radius:4px;border:1px solid #d9d6cc;">
                    {temp_password}
                  </code>
                </td>
              </tr>
            </table>
            <p style="margin:10px 0 0;font-size:12px;color:#9d9b96;">
              Please change your password after your first login.
            </p>
          </td>
        </tr>"""
    else:
        credentials_block = """
        <tr>
          <td style="padding:16px 24px 0;">
            <p style="margin:0;font-size:13px;color:#6b6870;">
              You already have an account — use your existing password to log in.
            </p>
          </td>
        </tr>"""

    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#fafaf7;padding:40px 0;">
        <tr>
          <td align="center">
            <table cellpadding="0" cellspacing="0" width="520"
                   style="background:#ffffff;border-radius:14px;border:1px solid #ebe9e2;overflow:hidden;">

              <!-- Header -->
              <tr>
                <td style="background:#5b5fcf;padding:24px 28px;">
                  <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">
                    SendMaster
                  </p>
                  <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.75);">
                    B2B Lead Outreach Platform
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:28px 24px 8px;">
                  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#1a1917;line-height:1.2;">
                    Your workspace is ready 🎉
                  </p>
                  <p style="margin:0;font-size:14px;color:#6b6870;line-height:1.6;">
                    Hi there,<br><br>
                    You've been invited to <strong style="color:#1a1917;">{tenant_name}</strong> on
                    SendMaster. Your workspace is on the <strong>{plan_label}</strong> plan and is
                    ready to use right now.
                  </p>
                </td>
              </tr>

              {credentials_block}

              <!-- CTA -->
              <tr>
                <td style="padding:24px 24px 8px;">
                  <a href="http://localhost:3000"
                     style="display:inline-block;background:#5b5fcf;color:#fff;font-size:14px;
                            font-weight:600;text-decoration:none;padding:11px 24px;
                            border-radius:9px;">
                    Log in to your workspace →
                  </a>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:20px 24px 28px;border-top:1px solid #f0eee8;margin-top:20px;">
                  <p style="margin:0;font-size:11px;color:#9d9b96;line-height:1.6;">
                    This invitation was sent by your platform administrator.<br>
                    If you weren't expecting this, you can safely ignore this email.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    subject = f"You've been invited to {tenant_name} on SendMaster"

    try:
        result = send_email(
            to_email=to_email,
            to_name=None,
            subject=subject,
            body_html=body_html,
            from_email=settings.PLATFORM_FROM_EMAIL or settings.SMTP_FROM_EMAIL,
            from_name=settings.PLATFORM_FROM_NAME,
        )
        if result.get("success"):
            _log.info("Tenant invite sent via SMTP to %s", to_email)
        else:
            _log.warning("Tenant invite SMTP failed for %s: %s", to_email, result.get("error"))
    except Exception as exc:
        _log.warning("Tenant invite email exception for %s: %s", to_email, exc)


# ── Pydantic bodies ────────────────────────────────────────────────────────────

class PlanUpdate(BaseModel):
    plan: str


class CreateTenantPayload(BaseModel):
    name: str
    owner_email: str
    plan: str = "free"


class AddUserPayload(BaseModel):
    email: str
    role: str = "member"
    display_name: Optional[str] = None


class RoleUpdate(BaseModel):
    role: str


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    total_tenants = db.query(Tenant).count()
    active_tenants = db.query(Tenant).filter(Tenant.is_active == True).count()
    suspended_tenants = total_tenants - active_tenants

    tenants = db.query(Tenant).filter(Tenant.is_active == True).all()
    mrr = sum(PLAN_PRICE.get(t.plan, 0) for t in tenants)

    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    emails_24h = db.query(EmailLog).filter(EmailLog.sent_at >= cutoff_24h).count()

    open_trials = db.query(Tenant).filter(
        Tenant.plan == "free", Tenant.is_active == True
    ).count()

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "suspended_tenants": suspended_tenants,
        "mrr": mrr,
        "emails_24h": emails_24h,
        "open_trials": open_trials,
    }


# ── Tenant list (paginated + filtered) ────────────────────────────────────────

@router.get("/tenants")
def list_tenants(
    q: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    status: Optional[str] = Query(None),       # "active" | "suspended"
    created_range: Optional[str] = Query(None), # "30d" | "60d" | "90d" | "all"
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    query = db.query(Tenant)

    if q:
        q_lower = f"%{q.lower()}%"
        query = query.filter(
            (Tenant.name.ilike(q_lower)) | (Tenant.owner_email.ilike(q_lower))
        )
    if plan and plan != "all":
        query = query.filter(Tenant.plan == plan)
    if status == "active":
        query = query.filter(Tenant.is_active == True)
    elif status == "suspended":
        query = query.filter(Tenant.is_active == False)
    if created_range and created_range != "all":
        days = {"30d": 30, "60d": 60, "90d": 90}.get(created_range, 30)
        cutoff = datetime.utcnow() - timedelta(days=days)
        query = query.filter(Tenant.created_at >= cutoff)

    total = query.count()
    tenants = query.order_by(Tenant.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    items = []
    for t in tenants:
        user_count = db.query(User).filter(User.tenant_id == t.id).count()
        emails_this_month = db.query(EmailLog).filter(
            EmailLog.tenant_id == t.id,
            EmailLog.sent_at >= month_start,
        ).count()
        leads_count = db.query(Company).count()
        items.append({
            "id": t.id,
            "name": t.name,
            "plan": t.plan,
            "is_active": bool(t.is_active),
            "is_default": bool(t.is_default),
            "owner_email": t.owner_email or "",
            "user_count": user_count,
            "emails_this_month": emails_this_month,
            "leads_count": leads_count,
            "created_at": t.created_at.strftime("%b %d, %Y") if t.created_at else "",
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


# ── Create tenant ──────────────────────────────────────────────────────────────

@router.post("/tenants")
def create_tenant(
    payload: CreateTenantPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    if payload.plan not in VALID_PLANS:
        raise HTTPException(400, f"Invalid plan. Choose from: {VALID_PLANS}")

    tenant = Tenant(name=payload.name, plan=payload.plan, owner_email=payload.owner_email)
    db.add(tenant)
    db.flush()  # get tenant.id

    # Find or create the owner user
    existing_user = db.query(User).filter(User.email == payload.owner_email).first()
    tmp_pwd = None
    if existing_user:
        existing_user.tenant_id = tenant.id
        existing_user.role = "owner"
    else:
        tmp_pwd = _temp_password()
        new_user = User(
            email=payload.owner_email,
            hashed_password=get_password_hash(tmp_pwd),
            is_active=True,
            is_admin=False,
            role="owner",
            tenant_id=tenant.id,
            must_change_password=True,
        )
        db.add(new_user)

    db.commit()
    db.refresh(tenant)

    # ── Send invitation email ──────────────────────────────────────────────
    _send_tenant_invite(
        to_email=payload.owner_email,
        tenant_name=payload.name,
        plan=payload.plan,
        temp_password=tmp_pwd,  # None when user already existed
    )

    return {
        "id": tenant.id,
        "name": tenant.name,
        "plan": tenant.plan,
        "owner_email": tenant.owner_email,
        "created_at": tenant.created_at.strftime("%b %d, %Y") if tenant.created_at else "",
        "temp_password": tmp_pwd,
    }


# ── Update plan ────────────────────────────────────────────────────────────────

@router.put("/tenants/{tenant_id}/plan")
def update_tenant_plan(
    tenant_id: int,
    payload: PlanUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    if payload.plan not in VALID_PLANS:
        raise HTTPException(400, f"Invalid plan. Must be one of: {VALID_PLANS}")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    tenant.plan = payload.plan
    db.commit()
    return {"status": "updated", "plan": payload.plan}


# ── Suspend / reactivate ───────────────────────────────────────────────────────

@router.put("/tenants/{tenant_id}/suspend")
def suspend_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if tenant.is_default:
        raise HTTPException(400, "The default workspace cannot be suspended")
    tenant.is_active = False
    # Suspend all non-owner members of this tenant
    db.query(User).filter(
        User.tenant_id == tenant_id,
        User.role != "owner",
    ).update({"is_active": False})
    db.commit()
    return {"status": "suspended"}


@router.put("/tenants/{tenant_id}/reactivate")
def reactivate_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    tenant.is_active = True
    # Reactivate all members that were suspended with the tenant
    db.query(User).filter(
        User.tenant_id == tenant_id,
    ).update({"is_active": True})
    db.commit()
    return {"status": "reactivated"}


# ── Delete tenant ──────────────────────────────────────────────────────────────

@router.delete("/tenants/{tenant_id}")
def delete_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if tenant.is_default:
        raise HTTPException(400, "The default workspace cannot be deleted")
    # Delete all non-owner members; detach the owner so their account survives
    db.query(User).filter(
        User.tenant_id == tenant_id,
        User.role != "owner",
    ).delete(synchronize_session=False)
    db.query(User).filter(
        User.tenant_id == tenant_id,
        User.role == "owner",
    ).update({"tenant_id": None})
    db.delete(tenant)
    db.commit()
    return {"status": "deleted"}


# ── Tenant users ───────────────────────────────────────────────────────────────

@router.get("/tenants/{tenant_id}/users")
def list_tenant_users(
    tenant_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> list:
    users = db.query(User).filter(User.tenant_id == tenant_id).all()
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


@router.post("/tenants/{tenant_id}/users")
def add_tenant_user(
    tenant_id: int,
    payload: AddUserPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    existing = db.query(User).filter(User.email == payload.email).first()
    tmp_pwd = None
    if existing:
        existing.tenant_id = tenant_id
        existing.role = payload.role
        if payload.display_name:
            existing.display_name = payload.display_name
        db.commit()
        return {
            "id": existing.id,
            "email": existing.email,
            "display_name": existing.display_name or "",
            "role": existing.role,
            "temp_password": None,
        }
    else:
        tmp_pwd = _temp_password()
        user = User(
            email=payload.email,
            hashed_password=get_password_hash(tmp_pwd),
            display_name=payload.display_name,
            is_active=True,
            is_admin=False,
            role=payload.role,
            tenant_id=tenant_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name or "",
            "role": user.role,
            "temp_password": tmp_pwd,
        }


@router.delete("/tenants/{tenant_id}/users/{user_id}")
def remove_tenant_user(
    tenant_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    user = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if not user:
        raise HTTPException(404, "User not found in this tenant")
    user.tenant_id = None
    db.commit()
    return {"status": "removed"}


# ── Resend invite ──────────────────────────────────────────────────────────────

@router.post("/tenants/{tenant_id}/resend-invite")
def resend_tenant_invite(
    tenant_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    """
    Generate a fresh temporary password for the tenant owner, set must_change_password,
    and resend the invitation email via SMTP.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if not tenant.owner_email:
        raise HTTPException(400, "Tenant has no owner email on record")

    owner = db.query(User).filter(User.email == tenant.owner_email).first()
    if not owner:
        raise HTTPException(404, "Tenant owner user not found")

    tmp_pwd = _temp_password()
    owner.hashed_password = get_password_hash(tmp_pwd)
    owner.must_change_password = True
    db.commit()

    _send_tenant_invite(
        to_email=tenant.owner_email,
        tenant_name=tenant.name,
        plan=tenant.plan,
        temp_password=tmp_pwd,
    )

    return {"status": "invite_sent", "owner_email": tenant.owner_email}


# ── Legacy / unchanged ─────────────────────────────────────────────────────────

@router.put("/tenants/{tenant_id}/deactivate")
def deactivate_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if tenant.is_default:
        raise HTTPException(400, "The default workspace cannot be deactivated")
    tenant.is_active = False
    # Suspend all non-owner members of this tenant
    db.query(User).filter(
        User.tenant_id == tenant_id,
        User.role != "owner",
    ).update({"is_active": False})
    db.commit()
    return {"status": "deactivated"}


@router.post("/make-admin/{user_id}")
def make_admin(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_admin = True
    db.commit()
    return {"status": "ok", "user_id": user_id}


@router.get("/me")
def admin_me(
    current_user: User = Depends(get_current_user),
) -> dict:
    return {
        "is_admin": bool(current_user.is_admin),
        "user_id": current_user.id,
        "email": current_user.email,
        "tenant_id": current_user.tenant_id,
    }
