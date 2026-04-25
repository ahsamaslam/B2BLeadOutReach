import json
from typing import Any, Dict, Optional
from urllib.parse import urlparse as _urlparse

from duckduckgo_search import DDGS
from anthropic import Anthropic

from app.config import settings
from app.services.scraper_service import LocalScraperService, ScrapedWebsiteData
from app.services.sos_service import lookup_owner_from_sos

_client = Anthropic(api_key=settings.ANTHROPIC_API_KEY) if settings.ANTHROPIC_API_KEY else None


# ── Hunter.io domain-search eligibility check ─────────────────────────────────

def _worth_domain_searching(local_data: "ScrapedWebsiteData") -> bool:
    """
    Decide whether to spend a Hunter.io domain-search credit on this lead.

    Hunter.io domain-search indexes emails that appear publicly on the web.
    Small solo businesses (one-person vet clinics, dog resorts, etc.) almost
    never publish personal emails anywhere — they only show info@/contact@ on
    their website.  If the website itself reveals no personal emails and no
    named staff members, Hunter will return 0 results and we waste a credit.

    We call domain-search if ANY of the following are true:
      1. The scraped site had at least one personal-looking email (score ≥ 10)
         → domain DOES publish personal emails, Hunter likely has more.
      2. The scraped site had named staff members (person_names non-empty)
         → company is big enough to have named staff indexed on the web.
      3. The scraped site had many pages (≥ 5)
         → bigger company = more likely to be in Hunter's index.

    If none of these signals are present we skip domain-search and save the
    credit.  email-finder is still tried separately whenever we have a name.
    """
    from app.services.scraper_service import _email_score
    # Signal 1: site has a personal email
    if any(_email_score(e) >= 10 for e in (local_data.emails or [])):
        return True
    # Signal 2: named staff found on site
    if local_data.person_names:
        return True
    # Signal 3: substantial site (multiple pages scraped)
    if len(local_data.pages_scraped) >= 5:
        return True
    return False


# ── Hunter.io helper ──────────────────────────────────────────────────────────

