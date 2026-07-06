# Level 0 — Microstructure Regime Engine

```yaml
name: "Microstructure_Regime_Engine"
framework: "OACF"
version: "2.0.0"
type: "regime_node"
level: 0
phase: "Pre-Market / Intraday Execution"
writes_to:
  - live_regime_state
```

---

## 1. Context & Purpose

The **Microstructure Regime Engine** provides the crucial "Macro & Liquidity Context" for the entire Big Bull Engine. 

Instead of relying on trailing price indicators (e.g., 30-day volatility or 200-day moving averages), which are dangerously lagging, Level 0 relies on **high-frequency exogenous microstructure data** to flag regime shifts instantaneously. 

When liquidity evaporates or structural correlations break, Level 0 shifts the regime, immediately triggering the Level 10.5 50% feature handicap for mismatched factors.

---

## 2. The 3-Pillar Microstructure Architecture

### Pillar 1: High-Frequency Order Book Imbalance (HFI)
Monitors the depth of the Nifty 50 constituents' L2 order books. 
- A sudden skew (e.g., top-of-book bids vanish while asks stack) indicates an impending liquidity vacuum (Risk-Off) before prices even drop.

### Pillar 2: Interbank Liquidity & Yield Curves
Monitors exogenous systemic stress.
- TREPS (Triparty Repo) rates.
- Overnight index swaps (OIS) curves.
- Instantaneous spikes here indicate systemic deleveraging, forcing a "Bear/High-Vol" classification.

### Pillar 3: Cross-Asset Correlation Matrices
Monitors the mathematical coupling of assets.
- USDINR vs NIFTY vs GOLD vs BRENT.
- When traditionally uncorrelated assets suddenly move with correlation = 1.0, a structural contagion regime is active.

---

## 3. Execution & Outputs

The engine streams these ticks and publishes the current Regime Tag (e.g., `high-vol mean-reverting`, `low-vol trending`) to the `live_regime_state` in PostgreSQL/Redis. 

All downstream Level 1-8 extraction nodes and Level 10 inference models pull this instantaneous tag to dynamically adjust weights.
