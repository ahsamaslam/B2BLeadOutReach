from io import BytesIO
import re
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_current_user_from_token
from app.database import get_db
from app.models import Company, Contact, EmailLog, User
from app.schemas import CompanyCreate, CompanyResponse, CompanyUpdate, BulkUploadResponse

router = APIRouter()


class BulkDeleteRequest(BaseModel):
    ids: List[int]


class ManualLeadCreate(BaseModel):
    """Create a lead manually with full contact info — no scraping needed."""
    name: str
    website: Optional[str] = ""
    niche: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
    business_type: Optional[str] = None
    phone: Optional[str] = None
    # Primary contact
    ceo_name: Optional[str] = None
    ceo_email: Optional[str] = None
    ceo_phone: Optional[str] = None
    # Email draft (optional — pre-fills template so lead is immediately ready to send)
    email_subject: Optional[str] = None
    email_body: Optional[str] = None


@router.get("/template")
def download_template():
    """Return a sample Excel file showing the expected upload format."""
    sample_data = {
        "Company_Name": ["Acme Corp", "Globex Industries", "Initech Solutions"],
        "Website": ["https://acmecorp.com", "https://globex.com", "https://initech.com"],
        "Industry": ["Manufacturing", "Energy", "Software"],
        "Location": ["New York, USA", "Springfield, USA", "Austin, USA"],
        "Niche": ["Industrial equipment", "Energy supply", "HR software"],
        "Address": ["123 Main St, New York, NY 10001", "", "456 Tech Ave, Austin, TX 78701"],
        "Business_Type": ["independent", "franchise", "independent"],
        "Phone": ["212-555-0100", "417-555-0199", "512-555-0177"],
        "Owner_Name": ["John Smith", "Jane Doe", "Bob Johnson"],
        "Owner_Email": ["john@acmecorp.com", "jane@globex.com", "bob@initech.com"],
        "Owner_Phone": ["212-555-0101", "", "512-555-0178"],
        "Email": ["info@acmecorp.com", "info@globex.com", "info@initech.com"],
    }
    df = pd.DataFrame(sample_data)
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Companies")
    buf.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="companies_template.xlsx"'}
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.post("/upload", response_model=BulkUploadResponse)
async def upload_companies(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Please upload .xlsx, .xls, or .csv")

    content = await file.read()
    if file.filename.endswith(".csv"):
        df = pd.read_csv(BytesIO(content))
    else:
        df = pd.read_excel(BytesIO(content))

    def _norm_header(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", str(value).strip().lower())

    normalized_headers: dict[str, str] = {}
    for col in df.columns:
        normalized_headers[_norm_header(col)] = col

    def _resolve_cols(*aliases: str) -> list[str]:
        resolved: list[str] = []
        seen: set[str] = set()
        for alias in aliases:
            direct = alias if alias in df.columns else None
            normalized = normalized_headers.get(_norm_header(alias))
            for candidate in (direct, normalized):
                if candidate and candidate not in seen:
                    seen.add(candidate)
                    resolved.append(candidate)
        return resolved

    company_name_cols = _resolve_cols(
        "Company_Name",
        "Company Name",
        "Company",
        "Business Name",
    )
    if not company_name_cols:
        raise HTTPException(
            status_code=400,
            detail="File must contain a company name column (for example: Company_Name or Company Name)",
        )

    website_cols = _resolve_cols(
        "Website",
        "Website / Online Store",
        "Website/Online Store",
        "URL",
        "Web",
    )
    niche_cols = _resolve_cols(
        "Niche",
        "Industry",
        "Industry / Sub-Niche",
        "Sub-Niche",
        "Category",
    )
    location_cols = _resolve_cols(
        "Location",
        "Region",
        "Region / State",
        "State",
        "City",
    )
    address_cols = _resolve_cols("Address")
    business_type_cols = _resolve_cols("Business_Type", "Business Type", "Type")
    phone_cols = _resolve_cols(
        "Phone",
        "Phone_Number",
        "Mobile",
        "Tel",
        "Telephone",
        "Company_Phone",
    )

    owner_name_cols = _resolve_cols(
        "Owner_Name",
        "Owner",
        "CEO_Name",
        "CEO",
        "Contact_Name",
        "Contact",
        "Decision Maker",
        "Decision_Maker",
    )
    owner_email_cols = _resolve_cols(
        "Owner_Email",
        "Email",
        "Email Pattern",
        "Email Pattern (verify via Hunter/Apollo)",
        "CEO_Email",
        "Contact_Email",
        "Email_Address",
    )
    owner_phone_cols = _resolve_cols(
        "Owner_Phone",
        "CEO_Phone",
        "Contact_Phone",
        "Direct_Phone",
    )
    contact_role_cols = _resolve_cols("Decision Maker Role", "Role", "Title")

    added = 0
    skipped = 0
    errors: list[str] = []

    def _col(row, columns: list[str]) -> str | None:
        for name in columns:
            val = str(row.get(name, "")).strip()
            if val and val.lower() != "nan":
                return val
        return None

    for _, row in df.iterrows():
        try:
            name = _col(row, company_name_cols) or ""
            if not name or name.lower() == "nan":
                skipped += 1
                continue

            website = _col(row, website_cols) or ""
            if website and not website.startswith(("http://", "https://")):
                website = "https://" + website

            exists = db.query(Company).filter(Company.name == name).first()
            if exists:
                skipped += 1
                continue

            # Company-level fields
            niche = _col(row, niche_cols)
            location = _col(row, location_cols)
            address = _col(row, address_cols)
            biz_type = _col(row, business_type_cols)
            phone = _col(row, phone_cols)

            company = Company(
                name=name,
                website=website,
                niche=niche,
                location=location,
                address=address,
                business_type=biz_type or "independent",
                phone=phone,
                status="created",
            )
            db.add(company)
            db.flush()  # get company.id

            # Owner / primary contact
            owner_name = _col(row, owner_name_cols)
            owner_email = _col(row, owner_email_cols)
            owner_phone = _col(row, owner_phone_cols)
            contact_role = (_col(row, contact_role_cols) or "CEO").upper()

            if owner_name or owner_email:
                db.add(Contact(
                    company_id=company.id,
                    role=contact_role,
                    name=owner_name,
                    email=owner_email,
                    phone=owner_phone,
                ))
                # If we already have contact data, mark as data_parsed
                company.status = "data_parsed"

            added += 1
        except Exception as exc:
            errors.append(str(exc))

    db.commit()
    return {
        "message": "Upload processed",
        "companies_added": added,
        "companies_skipped": skipped,
        "errors": errors,
    }


@router.post("", response_model=CompanyResponse)
def create_company(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = Company(
        name=payload.name,
        website=str(payload.website),
        niche=payload.niche,
        location=payload.location,
        business_type=payload.business_type or "independent",
        status="created",
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.post("/manual", response_model=CompanyResponse)
def create_manual_lead(
    payload: ManualLeadCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Create a lead manually with contact info. Skips scraping entirely."""
    from app.models import EmailTemplate
    company = Company(
        name=payload.name,
        website=payload.website or "",
        niche=payload.niche,
        location=payload.location,
        address=payload.address,
        business_type=payload.business_type,
        phone=payload.phone,
        status="data_parsed",
    )
    db.add(company)
    db.flush()  # get company.id before commit

    if payload.ceo_name or payload.ceo_email:
        contact = Contact(
            company_id=company.id,
            role="CEO",
            name=payload.ceo_name,
            email=payload.ceo_email,
            phone=payload.ceo_phone,
        )
        db.add(contact)

    if payload.email_subject and payload.email_body:
        template = EmailTemplate(
            company_id=company.id,
            subject=payload.email_subject,
            body=payload.email_body,
            status="drafted",
        )
        db.add(template)
        company.status = "drafted"

    db.commit()
    db.refresh(company)
    return company


@router.get("", response_model=list[CompanyResponse])
def get_companies(
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Company)
    if status:
        query = query.filter(Company.status == status)
    return query.order_by(Company.created_at.desc()).offset(offset).limit(limit).all()


# ── /export MUST come before /{company_id} so FastAPI doesn't try to cast "export" as int ──

@router.get("/export")
def export_leads(
    format: str = "csv",
    niche: str | None = None,
    location: str | None = None,
    status: str | None = None,
    _token: str | None = Query(default=None),  # fallback for browser direct-download links
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """Export all leads (or a filtered subset) as CSV or XLSX."""
    # Resolve user — prefer Authorization header, fall back to ?_token= query param
    user = None
    if authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        user = get_current_user_from_token(db, token)
    elif _token:
        user = get_current_user_from_token(db, _token)
    if user is None:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    query = db.query(Company)
    if niche:
        query = query.filter(Company.niche == niche)
    if location:
        query = query.filter(Company.location == location)
    if status:
        query = query.filter(Company.status == status)
    companies = query.order_by(Company.created_at.desc()).all()

    rows = []
    for c in companies:
        contacts_by_role: dict[str, Contact] = {}
        for ct in c.contacts:
            contacts_by_role[ct.role.upper()] = ct

        ceo = contacts_by_role.get("CEO")
        cto = contacts_by_role.get("CTO")
        cfo = contacts_by_role.get("CFO")

        rows.append({
            "Company_Name": c.name,
            "Website": c.website,
            "Niche": c.niche or "",
            "Location": c.location or "",
            "Address": c.address or "",
            "Business_Type": c.business_type or "",
            "Phone": c.phone or "",
            "Landline": c.landline or "",
            "CEO_Name": ceo.name if ceo else "",
            "CEO_Email": ceo.email if ceo else "",
            "CTO_Name": cto.name if cto else "",
            "CTO_Email": cto.email if cto else "",
            "CFO_Name": cfo.name if cfo else "",
            "CFO_Email": cfo.email if cfo else "",
            "Status": c.status,
            "Created_At": c.created_at.strftime("%Y-%m-%d %H:%M") if c.created_at else "",
        })

    df = pd.DataFrame(rows)
    buf = BytesIO()

    if format.lower() == "xlsx":
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Leads")
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="leads_export.xlsx"'},
        )
    else:
        df.to_csv(buf, index=False)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="leads_export.csv"'},
        )


# ── /sent-history MUST come before /{company_id} ──────────────────────────────

@router.get("/sent-history")
def get_sent_history(
    q: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return companies with status='sent' enriched with latest email log data."""
    query = db.query(Company).filter(Company.status == "sent")

    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(Company.name).like(pattern),
                func.lower(Company.niche).like(pattern),
                func.lower(Company.location).like(pattern),
            )
        )

    total = query.count()
    companies = query.order_by(Company.updated_at.desc()).offset(skip).limit(limit).all()

    items = []
    for company in companies:
        latest_log = (
            db.query(EmailLog)
            .filter(EmailLog.company_id == company.id, EmailLog.status == "sent")
            .order_by(EmailLog.sent_at.desc())
            .first()
        )
        primary = None
        for c in company.contacts:
            if c.role and c.role.upper() in ("CEO", "CTO", "CFO"):
                primary = c
                break
        if primary is None and company.contacts:
            primary = company.contacts[0]

        items.append({
            "id": company.id,
            "name": company.name,
            "website": company.website,
            "niche": company.niche,
            "location": company.location,
            "recipient_name": (latest_log.recipient_name if latest_log else None) or (primary.name if primary else None),
            "recipient_email": (latest_log.recipient_email if latest_log else None) or (primary.email if primary else None),
            "subject": latest_log.subject if latest_log else None,
            "body": (
                latest_log.body
                if latest_log and latest_log.body
                else (latest_log.template.body if latest_log and latest_log.template else None)
            ),
            "sent_at": latest_log.sent_at.isoformat() if latest_log and latest_log.sent_at else None,
            "opened_at": latest_log.opened_at.isoformat() if latest_log and latest_log.opened_at else None,
            "open_count": latest_log.open_count if latest_log else 0,
            "last_open_user_agent": latest_log.last_open_user_agent if latest_log else None,
        })

    return {"items": items, "total": total}


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.put("/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: int,
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if key == "website" and value is not None:
            value = str(value)
        setattr(company, key, value)

    db.commit()
    db.refresh(company)
    return company


@router.delete("/bulk")
def bulk_delete_companies(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not payload.ids:
        raise HTTPException(status_code=400, detail="No ids provided")
    deleted = (
        db.query(Company)
        .filter(Company.id.in_(payload.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


@router.delete("/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    db.delete(company)
    db.commit()
    return {"message": "Company deleted"}
