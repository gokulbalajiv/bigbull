# Thesis_Memory_Engine — Level 8

```yaml
name: "Thesis_Memory_Engine"
framework: "OACF"
version: "1.0.0"
type: "analytical_node"
level: 8
phase: "Execution"
execution_time: "07:40 AM IST"
output_table: "Thesis_Ledger"
```

---

## 1. Context

The Thesis Memory Engine transforms the quantitative outputs of Levels 1–7 into a **structured, falsifiable narrative** for each surviving equity. This is the system's "investment memo generator" — it forces the engine to articulate *why* a stock is being recommended, *what specific event* would make it work, and *what would break the thesis*.

Without a falsifiable thesis, conviction scores are meaningless numbers. The thesis provides:
1. **Accountability** — the system can measure if the stated catalyst actually played out
2. **Learning signal** — Level 10 can compare the thesis's stated mechanism against actual market drivers
3. **Human review** — the UI dashboard's thesis summary gives operators a one-sentence rationale they can reject

**Data Inputs from Previous Levels:**
- Level 1: `current_regime`, `favored_sectors`
- Level 2: `theme_id`, `theme_confidence`
- Level 3: `wtm_index`, `margin_premium_pct`, `market_share_score`
- Level 4: `rvr` (management quality score)
- Level 5: `expectations_gap`, `implied_growth_pct`, `intrinsic_growth_pct`
- Level 6: `surprise_score`, `expected_eps_beat_pct`
- Level 7: `institutional_score`, `level7_flow_label`, `promoter_action`
- **PESTEL Engine**: `ticker_pestel_flags` from `pestel_output.json` (pre-computed at 06:00 AM)

---

## 2. Execution Logic

### 2.1 Thesis Component Assembly

The thesis is assembled from **five components**, each mapped to a specific Level's output:

```python
THESIS_COMPONENTS = {
    "catalyst_event":        None,   # Primary forward-looking catalyst (from Level 2 theme + Level 6)
    "valuation_argument":    None,   # Why market is underpricing (from Level 5 gap)
    "management_confidence": None,   # Capital allocator quality signal (from Level 4 RVR)
    "institutional_signal":  None,   # Smart money direction (from Level 7)
    "invalidation_trigger":  None,   # The one thing that would BREAK the thesis
}
```

### 2.2 Catalyst Event Generation (Primary Thesis Driver)

The catalyst is derived from the **winning theme** (Level 2) and the **earnings surprise signal** (Level 6):

```python
CATALYST_TEMPLATES = {
    "PLI_Electronics":       "PLI tranche disbursement of ₹{amount}Cr expected in Q{quarter} — direct revenue trigger for {ticker}.",
    "Defence_Indigenization": "HAL/BEL order book at 4× revenue; {ticker} order wins expected to drive EBITDA expansion by {margin_delta}% in {fy}.",
    "EV_Ecosystem":          "EV penetration crossing {threshold}% in 2Ws; {ticker}'s {product} content per vehicle rising {growth}% YoY.",
    "Renewable_Energy_Solar": "Solar capacity addition target of {gw}GW by {year} — {ticker} positioned as primary {component} supplier.",
    "GCC_Expansion":         "Fortune 500 GCC expansions driving {growth}% headcount growth at {ticker}; margin levers intact.",
    "Railway_Infrastructure": "{ticker} won ₹{amount}Cr order from {client}; order book now covers {coverage}× FY{fy} revenue.",
    "DEFAULT":               "{ticker} positioned within {theme} structural theme with {eps_beat}% EPS beat probability next quarter."
}

def generate_catalyst_statement(ticker: str, theme: str, level6: dict, macro: dict) -> str:
    """
    Generates a ≤50-word catalyst statement.
    Pulls real data from engine outputs to fill template variables.
    """
    template = CATALYST_TEMPLATES.get(theme, CATALYST_TEMPLATES["DEFAULT"])
    filled   = template.format(
        ticker     = ticker,
        amount     = fetch_pli_tranche_amount(ticker, theme),
        quarter    = estimate_next_result_quarter(),
        margin_delta = round(level6.get('rm_deflation_3m_pct', 0) * 0.6, 1),
        fy         = current_fy_label(),
        threshold  = 10,  # EV penetration
        product    = fetch_primary_product(ticker),
        growth     = round(level6.get('headcount_mom_pct', 0) * 12, 1),  # Annualized
        eps_beat   = round(level6.get('expected_eps_beat_pct', 50), 1),
        theme      = theme.replace("_", " "),
        gw         = 50,
        year       = current_year() + 2,
        component  = "module",
        coverage   = round(fetch_order_book_coverage(ticker), 1),
        client     = "Railways Ministry"
    )
    # Enforce MAX_THESIS_LENGTH_WORDS word limit
    words = filled.split()
    if len(words) > MAX_THESIS_LENGTH_WORDS:
        filled = " ".join(words[:MAX_THESIS_LENGTH_WORDS]) + "…"
    return filled
```

