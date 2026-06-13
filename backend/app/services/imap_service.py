"""IMAP service for detecting email replies"""
import logging
import imaplib
from datetime import datetime, timedelta
from email.parser import BytesParser
from email.policy import default
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import EmailLog

logger = logging.getLogger(__name__)


def connect_imap() -> Optional[imaplib.IMAP4_SSL]:
    """Connect to IMAP server"""
    if not settings.IMAP_ENABLED or not settings.IMAP_HOST:
        return None

    try:
        imap = imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT)
        imap.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        logger.info("Connected to IMAP server: %s", settings.IMAP_HOST)
        return imap
    except Exception as e:
        logger.error("Failed to connect to IMAP: %s", e)
        return None


def extract_reply_metadata(message) -> dict:
    """Extract reply info from email message"""
    try:
        from_addr = message.get("From", "").lower()
        to_addr = message.get("To", "").lower()
        subject = message.get("Subject", "")
        message_id = message.get("Message-ID", "")
        in_reply_to = message.get("In-Reply-To", "")
        references = message.get("References", "")
        date_str = message.get("Date", "")

        return {
            "from": from_addr,
            "to": to_addr,
            "subject": subject,
            "message_id": message_id,
            "in_reply_to": in_reply_to,
            "references": references,
            "date": date_str,
        }
    except Exception as e:
        logger.warning("Failed to extract reply metadata: %s", e)
        return {}


def is_reply(message_data: dict) -> bool:
    """Check if message is a reply"""
    subject = message_data.get("subject", "").lower()
    in_reply_to = message_data.get("in_reply_to", "")

    # Check for "Re:" prefix or In-Reply-To header
    return subject.startswith("re:") or bool(in_reply_to)


def extract_reply_from(subject: str) -> str:
    """Extract original sender email from subject"""
    # For matching purposes, we look at the To field in the reply
    # The reply comes FROM someone, and we need to match that to our sent emails
    return ""


def check_for_replies(db: Session) -> int:
    """Check IMAP inbox for replies and update EmailLog"""
    if not settings.IMAP_ENABLED:
        logger.debug("IMAP reply detection disabled")
        return 0

    imap = connect_imap()
    if not imap:
        return 0

    try:
        imap.select("INBOX")

        # Search for recent emails (last N days to avoid checking all emails)
        lookback_days = settings.IMAP_CHECK_INTERVAL_MINUTES // 1440 + 1
        since_date = (datetime.utcnow() - timedelta(days=lookback_days)).strftime("%d-%b-%Y")

        status, message_ids = imap.search(None, f"SINCE {since_date}")
        if status != "OK":
            logger.warning("IMAP search failed")
            return 0

        email_ids = message_ids[0].split()
        logger.info("Found %d recent emails in inbox", len(email_ids))

        replies_detected = 0

        for email_id in email_ids:
            try:
                status, msg_data = imap.fetch(email_id, "(RFC822)")
                if status != "OK":
                    continue

                msg_bytes = msg_data[0][1]
                message = BytesParser(policy=default).parsebytes(msg_bytes)

                reply_meta = extract_reply_metadata(message)
                if not is_reply(reply_meta):
                    continue

                sender_email = reply_meta.get("from", "").strip("<>")
                if not sender_email:
                    continue

                # Find sent emails from OUR_EMAIL to this sender
                # When they reply, their email becomes the sender
                # We need to find our email_logs where recipient_email matches this sender
                logs = db.query(EmailLog).filter(
                    EmailLog.recipient_email.ilike(sender_email),
                    EmailLog.status == "sent",
                    EmailLog.replied_at.is_(None),
                ).all()

                if logs:
                    now = datetime.utcnow()
                    for log in logs:
                        if log.replied_at is None:
                            log.replied_at = now
                            logger.info(
                                "Reply detected from %s to email_log %d",
                                sender_email,
                                log.id,
                            )
                            replies_detected += 1

                    db.commit()

            except Exception as e:
                logger.warning("Error processing email %s: %s", email_id, e)
                continue

        logger.info("IMAP check complete: detected %d new replies", replies_detected)
        return replies_detected

    except Exception as e:
        logger.error("IMAP check failed: %s", e)
        return 0
    finally:
        try:
            imap.close()
            imap.logout()
        except:
            pass
