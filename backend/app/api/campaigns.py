"""
Campaigns API — save and load named broadcast setups (leads + template).
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Campaign, CampaignTemplate, Company, Contact, User

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    template_id: Optional[int] = None
    company_ids: List[int] = []
    use_ai: bool = True


class CampaignSummary(BaseModel):
    id: int
    name: str
    template_id: Optional[int]
    template_name: Optional[str]
    lead_count: int
    use_ai: bool
    created_at: datetime

    class Config:
        from_attributes = True


class LeadDetail(BaseModel):
    company_id: int
    company_name: str
    niche: Optional[str]
    location: Optional[str]
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_role: Optional[str]


class CampaignDetail(BaseModel):
    id: int
    name: str
    template_id: Optional[int]
    template_name: Optional[str]
    use_ai: bool
    created_at: datetime
    leads: List[LeadDetail]


# ── Helper ─────────────────────────────────────────────────────────────────────

def _primary_contact(company: Company):
    if not company.contacts:
        return None
    for c in company.contacts:
        if c.role and any(t in c.role.lower() for t in ("owner", "ceo", "founder", "director", "manager")):
            return c
    return company.contacts[0]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=CampaignSummary)
def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Campaign name is required")

    campaign = Campaign(
        name=payload.name.strip(),
        template_id=payload.template_id,
        company_ids=payload.company_ids,
        use_ai=payload.use_ai,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    tmpl_name = None
    if campaign.template_id:
        tmpl = db.query(CampaignTemplate).filter(CampaignTemplate.id == campaign.template_id).first()
        tmpl_name = tmpl.name if tmpl else None

    return CampaignSummary(
        id=campaign.id,
        name=campaign.name,
        template_id=campaign.template_id,
        template_name=tmpl_name,
        lead_count=len(campaign.company_ids or []),
        use_ai=campaign.use_ai,
        created_at=campaign.created_at,
    )


@router.get("", response_model=List[CampaignSummary])
def list_campaigns(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    campaigns = db.query(Campaign).order_by(Campaign.created_at.desc()).all()
    result = []
    for c in campaigns:
        tmpl_name = c.template.name if c.template else None
        result.append(CampaignSummary(
            id=c.id,
            name=c.name,
            template_id=c.template_id,
            template_name=tmpl_name,
            lead_count=len(c.company_ids or []),
            use_ai=c.use_ai,
            created_at=c.created_at,
        ))
    return result


@router.get("/{campaign_id}", response_model=CampaignDetail)
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    tmpl_name = campaign.template.name if campaign.template else None

    company_ids = campaign.company_ids or []
    companies = db.query(Company).filter(Company.id.in_(company_ids)).all()
    company_map = {c.id: c for c in companies}

    leads = []
    for cid in company_ids:
        company = company_map.get(cid)
        if not company:
            continue
        contact = _primary_contact(company)
        leads.append(LeadDetail(
            company_id=company.id,
            company_name=company.name or "",
            niche=company.niche,
            location=company.location,
            contact_name=contact.name if contact else None,
            contact_email=contact.email if contact else None,
            contact_role=contact.role if contact else None,
        ))

    return CampaignDetail(
        id=campaign.id,
        name=campaign.name,
        template_id=campaign.template_id,
        template_name=tmpl_name,
        use_ai=campaign.use_ai,
        created_at=campaign.created_at,
        leads=leads,
    )


@router.delete("/{campaign_id}")
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db.delete(campaign)
    db.commit()
    return {"ok": True}
