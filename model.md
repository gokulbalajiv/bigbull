# Big Bull Engine - Alpha Research & Ranking Architecture

## 1. Core Objective Function: LambdaMART Ranking

**Goal**: "Select the highest expected alpha stocks every day."

The core model transitions from a binary classification model (Target vs. Stop Loss) to a pairwise ranking model using **LightGBM's LambdaRank (LambdaMART)**. This fundamentally alters the loss function to minimize pair inversions in predicted vs. actual alpha, optimizing for the top of the ranked list (NDCG).

### 1.1 Label Generation (Forward Alpha)

Labels are no longer historical stop-loss vs. target hits. They are relative performance buckets cross-sectionally defined per day.

```python
def generate_ranking_labels(df, horizon_days=5):
    """
    Computes cross-sectional ranking labels per date.
    df requires: 'date', 'symbol', 'close', 'benchmark_close'
    """
    # 1. Forward Returns
    df[f'fwd_ret_{horizon_days}d'] = df.groupby('symbol')['close'].shift(-horizon_days) / df['close'] - 1.0
    df[f'bench_fwd_ret_{horizon_days}d'] = df.groupby('symbol')['benchmark_close'].shift(-horizon_days) / df['benchmark_close'] - 1.0
    
    # 2. Forward Alpha
    df['fwd_alpha'] = df[f'fwd_ret_{horizon_days}d'] - df[f'bench_fwd_ret_{horizon_days}d']
    
    # 3. Discretize into cross-sectional rank buckets (0 to 4) per day
    def assign_rank_bucket(series):
        return pd.qcut(series, q=[0, 0.1, 0.3, 0.7, 0.9, 1.0], labels=[0, 1, 2, 3, 4], duplicates='drop')

    # Apply per date query group
    df['label'] = df.groupby('date')['fwd_alpha'].transform(assign_rank_bucket)
    
    # Drop rows where horizon returns are NaN (look-ahead boundary)
    df.dropna(subset=['label'], inplace=True)
    return df
```

### 1.2 Model Definition

```python
import lightgbm as lgb

params = {
    'objective': 'lambdarank',      # Pairwise ranking loss
    'metric': 'ndcg',               # Normalized Discounted Cumulative Gain
    'ndcg_eval_at': [10],           # We only care about top 10 portfolio selections
    'learning_rate': 0.05,
    'num_leaves': 31,
    'min_data_in_leaf': 50,
    'colsample_bytree': 0.8,
    'subsample': 0.8,
    'random_state': 42
}

# Training requires explicit 'group' boundaries (number of symbols per date)
# X_train, y_train, q_train = prep_ranking_data(df)
# model = lgb.train(params, lgb.Dataset(X_train, y_train, group=q_train))
```

---

## 2. Expanded Feature Space

The feature vector must expand from basic technicals to a robust Alpha Factor library (50-200 features).

| Category | Examples | Description |
| :--- | :--- | :--- |
| **Momentum / Trend** | `RSI_14`, `MACD`, `Price_to_SMA_50`, `Z_Score_20d` | Standard cross-sectional trend indicators. |
| **Volatility / Risk** | `ATR_14_Pct`, `Realized_Vol_20d`, `Beta_60d` | Risk-adjusted metrics, useful for volatility scaling. |
| **Flow / Liquidity** | `Volume_Surge_5d`, `Amihud_Illiquidity`, `OBV_Trend` | Institutional accumulation signatures. |
| **Fundamental** | `PE_Ratio`, `PB_Ratio`, `ROE`, `Debt_to_Equity` | Valuation anchors (if data available). |
| **Macro / Regime** | `VIX_Level`, `Yield_Curve_Spread`, `Nifty_Trend` | Market context features. |
| **Cross-Sectional** | `Rank_RSI`, `Z_Score_Sector_Returns` | Features standardized cross-sectionally per date. |

---

## 3. Regime Engine (Level 0)

Before inferencing, the **Regime Engine** determines the macro state. It acts as an orchestrator modifier.

### 3.1 Regime Definition
```python
def determine_regime(nifty_data, vix_data):
    """
    Classifies the current market regime.
    """
    nifty_trend = nifty_data['close'].iloc[-1] > nifty_data['sma_200'].iloc[-1]
    vix_level = vix_data['close'].iloc[-1]
    
    if nifty_trend and vix_level < 20:
        return 'Bull_LowVol'
    elif nifty_trend and vix_level >= 20:
        return 'Bull_HighVol'
    elif not nifty_trend and vix_level < 25:
        return 'Bear_Grind'
    else:
        return 'Bear_Crash'
```

