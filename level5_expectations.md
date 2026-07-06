# Expectations_Gap_Engine — Level 5

```yaml
name: "Expectations_Gap_Engine"
framework: "OACF"
version: "1.0.0"
type: "analytical_node"
level: 5
phase: "Forensic"
execution_time: "07:10 AM IST"
gate_type: "FATAL"
```

---

## 1. Context

The Expectations Gap Engine is the **valuation integrity filter**. It compares what the market currently **expects** of a company (encoded in its P/E multiple) against what the company has **actually delivered** in cash flow terms. A company priced for perfection — where implied growth exceeds real historical delivery — is flagged as a **Valuation Trap** and rejected.

This engine prevents the system from buying momentum and illusion. A stock can only enter the final pool if the market underestimates it.

**Data Sources:**
- NSE/BSE real-time market data (Closing P/E via price ÷ TTM EPS)
- 3-year Operating Cash Flow (OCF) from quarterly XBRL filings
- Revenue data from BSE Annual Reports (XBRL)
- Analyst consensus EPS (optional: from screener.in or Refinitiv)

---

## 2. Execution Logic

### 2.1 Implied Growth Extraction (Market's Expectation)

The **Implied Growth Rate** is what the current P/E multiple implies the market expects as the company's sustainable long-term EPS growth rate.

**Using the Gordon Growth / PEG framework:**

```
Implied_Growth = Current_PE / PEG_CONSTANT
```

Where `PEG_CONSTANT` represents the "fair" P/E-to-growth ratio baseline. A `PEG_CONSTANT` of 1.5 means the market is willing to pay 1.5× P/E for every 1% of growth (i.e., a company growing at 20% would be fairly valued at a P/E of 30).

```python
def calculate_implied_growth(current_pe: float, peg_constant: float) -> float:
    """
    Derives the growth rate embedded in the current market valuation.
    Returns: Implied growth rate in % per annum.

    Example:
        current_pe   = 45.0
        peg_constant = 1.5
        implied_growth = 45.0 / 1.5 = 30.0% per annum
    """
    if current_pe <= 0:
        return 0.0  # Negative/zero P/E → loss-making → skip implied growth test
    return current_pe / peg_constant
```

**Worked Example:**
```
Ticker: NESTLEIND
Current P/E:   72.0
PEG_CONSTANT:  1.5

Implied_Growth = 72.0 / 1.5 = 48.0% p.a. (Market expects 48% EPS growth!)
```

---

### 2.2 Intrinsic Growth Extraction (Actual Cash Flow Reality)

The **Intrinsic Growth Rate** is derived from the company's 3-year compound annual growth rate (CAGR) of **Operating Cash Flow (OCF)** — the most difficult metric to manipulate.

```
Intrinsic_Growth = 3-Year OCF CAGR (%)

OCF_CAGR = ((OCF_Year_0 / OCF_Year_minus_3)^(1/3) − 1) × 100
```

**In Python:**
```python
def calculate_intrinsic_growth(
    ocf_current_year: float,
    ocf_3_years_ago: float
) -> float:
    """
    Calculates the compound annual growth rate of Operating Cash Flow.
    OCF is preferred over Net Profit because:
      - It cannot be inflated via depreciation/amortization choices
      - It reflects actual cash generation capacity
      - It is comparable across capital structures

    Returns: OCF CAGR in % p.a.
    """
    if ocf_3_years_ago <= 0:
        return 0.0  # Avoid division by zero or negative base

    cagr = ((ocf_current_year / ocf_3_years_ago) ** (1/3) - 1) * 100
    return round(cagr, 4)
```

**Worked Example:**
```
Ticker: NESTLEIND
OCF FY21:     ₹2,180 Cr
OCF FY24:     ₹2,620 Cr

Intrinsic_Growth = ((2620 / 2180)^(1/3) − 1) × 100
                 = (1.2018^0.333 − 1) × 100
                 = (1.0633 − 1) × 100
                 = +6.33% p.a.
```

---

### 2.3 Expectations Gap

```
Expectations_Gap = Intrinsic_Growth − Implied_Growth
```

**Interpretation:**

| Expectations_Gap | Interpretation | Action |
|---|---|---|
| **> MIN_GAP_THRESHOLD (5.0)** | Market significantly underestimates the business. Strong BUY signal. | ✅ PASS |
| **0 < Gap ≤ 5.0** | Slight undervaluation. Acceptable but flag for lower conviction. | ✅ PASS (reduced score) |
| **Gap = 0** | Perfectly priced. Neither under nor overvalued. | ✅ PASS (neutral) |
| **Gap < 0** | Market OVERESTIMATES growth. Company priced for perfection. | ❌ FATAL FAIL (Valuation Trap) |

**In Python:**
```python
def calculate_expectations_gap(
    intrinsic_growth: float,
    implied_growth: float
) -> dict:
    gap = intrinsic_growth - implied_growth

    if gap < 0:
        return {
            "status":           "FATAL_FAIL",
            "failure_code":     "VALUATION_TRAP",
            "expectations_gap": round(gap, 4),
            "reason": (
                f"Gap={gap:.2f}%. Market prices in {implied_growth:.1f}% growth "
                f"but OCF only delivered {intrinsic_growth:.1f}% CAGR. "
                f"Priced for absolute perfection — reject."
            )
        }

    conviction_modifier = 1.0
    if 0 <= gap <= MIN_GAP_THRESHOLD:
        conviction_modifier = 0.85  # Apply 15% score reduction for marginal cases

    return {
        "status":               "PASS",
        "expectations_gap":     round(gap, 4),
        "intrinsic_growth_pct": round(intrinsic_growth, 4),
        "implied_growth_pct":   round(implied_growth, 4),
        "conviction_modifier":  conviction_modifier
    }
```

