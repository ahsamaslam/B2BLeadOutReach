"""
Niche discovery API — find leads by niche + location using DuckDuckGo + Claude,
seed them into the Company table, and optionally kick off scraping.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import SessionLocal, get_db
from app.models import Company, ScrapingTask, User
from app.schemas import (
    DiscoveredCompany,
    DiscoverySearchRequest,
    DiscoverySearchResponse,
)
from app.services.discovery_service import NicheDiscoveryService
from app.api.scraping import _run_scraping

router = APIRouter()


@router.post("/search", response_model=DiscoverySearchResponse)
async def discovery_search(
    payload: DiscoverySearchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Use DuckDuckGo + Claude to discover real businesses matching a niche + location,
    then seed them as Company records and optionally queue scraping.
    """
    if not payload.niche.strip() or not payload.location.strip():
        raise HTTPException(status_code=400, detail="niche and location are required")

    raw_results = NicheDiscoveryService.discover(
        niche=payload.niche,
        location=payload.location,
        business_type=payload.business_type,
        max_results=payload.max_results,
    )

    if not raw_results:
        # Surface a helpful error when Anthropic key is missing
        from app.config import settings
        if not settings.ANTHROPIC_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="ANTHROPIC_API_KEY is not configured. Please set it in your .env file.",
            )
        return DiscoverySearchResponse(
            discovered=[],
            companies_seeded=0,
            companies_skipped=0,
            task_id=None,
        )

    seeded: list[int] = []
    skipped = 0
    discovered_out: list[DiscoveredCompany] = []

    for item in raw_results:
        discovered_out.append(
            DiscoveredCompany(
                name=item["name"],
                website=item["website"],
                address=item.get("address") or None,
                reason=item.get("reason") or None,
            )
        )

        # Skip if an identical company already exists
        exists = (
            db.query(Company)
            .filter(Company.name == item["name"], Company.website == item["website"])
            .first()
        )
        if exists:
            skipped += 1
            continue

        company = Company(
            name=item["name"],
            website=item["website"],
            address=item.get("address") or None,
            niche=payload.niche,
            location=payload.location,
            business_type=payload.business_type or None,
            status="created",
        )
        db.add(company)
        db.flush()  # get the ID before commit
        seeded.append(company.id)

    db.commit()

    task_id: str | None = None
    if payload.auto_scrape and seeded:
        task_id = str(uuid.uuid4())
        task = ScrapingTask(
            task_id=task_id,
            status="running",
            total_companies=len(seeded),
            processed_companies=0,
            successful_companies=0,
            failed_companies=0,
            progress_percentage=0,
            started_at=datetime.utcnow(),
        )
        db.add(task)
        db.commit()
        background_tasks.add_task(_run_scraping, task_id, seeded)

    return DiscoverySearchResponse(
        discovered=discovered_out,
        companies_seeded=len(seeded),
        companies_skipped=skipped,
        task_id=task_id,
    )


@router.get("/status/{task_id}")
def discovery_task_status(
    task_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return the scraping task progress for a discovery run."""
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
        "completed_at": getattr(task, "completed_at", None),
    }
