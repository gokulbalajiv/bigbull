# Level 10.5 — Alpha Discovery Engine

```yaml
name: "Alpha_Discovery_Engine"
framework: "OACF"
version: "1.0.0"
type: "research_node"
level: 10.5
phase: "Alpha Research"
execution: "17:00 IST — Post-Retrospective (T+5 Alpha Labels Required)"
writes_to:
  - research_winner_snapshot
  - research_prediction_gaps
  - research_missed_alpha
  - research_factor_registry
  - research_feature_drift
core_directive: "DISCOVER → VALIDATE → RECOMMEND"
```

---

## 1. Context & Purpose

The **Alpha Discovery Engine** functions identically to an institutional quantitative research team. 
Its purpose is to **discover hidden factors, identify blind spots, and recommend new features** by analyzing prediction gaps and missed alpha opportunities.

**CRITICAL CONSTRAINT**: The Alpha Discovery Engine NEVER forces positive labels into training data. It NEVER auto-trains the Level 10 Ensemble. It operates strictly in an isolated research environment. All discovered factors must pass the **Factor Validation Pipeline** before being integrated into production models.

---

## 2. Section 1: Winner Snapshot Database

Every day at T+5, after the actual forward alpha is realized, the engine takes a snapshot of the true market winners to preserve a pristine, look-ahead-bias-free record.

### Workflow:
1. Identify the **Actual Top 10 Winners**, **Actual Top 50 Winners**, and **Actual Top Decile Stocks** for day `D` (calculated at `D+5`).
2. Snapshot their properties, feature vectors, and prediction ranks.

### Table: `research_winner_snapshot`
| Column | Type | Description |
| :--- | :--- | :--- |
| `date` | DATE | Trade Date (D) |
| `ticker` | VARCHAR | Equity Symbol |
| `sector` | VARCHAR | SEBI Sector |
| `industry` | VARCHAR | Specific Industry |
| `feature_vector` | JSONB | Complete JSON of all Level 1-8 features at D |
| `predicted_score` | FLOAT | Alpha Score predicted by the model on D |
| `predicted_rank` | INT | Cross-sectional rank assigned by model |
| `actual_alpha` | FLOAT | Actual T+5 forward return over benchmark |
| `actual_rank` | INT | True cross-sectional rank of actual alpha |
| `regime` | VARCHAR | Macro regime identified by Level 0 on D |
| `portfolio_inclusion`| BOOLEAN | Was this stock actually traded? |

---

## 3. Section 2: Prediction Gap Analysis

Evaluates the daily performance of the Ranker by comparing the "Predicted Top 10" against the "Actual Top 10".

### Calculated Metrics
- **False Positives**: Stocks in Predicted Top 10 but NOT in Actual Top Decile.
- **False Negatives**: Stocks in Actual Top 10 but NOT in Predicted Top 50.
- **Precision@10**: `%` of Predicted Top 10 that landed in the Actual Top 10.
- **Recall@10**: `%` of Actual Top 10 captured in the Predicted Top 10.
- **NDCG@10**: Normalized Discounted Cumulative Gain for the Predicted Top 10.
- **Rank IC**: Spearman Rank Correlation between predicted ranks and actual ranks across the universe.

### Output
These metrics are stored daily in `research_prediction_gaps` and compiled into a weekly **Research Report** for the Quant Team.

---

## 4. Section 3: Missed Alpha Engine

Identifies structural blind spots where the model severely undervalued a true winner.

### Condition:
A stock is flagged as `MISSED_ALPHA` if:
```sql
actual_rank <= (universe_size * 0.10)   -- Actual Alpha = Top Decile
AND 
predicted_rank > (universe_size * 0.50) -- Predicted Rank > 50th Percentile
```

These stocks are extracted and pushed to the `research_missed_alpha` table for Pattern Discovery.

---

## 5. Section 4: Pattern Discovery (UMAP + HDBSCAN)

Instead of using K-Means (which assumes spherical, equally-sized clusters and struggles in high-dimensional feature spaces), the engine utilizes **UMAP** for non-linear dimensionality reduction, followed by **HDBSCAN** for density-based clustering.

### Workflow:
1. **Reduce Dimensions**: Apply UMAP to the 200+ features of the `MISSED_ALPHA` stocks to preserve local and global data structures.
2. **Find Densities**: Apply HDBSCAN on the UMAP embeddings to find arbitrarily shaped dense clusters of missed opportunities.
3. **Analyze Centroids**: For each cluster, calculate the feature importance (mean divergence from the universe mean).

