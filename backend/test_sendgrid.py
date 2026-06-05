#!/usr/bin/env python3
"""Test SendGrid email sending."""
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.config import settings
from app.services import email_service

def test_sendgrid():
    """Send a test email via SendGrid."""
    print("=" * 60)
    print("SendGrid Email Test")
    print("=" * 60)

    # Check configuration
    print(f"\n✓ SendGrid API Key configured: {bool(settings.SENDGRID_API_KEY)}")
    print(f"✓ From Email: {settings.SENDGRID_FROM_EMAIL}")
    print(f"✓ From Name: {settings.SENDGRID_FROM_NAME}")

    if not settings.SENDGRID_API_KEY:
        print("\n❌ SendGrid API key not configured!")
        return False

    # Send test email
    recipient_email = "kashankhanpak265@gmail.com"
    recipient_name = "Kashan Khan"

    html_body = """
    <html>
    <body style="font-family: Arial, sans-serif;">
        <h2>SendGrid Test Email</h2>
        <p>Hello Kashan,</p>
        <p>This is a test email from the B2B Lead Outreach system.</p>
        <p>If you received this, SendGrid is working correctly! 🎉</p>
        <p style="color: #666; font-size: 12px;">
            Sent from: {from_name} &lt;{from_email}&gt;
        </p>
    </body>
    </html>
    """.format(
        from_name=settings.SENDGRID_FROM_NAME,
        from_email=settings.SENDGRID_FROM_EMAIL
    )

    print(f"\n📧 Sending test email to: {recipient_email}")
    print(f"   From: {settings.SENDGRID_FROM_NAME} <{settings.SENDGRID_FROM_EMAIL}>")

    result = email_service.send_email(
        to_email=recipient_email,
        to_name=recipient_name,
        subject="Test Email from B2B Lead Outreach",
        body_html=html_body,
        attach_portfolio=False,
    )

    print("\n" + "=" * 60)
    if result.get("success"):
        print("✅ SUCCESS! Email sent successfully via SendGrid")
        print("=" * 60)
        return True
    else:
        print("❌ FAILED! Email sending error:")
        print(f"Error: {result.get('error', 'Unknown error')}")
        print("=" * 60)
        return False

if __name__ == "__main__":
    success = test_sendgrid()
    sys.exit(0 if success else 1)
