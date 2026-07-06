# HRP_Portfolio_Construction — Level 9

```yaml
name: "HRP_Portfolio_Construction"
framework: "OACF"
version: "2.0.0"
type: "analytical_node"
level: 9
phase: "Execution"
execution_time: "07:50 AM IST"
input_source: model.md   # Filtered qualified stocks (P(y=1) > 0.65)
output_table: Daily_Projections
library: "PyPortfolioOpt >= 1.5  OR  Riskfolio-Lib >= 4.0"
```

---

## 1. Context

The HRP Portfolio Construction Engine replaces the equal-weight + greedy Beta-cap algorithm with **Hierarchical Risk Parity (HRP)** — an institutional-grade, covariance-aware capital allocation methodology developed by Marcos López de Prado (2016).

**Why HRP over equal-weight or mean-variance optimization:**

| Method | Problem |
|---|---|
| Equal-weight (1/N) | Ignores correlations — capital clusters in correlated sectors |
| Mean-variance (Markowitz) | Requires matrix inversion — singular/ill-conditioned covariance causes instability |
| **HRP** | No matrix inversion required — robust to singular covariance; allocates inversely to cluster variance |

HRP uses **tree clustering** to detect which stocks are correlated and then allocates **less capital** to high-variance clusters — exactly what an institutional risk desk demands.

**Input:** Filtered stock list from `model.md` (N stocks with conviction_prob > 0.65)
**Output:** Exact weight vector W where Σ wᵢ = 1.0

---

## 2. Execution Logic

### Step 1: Fetch Trailing Returns

```python
import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import linkage, dendrogram
from scipy.spatial.distance import squareform

HRP_LOOKBACK_DAYS = 120   # Trailing 120 trading days (~6 months)

def fetch_trailing_returns(tickers: list[str], lookback_days: int = HRP_LOOKBACK_DAYS) -> pd.DataFrame:
    """
    Fetches trailing daily returns for HRP computation.

    Returns a DataFrame of shape (lookback_days, N) where each column
    is a ticker's daily return series: r_t = (Close_t - Close_{t-1}) / Close_{t-1}.

    ZERO HALLUCINATION: If any ticker has more than 10 missing return observations
    in the lookback window, that ticker is REJECTED from HRP and removed from the
    qualified list. Missing returns are NOT forward-filled or interpolated.
    """
    rows = db.query("""
        SELECT trade_date, ticker, daily_return_pct / 100.0 AS daily_return
        FROM Market_Actuals
        WHERE ticker = ANY(%s)
          AND trade_date >= CURRENT_DATE - INTERVAL '%s days'
        ORDER BY trade_date ASC
    """, [tickers, lookback_days + 10]).fetchall()

    df = pd.DataFrame(rows, columns=["date", "ticker", "return"])
    returns_wide = df.pivot(index="date", columns="ticker", values="return")

    # Null audit — reject tickers with too many gaps
    null_counts = returns_wide.isnull().sum()
    rejected = null_counts[null_counts > 10].index.tolist()
    for ticker in rejected:
        print(f"[FATAL] Ticker Rejected: Missing deterministic data for [RETURN_HISTORY:{ticker}]")

    returns_wide = returns_wide.drop(columns=rejected)

    # Drop remaining NaN rows (non-trading days)
    returns_wide = returns_wide.dropna()

    return returns_wide   # Shape: (T, N) where T >= lookback_days - 10
```

---

### Step 2: Correlation Matrix & Tree Clustering

