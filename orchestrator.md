# BigBull_Orchestrator

```yaml
name: "BigBull_Orchestrator"
framework: "OACF"
version: "1.0.0"
type: "root_controller"
description: "Master DAG controller for the 10-level analytical engine."
```

---

## 1. Context & Minimal Viable Information (MVI)

The **BigBull Orchestrator** is the root controller for an Indian Equities (BSE/NSE) stock-picking system. It governs the **sequential execution** of 10 analytical sub-agents (Levels 1–10), manages all database read/write state transitions, and enforces two daily scheduled runs:

- **08:00 AM IST** — Morning Projection Run
- **04:30 PM IST** — Post-Market Retrospective Audit

The orchestrator reads from and writes to a PostgreSQL backend (see `db_schema.md`). All inter-agent state is passed as structured JSON payloads. If any **Approval Gate** in Levels 1–4 is triggered, the equity is immediately ejected from the daily processing queue — no partial processing is permitted downstream.

---

## 2. Execution Pipeline & DAG Dependencies

```
[Data Ingestion 06:00 AM]
         │
         ▼
[Level 1: Macro Regime]  ──── sets sector weights ────▶
         │
[Level 2: Theme Discovery]  ─ ranks structural themes ─▶
         │
[Level 3: Industry Filter]  ─ top 3 per theme ──────────▶
         │ ← FUNNEL PHASE COMPLETE (07:00 AM)
         ▼
[Level 4: Capital Allocation]  ─── 10-year audit gate ──▶
         │
[Level 5: Expectations Gap]  ─── EPS vs P/E delta ──────▶
         │
[Level 6: Earnings Surprise]  ── alternative data ───────▶
         │ ← FORENSIC PHASE COMPLETE (07:30 AM)
         ▼
[Level 7: Market Structure]  ─── institutional flow ─────▶
         │
[Level 8: Thesis Memory]  ──── JSON thesis gen ──────────▶
         │
[Level 9: Portfolio Construction]  ── covariance opt ────▶
         │ ← EXECUTION PHASE COMPLETE
         ▼
[PUBLISH: Write Top 10 → Daily_Projections DB (08:00 AM)]
```

### Phase 1 — Data Ingestion (06:00 AM IST)

| Source | Endpoint Type | Data Fetched |
|---|---|---|
| NSE/BSE EOD Feed | REST API | Closing prices, volumes, delivery % |
| SEBI Bulk Deals API | REST API | Block/bulk deal transactions |
| RBI Data Warehouse | Scraper | G-Sec yields, MIBOR rates, CPI release |
| GoI Press Release Feed | NLP Parser | PLI disbursements, policy announcements |
| Alternative Data Layer | REST API | Headcount signals, export volumes, freight indices |
| Brent Crude / FX Feed | REST API | USD/INR spot, Brent $/bbl |
| **PESTEL Intelligence Engine** | **RSS + newsapi.org** | **PIB, RBI, SEBI, MoEFCC headlines → `pestel_output.json`** |

**PESTEL run executes first at 06:00 AM** (before Level 1) so that `pestel_output.json` is available in the ingestion payload when Level 1 starts at 06:30 AM.

**Payload format written to orchestrator state:**

```json
{
  "ingestion_ts": "2024-01-15T06:00:00+05:30",
  "nifty50_close": 21847.9,
  "banknifty_close": 46782.15,
  "usd_inr": 83.12,
  "brent_crude_usd": 78.50,
  "g_sec_10yr_yield": 7.18,
  "mibor_3m": 6.85,
  "cpi_3m_momentum": -0.4,
  "bulk_deals": [...],
  "goi_press_releases": [...],
  "alt_data_status": "OK",
  "pestel_output": {
    "overall_pestel_score": 22.40,
    "pillar_scores": {
      "Political": 18.50, "Economic": 30.00, "Social": 15.00,
      "Technological": 25.00, "Environmental": 20.00, "Legal": -10.00
    },
    "sector_pestel_modifiers": {
      "Banking": -3.50, "IT": +8.20, "Defence": +12.00,
      "Power": +9.00, "Pharma": +2.50
    },
    "ticker_pestel_flags": {
      "HAL": [{"pillar": "Political", "headline": "Cabinet approves ₹2.3L Cr defence plan", "sentiment": 0.90}]
    },
    "headline_count": 87,
    "stale_penalty_applied": false,
    "data_freshness_days": 0
  }
}
```

---