### 2.3 Valuation Argument (from Level 5)

```python
def generate_valuation_argument(level5: dict) -> str:
    gap  = level5["expectations_gap"]
    impl = level5["implied_growth_pct"]
    intr = level5["intrinsic_growth_pct"]

    if gap > 15:
        return (f"Market prices in {impl:.0f}% growth; OCF CAGR delivered {intr:.0f}% "
                f"— undervalued by {gap:.0f}pp vs. reality.")
    elif gap > 5:
        return (f"Modest valuation gap: {intr:.0f}% delivered vs. {impl:.0f}% implied by P/E.")
    else:
        return f"Fairly priced; thesis depends on catalyst execution, not rerating."
```

### 2.4 Invalidation Trigger Generation

The invalidation trigger is the **single most important event** that would cause the thesis to break:

```python
INVALIDATION_TEMPLATES = {
    "PLI_Electronics":       "PLI disbursement delayed beyond Q{next_q+1} OR revenue growth below {threshold}% in next quarterly print.",
    "Defence_Indigenization": "Order inflow drops below ₹{amount}Cr in next quarter OR export approvals revoked.",
    "EV_Ecosystem":          "EV penetration growth stalls below {threshold}% OR battery cost rises >15% unexpectedly.",
    "Renewable_Energy_Solar": "MNRE reduces capacity addition targets OR anti-dumping duties on solar cells removed (import competition).",
    "DEFAULT":               "Quarterly EPS misses analyst consensus by >10% OR management guidance is cut."
}

def generate_invalidation_trigger(ticker: str, theme: str, level5: dict) -> str:
    template = INVALIDATION_TEMPLATES.get(theme, INVALIDATION_TEMPLATES["DEFAULT"])
    pe = fetch_current_pe(ticker)
    return template.format(
        next_q    = estimate_next_result_quarter() + 1,
        amount    = 500,
        threshold = round(level5.get("intrinsic_growth_pct", 15) * 0.6, 0)
    )
```

### 2.5 Full Thesis Object Generation

