# Macro_Regime_Engine — Level 1

```yaml
name: "Macro_Regime_Engine"
framework: "OACF"
version: "1.0.0"
type: "analytical_node"
level: 1
phase: "Funnel"
execution_time: "06:30 AM IST"
```

---

## 1. Context

The Macro Regime Engine is the **first gate** in the BigBull pipeline. Its sole purpose is to classify the current macroeconomic cycle and apply sector-level **tailwinds** (weight bonuses) or **headwinds** (penalties) to all candidate equities before thematic scoring begins.

The engine outputs a `Regime_Score` in the range **[−100, +100]** and generates a structured `regime_output.json` that dictates which sectors are favored or penalized for the current day's run.

**Data Sources:**
- RBI Data Warehouse (G-Sec yields, MIBOR, CPI)
- NSE Market Data API (Nifty50 Price)
- Bloomberg/FRED equivalent (Brent Crude, USD/INR spot)
- GoI MOSPI (Monthly CPI releases)
- **`pestel_output.json`** — output of `PestelIntelligenceEngine` (06:00 AM run, pre-Level 1)

---

## 2. Execution Logic — Regime Matrix

### 2.1 Regime Score Formula

The `Regime_Score` is a weighted sum of **five** components — four macro indicators plus the new PESTEL composite signal:

```
Regime_Score = (Yield_Score   × YIELD_CURVE_WEIGHT)
             + (Inflation_Score × INFLATION_WEIGHT)
             + (Currency_Score  × CURRENCY_WEIGHT)
             + (Commodity_Score × COMMODITY_WEIGHT)
             + (PESTEL_Score    × PESTEL_WEIGHT)
```

Where all five weights must sum to 1.0:
> `YIELD_CURVE_WEIGHT + INFLATION_WEIGHT + CURRENCY_WEIGHT + COMMODITY_WEIGHT + PESTEL_WEIGHT = 1.0`

**Default weight allocation:**
```
YIELD_CURVE_WEIGHT = 0.315   # Re-normalized from 0.35 (×0.90)
INFLATION_WEIGHT   = 0.225   # Re-normalized from 0.25 (×0.90)
CURRENCY_WEIGHT    = 0.180   # Re-normalized from 0.20 (×0.90)
COMMODITY_WEIGHT   = 0.180   # Re-normalized from 0.20 (×0.90)
PESTEL_WEIGHT      = 0.100   # New 5th component
```

The raw scores from each indicator are scaled to contribute a maximum of ±100 points before weighting:

```
Regime_Score ∈ [−100, +100]
```

---

### 2.2 Indicator 1 — Yield Curve (G-Sec 10yr vs MIBOR 3M)

**Spread Calculation:**
```
Yield_Spread = G_Sec_10Yr_Yield − MIBOR_3M_Rate
```

**Score Mapping:**
```
IF Yield_Spread < 0:          Yield_Raw_Score = −57.14   # Inverted: credit crunch risk
IF 0 ≤ Yield_Spread < 0.25:  Yield_Raw_Score = +14.29   # Flat: cautious
IF 0.25 ≤ Yield_Spread < 0.75: Yield_Raw_Score = +42.86 # Normal: neutral
IF Yield_Spread ≥ 0.75:      Yield_Raw_Score = +57.14   # Steep: expansionary
```

**Sector Implications:**
```
Inverted Yield Curve:
  Penalize: Banking sector (−20 pts applied at Level 3 EBITDA scoring)
  Penalize: NBFCs (−15 pts)

Steep Yield Curve:
  Favor: Capital Goods (infrastructure capex)
  Favor: Real Estate
```

---

### 2.3 Indicator 2 — Inflation (CPI Momentum — 3-Month Rolling)

**Momentum Calculation:**
```
CPI_Momentum = CPI_Current_Month − CPI_3_Months_Ago

IF CPI_Momentum > +0.5:  Inflation_Raw_Score = −42.86  # Rising sharply
IF CPI_Momentum > 0:     Inflation_Raw_Score = −21.43  # Rising mildly
IF CPI_Momentum = 0:     Inflation_Raw_Score = 0        # Stable
IF CPI_Momentum < 0:     Inflation_Raw_Score = +42.86  # Falling (favorable)
```

**Sector Implications:**
```
Rising CPI:
  Penalize: Auto (margin squeeze on input costs)
  Penalize: FMCG (rural demand compression)

Falling CPI:
  Favor: Consumer Discretionary
  Favor: Banks (RBI rate cut probability increases)
```

---

### 2.4 Indicator 3 — Currency (USD/INR vs 50-Day EMA)

