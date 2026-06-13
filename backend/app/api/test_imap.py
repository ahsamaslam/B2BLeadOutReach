"""Temporary test endpoint for IMAP reply detection"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.imap_service import check_for_replies

router = APIRouter()


@router.post("/test-imap-check", include_in_schema=False)
def test_imap_check(db: Session = Depends(get_db)):
    """Manually trigger IMAP reply check - for testing only"""
    try:
        count = check_for_replies(db)
        return {
            "status": "ok",
            "replies_detected": count,
            "message": f"Found {count} new replies"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