```python
def generate_thesis(ticker: str, all_levels_output: dict) -> dict:
    """
    Generates the complete thesis JSON object for DB persistence.
    Called for every equity that passes Levels 1–7.
    """
    theme  = all_levels_output['level2']['active_theme']
    l5     = all_levels_output['level5']
    l6     = all_levels_output['level6']
    l7     = all_levels_output['level7']

    catalyst     = generate_catalyst_statement(ticker, theme, l6, all_levels_output['level1'])
    valuation    = generate_valuation_argument(l5)
    invalidation = generate_invalidation_trigger(ticker, theme, l5)

    # Determine initial thesis status
    status = "Neutral"  # Default on entry; will be updated by Level 10 daily

    # Build PESTEL context block: top 3 headlines most relevant to this ticker
    # Sources: ticker_tags match first, then sector_tags match as fallback
    pestel_flags  = all_levels_output.get('pestel', {}).get('ticker_pestel_flags', {})
    sector        = all_levels_output['level3'].get('sector', '')
    pestel_headlines = pestel_flags.get(ticker, [])

    if not pestel_headlines:
        # Fallback: retrieve sector-tagged headlines from DB
        pestel_headlines = fetch_pestel_headlines_for_sector(sector, limit=3)

    pestel_context = {
        "top_headlines": pestel_headlines[:3],  # Cap at 3 for thesis brevity
        "pillar_scores": all_levels_output.get('pestel', {}).get('pillar_scores', {}),
        "overall_pestel_score": all_levels_output.get('pestel', {}).get('overall_pestel_score', 0.0),
    }

    thesis = {
        "ticker":            ticker,
        "theme":             theme,
        "milestone_thesis":  catalyst,
        "valuation_context": valuation,
        "status":            status,
        "invalidation_trigger": invalidation,
        "pestel_context":    pestel_context,
        "entry_metadata": {
            "regime":             all_levels_output['level1']['current_regime'],
            "wtm_index":          all_levels_output['level3']['wtm_index'],
            "rvr":                all_levels_output['level4']['rvr'],
            "expectations_gap":   l5['expectations_gap'],
            "surprise_score":     l6['surprise_score'],
            "eps_beat_pct":       l6['expected_eps_beat_pct'],
            "institutional_flow": l7['level7_flow_label'],
            "promoter_action":    l7['promoter_action'],
        }
    }

    # Enforce word limit on milestone_thesis
    words = thesis["milestone_thesis"].split()
    assert len(words) <= MAX_THESIS_LENGTH_WORDS, \
        f"Thesis for {ticker} exceeds {MAX_THESIS_LENGTH_WORDS} words: {len(words)}"

    return thesis
```

### 2.6 Database Persistence

```sql
-- Upsert into Thesis_Ledger (update if ticker + entry_date already exists)
INSERT INTO Thesis_Ledger (
    thesis_id, ticker, entry_date, core_milestone, invalidation_trigger,
    status, level8_raw_json, last_updated_at
) VALUES (
    uuid_generate_v4(),
    %(ticker)s,
    CURRENT_DATE,
    %(milestone_thesis)s,
    %(invalidation_trigger)s,
    'Neutral',
    %(thesis_json)s::JSONB,
    NOW()
)
ON CONFLICT (ticker, entry_date)
DO UPDATE SET
    core_milestone       = EXCLUDED.core_milestone,
    invalidation_trigger = EXCLUDED.invalidation_trigger,
    level8_raw_json      = EXCLUDED.level8_raw_json,
    last_updated_at      = NOW();
```

---

## 3. Thesis Status Updates (Ongoing)

After initial `Neutral` status, the thesis status is updated daily by Level 10 based on market evidence:

| Status | Condition | Visual in UI |
|---|---|---|
| `Strengthened` | The milestone event is visibly progressing (e.g., order win announced, EBITDA beat) | 🟢 Green badge |
| `Neutral` | No confirming or denying evidence yet | ⚪ Grey badge |
| `Broken` | Invalidation trigger has fired (e.g., guidance cut, PLI delay confirmed) | 🔴 Red badge |

---

## 4. Output Schema

