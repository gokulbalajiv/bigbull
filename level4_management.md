# Capital_Allocation_Engine — Level 4

```yaml
name: "Capital_Allocation_Engine"
framework: "OACF"
version: "1.0.0"
type: "analytical_node"
level: 4
phase: "Forensic"
execution_time: "07:00 AM IST"
gate_type: "FATAL"
```

---

## 1. Context

The Capital Allocation Engine is the **first fatal gate** in the pipeline and acts as the system's **integrity filter**. It performs a rigorous 10-year retrospective audit on how management has deployed retained earnings. Companies where management has destroyed shareholder value or pledged excessive shares are **permanently ejected** from the daily queue — there are no partial scores or confidence penalties here.

This engine operationalizes the principle: **"A great business run by bad capital allocators is a wealth trap."**

**Data Sources:**
- 10-year annual financial statements (Screener.in bulk XML / BSE XBRL archive)
- Historical market cap data (NSE historical EOD prices × shares outstanding)
- SEBI shareholding pattern (promoter pledge percentage, updated quarterly)

---

## 2. Execution Logic — Retained Earnings Test

### 2.1 Data Collection Window

For each ticker passing Level 3, collect:

```python
def collect_10yr_financial_data(ticker: str) -> dict:
    """
    Collects rolling 10-year annual data.
    Financial year used: April–March (Indian standard)
    Current FY = FY ending March of the most recent completed fiscal year
    """
    fiscal_years = [f"FY{year}" for year in range(CURRENT_FY - 10, CURRENT_FY)]

    data = {
        "net_profit_annual":    [fetch_net_profit(ticker, fy) for fy in fiscal_years],
        "dividends_paid":       [fetch_dividends(ticker, fy) for fy in fiscal_years],
        "market_cap_start":     fetch_market_cap(ticker, fiscal_years[0] + "_START"),
        "market_cap_current":   fetch_market_cap(ticker, "CURRENT"),
        "promoter_pledge_pct":  fetch_pledge_pct(ticker),  # Latest available
    }
    return data
```

---

### 2.2 Retained Earnings Calculation

```
Total_Retained_Earnings = Σ Net_Profit[y] − Σ Dividends_Paid[y]    for y ∈ [FY-10, FY-1]
```

**In Python:**
```python
def calculate_retained_earnings(net_profits: list[float], dividends: list[float]) -> float:
    """
    Returns total capital retained by the company over 10 fiscal years, in ₹Cr.
    A negative value means the company paid out MORE than it earned (draw-down on reserves).
    """
    total_retained = sum(net_profits) - sum(dividends)
    return total_retained
```

**Edge Cases:**
- If any year has a net loss, the loss is counted as negative retained earnings
- Special dividends and buybacks are both counted as capital returned (subtracted from retained pool)
- Bonus share issuances are NOT counted as capital allocation events

---

### 2.3 Value Created Calculation

```
Value_Created = Market_Cap_Current − Market_Cap_10_Years_Ago
```

**In Python:**
```python
def calculate_value_created(
    market_cap_current_cr: float,
    market_cap_10yr_ago_cr: float
) -> float:
    """
    Returns wealth created (or destroyed) in ₹Cr over the 10-year window.
    A negative value = management has presided over market cap destruction.
    """
    return market_cap_current_cr - market_cap_10yr_ago_cr
```

---

### 2.4 Retained Value Ratio (RVR)

```
Retained_Value_Ratio = Value_Created / Total_Retained_Earnings
```

**In Python:**
```python
def calculate_rvr(value_created: float, total_retained: float) -> float:
    """
    RVR > 1.0: Every ₹1 retained by management created > ₹1 of market value.
    RVR = 1.0: Management broke even — capital allocation was neutral.
    RVR < 1.0: Management destroyed value — capital was misallocated.
    """
    if total_retained <= 0:
        # Company retained nothing or was loss-making for 10 years
        return 0.0  # Automatic fail
    return value_created / total_retained
```

**Worked Example:**
```
Ticker: BAJFINANCE

Net Profits (FY14–FY23, ₹Cr): [584, 921, 1279, 1836, 2496, 3890, 5264, 4420, 8905, 11508]
Dividends (₹Cr):               [30,  50,  80,  130,  160,  200,  250,  200,  450,  600]

Total_Net_Profit   = 42,103 Cr
Total_Dividends    = 2,150  Cr
Total_Retained     = 39,953 Cr

Market_Cap_FY14    = ₹12,800 Cr
Market_Cap_Current = ₹445,000 Cr

Value_Created      = 445,000 − 12,800 = ₹432,200 Cr
RVR                = 432,200 / 39,953 = 10.82  ✅ (>> MIN_RETAINED_VALUE_RATIO of 1.25)
```

**Counter-Example (FATAL FAIL):**
```
Ticker: XYZ_INFRA

Total_Retained     = ₹8,200 Cr (10 years of retained earnings)
Value_Created      = ₹6,500 Cr (market cap grew but less than retained capital)

RVR = 6,500 / 8,200 = 0.79  ❌ (< 1.00 → FATAL: Management destroys wealth)
```

---

### 2.5 Pledged Shares Check

