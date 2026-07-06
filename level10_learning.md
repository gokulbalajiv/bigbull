# Ensemble_Retraining_Engine — Level 10

```yaml
name: "Ensemble_Retraining_Engine"
framework: "OACF"
version: "4.0.0"
type: "audit_node"
level: 10
phase: "Retrospective"
nightly_execution: "16:30 IST — data logging + concept drift checks + missed alpha clustering"
weekly_execution:  "Friday 18:00 IST — full Ensemble (L1 + Meta) retrain + validation"
writes_to:
  - ml_feature_store         # feature vectors logged nightly
  - ml_predictions_log       # daily inference logs
  - ml_drift_metrics         # daily Wasserstein/PSI stats
  - Missed_Alpha_Log         # Cluster attributes for missed top 10%
  - Engine_Modifiers         # Model hyperparameters
anti_hallucination: orchestrator.md § 8
```

---

## 1. Context

The Ensemble Retraining Engine transitions from binary target/stop-loss reinforcement to **Continuous Forward Alpha Ranking**.

| Schedule | Action |
|---|---|
| **Daily 16:30 IST** | Log today's inference features. Evaluate T+5 forward returns for D-5 features to finalize cross-sectional ranking labels (0-4). Detect Concept Drift. Run Missed Alpha Clustering. |
| **Friday 18:00 IST** | Trigger full ensemble retrain (L1 Models + Ridge Meta-Model) using Purged Walk-Forward Cross-Validation. |

---

## 2. Nightly Routine — Label Generation & Drift

### Step 1: Finalize T+5 Alpha Labels (Cross-Sectional Ranking)

For features stored 5 trading days ago, actual forward alpha is now known. We discretize them cross-sectionally.

```python
import pandas as pd

def finalize_forward_alpha_labels(eval_date: str, horizon_days: int = 5) -> int:
    """
    Called daily to evaluate performance from `eval_date` (which is today - 5 days).
    Calculates stock return vs benchmark return, and assigns ranking buckets [0..4].
    """
    # 1. Fetch universe for eval_date
    df = db.query("""
        SELECT fs.ticker, p1.close as start_price, p2.close as end_price, 
               b1.close as bench_start, b2.close as bench_end,
               fs.spread_bps, fs.impact_cost_bps, fs.idio_vol_20d
        FROM ml_feature_store fs
        JOIN nse_prices p1 ON p1.ticker = fs.ticker AND p1.date = fs.date
        JOIN nse_prices p2 ON p2.ticker = fs.ticker AND p2.date = CURRENT_DATE
        JOIN benchmark_prices b1 ON b1.date = fs.date
        JOIN benchmark_prices b2 ON b2.date = CURRENT_DATE
        WHERE fs.date = %s AND fs.label IS NULL
    """, [eval_date]).to_dataframe()
    
    if df.empty: return 0
    
    # 2. Compute Adjusted Alpha (Execution Penalty)
    df['fwd_ret'] = (df['end_price'] / df['start_price']) - 1.0
    df['bench_ret'] = (df['bench_end'] / df['bench_start']) - 1.0
    
    # R_raw = theoretical alpha
    df['fwd_alpha_raw'] = df['fwd_ret'] - df['bench_ret']
    
    # R_adj = R_raw - (Spread * Lambda) - MarketImpactCost
    # Assume fs contains liquidity and vol metrics
    df['spread_cost'] = df['spread_bps'] * 0.0001
    df['impact_cost'] = df['impact_cost_bps'] * 0.0001
    df['fwd_alpha_adj'] = df['fwd_alpha_raw'] - df['spread_cost'] - df['impact_cost']
    
    # 3. Volatility-Standardized NDCG Ranking
    # Standardize T+5 returns by trailing idiosyncratic volatility to prevent high-beta dominance
    df['alpha_z_score'] = df['fwd_alpha_adj'] / df['idio_vol_20d']
    
    # 4. Discretize into cross-sectional rank buckets (0 to 4) based on Risk-Adjusted Z-Score
    # Bucket 4 = Top 10%, Bucket 3 = Next 20%, Bucket 2 = Middle 40%, Bucket 1 = Bottom 20%, Bucket 0 = Bottom 10%
    df['label'] = pd.qcut(df['alpha_z_score'], q=[0, 0.1, 0.3, 0.7, 0.9, 1.0], labels=[0, 1, 2, 3, 4], duplicates='drop')
    
    # 5. Write back to store
    for _, row in df.iterrows():
        db.execute("UPDATE ml_feature_store SET label = %s, actual_fwd_alpha = %s WHERE date = %s AND ticker = %s",
                   [int(row['label']), float(row['fwd_alpha_adj']), eval_date, row['ticker']])
        
    return len(df)
```

