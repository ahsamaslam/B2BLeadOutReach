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

from fastapi import APIRouter, Depends, Header
from fastapi.responses import Response
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
