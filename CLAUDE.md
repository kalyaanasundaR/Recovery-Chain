# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RecoverChain — revenue-recovery decisioning. Events (failed payments / overdue
invoices / abandoned checkouts) are correlated into **cases**; each case runs a
fixed deterministic lifecycle:

```
ingest → assess-risk → diagnose → predict-recovery → recommend-action (+ ERV)
       → policy/safety gate → agent execution (sandbox) → verify → audit
```

A second subsystem, the **Dataset Lab**, ingests CSV/Parquet/XLSX, maps columns
to canonical fields, checks ML readiness (leakage / minimum-info contract),
trains **shadow-only** models, and can replay dataset rows through the pipeline.

Build history: `docs/history/architecture_phase*.md`. `docs/MODEL_CARD.md` covers
the shadow model.

## Commands

Backend runs from `backend/` with `PYTHONPATH=.` (use `backend/venv` — it has all deps).

```bash
# full stack
python run.py                                  # backend :8000 + frontend :5173 (SQLite)

# backend
cd backend && PYTHONPATH=. uvicorn api.main:app --reload
cd backend && PYTHONPATH=. pytest              # 216 tests, isolated throwaway DB
cd backend && PYTHONPATH=. pytest -m fast      # unit only
cd backend && PYTHONPATH=. pytest tests/test_policy.py::test_A_permitted_action -q
cd backend && ruff check . && ruff format --check .    # lint + format (pyproject.toml)
cd backend && pip install -r requirements-dev.txt      # ruff / mypy / pytest-cov / pip-audit

# schema
cd backend && PYTHONPATH=. alembic upgrade head        # required for Postgres
#   (SQLite dev auto-creates tables on startup; Postgres does NOT)

# ML training (reproducible)
cd backend && PYTHONPATH=. python run_phase19_training.py

# frontend
cd frontend && npm install && npm run dev
cd frontend && npm run build                   # tsc + vite
cd frontend && npm run lint && npm run format:check

# containers
docker-compose up --build                      # postgres + redis + api + web
```

`tests/conftest.py` forces an isolated SQLite file (`RECOVERCHAIN_TEST_DATABASE_URL`
to override), creates/drops the schema per session, bypasses the API-key
dependency, disables the ML quality gate (`ML_MIN_ROC_AUC=0`), and disables the
rate limiter (`RATE_LIMIT_ENABLED=0`; `test_auth.py` re-enables it explicitly).

## Config / env

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | `sqlite:///./x.db` for local |
| `API_KEY` | `test-api-key` | `X-API-Key` header on mutating routes; dev default triggers a startup warning |
| `CORS_ORIGINS` | `*` | comma-separated allowlist; `*` disables credentialed CORS |
| `ALLOW_INSECURE_DEFAULTS` | — | `1` silences the insecure-default startup warnings |
| `RATE_LIMIT_ENABLED` / `RATE_LIMIT_RPM` | `1` / `120` | per-key/-IP sliding window; conftest sets `0` |
| `MAX_UPLOAD_BYTES` | `536870912` | dataset upload cap (512 MiB) |
| `DEFAULT_CURRENCY` | `INR` | used when a dataset has no currency column |
| `AUTO_CREATE_TABLES` | — | `1` forces `create_all` on non-SQLite (dev only) |
| `ML_MIN_ROC_AUC` / `ML_MIN_TEST_ROWS` | `0.55` / `200` | training quality gate; `0` disables |
| `REDIS_URL` | `redis://localhost:6379/0` | only `/health` uses it |
| `GEMINI_API_KEY` | — | optional real-LLM evaluation mode (key sent as `x-goog-api-key` header) |

## Architecture

Clean layering under `backend/`:

- **`domain/`** — Pydantic models (`RecoveryCase` aggregate + 7 stage sub-objects,
  `CaseState`, `Money` = `Decimal`), `lifecycle.py`, `interfaces.py`, `llm_schemas.py`.
- **`application/`** — one engine per stage: `risk_detector`, `diagnosis_engine`,
  `recovery_predictor` (deterministic baseline) / `recovery_predictor_ml` (shadow
  XGBoost), `action_evaluator`, `policy_engine`, `agents`, `verification_engine`.
  **`case_pipeline.py`** (`CasePipelineService`) runs assess→diagnose→predict→
  recommend→policy in one call and is the shared path for `/events/batch` and
  `/cases/{id}/advance`. Dataset Lab: `dataset_lab`, `dataset_intelligence`,
  `ml_readiness`, `ml_training`. `langgraph_orchestrator.py` is a hand-rolled
  `StateGraph` (real langgraph needs `xxhash`, blocked) used **only** by
  `evaluation/runner.py`.
