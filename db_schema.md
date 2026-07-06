# Database_Architecture

```yaml
name: "Database_Architecture"
framework: "OACF"
version: "1.0.0"
type: "state_management"
database: "PostgreSQL 15+"
```

---

## 1. Schema Overview

All BigBull Engine data is persisted in a **relational PostgreSQL** database. PostgreSQL is selected over NoSQL alternatives because:

- Complex 6-month **retrospective joins** (variance analysis) require ACID guarantees
- `JSONB` columns in `Retro_Variance_Log` and `Thesis_Ledger` allow schema flexibility without sacrificing join performance
- PostgreSQL `ENUM` types enforce `Thesis_Ledger.status` domain integrity at the DB layer
- Native `uuid-ossp` extension handles `thesis_id` generation without application-layer UUID logic

**Database name:** `bigbull_engine`  
**Schema name:** `public`  
**Extensions required:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
```

---

## 2. Table Definitions

### 2.1 `Daily_Projections`

Stores the engine's morning output — the daily Top 10 projected equities.

```sql
CREATE TABLE IF NOT EXISTS Daily_Projections (
    date                DATE            NOT NULL,
    rank                INT             NOT NULL CHECK (rank BETWEEN 1 AND 10),
    ticker              VARCHAR(20)     NOT NULL,
    sector              VARCHAR(100)    NOT NULL,
    conviction_score    DECIMAL(6,4)    NOT NULL CHECK (conviction_score BETWEEN 0 AND 100),
    thematic_alpha      VARCHAR(255),
    thesis_id           UUID            REFERENCES Thesis_Ledger(thesis_id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, rank),
    UNIQUE (date, ticker)
);

CREATE INDEX idx_dp_date        ON Daily_Projections (date DESC);
CREATE INDEX idx_dp_ticker      ON Daily_Projections (ticker);
CREATE INDEX idx_dp_sector      ON Daily_Projections (sector, date DESC);
```

**Column Details:**

| Column | Type | Constraint | Description |
|---|---|---|---|
| `date` | `DATE` | PK (composite) | Trading date of the projection |
| `rank` | `INT` | `1–10`, PK (composite) | Engine conviction rank for the day |
| `ticker` | `VARCHAR(20)` | NOT NULL, UNIQUE per date | NSE/BSE ticker symbol (e.g., `RELIANCE`) |
| `sector` | `VARCHAR(100)` | NOT NULL | SEBI sector classification |
| `conviction_score` | `DECIMAL(6,4)` | `0–100` | Aggregated score from Levels 1–9 |
| `thematic_alpha` | `VARCHAR(255)` | — | Short descriptor of the driving theme (e.g., `PLI_Electronics`) |
| `thesis_id` | `UUID` | FK → `Thesis_Ledger` | Pointer to the structured thesis object |

**Retention Policy:**
```sql
-- Run nightly via pg_cron at 00:30 AM IST
DELETE FROM Daily_Projections
WHERE date < CURRENT_DATE - INTERVAL '7 days';
```

---

### 2.2 `Market_Actuals`

Stores the actual post-market top 10 performers fetched at 16:30 PM IST.

```sql
CREATE TABLE IF NOT EXISTS Market_Actuals (
    date                    DATE            NOT NULL,
    rank                    INT             NOT NULL CHECK (rank BETWEEN 1 AND 10),
    ticker                  VARCHAR(20)     NOT NULL,
    daily_return_pct        DECIMAL(8,4)    NOT NULL,
    institutional_volume    DECIMAL(18,4),  -- In ₹Crores
    closing_price           DECIMAL(12,2),
    total_volume_cr         DECIMAL(18,4),
    fetched_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, rank),
    UNIQUE (date, ticker)
);