### Phase 2 — Funnel Phase (06:30 AM – 07:00 AM IST)

#### Step 2.0: PESTEL Intelligence Engine (pre-Level 1)
- **Executes:** 06:00 AM IST (immediately after market feeds complete)
- **Service:** `services/pestel_intelligence_engine.py`
- **Reads:** RSS feeds (PIB, RBI, SEBI, MoEFCC) + optional newsapi.org
- **Writes:** `pestel_daily_scores` table + `pestel_news_feed` table + `pestel_output.json` into ingestion payload
- **Fallback:** If all live sources fail, use cached `pestel_daily_scores` ≤ 3 days stale; apply 5% PESTEL weight penalty
- **Dependency:** Must complete before Level 1 reads `ingestion_payload.json`

#### Step 2.1: Level 1 → Macro Regime Engine
- **Reads:** `ingestion_payload.json` (now includes `pestel_output`)
- **Writes:** `regime_output.json` → `{ current_regime, favored_sectors[], penalized_sectors[], sector_weights{}, pestel_pillar_scores{} }`
- **Dependency:** Required before Level 2 can begin

#### Step 2.2: Level 2 → Theme Discovery Engine
- **Reads:** `regime_output.json` + GoI press release NLP corpus + **`pestel_news_feed` headlines** (via DB query)
- **Writes:** `theme_output.json` → `{ active_themes[], theme_confidence_scores{} }`
- **Gate:** Themes with `Theme_Confidence < MIN_THEME_SCORE` are dropped

#### Step 2.3: Level 3 → Industry Winner Selection
- **Reads:** `theme_output.json` + fundamental database (EBITDA, ROCE, Market Share)
- **Writes:** `industry_output.json` → `{ shortlisted_equities[] }` (max 3 per theme)
- **Gate:** Only top 3 stocks per passing theme survive

---

### Phase 3 — Forensic Phase (07:00 AM – 07:30 AM IST)

#### Step 3.1: Level 4 → Capital Allocation Engine
- **Reads:** `industry_output.json` + 10-year financial statements DB
- **Writes:** `capital_output.json` → `{ retained_value_ratios{}, pledge_pct{}, fatal_fails[] }`
- **Gate (FATAL):** `Retained_Value_Ratio < 1.25` OR `Pledge_Pct > 15%` → immediate eject

#### Step 3.2: Level 5 → Expectations Gap Engine
- **Reads:** `capital_output.json` + current P/E, OCF data
- **Writes:** `expectations_output.json` → `{ expectations_gaps{}, valuation_traps[] }`
- **Gate (FATAL):** `Expectations_Gap < 0` → FLAG as Valuation Trap, eject

#### Step 3.3: Level 6 → Earnings Prediction Engine
- **Reads:** `expectations_output.json` + alternative data payload
- **Writes:** `earnings_output.json` → `{ surprise_scores{}, expected_eps_beat_pct{} }`
- **Fallback:** If alt data API times out → use Level 5 intrinsic data + apply **15% confidence penalty** to final conviction score

---

### Phase 4 — Execution Phase (07:30 AM – 08:00 AM IST)

#### Step 4.1: Level 7 → Market Structure Engine
- **Reads:** `earnings_output.json` + FII/DII flow data + promoter action data
- **Writes:** `market_output.json` → `{ institutional_scores{}, distribution_flags[] }`
- **Gate (FATAL):** Retail delivery spike > 300% of 20-day avg AND FII holdings decreasing → Distribution Phase → eject

#### Step 4.2: Level 8 → Thesis Memory Engine
- **Reads:** `market_output.json`
- **Writes:** `thesis_output.json` → individual JSON thesis objects per ticker
- **Stores to:** `Thesis_Ledger` PostgreSQL table

#### Step 4.3: Level 9 → Portfolio Construction Engine
- **Reads:** `thesis_output.json`
- **Writes:** `portfolio_output.json` → `{ final_top10[], covariance_matrix{} }`
- **Constraints:** ≤3 stocks per sector; Portfolio Beta ≤ 1.35 vs Nifty50

---

### Phase 5 — Publish (08:00 AM IST)

**Step 5.1: Publish Top 10 to Dashboard**
```sql
INSERT INTO Daily_Projections (date, rank, ticker, sector, conviction_score, thematic_alpha, thesis_id)
SELECT
    CURRENT_DATE,
    p.rank,
    p.ticker,
    p.sector,
    p.conviction_score,
    p.thematic_alpha,
    t.thesis_id
FROM portfolio_final_payload p
JOIN Thesis_Ledger t ON t.ticker = p.ticker AND t.entry_date = CURRENT_DATE;
```

