# Market_Structure_Engine — Level 7

```yaml
name: "Market_Structure_Engine"
framework: "OACF"
version: "1.0.0"
type: "analytical_node"
level: 7
phase: "Execution"
execution_time: "07:30 AM IST"
gate_type: "FATAL"
```

---

## 1. Context

The Market Structure Engine is the **final fatal gate** before thesis generation. It ignores retail noise and focuses exclusively on **institutional footprints** — the smart money that moves markets over days and weeks, not hours.

The core premise: **"Stocks that move sustainably are accumulated by institutions before the move begins, not chased after it starts."** This engine identifies accumulation phases and rejects distribution phases disguised as breakouts.

**Data Sources:**
- SEBI FII/DII daily data (published by NSE at end of day)
- NSE Bulk/Block Deal reports
- SEBI Shareholding Pattern Database (quarterly, % holdings FII/DII/Promoter)
- NSE Delivery percentage data (proxy for conviction-based buying vs. intraday churn)
- BSE bulk deal database (promoter open-market purchase records)

---

## 2. Execution Logic — Institutional Tracking Matrix

### 2.1 Metric 1 — Net FII/DII Flow (Rolling 5-Day)

**Captures recent institutional directional conviction in a specific stock.**

```
Net_Institutional_Flow_5D = Σ (FII_Net_Buy_Cr[d] + DII_Net_Buy_Cr[d])
                              for d in [T-5, T-4, T-3, T-2, T-1]
```

Where:
- `FII_Net_Buy_Cr[d]` = FII buys minus FII sells in ₹Crores for stock on day `d`
- `DII_Net_Buy_Cr[d]` = DII buys minus DII sells in ₹Crores for stock on day `d`
- Positive = net accumulation; Negative = net selling

```python
def calculate_net_institutional_flow(ticker: str, lookback_days: int = 5) -> dict:
    """
    Aggregates FII + DII net buy/sell data over the last N trading days.
    Source: NSE FII/DII daily data per scrip (from bhav copy extensions)
    """
    flow_data = fetch_fii_dii_flows(ticker, lookback_days)
    total_fii = sum(d['fii_net_cr'] for d in flow_data)
    total_dii = sum(d['dii_net_cr'] for d in flow_data)
    total_net  = total_fii + total_dii

    return {
        "net_fii_5d_cr":  round(total_fii, 2),
        "net_dii_5d_cr":  round(total_dii, 2),
        "net_combined_cr": round(total_net, 2),
        "accumulation_flag": total_net >= INSTITUTIONAL_ACCUMULATION_MIN_CR
    }
```

**Gate:** If `net_combined_cr < INSTITUTIONAL_ACCUMULATION_MIN_CR` (₹50 Cr), the stock is flagged as lacking institutional conviction but is NOT auto-rejected (soft gate — reduces conviction score by 20%).

---

### 2.2 Metric 2 — Promoter Open Market Action (Rolling 30-Day)

**Insider buying is the clearest signal of undervaluation confidence.**

```python
def calculate_promoter_action(ticker: str, lookback_days: int = 30) -> dict:
    """
    Fetches promoter open market purchase/sale transactions from BSE bulk deal data.
    Filters for 'Promoter' or 'Promoter Group' entity category.

    Interprets:
      Net_Promoter_Buy_Cr > 0   → Insider accumulation (positive signal)
      Net_Promoter_Buy_Cr < 0   → Insider selling (negative signal)
      Pledge_Change > 0         → Additional pledge (negative signal, already checked in Level 4)
    """
    transactions = fetch_bulk_deals(ticker, lookback_days, entity_type="PROMOTER")
    net_buy_cr = sum(t['value_cr'] * (1 if t['action'] == 'BUY' else -1) for t in transactions)

    promoter_signal = "ACCUMULATING" if net_buy_cr > 0 else ("SELLING" if net_buy_cr < 0 else "NEUTRAL")

    return {
        "net_promoter_buy_30d_cr": round(net_buy_cr, 2),
        "promoter_action":         promoter_signal,
        "transaction_count":       len(transactions)
    }
```

**Score Contribution:**
```
Promoter_Score = 0 (Selling) | 50 (Neutral) | 100 (Accumulating)
```

---

### 2.3 Metric 3 — Delivery Volume Analysis (Distribution Phase Detection)

This is the **primary FATAL FAIL trigger** in this engine.

**Distribution Phase Pattern:**
> "Smart money exits while retail comes in — delivery percentage explodes as institutions off-load to retail buyers."

