"""
Admin API — tenant management (admin users only).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Tenant, User

router = APIRouter()

VALID_PLANS = ["free", "starter", "professional", "enterprise"]


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


class TenantSummary(BaseModel):
    id: int
    name: str
    plan: str
    is_active: bool
    user_count: int
    created_at: str

    class Config:
        from_attributes = True


class PlanUpdate(BaseModel):
    plan: str


@router.get("/tenants")
def list_tenants(
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> List[dict]:
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    result = []
    for t in tenants:
        user_count = db.query(User).filter(User.tenant_id == t.id).count()
        result.append({
            "id": t.id,
            "name": t.name,
            "plan": t.plan,
            "is_active": t.is_active,
            "user_count": user_count,
            "created_at": t.created_at.strftime("%Y-%m-%d") if t.created_at else "",
        })
    return result


@router.put("/tenants/{tenant_id}/plan")
def update_tenant_plan(
    tenant_id: int,
    payload: PlanUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    if payload.plan not in VALID_PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Must be one of: {VALID_PLANS}")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.plan = payload.plan
    db.commit()
    return {"status": "updated", "plan": payload.plan}


@router.put("/tenants/{tenant_id}/deactivate")
def deactivate_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = False
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
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = True
    db.commit()
    return {"status": "ok", "user_id": user_id}


@router.get("/me")
def admin_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return admin status for the current user."""
    return {
        "is_admin": bool(current_user.is_admin),
        "user_id": current_user.id,
        "email": current_user.email,
        "tenant_id": current_user.tenant_id,
    }
