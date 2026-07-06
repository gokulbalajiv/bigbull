# Research Audit: Big Bull Engine

## 1. Current Architecture
The Big Bull Engine is an institutional quantitative research and alpha generation platform. It is defined through a series of rigid architectural documents (OACF framework) mapping out a 10-Level DAG:
* **Level 0**: Regime Engine
* **Level 1–8**: Feature Extraction (Macro, Theme, Fundamental, Forensic, Execution)
* **Level 9**: HRP Portfolio Construction
* **Level 10**: Ensemble Training (LambdaMART Ranker + Ridge Meta-Model)
* **Level 10.5**: Alpha Discovery Pipeline (UMAP + HDBSCAN)

The frontend is a Next.js application (`bigbull-ui`) providing modules for `projections`, `audit`, `settings`, and `thesis`.

## 2. Missing Components
While the conceptual framework for `Alpha Discovery` (Level 10.5) has been defined in markdown, the underlying computational pipelines and physical tables required to execute a true institutional research suite are missing. Specifically:
- No infrastructure to recompute point-in-time features (Historical Reconstruction).
- No API/Storage for capturing the true cross-sectional winners (Winner Genome).
- No programmatic pipeline that translates HDBSCAN clusters into validatable backtests.
- No Shadow Model pipeline (Champion/Challenger).
- No centralized registry for tracking decay and rejected hypotheses (Alpha Graveyard).

## 3. Technical Debt
- **Documentation Drift**: Some orchestrator flows reference legacy binary classification terms that need final cleaning.
- **Python Implementation**: The system heavily relies on `.md` definitions, meaning the Python execution layer (the actual data ingestion, LightGBM execution, and HDBSCAN clustering) needs concrete scaffolding in the repository to function as an active service.
- **UI Constraints**: The Next.js dashboard only surfaces daily execution results. It lacks any interfaces for quantitative researchers to interact with the discovery platform.

## 4. Existing Schemas & Integration Points
- PostgreSQL schema handles `ml_feature_store`, `ml_predictions_log`, and daily projections.
- Integration points exist via `orchestrator.md` triggering scripts at 08:00 AM and 17:00 PM IST.
- The `alpha_discovery.md` defines the exact boundaries separating live training from research.

## 5. Next Steps
Move to Phase 2: Implementation of the Historical Reconstruction Engine and expansion of the PostgreSQL backend to support the Winner Genome and Missed Alpha Archive.