**Trend Calculation:**
```
INR_50D_EMA = EMA(USD_INR_Daily_Close, period=50)
Currency_Deviation_Pct = ((USD_INR_Spot − INR_50D_EMA) / INR_50D_EMA) × 100

IF Currency_Deviation_Pct > +1.0:   # INR Depreciating (more USD per INR = weaker INR)
    Currency_Raw_Score = +28.57
    SECTOR_MODIFIER["IT"]     += CURRENCY_IMPACT_MULTIPLIER × 10   # IT earns in USD
    SECTOR_MODIFIER["Pharma"] += CURRENCY_IMPACT_MULTIPLIER × 8
    SECTOR_MODIFIER["Auto"]   -= CURRENCY_IMPACT_MULTIPLIER × 10   # Import content
    SECTOR_MODIFIER["FMCG"]   -= CURRENCY_IMPACT_MULTIPLIER × 8

IF Currency_Deviation_Pct < −1.0:   # INR Appreciating
    Currency_Raw_Score = −28.57
    SECTOR_MODIFIER["IT"]     -= CURRENCY_IMPACT_MULTIPLIER × 10
    SECTOR_MODIFIER["Pharma"] -= CURRENCY_IMPACT_MULTIPLIER × 8
```

---

### 2.5 Indicator 4 — Commodities (Brent Crude $/bbl)

**Threshold Logic:**
```
IF Brent_Crude_USD > CRUDE_DANGER_THRESHOLD:
    Commodity_Raw_Score = −57.14
    SECTOR_MODIFIER["Aviation"] -= 25
    SECTOR_MODIFIER["Paints"]   -= 20
    SECTOR_MODIFIER["Tyre"]     -= 15
    SECTOR_MODIFIER["OMCs"]     -= 20  # Oil Marketing Companies

IF Brent_Crude_USD ∈ [70, CRUDE_DANGER_THRESHOLD]:
    Commodity_Raw_Score = +14.29       # Neutral to mildly positive
    SECTOR_MODIFIER["OMCs"] += 10     # Inventory gains

IF Brent_Crude_USD < 70:
    Commodity_Raw_Score = +57.14       # Strongly bullish for input-cost sensitive sectors
    SECTOR_MODIFIER["Aviation"] += 20
    SECTOR_MODIFIER["Paints"]   += 15
```

---

### 2.6 Composite Score Calculation (Step-by-Step)

```python
# Step 1: Fetch raw data
G_Sec_10Yr  = fetch_rbi("G_SEC_10YR")      # e.g., 7.18
MIBOR_3M    = fetch_rbi("MIBOR_3M")         # e.g., 6.85
CPI_Current = fetch_mospi("CPI_CURRENT")    # e.g., 5.1
CPI_3M_Ago  = fetch_mospi("CPI_3M_AGO")    # e.g., 5.5
USD_INR     = fetch_fx("USD_INR_SPOT")      # e.g., 83.12
INR_50D_EMA = fetch_fx("USD_INR_50D_EMA")  # e.g., 82.80
Brent       = fetch_commodity("BRENT_USD") # e.g., 78.50

# PESTEL score is pre-computed by PestelIntelligenceEngine and already
# available in the ingestion_payload.json at this point.
PESTEL_Score = ingestion_payload["pestel_output"]["overall_pestel_score"]  # e.g., +22.40

# Step 2: Calculate component raw scores
Yield_Spread     = G_Sec_10Yr - MIBOR_3M          # 7.18 - 6.85 = 0.33
Yield_Raw_Score  = +42.86                           # Spread in [0.25, 0.75)

CPI_Momentum        = CPI_Current - CPI_3M_Ago     # 5.1 - 5.5 = -0.4
Inflation_Raw_Score = +42.86                        # Falling CPI → favorable

Currency_Deviation = ((83.12 - 82.80) / 82.80) × 100  # +0.39% < 1% → Neutral
Currency_Raw_Score = 0

Commodity_Raw_Score = +14.29                        # Brent 78.50 in [70, 85)

# Step 3: Apply weights (base config with PESTEL as 5th component)
Regime_Score = (42.86 × 0.315) + (42.86 × 0.225) + (0 × 0.180) + (14.29 × 0.180) + (22.40 × 0.100)
             = 13.50 + 9.64 + 0 + 2.57 + 2.24
             = 27.95

# Step 4: Classify regime
IF Regime_Score > 40:   "Risk-On / Liquidity Expansion"
IF 10 < Regime_Score ≤ 40:  "Cautious Growth"
IF -10 ≤ Regime_Score ≤ 10: "Neutral / Sideways"
IF -40 < Regime_Score < -10: "Risk-Off / Tightening"
IF Regime_Score ≤ -40:  "Crisis / Recession Warning"
```

---

### 2.7 Sector Weight Generation

After regime classification, merge **PESTEL sector modifiers** from `pestel_output.json` into the `SECTOR_MODIFIER` dict, then generate `sector_weights{}`:

