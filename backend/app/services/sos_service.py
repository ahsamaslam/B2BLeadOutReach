"""
Secretary of State (SOS) business registry scraper.

Queries public state business registries to find the registered agent / owner
name for a given business.  This data is freely available public record and is
especially useful for:
  - Franchise locations  (find the local LLC owner, not the corporate brand)
  - Small businesses that don't list owner names on their website
  - Any company whose website is blocked / JS-rendered

Supported states (extend as needed):
  - Maryland  (SDAT — Maryland Business Express)
  - Virginia  (SCC — Clerk's Information System)

Maryland scraper strategy (three-tier):
  1. DDG HTML search → find pre-indexed SDAT entity detail URL → fetch directly
     (detail pages need no CAPTCHA or JS; only the search *form* has Turnstile)
  1.5. Bing search → same approach as DDG but Bing is far more lenient from server
     IPs. Used as fallback when DDG rate-limits the Docker container IP.
  2. CapSolver + requests fallback when both search engines fail or entity is
     not indexed. CapSolver remotely solves the Cloudflare Turnstile (~5-10 s,
     ~$0.001/solve), we POST the search form directly with requests (no browser
     overhead), parse the result page, then fetch the entity detail page.
"""

import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Optional

import requests
from bs4 import BeautifulSoup

# Playwright is imported lazily inside functions so the module still loads
# if browsers are not installed (e.g., during unit tests).

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


@dataclass
class SOSResult:
    owner_name: Optional[str] = None          # Registered agent / principal / owner
    registered_agent: Optional[str] = None   # Registered agent (may differ from owner)
    principal_office: Optional[str] = None   # Principal office address
    entity_type: Optional[str] = None        # LLC, Corp, etc.
    status: Optional[str] = None             # Active, Forfeited, etc.
    state: Optional[str] = None              # Which state registry
    source_url: Optional[str] = None
    raw_names: list[str] = field(default_factory=list)  # All names found

    def best_owner_name(self) -> Optional[str]:
        """Return the most likely owner name from available data."""
        # Prefer a real person name over company names
        for name in self.raw_names:
            if name and _looks_like_person(name):
                return name
        # Fall back to registered agent only if it looks like a person
        if self.registered_agent and _looks_like_person(self.registered_agent):
            return self.registered_agent
        # Fall back to owner_name if it looks like a person
        if self.owner_name and _looks_like_person(self.owner_name):
            return self.owner_name
        # Nothing found that looks like a real person name — return None rather than garbage
        return None


def _looks_like_person(name: str) -> bool:
    """Heuristic: is this a person name rather than a company name?"""
    name = name.strip()
    if not name:
        return False

    # Block-list of SOS page UI strings, headings, and CTAs that look like names
    _SOS_UI_NOISE = {
        "skip to content", "skip to main", "skip to navigation", "skip navigation",
        "skip to main content", "skip content", "go to content",
        "register your business", "register a business", "register business",
        "search results", "entity detail", "entity details", "entity information",
        "principal office", "resident agent", "registered agent", "registered agents",
        "good standing", "entity name", "entity type", "forfeiture date",
        "click here", "get started", "learn more", "sign in", "log in",
        "privacy policy", "terms of service", "contact us", "help center",
        "business express", "maryland sdat", "annual report", "return results",
        "no results", "personal property", "trade name", "department of assessments",
        "go back", "back to results", "print page", "save record",
        "notice close", "close notice", "alert close", "close alert",
        "help translate", "translate log", "help log",
    }
    if name.lower().strip() in _SOS_UI_NOISE:
        return False

    # Reject if any individual word is a known UI/nav/button word —
    # real person names never contain these words
    _UI_WORDS = {
        "skip", "content", "notice", "close", "alert", "modal", "dialog",
        "translate", "help", "menu", "navigation", "log", "login", "logout",
        "signin", "signout", "print", "save", "submit", "cancel", "dismiss",
        "cookie", "privacy", "policy", "terms", "accept", "decline",
        "search", "back", "next", "previous", "continue", "proceed",
        "register", "click", "view", "download", "upload", "share",
        "select", "choose", "enter", "type", "error", "warning",
        # SDAT page section headings / CTAs
        "establish", "accounts", "comptroller", "order", "documents",
        "filing", "filings", "history", "options", "information",
        "annual", "report", "reports", "expiration", "assessment",
        "assessments", "taxation", "department", "state", "mailing",
        "address", "addresses", "personal", "property",
        # UI pagination / folio elements
        "folio", "pages",
    }
    for word in name.lower().split():
        if word in _UI_WORDS:
            return False

    # Reject strings containing common action verbs at the start (imperative CTAs)
    cta_starters = ("register ", "search ", "click ", "view ", "print ", "save ",
                    "return ", "submit ", "sign ", "log ", "download ", "upload ")
    name_lower = name.lower()
    if any(name_lower.startswith(v) for v in cta_starters):
        return False

    # Company indicators
    company_words = {
        "llc", "inc", "corp", "corporation", "company", "co.", "ltd", "limited",
        "group", "holdings", "partners", "associates", "enterprises", "solutions",
        "services", "management", "properties", "investments", "capital",
        "registered agents", "agent", "national", "northwest",
    }
    for word in company_words:
        if word in name_lower:
            return False
    # Must have at least 2 words (first + last name)
    parts = name.strip().split()
    if len(parts) < 2:
        return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Maryland SOS — SDAT Business Express