### Step 2: Concept Drift Detection

Monitors if today's features deviate significantly from the distribution the model was trained on.

```python
from scipy.stats import wasserstein_distance

def monitor_concept_drift(today_features: pd.DataFrame, train_baseline: pd.DataFrame):
    drift_alerts = []
    for col in train_baseline.columns:
        if col not in today_features: continue
        
        dist = wasserstein_distance(train_baseline[col].dropna(), today_features[col].dropna())
        
        # Log to DB
        db.execute("INSERT INTO ml_drift_metrics (date, feature_name, wasserstein_dist) VALUES (%s, %s, %s)",
                   [CURRENT_DATE, col, dist])
        
        if dist > 0.15: # Threshold
            drift_alerts.append(col)
            
    if drift_alerts:
        trigger_slack_alert(f"Feature Drift Detected: {drift_alerts}")
```

### Step 3: Missed Alpha Research Engine

Identifies structural misses: Stocks that hit Bucket 4 (Top 10% Alpha) but were ranked poorly by our engine.

```python
from sklearn.cluster import KMeans

def cluster_missed_alpha(eval_date: str):
    """
    Extracts stocks that were actual Bucket 4 but predicted in the bottom 50%.
    Clusters their feature vectors to find common un-modeled themes.
    """
    missed_df = db.query("""
        SELECT fs.* 
        FROM ml_feature_store fs
        JOIN ml_predictions_log pl ON pl.date = fs.date AND pl.symbol = fs.ticker
        WHERE fs.date = %s AND fs.label = 4 AND pl.predicted_rank > 50
    """, [eval_date]).to_dataframe()
    
    if len(missed_df) < 5: return # Not enough for clustering
    
    # Run K-Means
    features = missed_df.drop(columns=['date', 'ticker', 'label', 'actual_fwd_alpha'])
    kmeans = KMeans(n_clusters=2, random_state=42).fit(features)
    missed_df['cluster'] = kmeans.labels_
    
    # Save to Missed_Alpha_Log for Quant Research review
    save_missed_alpha_clusters(eval_date, missed_df)
```

---

## 3. Weekly Routine — Ensemble Retraining (Friday)

Replaces the monolithic model with a Stacked Ensemble.

### Step 1: Purged Walk-Forward Split
Uses a 252-day trailing window, but enforces a 5-day embargo to prevent look-ahead bias between train/validation boundaries.

### Step 2: Train Level-1 Models
Train specialized models on feature subsets.

```python
import lightgbm as lgb
from sklearn.linear_model import Ridge

def train_ensemble(X_train, y_train, q_train, X_val, y_val, q_val):
    # L1: Momentum Ranker (Price/Trend features)
    l1_mom = lgb.train(params={'objective': 'lambdarank', 'metric': 'ndcg'}, 
                       train_set=lgb.Dataset(X_train[mom_features], y_train, group=q_train))
    
    # L1: Fundamental Ranker (Valuation features)
    l1_fun = lgb.train(params={'objective': 'lambdarank', 'metric': 'ndcg'}, 
                       train_set=lgb.Dataset(X_train[fun_features], y_train, group=q_train))
    
    # Generate OOF (Out-Of-Fold) predictions for Meta-Model
    meta_X_train = pd.DataFrame({
        'mom_score': l1_mom.predict(X_train[mom_features]),
        'fun_score': l1_fun.predict(X_train[fun_features])
    })
    
    # Meta-Model (Ridge Regression)
    meta_model = Ridge(alpha=1.0)
    meta_model.fit(meta_X_train, y_train)
    
    return l1_mom, l1_fun, meta_model
```

### Step 3: Evaluate NDCG
If `NDCG@10` on the validation set exceeds the current production model, the newly trained ensemble is promoted.

---

## 4. Cold-Start Bootstrap

```python
def bootstrap_ml_feature_store():
    """
    Computes cross-sectional forward alpha labels for historical data to prime the models.
    Requires exactly T+5 close prices vs benchmark.
    """
    pass
```
