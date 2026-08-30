# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RecoverChain AI — a revenue-recovery decisioning system. Failed payments / overdue invoices / abandoned
checkouts come in as events, get correlated into **cases**, and each case is driven through a fixed
7-stage lifecycle (assess → diagnose → predict → recommend → policy-check → execute → verify). A second
subsystem (the **Dataset Lab**) ingests arbitrary CSV/Parquet/XLSX datasets, semantically maps their
columns, trains shadow ML models, and can replay dataset rows through the case pipeline.

The repo is not a git repository and has no CI. Build history is documented in the `architecture_phase*.md`
files at the root (phase 22 and 23a are the most recent and most relevant). Root-level `phase16*_*.py`,
`inspect_*.py`, `patch_*.py`, `validate_*.py`, `dq.py`, `check.py` etc. are one-off analysis/migration
scripts — not part of the running application.

## Commands

All backend commands run from `backend/` with `PYTHONPATH=.` set.

```bash
# Full stack (backend :8000 + frontend :5173, forces SQLite) — from repo root
python run.py

# Backend only
cd backend && PYTHONPATH=. uvicorn api.main:app --reload   # http://localhost:8000/docs

# Tests (from backend/)
cd backend && PYTHONPATH=. pytest                 # all
PYTHONPATH=. pytest -m fast                       # fast unit tests only
PYTHONPATH=. pytest -m integration                # DB/API/adapter tests
PYTHONPATH=. pytest tests/test_policy.py::test_name -q   # single test

# Frontend (from frontend/)
npm install && npm run dev        # Vite dev server, proxies /api -> 127.0.0.1:8000
npm run build                     # tsc + vite build

# Infra (optional; Postgres + Redis)
docker-compose up -d

# ML training (from backend/)
PYTHONPATH=. python run_phase19_training.py
```

`tests/conftest.py` auto-marks every test `fast` or `integration` by filename/fixtures — there is no
explicit marker in most test files. It also monkeypatches `time.sleep` to zero.

## Database

`infrastructure/db.py` picks the engine from `DATABASE_URL` (default Postgres). Set
`DATABASE_URL=sqlite:///./test_recoverchain.db` for local runs — `run.py` does this automatically.
Under SQLite the schema is created at import time by `Base.metadata.create_all` in `api/main.py`.
For Postgres use Alembic: `cd backend && PYTHONPATH=. alembic upgrade head`. `recoverchain.db` /
`test_recoverchain.db` are checked-in SQLite files used by tests and local runs.

`requirements.txt` is UTF-16 encoded and lists only the FastAPI/SQLAlchemy core. `pandas`, `numpy`,
`scikit-learn`, `xgboost`, `joblib`, `pyarrow`, `openpyxl`, `python-dateutil`, and `alembic` are
imported by the Dataset Lab / ML code but are **not** in `requirements.txt` — install them separately.

## Architecture

Clean/hexagonal layering under `backend/`:

- **`domain/`** — framework-free Pydantic models. `models.py` holds the `RecoveryCase` aggregate plus
  one sub-object per lifecycle stage (`RiskAssessment`, `RootCauseDiagnosis`, `RecoveryPrediction`,
  `ActionRecommendation`, `PolicyDecision`, `ExecutionRecord`, `RecoveryOutcome`), the `CaseState` enum,
  and `Money` (uses `Decimal`). `lifecycle.py` (`CaseLifecycleManager`) enforces legal state
  transitions. `interfaces.py` defines `ICaseRepository` / `IAuditRecorder`. `llm_schemas.py` is the
  strict schema LLM output must validate against.
- **`application/`** — one engine per stage, all deterministic: `risk_detector`, `diagnosis_engine`,
  `recovery_predictor` (deterministic baseline) / `recovery_predictor_ml` (shadow XGBoost),
  `action_evaluator`, `policy_engine`, `agents` (orchestrates recovery agents → `MockExecutionAdapter`),
  `verification_engine`. Dataset Lab: `dataset_lab` (service), `dataset_intelligence`
  (`SemanticMapper`, `DatasetValidator`, `DatasetProfiler`, `CanonicalField`), `ml_readiness`,
  `ml_training` (sklearn `Pipeline` + XGBoost, writes to `ml/models/registry/`).
  `langgraph_orchestrator.py` contains a **hand-rolled `StateGraph`** — real LangGraph is stubbed out
  because its `xxhash` DLL is blocked on the dev machine.