# URL: https://egov.maryland.gov/BusinessExpress/EntitySearch
# ─────────────────────────────────────────────────────────────────────────────

_MD_SEARCH_URL = "https://egov.maryland.gov/BusinessExpress/EntitySearch"
_MD_BASE_URL = "https://egov.maryland.gov"

# DDG HTML search endpoint — no VQD token required, simpler rate-limit bucket
_DDG_HTML_URL = "https://html.duckduckgo.com/html/"

# Cloudflare Turnstile siteKey used by the SDAT entity search form.
# Extracted from the iframe URL on the search page:
# challenges.cloudflare.com/.../0x4AAAAAACrspThEZJdPCE9i/...
_SDAT_TURNSTILE_SITEKEY = "0x4AAAAAACrspThEZJdPCE9i"


def _ddg_find_sdat_url(business_name: str, timeout: int = 10) -> Optional[str]:
    """
    Use DuckDuckGo HTML search to find an already-indexed SDAT entity detail URL.

    SDAT entity detail pages are publicly accessible with a direct GET request
    (no CAPTCHA, no JavaScript required).  Google and DDG have them indexed, so
    we can use the search engine as the lookup layer instead of scraping the
    form (which requires solving Cloudflare Turnstile).

    Returns the entity detail URL or None.
    """
    from bs4 import BeautifulSoup as _BS
    import urllib.parse as _up

    query = f'"{business_name}" Maryland site:egov.maryland.gov/BusinessExpress EntityDetail'
    try:
        resp = requests.get(
            _DDG_HTML_URL,
            params={"q": query, "kl": "us-en"},
            headers=_HEADERS,
            timeout=timeout,
        )
        if resp.status_code != 200:
            logger.debug("DDG returned %s for SDAT lookup '%s'", resp.status_code, business_name)
            return None

        soup = _BS(resp.text, "lxml")
        for a in soup.select("a.result__a, a[href]"):
            href = a.get("href", "")
            # DDG HTML wraps real URLs in /l/?uddg=<encoded>
            if "uddg=" in href:
                try:
                    href = _up.unquote(re.search(r"uddg=([^&]+)", href).group(1))
                except Exception:
                    continue
            if "egov.maryland.gov" in href and "EntityDetail" in href:
                return href
        return None
    except Exception as exc:
        logger.debug("DDG SDAT lookup failed for '%s': %s", business_name, exc)
        return None