```
Retail_Delivery_Volume_20D_Avg = Mean(Delivery_Volume[d] for d in [T-20, ..., T-1])
Retail_Delivery_Volume_Today   = Delivery_Volume[T]

Delivery_Spike_Ratio = Retail_Delivery_Volume_Today / Retail_Delivery_Volume_20D_Avg
```

**FATAL FAIL Condition (Distribution Phase):**
```python
def detect_distribution_phase(ticker: str) -> dict:
    """
    Detects classic distribution (institutional exit disguised as retail FOMO).

    FATAL FAIL if BOTH conditions are true simultaneously:
      Condition 1: Delivery_Spike_Ratio > 3.0 (retail flooding in)
      Condition 2: FII_Holdings_Change < 0   (institutions reducing stake)

    Both conditions must be true — one alone is insufficient for FATAL FAIL.
    """
    delivery_data  = fetch_delivery_data(ticker, lookback_days=20)
    fii_holding    = fetch_fii_holding_change(ticker, quarters=1)

    avg_20d_delivery = sum(delivery_data[:-1]) / len(delivery_data[:-1])
    today_delivery   = delivery_data[-1]
    spike_ratio      = today_delivery / avg_20d_delivery if avg_20d_delivery > 0 else 0

    fii_decreasing = fii_holding['qoq_change_pct'] < 0  # FII holdings fell QoQ

    if spike_ratio > 3.0 and fii_decreasing:
        return {
            "status":         "FATAL_FAIL",
            "failure_code":   "DISTRIBUTION_PHASE",
            "spike_ratio":    round(spike_ratio, 3),
            "fii_qoq_change": round(fii_holding['qoq_change_pct'], 3),
            "reason": (
                f"Distribution Phase detected: Delivery spike {spike_ratio:.1f}× above 20D avg "
                f"while FII holdings fell {abs(fii_holding['qoq_change_pct']):.2f}% QoQ. "
                f"Retail FOMO + institutional exit = structural distribution."
            )
        }

    return {
        "status":         "PASS",
        "spike_ratio":    round(spike_ratio, 3),
        "fii_qoq_change": round(fii_holding['qoq_change_pct'], 3)
    }
```

---

### 2.4 Composite Institutional Score

```
Institutional_Score = (Flow_Score      × 0.50)
                    + (Promoter_Score  × 0.25)
                    + (Delivery_Score  × 0.25)
```

Where:
- `Flow_Score` = normalized net institutional flow `[0, 100]`:
  ```
  Flow_Score = min(100, max(0, (net_combined_cr / 500) × 100))
  # ₹500Cr+ net institutional buy over 5 days = maximum score
  ```
- `Promoter_Score` = 0 / 50 / 100 as defined above
- `Delivery_Score` = `100 − min(100, (spike_ratio − 1) × 25)` (lower spike = higher score)

```python
def compute_institutional_score(
    net_flow_cr:     float,
    promoter_signal: str,
    spike_ratio:     float
) -> float:
    flow_score     = min(100.0, max(0.0, (net_flow_cr / 500) * 100))
    promoter_score = {"ACCUMULATING": 100, "NEUTRAL": 50, "SELLING": 0}.get(promoter_signal, 50)
    delivery_score = max(0.0, 100.0 - min(100.0, (spike_ratio - 1) * 25))

    return round(flow_score * 0.50 + promoter_score * 0.25 + delivery_score * 0.25, 4)
```

---

## 3. Soft Accumulation Flag

If `net_combined_cr ≥ INSTITUTIONAL_ACCUMULATION_MIN_CR`, the stock is marked with `institutional_accumulation: true` — used in the thesis engine (Level 8) as a positive narrative signal.

```python
def compute_level7_output(ticker: str) -> dict:
    flow          = calculate_net_institutional_flow(ticker)
    promoter      = calculate_promoter_action(ticker)
    distribution  = detect_distribution_phase(ticker)

    if distribution["status"] == "FATAL_FAIL":
        return {"ticker": ticker, "outcome": "FATAL_FAIL", **distribution}

    inst_score = compute_institutional_score(
        flow["net_combined_cr"],
        promoter["promoter_action"],
        distribution["spike_ratio"]
    )

    # Soft accumulation check (non-fatal)
    conviction_multiplier = 1.0
    if not flow["accumulation_flag"]:
        conviction_multiplier = 0.80  # 20% penalty for below-minimum institutional flow

    return {
        "ticker":                  ticker,
        "outcome":                 "PASS",
        "institutional_score":     inst_score,
        "net_fii_dii_5d_cr":       flow["net_combined_cr"],
        "promoter_action":         promoter["promoter_action"],
        "delivery_spike_ratio":    distribution["spike_ratio"],
        "accumulation_confirmed":  flow["accumulation_flag"],
        "conviction_multiplier":   conviction_multiplier,
        "level7_flow_label":       (
            "Accumulation" if inst_score >= 65 else
            "Distribution" if distribution["spike_ratio"] > 2 else
            "Neutral"
        )
    }
```

