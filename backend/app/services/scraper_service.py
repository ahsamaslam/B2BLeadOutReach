import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_REGEX = re.compile(r"(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)\d{3,4}[\s\-.]?\d{3,4}")

# Patterns to extract person names directly from website text
# Ordered by confidence — highest-signal patterns first
_NAME_PATTERNS: list[re.Pattern] = [
    # "Dr. First Last" or "Dr. First Last, DVM/DMD/MD"
    re.compile(r"\bDr\.?\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})(?:,?\s+(?:DVM|DMD|DDS|MD|DO|PhD|OD|DC|NP|PA))?\b"),
    # "Name, DVM" / "Name, MD" etc (credential after name)
    re.compile(r"\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+(?:DVM|DMD|DDS|MD|DO|PhD|OD|DC|NP|PA)\b"),
    # "Owner: First Last" / "Founder: First Last" / "Founded by First Last"
    re.compile(r"\b(?:Owner|Founder|Co-Founder|Director|Principal|President|CEO|Managing\s+Director)\s*[:\-]\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"),
    re.compile(r"\b[Ff]ounded\s+by\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"),
    # "Meet First Last" / "Meet Dr. First Last"
    re.compile(r"\b[Mm]eet\s+(?:Dr\.?\s+)?([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"),
    # "About First Last" at start of about section
    re.compile(r"\b[Aa]bout\s+Dr\.?\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"),
    # "First Last is the owner/founder/veterinarian/dentist/doctor"
    re.compile(r"\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:the\s+)?(?:owner|founder|co-founder|veterinarian|lead\s+vet|head\s+vet|dentist|physician|doctor|principal)"),
    # "First Last opened/started/established [company]"
    re.compile(r"\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:opened|started|established|founded|launched|created|built)\s+(?:the\s+)?"),
]

# Words that appear in name-position but are NOT real names
_NAME_NOISE = frozenset({
    "Skip To", "Skip Navigation", "Main Content", "All Rights", "Rights Reserved",
    "United States", "Maryland State", "New York", "Los Angeles", "Privacy Policy",
    "Terms Of", "Cookie Policy", "About Us", "Contact Us", "Our Team", "Our Staff",
    "Our Services", "Learn More", "Read More", "Click Here", "Get Started",
    "Home Page", "Site Map", "Back To", "Return To", "View All",
})

# Individual words that should NOT appear anywhere inside a person name
# Used to reject phrases like "Hospital In Baltimore", "Pet Care Center", etc.
_PERSON_NAME_STOPWORDS = frozenset({
    # Prepositions / articles / conjunctions
    "in", "at", "of", "the", "and", "or", "for", "to", "a", "an", "by",
    "is", "are", "was", "were", "be", "been", "from", "with", "on", "as",
    "near", "since", "after", "before", "during", "into", "over", "via",
    # Business / location type words
    "hospital", "clinic", "center", "centre", "veterinary", "animal", "pet",
    "care", "dental", "medical", "health", "resort", "inn", "lodge", "hotel",
    "plaza", "square", "park", "garden", "village", "city", "town", "county",
    "street", "road", "avenue", "boulevard", "drive", "suite", "floor",
    "north", "south", "east", "west", "maryland", "virginia", "baltimore",
    "washington", "rockville", "columbia", "annapolis", "gaithersburg",
})


def extract_person_names(text: str) -> list[str]:
    """Extract likely person names from website text using regex patterns.
    Returns a deduplicated list ordered by pattern confidence.
    """
    found: list[str] = []
    seen: set[str] = set()
    for pattern in _NAME_PATTERNS:
        for m in pattern.finditer(text):
            name = m.group(1).strip()
            # Basic sanity checks
            if not name or len(name) < 4 or len(name) > 50:
                continue
            if name in _NAME_NOISE:
                continue
            parts = name.split()
            if len(parts) < 2:
                continue
            # Skip if any word is all-caps (likely an acronym/heading)
            if any(p.isupper() and len(p) > 2 for p in parts):
                continue
            # Reject names containing prepositions, articles, or business-type words
            # e.g., "Hospital In Baltimore", "Pet Care Center", "Animal Hospital"
            if any(p.lower() in _PERSON_NAME_STOPWORDS for p in parts):
                continue
            key = name.lower()
            if key not in seen:
                seen.add(key)
                found.append(name)
    return found

# Generic/role-based email prefixes that are NOT personal emails
_GENERIC_PREFIXES = {
    "info", "contact", "hello", "hi", "help", "support", "admin", "administrator",
    "enquiries", "enquiry", "enquire", "mail", "email", "office", "general",
    "reception", "receptionist", "team", "sales", "marketing", "accounts",
    "billing", "service", "services", "customerservice", "customers", "care",
    "feedback", "webmaster", "postmaster", "media", "press", "pr", "news",
    "hr", "jobs", "careers", "recruitment", "hiring", "noreply", "no-reply",
    "donotreply", "privacy", "legal", "compliance", "it", "helpdesk",
}