```python
def compute_correlation_matrix(returns: pd.DataFrame) -> pd.DataFrame:
    """
    Computes Pearson correlation matrix from trailing returns.
    Shape: (N, N) where N = number of qualified stocks.
    """
    return returns.corr(method="pearson")


def compute_distance_matrix(corr: pd.DataFrame) -> np.ndarray:
    """
    Converts correlation matrix to a proper distance metric.

    Formula: d(i,j) = sqrt(0.5 × (1 - ρ(i,j)))

    This is the López de Prado distance metric — ensures:
        d = 0 when ρ = 1.0  (perfect positive correlation)
        d = 1 when ρ = 0.0  (no correlation)
        d = √0.5 when ρ = -1.0 (perfect negative correlation)

    Produces a valid metric space for hierarchical clustering.
    """
    dist = np.sqrt(0.5 * (1.0 - corr.values))
    np.fill_diagonal(dist, 0.0)
    return dist


def build_hierarchical_tree(dist_matrix: np.ndarray, tickers: list[str]) -> np.ndarray:
    """
    Constructs the hierarchical clustering dendrogram using Ward linkage.

    Ward linkage minimizes total within-cluster variance — appropriate for
    financial returns where we want to group stocks with similar risk profiles.

    Returns the linkage matrix Z (shape: N-1 × 4) for recursive bisection.
    """
    condensed_dist = squareform(dist_matrix)   # Convert to condensed form for scipy
    Z = linkage(condensed_dist, method="ward")
    return Z


def get_quasi_diagonal_order(Z: np.ndarray, n: int) -> list[int]:
    """
    Quasi-Diagonalization: Extracts the leaf ordering from the dendrogram
    such that similar (correlated) stocks are placed adjacent in the reordered matrix.

    This reorganizes the covariance matrix so that the largest values cluster
    near the diagonal — the visual and mathematical basis for recursive bisection.

    Returns: List of original integer indices in quasi-diagonal order.
    """
    from scipy.cluster.hierarchy import leaves_list
    return list(leaves_list(Z))
```

---

### Step 3: Recursive Bisection — HRP Capital Allocation

```python
def hrp_recursive_bisection(
    cov:          pd.DataFrame,
    sorted_order: list[int],
    tickers:      list[str],
) -> dict[str, float]:
    """
    Core HRP algorithm: allocates capital inversely proportional to cluster variance.

    Algorithm (López de Prado, 2016):
        1. Start with the full set of stocks in quasi-diagonal order.
        2. Bisect the set into left and right halves.
        3. Compute the cluster variance for each half:
               cluster_var(C) = w(C)ᵀ × Σ(C) × w(C)
               where w(C) = inverse-variance weights within cluster C
        4. Allocate weight between halves inversely proportional to cluster variance:
               α = 1 - cluster_var(left) / (cluster_var(left) + cluster_var(right))
               left_half  gets weight α
               right_half gets weight (1 - α)
        5. Recurse on each half until all leaves are single stocks.
    """
    weights = pd.Series(1.0, index=tickers)
    cluster_items = [sorted_order]   # Start: one cluster containing all stocks

    while cluster_items:
        # Bisect each cluster
        cluster_items = [
            items[i:j]
            for items in cluster_items
            for i, j in ((0, len(items) // 2), (len(items) // 2, len(items)))
            if len(items) > 1
        ]

        for i in range(0, len(cluster_items), 2):
            if i + 1 >= len(cluster_items):
                break

            left_cluster  = cluster_items[i]
            right_cluster = cluster_items[i + 1]

            left_tickers  = [tickers[idx] for idx in left_cluster]
            right_tickers = [tickers[idx] for idx in right_cluster]

            var_left  = _cluster_variance(cov, left_tickers)
            var_right = _cluster_variance(cov, right_tickers)

            # Allocate inversely proportional to variance
            alpha = 1.0 - var_left / (var_left + var_right + 1e-10)

            weights[left_tickers]  *= alpha
            weights[right_tickers] *= (1.0 - alpha)

    # Normalize to ensure weights sum to exactly 1.0
    weights = weights / weights.sum()
    return {ticker: round(float(w), 6) for ticker, w in weights.items()}


def _cluster_variance(cov: pd.DataFrame, cluster_tickers: list[str]) -> float:
    """
    Computes the variance of a cluster using inverse-variance weighting.

    Inverse-variance weight for stock i within cluster C:
        w_i = (1 / σ_i²) / Σ_j(1 / σ_j²)

    Cluster variance:
        σ²(C) = w(C)ᵀ × Σ(C) × w(C)
    """
    sub_cov   = cov.loc[cluster_tickers, cluster_tickers].values
    inv_var   = 1.0 / np.diag(sub_cov).clip(min=1e-10)   # Avoid division by zero
    inv_var   /= inv_var.sum()                              # Normalize
    cluster_var = float(inv_var @ sub_cov @ inv_var)
    return cluster_var
```

---

### Step 4: Full HRP Execution Pipeline