### Example Output:
If a dense cluster is identified, the engine extracts the defining traits:
- *Feature 1*: `Delivery_Pct` > 80th percentile
- *Feature 2*: `Institutional_Flow_Cr` > ₹100Cr
- *Feature 3*: `Relative_Strength` > 90th percentile

**Output to Registry**: 
- **Pattern Candidate**: `High-Delivery Strong-Flow Momentum`
- **Confidence Score**: `0.85` (Based on HDBSCAN cluster density)
- **Support Count**: `142 occurrences`

---

## 6. Section 5: Factor Discovery Engine

Translates recurring HDBSCAN patterns into mathematical candidate factors.

### Workflow:
For the pattern example above, the Factor Discovery Engine generates a programmatic factor:

**Candidate Factor**: `Institutional_Accumulation_Persistence`
- **Formula**: `(Delivery_Pct_5d_MA / Delivery_Pct_20d_MA) * Log(Institutional_Flow_Cr)`
- **Data Source**: NSE Bhav Copy, SEBI Bulk Deals
- **Economic Rationale**: Sustained high delivery volume combined with large block purchases indicates quiet institutional accumulation before a breakout.
- **Sample Size**: 142 historical occurrences.
- **Regime Dependency**: Bull_LowVol

This candidate is stored in `research_factor_registry` with status `RESEARCH`.

---

## 7. Section 5.5: The Feature Orthogonalization Gate (Level 10.75)

Before any candidate factor can enter the validation funnel, it must prove it is not just a redundant clone of an existing production feature. Tree-based rankers (LambdaMART) suffer from feature fractioning if flooded with collinear inputs.

### Workflow:
1. **Regress Candidate**: Perform a linear regression (or Gram-Schmidt process) of the new candidate factor against the covariance matrix of the live `ml_feature_store`.
2. **Extract Residual**: Isolate the unexplained variance (the residual).
3. **Predictive Check**: Test if the pure residual holds any predictive Rank IC.
4. **Action**: If the residual's predictive power is near zero, the factor is discarded as redundant bloat. If the residual holds unique alpha, the *residualized formula* proceeds to validation.

---

## 8. Section 6: Factor Validation Pipeline

No factor automatically enters production. The validation pipeline requires explicit approval.

### The Funnel:
1. **Research**: Candidate generated by Level 10.5.
2. **Backtest**: Calculate the historical Information Coefficient (IC) of the raw factor over a 5-year period.
3. **Walk-Forward Validation**: Train a lightweight Ranker using *only* this factor. Evaluate Sharpe ratio dynamically.
4. **Purged CV**: Apply combinatorial purged cross-validation to ensure the factor's IC is robust against overlapping return windows.
5. **Out-of-Time Validation**: Test the factor on an unseen holdout set (e.g., the last 6 months of market data).
6. **Approval**: Quant team manually reviews the Tearsheet and promotes the factor from `REJECTED` / `RESEARCH` to `APPROVED`.

Only `APPROVED` factors are added to the Level 1-8 extraction phase.

---

## 8. Section 7: Winner Frequency Analysis

Continuously calculates how frequently specific features appear in the Actual Top Decile stocks.

### Metrics Computed:
- **Winner Frequency**: What % of Actual Winners possessed Feature X > 80th percentile?
- **Information Coefficient (IC)**: Spearman correlation between Feature X and T+5 Forward Alpha.
- **Regime Dependency**: Does this IC hold across all regimes?

Produces daily, weekly, and monthly tracking reports.

---

## 9. Section 8: Regime-Specific Discovery

The engine analyzes winners strictly partitioned by the Level 0 Regime (e.g., Bull, Bear, Risk-On, Risk-Off).

### Goal:
Identify factors that are highly predictive in one regime but useless or destructive in another.
- *Example*: `High_Dividend_Yield` might have an IC of 0.05 in `Bull_RiskOn`, but an IC of 0.25 in `Bear_RiskOff`.

**Output**: Pushed to the **Regime Factor Registry** to help the Meta-Model dynamically assign weights.

---

## 10. Section 9: Feature Importance Drift

Monitors the degradation of existing production factors over time.

### Tracked Metrics:
1. **SHAP Drift**: Calculate the rolling 30-day SHAP value importance for each feature in the LightGBM Ranker. Alert if it drops below a critical threshold.
2. **Winner Frequency Drift**: If `Institutional_Flow` historically appeared in 60% of winners, but over the last month only appeared in 20%, an alert is generated.
3. **Information Coefficient (IC) Decay**: Monitor the rolling 90-day IC of every production feature.

### Action:
If a factor exhibits severe decay, generate a **"Factor Deprecation Alert"** to Quant Researchers. The system *never* auto-removes the factor; it only recommends deprecation.
