"""
Email open-tracking endpoint.
Serves a 1×1 transparent PNG and records open events on EmailLog.

Design notes:
  - opened_at  → set only on the FIRST open (never overwritten)
  - open_count → incremented on EVERY pixel hit, including re-opens
  - last_open_user_agent → updated on every hit (most recent client)
  - Bot/prefetch guard: Google Image Proxy, Outlook SafeLinks, and
    similar crawlers always come in without a plausible MUA string.
    We still record them (conservative: missing real opens is worse
    than counting bot opens) but store the raw UA for transparency.
"""
import base64
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import Response, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EmailLog

router = APIRouter()
logger = logging.getLogger(__name__)

# 1×1 transparent PNG (67 bytes) — smaller than GIF, less spam-flagged
_PIXEL_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhf"
    "DwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
_PIXEL_BYTES = base64.b64decode(_PIXEL_B64)

# Headers for the pixel response — prevents caching in proxies/clients
_PIXEL_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Robots-Tag": "noindex, nofollow",   # Tell search bots not to index
    "X-Content-Type-Options": "nosniff",
}


@router.get("/open/{token}", include_in_schema=False)
def track_open(
    token: str,
    db: Session = Depends(get_db),
    user_agent: str = Header(default="", alias="user-agent"),
):
    """
    Called when recipient's email client loads the tracking pixel.
    - Records first-open timestamp (opened_at) on first hit only.
    - Increments open_count on every hit.
    - Stores the most-recent user-agent (mail client identifier).
    Always returns a 1×1 transparent PNG regardless of token validity.
    """
    try:
        log = db.query(EmailLog).filter(EmailLog.tracking_token == token).first()
        if log:
            now = datetime.utcnow()
            # First open: record timestamp
            if log.opened_at is None:
                log.opened_at = now
            # Every open: increment counter + store user agent
            current_count = log.open_count or 0
            log.open_count = current_count + 1
            log.last_open_user_agent = user_agent or None
            db.commit()
            logger.info(
                "Email opened: token=%s count=%d ua=%.80s",
                token, log.open_count, user_agent,
            )
    except Exception as exc:
        logger.warning("Tracking pixel DB error (token=%s): %s", token, exc)

    return Response(
        content=_PIXEL_BYTES,
        media_type="image/png",
        headers=_PIXEL_HEADERS,
    )


@router.post("/webhook/brevo", include_in_schema=False)
async def brevo_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receives webhook notifications from Brevo for email events (opens, clicks, replies, bounces, etc).
    This endpoint specifically handles 'replied' events to track email replies.

    Brevo webhook payload structure can be a list or single object:
    {
        "event": "replied",
        "email": "recipient@example.com",
        "message-id": "...",
        "ts": 1234567890,
        "ts_event": 1234567890,
        "subject": "Original subject",
        "ts_bounce": null
    }
    """
    try:
        body = await request.json()
        logger.info("Brevo webhook received: %s", body)
        events = body if isinstance(body, list) else [body]

        for event in events:
            event_type = event.get("event")
            logger.info("Processing Brevo event type: %s", event_type)

            if event_type == "replied":
                recipient_email = event.get("email")
                ts_event = event.get("ts_event")
                logger.info("Reply event - email=%s ts_event=%s", recipient_email, ts_event)

                if recipient_email and ts_event:
                    # Find the email log by recipient email
                    # We match by recipient_email since Brevo doesn't send our tracking token
                    logs = db.query(EmailLog).filter(
                        EmailLog.recipient_email == recipient_email,
                        EmailLog.status == "sent",
                        EmailLog.replied_at.is_(None),  # Only update if not already marked as replied
                    ).all()

                    logger.info("Found %d matching email logs for %s", len(logs), recipient_email)
                    if logs:
                        replied_dt = datetime.utcfromtimestamp(ts_event)
                        for log in logs:
                            log.replied_at = replied_dt
                        db.commit()
                        logger.info(
                            "Email reply detected: email=%s count=%d",
                            recipient_email, len(logs),
                        )
                    else:
                        logger.info("Brevo reply webhook: no matching email log for %s", recipient_email)
                else:
                    logger.warning("Brevo reply webhook: missing email or ts_event")
            else:
                logger.debug("Brevo webhook event (non-reply): %s", event_type)

    except Exception as exc:
        logger.error("Brevo webhook error: %s", exc, exc_info=True)

    # Always return 200 OK to acknowledge receipt (Brevo will retry if we return error)
    return {"status": "ok"}
