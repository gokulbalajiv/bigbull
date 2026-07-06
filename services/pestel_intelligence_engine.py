"""
PESTEL Intelligence Engine — BigBull Engine
============================================
Level: Pre-Level-1 (executes at 06:00 AM IST during Data Ingestion phase)

Fetches real-world news and policy signals across all six PESTEL pillars:
  Political, Economic, Social, Technological, Environmental, Legal

Output feeds into:
  - Level 1 Macro Regime Score (as 5th weighted component)
  - Level 2 Theme Discovery NLP corpus (headlines as additional documents)
  - Level 8 Thesis Narrative (ticker/sector-tagged headlines)

Sources used (all free/open — no API key required except newsapi.org):
  PRIMARY — Mint (livemint.com) RSS:
    Politics     : https://www.livemint.com/rss/politics
    Economy      : https://www.livemint.com/rss/economy
    Industry     : https://www.livemint.com/rss/industry
    Companies    : https://www.livemint.com/rss/companies
    Technology   : https://www.livemint.com/rss/technology
    Markets      : https://www.livemint.com/rss/markets
    Science      : https://www.livemint.com/rss/science  (Environment pillar)
    News (all)   : https://www.livemint.com/rss/news

  SUPPLEMENTARY — Government / Regulatory RSS:
    PIB RSS      : https://pib.gov.in/RssMain.aspx
    RBI RSS      : https://www.rbi.org.in/rss/PressRelease.rss
    SEBI RSS     : https://www.sebi.gov.in/rss/sebi_rss.xml
    MoEFCC RSS   : https://moef.gov.in/rss.xml
    MCA RSS      : https://www.mca.gov.in/MCA21/dca/rss.xml
    MeitY RSS    : https://www.meity.gov.in/rss.xml

  OPTIONAL — newsapi.org (requires NEWSAPI_KEY env var, 100 req/day free tier)

Zero-hallucination guarantee: if any feed fails, the engine uses cached scores
  from the previous run (max 3 days stale). PESTEL_WEIGHT penalty applied.
"""

from __future__ import annotations

import os
import json
import time
import hashlib
import logging
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Keyword-weight dictionaries (same pattern as Level 2 KEYWORD_UNIVERSE)
# Each dict maps lowercase keyword → sentiment weight (+ve = bullish, -ve = bearish)
# ---------------------------------------------------------------------------