```python
def check_pledge(ticker: str, pledge_pct: float) -> dict:
    """
    Checks promoter pledge percentage.
    Source: SEBI shareholding pattern (latest quarterly filing)
    """
    if pledge_pct > MAX_PLEDGE_PCT:
        return {
            "status": "FATAL_FAIL",
            "reason": f"Promoter pledge {pledge_pct:.1f}% exceeds MAX_PLEDGE_PCT={MAX_PLEDGE_PCT}%",
            "risk": "Forced selling risk during margin calls"
        }
    return {"status": "PASS", "pledge_pct": pledge_pct}
```

---

## 3. Approval Gate — The Chor Check

The engine applies **two independent FATAL FAIL conditions**. Either one alone causes ejection:

```python
def run_chor_check(ticker: str, data: dict) -> dict:
    retained  = calculate_retained_earnings(data['net_profit_annual'], data['dividends_paid'])
    value_cr  = calculate_value_created(data['market_cap_current'], data['market_cap_start'])
    rvr       = calculate_rvr(value_cr, retained)
    pledge    = check_pledge(ticker, data['promoter_pledge_pct'])

    result = {"ticker": ticker, "rvr": rvr, "pledge_pct": data['promoter_pledge_pct']}

    # Gate 1: Value destruction check
    if rvr < MIN_RETAINED_VALUE_RATIO:
        result["outcome"]      = "FATAL_FAIL"
        result["failure_code"] = "VALUE_DESTRUCTION"
        result["reason"]       = (
            f"RVR={rvr:.3f} below MIN={MIN_RETAINED_VALUE_RATIO}. "
            f"Retained ₹{retained:.0f}Cr but only created ₹{value_cr:.0f}Cr of market value."
        )
        return result

    # Gate 2: Pledge check
    if pledge["status"] == "FATAL_FAIL":
        result["outcome"]      = "FATAL_FAIL"
        result["failure_code"] = "PROMOTER_PLEDGE_EXCESS"
        result["reason"]       = pledge["reason"]
        return result

    # Both gates cleared
    result["outcome"]              = "PASS"
    result["total_retained_cr"]    = retained
    result["value_created_cr"]     = value_cr
    return result
```

---

## 4. Output Schema

```json
{
  "engine_level": 4,
  "run_date": "2024-01-15",
  "run_ts": "2024-01-15T07:03:55+05:30",
  "equities_evaluated": 18,
  "fatal_fails": 4,
  "equities_passing": 14,
  "results": [
    {
      "ticker":              "BAJFINANCE",
      "outcome":             "PASS",
      "rvr":                 10.82,
      "total_retained_cr":   39953,
      "value_created_cr":    432200,
      "pledge_pct":          0.00
    },
    {
      "ticker":              "HAL",
      "outcome":             "PASS",
      "rvr":                 3.41,
      "total_retained_cr":   12400,
      "value_created_cr":    42300,
      "pledge_pct":          0.00
    },
    {
      "ticker":              "XYZ_INFRA",
      "outcome":             "FATAL_FAIL",
      "failure_code":        "VALUE_DESTRUCTION",
      "rvr":                 0.79,
      "reason":              "RVR=0.790 below MIN=1.25. Retained ₹8200Cr but created ₹6500Cr."
    }
  ]
}
```

---

## 5. Logic Modifiers & Thresholds

These values are stored in `Engine_Modifiers` table (`level = 'Level_4'`) and can be dynamically adjusted by `level10_learning.md`.

| Modifier Key | Default Value | Description | Adjustment Bounds |
|---|---|---|---|
| `MAX_PLEDGE_PCT` | `15.0` | Max promoter pledge % allowed before FATAL FAIL | [5.0, 25.0] |
| `MIN_RETAINED_VALUE_RATIO` | `1.25` | Minimum RVR for management to be considered value-creating | [1.00, 2.00] |
| `LOOKBACK_YEARS` | `10` | Number of fiscal years in the retained earnings window | [7, 15] |
| `BUYBACK_AS_DIVIDEND` | `TRUE` | If true, share buybacks are counted as capital returned (reduce retained pool) | Boolean |
| `MIN_RETAINED_FOR_TEST` | `500` | Minimum ₹Cr of retained earnings to run the test (exclude loss-making startups) | [100, 2000] |

> **Tuning Note:** `MIN_RETAINED_VALUE_RATIO` should **never** be set below 1.00 — that would allow management that destroys value to pass the gate. Level 10 may lower it toward 1.00 if too many otherwise-valid stocks are being blocked, but 1.00 is a hard floor.

---

## 6. Cross-References

- **Upstream:** [level3_industry.md](./level3_industry.md) provides `shortlisted_equities[]`
- **Downstream:** [level5_expectations.md](./level5_expectations.md) receives only `PASS` equities
- **Learning:** [level10_learning.md](./level10_learning.md) may relax `MIN_RETAINED_VALUE_RATIO` if false negatives are clustered around high-growth startups (RVR between 1.00 and 1.25)
- **DB:** Fatal fails are logged to `Retro_Variance_Log` at end of day when cross-referenced with actuals; reads `Engine_Modifiers`