CREATE INDEX idx_ma_date        ON Market_Actuals (date DESC);
CREATE INDEX idx_ma_ticker      ON Market_Actuals (ticker, date DESC);
CREATE INDEX idx_ma_return      ON Market_Actuals (daily_return_pct DESC);
```

**Column Details:**

| Column | Type | Description |
|---|---|---|
| `date` | `DATE` | Trading date of actual performance |
| `rank` | `INT` | Rank by `daily_return_pct DESC` (Actual market rank) |
| `ticker` | `VARCHAR(20)` | NSE/BSE ticker symbol |
| `daily_return_pct` | `DECIMAL(8,4)` | `((Close - Prev_Close) / Prev_Close) * 100` |
| `institutional_volume` | `DECIMAL(18,4)` | FII + DII net volume in ₹Crores |
| `closing_price` | `DECIMAL(12,2)` | NSE Bhav Copy closing price |
| `total_volume_cr` | `DECIMAL(18,4)` | Total traded volume in ₹Crores (must exceed ₹50Cr for eligibility) |

---

### 2.3 `Retro_Variance_Log`

The core memory table for the learning engine. Each row represents one missed stock from one day.

```sql
CREATE TABLE IF NOT EXISTS Retro_Variance_Log (
    id                          BIGSERIAL       PRIMARY KEY,
    date                        DATE            NOT NULL,
    missed_ticker               VARCHAR(20)     NOT NULL,
    actual_return               DECIMAL(8,4)    NOT NULL,
    engine_failure_point        VARCHAR(50)     NOT NULL,  -- e.g., 'Level_1', 'Level_5'
    failure_reason              TEXT,
    weight_adjustment_applied   JSONB,
    audit_run_ts                TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rvl_date           ON Retro_Variance_Log (date DESC);
CREATE INDEX idx_rvl_ticker         ON Retro_Variance_Log (missed_ticker);
CREATE INDEX idx_rvl_failure_point  ON Retro_Variance_Log (engine_failure_point);
CREATE INDEX idx_rvl_adjustment     ON Retro_Variance_Log USING GIN (weight_adjustment_applied);
```

**`weight_adjustment_applied` JSONB schema:**

```json
{
  "engine_level": "Level_1",
  "modifier_key": "CRUDE_DANGER_THRESHOLD",
  "old_value": 85.00,
  "new_value": 89.25,
  "adjustment_factor": 0.95,
  "false_negatives_in_window": 4,
  "rolling_window_days": 14
}
```

**Retention Policy:**
```sql
-- Run monthly via pg_cron
DELETE FROM Retro_Variance_Log
WHERE date < CURRENT_DATE - INTERVAL '6 months';
```

---

### 2.4 `Thesis_Ledger`

Persistent store for structured narrative thesis objects generated by Level 8.

```sql
CREATE TYPE thesis_status AS ENUM ('Strengthened', 'Neutral', 'Broken');

CREATE TABLE IF NOT EXISTS Thesis_Ledger (
    thesis_id               UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker                  VARCHAR(20)     NOT NULL,
    entry_date              DATE            NOT NULL DEFAULT CURRENT_DATE,
    core_milestone          TEXT            NOT NULL,
    invalidation_trigger    TEXT,
    status                  thesis_status   NOT NULL DEFAULT 'Neutral',
    level8_raw_json         JSONB,
    last_updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    UNIQUE (ticker, entry_date)
);

CREATE INDEX idx_tl_ticker      ON Thesis_Ledger (ticker, entry_date DESC);
CREATE INDEX idx_tl_status      ON Thesis_Ledger (status);
CREATE INDEX idx_tl_entry       ON Thesis_Ledger (entry_date DESC);
```

**Column Details:**

| Column | Type | Description |
|---|---|---|
| `thesis_id` | `UUID` | Auto-generated PK; referenced by `Daily_Projections.thesis_id` |
| `ticker` | `VARCHAR(20)` | Stock ticker |
| `entry_date` | `DATE` | Date thesis was generated |
| `core_milestone` | `TEXT` | The primary forward-looking catalyst (≤50 words per Level 8 config) |
| `invalidation_trigger` | `TEXT` | Condition that would break the thesis |
| `status` | `ENUM` | `Strengthened` / `Neutral` / `Broken` — updated daily by Level 10 |
| `level8_raw_json` | `JSONB` | Full JSON payload from Level 8 for audit trail |

---

---

### 2.5 `Morning_Feature_Snapshot`

Caches the 07:45 AM feature vectors for all equities that pass the Funnel and Forensic gates. This ensures Level 10 can retrieve unpolluted morning features at EoD for the Golden Sample Feedback Loop, without risking data leakage.

```sql
CREATE TABLE IF NOT EXISTS Morning_Feature_Snapshot (
    date                    DATE            NOT NULL DEFAULT CURRENT_DATE,
    ticker                  VARCHAR(20)     NOT NULL,
    x1_macro                DECIMAL(8,4),
    x2_thematic             DECIMAL(8,4),
    x3_roce_zscore          DECIMAL(8,4),
    x4_rvr                  DECIMAL(8,4),
    x5_exp_gap_pct          DECIMAL(8,4),
    x6_surprise             DECIMAL(8,4),
    x7_inst_flow_cr         DECIMAL(8,4),
    x8_thesis_score         DECIMAL(8,4),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, ticker)
);

CREATE INDEX idx_mfs_date   ON Morning_Feature_Snapshot (date DESC);
CREATE INDEX idx_mfs_ticker ON Morning_Feature_Snapshot (ticker);
```

**Retention Policy:**
```sql
-- Run nightly via pg_cron at 00:30 AM IST
DELETE FROM Morning_Feature_Snapshot
WHERE date < CURRENT_DATE - INTERVAL '3 days';
```

---

### 2.6 `ml_feature_store`

Stores historical features for the Alpha Ranking Engine. Updated nightly by Level 10. Labels are populated T+5 days later based on actual forward alpha.

```sql
CREATE TABLE IF NOT EXISTS ml_feature_store (
    date                    DATE            NOT NULL,
    ticker                  VARCHAR(20)     NOT NULL,
    feature_vector          JSONB           NOT NULL,
    label                   INT,            -- Cross-sectional rank bucket (0-4), NULL until T+5
    actual_fwd_alpha        DECIMAL(8,4),   -- Actual calculated alpha vs benchmark, NULL until T+5
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, ticker)
);

