# Historical Reconstruction Engine

```yaml
name: "Historical_Reconstruction_Engine"
framework: "OACF"
version: "1.0.0"
type: "data_infrastructure"
phase: "Retrospective Research"
module: "Level 10.5 Alpha Discovery"
writes_to:
  - historical_feature_store
```

---

## 1. Context & Purpose

The **Historical Reconstruction Engine** is a critical data infrastructure component required for quantitative research. It allows the Alpha Discovery Platform to perform backtests, simulate walk-forward validations, and test new hypothesis factors across multiple years of data.

Its core capability is to rebuild point-in-time feature states exactly as they would have appeared to the live engine at `07:45 AM` on any given historical date (e.g., exactly 3 years ago), eliminating look-ahead bias.

---

## 2. Capabilities

1. **Backfill Execution**: Triggers a backfill over a defined window (e.g., T-3 years to T-0).
2. **Feature Reconstruction**: Iteratively calls the Level 1-8 logic pipelines, supplying them only with historical data valid up to `T-1` close.
3. **Multi-Horizon Label Generation**: Automatically computes actual forward alpha returns over `T+5`, `T+10`, and `T+20` day horizons.
4. **Historical Alpha Bucketing**: Sorts the reconstructed universe cross-sectionally per day and assigns historical decile buckets.

---

## 3. `historical_feature_store` Schema Requirements

This store heavily denormalizes the data for massive read-throughput during model retraining and backtesting.

| Column | Type | Description |
| :--- | :--- | :--- |
| `date` | DATE | Snapshot point-in-time |
| `ticker` | VARCHAR | Equity Symbol |
| `feature_vector` | JSONB | Reconstructed Levels 1-8 features |
| `fwd_alpha_5d` | FLOAT | T+5 days alpha vs benchmark |
| `fwd_alpha_10d` | FLOAT | T+10 days alpha vs benchmark |
| `fwd_alpha_20d` | FLOAT | T+20 days alpha vs benchmark |
| `alpha_bucket_5d` | INT | Cross-sectional rank (0-4) at T+5 |
| `alpha_bucket_10d`| INT | Cross-sectional rank (0-4) at T+10 |
| `alpha_bucket_20d`| INT | Cross-sectional rank (0-4) at T+20 |
| `reconstruction_ts`| TIMESTAMPTZ | Audit trail for when backfill ran |

---

## 4. Execution Workflow

1. **Trigger**: Researcher issues CLI command `python services/historical_reconstruction_engine.py --start_date 2021-01-01 --end_date 2024-01-01`
2. **Loop**: Iterates day-by-day across trading calendar.
3. **Point-In-Time Guard**: At each `D`, it masks all `db` queries ensuring no data `> D` is accessible.
4. **Compute**: Runs feature extractors, saves vector to `historical_feature_store`.
5. **Labels**: Triggers label generation job that looks ahead `+5`, `+10`, `+20` days to assign targets.
