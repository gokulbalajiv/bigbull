# Industry_Winner_Selection — Level 3

```yaml
name: "Industry_Winner_Selection"
framework: "OACF"
version: "1.0.0"
type: "analytical_node"
level: 3
phase: "Funnel"
execution_time: "06:50 AM IST"
```

---

## 1. Context

The Industry Winner Selection engine operates at the **stock level** for the first time in the pipeline. For every passing theme from Level 2, it ranks all listed equities within that theme's sector using a "Winner-Takes-Most" (WTM) index — a composite metric that captures competitive moat, margin dominance, and capital efficiency consistency.

Only the **top 3 companies per theme** survive to Level 4. All others are discarded for the day.

**Data Sources:**
- Quarterly financial statements (BSE XBRL / screener.in bulk download)
- Industry average EBITDA from CMIE Prowess database
- Market share proxy data (revenue rank within sub-sector over 4 quarters)
- SEBI shareholding pattern database (for ROCE tracking)

---

## 2. Execution Logic — Winner-Takes-Most (WTM) Index

### 2.1 Universe Construction

For each passing theme from Level 2, construct the **candidate universe**:

```python
def build_candidate_universe(theme: str, sector: str) -> list[str]:
    """
    Returns list of NSE/BSE tickers within the theme's sector.
    Filters:
      - Market Cap > ₹500 Cr (eliminate micro-caps with data gaps)
      - Listed for > 3 years (ensure ROCE history available)
      - Not suspended or under NCLT proceedings
    """
    query = """
        SELECT ticker
        FROM fundamentals_master
        WHERE sector = %s
          AND market_cap_cr > 500
          AND listing_date < CURRENT_DATE - INTERVAL '3 years'
          AND is_suspended = FALSE
          AND is_under_nclt = FALSE
        ORDER BY market_cap_cr DESC
    """
    return execute_query(query, [sector])
```

---

### 2.2 WTM Metric 1 — Market Share Delta

**Measures competitive trajectory over the last 4 quarters (TTM basis).**

```
Revenue_Rank_Q[n] = Rank of company by quarterly revenue within its sub-sector (ascending = better)

Market_Share_Delta = (Revenue_Rank_Q[n−4] − Revenue_Rank_Q[n]) / Revenue_Rank_Q[n−4]
```

> Positive `Market_Share_Delta` = gaining share (higher rank numerically = lower rank = moving up)

**Normalization to [0, 100]:**
```
Market_Share_Delta_Normalized = (Market_Share_Delta + 1) / 2 × 100
# Clamp: max(0, min(100, value))
```

**Worked Example:**
```
Company: DIXON_TECHNOLOGIES
Q[n-4] Revenue Rank = 3rd  (in Electronics sub-sector)
Q[n]   Revenue Rank = 1st

Market_Share_Delta = (3 - 1) / 3 = +0.667
Normalized = (0.667 + 1) / 2 × 100 = 83.35
```

---

### 2.3 WTM Metric 2 — EBITDA Margin Premium

**Measures margin superiority relative to the industry average in the same sub-sector.**

```
EBITDA_Margin_Company    = (EBITDA_TTM / Revenue_TTM) × 100
EBITDA_Margin_Industry   = Weighted average EBITDA margin of all listed peers in sub-sector (TTM)
EBITDA_Margin_Premium    = EBITDA_Margin_Company − EBITDA_Margin_Industry
```

**Normalization to [0, 100]:**
```
# Typical range of EBITDA premium is [-15%, +15%] for Indian markets
EBITDA_Premium_Normalized = ((EBITDA_Margin_Premium + 15) / 30) × 100
# Clamp: max(0, min(100, value))
```

**Worked Example:**
```
Company EBITDA Margin:  22.4%
Industry Avg Margin:    14.1%
Premium:                +8.3%

Normalized = ((8.3 + 15) / 30) × 100 = (23.3 / 30) × 100 = 77.67
```

---

### 2.4 WTM Metric 3 — ROCE Consistency

**Measures the stability of capital efficiency over a 5-year period.**

Lower standard deviation of ROCE indicates a company that consistently earns high returns without boom-bust cycles.