**Step 5.2: Cache Golden Sample Features (Universe-Wide)**
To prevent data leakage during EoD retro runs, we cache the 07:45 AM feature vectors for all qualified stocks (even those not in the Top 10).
```sql
INSERT INTO Morning_Feature_Snapshot (
    date, ticker, x1_macro, x2_thematic, x3_roce_zscore, x4_rvr,
    x5_exp_gap_pct, x6_surprise, x7_inst_flow_cr, x8_thesis_score
)
SELECT
    CURRENT_DATE,
    f.ticker,
    f.x1_macro, f.x2_thematic, f.x3_roce_zscore, f.x4_rvr,
    f.x5_exp_gap_pct, f.x6_surprise, f.x7_inst_flow_cr, f.x8_thesis_score
FROM execution_phase_memory_pool f;
```

---

## 3. Post-Market Retrospective Pipeline

### 16:30 PM IST — Actual Market Audit

**Data fetch criteria:**
- Source: NSE Bhav Copy + SEBI delivery data
- Filter: `Volume_Traded_Cr > 50` AND `Closing_Price > 100`
- Rank by: `daily_return_pct DESC`

```sql
INSERT INTO Market_Actuals (date, rank, ticker, daily_return_pct, institutional_volume)
SELECT
    CURRENT_DATE,
    RANK() OVER (ORDER BY daily_return_pct DESC) AS rank,
    ticker,
    daily_return_pct,
    institutional_volume_cr
FROM nse_bhav_copy_staging
WHERE volume_traded_cr > 50
  AND closing_price > 100
  AND trade_date = CURRENT_DATE
LIMIT 10;
```

### 16:45 PM IST — Attribution & Learning

- **Execute:** `level10_learning.md`
- **Input:** `ml_feature_store` (T-5 features), `Market_Actuals` (today), `ml_predictions_log`
- **Output:** Updated `ml_feature_store` with cross-sectional alpha labels (0-4), `ml_drift_metrics`, and `Missed_Alpha_Log`.

### 17:00 PM IST — Alpha Discovery Engine (Level 10.5)

The quantitative research suite executes completely decoupled from live training.

- **Execute:** `alpha_discovery.md`
- **Workflow:**
  1. Identifies Actual Top 10/50/Decile stocks → logs to `research_winner_snapshot`.
  2. Runs Prediction Gap Analysis (Precision, Recall, NDCG, Rank IC) → logs to `research_prediction_gaps`.
  3. Filters `research_missed_alpha` (Actual Top Decile, Predicted Rank > 50th Percentile).
  4. Runs UMAP + HDBSCAN clustering on Missed Alpha.
  5. Generates candidate formulas → logs to `research_factor_registry`.
  6. Tracks SHAP drift and winner frequencies → logs to `research_feature_drift`.
- **Output:** Daily Quant Research Report (No auto-training is performed).

### 17:30 PM IST — Feature Orthogonalization Gate (Level 10.75)

Filters redundant factors before validation.

- **Execute:** `orthogonalization_gate.py`
- **Workflow:**
  1. Gram-Schmidt regression of new candidates vs live feature matrix.
  2. Discards collinear bloat.
  3. Passes unique residuals to validation funnel.

---

## 4. Error Handling & Fallbacks

| Failure Scenario | Behaviour | Penalty Applied |
|---|---|---|
| **PESTEL RSS all feeds fail (single pillar)** | Use filesystem cache ≤ 3 days stale for that pillar | −5% on that pillar's contribution |
| **PESTEL all pillars stale** | Use yesterday's `pestel_daily_scores` row; `PESTEL_WEIGHT` halved | Log warning to `Orchestrator_Run_Log` |
| **PESTEL no data at all** | PESTEL score = 0 (neutral); other 4 weights re-normalized to 1.0 | None (safe degradation) |
| **Alt Data API Timeout (Level 6)** | Fallback to Level 5 OCF intrinsic data | −15% confidence penalty on final conviction score |
| **Nifty50/BankNifty Feed Failure** | **HALT entire pipeline** | Alert admin via PagerDuty webhook; do NOT execute blind |
| **GoI NLP Parser Failure (Level 2)** | Use cached last-known theme scores (max 5 days stale) | −10% on Theme_Confidence score |
| **PostgreSQL Write Failure** | Retry 3× with exponential backoff (2s, 4s, 8s) | Log to `orchestrator_error_log` |
| **Level 9 Beta constraint breach** | Drop the highest-Beta equity iteratively until constraint is satisfied | Recalculate covariance matrix |

