"""Background task for IMAP reply detection"""
import logging
import asyncio
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.services.imap_service import check_for_replies

logger = logging.getLogger(__name__)

scheduler: BackgroundScheduler = None


def _check_replies_job():
    """Background job to check for email replies"""
    if not settings.IMAP_ENABLED:
        return

    try:
        engine = create_engine(settings.DATABASE_URL)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()

        count = check_for_replies(db)
        db.close()

        if count > 0:
            logger.info("Reply checker job: detected %d new replies", count)

    except Exception as e:
        logger.error("Reply checker job failed: %s", e)


def start_reply_checker():
    """Start the background scheduler for reply checking"""
    global scheduler

    if scheduler is not None:
        return  # Already started

    if not settings.IMAP_ENABLED:
        logger.info("Reply checker disabled (IMAP_ENABLED=False)")
        return

    try:
        scheduler = BackgroundScheduler()
        interval_minutes = settings.IMAP_CHECK_INTERVAL_MINUTES or 5

        scheduler.add_job(
            _check_replies_job,
            "interval",
            minutes=interval_minutes,
            id="check_email_replies",
            name="Check for email replies via IMAP",
            max_instances=1,
        )

        scheduler.start()
        logger.info(
            "Reply checker started: checking every %d minutes",
            interval_minutes,
        )

    except Exception as e:
        logger.error("Failed to start reply checker: %s", e)


def stop_reply_checker():
    """Stop the background scheduler"""
    global scheduler

    if scheduler is None:
        return

    try:
        scheduler.shutdown()
        scheduler = None
        logger.info("Reply checker stopped")
    except Exception as e:
        logger.error("Error stopping reply checker: %s", e)
