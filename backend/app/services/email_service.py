"""
Email service using Hostinger SMTP with optional portfolio file attachments.
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("/app/uploads/portfolio")


def _get_portfolio_files(user_id: Optional[int] = None) -> list[Path]:
    """Return all portfolio files, optionally filtered by user_id prefix."""
    if not UPLOAD_DIR.exists():
        return []
    files = []
    for f in UPLOAD_DIR.iterdir():
        if f.is_file():
            if user_id is None or f.name.startswith(f"user{user_id}_"):
                files.append(f)
    return files


def send_email(
    to_email: str,
    to_name: Optional[str],
    subject: str,
    body_html: str,
    attach_portfolio: bool = False,
    user_id: Optional[int] = None,
) -> dict:
    """
    Send an email via Hostinger SMTP.
    Returns {"success": True} or {"success": False, "error": str}.
    """
    smtp_host = settings.SMTP_HOST
    smtp_port = settings.SMTP_PORT
    smtp_user = settings.SMTP_USER
    smtp_password = settings.SMTP_PASSWORD
    from_email = settings.SMTP_FROM_EMAIL or smtp_user
    from_name = settings.SMTP_FROM_NAME

    if not smtp_user or not smtp_password:
        logger.error("SMTP credentials not configured")
        return {"success": False, "error": "SMTP credentials not configured"}

    msg = MIMEMultipart("mixed")
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    msg["Subject"] = subject

    # HTML body
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    # Portfolio attachments
    if attach_portfolio:
        portfolio_files = _get_portfolio_files(user_id)
        for file_path in portfolio_files:
            try:
                with open(file_path, "rb") as fh:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(fh.read())
                encoders.encode_base64(part)
                # Strip user prefix from displayed filename
                display_name = file_path.name
                if user_id and display_name.startswith(f"user{user_id}_"):
                    display_name = display_name[len(f"user{user_id}_"):]
                part.add_header(
                    "Content-Disposition",
                    f'attachment; filename="{display_name}"',
                )
                msg.attach(part)
            except Exception as exc:
                logger.warning("Could not attach file %s: %s", file_path, exc)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_email, [to_email], msg.as_bytes())
        logger.info("Email sent to %s", to_email)
        return {"success": True}
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return {"success": False, "error": str(exc)}


def test_smtp_connection() -> dict:
    """Verify SMTP credentials by opening a connection without sending."""
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        return {"success": True, "message": f"Connected to {settings.SMTP_HOST}:{settings.SMTP_PORT} as {settings.SMTP_USER}"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