---

## 4. Output Schema

```json
{
  "engine_level": 7,
  "run_date": "2024-01-15",
  "run_ts": "2024-01-15T07:34:22+05:30",
  "equities_evaluated": 11,
  "distribution_phase_rejects": 1,
  "equities_passing": 10,
  "results": [
    {
      "ticker":                 "HAL",
      "outcome":                "PASS",
      "institutional_score":    78.50,
      "net_fii_dii_5d_cr":      215.40,
      "promoter_action":        "ACCUMULATING",
      "delivery_spike_ratio":   1.32,
      "accumulation_confirmed": true,
      "conviction_multiplier":  1.0,
      "level7_flow_label":      "Accumulation"
    },
    {
      "ticker":                 "DIXON",
      "outcome":                "PASS",
      "institutional_score":    62.25,
      "net_fii_dii_5d_cr":      88.70,
      "promoter_action":        "NEUTRAL",
      "delivery_spike_ratio":   1.75,
      "accumulation_confirmed": true,
      "conviction_multiplier":  1.0,
      "level7_flow_label":      "Neutral"
    },
    {
      "ticker":                 "XYZCO",
      "outcome":                "FATAL_FAIL",
      "failure_code":           "DISTRIBUTION_PHASE",
      "spike_ratio":            4.21,
      "fii_qoq_change":         -2.35,
      "reason":                 "Distribution Phase detected: Delivery spike 4.2× above 20D avg while FII holdings fell 2.35% QoQ."
    }
  ]
}
```

---

## 5. Logic Modifiers & Thresholds

These values are stored in `Engine_Modifiers` table (`level = 'Level_7'`) and can be dynamically adjusted by `level10_learning.md`.

| Modifier Key | Default Value | Description | Adjustment Bounds |
|---|---|---|---|
| `INSTITUTIONAL_ACCUMULATION_MIN_CR` | `50.0` | Minimum net institutional flow (₹Cr, 5-day) for positive flag | [20.0, 200.0] |
| `DELIVERY_SPIKE_THRESHOLD` | `3.0` | Delivery spike ratio above which distribution is suspected | [2.0, 5.0] |
| `FLOW_LOOKBACK_DAYS` | `5` | Rolling window for FII/DII net flow | [3, 10] |
| `PROMOTER_LOOKBACK_DAYS` | `30` | Days to scan for promoter open-market purchases | [15, 60] |
| `MAX_FLOW_SCORE_CR` | `500.0` | Net institutional flow that maps to Flow_Score = 100 | [200, 1000] |
| `ACCUMULATION_DEFICIT_PENALTY` | `0.20` | Conviction score penalty if flow < MIN threshold (soft gate) | [0.10, 0.35] |
| `FLOW_SCORE_WEIGHT` | `0.50` | Weight of net flow score in Institutional_Score | [0.30, 0.70] |
| `PROMOTER_SCORE_WEIGHT` | `0.25` | Weight of promoter action signal | [0.10, 0.40] |
| `DELIVERY_SCORE_WEIGHT` | `0.25` | Weight of delivery spike inversion score | [0.10, 0.40] |

---

## 6. Cross-References

- **Upstream:** [level6_earnings.md](./level6_earnings.md) provides `surprise_score` and `confidence_penalty_applied`
- **Downstream:** [level8_thesis.md](./level8_thesis.md) uses `level7_flow_label` and `accumulation_confirmed` in thesis generation
- **Downstream:** [level9_portfolio.md](./level9_portfolio.md) uses `conviction_multiplier` in final portfolio scoring
- **Learning:** [level10_learning.md](./level10_learning.md) adjusts `DELIVERY_SPIKE_THRESHOLD` and `INSTITUTIONAL_ACCUMULATION_MIN_CR` based on false negatives at this level
- **DB:** Reads `Engine_Modifiers` (Level_7); `level7_flow_label` is written to `Daily_Projections` table via orchestrator