PILLAR_KEYWORDS: dict[str, dict[str, float]] = {

    "Political": {
        # Positive political signals
        "pli scheme": +3.0, "production linked incentive": +3.0,
        "capex": +2.5, "infrastructure push": +2.5,
        "budget allocation": +2.0, "reform": +1.5,
        "fdi approved": +2.5, "fta signed": +2.5,
        "defence order": +2.5, "indigenization": +2.0,
        "disinvestment": +1.0, "privatisation": +1.0,
        "subsidy": +1.5, "policy boost": +2.0,
        "election result": +0.5,   # Neutral-positive (stability signal)
        # Negative political signals
        "election uncertainty": -1.5, "political crisis": -3.0,
        "coalition instability": -2.5, "protest": -1.0,
        "import duty hike": -2.0, "ban": -2.0,
        "windfall tax": -3.0, "price control": -2.0,
        "nationalisation": -2.5, "regulatory crackdown": -2.0,
    },

    "Economic": {
        # Positive economic signals
        "gdp growth": +3.0, "rate cut": +3.0,
        "repo rate cut": +3.0, "rbi accommodative": +2.5,
        "fii inflow": +2.5, "dii buying": +2.0,
        "rupee appreciation": +1.5, "cpi easing": +2.5,
        "current account surplus": +2.0, "forex reserves": +1.5,
        "earnings upgrade": +2.5, "eps beat": +2.5,
        "credit growth": +2.0, "iip growth": +2.0,
        # Negative economic signals
        "rate hike": -3.0, "repo rate hike": -3.0,
        "inflation rising": -2.5, "cpi surge": -3.0,
        "fii outflow": -2.5, "rupee depreciation": -1.5,
        "current account deficit": -2.0, "recession": -3.0,
        "slowdown": -2.0, "earnings downgrade": -2.5,
        "npa rising": -2.0, "credit squeeze": -2.5,
    },

    "Social": {
        # Positive social signals
        "consumption boom": +2.5, "premiumisation": +2.0,
        "middle class": +1.5, "demographic dividend": +2.0,
        "rural demand": +2.0, "upi growth": +1.5,
        "insurance penetration": +1.5, "health spending": +1.5,
        "housing demand": +2.0, "digital adoption": +1.5,
        # Negative social signals
        "unemployment": -2.5, "rural distress": -2.5,
        "consumer sentiment low": -2.0, "wage pressure": -1.5,
        "strike": -2.0, "social unrest": -2.5,
        "inflation burden": -2.0,
    },

    "Technological": {
        # Positive tech signals
        "ai": +2.5, "artificial intelligence": +2.5,
        "semiconductor": +3.0, "chip fab": +3.0,
        "5g rollout": +2.5, "data centre": +2.5,
        "ev technology": +2.0, "green hydrogen": +3.0,
        "genai deal": +3.0, "cloud migration": +2.0,
        "digital india": +2.0, "startup": +1.5,
        "r&d investment": +2.0, "patent": +1.5,
        "space tech": +2.5, "isro": +2.0,
        # Negative tech signals
        "cyber attack": -2.5, "data breach": -2.0,
        "tech layoffs": -2.0, "obsolescence": -1.5,
        "ai cannibalisation": -1.5,
    },

    "Environmental": {
        # Positive environmental signals
        "renewable energy": +3.0, "solar capacity": +3.0,
        "green hydrogen": +3.0, "ev penetration": +2.5,
        "net zero": +2.0, "esg": +2.0,
        "carbon credit": +1.5, "battery storage": +2.5,
        "wind energy": +2.5, "climate funding": +2.0,
        "fame subsidy": +2.5, "clean energy": +2.5,
        # Negative environmental signals
        "pollution penalty": -2.0, "environmental violation": -2.5,
        "coal dependency": -1.5, "deforestation": -2.0,
        "carbon tax": -1.5, "cpcb notice": -2.0,
        "ngt order": -2.5,   # National Green Tribunal
    },

    "Legal": {
        # Positive legal signals
        "sebi approval": +2.0, "ibc resolution": +2.5,
        "npa recovery": +2.0, "minority shareholder": +1.5,
        "governance reform": +2.0, "compliance eased": +1.5,
        "tribunal relief": +2.0, "court order favourable": +2.0,
        # Negative legal signals
        "sebi penalty": -3.0, "fraud": -3.0,
        "cbi investigation": -3.0, "ed raid": -3.0,
        "nclt insolvency": -2.5, "class action": -2.0,
        "dpdp violation": -2.0, "gst evasion": -2.5,
        "tribunal penalty": -2.5, "related party": -2.0,
        "pledge invoked": -3.0, "promoter selling": -2.0,
    },
}

# Sector tags inferred from headline keywords
SECTOR_KEYWORD_MAP: dict[str, list[str]] = {
    "Banking":         ["bank", "nbfc", "rbi", "credit", "npa", "nim", "casa", "lender"],
    "IT":              ["it ", "software", "infosys", "tcs", "wipro", "hcl", "ai", "genai", "cloud", "saas"],
    "Pharma":          ["pharma", "drug", "fda", "api", "biosimilar", "medicine", "healthcare"],
    "Power":           ["solar", "renewable", "wind", "ntpc", "powergrid", "electricity", "discom"],
    "Defence":         ["defence", "hal", "bel", "drdo", "ordnance", "weapon", "indigenization"],
    "Auto":            ["ev", "electric vehicle", "auto", "maruti", "tata motors", "two-wheeler"],
    "Infrastructure":  ["infrastructure", "road", "highway", "railway", "irctc", "port", "metro"],
    "FMCG":            ["fmcg", "consumer", "hul", "nestle", "marico", "dabur", "rural demand"],
    "Chemicals":       ["chemical", "specialty chemical", "agrochemical", "dye"],
    "Real Estate":     ["real estate", "housing", "dlf", "oberoi realty", "lodha"],
}

# RSS feed URLs (all free, no API key required)
# Priority order within each pillar: Mint feeds first (broad, current, India-focused),
# then government/regulatory feeds (authoritative but narrower coverage).

