# Earnings_Prediction_Engine — Level 6

```yaml
name: "Earnings_Prediction_Engine"
framework: "OACF"
version: "1.0.0"
type: "analytical_node"
level: 6
phase: "Forensic"
execution_time: "07:20 AM IST"
fallback: "Level 5 OCF intrinsic data with 15% confidence penalty"
```

---

## 1. Context

The Earnings Prediction Engine uses **alternative data vectors** — signals that appear in the real economy *before* they appear in financial statements — to estimate the probability of a near-term EPS beat. Companies with high surprise probability are given elevated conviction scores entering the execution phase.

This engine operates on the principle: **"Earnings beats are not random — they leave footprints in employment data, shipping volumes, and input cost deflation weeks before the results date."**

**Primary Alternative Data Sources:**

| Data Vector | Source | Refresh Rate |
|---|---|---|
| Employee headcount MoM | LinkedIn Talent Insights / Naukri.com scrape | Monthly |
| Export shipment volumes | DGFT (Directorate General of Foreign Trade) | Monthly |
| Raw material cost deflation | India Commodity Exchange + CMIE Price Index | Weekly |
| Freight rate index | Baltic Dry Index / Drewry Container Rate | Weekly |
| Power consumption (manufacturing proxy) | CEA (Central Electricity Authority) | Monthly |
| GST e-way bill generation | GST Council data release | Monthly |

**Fallback Data Source (if primary APIs fail):**
- Level 5 OCF intrinsic growth rate + historical EPS beat ratio (from BSE earnings calendar)

---

## 2. Execution Logic

### 2.1 Alternative Data Normalization

Each alternative data vector must be normalized to [0, 100] before being entered into the Surprise Score formula.

**Vector 1 — Employee Headcount MoM Growth**

```
Headcount_Raw = (Employees_Current_Month − Employees_Last_Month) / Employees_Last_Month × 100

Headcount_Signal = max(0, min(100, ((Headcount_Raw − MIN_HEADCOUNT_GROWTH) / 8.0) × 100))
```