```
ROCE[y] = EBIT[y] / Capital_Employed[y] × 100

where Capital_Employed[y] = Total_Assets[y] − Current_Liabilities[y]

ROCE_5Y_Mean = Mean(ROCE[y] for y in [FY-5, FY-4, FY-3, FY-2, FY-1])
ROCE_5Y_SD   = √( (1/(n-1)) × Σ(ROCE[y] − ROCE_5Y_Mean)² )  for n=5
```

**Scoring (lower SD = better = higher score):**
```
# Score is inversely proportional to SD
# If SD < MIN_ROCE_SD: perfect score candidate
# If SD > 15: penalized heavily

ROCE_Consistency_Score = max(0, 100 − ((ROCE_5Y_SD / 15) × 100))
```

**Worked Example:**
```
ROCE History (5 years): [24.1, 26.3, 23.8, 25.1, 24.7]
ROCE_5Y_Mean = 24.80
ROCE_5Y_SD   = √((0.49 + 2.25 + 1.00 + 0.09 + 0.01) / 4) = √(0.96) = 0.98

ROCE_Consistency_Score = 100 − ((0.98 / 15) × 100) = 100 − 6.53 = 93.47
```

---

### 2.5 Composite WTM Index

```
WTM_Index = (Market_Share_Delta_Normalized × MARKET_SHARE_WEIGHT)
           + (EBITDA_Premium_Normalized    × MARGIN_PREMIUM_WEIGHT)
           + (ROCE_Consistency_Score       × ROCE_CONSISTENCY_WEIGHT)
```

Where the three weights must sum to 1.0.

**Full computation function:**
```python
def compute_wtm_index(ticker: str, sector: str, industry_ebitda_avg: float) -> dict:
    fin = fetch_financials(ticker)

    # Metric 1: Market Share Delta
    rank_4q_ago  = fetch_revenue_rank(ticker, sector, quarters_ago=4)
    rank_current = fetch_revenue_rank(ticker, sector, quarters_ago=0)
    ms_delta_raw = (rank_4q_ago - rank_current) / rank_4q_ago if rank_4q_ago > 0 else 0
    ms_normalized = max(0, min(100, (ms_delta_raw + 1) / 2 * 100))

    # Metric 2: EBITDA Margin Premium
    ebitda_margin = (fin['ebitda_ttm'] / fin['revenue_ttm']) * 100
    margin_premium = ebitda_margin - industry_ebitda_avg
    margin_normalized = max(0, min(100, (margin_premium + 15) / 30 * 100))

    # Metric 3: ROCE Consistency
    roce_history = [fetch_roce(ticker, year) for year in range(-5, 0)]
    roce_mean    = sum(roce_history) / len(roce_history)
    roce_sd      = (sum((r - roce_mean)**2 for r in roce_history) / (len(roce_history) - 1)) ** 0.5
    roce_score   = max(0, 100 - (roce_sd / 15 * 100))

    # Failure gate: if ROCE SD too high
    if roce_sd > MIN_ROCE_SD_MAX:
        return {"ticker": ticker, "wtm_index": 0.0, "disqualified": True,
                "reason": f"ROCE_SD={roce_sd:.2f} exceeds MAX_ROCE_SD threshold"}

    wtm_index = (ms_normalized    * MARKET_SHARE_WEIGHT) + \
                (margin_normalized * MARGIN_PREMIUM_WEIGHT) + \
                (roce_score        * ROCE_CONSISTENCY_WEIGHT)

    return {
        "ticker":             ticker,
        "wtm_index":          round(wtm_index, 4),
        "market_share_score": round(ms_normalized, 4),
        "margin_score":       round(margin_normalized, 4),
        "roce_score":         round(roce_score, 4),
        "roce_5y_sd":         round(roce_sd, 4),
        "ebitda_margin_pct":  round(ebitda_margin, 2),
        "margin_premium_pct": round(margin_premium, 2),
        "disqualified":       False
    }
```

---

### 2.6 Ranking & Top 3 Selection