**Worked Example (FAIL):**
```
NESTLEIND:
  Implied_Growth    = 48.0% (P/E of 72 at PEG=1.5)
  Intrinsic_Growth  = 6.33% (OCF CAGR)
  Expectations_Gap  = 6.33 - 48.0 = -41.67%  ❌ FATAL FAIL: Valuation Trap
```

**Worked Example (PASS):**
```
DIXON:
  Current P/E:      30.0
  Implied_Growth    = 30.0 / 1.5 = 20.0%
  OCF FY21: ₹142Cr → OCF FY24: ₹310Cr
  Intrinsic_Growth  = ((310/142)^(1/3) - 1) × 100 = +29.7%
  Expectations_Gap  = 29.7 - 20.0 = +9.7%  ✅ PASS (> MIN_GAP_THRESHOLD of 5.0)
  Conviction_Modifier = 1.0 (full score, above threshold)
```

---

### 2.4 Conviction Score Contribution

The `conviction_modifier` from this level is passed forward to Level 9's portfolio construction as a multiplier on the base conviction score:

```python
def apply_expectations_modifier(
    base_conviction: float,
    gap_result: dict
) -> float:
    """
    Adjusts base conviction score based on valuation attractiveness.
    """
    modifier = gap_result.get('conviction_modifier', 1.0)

    # Bonus for strongly undervalued stocks (Gap > 15%)
    if gap_result.get('expectations_gap', 0) > 15.0:
        modifier = min(1.20, modifier * 1.15)  # Cap at 20% bonus

    return round(base_conviction * modifier, 4)
```

---

## 3. Output Schema

```json
{
  "engine_level": 5,
  "run_date": "2024-01-15",
  "run_ts": "2024-01-15T07:13:08+05:30",
  "equities_evaluated": 14,
  "valuation_traps_rejected": 3,
  "equities_passing": 11,
  "results": [
    {
      "ticker":               "DIXON",
      "status":               "PASS",
      "current_pe":           30.0,
      "implied_growth_pct":   20.0,
      "ocf_3yr_cagr_pct":    29.7,
      "expectations_gap":     9.7,
      "conviction_modifier":  1.10
    },
    {
      "ticker":               "HAL",
      "status":               "PASS",
      "current_pe":           28.5,
      "implied_growth_pct":   19.0,
      "ocf_3yr_cagr_pct":    34.2,
      "expectations_gap":     15.2,
      "conviction_modifier":  1.18
    },
    {
      "ticker":               "NESTLEIND",
      "status":               "FATAL_FAIL",
      "failure_code":         "VALUATION_TRAP",
      "current_pe":           72.0,
      "implied_growth_pct":   48.0,
      "ocf_3yr_cagr_pct":    6.33,
      "expectations_gap":     -41.67,
      "conviction_modifier":  null
    }
  ]
}
```

---

## 4. Approval Gate

| Condition | Outcome |
|---|---|
| `Expectations_Gap < 0` | **FATAL FAIL** — Valuation Trap. Immediately ejected. |
| `0 ≤ Expectations_Gap ≤ MIN_GAP_THRESHOLD` | **PASS** with 15% conviction score reduction |
| `Expectations_Gap > MIN_GAP_THRESHOLD` | **PASS** with full (or boosted) conviction score |
| `Expectations_Gap > 15.0` | **PASS** with up to +20% conviction bonus (strong undervaluation) |

---

## 5. Logic Modifiers & Thresholds

These values are stored in `Engine_Modifiers` table (`level = 'Level_5'`) and can be dynamically adjusted by `level10_learning.md`.

| Modifier Key | Default Value | Description | Adjustment Bounds |
|---|---|---|---|
| `PEG_CONSTANT` | `1.5` | PEG ratio used to derive Implied Growth from current P/E | [1.0, 2.5] |
| `MIN_GAP_THRESHOLD` | `5.0` | Minimum Expectations Gap (%) for full conviction score (no reduction) | [0.0, 15.0] |
| `OCF_LOOKBACK_YEARS` | `3` | Number of years for OCF CAGR calculation | [2, 5] |
| `MARGINAL_CONVICTION_PENALTY` | `0.15` | Conviction score reduction when Gap is between 0 and MIN_GAP_THRESHOLD | [0.05, 0.30] |
| `STRONG_UNDERVALUE_THRESHOLD` | `15.0` | Gap above which a conviction bonus is applied | [10.0, 25.0] |
| `STRONG_UNDERVALUE_BONUS` | `0.15` | Conviction bonus multiplier for strongly undervalued stocks | [0.05, 0.25] |
| `MAX_CONVICTION_BONUS_CAP` | `1.20` | Maximum conviction modifier (prevents runaway bonuses) | [1.10, 1.50] |

> **Tuning Note:** `PEG_CONSTANT` is the most sensitive parameter in this engine. Increasing it (e.g., to 2.0) makes the model more lenient on high-P/E growth stocks. Decreasing it (e.g., to 1.0) makes the standard harsher. Level 10 should raise this for growth regime periods (when the actual top performers are high-P/E growth stocks).

---

## 6. Cross-References

- **Upstream:** [level4_management.md](./level4_management.md) provides PASS equity list
- **Downstream:** [level6_earnings.md](./level6_earnings.md) receives passing equities with `conviction_modifier` scores
- **Fallback Source:** If Level 6 alt data fails, Level 5 `ocf_3yr_cagr_pct` is used as the intrinsic data fallback in Level 6's scoring
- **Learning:** [level10_learning.md](./level10_learning.md) adjusts `PEG_CONSTANT` if Valuation Trap misses are high-growth stocks that the market correctly priced
- **DB:** Reads `Engine_Modifiers` (Level_5); no direct writes