```python
def run_hrp_allocation(qualified_stocks: list[dict]) -> list[dict]:
    """
    Master HRP function — called at 07:50 AM IST with the filtered list
    from model.md.

    Steps:
        1. Fetch trailing 120-day returns
        2. Compute correlation + distance matrix
        3. Build hierarchical dendrogram (Ward linkage)
        4. Quasi-diagonalize
        5. Recursive bisection → weight vector W
        6. Apply minimum weight floor (MIN_WEIGHT_PCT)
        7. Renormalize → Σwᵢ = 1.0
        8. Return final allocation with conviction metadata

    Returns: List of dicts with weight_pct, conviction_prob, SHAP, etc.
    """
    tickers = [s["ticker"] for s in qualified_stocks]

    # Step 1: Returns
    returns = fetch_trailing_returns(tickers, lookback_days=HRP_LOOKBACK_DAYS)
    active_tickers = list(returns.columns)  # May be fewer if some were rejected

    # Reconcile: keep only stocks with valid returns
    qualified_stocks = [s for s in qualified_stocks if s["ticker"] in active_tickers]

    if len(qualified_stocks) < 2:
        raise RuntimeError("[FATAL] HRP requires at least 2 stocks with valid return history.")

    # Step 2: Correlation + distance
    corr     = compute_correlation_matrix(returns)
    dist_mat = compute_distance_matrix(corr)

    # Step 3 & 4: Clustering + quasi-diagonalization
    Z            = build_hierarchical_tree(dist_mat, active_tickers)
    sorted_order = get_quasi_diagonal_order(Z, n=len(active_tickers))

    # Step 5: Recursive bisection
    cov     = returns.cov()
    weights = hrp_recursive_bisection(cov, sorted_order, active_tickers)

    # Step 6: Apply minimum weight floor — no position smaller than MIN_WEIGHT_PCT
    min_w   = MIN_WEIGHT_PCT / 100.0   # e.g., 0.03 = 3%
    weights = {t: max(w, min_w) for t, w in weights.items()}

    # Step 7: Renormalize
    total   = sum(weights.values())
    weights = {t: round(w / total, 6) for t, w in weights.items()}

    # Step 8: Attach weights + rank by weight descending
    result = []
    for stock in qualified_stocks:
        w = weights.get(stock["ticker"], 0.0)
        result.append({
            **stock,
            "hrp_weight":   w,
            "weight_pct":   round(w * 100, 2),   # e.g., 14.23
        })

    result.sort(key=lambda x: x["hrp_weight"], reverse=True)
    for rank, stock in enumerate(result, start=1):
        stock["rank"] = rank

    # Log covariance matrix and cluster structure for audit
    _log_hrp_diagnostics(result, corr, Z, active_tickers)

    return result


def _log_hrp_diagnostics(
    portfolio: list[dict],
    corr:      pd.DataFrame,
    Z:         np.ndarray,
    tickers:   list[str],
) -> None:
    """Persists HRP diagnostics for UI display and audit trail."""
    trade_date = datetime.now(tz=IST).date().isoformat()
    atomic_write(f"data/learning/hrp_diagnostics_{trade_date}.json", {
        "trade_date":     trade_date,
        "portfolio":      [{
            "rank":        s["rank"],
            "ticker":      s["ticker"],
            "weight_pct":  s["weight_pct"],
            "hrp_weight":  s["hrp_weight"],
            "conviction_prob": s["conviction_prob"],
        } for s in portfolio],
        "correlation_matrix": {
            "tickers": tickers,
            "matrix":  corr.values.tolist(),
        },
    })
```

---

## 3. Output Schema

