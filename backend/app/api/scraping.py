import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import SessionLocal, get_db
from app.models import Company, Contact, EmailTemplate, ScrapeMetadata, ScrapingTask, User
from app.schemas import ScrapingTaskCreate
from app.services.openai_service import OpenAIService

router = APIRouter()


async def _run_scraping(task_id: str, company_ids: list[int]):
    """Background task: scrape companies and update DB progress in real time."""
    db: Session = SessionLocal()
    try:
        task = db.query(ScrapingTask).filter(ScrapingTask.task_id == task_id).first()
        companies = db.query(Company).filter(Company.id.in_(company_ids)).all()

        for company in companies:
            try:
                company.status = "scraping"
                db.commit()

                data = await OpenAIService.extract_company_data(company.name, company.website)
                company.company_info = data.get("company_info", "")
                company.projects = data.get("projects", "")
                company.news = data.get("news", "")
                company.phone = data.get("phone", "")
                company.landline = data.get("landline", "")

                metadata = db.query(ScrapeMetadata).filter(ScrapeMetadata.company_id == company.id).first()
                if not metadata:
                    metadata = ScrapeMetadata(company_id=company.id)
                    db.add(metadata)
                metadata.source = data.get("research_source", "local_only")
                metadata.local_pages_scraped = int(data.get("local_pages_scraped", 0) or 0)
                metadata.used_perplexity = bool(data.get("used_perplexity", False))
                metadata.note = data.get("research_note", "")

                db.query(Contact).filter(Contact.company_id == company.id).delete()
                for role in ("ceo", "cto", "cfo"):
                    name = data.get(f"{role}_name", "")
                    email = data.get(f"{role}_email", "")
                    if name or email:
                        db.add(
                            Contact(
                                company_id=company.id,
                                role=role.upper(),
                                name=name or None,
                                email=email or None,
                            )
                        )

                ceo_name = data.get("ceo_name", "")
                generated = await OpenAIService.generate_email_template(
                    company_name=company.name,
                    ceo_name=ceo_name,
                    company_info=company.company_info or "",
                    projects=company.projects or "",
                    news=company.news or "",
                )

                template = db.query(EmailTemplate).filter(EmailTemplate.company_id == company.id).first()
                if template:
                    template.subject = generated.get("subject", template.subject)
                    template.body = generated.get("body", template.body)
                    template.status = "drafted"
                else:
                    db.add(
                        EmailTemplate(
                            company_id=company.id,
                            subject=generated.get("subject", f"AI solutions for {company.name}"),
                            body=generated.get("body", ""),
                            status="drafted",
                        )
                    )

                company.status = "drafted"
                task.successful_companies += 1
            except Exception as exc:
                company.status = "error"
                company.error_message = str(exc)
                task.failed_companies += 1

            task.processed_companies += 1
            task.progress_percentage = round((task.processed_companies / task.total_companies) * 100, 2)
            db.commit()

        task.status = "completed"
        task.completed_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


@router.post("/start")
async def start_scraping(
    payload: ScrapingTaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Company)
    if payload.company_ids:
        companies = query.filter(Company.id.in_(payload.company_ids)).all()
    else:
        companies = query.filter(Company.status == "created").all()

    if not companies:
        return {
            "task_id": "",
            "status": "completed",
            "total_companies": 0,
            "processed_companies": 0,
            "successful_companies": 0,
            "failed_companies": 0,
            "progress_percentage": 100,
            "started_at": datetime.utcnow(),
        }

    task_id = str(uuid.uuid4())
    task = ScrapingTask(
        task_id=task_id,
        status="running",
        total_companies=len(companies),
        processed_companies=0,
        successful_companies=0,
        failed_companies=0,
        progress_percentage=0,
        started_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()

    company_ids = [c.id for c in companies]
    background_tasks.add_task(_run_scraping, task_id, company_ids)

    return {
        "task_id": task_id,
        "status": "running",
        "total_companies": len(companies),
        "processed_companies": 0,
        "successful_companies": 0,
        "failed_companies": 0,
        "progress_percentage": 0,
        "started_at": datetime.utcnow(),
    }


@router.get("/status/{task_id}")
def scraping_status(
    task_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    task = db.query(ScrapingTask).filter(ScrapingTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "task_id": task.task_id,
        "status": task.status,
        "total_companies": task.total_companies,
        "processed_companies": task.processed_companies,
        "successful_companies": task.successful_companies,
        "failed_companies": task.failed_companies,
        "progress_percentage": task.progress_percentage,
        "started_at": task.started_at,
    }


@router.post("/company/{company_id}")
async def scrape_single_company(
    company_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    payload = ScrapingTaskCreate(company_ids=[company_id])
    return await start_scraping(payload, background_tasks, db, _)