def _hunter_find_email(full_name: str, domain: str) -> Optional[str]:
    """
    Use Hunter.io Find Email API to locate a personal email for a known person + domain.
    Returns the email string if found with score >= 50, else None.
    Requires HUNTER_API_KEY in settings.
    """
    if not settings.HUNTER_API_KEY:
        return None
    if not full_name or not domain:
        return None
    import requests as _requests
    try:
        parts = full_name.strip().split()
        if len(parts) < 2:
            return None
        first, last = parts[0], parts[-1]
        resp = _requests.get(
            "https://api.hunter.io/v2/email-finder",
            params={
                "domain": domain,
                "first_name": first,
                "last_name": last,
                "api_key": settings.HUNTER_API_KEY,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get("data", {})
        email = data.get("email")
        score = data.get("score", 0)
        if email and score >= 50:
            return email
    except Exception:
        pass
    return None


def _hunter_domain_search(domain: str, company_name: str) -> "tuple[Optional[str], Optional[str]]":
    """
    Use Hunter.io Domain Search to find any email for a domain, preferring
    owner/director roles.  Falls back to the first personal-looking email found.

    Returns (email, full_name) so callers can update ceo_name when the email
    belongs to a different person than the one currently stored.
    """
    if not settings.HUNTER_API_KEY:
        return None, None
    if not domain:
        return None, None
    import requests as _requests
    try:
        resp = _requests.get(
            "https://api.hunter.io/v2/domain-search",
            params={
                "domain": domain,
                "limit": 10,
                "api_key": settings.HUNTER_API_KEY,
            },
            timeout=10,
        )
        resp.raise_for_status()
        emails = resp.json().get("data", {}).get("emails", [])

        def _entry_name(entry: dict) -> Optional[str]:
            first = (entry.get("first_name") or "").strip()
            last = (entry.get("last_name") or "").strip()
            full = f"{first} {last}".strip()
            return full if first or last else None

        # Prefer owner/director/ceo seniority
        priority_titles = {"owner", "founder", "ceo", "director", "managing director", "president"}
        for entry in emails:
            pos = (entry.get("position") or "").lower()
            if any(t in pos for t in priority_titles):
                return entry.get("value"), _entry_name(entry)
        # Fall back to first personal email
        for entry in emails:
            email = entry.get("value", "")
            if email and entry.get("type") == "personal":
                return email, _entry_name(entry)
        if emails:
            return emails[0].get("value"), _entry_name(emails[0])
    except Exception:
        pass
    return None, None


class OpenAIService:
    """Service for extraction and email generation with local scraping + optional fallback enrichment."""

    @staticmethod
    async def extract_company_data(
        company_name: str,
        website: str,
        business_type: str = "independent",
        location: str = "",
    ) -> Dict[str, Any]:
        if business_type == "franchise":
            return await OpenAIService._extract_franchise_data(
                company_name=company_name,
                website=website,
                location=location,
            )
        return await OpenAIService._extract_independent_data(
            company_name=company_name,
            website=website,
            location=location,
        )

    # ── Independent / Small Business pipeline ────────────────────────────────
    # Step 1: Scrape website  (existing pipeline)
    # Step 2: SOS registry lookup  (find owner name if website didn't have it)
    # Step 3: Hunter.io fallback  (find personal email when name is known)
    # Step 4: Web search (Google CSE / DDG) for anything still missing
    # Step 5: Claude constructs final structured result

    @staticmethod
    async def _extract_independent_data(
        company_name: str,
        website: str,
        location: str = "",
    ) -> Dict[str, Any]:
        domain = _urlparse(website).netloc.lstrip("www.") or website

        # ── Step 1: Website scrape ────────────────────────────────────────────
        local_data = LocalScraperService.scrape_company_website(website)
        base_result = OpenAIService._seed_from_local_data(local_data)
        base_result["research_source"] = "local_only"
        base_result["research_note"] = (
            f"Scraped {len(local_data.pages_scraped)} page(s) from the company website"
            if local_data.pages_scraped
            else "No website pages could be scraped"
        )
        base_result["local_pages_scraped"] = len(local_data.pages_scraped)
        base_result["used_perplexity"] = False

        # Seed name directly from Python-extracted names (bypasses Claude hallucination)
        if local_data.person_names:
            base_result["_scraped_names_hint"] = local_data.person_names
            _PLACEHOLDERS = {"unknown", "n/a", "not found", "none", "-", ""}
            if not base_result.get("ceo_name") or base_result["ceo_name"].lower().strip() in _PLACEHOLDERS:
                base_result["ceo_name"] = local_data.person_names[0]

        local_context = local_data.to_context()
        if not local_context:
            local_context = "No website content could be scraped from the provided website."

        extracted = OpenAIService._extract_structured_data_from_context(
            company_name=company_name,
            website=website,
            context=local_context,
            source_label="company website",
        )
        result = OpenAIService._merge_data(base_result, extracted)

        # ── Step 2: SOS registry lookup ───────────────────────────────────────
        sos_context_lines: list[str] = []
        sos_result = lookup_owner_from_sos(company_name, location)
        if sos_result:
            owner = sos_result.best_owner_name()
            if owner:
                sos_context_lines.append(f"Registered owner/agent (from {sos_result.state} SOS): {owner}")
                _PLACEHOLDERS = {"unknown", "n/a", "not found", "none", "-", ""}
                if not result.get("ceo_name") or result["ceo_name"].lower().strip() in _PLACEHOLDERS:
                    result["ceo_name"] = owner
            if sos_result.principal_office:
                sos_context_lines.append(f"Registered address: {sos_result.principal_office}")
                if not result.get("address"):
                    result["address"] = sos_result.principal_office

        # ── Step 3: Hunter.io — find personal email when we know the name ─────
        from app.services.scraper_service import _email_score

        def _run_hunter(name: str, current_email: str) -> "tuple[Optional[str], Optional[str]]":
            """Try Hunter.io email-finder then domain-search.
            Returns (email, name_from_hunter_or_None).
            name_from_hunter is set only when domain-search found a different person.

            Credit-saving rules:
            - Skip entirely if we already have a PERSONAL email from the website (score ≥ 10).
            - Skip domain-search if the scraped site shows no signals of personal emails
              (no personal emails on site, no named staff, small site) — these are
              solo/micro businesses that Hunter almost certainly hasn't indexed.
              email-finder is still tried whenever we have a named person.
            """
            has_personal_email = bool(current_email) and "(guessed)" not in current_email and _email_score(current_email) >= 10
            if has_personal_email:
                return None, None  # already have a confirmed personal email

            # 1. email-finder — looks up a specific person by name (1 credit)
            if name and domain:
                found = _hunter_find_email(name, domain)
                if found:
                    return found, None  # same person, no name update needed

            # 2. domain-search — skip for micro businesses that Hunter hasn't indexed
            if domain and _worth_domain_searching(local_data):
                found_email, found_name = _hunter_domain_search(domain, company_name)
                if found_email:
                    return found_email, found_name
            return None, None

        hunter_email, hunter_name = _run_hunter(result.get("ceo_name", ""), result.get("ceo_email", ""))
        if hunter_email:
            result["ceo_email"] = hunter_email
            # If domain-search returned a name that differs from what we have,
            # use it — it's more reliable than a blank/garbage name
            if hunter_name and not result.get("ceo_name"):
                result["ceo_name"] = hunter_name
            elif hunter_name and result.get("ceo_name") != hunter_name:
                # Keep our existing name only if it came from SOS (more authoritative)
                # If we only have it from the website scrape and it doesn't match
                # the Hunter email owner, replace it to avoid name/email mismatch
                if not sos_result or not sos_result.best_owner_name():
                    result["ceo_name"] = hunter_name
            sos_context_lines.append(f"Email found via Hunter.io: {hunter_email}")

        # ── Step 4: Web search fallback if still missing data ─────────────────
        if OpenAIService._needs_perplexity_fallback(result):
            extra_context = "\n".join(sos_context_lines) if sos_context_lines else ""
            pplx_context = OpenAIService._fetch_web_context(company_name, website, local_context)
            combined = local_context
            if extra_context:
                combined += f"\n\nSOS REGISTRY DATA:\n{extra_context}"
            if pplx_context:
                combined += f"\n\nWEB SEARCH FINDINGS:\n{pplx_context}"
                result["used_perplexity"] = True

            if pplx_context or extra_context:
                enriched = OpenAIService._extract_structured_data_from_context(
                    company_name=company_name,
                    website=website,
                    context=combined,
                    source_label="website + SOS registry + web sources",
                )
                result = OpenAIService._merge_data(result, enriched)

                # ── Step 4b: Re-run Hunter.io if Claude found a new name ──────
                # Claude may have extracted a name from web search snippets that
                # we didn't have before — try Hunter.io again with that name.
                new_name = result.get("ceo_name", "")
                if new_name and not hunter_email:
                    hunter_email2, hunter_name2 = _run_hunter(new_name, result.get("ceo_email", ""))
                    if hunter_email2:
                        result["ceo_email"] = hunter_email2
                        if hunter_name2 and not result.get("ceo_name"):
                            result["ceo_name"] = hunter_name2
                        hunter_email = hunter_email2

                result["research_source"] = "local_plus_sos_plus_web"
                result["research_note"] = (
                    f"Scraped {len(local_data.pages_scraped)} page(s); "
                    f"SOS {'found owner' if sos_result else 'no match'}; "
                    f"Hunter {'✓' if hunter_email else '–'}; "
                    f"web search {'used' if pplx_context else 'skipped'}"
                )
        elif sos_context_lines:
            result["research_source"] = "local_plus_sos"
            result["research_note"] = (
                f"Scraped {len(local_data.pages_scraped)} page(s); SOS registry used"
            )

        # ── Step 5: Last-resort email construction (only if all APIs failed) ──
        # Only construct a guessed email if Hunter.io found nothing AND we have a name.
        final_email = result.get("ceo_email", "")
        final_name = result.get("ceo_name", "")
        has_real_email = bool(final_email) and "(guessed)" not in final_email and _email_score(final_email) > 0
        if final_name and not has_real_email and domain:
            parts = final_name.strip().split()
            if len(parts) >= 2:
                first, last = parts[0].lower(), parts[-1].lower()
                result["ceo_email"] = f"{first}.{last}@{domain} (guessed)"

        return OpenAIService._normalize_result(result)

    # ── Franchise / Corporate-chain pipeline ──────────────────────────────────
    # Step 1: SOS registry  → local franchisee LLC owner name
    # Step 2: Hunter.io     → find corporate/personal email for that owner
    # Step 3: Web search    → fill in company info, news, projects
    # Step 4: Claude        → structured extraction

    @staticmethod
    async def _extract_franchise_data(
        company_name: str,
        website: str,
        location: str = "",
    ) -> Dict[str, Any]:
        domain = _urlparse(website).netloc.lstrip("www.") or website

        result: Dict[str, Any] = {
            "ceo_name": "",
            "ceo_email": "",
            "cto_name": "",
            "cto_email": "",
            "cfo_name": "",
            "cfo_email": "",
            "phone": "",
            "landline": "",
            "company_info": "",
            "projects": "",
            "news": "",
            "address": "",
            "research_source": "franchise_sos",
            "research_note": "",
            "local_pages_scraped": 0,
            "used_perplexity": False,
        }

        context_lines: list[str] = []

        # ── Step 1: SOS registry ──────────────────────────────────────────────
        sos_result = lookup_owner_from_sos(company_name, location)
        hunter_email = None
        if sos_result:
            owner = sos_result.best_owner_name()
            if owner:
                result["ceo_name"] = owner
                context_lines.append(f"Registered owner/agent (from {sos_result.state} SOS): {owner}")
            if sos_result.principal_office:
                result["address"] = sos_result.principal_office
                context_lines.append(f"Registered address: {sos_result.principal_office}")
            if sos_result.entity_type:
                context_lines.append(f"Entity type: {sos_result.entity_type}")
            if sos_result.status:
                context_lines.append(f"Entity status: {sos_result.status}")
            result["research_note"] = f"SOS registry ({sos_result.state})"

        # ── Step 2: Hunter.io — email for the franchisee owner ────────────────
        owner_name = result.get("ceo_name", "")
        hunter_name = None
        if owner_name and domain:
            # Try finding the owner's email at the franchise domain
            hunter_email = _hunter_find_email(owner_name, domain)
        if not hunter_email and domain:
            hunter_email, hunter_name = _hunter_domain_search(domain, company_name)
        if hunter_email:
            result["ceo_email"] = hunter_email
            # Sync name from Hunter.io if we have no name yet
            if hunter_name and not result.get("ceo_name"):
                result["ceo_name"] = hunter_name
            context_lines.append(f"Email found via Hunter.io: {hunter_email}")

        # ── Step 3: Web search for company info / news ────────────────────────
        sos_context = "\n".join(context_lines)
        web_context = OpenAIService._fetch_web_context(company_name, website, sos_context)
        combined_context = sos_context
        if web_context:
            combined_context = (
                f"{sos_context}\n\nWEB SEARCH FINDINGS:\n{web_context}"
                if sos_context else web_context
            )
            result["used_perplexity"] = True

        if not combined_context:
            combined_context = f"Franchise location: {company_name}. No data found."

        # ── Step 4: Claude extraction ─────────────────────────────────────────
        extracted = OpenAIService._extract_structured_data_from_context(
            company_name=company_name,
            website=website,
            context=combined_context,
            source_label="SOS registry + Hunter.io + web sources",
        )
        result = OpenAIService._merge_data(result, extracted)

        # ── Step 4b: Post-Claude Hunter.io — re-try with name Claude found ───
        from app.services.scraper_service import _email_score

        def _run_hunter_franchise(name: str, current_email: str) -> "tuple[Optional[str], Optional[str]]":
            has_personal = bool(current_email) and "(guessed)" not in current_email and _email_score(current_email) >= 10
            if has_personal:
                return None, None
            if name and domain:
                found = _hunter_find_email(name, domain)
                if found:
                    return found, None
            # For franchises we always try domain-search (franchise locations have staff)
            if domain:
                return _hunter_domain_search(domain, company_name)
            return None, None

        new_name = result.get("ceo_name", "")
        if new_name and not hunter_email:
            hunter_email2, hunter_name2 = _run_hunter_franchise(new_name, result.get("ceo_email", ""))
            if hunter_email2:
                result["ceo_email"] = hunter_email2
                if hunter_name2 and not result.get("ceo_name"):
                    result["ceo_name"] = hunter_name2
                hunter_email = hunter_email2

        # ── Step 5: Last-resort guessed email (only if all APIs failed) ───────
        final_email = result.get("ceo_email", "")
        final_name = result.get("ceo_name", "")
        has_real_email = bool(final_email) and "(guessed)" not in final_email and _email_score(final_email) > 0
        if final_name and not has_real_email and domain:
            parts = final_name.strip().split()
            if len(parts) >= 2:
                first, last = parts[0].lower(), parts[-1].lower()
                result["ceo_email"] = f"{first}.{last}@{domain} (guessed)"

        result["research_source"] = "franchise_sos_hunter_web"
        result["research_note"] = (
            f"Franchise: SOS {'✓ ' + sos_result.state if sos_result else '–'}; "
            f"Hunter {'✓' if hunter_email else '–'}; "
            f"web search {'used' if web_context else 'skipped'}"
        )
        return OpenAIService._normalize_result(result)

    @staticmethod
    async def generate_email_template(
        company_name: str,
        ceo_name: str,
        company_info: str,
        projects: str,
        news: str,
    ) -> Dict[str, str]:
        my_company_info = {
            "name": settings.MY_COMPANY_NAME,
            "services": settings.MY_COMPANY_SERVICES,
            "value_prop": settings.MY_COMPANY_VALUE_PROP,
            "portfolio": settings.MY_COMPANY_PORTFOLIO,
            "website": settings.MY_COMPANY_WEBSITE,
            "contact": settings.MY_COMPANY_CONTACT,
        }

        prompt = f"""
You are an expert B2B email copywriter. Create a personalized cold outreach email.

TARGET COMPANY:
- Company: {company_name}
- CEO: {ceo_name}
- About: {company_info}
- Recent Projects: {projects}
- Recent News: {news}

MY COMPANY:
- Name: {my_company_info['name']}
- Services: {my_company_info['services']}
- Value Proposition: {my_company_info['value_prop']}
- Portfolio Highlights:
{my_company_info['portfolio']}
- Website: {my_company_info['website']}
- Contact: {my_company_info['contact']}

EMAIL REQUIREMENTS:
1. Professional, personalized tone
2. Reference specific projects/news when available
3. Keep concise (150-200 words max)
4. Strong call-to-action
5. Address CEO by first name

Return ONLY a JSON object:
{{
  "subject": "Compelling personalized subject (under 60 chars)",
  "body": "Full email body"
}}
"""

        try:
            if not _client:
                raise ValueError("ANTHROPIC_API_KEY is not configured")

            response = _client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                system="You are an expert B2B email copywriter. Return only valid JSON.",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.8,
                max_tokens=1500,
            )
            content = response.content[0].text.strip()
            payload = OpenAIService._parse_json(content)
            if payload.get("subject") and payload.get("body"):
                return {"subject": payload["subject"], "body": payload["body"]}
            raise ValueError("Missing subject/body in generated response")
        except Exception:
            return OpenAIService._get_default_email_template(ceo_name, company_name, my_company_info)

    @staticmethod
    async def personalise_from_campaign_template(
        subject_template: str,
        body_template: str,
        company_name: str,
        owner_name: str,
        address: str,
        niche: str,
        location: str,
        company_info: str,
        projects: str,
        news: str,
    ) -> Dict[str, str]:
        """
        Use the campaign template as style/structure guide and AI-personalise it
        using the scraped company data.  Returns {"subject": ..., "body": ...}.
        """
        my_info = {
            "name": settings.MY_COMPANY_NAME,
            "services": settings.MY_COMPANY_SERVICES,
            "value_prop": settings.MY_COMPANY_VALUE_PROP,
            "portfolio": settings.MY_COMPANY_PORTFOLIO,
            "website": settings.MY_COMPANY_WEBSITE,
            "contact": settings.MY_COMPANY_CONTACT,
        }

        prompt = f"""You are an expert B2B email copywriter personalising a cold outreach email.

CAMPAIGN TEMPLATE (use this as your style and structural guide — do NOT copy it verbatim):
Subject template: {subject_template}
Body template:
{body_template}

TARGET COMPANY:
- Name: {company_name}
- Owner / Key Contact: {owner_name or 'unknown'}
- Address: {address or 'unknown'}
- Niche: {niche or 'unknown'}
- Location: {location or 'unknown'}
- About: {company_info or 'N/A'}
- Recent projects: {projects or 'N/A'}
- Recent news: {news or 'N/A'}

OUR COMPANY:
- Name: {my_info['name']}
- Services: {my_info['services']}
- Value proposition: {my_info['value_prop']}
- Portfolio highlights: {my_info['portfolio']}
- Website: {my_info['website']}
- Contact: {my_info['contact']}

INSTRUCTIONS:
1. Personalise the email specifically for {company_name}.
2. Keep the tone and structure of the template but insert real details about the target company.
3. Replace any placeholder tokens like {{{{company_name}}}}, {{{{owner_name}}}}, etc.
4. Keep the body concise (150-200 words).
5. Return ONLY valid JSON — no prose, no markdown fences.

Return format:
{{
  "subject": "Personalised subject line (under 60 chars)",
  "body": "Full personalised email body"
}}"""

        try:
            if not _client:
                raise ValueError("ANTHROPIC_API_KEY is not configured")
            response = _client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                system="You are an expert B2B email copywriter. Return only valid JSON.",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.75,
                max_tokens=1500,
            )
            content = response.content[0].text.strip()
            payload = OpenAIService._parse_json(content)
            if payload.get("subject") and payload.get("body"):
                return {"subject": payload["subject"], "body": payload["body"]}
            raise ValueError("Missing subject/body in AI response")
        except Exception:
            # Fallback: do a simple string substitution on the template
            subject = (
                subject_template
                .replace("{{company_name}}", company_name)
                .replace("{{owner_name}}", owner_name or "")
                .replace("{{niche}}", niche or "")
                .replace("{{location}}", location or "")
                .replace("{{address}}", address or "")
            )
            body = (
                body_template
                .replace("{{company_name}}", company_name)
                .replace("{{owner_name}}", owner_name or "")
                .replace("{{niche}}", niche or "")
                .replace("{{location}}", location or "")
                .replace("{{address}}", address or "")
            )
            return {"subject": subject, "body": body}

    @staticmethod
    def _extract_structured_data_from_context(
        company_name: str,
        website: str,
        context: str,
        source_label: str,
    ) -> Dict[str, Any]:
        if not _client:
            return {}

        # Extract domain for email guessing
        from urllib.parse import urlparse as _urlparse
        domain = _urlparse(website).netloc.lstrip("www.") or website

        prompt = f"""
You are a B2B contact intelligence analyst. Extract contact details for {company_name} ({website}).

DATA SOURCE: {source_label}
CONTENT:
{context}

Your PRIMARY goal is to find the OWNER, FOUNDER, MANAGING DIRECTOR, or CEO name and their PERSONAL email.

━━━ EMAIL PRIORITY ORDER ━━━
ALWAYS prefer a PERSONAL email address for the contact. Use this strict priority:

1. PERSONAL email found in content: firstname@domain.com, john.smith@domain.com, jsmith@domain.com,
   dr.jones@domain.com — any email where the local part is a person's name or initials.
2. ROLE email found in content: owner@domain.com, director@domain.com, md@domain.com — acceptable.
3. If no personal email is explicitly found, use the best generic email available (info@, contact@).
   DO NOT construct or guess emails — the system will try Hunter.io separately after you respond.
4. If no email at all is found in the content, leave ceo_email as an empty string "".

━━━ NAME EXTRACTION ━━━
- Check About Us, Team, Meet the Team, Leadership, Contact pages.
- For small businesses the owner is often mentioned by first name ("John has run this clinic since 2010").
- For veterinary practices: the veterinarian (Dr. [Name], DVM) IS the owner/operator — extract their name.
- For solo practitioners (dentist, lawyer, vet, consultant), the practitioner IS the owner.
- Look for patterns like "Dr. Jane Smith", "Founded by John", "Owner: Mary Jones", "Meet our team".
- DO NOT leave ceo_name blank if any owner/manager/founder/practitioner name appears ANYWHERE.
- IGNORE navigation/UI text such as "Skip to Content", "Skip Navigation", "Menu", "Home",
  "About Us", "Contact Us", "Learn More", "Get Started" — these are NOT person names.

━━━ RULES ━━━
- ceo_name: NEVER blank if a real person name appears in the content. NEVER use UI/nav text as a name.
- ceo_email: NEVER a generic info@/contact@/hello@ if a name is known — construct personal instead.
- If truly no name and no personal email found: use info@{domain} and mark ceo_name as "Unknown".
- Return ONLY valid JSON, no prose:

{{
  "ceo_name": "Full name of owner/founder/managing director",
  "ceo_email": "personal email (or constructed with suffix ' (guessed)' or ' (inferred)')",
  "cto_name": "",
  "cto_email": "",
  "cfo_name": "",
  "cfo_email": "",
  "phone": "best phone number",
  "landline": "secondary phone if any",
  "address": "full physical address if found",
  "company_info": "2-3 sentence company description",
  "projects": "bullet points of services or notable work",
  "news": "recent news or announcements if any"
}}
"""

        try:
            response = _client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                system="You are a strict data extraction engine. Output valid JSON only.",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=settings.ANTHROPIC_MAX_TOKENS,
            )
            content = response.content[0].text.strip()
            return OpenAIService._parse_json(content)
        except Exception:
            return {}

    @staticmethod
    def _fetch_web_context(company_name: str, website: str, local_context: str) -> str:
        """Search Google CSE (primary) and DuckDuckGo (fallback) for owner/contact info."""
        import time as _time
        from urllib.parse import urlparse as _urlparse
        import requests as _requests
        domain = _urlparse(website).netloc.lstrip("www.") or ""

        snippets: list[str] = []

        # ── Source 1: Google CSE (free, reliable, no rate-limit issues) ────────
        if settings.GOOGLE_CSE_API_KEY and settings.GOOGLE_CSE_CX:
            google_queries = [
                f'"{company_name}" owner OR founder OR CEO OR director',
                f'"{company_name}" email contact',
                f'site:{domain} about OR team OR contact OR staff',
            ]
            _GOOGLE_URL = "https://www.googleapis.com/customsearch/v1"
            for gq in google_queries:
                try:
                    params = {
                        "key": settings.GOOGLE_CSE_API_KEY,
                        "cx": settings.GOOGLE_CSE_CX,
                        "q": gq,
                        "num": 5,
                    }
                    resp = _requests.get(_GOOGLE_URL, params=params, timeout=10)
                    resp.raise_for_status()
                    for item in resp.json().get("items", []):
                        url = item.get("link", "")
                        title = item.get("title", "")
                        snippet = item.get("snippet", "")
                        if url and title:
                            snippets.append(
                                f"Title: {title}\nURL: {url}\nSnippet: {snippet}"
                            )
                except Exception:
                    pass

        # ── Source 2: DuckDuckGo Lite HTML scraping (avoids API rate limits) ──
        if len(snippets) < 3:
            ddg_queries = [
                f'"{company_name}" owner OR founder OR veterinarian OR doctor OR manager',
                f'"{company_name}" about staff team contact email',
                f'{company_name} {domain.split(".")[0]} owner contact',
            ]
            from bs4 import BeautifulSoup as _BS4
            for query in ddg_queries:
                try:
                    resp = _requests.post(
                        "https://lite.duckduckgo.com/lite/",
                        data={"q": query},
                        headers={
                            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Accept": "text/html,application/xhtml+xml",
                            "Referer": "https://lite.duckduckgo.com/",
                        },
                        timeout=15,
                    )
                    resp.raise_for_status()
                    soup = _BS4(resp.text, "lxml")
                    links = soup.find_all("a", class_="result-link")
                    snippet_tds = soup.find_all("td", class_="result-snippet")
                    for i, a in enumerate(links[:5]):
                        title = a.get_text(strip=True)
                        url = a.get("href", "")
                        snippet = snippet_tds[i].get_text(strip=True) if i < len(snippet_tds) else ""
                        if title and url:
                            snippets.append(f"Title: {title}\nURL: {url}\nSnippet: {snippet}")
                    _time.sleep(1)
                except Exception:
                    pass

        return "\n\n---\n\n".join(snippets)

    @staticmethod
    def _seed_from_local_data(local_data: ScrapedWebsiteData) -> Dict[str, Any]:
        seeded = OpenAIService._get_empty_company_data()
        if local_data.phones:
            seeded["phone"] = local_data.phones[0]
            if len(local_data.phones) > 1:
                seeded["landline"] = local_data.phones[1]

        leadership_emails = [
            item
            for item in local_data.emails
            if any(marker in item.lower() for marker in ["ceo", "cto", "cfo", "founder", "director"])
        ]
        if leadership_emails:
            seeded["ceo_email"] = leadership_emails[0]
        elif local_data.emails:
            seeded["ceo_email"] = local_data.emails[0]

        if local_data.text_snippets:
            seeded["company_info"] = local_data.text_snippets[0][:500]
        return seeded

    @staticmethod
    def _needs_perplexity_fallback(result: Dict[str, Any]) -> bool:
        from app.services.scraper_service import _email_score
        _PLACEHOLDER_NAMES = {"unknown", "n/a", "not found", "none", "-", ""}
        # Treat "Unknown" and similar placeholders as missing
        def _is_real_name(v: str) -> bool:
            return bool(v) and v.lower().strip() not in _PLACEHOLDER_NAMES and len(v.strip()) > 2

        missing_name = not any(
            _is_real_name(result.get(k, ""))
            for k in ["ceo_name", "cto_name", "cfo_name"]
        )
        # Check if we only have generic emails (score == 0) — treat as "missing"
        emails = [
            result.get("ceo_email", ""), result.get("cto_email", ""), result.get("cfo_email", "")
        ]
        has_personal_email = any(
            e and not e.endswith("(inferred)") and not e.endswith("(guessed)") and _email_score(e) > 0
            for e in emails
        )
        # Trigger fallback if name OR personal email is missing
        return missing_name or not has_personal_email

    @staticmethod
    def _merge_data(primary: Dict[str, Any], secondary: Dict[str, Any]) -> Dict[str, Any]:
        """Merge secondary into primary. Secondary can upgrade placeholder/generic values."""
        from app.services.scraper_service import _email_score
        _PLACEHOLDER_NAMES = {"unknown", "n/a", "not found", "none", "-", ""}

        def _is_placeholder_name(v: str) -> bool:
            return not v or v.lower().strip() in _PLACEHOLDER_NAMES

        def _is_generic_email(v: str) -> bool:
            return not v or (not v.endswith("(guessed)") and not v.endswith("(inferred)") and _email_score(v) == 0)

        merged = dict(primary)
        for key, value in secondary.items():
            if not value:
                continue
            existing = merged.get(key, "")
            if not existing:
                # Fill any empty field
                merged[key] = value
            elif key in ("ceo_name", "cto_name", "cfo_name") and _is_placeholder_name(str(existing)):
                # Overwrite placeholder names like "Unknown"
                merged[key] = value
            elif key in ("ceo_email", "cto_email", "cfo_email") and _is_generic_email(str(existing)):
                # Overwrite generic emails (info@, contact@) with personal ones
                if _email_score(str(value)) > _email_score(str(existing)):
                    merged[key] = value
        return merged

    @staticmethod
    def _parse_json(content: str) -> Dict[str, Any]:
        json_start = content.find("{")
        json_end = content.rfind("}") + 1
        if json_start == -1 or json_end <= json_start:
            raise ValueError("No valid JSON payload found")
        return json.loads(content[json_start:json_end])

    # UI/navigation strings that Claude might misidentify as person names
    _NAME_BLOCKLIST = frozenset({
        "skip to content", "skip to main content", "skip navigation",
        "skip to main", "skip nav", "jump to content",
        "register your business", "register a business",
        "search results", "entity detail", "entity details",
        "principal office", "resident agent", "registered agent",
        "good standing", "entity name", "entity type",
        "click here", "get started", "learn more", "sign in", "log in",
        "privacy policy", "terms of service", "contact us",
        "menu", "close menu", "open menu", "main menu", "navigation",
        "home", "about", "about us", "our team", "our story",
        "unknown", "n/a", "not found", "none", "-",
    })

    @staticmethod
    def _is_garbage_name(name: str) -> bool:
        """Return True if the extracted name is clearly UI text, a placeholder, or garbage."""
        if not name or not name.strip():
            return True
        n = name.strip().lower()
        if n in OpenAIService._NAME_BLOCKLIST:
            return True
        # Reject strings that start with common CTA verbs
        cta_starters = ("skip ", "register ", "click ", "view ", "print ",
                        "search ", "return ", "submit ", "sign ", "log ",
                        "download ", "upload ", "read more", "learn more")
        if any(n.startswith(v) for v in cta_starters):
            return True
        # Reject purely numeric or very short strings
        if len(name.strip()) <= 2:
            return True
        # Reject names containing prepositions, articles, or business-type words
        # e.g., "Hospital In Baltimore", "Pet Care Center", "Animal Clinic"
        _stop = frozenset({
            "in", "at", "of", "the", "and", "or", "for", "to", "a", "an", "by",
            "is", "are", "was", "from", "with", "on", "near", "hospital", "clinic",
            "veterinary", "animal", "pet", "care", "center", "centre", "dental",
            "medical", "health", "resort", "city", "town", "county", "baltimore",
            "maryland", "virginia", "washington",
        })
        if any(p.lower() in _stop for p in name.strip().split()):
            return True
        return False

    @staticmethod
    def _normalize_result(data: Dict[str, Any]) -> Dict[str, str]:
        required_keys = [
            "ceo_name",
            "ceo_email",
            "cto_name",
            "cto_email",
            "cfo_name",
            "cfo_email",
            "phone",
            "landline",
            "address",
            "company_info",
            "projects",
            "news",
        ]
        normalized = OpenAIService._get_empty_company_data()
        for key in required_keys:
            value = data.get(key, "")
            normalized[key] = str(value).strip() if value is not None else ""
        # Sanitize name fields — strip parenthetical suffixes, then reject garbage
        import re as _re
        _name_to_email = {"ceo_name": "ceo_email", "cto_name": "cto_email", "cfo_name": "cfo_email"}
        for name_key, email_key in _name_to_email.items():
            val = normalized.get(name_key, "")
            if val:
                # Strip suffixes like "(guessed)", "(inferred)" from names
                val = _re.sub(r'\s*\([^)]+\)\s*$', '', val).strip()
                normalized[name_key] = val
            if OpenAIService._is_garbage_name(normalized.get(name_key, "")):
                normalized[name_key] = ""
                # If the email was constructed from this garbage name (guessed/inferred), clear it too
                paired_email = normalized.get(email_key, "")
                if paired_email and ("(guessed)" in paired_email or "(inferred)" in paired_email):
                    normalized[email_key] = ""
        normalized["research_source"] = str(data.get("research_source", "local_only")).strip()
        normalized["research_note"] = str(data.get("research_note", "")).strip()
        normalized["local_pages_scraped"] = int(data.get("local_pages_scraped", 0) or 0)
        normalized["used_perplexity"] = bool(data.get("used_perplexity", False))
        return normalized

    @staticmethod
    def _get_empty_company_data() -> Dict[str, str]:
        return {
            "ceo_name": "",
            "ceo_email": "",
            "cto_name": "",
            "cto_email": "",
            "cfo_name": "",
            "cfo_email": "",
            "phone": "",
            "landline": "",
            "address": "",
            "company_info": "",
            "projects": "",
            "news": "",
        }

    @staticmethod
    def _get_default_email_template(
        ceo_name: str,
        company_name: str,
        my_company_info: Dict[str, str],
    ) -> Dict[str, str]:
        first_name = ceo_name.split()[0] if ceo_name else "there"
        return {
            "subject": f"AI Solutions for {company_name}",
            "body": f"""Hi {first_name},

I've been following {company_name} and I'm impressed with your work in the industry.

At {my_company_info['name']}, we specialize in {my_company_info['services'].lower()}.

{my_company_info['value_prop']}

I'd love to share how we've helped similar companies and explore if there's a fit for {company_name}.

Would you be open to a brief 15-minute call next week?

Best regards,
{my_company_info['contact']}
{my_company_info['website']}
""",
        }
