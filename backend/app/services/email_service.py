"""
Email service using Hostinger SMTP with optional portfolio file attachments.

Anti-spam measures applied:
  - multipart/alternative (HTML + plain-text fallback)
  - proper Message-ID header
  - List-Unsubscribe header
  - unsubscribe footer in every email
  - tracking pixel injected into HTML body
"""
import html
import re
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.utils import make_msgid, formatdate
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


def _html_to_plaintext(html_body: str) -> str:
    """Very simple HTML→plain-text strip for the multipart/alternative fallback."""
    text = re.sub(r"<br\s*/?>", "\n", html_body, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def _inject_tracking_pixel(body_html: str, tracking_token: str) -> str:
    """Append a 1×1 invisible tracking pixel before </body> (or at end)."""
    base_url = settings.MY_COMPANY_WEBSITE.rstrip("/")
    pixel_url = f"{base_url}/api/tracking/open/{tracking_token}"
    pixel_tag = (
        f'<img src="{pixel_url}" width="1" height="1" '
        f'style="display:none!important;border:0;width:1px;height:1px;" '
        f'alt="" />'
    )
    if "</body>" in body_html.lower():
        return re.sub(r"</body>", pixel_tag + "</body>", body_html, flags=re.IGNORECASE)
    return body_html + pixel_tag


def _add_unsubscribe_footer(body_html: str, to_email: str) -> str:
    """Append a plain unsubscribe notice that reduces spam scoring."""
    footer = (
        "<br><br><hr style='border:none;border-top:1px solid #eee;'>"
        "<p style='font-size:11px;color:#999;text-align:center;'>"
        f"You received this message because your business was identified as a potential fit "
        f"for our services. To stop receiving emails, simply reply with \"Unsubscribe\"."
        "</p>"
    )
    if "</body>" in body_html.lower():
        return re.sub(r"</body>", footer + "</body>", body_html, flags=re.IGNORECASE)
    return body_html + footer


def send_email(
    to_email: str,
    to_name: Optional[str],
    subject: str,
    body_html: str,
    attach_portfolio: bool = False,
    user_id: Optional[int] = None,
    tracking_token: Optional[str] = None,
    # Per-tenant FROM overrides — clients set their own name/address in Settings
    from_email: Optional[str] = None,
    from_name: Optional[str] = None,
) -> dict:
    """
    Send an email via Hostinger SMTP.
    from_email / from_name can be overridden per-tenant so each client
    sends from their own address using the platform's SMTP credentials.
    Returns {"success": True} or {"success": False, "error": str}.
    """
    smtp_host = settings.SMTP_HOST
    smtp_port = settings.SMTP_PORT
    smtp_user = settings.SMTP_USER
    smtp_password = settings.SMTP_PASSWORD
    from_email = from_email or settings.SMTP_FROM_EMAIL or smtp_user
    from_name = from_name or settings.SMTP_FROM_NAME

    if not smtp_user or not smtp_password:
        logger.error("SMTP credentials not configured")
        return {"success": False, "error": "SMTP credentials not configured"}

    # Inject tracking pixel + unsubscribe footer into HTML
    enhanced_html = _add_unsubscribe_footer(body_html, to_email)
    if tracking_token:
        enhanced_html = _inject_tracking_pixel(enhanced_html, tracking_token)

    # Build multipart/mixed outer (for attachments)
    outer = MIMEMultipart("mixed")
    outer["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    outer["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    outer["Subject"] = subject
    outer["Message-ID"] = make_msgid(domain=from_email.split("@")[-1])
    outer["Date"] = formatdate(localtime=True)
    outer["List-Unsubscribe"] = f"<mailto:{from_email}?subject=Unsubscribe>"
    outer["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    outer["X-Mailer"] = "B2BLeadOutreach/1.0"

    # multipart/alternative carries HTML + plain-text
    alternative = MIMEMultipart("alternative")
    plain_text = _html_to_plaintext(enhanced_html)
    alternative.attach(MIMEText(plain_text, "plain", "utf-8"))
    alternative.attach(MIMEText(enhanced_html, "html", "utf-8"))
    outer.attach(alternative)

    # Portfolio attachments
    if attach_portfolio:
        for file_path in _get_portfolio_files(user_id):
            try:
                with open(file_path, "rb") as fh:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(fh.read())
                encoders.encode_base64(part)
                display_name = file_path.name
                if user_id and display_name.startswith(f"user{user_id}_"):
                    display_name = display_name[len(f"user{user_id}_"):]
                part.add_header("Content-Disposition", f'attachment; filename="{display_name}"')
                outer.attach(part)
            except Exception as exc:
                logger.warning("Could not attach file %s: %s", file_path, exc)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [to_email], outer.as_bytes())
        logger.info("Email sent to %s (tracking=%s)", to_email, tracking_token)
        return {"success": True}
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return {"success": False, "error": str(exc)}


def test_smtp_connection(
    from_email: Optional[str] = None,
    **_kwargs,
) -> dict:
    """Verify SMTP credentials by opening a connection without sending."""
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        display = from_email or settings.SMTP_FROM_EMAIL or settings.SMTP_USER
        return {"success": True, "message": f"Connected to {settings.SMTP_HOST}:{settings.SMTP_PORT} — sending as {display}"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
