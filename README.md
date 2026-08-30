# RecoverChain AI - Prototype Foundation

This is the minimal, testable foundation for RecoverChain AI (Phase 3).

## Status Overview

* **Domain Logic:** WORKING (Python models, Pydantic, strict state transitions)
* **API Foundation:** WORKING (FastAPI shell, `/health` endpoint)
* **Database (PostgreSQL):** UNAVAILABLE (Requires Docker locally)
* **Cache (Redis):** UNAVAILABLE (Requires Docker locally)
* **Frontend:** PENDING / FUTURE PHASE (npm/Node.js unavailable locally. A simple static `index.html` stub is provided).
* **AI/Agents:** FUTURE PHASE

## Prerequisites
- Python 3.11+
- (Optional but Recommended) Node.js (for future frontend)
- (Optional but Recommended) Docker Desktop (for local PostgreSQL and Redis)

## Environment Setup

### 1. Infrastructure (UNAVAILABLE LOCALLY)
If you have Docker installed, start the database and cache using Docker Compose:
```bash
docker-compose up -d
```
*Note: Due to Docker being unavailable in the current environment, the API automatically falls back to a local SQLite database (`recoverchain.db`) for testing and verification.*

### 2. Backend API (WORKING)
Set up the Python environment:
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Start the FastAPI application:
```bash
set PYTHONPATH=.
uvicorn api.main:app --reload
```

You can test the ingestion engine with the following curl command:
```bash
curl -X POST http://localhost:8000/events \
     -H "Content-Type: application/json" \
     -d '{"customer_id": "cust_123", "risk_category": "FAILED_PAYMENT", "external_system": "stripe", "external_event_id": "evt_abc123", "amount": 50.0, "raw_payload": {}}'
```

### 3. Frontend Dashboard (UNAVAILABLE / STUBBED)
Currently, a minimal vanilla HTML stub is placed in `frontend/index.html`.
You can serve it via:
```bash
cd frontend
python -m http.server 3000
```
*Full React+Vite implementation is deferred to a future phase once node/npm are available.*

### 4. Running Tests (WORKING)
In the `backend` directory, run:
```bash
set PYTHONPATH=.
pytest
```

## Project Structure
- `backend/domain/`: Framework-independent core logic, entities, value objects, interfaces, and lifecycle.
- `backend/application/`: Orchestration and use case layer (Future).
- `backend/infrastructure/`: Concrete implementations (DB, Redis, external SDKs).
- `backend/api/`: FastAPI presentation layer.
- `backend/tests/`: Domain and integration tests.
- `frontend/`: Stubbed UI directory.

## Backend setup

```bash
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install -r backend/requirements.txt
cd backend
set PYTHONPATH=.
set DATABASE_URL=sqlite:///./test_recoverchain.db
uvicorn api.main:app --reload
pytest
```