```json
{
  "engine_level": 9,
  "version": "2.0.0",
  "run_date": "2026-06-09",
  "run_ts": "2026-06-09T07:53:41+05:30",
  "method": "Hierarchical Risk Parity (HRP)",
  "candidates_in": 14,
  "final_portfolio_size": 14,
  "weight_vector": {
    "NESTLEIND":  0.1420,
    "POWERGRID":  0.1188,
    "BHARTIARTL": 0.1032,
    "TECHM":      0.0987,
    "SBIN":       0.0934,
    "SUNPHARMA":  0.0841,
    "GAIL":       0.0812,
    "NTPC":       0.0734,
    "INDIANB":    0.0698,
    "BHEL":       0.0512,
    "WIPRO":      0.0481,
    "HDFCBANK":   0.0412,
    "INFY":       0.0398,
    "TCS":        0.0321
  },
  "weight_sum_check": 1.0000,
  "final_portfolio": [
    {
      "rank":           1,
      "ticker":         "NESTLEIND",
      "sector":         "FMCG",
      "hrp_weight":     0.1420,
      "weight_pct":     14.20,
      "conviction_prob": 0.8812,
      "conviction_score": 88.12,
      "top_bullish_driver": "x7_institutional_flow_cr",
      "top_bearish_drag":   "x5_expectations_gap_pct"
    },
    {
      "rank":           2,
      "ticker":         "POWERGRID",
      "sector":         "Power & Utilities",
      "hrp_weight":     0.1188,
      "weight_pct":     11.88,
      "conviction_prob": 0.8541,
      "conviction_score": 85.41,
      "top_bullish_driver": "x3_roce_zscore",
      "top_bearish_drag":   "x1_macro_alignment"
    }
  ]
}
```

**Key property:** Σ wᵢ = 1.0 exactly (enforced by renormalization in Step 7).

---

## 4. Database Write

```sql
-- Daily_Projections now includes hrp_weight for UI pie chart rendering
ALTER TABLE Daily_Projections
    ADD COLUMN IF NOT EXISTS hrp_weight DECIMAL(8,6) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS weight_pct DECIMAL(6,2) DEFAULT NULL;

-- Write at 08:00 AM IST via orchestrator
INSERT INTO Daily_Projections
    (date, rank, ticker, sector, conviction_score, thematic_alpha, thesis_id, hrp_weight, weight_pct)
VALUES
    (CURRENT_DATE, 1, 'NESTLEIND', 'FMCG', 88.12, 'FMCG_Premiumisation', 'uuid-...', 0.1420, 14.20),
    (CURRENT_DATE, 2, 'POWERGRID', 'Power & Utilities', 85.41, 'Green_Energy_Infra', 'uuid-...', 0.1188, 11.88)
    -- ...
ON CONFLICT (date, rank) DO NOTHING;
```

---

## 5. Logic Modifiers & Thresholds

Stored in `Engine_Modifiers` table (`level = 'Level_9'`):

| Modifier Key | Default Value | Description | Bounds |
|---|---|---|---|
| `HRP_LOOKBACK_DAYS` | `120` | Trailing days of returns for correlation/covariance | [60, 252] |
| `MIN_WEIGHT_PCT` | `3.0` | Minimum HRP weight per stock (%) — prevents near-zero allocations | [1.0, 10.0] |
| `MAX_WEIGHT_PCT` | `25.0` | Maximum HRP weight per stock (%) — prevents concentration | [15.0, 40.0] |
| `MAX_RETURN_NULL_DAYS` | `10` | Max missing return observations before ticker rejected | [5, 20] |
| `MAX_SECTOR_CONCENTRATION` | `30` | Max % of portfolio weight from one sector | [20, 50] |
| `LINKAGE_METHOD` | `ward` | Scipy linkage method for clustering | [ward, single, complete] |
| `MIN_PORTFOLIO_SIZE` | `2` | Minimum qualifying stocks needed to run HRP | [2, 5] |

---

## 6. Cross-References

- **Upstream:** [model.md](./model.md) — provides filtered stocks with conviction_prob > 0.65 + SHAP values
- **Reads from:** `Market_Actuals` — trailing 120-day daily return history
- **Reads from:** `Engine_Modifiers` (Level_9 parameters)
- **Writes to:** `Daily_Projections` (with `hrp_weight` and `weight_pct` columns)
- **Writes to:** `data/learning/hrp_diagnostics_YYYY-MM-DD.json` (correlation matrix + weights)
- **Triggered by:** [orchestrator.md](./orchestrator.md) at 07:50 AM IST
- **UI Display:** [ui_dashboard.md](./ui_dashboard.md) § View 1 — HRP Pie Chart on Daily Projection Board
- **Learning:** [level10_learning.md](./level10_learning.md) adjusts `HRP_LOOKBACK_DAYS` and `MIN_WEIGHT_PCT` based on weekly retraining outcomes