```python
def select_top3_per_theme(theme: str, candidates: list[str]) -> list[dict]:
    scores = [compute_wtm_index(t, THEME_TO_SECTOR_MAP[theme], industry_ebitda) 
              for t in candidates]
    qualified = [s for s in scores if not s.get('disqualified', False)]
    ranked    = sorted(qualified, key=lambda x: x['wtm_index'], reverse=True)
    top3      = ranked[:3]  # Hard cap at 3 per theme
    return top3
```

---

## 3. Output Schema

```json
{
  "engine_level": 3,
  "run_date": "2024-01-15",
  "run_ts": "2024-01-15T06:53:41+05:30",
  "themes_processed": 6,
  "total_candidates_evaluated": 87,
  "shortlisted_equities": [
    {
      "theme": "PLI_Electronics",
      "rank_within_theme": 1,
      "ticker": "DIXON",
      "wtm_index": 81.42,
      "market_share_score": 83.35,
      "margin_score": 77.67,
      "roce_score": 84.20,
      "roce_5y_sd": 2.38,
      "ebitda_margin_pct": 5.80,
      "margin_premium_pct": 2.40
    },
    {
      "theme": "Defence_Indigenization",
      "rank_within_theme": 1,
      "ticker": "HAL",
      "wtm_index": 88.15,
      "market_share_score": 95.00,
      "margin_score": 82.33,
      "roce_score": 93.47,
      "roce_5y_sd": 0.98,
      "ebitda_margin_pct": 22.40,
      "margin_premium_pct": 8.30
    }
  ],
  "total_shortlisted": 18,
  "equities_discarded": 69
}
```

---

## 4. Approval Gate

| Condition | Action |
|---|---|
| Company has ROCE_SD > `MIN_ROCE_SD_MAX` (15.0) | Disqualified from ranking, logged |
| Fewer than 3 candidates pass per theme | Allow all passing candidates (no minimum forced) |
| Theme has zero qualified candidates | Theme is dropped; Level 2 fallback cache used |

---

## 5. Logic Modifiers & Thresholds

These values are stored in `Engine_Modifiers` table (`level = 'Level_3'`) and can be dynamically adjusted by `level10_learning.md`.

| Modifier Key | Default Value | Description | Adjustment Bounds |
|---|---|---|---|
| `MARKET_SHARE_WEIGHT` | `0.60` | Weight of Market Share Delta in WTM Index | [0.30, 0.80] |
| `MARGIN_PREMIUM_WEIGHT` | `0.40` | Weight of EBITDA Margin Premium in WTM Index | [0.20, 0.60] |
| `ROCE_CONSISTENCY_WEIGHT` | `0.00` | Weight of ROCE Consistency (currently auxiliary) | [0.00, 0.30] |
| `MIN_ROCE_SD` | `3.0` | Standard deviation of ROCE below which a company is considered "consistent" | [1.0, 6.0] |
| `MIN_ROCE_SD_MAX` | `15.0` | SD above which company is auto-disqualified | [10.0, 20.0] |
| `MIN_MARKET_CAP_CR` | `500` | Minimum market cap in ₹Cr for universe inclusion | [200, 2000] |
| `EBITDA_PREMIUM_RANGE` | `30.0` | Normalization range for EBITDA premium (±15% = 30% total) | [20.0, 40.0] |
| `STOCKS_PER_THEME` | `3` | Maximum stocks selected per theme | [2, 5] |

> **Tuning Note:** `MARKET_SHARE_WEIGHT + MARGIN_PREMIUM_WEIGHT + ROCE_CONSISTENCY_WEIGHT` must = 1.0. When Level 10 adjusts ROCE_CONSISTENCY_WEIGHT from 0.00 to a positive value, the other two weights must be re-normalized proportionally.

---

## 6. Cross-References

- **Upstream:** [level2_theme.md](./level2_theme.md) provides `active_themes[]` with associated sectors
- **Downstream:** [level4_management.md](./level4_management.md) receives `shortlisted_equities[]` for capital audit
- **Learning:** [level10_learning.md](./level10_learning.md) adjusts `MARKET_SHARE_WEIGHT` and `MARGIN_PREMIUM_WEIGHT` if winners consistently come from margin-dominated vs share-growth companies
- **DB:** Reads `Engine_Modifiers` (Level_3); no direct writes
