import json
from typing import Any, Dict

import requests
from openai import OpenAI

from app.config import settings
from app.services.scraper_service import LocalScraperService, ScrapedWebsiteData

_client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None


class OpenAIService:
    """Service for extraction and email generation with local scraping + optional fallback enrichment."""

    @staticmethod
    async def extract_company_data(company_name: str, website: str) -> Dict[str, Any]:
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

        if OpenAIService._needs_perplexity_fallback(result):
            pplx_context = OpenAIService._fetch_perplexity_context(company_name, website, local_context)
            if pplx_context:
                enriched = OpenAIService._extract_structured_data_from_context(
                    company_name=company_name,
                    website=website,
                    context=f"{local_context}\n\nPERPLEXITY FINDINGS:\n{pplx_context}",
                    source_label="website + external web sources",
                )
                result = OpenAIService._merge_data(result, enriched)
                result["research_source"] = "local_plus_perplexity"
                result["research_note"] = (
                    f"Scraped {len(local_data.pages_scraped)} page(s); used Perplexity fallback for missing contacts/news"
                )
                result["local_pages_scraped"] = len(local_data.pages_scraped)
                result["used_perplexity"] = True

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
                raise ValueError("OPENAI_API_KEY is not configured")

            response = _client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert B2B email copywriter. Return only valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.8,
                max_tokens=1500,
            )
            content = (response.choices[0].message.content or "").strip()
            payload = OpenAIService._parse_json(content)
            if payload.get("subject") and payload.get("body"):
                return {"subject": payload["subject"], "body": payload["body"]}
            raise ValueError("Missing subject/body in generated response")
        except Exception:
            return OpenAIService._get_default_email_template(ceo_name, company_name, my_company_info)

    @staticmethod
    def _extract_structured_data_from_context(
        company_name: str,
        website: str,
        context: str,
        source_label: str,
    ) -> Dict[str, Any]:
        if not _client:
            return {}

        prompt = f"""
Extract structured B2B company data for {company_name} ({website}).

DATA SOURCE: {source_label}
CONTENT:
{context}

Rules:
- Use only facts from provided content.
- If unknown, use empty string.
- Return valid JSON with keys:
  ceo_name, ceo_email, cto_name, cto_email, cfo_name, cfo_email,
  phone, landline, company_info, projects, news
- For projects and news, return bullet points separated by \n.
"""

        try:
            response = _client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a strict data extraction engine. Output valid JSON only.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                max_tokens=settings.OPENAI_MAX_TOKENS,
            )
            content = (response.choices[0].message.content or "").strip()
            return OpenAIService._parse_json(content)
        except Exception:
            return {}

    @staticmethod
    def _fetch_perplexity_context(company_name: str, website: str, local_context: str) -> str:
        if not settings.PERPLEXITY_API_KEY:
            return ""

        prompt = f"""
Find verified public information for:
Company: {company_name}
Website: {website}

Need:
- CEO/CTO/CFO names and public business emails if available
- Company phone and reception/landline
- 3 recent projects/products/services
- 3 recent news announcements

If an item cannot be found, say "not found".
Use concise bullet points.

Website context already scraped:
{local_context[:4000]}
"""

        payload = {
            "model": settings.PERPLEXITY_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a web research assistant. Return concise grounded findings.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 1200,
        }

        try:
            response = requests.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.PERPLEXITY_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=25,
            )
            response.raise_for_status()
            data = response.json()
            return (data.get("choices", [{}])[0].get("message", {}).get("content", "") or "").strip()
        except Exception:
            return ""

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
        missing_contacts = not any(
            [result.get("ceo_name"), result.get("cto_name"), result.get("cfo_name")]
        )
        missing_contact_emails = not any(
            [result.get("ceo_email"), result.get("cto_email"), result.get("cfo_email")]
        )
        missing_news = not result.get("news")
        return missing_contacts or missing_contact_emails or missing_news

    @staticmethod
    def _merge_data(primary: Dict[str, Any], secondary: Dict[str, Any]) -> Dict[str, Any]:
        merged = dict(primary)
        for key, value in secondary.items():
            if value and not merged.get(key):
                merged[key] = value
        return merged

    @staticmethod
    def _parse_json(content: str) -> Dict[str, Any]:
        json_start = content.find("{")
        json_end = content.rfind("}") + 1
        if json_start == -1 or json_end <= json_start:
            raise ValueError("No valid JSON payload found")
        return json.loads(content[json_start:json_end])

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
            "company_info",
            "projects",
            "news",
        ]
        normalized = OpenAIService._get_empty_company_data()
        for key in required_keys:
            value = data.get(key, "")
            normalized[key] = str(value).strip() if value is not None else ""
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
