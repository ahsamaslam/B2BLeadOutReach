"""
Email service using SMTP with optional portfolio attachments.
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
        logger.warning("Portfolio upload directory does not exist: %s", UPLOAD_DIR)
        return []
    files = []
    for f in UPLOAD_DIR.iterdir():
        if f.is_file():
            if user_id is None or f.name.startswith(f"user{user_id}_"):
                files.append(f)
    logger.info("Found %d portfolio file(s) for user_id=%s: %s", len(files), user_id, [f.name for f in files])
    return files


def _html_to_plaintext(html_body: str) -> str:
    """Very simple HTML→plain-text strip for the multipart/alternative fallback."""
    text = re.sub(r"<br\s*/?>", "\n", html_body, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def _inject_tracking_pixel(body_html: str, tracking_token: str, base_url: str = "") -> str:
    """Append a 1×1 off-screen tracking pixel before </body> (or at end).

    Uses absolute positioning rather than display:none — display:none is a
    well-known spam signal that many content filters flag.
    The outer <div> clips overflow so the pixel never affects layout.
    """
    if not base_url:
        return body_html  # No tracking URL configured — skip silently
    pixel_url = f"{base_url.rstrip('/')}/api/tracking/open/{tracking_token}"
    pixel_tag = (
        '<div style="overflow:hidden;max-height:0;max-width:0;opacity:0;">'
        f'<img src="{pixel_url}" width="1" height="1" '
        f'style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;" '
        f'alt="" border="0" />'
        '</div>'
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


def _ensure_html(text: str) -> str:
    """Convert plain text to minimal HTML if the content has no HTML tags.
    Preserves paragraph breaks (blank lines) and single newlines."""
    stripped = text.strip()
    # If it already contains HTML tags, trust it as-is
    if re.search(r"<[a-zA-Z][^>]*>", stripped):
        return stripped
    # Wrap each paragraph (separated by blank lines) in <p>, replace single \n with <br>
    paragraphs = re.split(r"\n{2,}", stripped)
    html_parts = []
    for para in paragraphs:
        inner = para.replace("\n", "<br>")
        html_parts.append(f"<p>{inner}</p>")
    return "\n".join(html_parts)


def send_email(
    to_email: str,
    to_name: Optional[str],
    subject: str,
    body_html: str,
    attach_portfolio: bool = False,
    user_id: Optional[int] = None,
    tracking_token: Optional[str] = None,
    tracking_base_url: Optional[str] = None,
    # Per-tenant FROM overrides — clients set their own name/address in Settings
    smtp_host: Optional[str] = None,
    smtp_port: Optional[int] = None,
    smtp_user: Optional[str] = None,
    smtp_password: Optional[str] = None,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None,
) -> dict:
    """
    Send an email via Hostinger SMTP.
    from_email / from_name can be overridden per-tenant so each client
    sends from their own address using the platform's SMTP credentials.
    Returns {"success": True} or {"success": False, "error": str}.
    """
    logger.info(
        "send_email called: to=%s, subject=%s, attach_portfolio=%s, user_id=%s",
        to_email, subject[:50] if subject else "N/A", attach_portfolio, user_id
    )
    smtp_host = smtp_host or settings.SMTP_HOST
    smtp_port = int(smtp_port or settings.SMTP_PORT)
    smtp_user = smtp_user or settings.SMTP_USER
    smtp_password = smtp_password or settings.SMTP_PASSWORD
    from_email = from_email or settings.SMTP_FROM_EMAIL or smtp_user
    from_name = from_name or settings.SMTP_FROM_NAME

    if not smtp_user or not smtp_password:
        logger.error("SMTP credentials not configured")
        return {"success": False, "error": "SMTP credentials not configured"}

    # Ensure body is proper HTML (plain-text bodies lose all formatting in email clients)
    enhanced_html = _ensure_html(body_html)
    enhanced_html = _add_unsubscribe_footer(enhanced_html, to_email)
    if tracking_token:
        effective_base_url = (tracking_base_url or settings.TRACKING_BASE_URL or "").strip()
        enhanced_html = _inject_tracking_pixel(enhanced_html, tracking_token, effective_base_url)

    # Build multipart/mixed outer (for attachments)
    outer = MIMEMultipart("mixed")
    outer["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    outer["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    outer["Subject"] = subject
    outer["Message-ID"] = make_msgid(domain=from_email.split("@")[-1])
    outer["Date"] = formatdate(localtime=True)
    outer["Reply-To"] = from_email
    # Deliverability headers — reduce spam score, enable one-click unsubscribe
    outer["List-Unsubscribe"] = f"<mailto:{from_email}?subject=Unsubscribe>"
    outer["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    outer["Precedence"] = "bulk"
    if tracking_token:
        # Unique reference prevents Gmail from collapsing repeated sends into one thread
        outer["X-Entity-Ref-ID"] = tracking_token

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
                # Properly encode filename for email clients
                part.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=display_name
                )
                outer.attach(part)
                logger.info("Attached portfolio file: %s", display_name)
            except Exception as exc:
                logger.warning("Could not attach file %s: %s", file_path, exc)

    # Debug: dump raw MIME message when attachments are included
    if attach_portfolio:
        try:
            dump_path = UPLOAD_DIR.parent / "last_email.eml"
            dump_path.parent.mkdir(parents=True, exist_ok=True)
            dump_path.write_bytes(outer.as_bytes())
            logger.info("Wrote email dump to %s", dump_path)
        except Exception as exc:
            logger.warning("Failed to write email dump: %s", exc)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
            refused = server.sendmail(from_email, [to_email], outer.as_bytes())
            if refused:
                reason = refused.get(to_email) or next(iter(refused.values()))
                logger.error("SMTP rejected recipient %s: %s", to_email, reason)
                return {"success": False, "error": f"SMTP rejected recipient: {reason}"}
        logger.info("Email sent to %s (tracking=%s)", to_email, tracking_token)
        return {"success": True}
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return {"success": False, "error": str(exc)}


def test_smtp_connection(
    smtp_host: Optional[str] = None,
    smtp_port: Optional[int] = None,
    smtp_user: Optional[str] = None,
    smtp_password: Optional[str] = None,
    from_email: Optional[str] = None,
    **_kwargs,
) -> dict:
    """Verify SMTP credentials by opening a connection without sending."""
    try:
        smtp_host = smtp_host or settings.SMTP_HOST
        smtp_port = int(smtp_port or settings.SMTP_PORT)
        smtp_user = smtp_user or settings.SMTP_USER
        smtp_password = smtp_password or settings.SMTP_PASSWORD
        if not smtp_user or not smtp_password:
            return {"success": False, "error": "SMTP credentials not configured"}
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
        display = from_email or settings.SMTP_FROM_EMAIL or smtp_user
        return {"success": True, "message": f"Connected to {smtp_host}:{smtp_port} — sending as {display}"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