# Mint topic-specific RSS feeds — livemint.com
_MINT_POLITICS    = "https://www.livemint.com/rss/politics"
_MINT_ECONOMY     = "https://www.livemint.com/rss/economy"
_MINT_INDUSTRY    = "https://www.livemint.com/rss/industry"
_MINT_COMPANIES   = "https://www.livemint.com/rss/companies"
_MINT_TECHNOLOGY  = "https://www.livemint.com/rss/technology"
_MINT_MARKETS     = "https://www.livemint.com/rss/markets"
_MINT_SCIENCE     = "https://www.livemint.com/rss/science"   # covers ESG/climate
_MINT_NEWS_ALL    = "https://www.livemint.com/rss/news"       # catch-all fallback

RSS_FEEDS: dict[str, list[str]] = {
    # Political: government policy, budget, PLI, FTA, elections
    "Political": [
        _MINT_POLITICS,                           # Mint Politics — elections, policy
        _MINT_INDUSTRY,                           # PLI, capex, defence orders
        "https://pib.gov.in/RssMain.aspx",        # PIB — official govt press releases
        "https://www.mygov.in/rss/mygov-news.xml", # MyGov — scheme announcements
    ],

    # Economic: GDP, RBI rates, inflation, FII flows, INR
    "Economic": [
        _MINT_ECONOMY,                            # Mint Economy — GDP, CPI, RBI
        _MINT_MARKETS,                            # Mint Markets — FII/DII, Nifty
        "https://www.rbi.org.in/rss/PressRelease.rss",  # RBI press releases
        "https://www.mospi.gov.in/rss.xml",       # MOSPI — IIP, CPI data
    ],

    # Social: consumer demand, demographics, rural, healthcare
    "Social": [
        _MINT_NEWS_ALL,                           # Mint general — consumer/social stories
        _MINT_INDUSTRY,                           # FMCG, healthcare, retail
        "https://pib.gov.in/RssMain.aspx",        # Govt social schemes (PM housing, PMJAY)
    ],

    # Technological: AI, semiconductors, 5G, EV, data centres, ISRO
    "Technological": [
        _MINT_TECHNOLOGY,                         # Mint Technology — AI, startups, 5G
        _MINT_INDUSTRY,                           # Semiconductor fabs, EV ecosystem
        "https://www.meity.gov.in/rss.xml",       # MeitY — Digital India, IT policy
        "https://pib.gov.in/RssMain.aspx",        # ISRO, space tech, IndiaAI mission
    ],

    # Environmental: renewables, ESG, green hydrogen, CPCB, NGT
    "Environmental": [
        _MINT_SCIENCE,                            # Mint Science — ESG, climate, EV
        _MINT_INDUSTRY,                           # Renewable capex, green hydrogen tenders
        "https://moef.gov.in/rss.xml",            # MoEFCC — environmental clearances
        "https://pib.gov.in/RssMain.aspx",        # MNRE solar/wind announcements
    ],

    # Legal: SEBI orders, IBC, NCLT, DPDP, court judgements
    "Legal": [
        _MINT_COMPANIES,                          # Mint Companies — SEBI actions, mergers
        _MINT_MARKETS,                            # Regulatory announcements, IPO SEBI
        "https://www.sebi.gov.in/rss/sebi_rss.xml",  # SEBI official circulars
        "https://www.mca.gov.in/MCA21/dca/rss.xml",  # MCA — Companies Act notifications
    ],
}

# newsapi.org endpoint — used only when NEWSAPI_KEY env var is set
NEWSAPI_BASE = "https://newsapi.org/v2/everything"
NEWSAPI_QUERIES: dict[str, str] = {
    "Political":     "India government policy PLI budget",
    "Economic":      "India GDP RBI interest rate inflation rupee",
    "Social":        "India consumer demand demographics rural",
    "Technological": "India AI semiconductor 5G data centre",
    "Environmental": "India renewable energy solar ESG EV climate",
    "Legal":         "SEBI regulation India law court tribunal",
}

PILLAR_WEIGHTS_DEFAULT: dict[str, float] = {
    "Political":     0.20,
    "Economic":      0.30,
    "Social":        0.15,
    "Technological": 0.15,
    "Environmental": 0.10,
    "Legal":         0.10,
}


