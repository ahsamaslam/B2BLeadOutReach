"""
LinkedIn OAuth2 + Messaging integration.

Supports:
  1. OAuth2 authorization flow (connect LinkedIn account)
  2. Sending messages to 1st-degree connections via LinkedIn API
  3. Generating InMail deep-link URLs for non-connections

LinkedIn API scopes used:
  - openid, profile, email  → read user identity
  - w_member_social          → send messages to 1st-degree connections

NOTE: Sending InMail to non-connections requires LinkedIn's Marketing/
Recruiter partner programmes and cannot be done via the standard API.
For non-connections the app generates a direct InMail URL instead.
"""
import logging
import secrets
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
_LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
_LINKEDIN_API_BASE = "https://api.linkedin.com/v2"

# Scopes — openid/profile/email = identity, w_member_social = messaging
_SCOPES = "openid profile email w_member_social"


class LinkedInService:
    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """Return the LinkedIn OAuth2 authorization URL."""
        if not settings.LINKEDIN_CLIENT_ID:
            raise ValueError("LINKEDIN_CLIENT_ID is not configured")
        params = {
            "response_type": "code",
            "client_id": settings.LINKEDIN_CLIENT_ID,
            "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
            "state": state or secrets.token_urlsafe(16),
            "scope": _SCOPES,
        }
        return f"{_LINKEDIN_AUTH_URL}?{urlencode(params)}"

    def exchange_code_for_token(self, code: str) -> dict:
        """Exchange an authorization code for an access token."""
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
            "client_id": settings.LINKEDIN_CLIENT_ID,
            "client_secret": settings.LINKEDIN_CLIENT_SECRET,
        }
        with httpx.Client(timeout=30) as client:
            resp = client.post(_LINKEDIN_TOKEN_URL, data=data)
            resp.raise_for_status()
            return resp.json()

    def get_profile(self, access_token: str) -> dict:
        """Fetch basic LinkedIn profile (id, name)."""
        headers = {"Authorization": f"Bearer {access_token}"}
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                f"{_LINKEDIN_API_BASE}/userinfo",
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()

    def send_message(
        self,
        access_token: str,
        sender_urn: str,
        recipient_urn: str,
        message_body: str,
        subject: Optional[str] = None,
    ) -> dict:
        """
        Send a message to a 1st-degree connection.
        sender_urn / recipient_urn format: "urn:li:person:{id}"
        """
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        }
        payload = {
            "recipients": [{"person": {"$URN": recipient_urn}}],
            "subject": subject or "Business inquiry",
            "body": message_body,
            "messageType": "MEMBER_TO_MEMBER",
        }
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{_LINKEDIN_API_BASE}/messages",
                headers=headers,
                json=payload,
            )
            if resp.status_code in (200, 201, 204):
                return {"success": True}
            logger.warning("LinkedIn message API error: %s %s", resp.status_code, resp.text)
            return {"success": False, "error": resp.text, "status_code": resp.status_code}

    @staticmethod
    def profile_url_to_urn(profile_url: str) -> Optional[str]:
        """
        Attempt to extract the LinkedIn member URN from a profile URL.
        Only works if the URL contains /in/{slug} — we return the slug as a
        search hint (not a true URN, which requires a People Search API call).
        """
        if not profile_url:
            return None
        # e.g. https://www.linkedin.com/in/john-doe-123456/
        parts = profile_url.rstrip("/").split("/")
        try:
            idx = parts.index("in")
            return parts[idx + 1]  # slug, not a URN — used for deep links
        except (ValueError, IndexError):
            return None

    @staticmethod
    def build_inmail_url(linkedin_profile_url: str) -> str:
        """
        Build a LinkedIn InMail deep-link URL.
        Opens the LinkedIn messaging panel for the given profile.
        """
        slug = LinkedInService.profile_url_to_urn(linkedin_profile_url)
        if slug:
            return f"https://www.linkedin.com/in/{slug}/?openMessageCompose=1"
        return linkedin_profile_url or "https://www.linkedin.com"

    @staticmethod
    def build_sales_navigator_url(name: str, company: str) -> str:
        """Build a Sales Navigator search URL for a person."""
        query = f"{name} {company}".strip()
        return (
            f"https://www.linkedin.com/sales/search/people"
            f"?keywords={query.replace(' ', '%20')}"
        )


linkedin_service = LinkedInService()