CREATE INDEX idx_ml_fs_date ON ml_feature_store (date DESC);
CREATE INDEX idx_ml_fs_label ON ml_feature_store (label);
```

### 2.7 `ml_predictions_log`

Stores daily inference outputs from the LambdaMART Ranker ensemble.

```sql
CREATE TABLE IF NOT EXISTS ml_predictions_log (
    date                    DATE            NOT NULL,
    symbol                  VARCHAR(20)     NOT NULL,
    predicted_score         FLOAT           NOT NULL,
    predicted_rank          INT             NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, symbol)
);
CREATE INDEX idx_ml_pl_date ON ml_predictions_log (date DESC);
```

### 2.8 `ml_drift_metrics`

Stores daily concept drift calculations (e.g. Wasserstein distance) for each feature.

```sql
CREATE TABLE IF NOT EXISTS ml_drift_metrics (
    date                    DATE            NOT NULL,
    feature_name            VARCHAR(100)    NOT NULL,
    wasserstein_dist        FLOAT           NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, feature_name)
);
```

### 2.9 `Missed_Alpha_Log`

Stores clustering metadata for stocks that achieved top 10% actual forward alpha (Bucket 4) but were ranked poorly by the engine.

```sql
CREATE TABLE IF NOT EXISTS Missed_Alpha_Log (
    date                    DATE            NOT NULL,
    ticker                  VARCHAR(20)     NOT NULL,
    cluster_id              INT             NOT NULL,
    feature_vector          JSONB           NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, ticker)
);
```

---

## 3. Alpha Discovery Engine Tables (Level 10.5)

These tables support the Institutional Alpha Research pipeline. They operate completely independently from the training pipeline.

### 3.1 `historical_feature_store`

Supports the Historical Reconstruction Engine for long-term backfills and purged cross-validation.

```sql
CREATE TABLE IF NOT EXISTS historical_feature_store (
    date                    DATE            NOT NULL,
    ticker                  VARCHAR(20)     NOT NULL,
    feature_vector          JSONB           NOT NULL,
    fwd_alpha_5d            FLOAT,
    fwd_alpha_10d           FLOAT,
    fwd_alpha_20d           FLOAT,
    alpha_bucket_5d         INT,
    alpha_bucket_10d        INT,
    alpha_bucket_20d        INT,
    reconstruction_ts       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, ticker)
);

CREATE INDEX idx_hfs_date ON historical_feature_store (date DESC);
```

### 3.2 `winner_genome_database`

Stores the daily actual Top 10, Top 25, Top 50, and Top Decile winners, snapshotting their exact feature vectors, liquidity, news, and corporate action traits at time T.

```sql
CREATE TYPE winner_tier_enum AS ENUM ('TOP_10', 'TOP_25', 'TOP_50', 'TOP_DECILE');

CREATE TABLE IF NOT EXISTS winner_genome_database (
    date                    DATE            NOT NULL,
    ticker                  VARCHAR(20)     NOT NULL,
    winner_tier             winner_tier_enum NOT NULL,
    sector                  VARCHAR(100)    NOT NULL,
    industry                VARCHAR(100)    NOT NULL,
    actual_fwd_alpha        DECIMAL(8,4)    NOT NULL,
    actual_rank             INT             NOT NULL,
    predicted_score         FLOAT           NOT NULL,
    predicted_rank          INT             NOT NULL,
    feature_snapshot        JSONB           NOT NULL,
    regime                  VARCHAR(50)     NOT NULL,
    liquidity_profile       JSONB,
    volatility_profile      JSONB,
    corporate_actions       JSONB,
    news_flags              JSONB,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, ticker)
);