def _bing_find_sdat_url(business_name: str, timeout: int = 10) -> Optional[str]:
    """
    Use Bing to find an already-indexed SDAT entity detail URL.

    Bing is significantly more lenient than DDG for server-side requests and
    rarely rate-limits Docker/cloud IPs.  Used as fallback when DDG returns 202.

    Returns the entity detail URL or None.
    """
    from bs4 import BeautifulSoup as _BS

    query = f'site:egov.maryland.gov/BusinessExpress/EntitySearch/EntityDetail "{business_name}"'
    try:
        resp = requests.get(
            "https://www.bing.com/search",
            params={"q": query, "count": "5"},
            headers={**_HEADERS, "Accept-Language": "en-US,en;q=0.9"},
            timeout=timeout,
        )
        if resp.status_code != 200:
            logger.debug("Bing returned %s for SDAT lookup '%s'", resp.status_code, business_name)
            return None

        soup = _BS(resp.text, "lxml")
        # Primary: check <a> href inside .b_algo result blocks
        for a in soup.select(".b_algo a"):
            href = a.get("href", "")
            if "egov.maryland.gov" in href and "EntityDetail" in href:
                return href
        # Secondary: scan all links on the page
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "egov.maryland.gov" in href and "EntityDetail" in href:
                return href
        # Tertiary: Bing sometimes renders the real URL only in <cite> text
        for cite in soup.find_all("cite"):
            txt = cite.get_text(strip=True)
            if "egov.maryland.gov" in txt and "EntityDetail" in txt:
                m = re.search(
                    r"(https?://egov\.maryland\.gov[^\s<>\"']+EntityDetail[^\s<>\"']*)", txt
                )
                if m:
                    return m.group(1)
        return None
    except Exception as exc:
        logger.debug("Bing SDAT lookup failed for '%s': %s", business_name, exc)
        return None


def _capsolver_solve_turnstile(site_key: str, page_url: str) -> Optional[str]:
    """
    Use CapSolver to remotely solve a Cloudflare Turnstile challenge.

    CapSolver spins up a real browser on their infrastructure, solves the
    challenge (~5-10 s), and returns a valid cf-turnstile-response token.
    Cost: ~$1 per 1,000 solves (set CAPSOLVER_API_KEY in .env).

    Returns the token string or None if key is missing / solve fails.
    """
    api_key = os.getenv("CAPSOLVER_API_KEY", "").strip()
    if not api_key:
        logger.debug("CAPSOLVER_API_KEY not set — skipping Turnstile solve")
        return None

    try:
        import capsolver  # type: ignore
        capsolver.api_key = api_key
        solution = capsolver.solve({
            "type": "AntiTurnstileTaskProxyLess",
            "websiteURL": page_url,
            "websiteKey": site_key,
        })
        token = solution.get("token")
        if token:
            logger.debug("CapSolver: Turnstile solved for %s", page_url)
        return token
    except Exception as exc:
        logger.warning("CapSolver Turnstile solve failed: %s", exc)
        return None


def _search_maryland_playwright(business_name: str) -> Optional[SOSResult]:
    """Alias kept for backwards compatibility — delegates to _search_maryland_with_capsolver."""
    return _search_maryland_with_capsolver(business_name)


