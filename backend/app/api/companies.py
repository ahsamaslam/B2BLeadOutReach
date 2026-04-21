from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Company, User
from app.schemas import CompanyCreate, CompanyResponse, CompanyUpdate, BulkUploadResponse

router = APIRouter()


@router.get("/template")
def download_template():
    """Return a sample Excel file showing the expected upload format."""
    sample_data = {
        "Company_Name": [
            "Acme Corp",
            "Globex Industries",
            "Initech Solutions",
        ],
        "Website": [
            "https://acmecorp.com",
            "https://globex.com",
            "https://initech.com",
        ],
        "Industry": ["Manufacturing", "Energy", "Software"],
        "Location": ["New York, USA", "Springfield, USA", "Austin, USA"],
        "Employees": ["500-1000", "1000-5000", "50-200"],
        "Notes": ["Optional notes", "", ""],
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

    required_cols = {"Company_Name", "Website"}
    if not required_cols.issubset(set(df.columns)):
        raise HTTPException(status_code=400, detail="File must contain Company_Name and Website columns")

    added = 0
    skipped = 0
    errors: list[str] = []

    for _, row in df.iterrows():
        try:
            name = str(row["Company_Name"]).strip()
            website = str(row["Website"]).strip()
            if not name or not website or name == "nan" or website == "nan":
                skipped += 1
                continue

            exists = db.query(Company).filter(Company.name == name, Company.website == website).first()
            if exists:
                skipped += 1
                continue

            db.add(Company(name=name, website=website, status="created"))
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
    company = Company(name=payload.name, website=str(payload.website), status="created")
    db.add(company)
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