def _email_score(email: str) -> int:
    """
    Score an email address — higher = more likely to be a personal email.
    Personal: firstname@, john.smith@, j.smith@, dr.jones@  → score ≥ 10
    Generic:  info@, contact@, hello@                       → score 0
    """
    local = email.split("@")[0].lower()
    # Exact generic match
    if local in _GENERIC_PREFIXES:
        return 0
    # Starts with a generic prefix followed by separator
    for prefix in _GENERIC_PREFIXES:
        if local.startswith(prefix + ".") or local.startswith(prefix + "_") or local.startswith(prefix + "-"):
            return 1
    # Looks personal: contains a dot (firstname.lastname) or a name-like pattern
    if "." in local or "-" in local or "_" in local:
        return 15
    # Short single-word, likely personal (e.g. "john@")
    if len(local) >= 2:
        return 10
    return 5


def rank_emails(emails: list[str]) -> list[str]:
    """Return emails sorted personal-first, generic-last."""
    return sorted(emails, key=lambda e: _email_score(e), reverse=True)


@dataclass
class ScrapedWebsiteData:
    pages_scraped: list[str]
    emails: list[str]
    phones: list[str]
    text_snippets: list[str]
    person_names: list[str] = None  # Names extracted by Python regex before Claude

    def __post_init__(self):
        if self.person_names is None:
            self.person_names = []

    def to_context(self, max_chars: int = 15000) -> str:
        chunks: list[str] = []
        if self.pages_scraped:
            chunks.append("PAGES SCRAPED:\n" + "\n".join(f"- {url}" for url in self.pages_scraped))
        # Surface pre-extracted names prominently so Claude sees them first
        if self.person_names:
            chunks.append(
                "PERSON NAMES FOUND ON WEBSITE (high confidence — use these for ceo_name):\n"
                + "\n".join(f"- {n}" for n in self.person_names)
            )
        if self.emails:
            chunks.append("EMAILS FOUND:\n" + "\n".join(f"- {item}" for item in self.emails))
        if self.phones:
            chunks.append("PHONES FOUND:\n" + "\n".join(f"- {item}" for item in self.phones))
        if self.text_snippets:
            chunks.append("WEBSITE CONTENT:\n" + "\n\n".join(self.text_snippets))

        context = "\n\n".join(chunks).strip()
        if len(context) > max_chars:
            return context[:max_chars]
        return context