def _search_maryland_with_capsolver(business_name: str, timeout: int = 30) -> Optional[SOSResult]:
    """
    CapSolver fallback: solve the Cloudflare Turnstile, then POST the SDAT
    search form directly with requests (no Playwright browser needed).

    Flow:
      1. GET the SDAT search page → extract ASP.NET session cookies + CSRF token
      2. Call CapSolver to get a valid cf-turnstile-response token
      3. POST the search form (requests, no browser overhead)
      4. Parse the response for the first EntityDetail link
      5. GET the entity detail page and parse it

    Only called when DDG + Bing both fail to find an indexed entity URL.
    Requires CAPSOLVER_API_KEY to be set (~$0.001/solve).
    """
    # Step 1: GET search page to capture cookies + CSRF token
    try:
        session = requests.Session()
        session.headers.update(_HEADERS)
        r = session.get(_MD_SEARCH_URL, timeout=min(timeout, 15))
        r.raise_for_status()
        soup_form = BeautifulSoup(r.text, "lxml")
        csrf_input = soup_form.find("input", {"name": "__RequestVerificationToken"})
        if not csrf_input:
            logger.debug("SDAT: CSRF token not found in search page")
            return None
        csrf_token = csrf_input.get("value", "")
    except Exception as exc:
        logger.warning("SDAT: failed to load search page for '%s': %s", business_name, exc)
        return None

    # Step 2: Get CapSolver Turnstile token
    turnstile_token = _capsolver_solve_turnstile(_SDAT_TURNSTILE_SITEKEY, _MD_SEARCH_URL)
    if not turnstile_token:
        logger.debug("No Turnstile token — CapSolver SDAT fallback skipped for '%s'", business_name)
        return None

    # Step 3: POST the search form
    try:
        post_data = {
            "__RequestVerificationToken": csrf_token,
            "SearchAction": "Search",
            "ReturnUrl": "",
            "CblpLinkId": "0",
            "UserRegistrationId": "0",
            "FilingId": "0",
            "Subheading": "",
            "cf-turnstile-response": turnstile_token,
            "BusinessName": business_name,
            "DepartmentId": "",
            "FEINNumber": "",
            "SearchType": "BusinessName",
        }
        session.headers.update({
            "Referer": _MD_SEARCH_URL,
            "Origin": _MD_BASE_URL,
            "Content-Type": "application/x-www-form-urlencoded",
        })
        r2 = session.post(
            f"{_MD_SEARCH_URL}?searchAction=Search",
            data=post_data,
            timeout=min(timeout, 20),
            allow_redirects=True,
        )
    except Exception as exc:
        logger.warning("SDAT form POST failed for '%s': %s", business_name, exc)
        return None

    # Step 4: Parse response for EntityDetail links
    soup_results = BeautifulSoup(r2.text, "lxml")
    body_text = soup_results.get_text(" ", strip=True)
    if "Unable to verify captcha" in body_text:
        logger.warning("SDAT: Turnstile token rejected by server for '%s' (token may have expired)", business_name)
        return None

    entity_url: Optional[str] = None

    # Try standard EntityDetail href links (DDG/Bing result style)
    entity_hrefs = [
        a["href"] for a in soup_results.find_all("a", href=True)
        if "EntityDetail" in a.get("href", "")
    ]
    if entity_hrefs:
        entity_url = entity_hrefs[0]
        if not entity_url.startswith("http"):
            entity_url = _MD_BASE_URL + entity_url
    else:
        # Results use javascript:GoToBusiness('T00519669', ...) links.
        # Prefer rows with "Active" status; fall back to the first result.
        _go_re = re.compile(r"GoToBusiness\('([^']+)'")
        first_id: Optional[str] = None
        active_id: Optional[str] = None
        for row in soup_results.find_all("tr"):
            row_text = row.get_text(" ", strip=True)
            for a in row.find_all("a", href=_go_re):
                m = _go_re.search(a.get("href", ""))
                if not m:
                    continue
                dept_id = m.group(1)
                if first_id is None:
                    first_id = dept_id
                if "Active" in row_text and active_id is None:
                    active_id = dept_id
        chosen_id = active_id or first_id
        if chosen_id:
            logger.debug("SDAT CapSolver: using GoToBusiness ID %s (active=%s) for '%s'",
                         chosen_id, chosen_id == active_id, business_name)
        else:
            logger.debug("SDAT CapSolver: no GoToBusiness IDs found for '%s'", business_name)

    if not entity_url and not chosen_id:  # type: ignore[possibly-undefined]
        logger.debug("SDAT CapSolver: no EntityDetail links in results for '%s'", business_name)
        return None

    # --- GoToBusiness path: need a second Turnstile solve + POST ---
    # Both the search form and the entity-detail form share the same Turnstile
    # siteKey (0x4AAAAAACrspThEZJdPCE9i), so we reuse _capsolver_solve_turnstile.
    if entity_url is None and chosen_id:  # type: ignore[possibly-undefined]
        token2 = _capsolver_solve_turnstile(_SDAT_TURNSTILE_SITEKEY, _MD_SEARCH_URL)
        if not token2:
            logger.warning("SDAT CapSolver: failed to get 2nd Turnstile token for '%s'", business_name)
            return None
        try:
            r_detail = session.post(
                f"{_MD_BASE_URL}/BusinessExpress/EntitySearch/Business",
                data={
                    "BusinessDepartmentId": chosen_id,
                    "TabToShow": "0",
                    "cf-turnstile-response": token2,
                },
                headers={
                    "Referer": f"{_MD_SEARCH_URL}?searchAction=Search",
                    "Origin": _MD_BASE_URL,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=min(timeout, 20),
                allow_redirects=True,
            )
        except Exception as exc:
            logger.warning("SDAT entity detail POST failed for '%s': %s", business_name, exc)
            return None

        body2 = r_detail.get_text(" ", strip=True) if hasattr(r_detail, 'get_text') else ""
        soup_detail = BeautifulSoup(r_detail.text, "lxml")
        body2 = soup_detail.get_text(" ", strip=True)
        if "Unable to verify captcha" in body2:
            logger.warning("SDAT: 2nd Turnstile token rejected for '%s'", business_name)
            return None
        entity_url = r_detail.url
        logger.debug("SDAT CapSolver: entity detail POST returned %d for '%s' (url=%s)",
                     r_detail.status_code, business_name, entity_url)
        return _parse_maryland_detail(soup_detail, entity_url)

    # Step 5: Fetch and parse entity detail page (DDG/Bing href path)
    try:
        time.sleep(0.3)
        r3 = session.get(entity_url, timeout=min(timeout, 15))
        r3.raise_for_status()
        soup_detail = BeautifulSoup(r3.text, "lxml")
        return _parse_maryland_detail(soup_detail, entity_url)
    except Exception as exc:
        logger.warning("SDAT entity detail fetch failed for '%s': %s", business_name, exc)
        return None


def _search_maryland_playwright(business_name: str) -> Optional[SOSResult]:
    """Alias kept for backwards compatibility — delegates to _search_maryland_with_capsolver."""
    return _search_maryland_with_capsolver(business_name)


def _search_maryland(business_name: str, timeout: int = 15) -> Optional[SOSResult]:
    """
    Search Maryland SDAT for a business and return owner/agent info.

    Three-tier strategy:
      Tier 1  — DDG HTML search (fast, free, ~1 s):
        Find the pre-indexed SDAT entity detail URL on DDG, then fetch it
        directly with requests (no CAPTCHA on detail pages).

      Tier 1.5 — Bing search (fallback when DDG is rate-limited, ~2 s):
        Same approach as DDG but Bing is more lenient from server/cloud IPs.

      Tier 2  — CapSolver + requests (only when search engines fail, ~10-20 s, ~$0.001):
        Call CapSolver to solve the Cloudflare Turnstile, POST the SDAT search
        form with the token via requests (no browser overhead), parse results.
    """
    # ── Tier 1: DDG ──────────────────────────────────────────────────────────
    entity_url = _ddg_find_sdat_url(business_name, timeout=min(timeout, 10))

    # ── Tier 1.5: Bing (fallback when DDG is rate-limited) ───────────────────
    if not entity_url:
        logger.debug("DDG returned nothing for '%s', trying Bing", business_name)
        entity_url = _bing_find_sdat_url(business_name, timeout=min(timeout, 10))
    if entity_url:
        try:
            time.sleep(0.3)
            resp = requests.get(entity_url, headers=_HEADERS, timeout=timeout)
            resp.raise_for_status()
            if "EntityDetail" not in resp.url:
                logger.debug("Maryland SOS: entity URL redirected away for '%s'", business_name)
            else:
                soup = BeautifulSoup(resp.text, "lxml")
                return _parse_maryland_detail(soup, resp.url)
        except Exception as exc:
            logger.warning("Maryland SOS fetch failed for '%s': %s", business_name, exc)

    # ── Tier 2: CapSolver + requests ─────────────────────────────────────────
    return _search_maryland_with_capsolver(business_name, timeout=timeout)



def _parse_maryland_detail(soup: BeautifulSoup, source_url: str) -> SOSResult:
    """Extract owner/agent info from an SDAT entity detail page."""
    result = SOSResult(state="Maryland", source_url=source_url)

    # Strip navigation and chrome before any text extraction
    for tag in soup.find_all(["nav", "header", "footer", "script", "style",
                               "noscript", "iframe", "svg"]):
        tag.decompose()
    # Remove skip-nav links
    for a in soup.find_all("a", href=True):
        if a.get("href", "").startswith("#"):
            a.decompose()

    # ── Primary: fp_formItem divs (SDAT Business Express layout) ─────────────
    # <div class="fp_formItem">
    #   <span class="fp_formItemLabel"><strong>Status:</strong></span>
    #   <span class="fp_formItemData">ACTIVE</span>
    # </div>
    label_to_attr = {
        "status": "status",
        "entity type": "entity_type",
        "owner": "registered_agent",           # Trade Name pages
        "resident agent": "registered_agent",  # Corp/LLC pages
        "registered agent": "registered_agent",
        "resident agent name": "registered_agent",
    }
    for item_div in soup.find_all("div", class_="fp_formItem"):
        label_el = item_div.find(class_="fp_formItemLabel")
        data_el = item_div.find(class_="fp_formItemData")
        if not label_el or not data_el:
            continue
        label_text = label_el.get_text(strip=True).lower().rstrip(":")
        for label_key, attr in label_to_attr.items():
            if label_text == label_key:
                # get_text with separator to preserve line-break boundaries
                val = data_el.get_text(" ", strip=True)
                if val and len(val) > 1 and not getattr(result, attr, None):
                    setattr(result, attr, val)

    # ── Fallback: regex on full-page text ─────────────────────────────────────
    text = soup.get_text(" ", strip=True)
    _label_patterns = [
        (r"(?:Resident Agent|Registered Agent|Resident Agent Name)[:\s]+([A-Z][A-Za-z ,\.&\-]{3,80}?)(?=\s{2,}|\bLocation\b|\bPrincipal\b|\bStatus\b|\bExpir|$)", "registered_agent"),
        (r"\bOwner[:\s]+([A-Z][A-Z0-9 ,\.&\-]{3,120}?)(?=\s{2,}|\bLocation\b|\bStatus\b|\bExpir|$)", "registered_agent"),
        (r"\bStatus[:\s]+([A-Z][A-Za-z ]{2,20})(?=\s|\b)", "status"),
        (r"\bEntity Type[:\s]+([A-Z][A-Za-z ]{3,60})(?=\s{2,}|\b)", "entity_type"),
    ]
    for pattern, attr in _label_patterns:
        if not getattr(result, attr, None):
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                setattr(result, attr, m.group(1).strip())

    # ── Extract person name from the registered_agent / owner blob ────────────
    # SDAT Trade Name format: "EVERVET MARYLAND, LLC JOSEPH LUCERI 1419 CAROLINA PLACE DOWNINGTOWN PA 19935"
    # Person name appears after company suffix, before digits (address start).
    candidate_person: Optional[str] = None
    if result.registered_agent:
        agent_val = result.registered_agent
        # Look for FIRSTNAME [MIDDLE] LASTNAME after LLC/INC/CORP etc.
        # Stop before a digit OR a spelled-out number OR common address keywords.
        m = re.search(
            r"(?:LLC|LLP|INC|CORP|LTD|CO\b|COMPANY|INCORPORATED|LIMITED|PLLC)\s*,?\s+"
            r"([A-Z][A-Z\s]{3,35}?)(?=\s+(?:\d|(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|SUITE|STE|FLOOR|APT|UNIT|PO)\b)|\s*$)",
            agent_val,
        )
        if m:
            candidate = m.group(1).strip().title()
            words = candidate.split()
            # Allow middle initials (1 char) but first and last must be 2+ chars
            if (2 <= len(words) <= 4
                    and len(words[0]) >= 2 and len(words[-1]) >= 2):
                candidate_person = candidate

    # ── Collect person names ───────────────────────────────────────────────────
    noise_exact = {
        "Maryland State", "United States", "Resident Agent", "Registered Agent",
        "General Information", "Good Standing", "Principal Office",
        "Skip To", "Skip Content", "Skip Navigation", "To Content",
        "To Main", "Main Content", "Register Your", "Notice Close",
        "Filing History", "Annual Report", "Trade Name", "Entity Search",
        "Business Search", "Business Express", "Comptroller Order",
        "Establish Tax", "Personal Property", "Expiration Date",
        "General Information", "Filing History", "State Department",
        "Item Date", "Time Filed", "New Search", "Order Documents",
        "More Options", "Mailing Address", "Principal Office",
    }
    noise_contains = ("Skip ", "Content", "Navigation", "Menu",
                      "Register ", "Notice ", "Tax ", "Accounts", "Documents",
                      "Information", "History", "Date", "Filed", "Department")

    names: list[str] = []
    # Title Case names
    for n in re.findall(r"\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b", text):
        if n not in noise_exact and not any(kw in n for kw in noise_contains) and len(n) > 5:
            names.append(n)

    # Prepend the extracted person from company field
    if candidate_person and candidate_person not in noise_exact:
        names.insert(0, candidate_person)

    # Deduplicate
    seen: set[str] = set()
    for n in names:
        if n not in seen:
            seen.add(n)
            result.raw_names.append(n)
        if len(result.raw_names) >= 10:
            break

    if result.registered_agent and not result.owner_name:
        result.owner_name = result.registered_agent

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Virginia SOS — SCC Clerk's Information System
# ─────────────────────────────────────────────────────────────────────────────

_VA_SEARCH_URL = "https://cis.scc.virginia.gov/EntitySearch/Index"
_VA_BASE_URL = "https://cis.scc.virginia.gov"


def _search_virginia(business_name: str, timeout: int = 15) -> Optional[SOSResult]:
    """Search Virginia SCC for a business."""
    session = requests.Session()
    session.headers.update(_HEADERS)
    try:
        params = {"searchTerm": business_name, "searchType": "entityName"}
        resp = session.get(_VA_SEARCH_URL, params=params, timeout=timeout)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        # Find first result link
        for a in soup.find_all("a", href=True):
            if "EntityDetail" in a["href"] or "entityDetail" in a["href"]:
                detail_url = a["href"]
                if not detail_url.startswith("http"):
                    detail_url = _VA_BASE_URL + detail_url
                time.sleep(0.5)
                detail = session.get(detail_url, timeout=timeout)
                detail.raise_for_status()
                detail_soup = BeautifulSoup(detail.text, "lxml")
                return _parse_virginia_detail(detail_soup, detail_url)

        return None
    except Exception as exc:
        logger.warning("Virginia SOS search failed for '%s': %s", business_name, exc)
        return None


def _parse_virginia_detail(soup: BeautifulSoup, source_url: str) -> SOSResult:
    result = SOSResult(state="Virginia", source_url=source_url)

    # Strip navigation and chrome before text extraction
    for tag in soup.find_all(["nav", "header", "footer", "script", "style",
                               "noscript", "iframe", "svg"]):
        tag.decompose()
    for a in soup.find_all("a", href=True):
        if a.get("href", "").startswith("#"):
            a.decompose()

    text = soup.get_text(" ", strip=True)

    agent_match = re.search(
        r"(?:Registered Agent)[:\s]+([A-Z][A-Za-z\s,\.]{3,60})(?:\n|Address|$)",
        text, re.IGNORECASE,
    )
    if agent_match:
        result.registered_agent = agent_match.group(1).strip()
        result.owner_name = result.registered_agent

    names = re.findall(r"\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b", text)
    result.raw_names = names[:10]
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def lookup_owner_from_sos(
    business_name: str,
    location: str = "",
    timeout: int = 15,
) -> Optional[SOSResult]:
    """
    Look up owner/agent name from Secretary of State registries.
    Tries the state implied by location, then Maryland as default.

    Returns SOSResult or None if nothing found.
    """
    location_lower = (location or "").lower()

    # Determine which state to try first
    if "virginia" in location_lower or ", va" in location_lower:
        result = _search_virginia(business_name, timeout)
        if result and result.best_owner_name():
            return result
        # Virginia-specific businesses: try Maryland as fallback
        return _search_maryland(business_name, timeout)

    # Default: Maryland only (no Virginia fallback — Virginia SCC is unreachable
    # from Docker and each timeout wastes 15s per lead)
    return _search_maryland(business_name, timeout)