```python
# Step 4.5: Merge PESTEL sector-level modifiers (from PestelIntelligenceEngine output)
pestel_sector_modifiers = ingestion_payload["pestel_output"]["sector_pestel_modifiers"]
for sector, delta in pestel_sector_modifiers.items():
    SECTOR_MODIFIER[sector] = SECTOR_MODIFIER.get(sector, 0) + delta

# Step 5: Generate sector weights
BASE_SECTOR_WEIGHT = 1.0  # Neutral multiplier

sector_weights = {
    sector: BASE_SECTOR_WEIGHT + (SECTOR_MODIFIER.get(sector, 0) / 100)
    for sector in ALL_SECTORS
}
# Clamp sector weights to [0.5, 1.5] to prevent extreme distortions
sector_weights = {k: max(0.5, min(1.5, v)) for k, v in sector_weights.items()}
```

---

## 3. Output Schema

```json
{
  "engine_level": 1,
  "run_date": "2024-01-15",
  "run_ts": "2024-01-15T06:32:14+05:30",
  "regime_score": 27.95,
  "current_regime": "Cautious Growth",
  "component_scores": {
    "yield_curve": 42.86,
    "inflation":   42.86,
    "currency":    0.00,
    "commodity":   14.29,
    "pestel":      22.40
  },
  "pestel_pillar_scores": {
    "Political":     +18.50,
    "Economic":      +30.00,
    "Social":        +15.00,
    "Technological": +25.00,
    "Environmental": +20.00,
    "Legal":         -10.00
  },
  "favored_sectors":   ["Banks", "Infrastructure", "Capital Goods", "Consumer Discretionary"],
  "penalized_sectors": ["FMCG", "Auto"],
  "sector_weights": {
    "IT":                 1.12,
    "Banking":            1.10,
    "Infrastructure":     1.15,
    "FMCG":              0.82,
    "Auto":              0.80,
    "Aviation":           1.04,
    "Pharma":             1.08
  },
  "data_freshness_mins": 12,
  "pestel_stale_penalty": false
}
```

---

## 4. Approval Gate

Level 1 does **not** apply an individual stock-level gate. Its output is a set of **sector weights** applied to all downstream levels. However:

> If `Regime_Score ≤ −70` (severe crisis condition), the orchestrator will **flag ALL equities** with a 25% global conviction score penalty regardless of fundamentals.

---

## 5. Logic Modifiers & Thresholds

These values are stored in `Engine_Modifiers` table (`level = 'Level_1'`) and can be dynamically adjusted by `level10_learning.md`.

| Modifier Key | Default Value | Description | Adjustment Bounds |
|---|---|---|---|
| `CRUDE_DANGER_THRESHOLD` | `85.00` | Brent crude $/bbl above which Aviation/Paints are penalized | [75.00, 110.00] |
| `YIELD_CURVE_WEIGHT` | `0.315` | Weight of yield curve component in Regime_Score (re-normalized) | [0.09, 0.54] |
| `INFLATION_WEIGHT` | `0.225` | Weight of CPI momentum component (re-normalized) | [0.09, 0.45] |
| `CURRENCY_WEIGHT` | `0.180` | Weight of USD/INR component (re-normalized) | [0.045, 0.36] |
| `COMMODITY_WEIGHT` | `0.180` | Weight of Brent crude component (re-normalized) | [0.045, 0.36] |
| `PESTEL_WEIGHT` | `0.100` | Weight of PESTEL composite score in Regime_Score | [0.05, 0.20] |
| `CURRENCY_IMPACT_MULTIPLIER` | `1.20` | Amplifier on sector modifiers from currency moves | [0.80, 2.00] |
| `INVERTED_CURVE_THRESHOLD` | `0.00` | Spread below which curve is deemed inverted | [−0.25, 0.25] |
| `STEEP_CURVE_THRESHOLD` | `0.75` | Spread above which curve is deemed steep | [0.50, 1.50] |
| `CPI_RISING_THRESHOLD` | `0.50` | CPI momentum above which inflation is flagged as rising | [0.20, 1.00] |
| `CRISIS_REGIME_FLOOR` | `−70.0` | Regime_Score below which global 25% penalty is applied | [−90, −50] |

> **Tuning Note:** The five `_WEIGHT` modifiers must always be re-normalized to sum to 1.0 after any Level 10 adjustment. Level 10 should apply the softmax normalization after updating individual weights.

---

## 6. Cross-References

- **Downstream:** [level2_theme.md](./level2_theme.md) reads `sector_weights` output
- **Upstream:** [orchestrator.md](./orchestrator.md) triggers this engine at 06:30 AM
- **Learning:** [level10_learning.md](./level10_learning.md) adjusts `CRUDE_DANGER_THRESHOLD` and `YIELD_CURVE_WEIGHT` based on false negatives
- **DB:** Reads modifiers from `Engine_Modifiers` table on every run
