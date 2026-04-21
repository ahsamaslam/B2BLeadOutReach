import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_REGEX = re.compile(r"(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)\d{3,4}[\s\-.]?\d{3,4}")


@dataclass
class ScrapedWebsiteData:
    pages_scraped: list[str]
    emails: list[str]
    phones: list[str]
    text_snippets: list[str]

    def to_context(self, max_chars: int = 15000) -> str:
        chunks: list[str] = []
        if self.pages_scraped:
            chunks.append("PAGES SCRAPED:\n" + "\n".join(f"- {url}" for url in self.pages_scraped))
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

    COMMON_PATHS = [
        "",
        "/about",
        "/about-us",
        "/company",
        "/contact",
        "/contact-us",
        "/team",
        "/leadership",
        "/management",
        "/news",
        "/blog",
        "/projects",
        "/services",
    ]

    @staticmethod
    def scrape_company_website(website: str, timeout: int = 12) -> ScrapedWebsiteData:
        normalized = LocalScraperService._normalize_url(website)
        if not normalized:
            return ScrapedWebsiteData([], [], [], [])

        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
        )

        pages_scraped: list[str] = []
        emails: set[str] = set()
        phones: set[str] = set()
        snippets: list[str] = []

        for path in LocalScraperService.COMMON_PATHS:
            page_url = urljoin(normalized, path)
            try:
                response = session.get(page_url, timeout=timeout, allow_redirects=True)
                if response.status_code >= 400:
                    continue
                final_url = response.url
                parsed = urlparse(final_url)
                if parsed.netloc and urlparse(normalized).netloc not in parsed.netloc:
                    continue
                html = response.text or ""
                if not html.strip():
                    continue

                page_emails, page_phones, text = LocalScraperService._extract_from_html(html)
                if not text:
                    continue

                pages_scraped.append(final_url)
                emails.update(page_emails)
                phones.update(page_phones)
                snippets.append(f"[{final_url}]\n{text[:1800]}")
            except Exception:
                continue

        return ScrapedWebsiteData(
            pages_scraped=pages_scraped[:10],
            emails=sorted(list(emails))[:20],
            phones=sorted(list(phones))[:20],
            text_snippets=snippets[:8],
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
        for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
            tag.decompose()

        text = " ".join(soup.get_text(" ", strip=True).split())
        text = text[:12000]

        emails = list(set(EMAIL_REGEX.findall(html) + EMAIL_REGEX.findall(text)))
        phones = [p for p in set(PHONE_REGEX.findall(text)) if len(re.sub(r"\D", "", p)) >= 8]
        return emails, phones, text