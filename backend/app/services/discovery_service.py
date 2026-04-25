"""
Multi-source B2B lead discovery engine.

Source priority (all run and merge results):
  1. Google Custom Search API  — if GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX are set
                                 (free 100 queries/day, most reliable)
  2. DuckDuckGo web search     — 4 short query templates, exponential back-off retry
  3. Claude knowledge mining   — mines Claude's training data for known businesses;
                                 always produces results, zero rate-limit risk

All sources feed into a final Claude qualification pass that deduplicates,
filters directories/aggregators, and scores each company as an AI prospect.
"""
import json
import logging
import time
from typing import Any

import requests
from duckduckgo_search import DDGS
from anthropic import Anthropic

from app.config import settings

logger = logging.getLogger(__name__)

# ── Google Custom Search ───────────────────────────────────────────────────────
_GOOGLE_URL = "https://www.googleapis.com/customsearch/v1"

# ── DuckDuckGo ─────────────────────────────────────────────────────────────────
# Short, varied templates — business_type is intentionally excluded to avoid
# rate limits from overly long queries
_DDG_TEMPLATES = [
    "{niche} companies {location}",
    "{niche} business {location}",
    "top {niche} {location}",
    "best {niche} companies in {location}",
]
_DDG_MAX_RETRIES = 3
_DDG_RETRY_SLEEP = 5.0   # seconds, multiplied by attempt number
_DDG_QUERY_SLEEP = 3.0   # seconds between sub-queries