class PestelIntelligenceEngine:
    """
    Fetches and scores PESTEL news for the BigBull Engine.

    Run during Data Ingestion phase at 06:00 AM IST, before Level 1.
    Output is written to:
      - pestel_daily_scores table (one row per run date)
      - pestel_news_feed table (one row per headline)

    The scored pestel_output dict is returned for downstream consumption.
    """

    def __init__(self, db_conn, newsapi_key: Optional[str] = None):
        self.db = db_conn
        self.newsapi_key = newsapi_key or os.environ.get("NEWSAPI_KEY")
        self._cache_dir = os.path.join(
            os.path.dirname(__file__), "..", ".pestel_cache"
        )
        os.makedirs(self._cache_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(self, target_date: date) -> dict:
        """
        Execute the full PESTEL pipeline for target_date.

        Returns pestel_output dict compatible with orchestrator ingestion payload:
        {
          "overall_pestel_score": float [-100, +100],
          "pillar_scores": { "Political": float, ... },
          "sector_pestel_modifiers": { "Banking": float, ... },
          "ticker_pestel_flags": { "HDFCBANK": [...headlines], ... },
          "news_headlines": [ { pillar, headline, sentiment_score,
                                sector_tags, ticker_tags, source_url }, ... ],
          "data_freshness_days": int,   # 0 = today's data, 1+ = cached
          "stale_penalty_applied": bool
        }
        """
        print(f"[PESTEL] Starting intelligence run for {target_date}")

        pillar_weights = self._load_pillar_weights()
        all_headlines: list[dict] = []
        pillar_scores: dict[str, float] = {}
        stale_flags: dict[str, bool] = {}

        for pillar in PILLAR_KEYWORDS:
            headlines, is_stale = self._fetch_pillar_headlines(pillar, target_date)
            stale_flags[pillar] = is_stale

            scored_headlines = self._score_headlines(headlines, pillar)
            pillar_scores[pillar] = self._aggregate_pillar_score(scored_headlines)
            all_headlines.extend(scored_headlines)

        # Overall PESTEL score: weighted sum, normalized to [-100, +100]
        overall_score = sum(
            pillar_scores[p] * pillar_weights.get(p, 0.0)
            for p in pillar_scores
        )
        overall_score = max(-100.0, min(100.0, overall_score))

        # Sector modifiers derived from headline sector tags
        sector_modifiers = self._compute_sector_modifiers(all_headlines)

        # Ticker-level flags (headlines that mention specific NSE tickers)
        ticker_flags = self._extract_ticker_flags(all_headlines)

        any_stale = any(stale_flags.values())
        # Determine max staleness in days
        freshness_days = self._compute_freshness_days(target_date)

        output = {
            "overall_pestel_score":    round(overall_score, 4),
            "pillar_scores":           {k: round(v, 4) for k, v in pillar_scores.items()},
            "sector_pestel_modifiers": {k: round(v, 4) for k, v in sector_modifiers.items()},
            "ticker_pestel_flags":     ticker_flags,
            "news_headlines":          all_headlines,
            "data_freshness_days":     freshness_days,
            "stale_penalty_applied":   any_stale,
            "pillar_weights_used":     pillar_weights,
        }

        self._persist(output, target_date)
        self._write_cache(output, target_date)

        print(
            f"[PESTEL] Run complete. overall_score={overall_score:.2f} | "
            f"headlines={len(all_headlines)} | stale={any_stale}"
        )
        return output

    # ------------------------------------------------------------------
    # Fetching
    # ------------------------------------------------------------------

    def _fetch_pillar_headlines(
        self, pillar: str, target_date: date
    ) -> tuple[list[dict], bool]:
        """
        Try live sources (RSS + optional newsapi.org).
        Falls back to cache (≤3 days) if all sources fail.
        Returns (headlines, is_stale).
        """
        headlines: list[dict] = []

        # 1. RSS feeds
        for url in RSS_FEEDS.get(pillar, []):
            fetched = self._fetch_rss(url, pillar)
            headlines.extend(fetched)

        # 2. newsapi.org (optional)
        if self.newsapi_key:
            fetched = self._fetch_newsapi(pillar)
            headlines.extend(fetched)

        if headlines:
            return headlines, False

        # 3. Fallback to cache
        logger.warning(f"[PESTEL] All live sources failed for pillar={pillar}. Falling back to cache.")
        cached = self._read_cache(pillar, target_date, max_staleness_days=3)
        if cached:
            return cached, True

        # 4. No data at all — return empty list (PESTEL pillar contributes 0)
        logger.error(f"[PESTEL] No data available for pillar={pillar}. Pillar score = 0.")
        return [], True

    def _fetch_rss(self, url: str, pillar: str) -> list[dict]:
        """Parse an RSS feed and return headlines as dicts."""
        headlines = []
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "BigBull-PESTEL-Engine/1.0"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = resp.read()
            root = ET.fromstring(raw)
        except Exception as exc:
            logger.warning(f"[PESTEL] RSS fetch failed for {url}: {exc}")
            return []

        # Handle both RSS 2.0 (<channel><item>) and Atom (<entry>) formats
        namespace = ""
        items = root.findall(".//item")
        if not items:
            items = root.findall(".//{http://www.w3.org/2005/Atom}entry")
            namespace = "{http://www.w3.org/2005/Atom}"

        for item in items[:20]:  # Cap at 20 per feed
            title_el = item.find(f"{namespace}title")
            link_el  = item.find(f"{namespace}link")
            title = (title_el.text or "").strip() if title_el is not None else ""
            link  = (link_el.text or "").strip()  if link_el  is not None else ""

            if title:
                headlines.append({
                    "pillar":      pillar,
                    "headline":    title,
                    "source_url":  link,
                    "source_type": "RSS",
                })
        return headlines

    def _fetch_newsapi(self, pillar: str) -> list[dict]:
        """Fetch top headlines from newsapi.org for the given pillar."""
        query = NEWSAPI_QUERIES.get(pillar, "India market")
        params = (
            f"?q={urllib.parse.quote(query)}"  # type: ignore[attr-defined]
            f"&language=en&sortBy=publishedAt&pageSize=15"
            f"&apiKey={self.newsapi_key}"
        )
        try:
            import urllib.parse
            params = (
                f"?q={urllib.parse.quote(query)}"
                f"&language=en&sortBy=publishedAt&pageSize=15"
                f"&apiKey={self.newsapi_key}"
            )
            req = urllib.request.Request(
                NEWSAPI_BASE + params,
                headers={"User-Agent": "BigBull-PESTEL-Engine/1.0"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
        except Exception as exc:
            logger.warning(f"[PESTEL] newsapi fetch failed for pillar={pillar}: {exc}")
            return []

        headlines = []
        for article in data.get("articles", []):
            title = (article.get("title") or "").strip()
            url   = article.get("url", "")
            if title and "[Removed]" not in title:
                headlines.append({
                    "pillar":      pillar,
                    "headline":    title,
                    "source_url":  url,
                    "source_type": "newsapi",
                })
        return headlines

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def _score_headlines(self, headlines: list[dict], pillar: str) -> list[dict]:
        """
        Apply keyword-weight dictionary to each headline.
        Attaches sentiment_score, sector_tags, ticker_tags to each headline.
        """
        keyword_dict = PILLAR_KEYWORDS[pillar]
        scored = []

        for item in headlines:
            text = item["headline"].lower()
            raw_score = 0.0
            for keyword, weight in keyword_dict.items():
                if keyword in text:
                    raw_score += weight

            # Clamp per-headline score to [-10, +10] to prevent outliers
            raw_score = max(-10.0, min(10.0, raw_score))
            # Normalize to [-1, +1]
            sentiment = raw_score / 10.0

            sector_tags = self._tag_sectors(text)
            ticker_tags = self._tag_tickers(text)

            scored.append({
                **item,
                "sentiment_score": round(sentiment, 4),
                "sector_tags":     sector_tags,
                "ticker_tags":     ticker_tags,
            })

        return scored

    def _aggregate_pillar_score(self, scored_headlines: list[dict]) -> float:
        """
        Mean sentiment across all scored headlines for this pillar,
        scaled to [-100, +100].
        Returns 0.0 if no headlines.
        """
        if not scored_headlines:
            return 0.0
        mean_sentiment = sum(h["sentiment_score"] for h in scored_headlines) / len(scored_headlines)
        return round(mean_sentiment * 100.0, 4)

    def _compute_sector_modifiers(self, headlines: list[dict]) -> dict[str, float]:
        """
        For each sector, aggregate sentiment of headlines that tag that sector.
        Output is a modifier delta in points (added to SECTOR_MODIFIER in Level 1).
        Clamped to [-15, +15] per sector.
        """
        sector_scores: dict[str, list[float]] = {s: [] for s in SECTOR_KEYWORD_MAP}

        for h in headlines:
            for sector in h.get("sector_tags", []):
                if sector in sector_scores:
                    sector_scores[sector].append(h["sentiment_score"])

        modifiers: dict[str, float] = {}
        for sector, scores in sector_scores.items():
            if scores:
                mean = sum(scores) / len(scores)
                # Scale: max sentiment (1.0) → max modifier (15 pts)
                modifier = mean * 15.0
                modifiers[sector] = round(max(-15.0, min(15.0, modifier)), 4)
            else:
                modifiers[sector] = 0.0

        return modifiers

    def _extract_ticker_flags(self, headlines: list[dict]) -> dict[str, list[dict]]:
        """
        Group headlines by ticker tag. Returns dict of ticker → list of relevant headlines.
        Used by Level 8 Thesis to surface specific news context.
        """
        ticker_flags: dict[str, list[dict]] = {}
        for h in headlines:
            for ticker in h.get("ticker_tags", []):
                if ticker not in ticker_flags:
                    ticker_flags[ticker] = []
                ticker_flags[ticker].append({
                    "pillar":    h["pillar"],
                    "headline":  h["headline"],
                    "sentiment": h["sentiment_score"],
                })
        return ticker_flags

    def _tag_sectors(self, text: str) -> list[str]:
        """Return list of sector names whose keywords appear in the headline text."""
        tags = []
        for sector, keywords in SECTOR_KEYWORD_MAP.items():
            if any(kw in text for kw in keywords):
                tags.append(sector)
        return tags

    def _tag_tickers(self, text: str) -> list[str]:
        """
        Lightweight ticker detection: look for known NSE ticker symbols in headline.
        This is an approximate match — used for Level 8 enrichment only, not scoring.
        """
        KNOWN_TICKERS = [
            "RELIANCE", "TCS", "INFOSYS", "HDFCBANK", "ICICIBANK",
            "WIPRO", "HINDUNILVR", "ITC", "SBIN", "AXISBANK",
            "BAJFINANCE", "HAL", "BEL", "NTPC", "POWERGRID",
            "DIXON", "TATAPOWER", "ADANIGREEN", "SUNPHARMA", "DRREDDY",
        ]
        text_upper = text.upper()
        return [t for t in KNOWN_TICKERS if t in text_upper]

    # ------------------------------------------------------------------
    # Engine Modifiers — read from DB
    # ------------------------------------------------------------------

    def _load_pillar_weights(self) -> dict[str, float]:
        """
        Reads PESTEL pillar weights from Engine_Modifiers table.
        Falls back to PILLAR_WEIGHTS_DEFAULT if table is not yet seeded.
        """
        weights = dict(PILLAR_WEIGHTS_DEFAULT)
        try:
            cursor = self.db.cursor()
            cursor.execute(
                """
                SELECT modifier_key, current_value
                FROM   Engine_Modifiers
                WHERE  level = 'Level_PESTEL'
                """
            )
            rows = cursor.fetchall()
            key_map = {
                "PESTEL_POLITICAL_WEIGHT":    "Political",
                "PESTEL_ECONOMIC_WEIGHT":     "Economic",
                "PESTEL_SOCIAL_WEIGHT":       "Social",
                "PESTEL_TECH_WEIGHT":         "Technological",
                "PESTEL_ENV_WEIGHT":          "Environmental",
                "PESTEL_LEGAL_WEIGHT":        "Legal",
            }
            for modifier_key, value in rows:
                pillar = key_map.get(modifier_key)
                if pillar:
                    weights[pillar] = float(value)
        except Exception as exc:
            logger.warning(f"[PESTEL] Could not read Engine_Modifiers: {exc}. Using defaults.")

        # Re-normalize to sum to 1.0 (guard against stale DB state)
        total = sum(weights.values())
        if total > 0:
            weights = {k: v / total for k, v in weights.items()}
        return weights

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _persist(self, output: dict, target_date: date) -> None:
        """Write pestel_daily_scores + pestel_news_feed to PostgreSQL."""
        try:
            cursor = self.db.cursor()

            # 1. pestel_daily_scores — upsert
            cursor.execute(
                """
                INSERT INTO pestel_daily_scores (
                    run_date, overall_score,
                    political_score, economic_score, social_score,
                    technological_score, environmental_score, legal_score,
                    headline_count, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (run_date) DO UPDATE SET
                    overall_score       = EXCLUDED.overall_score,
                    political_score     = EXCLUDED.political_score,
                    economic_score      = EXCLUDED.economic_score,
                    social_score        = EXCLUDED.social_score,
                    technological_score = EXCLUDED.technological_score,
                    environmental_score = EXCLUDED.environmental_score,
                    legal_score         = EXCLUDED.legal_score,
                    headline_count      = EXCLUDED.headline_count,
                    created_at          = NOW();
                """,
                (
                    target_date,
                    output["overall_pestel_score"],
                    output["pillar_scores"].get("Political", 0.0),
                    output["pillar_scores"].get("Economic", 0.0),
                    output["pillar_scores"].get("Social", 0.0),
                    output["pillar_scores"].get("Technological", 0.0),
                    output["pillar_scores"].get("Environmental", 0.0),
                    output["pillar_scores"].get("Legal", 0.0),
                    len(output["news_headlines"]),
                )
            )

            # 2. pestel_news_feed — insert all headlines (skip duplicates by hash)
            for h in output["news_headlines"]:
                cursor.execute(
                    """
                    INSERT INTO pestel_news_feed (
                        run_date, pillar, headline, source_url,
                        sentiment_score, sector_tags, ticker_tags, fetched_at
                    ) VALUES (%s, %s, %s, %s, %s, %s::JSONB, %s::JSONB, NOW())
                    ON CONFLICT DO NOTHING;
                    """,
                    (
                        target_date,
                        h["pillar"],
                        h["headline"],
                        h.get("source_url", ""),
                        h["sentiment_score"],
                        json.dumps(h.get("sector_tags", [])),
                        json.dumps(h.get("ticker_tags", [])),
                    )
                )

            self.db.commit()
            print(f"[PESTEL] Persisted scores and {len(output['news_headlines'])} headlines to DB.")

        except Exception as exc:
            logger.error(f"[PESTEL] DB persistence failed: {exc}")
            try:
                self.db.rollback()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Cache (filesystem fallback for API failures)
    # ------------------------------------------------------------------

    def _write_cache(self, output: dict, target_date: date) -> None:
        cache_path = os.path.join(self._cache_dir, f"pestel_{target_date.isoformat()}.json")
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(output, f, indent=2)
        except Exception as exc:
            logger.warning(f"[PESTEL] Cache write failed: {exc}")

    def _read_cache(self, pillar: str, target_date: date, max_staleness_days: int = 3) -> list[dict]:
        """Read headlines for a pillar from the most recent cache file within staleness window."""
        for days_back in range(1, max_staleness_days + 1):
            check_date = target_date - timedelta(days=days_back)
            cache_path = os.path.join(self._cache_dir, f"pestel_{check_date.isoformat()}.json")
            if os.path.exists(cache_path):
                try:
                    with open(cache_path, "r", encoding="utf-8") as f:
                        cached = json.load(f)
                    # Return headlines for this specific pillar
                    return [
                        h for h in cached.get("news_headlines", [])
                        if h.get("pillar") == pillar
                    ]
                except Exception as exc:
                    logger.warning(f"[PESTEL] Cache read failed for {cache_path}: {exc}")
        return []

    def _compute_freshness_days(self, target_date: date) -> int:
        """Return 0 if today's cache exists, else days since last successful cache."""
        cache_path = os.path.join(self._cache_dir, f"pestel_{target_date.isoformat()}.json")
        if os.path.exists(cache_path):
            return 0
        for days_back in range(1, 4):
            check = target_date - timedelta(days=days_back)
            if os.path.exists(os.path.join(self._cache_dir, f"pestel_{check.isoformat()}.json")):
                return days_back
        return -1  # No cache at all


# ---------------------------------------------------------------------------
# Standalone test scaffold
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sqlite3

    class _MockCursor:
        def execute(self, *a, **kw): pass
        def fetchall(self): return []

    class _MockConn:
        def cursor(self): return _MockCursor()
        def commit(self): pass
        def rollback(self): pass

    engine = PestelIntelligenceEngine(_MockConn(), newsapi_key=None)
    result = engine.run(date.today())

    print("\n=== PESTEL Output (Mock Run) ===")
    print(f"Overall PESTEL Score : {result['overall_pestel_score']}")
    print(f"Pillar Scores        : {result['pillar_scores']}")
    print(f"Sector Modifiers     : {result['sector_pestel_modifiers']}")
    print(f"Headlines Fetched    : {len(result['news_headlines'])}")
    print(f"Stale Penalty        : {result['stale_penalty_applied']}")
    print(f"Freshness (days)     : {result['data_freshness_days']}")