Where `MIN_HEADCOUNT_GROWTH = 2.0` (base threshold; companies below this don't signal expansion):
- At +2.0% MoM growth → signal = 0 (baseline)
- At +10% MoM growth → signal = 100 (maximum expansion signal)

```python
def normalize_headcount_signal(headcount_mom_pct: float) -> float:
    """
    Normalizes headcount MoM growth to a [0, 100] signal.
    Companies below MIN_HEADCOUNT_GROWTH threshold score 0.
    """
    if headcount_mom_pct < MIN_HEADCOUNT_GROWTH:
        return 0.0
    return min(100.0, ((headcount_mom_pct - MIN_HEADCOUNT_GROWTH) / 8.0) * 100)
```

**Vector 2 — Export Volume YoY Growth**

```
Export_Raw = (Export_Volume_Current_Month − Export_Volume_Same_Month_Last_Year)
             / Export_Volume_Same_Month_Last_Year × 100

Export_Signal = max(0, min(100, (Export_Raw / 50.0) × 100))
```

- At 0% YoY → signal = 0
- At 50% YoY → signal = 100 (maximum export surge)

```python
def normalize_export_signal(export_yoy_pct: float) -> float:
    """
    Maps export YoY growth to [0, 100].
    50% YoY growth = maximum signal.
    Negative growth → negative signal clamped to 0.
    """
    return max(0.0, min(100.0, (export_yoy_pct / 50.0) * 100))
```

**Vector 3 — Raw Material Cost Deflation**

```
RM_Deflation_Raw = (RM_Price_3M_Ago − RM_Price_Current) / RM_Price_3M_Ago × 100
# Positive value = prices have fallen (favorable for margins)

RM_Deflation_Signal = max(0, min(100, (RM_Deflation_Raw / 20.0) × 100))
```

- At 0% deflation → signal = 0
- At 20% deflation over 3 months → signal = 100

```python
def normalize_rm_deflation_signal(rm_price_3m_ago: float, rm_price_current: float) -> float:
    """
    Measures 3-month raw material price deflation.
    Positive deflation = falling input costs = margin expansion.
    """
    deflation_pct = ((rm_price_3m_ago - rm_price_current) / rm_price_3m_ago) * 100
    return max(0.0, min(100.0, (deflation_pct / 20.0) * 100))
```

---

### 2.2 Surprise Score Composite Formula

```
Surprise_Score = (Headcount_Signal × 0.3)
               + (Export_Signal    × 0.4)
               + (RM_Deflation_Signal × MATERIAL_DEFLATION_WEIGHT)
```

Where `0.3 + 0.4 + MATERIAL_DEFLATION_WEIGHT = 1.0`, so `MATERIAL_DEFLATION_WEIGHT = 0.3`.

```python
def compute_surprise_score(
    headcount_signal: float,
    export_signal:    float,
    rm_signal:        float
) -> float:
    """
    Computes the EPS Surprise Score ∈ [0, 100].
    Higher scores → higher probability of positive EPS surprise next quarter.
    """
    score = (headcount_signal * 0.30) \
          + (export_signal    * 0.40) \
          + (rm_signal        * MATERIAL_DEFLATION_WEIGHT)
    return round(score, 4)
```

---

### 2.3 Expected EPS Beat Probability Conversion

Convert the `Surprise_Score` into a probability of EPS beat using a logistic transformation:

```
Expected_EPS_Beat_Pct = 1 / (1 + e^(−(Surprise_Score − 50) / 15)) × 100
```

This sigmoid function ensures:
- `Surprise_Score = 50` → 50% beat probability (neutral)
- `Surprise_Score = 80` → 87.5% beat probability
- `Surprise_Score = 20` → 12.5% beat probability

```python
import math

def surprise_to_beat_probability(surprise_score: float) -> float:
    """
    Converts Surprise_Score [0, 100] to EPS beat probability [0%, 100%]
    using a logistic sigmoid centered at 50.
    """
    exponent = -(surprise_score - 50) / 15
    probability = (1 / (1 + math.exp(exponent))) * 100
    return round(probability, 2)
```

---

### 2.4 Sector-Specific Data Vector Mapping

Not all three vectors apply equally to all sectors. The engine applies a sector-to-vector relevance matrix:

| Sector | Headcount Weight | Export Weight | RM_Deflation Weight |
|---|---|---|---|
| IT Services | 0.50 | 0.45 | 0.05 |
| Pharma (API) | 0.25 | 0.50 | 0.25 |
| Capital Goods | 0.30 | 0.10 | 0.60 |
| FMCG | 0.20 | 0.10 | 0.70 |
| Auto | 0.25 | 0.35 | 0.40 |
| Defence | 0.40 | 0.20 | 0.40 |
| Default | 0.30 | 0.40 | 0.30 |

```python
SECTOR_VECTOR_WEIGHTS = {
    "IT":           (0.50, 0.45, 0.05),
    "Pharma":       (0.25, 0.50, 0.25),
    "Capital Goods":(0.30, 0.10, 0.60),
    "FMCG":         (0.20, 0.10, 0.70),
    "Auto":         (0.25, 0.35, 0.40),
    "Defence":      (0.40, 0.20, 0.40),
    "DEFAULT":      (0.30, 0.40, 0.30),
}

def get_sector_weights(sector: str) -> tuple:
    return SECTOR_VECTOR_WEIGHTS.get(sector, SECTOR_VECTOR_WEIGHTS["DEFAULT"])
```

---

### 2.5 Fallback Logic (API Failure)

```python
def fallback_surprise_score(ticker: str, level5_result: dict) -> dict:
    """
    Called when alternative data APIs fail.
    Uses Level 5 OCF CAGR as a proxy for business momentum.
    Applies 15% confidence penalty to final conviction score.
    """
    ocf_cagr = level5_result.get("ocf_3yr_cagr_pct", 0)
    # Map OCF CAGR to [0, 100] surprise score proxy
    # 0% CAGR → 40 (slightly below neutral), 30%+ CAGR → 85 (strong)
    proxy_score = min(85, max(20, 40 + (ocf_cagr / 30) * 45))
    beat_prob   = surprise_to_beat_probability(proxy_score)

    return {
        "ticker":                    ticker,
        "data_source":               "FALLBACK_LEVEL5",
        "surprise_score":            round(proxy_score, 4),
        "expected_eps_beat_pct":     beat_prob,
        "confidence_penalty_applied": 0.15,
        "fallback_reason":           "Alternative data API timeout"
    }
```

---

## 3. Output Schema

```json
{
  "engine_level": 6,
  "run_date": "2024-01-15",
  "run_ts": "2024-01-15T07:23:44+05:30",
  "alt_data_status": "OK",
  "equities_evaluated": 11,
  "results": [
    {
      "ticker":                 "HAL",
      "data_source":            "PRIMARY",
      "sector":                 "Defence",
      "headcount_mom_pct":      4.8,
      "export_yoy_pct":         31.2,
      "rm_deflation_3m_pct":   8.5,
      "headcount_signal":       35.0,
      "export_signal":          62.4,
      "rm_signal":              42.5,
      "surprise_score":         48.91,
      "expected_eps_beat_pct":  48.69,
      "confidence_penalty_applied": 0.0
    },
    {
      "ticker":                 "DIXON",
      "data_source":            "PRIMARY",
      "sector":                 "Capital Goods",
      "headcount_mom_pct":      7.2,
      "export_yoy_pct":         44.5,
      "rm_deflation_3m_pct":   12.0,
      "headcount_signal":       65.0,
      "export_signal":          89.0,
      "rm_signal":              60.0,
      "surprise_score":         75.35,
      "expected_eps_beat_pct":  83.68,
      "confidence_penalty_applied": 0.0
    }
  ]
}
```

---

## 4. Logic Modifiers & Thresholds

These values are stored in `Engine_Modifiers` table (`level = 'Level_6'`) and can be dynamically adjusted by `level10_learning.md`.

| Modifier Key | Default Value | Description | Adjustment Bounds |
|---|---|---|---|
| `MIN_HEADCOUNT_GROWTH` | `2.0` | MoM headcount growth (%) below which signal = 0 | [0.5, 5.0] |
| `MATERIAL_DEFLATION_WEIGHT` | `0.30` | Weight of RM cost deflation vector in Surprise Score | [0.10, 0.50] |
| `EXPORT_WEIGHT` | `0.40` | Weight of export volume vector (default sector) | [0.20, 0.60] |
| `HEADCOUNT_WEIGHT` | `0.30` | Weight of headcount vector (default sector) | [0.10, 0.50] |
| `SIGMOID_CENTER` | `50.0` | Center point of the logistic EPS beat probability function | [40.0, 60.0] |
| `SIGMOID_SCALE` | `15.0` | Steepness of the sigmoid curve | [8.0, 25.0] |
| `MAX_HEADCOUNT_GROWTH_SCALE` | `8.0` | Headcount growth % that maps to signal = 100 | [5.0, 15.0] |
| `MAX_EXPORT_YOY_SCALE` | `50.0` | Export YoY % that maps to signal = 100 | [30.0, 80.0] |
| `MAX_RM_DEFLATION_SCALE` | `20.0` | RM 3M deflation % that maps to signal = 100 | [10.0, 35.0] |
| `ALT_DATA_FALLBACK_PENALTY` | `0.15` | Conviction score multiplier penalty on fallback | [0.05, 0.25] |

---

## 5. Cross-References

- **Upstream:** [level5_expectations.md](./level5_expectations.md) provides `conviction_modifier` and passing equities
- **Fallback Dependency:** Uses [level5_expectations.md](./level5_expectations.md) OCF CAGR data on API failure
- **Downstream:** [level7_market.md](./level7_market.md) receives `surprise_score` and `expected_eps_beat_pct`
- **Orchestrator Fallback:** [orchestrator.md](./orchestrator.md) handles API timeout and triggers fallback mode with confidence penalty
- **Learning:** [level10_learning.md](./level10_learning.md) adjusts `EXPORT_WEIGHT` or `HEADCOUNT_WEIGHT` if one signal consistently outperforms the others