- **`infrastructure/`** — `orm.py` / `dataset_orm.py` (SQLAlchemy; lifecycle sub-objects are stored as
  **JSON columns** on `CaseModel`, not normalized tables), `repositories.py` (`SqlAlchemyCaseRepository`
  maps ORM ↔ domain and calls `db.commit()` itself — transactions are per-use-case), `redis_client.py`,
  `adapters.py`.
- **`api/`** — `main.py`: the case pipeline (`POST /events`, `POST|GET /cases/{id}/<stage>`,
  `/dashboard/metrics`, `/cases/{id}/human-review`). `dataset_router.py`: `/datasets/*` Dataset Lab.
  `system_router.py`: `/system/*` read-only observability.

Frontend (`frontend/`): React 18 + Vite + react-router-dom + TypeScript. `src/api/client.ts` wraps every
backend call (`BASE_URL = '/api'`, proxied by Vite). Pages: Dashboard, Cases, CaseDetail,
DatasetLibrary, DatasetAnalysis.

## Invariants — do not break these

- **ML is shadow-only.** ML predictions are advisory telemetry. `DeterministicPolicyEngine` has sole
  authority to gate execution; ML output must never feed the authorization path. Predictors hardcode
  `shadow_mode_active: True` and prediction status `SHADOW_ONLY`.
- **Execution is simulated.** `agents.py` routes to `MockExecutionAdapter`; there are no live payment
  gateways. Success is `ExecutionStatus.COMPLETED_SIMULATED`.
- **Financials.** `Money` is `Decimal`; ORM columns are `Numeric(18,4)`. The actual recovered amount
  comes only from `RecoveryOutcome` (verification stage) — never copied from a prediction.
- **Leakage prevention.** `DatasetValidator.detect_leakage` flags POST_OUTCOME columns (e.g.
  `actual_recovered_amount`, `settled_amount`, `SettledDate`) and excludes them from ML features. A
  dataset needs Entity + Amount + Time + Outcome/Target (the "Minimum Information Contract") to reach
  `ML_TRAINING_READY`; leaked-but-otherwise-complete datasets downgrade to `ANALYSIS_READY`.
- **Server-side trust.** Frontend mapping overrides (`POST /datasets/{id}/mapping`) are fully
  re-validated server-side: nonexistent columns, duplicate single-use assignments (TARGET / OUTCOME /
  AMOUNT), and mapping a target onto a leaked column are hard 400s.
- **Dataset↔model isolation.** `MLPaymentFailurePredictor` loads only a model whose registry metadata
  `dataset_id` exactly matches the request — there is no global "latest" model. Canonical inputs
  (`AMOUNT`, `CUSTOMER_ID`, …) are inverse-mapped to original column names via
  `canonical_feature_mapping` in the metadata JSON.
- **Event identity.** `(external_system, external_event_id)` is unique (dedup). Correlation into an
  existing active case requires matching `customer_id` + `risk_category` + `reference_id`; without a
  `reference_id` a new case is always created. `amount_at_risk` is the **latest** linked event's amount,
  not a sum.
- **API key.** Mutating endpoints (`/events`, `/cases/{id}/execute`, `/cases/{id}/human-review`) require
  header `X-API-Key` (env `API_KEY`, default `test-api-key`).

## Model registry

`backend/ml/models/registry/` holds `{run_id}_model.joblib` + `{run_id}_metadata.json` pairs written by
`MLTrainingEngine`. Metadata carries `dataset_id`, `task` (`payment-failure-risk`), `feature_columns`,
`target_column`, `canonical_feature_mapping`, and test metrics. Curated training datasets and their
provenance/leakage notes live in `backend/evaluation/datasets/` (see `dataset_manifest.json`).