---

## 5. Orchestrator State Machine

```
IDLE
  │
  ├─ [06:00 AM trigger] ──▶ INGESTING
  │                              │
  │                         [success] ──▶ FUNNEL_RUNNING
  │                              │
  │                         [failure: critical feed] ──▶ HALTED (alert)
  │
  ├─ FUNNEL_RUNNING ──▶ FORENSIC_RUNNING ──▶ EXECUTION_RUNNING
  │                                                   │
  │                                            [08:00 AM] ──▶ PUBLISHED
  │
  └─ [16:30 PM trigger] ──▶ RETRO_RUNNING ──▶ IDLE
```

---

## 6. Linked Engine Files

| Level | File | Phase |
|---|---|---|
| 1 | [level1_macro.md](./level1_macro.md) | Funnel |
| 2 | [level2_theme.md](./level2_theme.md) | Funnel |
| 3 | [level3_industry.md](./level3_industry.md) | Funnel |
| 4 | [level4_management.md](./level4_management.md) | Forensic |
| 5 | [level5_expectations.md](./level5_expectations.md) | Forensic |
| 6 | [level6_earnings.md](./level6_earnings.md) | Forensic |
| 7 | [level7_market.md](./level7_market.md) | Execution |
| 8 | [level8_thesis.md](./level8_thesis.md) | Execution |
| 9 | [level9_portfolio.md](./level9_portfolio.md) | Execution |
| 10 | [level10_learning.md](./level10_learning.md) | Retrospective |

---

## 7. Cross-References

- **Database Schema:** [db_schema.md](./db_schema.md)
- **Frontend UI:** [ui_dashboard.md](./ui_dashboard.md)

---

## 8. CRITICAL DIRECTIVE: ZERO HALLUCINATION & DETERMINISM

> **Institutional Grade Constraint — Non-Negotiable.**
> This system processes real capital allocation decisions. Any fabricated, estimated, or hallucinated data point directly corrupts the conviction score and downstream portfolio construction.

### 8.1 The Null Kill-Switch

If any external API, database query, or data feed returns `null`, `NaN`, `undefined`, an empty response, or times out for a metric marked **DETERMINISTIC REQUIRED**, the orchestrator **MUST** immediately eject that ticker from the daily processing queue. Do not attempt to calculate an average, guess the metric, or use proxy data.

```python
DETERMINISTIC_REQUIRED_FIELDS = [
    # Level 1
    "brent_crude_usd", "usd_inr", "g_sec_10yr_yield",
    # Level 3
    "roce_ttm", "ebitda_margin_pct", "market_share_rank",
    # Level 4
    "promoter_pledge_pct", "retained_value_ratio", "capex_10yr_cagr",
    # Level 5
    "current_pe_ratio", "consensus_eps_estimate", "ocf_per_share",
    # Level 7
    "fii_net_flow_cr", "delivery_pct", "institutional_volume_cr",
]

def validate_deterministic_fields(ticker: str, data_payload: dict) -> bool:
    """
    Strict null guard. ANY missing deterministic field = immediate rejection.
    No averaging, no imputation, no proxy data permitted.
    Returns True only if ALL fields are present and non-null.
    """
    for field in DETERMINISTIC_REQUIRED_FIELDS:
        value = data_payload.get(field)
        if value is None or (isinstance(value, float) and math.isnan(value)):
            log_fatal_rejection(ticker, field)
            return False   # Reject immediately — do not continue processing
    return True

def log_fatal_rejection(ticker: str, missing_field: str) -> None:
    """
    Writes a fixed-format structured rejection log entry.
    Output format: [FATAL] Ticker Rejected: Missing deterministic data for [Metric]
    """
    print(f"[FATAL] Ticker Rejected: Missing deterministic data for [{missing_field}] | Ticker: {ticker}")
    db.execute("""
        INSERT INTO Orchestrator_Rejection_Log
            (run_date, ticker, missing_field, rejected_at, severity)
        VALUES (CURRENT_DATE, %s, %s, NOW(), 'FATAL')
    """, [ticker, missing_field])
```

### 8.2 Rejection Log Table