- **`infrastructure/`** — `orm.py` / `dataset_orm.py` (lifecycle sub-objects are
  **JSON columns** on `recovery_cases`; `execution_attempts` ledger; `idempotency_keys`),
  `repositories.py` (`SqlAlchemyCaseRepository` — ORM↔domain map, `record_execution_attempt`,
  `get_policy_context`; commits per use-case), `redis_client.py`, `adapters.py`.
- **`api/`** — `auth.py` (`verify_api_key`); `main.py` (case pipeline + `/events/batch`,
  `/cases/{id}/advance`, `/cases/{id}/stop`, request-id middleware); `dataset_router.py`
  (`/datasets/*`); `system_router.py` (`/system/*` read-only observability).

Frontend (`frontend/`): React 18 + Vite + react-router + **Tailwind v3** (`.cjs`
configs). `src/api/client.ts` wraps every call (`/api` → Vite proxy). Pages:
Dashboard, Cases, CaseDetail (reads `/system/cases/{id}`), DatasetLibrary,
DatasetAnalysis.

## Invariants — do not break

- **ML is shadow-only.** `DeterministicPolicyEngine` is the sole execution
  authority. Predictors hard-code `shadow_mode_active: True`; no ML value feeds a
  `PolicyDecision`. When no per-dataset model exists (or it failed the quality
  gate → `REJECTED_LOW_QUALITY`), prediction falls back to
  `DeterministicBaselinePredictor` — never a silent 0.0.
- **Execution is simulated** (`MockExecutionAdapter`); no live gateways.
  `AgentOrchestrator.execute` requires a persisted `PolicyDecision.status ==
  PERMITTED`, matching action, fresh decision, and an agent that can handle it.
  Pass `repo=` for idempotency (replay → same `ExecutionRecord`) + ledger write.
- **Policy uses real history when available.** `DeterministicPolicyEngine.evaluate(
  case, context: PolicyContext | None)` — with a `PolicyContext` (built from
  `execution_attempts` by `repo.get_policy_context`) retry/cooldown/contact limits
  count real attempts; without one it uses the legacy `linked_events` proxy
  (unit tests). Also enforces `StopRule` + `ConsentCheck`.
- **Financials.** `Money` = `Decimal`; ORM `Numeric(18,4)`. Actual recovered amount
  comes only from `RecoveryOutcome`. `verification_engine` clamps to `[0, amount]`.
- **Leakage / dataset↔model isolation** unchanged: `DatasetValidator.detect_leakage`,
  minimum-info contract, and `MLPaymentFailurePredictor` loads only a model whose
  metadata `dataset_id` exactly matches (and status ≠ `REJECTED_LOW_QUALITY`).
- **Migrations own the Postgres schema.** The initial migration `create_table`s
  all tables from scratch; `create_all` runs only for SQLite (or `AUTO_CREATE_TABLES=1`).
- **Auth.** `verify_api_key` guards `/events*`, `/cases/{id}/{advance,stop,execute,
  assess-risk,diagnose,predict-recovery,recommend-action,policy-check,verify}`,
  `/human-review`, `/evaluation/run`, and every mutating `/datasets/*` route
  (`upload`, `analyze`, `ml-readiness`, `train`, `mapping`, `predict`,
  `generate-cases`, `prune`, `sync` — via the router-level `_AUTH` dep). Read-only
  GETs stay open. Tests override the dependency in conftest.
- **HTTP hardening** lives in `api/security.py`: a stdlib sliding-window rate
  limiter (middleware), a `check_startup_config()` insecure-default warning, and
  the shared upload-size constant. Single-process only — swap for Redis at scale.

## Not yet done (see the roadmap)

- **First-class entities** (Customer, Transaction/Payment, Invoice, Subscription,
  CheckoutSession, PromiseToPay) + entity resolution — still: everything except
  Case↔Event / Case↔Audit / execution_attempts is a JSON blob, and correlation
  needs a shared `reference_id`.
- **Real payment / comms adapters, provider webhooks, multi-tenancy.**