class LocalScraperService:
    """Low-cost website scraper used before any external enrichment call."""

    # Keywords that indicate a page is likely to contain owner/contact/about info
    _PRIORITY_KEYWORDS = {
        "about", "team", "contact", "staff", "leadership", "management",
        "founder", "owner", "meet", "people", "us", "who-we-are", "who-we",
        "our-story", "story", "company",
    }

    @staticmethod
    def _make_session() -> requests.Session:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
        return session

    @staticmethod
    def _is_same_domain(base_url: str, url: str) -> bool:
        base_netloc = urlparse(base_url).netloc.lstrip("www.")
        check_netloc = urlparse(url).netloc.lstrip("www.")
        return bool(check_netloc) and (base_netloc in check_netloc or check_netloc in base_netloc)

    @staticmethod
    def _priority_score(url: str) -> int:
        """Score a URL by how likely it contains owner/contact info. Higher = more valuable."""
        path = urlparse(url).path.lower().strip("/")
        for kw in LocalScraperService._PRIORITY_KEYWORDS:
            if kw in path:
                return 10
        return 0

    @staticmethod
    def _extract_internal_links(html: str, base_url: str) -> list[str]:
        """Extract all internal links from a page, sorted by priority (about/team/contact first)."""
        soup = BeautifulSoup(html, "lxml")
        links: list[str] = []
        seen: set[str] = set()
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            # Skip anchors, javascript, mailto, tel, external CDNs
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue
            full_url = urljoin(base_url, href).split("#")[0].rstrip("/")
            if full_url in seen:
                continue
            seen.add(full_url)
            if not LocalScraperService._is_same_domain(base_url, full_url):
                continue
            links.append(full_url)
        # Sort: priority pages first (about/team/contact), rest after
        links.sort(key=lambda u: -LocalScraperService._priority_score(u))
        return links

    @staticmethod
    def scrape_company_website(website: str, timeout: int = 12) -> ScrapedWebsiteData:
        normalized = LocalScraperService._normalize_url(website)
        if not normalized:
            return ScrapedWebsiteData([], [], [], [])

        session = LocalScraperService._make_session()

        pages_scraped: list[str] = []
        emails: set[str] = set()
        phones: set[str] = set()
        snippets: list[str] = []
        all_person_names: list[str] = []
        visited: set[str] = set()

        def _scrape_page(url: str) -> str | None:
            """Scrape a single page. Returns raw HTML or None on failure."""
            if url in visited:
                return None
            visited.add(url)
            try:
                response = session.get(url, timeout=timeout, allow_redirects=True)
                if response.status_code >= 400:
                    return None
                final_url = response.url
                if not LocalScraperService._is_same_domain(normalized, final_url):
                    return None
                html = response.text or ""
                if not html.strip():
                    return None
                return html
            except Exception:
                return None

        # Step 1: Scrape the homepage
        homepage_html = _scrape_page(normalized)
        if homepage_html:
            page_emails, page_phones, text, page_names = LocalScraperService._extract_from_html(homepage_html)
            if text:
                pages_scraped.append(normalized)
                emails.update(page_emails)
                phones.update(page_phones)
                snippets.append(f"[{normalized}]\n{text[:2000]}")
                for n in page_names:
                    if n not in all_person_names:
                        all_person_names.append(n)

            # Step 2: Find all internal links from the homepage and follow priority ones
            internal_links = LocalScraperService._extract_internal_links(homepage_html, normalized)

            # Visit up to 8 more pages, prioritizing about/contact/team pages
            pages_visited = 0
            for link_url in internal_links:
                if pages_visited >= 8:
                    break
                html = _scrape_page(link_url)
                if not html:
                    continue
                page_emails, page_phones, text, page_names = LocalScraperService._extract_from_html(html)
                if not text:
                    continue
                pages_scraped.append(link_url)
                emails.update(page_emails)
                phones.update(page_phones)
                snippets.append(f"[{link_url}]\n{text[:2000]}")
                for n in page_names:
                    if n not in all_person_names:
                        all_person_names.append(n)
                pages_visited += 1

                # Early exit: if we already have a personal email AND some name-like text, stop
                ranked = rank_emails(list(emails))
                if ranked and _email_score(ranked[0]) >= 10 and pages_visited >= 3:
                    break

        return ScrapedWebsiteData(
            pages_scraped=pages_scraped[:10],
            emails=rank_emails(sorted(list(emails)))[:20],
            phones=sorted(list(phones))[:20],
            text_snippets=snippets[:8],
            person_names=all_person_names[:10],
        )

    @staticmethod
    def _normalize_url(website: str) -> str:
        value = (website or "").strip()
        if not value:
            return ""
        if not value.startswith(("http://", "https://")):
            value = f"https://{value}"
        return value

    @staticmethod
    def _extract_from_html(html: str) -> tuple[list[str], list[str], str]:
        soup = BeautifulSoup(html, "lxml")
        # Remove non-content tags (keep header/footer — they often contain owner/doctor names)
        for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
            tag.decompose()
        # Remove pure navigation menus (not the page header element — just <nav> blocks)
        for tag in soup.find_all("nav"):
            tag.decompose()
        # Remove skip-navigation anchor links specifically (these look like person names to Claude)
        _SKIP_NAV_TEXT = {
            "skip to content", "skip to main content", "skip navigation",
            "skip to main", "skip nav", "jump to content", "accessibility",
        }
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            text_content = a.get_text(strip=True).lower()
            if href.startswith("#") and text_content in _SKIP_NAV_TEXT:
                a.decompose()

        text = " ".join(soup.get_text(" ", strip=True).split())
        text = text[:12000]

        # Explicit mailto:/tel: link extraction (most reliable source)
        mailto_emails = [
            a["href"][7:].split("?")[0].strip().lower()
            for a in soup.find_all("a", href=True)
            if a["href"].lower().startswith("mailto:") and "@" in a["href"]
        ]
        tel_phones = [
            a["href"][4:].strip()
            for a in soup.find_all("a", href=True)
            if a["href"].lower().startswith("tel:")
        ]

        raw_emails = set(mailto_emails + EMAIL_REGEX.findall(html) + EMAIL_REGEX.findall(text))
        # Filter out image/asset emails and common noreply addresses
        emails = [
            e for e in raw_emails
            if "@" in e and not any(e.lower().endswith(ext) for ext in [".png", ".jpg", ".gif", ".svg"])
            and not e.lower().startswith(("noreply", "no-reply", "donotreply"))
        ]
        # Rank: personal emails first, generic last
        emails = rank_emails(emails)
        raw_phones = set(tel_phones + PHONE_REGEX.findall(text))
        phones = [p for p in raw_phones if len(re.sub(r"\D", "", p)) >= 7]
        # Extract person names directly using regex patterns (no external API needed)
        person_names = extract_person_names(text)
        return emails, phones, text, person_names