### 3.2 Dynamic Portfolio Scaling
If Regime = `Bear_Crash`, the Orchestrator may reduce Top N selections from 10 to 5, or scale target allocations by 0.5x, or trigger the **Null Kill-Switch** (return cash portfolio).

---

## 4. Missed Alpha Research Engine

Stop forcing missed winners as "positive" targets in the primary model. Instead, run a standalone **Attribution Pipeline**.

```python
def analyze_missed_alpha(predictions_df, actual_alpha_df):
    """
    Identifies stocks that achieved Top 10% Alpha but were ranked poorly by the model.
    """
    merged = predictions_df.merge(actual_alpha_df, on=['date', 'symbol'])
    
    # Missed Winners: Actual Top Bucket, but predicted Bottom Half
    missed_winners = merged[(merged['actual_label'] == 4) & (merged['predicted_rank'] > len(merged)/2)]
    
    # Extract feature vectors of missed winners for cluster analysis
    # Use PCA / K-Means to identify commonalities in missed winners.
    return extract_feature_clusters(missed_winners)
```
Output feeds into a weekly "Research Report" to guide feature engineering.

---

## 5. Model Ensemble (Stacked Generalization)

Instead of one monolithic LGBM, use an ensemble approach for robust alpha generation.

1.  **L1 Model (Momentum Ranker)**: Trains only on Price/Vol/Trend features.
2.  **L1 Model (Mean-Reversion)**: Trains on statistical arbitrage features (Z-Scores, RSI extremes).
3.  **L1 Model (Fundamental)**: Trains on valuation metrics.
4.  **Meta-Model (Ridge Regression / LGBM)**: Takes the predicted ranks from the L1 models and outputs a final composite Alpha Score.

---

## 6. Drift Detection

Production models degrade. Implement **Population Stability Index (PSI)** and **Wasserstein Distance** to monitor concept drift daily.

```python
from scipy.stats import wasserstein_distance

def check_feature_drift(train_dist, recent_dist, feature_name, threshold=0.1):
    """
    Alerts if recent daily feature distribution significantly diverges from training distribution.
    """
    dist = wasserstein_distance(train_dist[feature_name], recent_dist[feature_name])
    if dist > threshold:
        alert_system(f"DRIFT DETECTED in {feature_name}: Wasserstein = {dist}")
```

---

## 7. Validation Framework (Purged Walk-Forward)

Never use standard k-fold cross-validation for time series.

1.  **Walk-Forward**: Train on `[t-252, t]`. Validate on `[t+1, t+20]`. Roll window forward.
2.  **Embargo**: Ensure strict chronological splitting.
3.  **Purging**: If predicting 5-day forward alpha, drop the 5 days before the validation set from the training set to prevent return overlap leakage.

```python
from sklearn.model_selection import TimeSeriesSplit
# Implement PurgedKFold or customized time series split with embargo gap > horizon_days.
```

---

## 8. Database Schema Updates

### Table: `ml_feature_store`
| Column | Type | Description |
| :--- | :--- | :--- |
| `date` | DATE | Snapshot date |
| `symbol` | VARCHAR | Ticker |
| `feature_vector` | JSONB | Stored calculated features |

### Table: `ml_predictions_log`
| Column | Type | Description |
| :--- | :--- | :--- |
| `date` | DATE | Inference Date |
| `symbol` | VARCHAR | Ticker |
| `predicted_score` | FLOAT | Raw LambdaMART output |
| `predicted_rank` | INT | Cross-sectional rank |
| `actual_fwd_alpha` | FLOAT | Populated T+5 days later |

### Table: `ml_drift_metrics`
| Column | Type | Description |
| :--- | :--- | :--- |
| `date` | DATE | Computation date |
| `feature_name` | VARCHAR | E.g., 'RSI_14' |
| `wasserstein_dist` | FLOAT | Drift metric vs baseline |

---

## 9. Migration Plan

1.  **Phase 1 (Shadow Mode)**:
    *   Build Feature Store pipeline (Level 1-8 modified to output to `ml_feature_store`).
    *   Train LGBM Ranker offline.
    *   Run inference daily in shadow mode, writing to `ml_predictions_log` alongside the old binary model.
2.  **Phase 2 (Validation)**:
    *   Wait 20 trading days. Evaluate Ranker NDCG@10 vs Binary Model Hit Rate.
3.  **Phase 3 (Cutover)**:
    *   Update `orchestrator.md` to point to the new Ranking endpoints.
    *   Deprecate old binary `level10_learning.md` retrospective logic. Replace with Missed Alpha Engine.
