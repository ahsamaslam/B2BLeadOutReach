"""
Email open-tracking endpoint.
Serves a 1×1 transparent GIF and records opened_at on EmailLog.
"""
import base64
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EmailLog

router = APIRouter()

# 1×1 transparent GIF (35 bytes)
_PIXEL_B64 = (
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)
_PIXEL_BYTES = base64.b64decode(_PIXEL_B64)


@router.get("/open/{token}", include_in_schema=False)
def track_open(token: str, db: Session = Depends(get_db)):
    """
    Called when recipient's email client loads the tracking pixel.
    Records the first-open timestamp on the corresponding EmailLog row.
    Always returns a 1×1 transparent GIF regardless of outcome.
    """
    log = db.query(EmailLog).filter(EmailLog.tracking_token == token).first()
    if log and log.opened_at is None:
        log.opened_at = datetime.utcnow()
        db.commit()

    return Response(
        content=_PIXEL_BYTES,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )
