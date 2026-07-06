# Theme_Discovery_Engine — Level 2

```yaml
name: "Theme_Discovery_Engine"
framework: "OACF"
version: "1.0.0"
type: "analytical_node"
level: 2
phase: "Funnel"
execution_time: "06:40 AM IST"
```

---

## 1. Context

The Theme Discovery Engine transforms **government policy signals** and **corporate capital allocation** data into a scored, ranked list of structural growth themes. Only themes with a `Theme_Confidence` score above `MIN_THEME_SCORE` survive to Level 3 industry filtering.

This engine ensures the engine does not chase momentum — it forces every shortlisted stock to belong to a **verifiable, government-backed or capex-driven structural theme**.

**Data Sources:**
- GoI Press Release feed (pib.gov.in) — parsed via NLP
- PLI scheme disbursement data (DPIIT portal)
- BSE/NSE corporate filing bulk data (XBRL) — capex line items
- CMIE Capex Database (sector-level YoY)
- **`pestel_news_feed` table** — live headlines from `PestelIntelligenceEngine` (all 6 pillars), injected as additional NLP corpus documents

---

## 2. Execution Logic

### 2.1 Theme Discovery Pass

**Step 1 — Scan & Parse Sources**

```python
# NLP keyword scoring for each document
KEYWORD_UNIVERSE = {
    # Tier 1: Direct policy words (highest weight)
    "PLI": 3.0, "production linked incentive": 3.0, "capex": 2.5,
    "infrastructure": 2.5, "semiconductor": 3.0, "green hydrogen": 3.0,
    "defence indigenization": 3.0, "solar": 2.0, "EV": 2.5,
    "smart city": 2.0, "data centre": 2.5, "specialty chemicals": 2.0,

    # Tier 2: Supporting signals
    "order book": 1.5, "backward integration": 1.5, "import substitution": 2.0,
    "export incentive": 1.5, "GCC": 2.0, "global capability centre": 2.0,

    # Tier 3: Contextual indicators
    "hiring": 1.0, "capacity expansion": 1.5, "approved": 1.0,
    "disbursed": 2.0, "sanctioned": 1.5, "commissioning": 1.5
}

def score_document(text: str) -> float:
    """Score an NLP document for theme relevance."""
    text_lower = text.lower()
    raw_score = 0.0
    for keyword, weight in KEYWORD_UNIVERSE.items():
        occurrences = text_lower.count(keyword)
        raw_score += occurrences * weight * NLP_KEYWORD_MULTIPLIER
    return raw_score
```

**Step 1.5 — Inject PESTEL News Headlines as Additional NLP Documents**

Before running the theme-scoring loop, retrieve today's PESTEL headlines from `pestel_news_feed` and add them to the NLP corpus. This gives the theme engine real-time context from all six pillars (Political, Economic, Social, Technological, Environmental, Legal).

```python
def build_pestel_nlp_corpus(db_conn, run_date: date) -> list[dict]:
    """
    Fetch today's PESTEL headlines from DB and wrap them in the standard
    corpus document format expected by identify_themes_from_corpus().
    """
    cursor = db_conn.cursor()
    cursor.execute(
        """
        SELECT pillar, headline, source_url
        FROM   pestel_news_feed
        WHERE  run_date = %s
        ORDER  BY ABS(sentiment_score) DESC  -- prioritize high-signal headlines
        LIMIT  100
        """,
        (run_date,)
    )
    rows = cursor.fetchall()
    return [
        {
            "source": f"PESTEL_{pillar}",
            "date":   run_date.isoformat(),
            "text":   headline
        }
        for pillar, headline, _ in rows
    ]

# Merge PESTEL corpus into main corpus before scoring
pestel_documents = build_pestel_nlp_corpus(db_conn, today)
corpus = goi_press_releases + pestel_documents  # pestel docs get recency_factor=1.0 (today)
```

**Step 2 — Identify Active Themes from Parsed Sources**

```python
# For each candidate theme (from a predefined taxonomy of 25+ Indian macro themes)
THEME_TAXONOMY = [
    "PLI_Electronics", "PLI_Pharma_APIs", "PLI_Specialty_Chemicals",
    "Defence_Indigenization", "Renewable_Energy_Solar", "Green_Hydrogen",
    "EV_Ecosystem", "Semiconductor_Fab", "Data_Centre_Infrastructure",
    "Railway_Infrastructure", "Roads_Highways", "Affordable_Housing",
    "Digital_India_IT_Services", "GCC_Expansion", "Tourism_Hotels",
    "Agri_Value_Chain", "Logistics_Cold_Chain", "Water_Infrastructure",
    "Textiles_MSME", "Insurance_Penetration", "Wealth_Management_AMC",
    "Battery_Storage", "Space_Tech", "Nuclear_Energy", "Port_Logistics"
]

def identify_themes_from_corpus(corpus: list[dict]) -> dict[str, float]:
    """
    corpus: list of { 'source': str, 'date': str, 'text': str }
    Returns: { theme_name: raw_nlp_score }
    """
    theme_nlp_scores = {theme: 0.0 for theme in THEME_TAXONOMY}
    for document in corpus:
        # Apply recency decay: documents older than 30 days get 0.7x weight
        age_days = (today - parse_date(document['date'])).days
        recency_factor = 0.7 if age_days > 30 else 1.0
        doc_score = score_document(document['text']) * recency_factor
        # Map to theme taxonomy using keyword matching
        for theme in THEME_TAXONOMY:
            theme_keywords = THEME_TO_KEYWORD_MAP[theme]  # Pre-defined mapping
            if any(kw in document['text'].lower() for kw in theme_keywords):
                theme_nlp_scores[theme] += doc_score
    return theme_nlp_scores
```

---

### 2.2 Theme Confidence Formula

For each identified theme, compute the **Theme_Confidence** score using two primary data vectors:

**Formula:**
```
Theme_Confidence = (PLI_Allocation_Cr × 0.4) + (YoY_Sector_Capex_Growth × 0.6)
```

Where:
- `PLI_Allocation_Cr` = Total PLI disbursement for the theme's sector in ₹Crores, **normalized to [0, 100]** using:

```
PLI_Allocation_Normalized = (PLI_Allocation_Cr / MAX_PLI_ALLOCATION_IN_DB) × 100
```

- `YoY_Sector_Capex_Growth` = Sector-wide capex YoY growth percentage, clipped to [0, 100]:

```
YoY_Sector_Capex_Growth = ((Sector_Capex_Current_FY - Sector_Capex_Prev_FY) / Sector_Capex_Prev_FY) × 100
YoY_Sector_Capex_Growth = min(100, max(0, YoY_Sector_Capex_Growth))
```

**NLP Amplification:** If the theme has significant NLP signal, apply the `NLP_KEYWORD_MULTIPLIER`:

```python
def compute_theme_confidence(
    pli_allocation_cr: float,
    yoy_capex_growth_pct: float,
    nlp_score: float,
    max_pli_in_db: float
) -> float:
    pli_normalized  = (pli_allocation_cr / max_pli_in_db) * 100
    capex_clamped   = min(100.0, max(0.0, yoy_capex_growth_pct))
    base_confidence = (pli_normalized * 0.4) + (capex_clamped * 0.6)

    # NLP amplification (applied only if NLP score is above a minimum signal threshold)
    if nlp_score > 5.0:
        amplification = 1.0 + (min(nlp_score, 50.0) / 50.0) * (NLP_KEYWORD_MULTIPLIER - 1.0)
        base_confidence = base_confidence * amplification

    # Apply Level 1 sector weight as final multiplier
    sector_weight = regime_output["sector_weights"].get(THEME_TO_SECTOR_MAP[theme], 1.0)
    return base_confidence * sector_weight
```

**Worked Example:**
```
Theme: PLI_Electronics
PLI_Allocation_Cr   = ₹12,000 Cr  →  normalized to 80.0
YoY_Capex_Growth    = 45.2%       →  clamped to 45.2
NLP_Score           = 18.5        →  above threshold

Base_Confidence = (80.0 × 0.4) + (45.2 × 0.6) = 32.0 + 27.12 = 59.12
Amplification   = 1.0 + (18.5/50.0) × (1.15 - 1.0) = 1.0 + 0.0555 = 1.0555
NLP_Adjusted    = 59.12 × 1.0555 = 62.40
Sector_Weight   = 1.10 (Infrastructure favored by Level 1)
Theme_Confidence = 62.40 × 1.10 = 68.64  ✅ (> MIN_THEME_SCORE of 65.0)
```

---

### 2.3 Approval Gate

```python
passing_themes = {
    theme: score
    for theme, score in theme_confidence_scores.items()
    if score >= MIN_THEME_SCORE
}

if len(passing_themes) == 0:
    # Fallback: Take top 3 themes regardless of threshold, apply 20% penalty
    passing_themes = dict(sorted(theme_confidence_scores.items(),
                                  key=lambda x: x[1], reverse=True)[:3])
    fallback_penalty = 0.20
    passing_themes = {k: v * (1 - fallback_penalty) for k, v in passing_themes.items()}
```