CREATE INDEX idx_wgd_date_rank ON winner_genome_database (date DESC, actual_rank ASC);
```

### 3.2 `research_prediction_gaps`

Stores the aggregate daily performance metrics for the ranker.

```sql
CREATE TABLE IF NOT EXISTS research_prediction_gaps (
    date                    DATE            PRIMARY KEY,
    regime                  VARCHAR(50)     NOT NULL,
    false_positives         INT             NOT NULL,
    false_negatives         INT             NOT NULL,
    precision_at_10         FLOAT           NOT NULL,
    recall_at_10            FLOAT           NOT NULL,
    ndcg_score              FLOAT           NOT NULL,
    rank_ic                 FLOAT           NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 3.4 `missed_alpha_archive`

Stores stocks that were Top Decile actual but predicted > 50th percentile.

```sql
CREATE TABLE IF NOT EXISTS missed_alpha_archive (
    date                    DATE            NOT NULL,
    ticker                  VARCHAR(20)     NOT NULL,
    regime                  VARCHAR(50)     NOT NULL,
    actual_rank             INT             NOT NULL,
    predicted_rank          INT             NOT NULL,
    prediction_error        FLOAT           NOT NULL,
    alpha_error             FLOAT           NOT NULL,
    cluster_id              VARCHAR(50),    -- Populated by UMAP+HDBSCAN
    feature_vector          JSONB           NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, ticker)
);
```

### 3.5 `pattern_registry`

Stores HDBSCAN dense clusters identified within the Missed Alpha Archive.

```sql
CREATE TABLE IF NOT EXISTS pattern_registry (
    cluster_id              VARCHAR(50)     PRIMARY KEY,
    regime                  VARCHAR(50)     NOT NULL,
    support_count           INT             NOT NULL,
    confidence_score        FLOAT           NOT NULL,
    representative_features JSONB           NOT NULL,
    discovered_date         DATE            NOT NULL DEFAULT CURRENT_DATE
);
```

### 3.6 `research_factor_registry`

The core registry of newly discovered factors from pattern analysis.

```sql
CREATE TYPE validation_status AS ENUM ('RESEARCH', 'BACKTEST', 'WALK_FORWARD', 'PURGED_CV', 'OOT_VALIDATION', 'APPROVED', 'REJECTED');

CREATE TABLE IF NOT EXISTS research_factor_registry (
    factor_id               UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    factor_name             VARCHAR(150)    NOT NULL UNIQUE,
    formula                 TEXT            NOT NULL,
    data_source             VARCHAR(100)    NOT NULL,
    economic_rationale      TEXT            NOT NULL,
    discovered_date         DATE            NOT NULL DEFAULT CURRENT_DATE,
    regime_dependency       VARCHAR(50),
    status                  validation_status NOT NULL DEFAULT 'RESEARCH',
    support_count           INT             NOT NULL,
    confidence_score        FLOAT           NOT NULL,
    last_updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 3.7 `research_feature_drift`

Monitors SHAP importance and IC drift over time.

```sql
CREATE TABLE IF NOT EXISTS research_feature_drift (
    date                    DATE            NOT NULL,
    feature_name            VARCHAR(100)    NOT NULL,
    regime                  VARCHAR(50)     NOT NULL,
    shap_drift_score        FLOAT           NOT NULL,
    winner_frequency_pct    FLOAT           NOT NULL,
    information_coefficient FLOAT           NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, feature_name, regime)
);
```

### 3.8 `alpha_graveyard`

Stores rejected factors, models, and hypotheses with their validation metrics and failure reasons.

```sql
CREATE TABLE IF NOT EXISTS alpha_graveyard (
    id                      BIGSERIAL       PRIMARY KEY,
    entity_name             VARCHAR(150)    NOT NULL,
    entity_type             VARCHAR(50)     NOT NULL,  -- 'FACTOR', 'MODEL', 'HYPOTHESIS'
    failure_reason          TEXT            NOT NULL,
    validation_metrics      JSONB           NOT NULL,
    rejected_date           DATE            NOT NULL DEFAULT CURRENT_DATE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 3.9 `regime_factor_registry`

Tracks factor performance strictly across different regimes.

```sql
CREATE TABLE IF NOT EXISTS regime_factor_registry (
    factor_name             VARCHAR(150)    NOT NULL,
    regime                  VARCHAR(50)     NOT NULL,
    information_coefficient FLOAT           NOT NULL,
    rank_ic                 FLOAT           NOT NULL,
    win_rate                FLOAT           NOT NULL,
    alpha_contribution      FLOAT           NOT NULL,
    last_updated_date       DATE            NOT NULL DEFAULT CURRENT_DATE,

    PRIMARY KEY (factor_name, regime)
);
```

### 3.10 `shadow_model_tracking`

Tracks Champion vs. Challenger models running in parallel.

```sql
CREATE TABLE IF NOT EXISTS shadow_model_tracking (
    date                    DATE            NOT NULL,
    model_id                VARCHAR(100)    NOT NULL,
    is_champion             BOOLEAN         NOT NULL DEFAULT FALSE,
    precision_at_10         FLOAT           NOT NULL,
    ndcg_at_10              FLOAT           NOT NULL,
    rank_ic                 FLOAT           NOT NULL,
    sharpe_ratio            FLOAT           NOT NULL,
    calmar_ratio            FLOAT           NOT NULL,
    sortino_ratio           FLOAT           NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (date, model_id)
);
```

---

## 4. Supporting Tables

### 4.1 `Engine_Modifiers`

Persists the live modifier state for each level so Level 10 can dynamically adjust and re-read them.

```sql
CREATE TABLE IF NOT EXISTS Engine_Modifiers (
    level               VARCHAR(20)     NOT NULL,
    modifier_key        VARCHAR(100)    NOT NULL,
    current_value       DECIMAL(18,6)   NOT NULL,
    base_value          DECIMAL(18,6)   NOT NULL,
    last_adjusted_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    adjustment_count    INT             NOT NULL DEFAULT 0,

    PRIMARY KEY (level, modifier_key)
);

-- Seed with base values
INSERT INTO Engine_Modifiers (level, modifier_key, current_value, base_value) VALUES
    ('Level_1', 'CRUDE_DANGER_THRESHOLD',           85.00,  85.00),
    -- YIELD_CURVE_WEIGHT re-normalized from 0.35 to 0.315 (×0.90) to make room for PESTEL_WEIGHT
    ('Level_1', 'YIELD_CURVE_WEIGHT',               0.315,  0.315),
    ('Level_1', 'INFLATION_WEIGHT',                 0.225,  0.225),
    ('Level_1', 'CURRENCY_WEIGHT',                  0.180,  0.180),
    ('Level_1', 'COMMODITY_WEIGHT',                 0.180,  0.180),
    ('Level_1', 'PESTEL_WEIGHT',                    0.100,  0.100),  -- New 5th Regime Score component
    ('Level_1', 'CURRENCY_IMPACT_MULTIPLIER',       1.20,   1.20),
    ('Level_2', 'MIN_THEME_SCORE',                  65.00,  65.00),
    ('Level_2', 'NLP_KEYWORD_MULTIPLIER',           1.15,   1.15),
    ('Level_3', 'MARGIN_PREMIUM_WEIGHT',            0.40,   0.40),
    ('Level_3', 'MARKET_SHARE_WEIGHT',              0.60,   0.60),
    ('Level_3', 'MIN_ROCE_SD',                      3.00,   3.00),
    ('Level_4', 'MAX_PLEDGE_PCT',                   15.00,  15.00),
    ('Level_4', 'MIN_RETAINED_VALUE_RATIO',         1.25,   1.25),
    ('Level_5', 'PEG_CONSTANT',                     1.50,   1.50),
    ('Level_5', 'MIN_GAP_THRESHOLD',                5.00,   5.00),
    ('Level_6', 'MIN_HEADCOUNT_GROWTH',             2.00,   2.00),
    ('Level_6', 'MATERIAL_DEFLATION_WEIGHT',        0.30,   0.30),
    ('Level_7', 'INSTITUTIONAL_ACCUMULATION_MIN_CR',50.00,  50.00),
    ('Level_8', 'MAX_THESIS_LENGTH_WORDS',          50.00,  50.00),
    ('Level_9', 'MAX_SECTOR_CONCENTRATION',         30.00,  30.00),
    ('Level_9', 'MAX_BETA',                         1.35,   1.35),
    ('Level_10','LEARNING_RATE_ALPHA',              0.05,   0.05),
    ('Level_10','ROLLING_AUDIT_WINDOW_DAYS',        14.00,  14.00),
    ('Level_10','MAX_ADJUSTMENT_CAP',               0.20,   0.20),
    -- PESTEL pillar weights (read by PestelIntelligenceEngine; must sum to 1.0)
    ('Level_PESTEL', 'PESTEL_POLITICAL_WEIGHT',     0.20,   0.20),
    ('Level_PESTEL', 'PESTEL_ECONOMIC_WEIGHT',      0.30,   0.30),
    ('Level_PESTEL', 'PESTEL_SOCIAL_WEIGHT',        0.15,   0.15),
    ('Level_PESTEL', 'PESTEL_TECH_WEIGHT',          0.15,   0.15),
    ('Level_PESTEL', 'PESTEL_ENV_WEIGHT',           0.10,   0.10),
    ('Level_PESTEL', 'PESTEL_LEGAL_WEIGHT',         0.10,   0.10)
ON CONFLICT (level, modifier_key) DO NOTHING;
```

### 3.2 `Orchestrator_Run_Log`

```sql
CREATE TYPE run_status AS ENUM ('STARTED', 'INGESTING', 'FUNNEL', 'FORENSIC', 'EXECUTION', 'PUBLISHED', 'RETRO', 'HALTED', 'ERROR');

CREATE TABLE IF NOT EXISTS Orchestrator_Run_Log (
    run_id          BIGSERIAL       PRIMARY KEY,
    run_date        DATE            NOT NULL DEFAULT CURRENT_DATE,
    run_type        VARCHAR(20)     NOT NULL CHECK (run_type IN ('MORNING', 'RETRO')),
    status          run_status      NOT NULL DEFAULT 'STARTED',
    started_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    equities_in     INT,
    equities_out    INT,
    error_details   TEXT
);
```

---

## 4. Entity Relationship Diagram

```
Daily_Projections ──────────────────▶ Thesis_Ledger
  (thesis_id FK)                         (thesis_id PK)
        │
        │  [date join]
        ▼
  Market_Actuals ─────────────────▶ Retro_Variance_Log
  (date, ticker)                       (date, missed_ticker)
                                              │
                                              │ [modifies]
                                              ▼
                                       Engine_Modifiers
                                       (level, modifier_key)
```

---

## 5. Maintenance & Indexing Strategy

### Vacuuming (pg_cron schedule)
```sql
-- Daily at 05:45 AM IST (before the morning run)
SELECT cron.schedule('bigbull-vacuum', '15 0 * * *', $$
    VACUUM ANALYZE Daily_Projections;
    VACUUM ANALYZE Market_Actuals;
    VACUUM ANALYZE Retro_Variance_Log;
    VACUUM ANALYZE Thesis_Ledger;
$$);
```

### Retention Enforcement (pg_cron schedule)
```sql
-- Daily at 00:30 AM IST
SELECT cron.schedule('bigbull-retention', '0 19 * * *', $$
    DELETE FROM Daily_Projections WHERE date < CURRENT_DATE - INTERVAL '7 days';
    DELETE FROM Retro_Variance_Log WHERE date < CURRENT_DATE - INTERVAL '6 months';
$$);
```

### Connection Pooling
Use **PgBouncer** in `transaction` mode with:
- `pool_size = 20`
- `max_client_conn = 100`
- `server_idle_timeout = 600`

---

## 6. PESTEL Analysis Framework

The engine applies a three-tier PESTEL framework (Market → Industry → Company) to contextualise conviction scoring. PESTEL signals are **fetched live** each morning by the `PestelIntelligenceEngine` service (runs at 06:00 AM IST during Data Ingestion), then feed into **Level 1 (Macro Funnel)**, **Level 2 (Thematic NLP)**, and **Level 8 (Thesis Narrative)**.

```yaml
pestel_framework:
  tiers:
    - MARKET      # India NSE macro-level
    - INDUSTRY    # Sector-specific
    - COMPANY     # Ticker-specific override
  pillars: [Political, Economic, Social, Technological, Environmental, Legal]
  integration_levels: [Level_1, Level_2, Level_8]
  service: services/pestel_intelligence_engine.py
  news_sources:
    primary:
      - Mint / livemint.com RSS (politics, economy, industry, companies, technology, markets, science)
    supplementary:
      - PIB RSS (pib.gov.in) — official govt press releases
      - RBI RSS (rbi.org.in) — monetary policy announcements
      - SEBI RSS (sebi.gov.in) — regulatory circulars & orders
      - MoEFCC RSS (moef.gov.in) — environmental clearances
      - MCA RSS (mca.gov.in) — Companies Act notifications
      - MeitY RSS (meity.gov.in) — Digital India, IT policy
    optional:
      - newsapi.org (requires NEWSAPI_KEY env var, 100 req/day free tier)
```

### 6.0 PESTEL Database Tables

#### `pestel_daily_scores`

Stores the composite and per-pillar PESTEL scores for each run date. One row per trading day.

```sql
CREATE TABLE IF NOT EXISTS pestel_daily_scores (
    run_date             DATE         NOT NULL PRIMARY KEY,
    overall_score        FLOAT        NOT NULL,          -- Weighted composite [-100, +100]
    political_score      FLOAT        NOT NULL,          -- Per-pillar score [-100, +100]
    economic_score       FLOAT        NOT NULL,
    social_score         FLOAT        NOT NULL,
    technological_score  FLOAT        NOT NULL,
    environmental_score  FLOAT        NOT NULL,
    legal_score          FLOAT        NOT NULL,
    headline_count       INT          NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pds_date ON pestel_daily_scores (run_date DESC);
```

| Column | Description |
|---|---|
| `run_date` | Trading date — PK |
| `overall_score` | Weighted composite of all six pillar scores ∈ [−100, +100] |
| `political_score` … `legal_score` | Individual pillar scores; each ∈ [−100, +100] |
| `headline_count` | Total headlines retrieved across all pillars |

**Retention Policy:**
```sql
-- Run monthly via pg_cron
DELETE FROM pestel_daily_scores
WHERE run_date < CURRENT_DATE - INTERVAL '6 months';
```

---

#### `pestel_news_feed`

Raw headline-level log. Provides the audit trail for Level 1 scores and the source material for Level 2 NLP and Level 8 thesis enrichment.

```sql
CREATE TABLE IF NOT EXISTS pestel_news_feed (
    id              BIGSERIAL    PRIMARY KEY,
    run_date        DATE         NOT NULL,
    pillar          VARCHAR(20)  NOT NULL CHECK (pillar IN
                        ('Political','Economic','Social',
                         'Technological','Environmental','Legal')),
    headline        TEXT         NOT NULL,
    source_url      TEXT,
    sentiment_score FLOAT        NOT NULL,   -- Normalised [-1.0, +1.0]
    sector_tags     JSONB,                   -- e.g. ["Banking", "IT"]
    ticker_tags     JSONB,                   -- e.g. ["HDFCBANK", "TCS"]
    fetched_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pnf_date_pillar ON pestel_news_feed (run_date DESC, pillar);
CREATE INDEX idx_pnf_ticker      ON pestel_news_feed USING GIN (ticker_tags);
CREATE INDEX idx_pnf_sector      ON pestel_news_feed USING GIN (sector_tags);
```

| Column | Description |
|---|---|
| `pillar` | One of the 6 PESTEL pillars |
| `headline` | Raw headline text |
| `sentiment_score` | Keyword-weighted sentiment ∈ [−1.0, +1.0] |
| `sector_tags` | JSONB array of sector names inferred from headline |
| `ticker_tags` | JSONB array of NSE ticker symbols detected in headline |

**Retention Policy:**
```sql
-- Run monthly via pg_cron
DELETE FROM pestel_news_feed
WHERE run_date < CURRENT_DATE - INTERVAL '3 months';
```

---

### 6.1 Market-Level PESTEL — India NSE Macro

#### Political
```yaml
- Union Budget FY26 maintains capital expenditure at ₹11.1L Cr (+17% YoY) — drives infra, defence, railways
- Stable coalition government with reform continuity; GST council streamlining indirect taxes
- PLI schemes active across 14 sectors; ₹3.5L Cr committed private investment committed
- India–EU FTA in advanced negotiation; EFTA FTA signed with ₹1L Cr investment pledge
- Engine impact: CRUDE_DANGER_THRESHOLD adjusted when crude diplomacy triggers risk-off
```

#### Economic
```yaml
- GDP growth forecast 6.8–7.2% for FY27; India fastest-growing G20 economy
- RBI repo rate at 6.25% on disinflationary path; CPI targeting 4% trajectory
- INR/USD at 84–86 range; FII inflows $18B YTD supporting equity risk appetite
- Nifty 50 corporate earnings CAGR 14–16% consensus over 3-year horizon
- Engine impact: YIELD_CURVE_WEIGHT scaled with 10Y–2Y spread; CURRENCY_IMPACT_MULTIPLIER
```

#### Social
```yaml
- Demographic dividend: 65% population under 35 — structural consumption tailwind
- Middle class expanding to 500Mn by 2030; premiumisation across FMCG, retail, healthcare
- Urban housing demand: 12Mn new urban households annually — infra + financials tailwind
- Digital financial inclusion: 800Mn+ UPI users, 600Mn internet subscribers
- Engine impact: Sector THEMATIC_ALPHA for FMCG, Financials, Real Estate upweighted
```

#### Technological
```yaml
- India AI compute capacity growing 5x; government ₹10,000 Cr IndiaAI Mission launched
- Semiconductor fab incentives: 3 fabs under construction in Gujarat and Andhra Pradesh
- 5G rollout complete in Tier-1 cities; $7B network capex cycle for Jio, Airtel, BSNL
- IT exports $250B+ target by 2027; GenAI contributing 12–15% incremental revenue
- Engine impact: IT sector NLP_KEYWORD_MULTIPLIER boosted on "GenAI deal wins" signals
```

#### Environmental
```yaml
- India committed to 500GW renewable capacity by 2030; 200GW solar already operational
- Green hydrogen mission: ₹19,744 Cr allocated for R&D and electrolyser manufacturing
- Carbon credit market (CCTS) launched; SEBI mandates ESG disclosures for top 1000 listed cos
- EV policy: 30% penetration target by 2030; ₹10,900 Cr FAME III subsidy announced
- Engine impact: Power & Utilities sector conviction bonus; auto sector EV-readiness flag
```

#### Legal
```yaml
- SEBI LODR amendments: stricter related-party transaction disclosures effective Apr 2026
- Companies Act 2013 update strengthening minority shareholder rights and nominee directors
- IBC framework resolved ₹3.5L Cr in FY26; recovery rate improving to 34%
- Digital Personal Data Protection (DPDP) Act enacted; compliance cost impacts IT and BFSI
- Engine impact: MAX_PLEDGE_PCT monitor per ticker; high-pledge stocks flagged at Level 4
```

---

### 6.2 Industry / Sector-Level PESTEL

#### Banking & Finance

```yaml
Political:
  - RBI priority sector lending mandates 40% of net credit; PSL compliance cost for private banks
  - Govt recapitalisation of PSU banks ₹15,000 Cr; enables credit growth without dilution
Economic:
  - NIM compression risk as rate cycle turns; CASA ratio critical for cost-of-fund advantage
  - Retail credit CAGR 22%; GNPA improving to 2.8% industry-wide — 10-year low
Social:
  - 500Mn Jan Dhan accounts; PMJJBY/PMSBY penetration driving embedded bancassurance
  - Gen-Z banking shift to digital-first; branch network rationalisation accelerating
Technological:
  - Account Aggregator framework unlocking data-driven credit; 60Mn+ linked accounts
  - AI-driven fraud detection saving ₹8,000 Cr annually; UPI-credit stack emerging
Environmental:
  - RBI climate risk disclosure framework for banks mandated by FY27
  - ESG-linked bonds growing 3x; banks facilitating renewable project debt
Legal:
  - Basel III compliance complete; LCR buffers adequate for rate shock scenarios
  - RBI digital lending circular tightening NBFC co-lending norms
Engine modifiers affected: INSTITUTIONAL_ACCUMULATION_MIN_CR (Level_7), MIN_RETAINED_VALUE_RATIO (Level_4)
```

#### Information Technology

```yaml
Political:
  - H1-B visa uncertainty adds onsite delivery cost pressure for IT majors
  - Digital India contracts: ₹75,000 Cr government IT spend — captive revenue stream
Economic:
  - BFSI and retail verticals in recovery; GenAI deal wins $10B+ industry TCV in FY26
  - INR depreciation provides 2–3% EBIT margin tailwind for USD-revenue companies
Social:
  - 1.5Mn engineers graduating annually; attrition normalised to 12–14%
  - Return-to-office mandates reduce remote cost arbitrage; office RE demand rising
Technological:
  - GenAI cannibalising 20–30% of legacy AMS work; offset by AI-native project demand
  - Cloud migration wave 2.0: hybrid/multi-cloud architecture driving $60B India-delivered services
Environmental:
  - Net-zero commitments by TCS, Infosys, Wipro by 2030; renewable data centre energy
  - Green software engineering emerging as differentiator in ESG-conscious client RFPs
Legal:
  - EU AI Act compliance cost for Indian IT exporters serving European clients
  - DPDP Act data localisation adding infra cost for domestic digital projects
Engine modifiers affected: NLP_KEYWORD_MULTIPLIER (Level_2), MIN_THEME_SCORE (Level_2)
```

#### Power & Utilities

```yaml
Political:
  - PM Surya Ghar scheme: 1 Cr rooftop solar connections — distributed generation push
  - National Electricity Plan mandates 500GW by 2030; DISCOM reform tied to central funding
Economic:
  - Power demand CAGR 7%; peak demand 250GW by FY27 creating transmission bottleneck
  - Renewable tariffs at ₹2.5–3/unit; thermal still required for baseload dispatch
Social:
  - 24×7 power for all households: 99.9% electrification achieved; reliability is next
  - Industrial electricity cost competitiveness critical for Make-in-India manufacturing
Technological:
  - Battery storage target 47GW by 2030; lithium-ion and flow battery tenders launched
  - Smart grid: AMI rollout 25Cr households; real-time demand response capability
Environmental:
  - Thermal capacity additions capped; only ultra-supercritical pit-head plants approved
  - India adding 30GW renewable/year; largest solar auction pipeline globally
Legal:
  - CERC tariff revision every 5 years; regulated equity return 15.5% for POWERGRID/NTPC
  - Green Energy Open Access rules simplifying captive renewable procurement
Engine modifiers affected: CRUDE_DANGER_THRESHOLD (Level_1), YIELD_CURVE_WEIGHT (Level_1)
```

#### Pharmaceuticals

```yaml
Political:
  - NPPA essential medicines price control: 350+ drugs under price cap — margin pressure
  - PLI pharma ₹15,000 Cr for API and bulk drug manufacturing — China import substitution
Economic:
  - India pharma market $50B by 2030; US generics exports $25B dominant revenue stream
  - US FDA ANDA backlog clearance supporting Sun Pharma, Dr Reddy's, Cipla US ramp
Social:
  - Chronic disease burden (diabetes, hypertension, cancer) driving branded generics demand
  - PMJAY health insurance 50Mn+ beneficiaries expanding hospital and pharma coverage
Technological:
  - AI drug discovery reducing preclinical timeline 40%; Indian pharma investing ₹2,000 Cr R&D
  - Biologic and biosimilar pipeline: India targeting $10B biosimilar exports by 2030
Environmental:
  - API manufacturing effluent norms tightening; Hyderabad pharma cluster under CPCB scrutiny
  - Green chemistry mandates for solvent recovery in formulation plants
Legal:
  - US DOJ historical price-fixing investigation legacy risk for generic exporters
  - TRIPS flexibility protecting domestic formulations market from data exclusivity
Engine modifiers affected: MIN_ROCE_SD (Level_3), MARGIN_PREMIUM_WEIGHT (Level_3)
```

---

### 6.3 Company-Level PESTEL — Per-Ticker Overrides

Engine stores company-specific PESTEL overrides in `Thesis_Ledger.level8_raw_json`:

```json
{
  "ticker": "NESTLEIND",
  "pestel": {
    "political": [
      "FDI under automatic route; royalty repatriation 5% of net sales (FIPB exempt)",
      "FSSAI norms on sugar/salt content — forcing product reformulation by FY27"
    ],
    "economic": [
      "Volume growth recovery 6–8%; rural distribution reaches 4.5Mn outlets",
      "Premiumisation driving ASP growth 12%; KitKat, Munch, Maggi mix shift"
    ],
    "social": [
      "Health-conscious consumers driving demand for low-sodium, high-protein variants",
      "School nutrition programs and mid-day meal contracts providing revenue visibility"
    ],
    "technological": [
      "AI demand sensing reducing SKU waste 18%; plant digitalisation Pune + Nanjangud",
      "D2C + quick commerce: 8% of revenue, growing 40% YoY"
    ],
    "environmental": [
      "95% recyclable/reusable packaging commitment by 2025 — on track",
      "Water stewardship in Moga plant; 40% reduction in water intensity achieved"
    ],
    "legal": [
      "DPDP Act compliance for loyalty data; FSSAI digital records mandate active"
    ]
  }
}
```

**Override Priority:**
```
Company-specific override  →  Sector-level PESTEL  →  Market-level PESTEL (fallback)
```

---

### 6.4 PESTEL-to-Engine Modifier Mapping

| PESTEL Pillar | Engine Level | Modifier Key | Trigger Condition |
|---|---|---|---|
| **All pillars** — composite | Level_1 | `PESTEL_WEIGHT` | Blended into Regime Score as 5th component (default 0.10) |
| **All pillars** — sector delta | Level_1 | `SECTOR_MODIFIER[]` | `sector_pestel_modifiers` from `pestel_output.json` added to SECTOR_MODIFIER dict |
| **All pillars** — NLP corpus | Level_2 | NLP keyword scoring | Headlines from `pestel_news_feed` injected as additional NLP documents |
| **All pillars** — thesis context | Level_8 | `pestel_context` block | `ticker_pestel_flags` from `pestel_output.json` surfaced in thesis JSON |
| Political — crude/sanctions | Level_1 | `CRUDE_DANGER_THRESHOLD` | Brent > $85/bbl + geopolitical alert |
| Political — currency regime | Level_1 | `CURRENCY_IMPACT_MULTIPLIER` | INR/USD move > 0.5% intraday |
| Economic — yield curve | Level_1 | `YIELD_CURVE_WEIGHT` | 10Y–2Y spread inverts < –10bps |
| Social — thematic keyword | Level_2 | `NLP_KEYWORD_MULTIPLIER` | Social sentiment score > 70 |
| Social — theme minimum | Level_2 | `MIN_THEME_SCORE` | Theme cluster size < 3 tickers |
| Technological — margins | Level_3 | `MARGIN_PREMIUM_WEIGHT` | Gross margin delta > 200bps |
| Legal — pledge risk | Level_4 | `MAX_PLEDGE_PCT` | Promoter pledge > 15% |
| Legal — retained earnings | Level_4 | `MIN_RETAINED_VALUE_RATIO` | Retained equity / total equity < 1.25 |
| Environmental — ESG score | Level_9 | `MAX_BETA` | High-beta ESG-risk stocks capped at 1.35 |

### 6.5 PESTEL Fallback Rules

| Scenario | Permitted Action | Penalty |
|---|---|---|
| Single RSS feed timeout | Try next feed for same pillar; continue | None |
| All feeds for a pillar fail | Use filesystem cache ≤ 3 days stale | −5% on that pillar's contribution only |
| All pillars stale / no data | Use yesterday's `pestel_daily_scores` row | `PESTEL_WEIGHT` halved for today's run |
| `pestel_daily_scores` empty | PESTEL component = 0; all other weights re-normalized to sum 1.0 | Log warning |

> **Zero-hallucination guarantee**: The PESTEL engine never fabricates scores. If no data is available, the pillar score defaults to `0.0` (neutral) and is excluded from the weighted composite.

