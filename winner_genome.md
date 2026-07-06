# Winner Genome Platform

```yaml
name: "Winner_Genome_Platform"
framework: "OACF"
version: "1.0.0"
type: "research_database"
phase: "Alpha Discovery"
module: "Level 10.5 Alpha Discovery"
writes_to:
  - winner_genome_database
```

---

## 1. Context & Purpose

The **Winner Genome Platform** acts as the high-resolution microscope for the quantitative research team. While the primary models learn from the entire universe distribution, the Genome Platform strictly isolates and scrutinizes the **absolute best performers** in the market every single day.

By archiving the exact state of Top 10, Top 25, Top 50, and Top Decile stocks just before they surged, researchers can reverse-engineer the "DNA" or "Genome" of massive alpha generators.

---

## 2. Storage Definitions

The platform classifies "Winners" based on `T+5` forward alpha realization.

### `winner_genome_database` Schema Requirements

| Column | Type | Description |
| :--- | :--- | :--- |
| `date` | DATE | Snapshot Date (D) |
| `ticker` | VARCHAR | Equity Symbol |
| `winner_tier` | ENUM | `TOP_10`, `TOP_25`, `TOP_50`, `TOP_DECILE` |
| `actual_rank` | INT | True cross-sectional rank (1 to N) |
| `predicted_rank` | INT | Rank predicted by our production model on D |
| `fwd_alpha_5d` | FLOAT | Actual T+5 alpha |
| `regime` | VARCHAR | Macro regime state on D |
| `liquidity_profile`| JSONB | ADV, Spread, Impact Cost |
| `volatility_profile`| JSONB | Historical ATR, Beta, GARCH |
| `corporate_actions`| JSONB | Dividends, splits, earnings events ±5 days |
| `news_flags` | JSONB | Relevant NLP thematic flags active on D |
| `feature_snapshot` | JSONB | Exact L1-L8 feature vector used |

---

## 3. Analytical Application

Once populated, the Genome Platform allows Quant Researchers to run high-level SQL aggregations to identify structural truths, such as:

* *"In Bear_RiskOff regimes, what was the average ROCE Z-Score of the Top 10 Winners?"*
* *"What percentage of Top 25 Winners had an upcoming corporate action flagged within 3 days?"*
* *"How many Top Decile winners possessed high liquidity profiles versus mid-cap illiquid profiles?"*

These insights feed directly into the **Factor Discovery Engine** to generate new trading signals.