---

### 2.4 Theme Ranking

Themes surviving the gate are ranked by `Theme_Confidence DESC`. The top `MAX_ACTIVE_THEMES` themes are passed to Level 3.

```python
ranked_themes = sorted(passing_themes.items(), key=lambda x: x[1], reverse=True)
top_themes = ranked_themes[:MAX_ACTIVE_THEMES]
```

---

## 3. Output Schema

```json
{
  "engine_level": 2,
  "run_date": "2024-01-15",
  "run_ts": "2024-01-15T06:44:22+05:30",
  "themes_scanned": 25,
  "themes_passing": 6,
  "active_themes": [
    {
      "theme_id": "PLI_Electronics",
      "theme_confidence": 68.64,
      "pli_allocation_cr": 12000,
      "yoy_capex_growth_pct": 45.2,
      "nlp_signal_score": 18.5,
      "sector_weight_applied": 1.10,
      "associated_sector": "Capital Goods / Electronics"
    },
    {
      "theme_id": "Defence_Indigenization",
      "theme_confidence": 77.30,
      "pli_allocation_cr": 8500,
      "yoy_capex_growth_pct": 62.0,
      "nlp_signal_score": 31.0,
      "sector_weight_applied": 1.15,
      "associated_sector": "Defence"
    },
    {
      "theme_id": "EV_Ecosystem",
      "theme_confidence": 65.80,
      "pli_allocation_cr": 9750,
      "yoy_capex_growth_pct": 38.5,
      "nlp_signal_score": 22.0,
      "sector_weight_applied": 1.05,
      "associated_sector": "Auto / Ancillaries"
    }
  ],
  "discarded_themes": ["Tourism_Hotels", "Agri_Value_Chain", "Textiles_MSME"]
}
```

---

## 4. Logic Modifiers & Thresholds

These values are stored in `Engine_Modifiers` table (`level = 'Level_2'`) and can be dynamically adjusted by `level10_learning.md`.

| Modifier Key | Default Value | Description | Adjustment Bounds |
|---|---|---|---|
| `MIN_THEME_SCORE` | `65.0` | Minimum Theme_Confidence for a theme to pass the gate | [40.0, 85.0] |
| `NLP_KEYWORD_MULTIPLIER` | `1.15` | Amplification factor applied when NLP signal is strong | [1.00, 1.50] |
| `PLI_ALLOCATION_WEIGHT` | `0.40` | Weight of PLI disbursement in Theme_Confidence formula | [0.20, 0.60] |
| `CAPEX_GROWTH_WEIGHT` | `0.60` | Weight of YoY capex growth in Theme_Confidence formula | [0.40, 0.80] |
| `MAX_ACTIVE_THEMES` | `8` | Maximum number of themes passed to Level 3 | [4, 12] |
| `RECENCY_DECAY_DAYS` | `30` | Documents older than this get `0.7×` NLP weight | [15, 60] |
| `RECENCY_DECAY_FACTOR` | `0.70` | Multiplier applied to NLP score of stale documents | [0.40, 0.90] |
| `NLP_MINIMUM_SIGNAL` | `5.0` | NLP score below which amplification is NOT applied | [2.0, 15.0] |
| `FALLBACK_PENALTY` | `0.20` | Score penalty when the fallback (no themes pass) is triggered | [0.10, 0.30] |

> **Tuning Note:** `PLI_ALLOCATION_WEIGHT + CAPEX_GROWTH_WEIGHT` must always equal `1.0`. If Level 10 adjusts one, it must recalculate the other as `1.0 − adjusted_weight`.

---

## 5. Cross-References

- **Upstream:** [level1_macro.md](./level1_macro.md) provides `sector_weights{}` applied during NLP amplification step
- **Upstream:** [pestel_intelligence_engine.py](./services/pestel_intelligence_engine.py) provides PESTEL headlines via `pestel_news_feed` table as additional NLP corpus
- **Downstream:** [level3_industry.md](./level3_industry.md) takes `active_themes[]` and finds top 3 stocks per theme
- **Learning:** [level10_learning.md](./level10_learning.md) adjusts `MIN_THEME_SCORE` and `NLP_KEYWORD_MULTIPLIER` based on false negatives at this level
- **DB:** Reads modifiers from `Engine_Modifiers` table; reads `pestel_news_feed` for additional NLP signals; no direct DB writes (stateless pass-through)