```json
{
  "engine_level": 8,
  "run_date": "2024-01-15",
  "run_ts": "2024-01-15T07:43:18+05:30",
  "theses_generated": 10,
  "results": [
    {
      "thesis_id": "f7a3d9c2-1e4b-4c8a-b5f2-9d0e3a7c1b8f",
      "ticker": "HAL",
      "theme": "Defence_Indigenization",
      "milestone_thesis": "HAL order book at 4× revenue; export approvals expected to drive EBITDA margin expansion by 2.1% in FY25.",
      "valuation_context": "Market prices in 19% growth; OCF CAGR delivered 34% — undervalued by 15pp vs. reality.",
      "status": "Neutral",
      "invalidation_trigger": "Order inflow drops below ₹500Cr in next quarter OR export approvals revoked.",
      "pestel_context": {
        "overall_pestel_score": 27.50,
        "pillar_scores": {
          "Political": +35.0,
          "Economic":  +28.0,
          "Social":    +10.0,
          "Technological": +20.0,
          "Environmental": +15.0,
          "Legal":    -12.0
        },
        "top_headlines": [
          {
            "pillar": "Political",
            "headline": "Cabinet approves ₹2.3L Cr defence modernisation plan; HAL to receive 200 LCA Mk2 orders",
            "sentiment": 0.90
          },
          {
            "pillar": "Technological",
            "headline": "DRDO clears indigenous AESA radar for Tejas; reduces import dependency by 60%",
            "sentiment": 0.75
          },
          {
            "pillar": "Legal",
            "headline": "SEBI tightens disclosure norms for defence PSUs on related-party contracts",
            "sentiment": -0.30
          }
        ]
      },
      "entry_metadata": {
        "regime": "Cautious Growth",
        "wtm_index": 88.15,
        "rvr": 3.41,
        "expectations_gap": 15.2,
        "surprise_score": 48.91,
        "eps_beat_pct": 48.69,
        "institutional_flow": "Accumulation",
        "promoter_action": "ACCUMULATING"
      }
    },
    {
      "thesis_id": "a2b5c8d1-f4e7-4a9b-c3d6-8e1f4a7b2c5d",
      "ticker": "DIXON",
      "theme": "PLI_Electronics",
      "milestone_thesis": "PLI tranche disbursement of ₹1,200Cr expected in Q4FY24 — direct revenue trigger for DIXON.",
      "valuation_context": "Modest valuation gap: 30% delivered vs. 20% implied by P/E.",
      "status": "Neutral",
      "invalidation_trigger": "PLI disbursement delayed beyond Q1FY25 OR revenue growth below 18% in next quarterly print.",
      "entry_metadata": {
        "regime": "Cautious Growth",
        "wtm_index": 81.42,
        "rvr": 2.88,
        "expectations_gap": 9.7,
        "surprise_score": 75.35,
        "eps_beat_pct": 83.68,
        "institutional_flow": "Neutral",
        "promoter_action": "NEUTRAL"
      }
    }
  ]
}
```

---

## 5. Logic Modifiers & Thresholds

These values are stored in `Engine_Modifiers` table (`level = 'Level_8'`) and can be dynamically adjusted by `level10_learning.md`.

| Modifier Key | Default Value | Description | Adjustment Bounds |
|---|---|---|---|
| `MAX_THESIS_LENGTH_WORDS` | `50` | Hard word limit for `milestone_thesis` text | [30, 80] |
| `STRONG_GAP_THRESHOLD` | `15.0` | Expectations gap above which "significantly undervalued" language is used | [10.0, 25.0] |
| `INVALIDATION_SEVERITY_BIAS` | `"CONSERVATIVE"` | Bias level for how pessimistic invalidation triggers are framed | `CONSERVATIVE` / `BALANCED` |
| `DEFAULT_THESIS_STATUS` | `"Neutral"` | Initial thesis status on first generation | Fixed: always `Neutral` |

---

## 6. Cross-References

- **Upstream:** [level7_market.md](./level7_market.md) provides `level7_flow_label` and `accumulation_confirmed`
- **Upstream:** [pestel_intelligence_engine.py](./services/pestel_intelligence_engine.py) provides `ticker_pestel_flags` and `pillar_scores` for `pestel_context` block
- **Writes to:** `Thesis_Ledger` PostgreSQL table (with `pestel_context` stored in `level8_raw_json`)
- **Downstream:** [level9_portfolio.md](./level9_portfolio.md) reads `thesis_id` for final Top 10 assembly
- **Downstream:** [orchestrator.md](./orchestrator.md) joins `Thesis_Ledger` when writing to `Daily_Projections`
- **Learning:** [level10_learning.md](./level10_learning.md) updates `Thesis_Ledger.status` daily based on actual outcomes
- **UI:** [ui_dashboard.md](./ui_dashboard.md) displays `core_milestone`, `status`, and `pestel_context.top_headlines` in both views