class NicheDiscoveryService:
    """Multi-source lead discovery: Google CSE + DuckDuckGo + Claude knowledge mining."""

    @staticmethod
    def discover(
        niche: str,
        location: str,
        business_type: str = "",
        max_results: int = 10,
    ) -> list[dict[str, Any]]:
        if not settings.ANTHROPIC_API_KEY:
            logger.warning("ANTHROPIC_API_KEY not set — discovery unavailable")
            return []

        seen_urls: set[str] = set()
        web_snippets: list[str] = []
        target = max_results * 3

        # ── Source 1: Google Custom Search ────────────────────────────────────
        if settings.GOOGLE_CSE_API_KEY and settings.GOOGLE_CSE_CX:
            google = NicheDiscoveryService._google_search(niche, location, max_results)
            for r in google:
                url = r["url"]
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    web_snippets.append(r["text"])
            logger.info("Google CSE contributed %d snippets", len(web_snippets))

        # ── Source 2: DuckDuckGo (multiple short queries) ─────────────────────
        for template in _DDG_TEMPLATES:
            if len(web_snippets) >= target:
                break
            query = template.format(niche=niche, location=location)
            for r in NicheDiscoveryService._ddg_search(query, max_results * 2):
                url = r.get("href", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    web_snippets.append(
                        f"Title: {r.get('title', '')}\n"
                        f"URL: {url}\n"
                        f"Snippet: {r.get('body', '')}"
                    )
            if len(web_snippets) < target:
                time.sleep(_DDG_QUERY_SLEEP)

        logger.info(
            "Web search total: %d unique snippets for niche='%s' location='%s'",
            len(web_snippets), niche, location,
        )

        # ── Source 3: Claude knowledge mining (always runs) ───────────────────
        knowledge = NicheDiscoveryService._claude_knowledge_mine(
            niche, location, business_type, max_results
        )

        # ── Final pass: combine + qualify ─────────────────────────────────────
        return NicheDiscoveryService._qualify(
            niche=niche,
            location=location,
            business_type=business_type,
            web_snippets=web_snippets[:target],
            knowledge=knowledge,
            max_results=max_results,
        )

    # ── Source helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _google_search(niche: str, location: str, max_results: int) -> list[dict]:
        """Google Custom Search API — free 100 queries/day."""
        out: list[dict] = []
        for query in [
            f"{niche} companies {location}",
            f"top {niche} businesses {location}",
        ]:
            try:
                params = {
                    "key": settings.GOOGLE_CSE_API_KEY,
                    "cx": settings.GOOGLE_CSE_CX,
                    "q": query,
                    "num": min(max_results * 2, 10),
                }
                resp = requests.get(_GOOGLE_URL, params=params, timeout=10)
                resp.raise_for_status()
                for item in resp.json().get("items", []):
                    url = item.get("link", "")
                    title = item.get("title", "")
                    snippet = item.get("snippet", "")
                    out.append({
                        "url": url,
                        "text": f"Title: {title}\nURL: {url}\nSnippet: {snippet}",
                    })
            except Exception as exc:
                logger.warning("Google CSE query '%s' failed: %s", query, exc)
        return out

    @staticmethod
    def _ddg_search(query: str, results_wanted: int) -> list[dict]:
        """Single DDG search with exponential back-off retry on rate limits."""
        for attempt in range(1, _DDG_MAX_RETRIES + 1):
            try:
                with DDGS() as ddgs:
                    results = list(ddgs.text(query, max_results=results_wanted))
                logger.debug("DDG '%s' → %d results (attempt %d)", query, len(results), attempt)
                return results
            except Exception as exc:
                err = str(exc)
                if "Ratelimit" in err or "202" in err:
                    wait = _DDG_RETRY_SLEEP * attempt
                    logger.warning(
                        "DDG rate-limited '%s' (attempt %d/%d) — retrying in %.0fs",
                        query, attempt, _DDG_MAX_RETRIES, wait,
                    )
                    time.sleep(wait)
                else:
                    logger.error("DDG error on '%s': %s", query, exc)
                    return []
        logger.error("DDG gave up on '%s' after %d attempts", query, _DDG_MAX_RETRIES)
        return []

    @staticmethod
    def _claude_knowledge_mine(
        niche: str, location: str, business_type: str, max_results: int
    ) -> list[dict[str, Any]]:
        """
        Ask Claude to recall real businesses from its training knowledge.
        This is completely independent of web search — no rate limits, always
        returns results even if DDG is fully blocked.
        """
        characteristics_line = (
            f"\n- Ideal prospect characteristics: {business_type}"
            if business_type.strip() else ""
        )

        prompt = f"""You are a B2B business intelligence expert with deep knowledge of companies worldwide.

Task: Recall REAL businesses that match all of these criteria from your training knowledge:
- Industry / niche: {niche}
- Location: {location}{characteristics_line}

Your goal is to identify companies that would benefit most from AI automation, digital transformation,
or software/technology solutions — making them ideal prospects for a B2B software/AI firm.

Return a JSON array of up to {max_results * 2} real businesses. Be thorough — for common niches in
populated areas there are always many options.
Each element:
{{
  "name"       : "Full official company name",
  "website"    : "https://their-actual-website.com",
  "address"    : "Street, City, State if known — empty string if not",
  "reason"     : "One sentence: specific AI/automation opportunity for this company",
  "confidence" : "high or medium or low"
}}

Critical rules:
- ONLY include companies you have genuine training knowledge of (you've seen their website, news, etc.)
- Do NOT invent or guess companies
- Do NOT include business directories, franchise HQs outside the location, or social platforms
- Mark confidence honestly: high = you're very sure they exist at that location; low = uncertain
- Output ONLY the JSON array, no other text"""

        try:
            client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            response = client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                system=(
                    "You are a business intelligence expert. "
                    "Recall only companies you are genuinely confident exist. "
                    "Output valid JSON only — no prose, no markdown fences."
                ),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=3000,
            )
            raw = response.content[0].text.strip()
            all_companies = NicheDiscoveryService._parse_json(raw)
            logger.info(
                "Claude knowledge mine: %d companies recalled for niche='%s' location='%s'",
                len(all_companies), niche, location,
            )
            return all_companies
        except Exception as exc:
            logger.error("Claude knowledge mine failed: %s", exc)
            return []

    # ── Final qualification pass ───────────────────────────────────────────────

    @staticmethod
    def _qualify(
        niche: str,
        location: str,
        business_type: str,
        web_snippets: list[str],
        knowledge: list[dict],
        max_results: int,
    ) -> list[dict[str, Any]]:
        """
        Merge web snippets + knowledge-mined companies into a single Claude prompt.
        Claude deduplicates, filters junk, and returns the best N qualified leads.
        """
        # If web search completely failed, return knowledge companies directly
        if not web_snippets and knowledge:
            logger.info("No web snippets — returning knowledge companies directly")
            return [
                {
                    "name": c["name"],
                    "website": c["website"],
                    "address": c.get("address", ""),
                    "reason": c.get("reason", ""),
                }
                for c in knowledge[:max_results]
                if c.get("name") and c.get("website")
            ]

        # Build knowledge context block
        knowledge_ctx = ""
        if knowledge:
            knowledge_ctx = "\n\nADDITIONAL COMPANIES FROM KNOWLEDGE BASE:\n" + "\n".join(
                f"- {c['name']} | {c['website']} | {c.get('reason', '')}"
                for c in knowledge
            )

        characteristics_line = (
            f"\n- Prospect characteristics: {business_type}" if business_type.strip() else ""
        )
        search_text = "\n\n---\n\n".join(web_snippets)

        prompt = f"""You are a senior B2B lead qualification expert for a software/AI company.

Your task: Produce a list of exactly {max_results} real companies to target for AI automation,
workflow software, and digital transformation services.

Target criteria:
- Industry / niche: {niche}
- Location: {location}{characteristics_line}

Prioritise companies that:
1. Are established businesses (not startups with no web presence)
2. Operate in the specified location
3. Likely use manual processes, legacy software, or have operations AI can improve
4. Have a real website

SOURCES (use these first — these are real companies found via web search and AI knowledge):

WEB SEARCH RESULTS:
{search_text}
{knowledge_ctx}

Return ONLY a valid JSON array with exactly {max_results} entries (or as many real companies
as you can find — never go below 5):
[
  {{
    "name"    : "Full company trading name",
    "website" : "https://their-website.com",
    "address" : "City, State/Province — empty string if unknown",
    "reason"  : "Specific AI/automation opportunity for this company in one sentence"
  }}
]

Rules:
- Prefer companies from the sources above; you may supplement with additional well-known
  businesses in {location} that match the niche if the sources do not yield enough
- NEVER fabricate company names or websites that do not exist
- EXCLUDE: Yelp, Yellow Pages, Angi, HomeAdvisor, Thumbtack, LinkedIn, Facebook,
           Reddit, Wikipedia, news articles, job boards, or any aggregator/directory
- Output the JSON array and absolutely nothing else"""

        try:
            client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            response = client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                system=(
                    "You are a strict JSON-only output engine. "
                    "Output a valid JSON array and nothing else. "
                    "No prose, no markdown, no code fences."
                ),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=4000,
            )
            raw = response.content[0].text.strip()
            results = NicheDiscoveryService._parse_json(raw)
            logger.info(
                "Final qualification: %d leads for niche='%s' location='%s'",
                len(results), niche, location,
            )
            return results
        except Exception as exc:
            logger.error("Claude qualification pass failed: %s", exc)
            # Graceful fallback — return knowledge companies without web qualification
            return [
                {
                    "name": c["name"],
                    "website": c["website"],
                    "address": c.get("address", ""),
                    "reason": c.get("reason", ""),
                }
                for c in knowledge[:max_results]
                if c.get("name") and c.get("website")
            ]

    # ── JSON parsing ───────────────────────────────────────────────────────────

    @staticmethod
    def _parse_json(raw: str) -> list[dict[str, Any]]:
        """
        Robustly extract a JSON array from Claude's response.
        Handles markdown fences, leading prose, and trailing garbage.
        """
        cleaned = raw

        # Strip markdown code fences
        if "```" in cleaned:
            start = cleaned.find("```")
            end = cleaned.rfind("```")
            if start != end:
                inner = cleaned[start + 3: end]
                if "\n" in inner:
                    first_line, rest = inner.split("\n", 1)
                    if first_line.strip().replace("json", "").strip() == "":
                        inner = rest
                cleaned = inner.strip()

        arr_start = cleaned.find("[")
        arr_end = cleaned.rfind("]") + 1
        if arr_start == -1 or arr_end <= arr_start:
            logger.warning("No JSON array found in Claude response: %s", cleaned[:300])
            return []

        try:
            data = json.loads(cleaned[arr_start:arr_end])
        except json.JSONDecodeError as exc:
            logger.warning("JSON decode error: %s — excerpt: %s", exc, cleaned[:300])
            return []

        results: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in data:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            website = str(item.get("website", "")).strip()
            if not name or not website or "." not in website:
                continue
            if not website.startswith(("http://", "https://")):
                website = "https://" + website
            domain = website.lower().rstrip("/")
            if domain in seen:
                continue
            seen.add(domain)
            results.append({
                "name": name,
                "website": website,
                "address": str(item.get("address", "")).strip(),
                "reason": str(item.get("reason", "")).strip(),
                **( {"confidence": item["confidence"]} if "confidence" in item else {} ),
            })
        return results