```sql
CREATE TABLE IF NOT EXISTS Orchestrator_Rejection_Log (
    id            BIGSERIAL    PRIMARY KEY,
    run_date      DATE         NOT NULL DEFAULT CURRENT_DATE,
    ticker        VARCHAR(20)  NOT NULL,
    missing_field VARCHAR(100) NOT NULL,
    rejected_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    severity      VARCHAR(10)  NOT NULL DEFAULT 'FATAL',
    UNIQUE (run_date, ticker, missing_field)
);

CREATE INDEX idx_orl_run_date ON Orchestrator_Rejection_Log (run_date DESC);
CREATE INDEX idx_orl_ticker   ON Orchestrator_Rejection_Log (ticker);
```

### 8.3 Permitted Fallbacks vs. Forbidden Operations

| Scenario | Permitted Action | Forbidden Action |
|---|---|---|
| Alt-data API timeout (Level 6) | Use Level 5 OCF intrinsic + 15% confidence penalty | Impute from sector average |
| GoI NLP parser failure (Level 2) | Use cached theme scores <= 5 days stale | Generate synthetic theme keywords |
| Single OHLCV field missing | Reject ticker entirely for today | Use previous day value as proxy |
| Promoter pledge null | Reject ticker — FATAL | Assume 0% pledge |
| FII flow data unavailable | Reject ticker — FATAL | Use sectoral FII average |
| Consensus EPS null | Reject ticker — FATAL | Extrapolate from historical EPS CAGR |

### 8.4 Per-Level Integration Point

Each engine level MUST call `validate_deterministic_fields()` **before** executing scoring logic:

```python
# Standard integration pattern — identical across Levels 1–9
def run_level_N(ticker: str, payload: dict) -> dict | None:
    if not validate_deterministic_fields(ticker, payload):
        return None   # Orchestrator treats None as silent eject from queue
    # ... proceed with level-specific scoring
```

### 8.5 Alpha Ranker Ensemble Anti-Hallucination Constraint

The LambdaMART Ranker ensemble defined in [model.md](./model.md) is subject to the same constraint at inference time:

```python
def build_feature_vector(ticker: str, level_outputs: dict) -> np.ndarray | None:
    """
    Constructs the feature vector for the Alpha Ranker.
    Returns None if ANY deterministic feature is missing.
    The Ranker never receives a partially-populated feature vector.
    """
    features = [
        level_outputs.get("x1_macro_alignment"),       # Level 1
        level_outputs.get("x2_thematic_momentum"),     # Level 2
        level_outputs.get("x3_roce_zscore"),           # Level 3
        level_outputs.get("x4_expectations_gap_pct"),  # Level 5
        level_outputs.get("x5_institutional_flow_cr"), # Level 7
        # ... expands up to 200 features ...
    ]
    if any(f is None or (isinstance(f, float) and math.isnan(f)) for f in features):
        log_fatal_rejection(ticker, "RANKER_FEATURE_VECTOR_INCOMPLETE")
        return None
    return np.array(features, dtype=np.float32)
```

---

## 9. Linked Engine Files (Updated)

| Level / Component | File | Phase |
|---|---|---|
| 1 | [level1_macro.md](./level1_macro.md) | Funnel |
| 2 | [level2_theme.md](./level2_theme.md) | Funnel |
| 3 | [level3_industry.md](./level3_industry.md) | Funnel |
| 4 | [level4_management.md](./level4_management.md) | Forensic |
| 5 | [level5_expectations.md](./level5_expectations.md) | Forensic |
| 6 | [level6_earnings.md](./level6_earnings.md) | Forensic |
| 7 | [level7_market.md](./level7_market.md) | Execution |
| 8 | [level8_thesis.md](./level8_thesis.md) | Execution |
| 9 | [level9_portfolio.md](./level9_portfolio.md) | Execution |
| 10 | [level10_learning.md](./level10_learning.md) | Retrospective |
| 10.5 | [alpha_discovery.md](./alpha_discovery.md) | Alpha Research |
| 10.75 | [alpha_discovery.md#level-10-75](./alpha_discovery.md) | Orthogonalization |
| Ranker Ensemble | [model.md](./model.md) | Inference + Training |
| **PESTEL Engine** | **[pestel_intelligence_engine.py](./services/pestel_intelligence_engine.py)** | **Data Ingestion (06:00 AM)** |
| Schema | [db_schema.md](./db_schema.md) | Persistence |
| UI | [ui_dashboard.md](./ui_dashboard.md) | Presentation |
