import os
import time

# ---------------------------------------------------------------------------
# Test database isolation.
# Force every test run onto a dedicated throwaway SQLite file so integration
# tests never share state with `run.py` (which uses ./test_recoverchain.db) or
# with a developer's real database. This MUST run before any test module
# imports `infrastructure.db`, so it lives at import time in conftest.py.
# Override by exporting RECOVERCHAIN_TEST_DATABASE_URL.
# ---------------------------------------------------------------------------
_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), os.pardir, "_pytest_recoverchain.db")
_TEST_DB_URL = os.getenv(
    "RECOVERCHAIN_TEST_DATABASE_URL",
    "sqlite:///" + os.path.abspath(_TEST_DB_FILE).replace("\\", "/"),
)
os.environ["DATABASE_URL"] = _TEST_DB_URL

# The ML quality gate (ml_training) would reject the deliberately tiny fixtures
# that plumbing tests train. Disable it by default for the suite; the dedicated
# gate test re-enables it explicitly.
os.environ.setdefault("ML_MIN_ROC_AUC", "0.0")
os.environ.setdefault("ML_MIN_TEST_ROWS", "0")

if _TEST_DB_URL.startswith("sqlite:///") and os.path.exists(os.path.abspath(_TEST_DB_FILE)):
    try:
        os.remove(os.path.abspath(_TEST_DB_FILE))
    except OSError:
        pass

import pytest


@pytest.fixture(scope="session", autouse=True)
def _test_database():
    """Create a clean schema for the session and drop the file afterwards."""
    from infrastructure.db import engine, Base
    import infrastructure.orm  # noqa: F401  (register models)
    import infrastructure.dataset_orm  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if _TEST_DB_URL.startswith("sqlite:///"):
        try:
            os.remove(os.path.abspath(_TEST_DB_FILE))
        except OSError:
            pass


@pytest.fixture(scope="session", autouse=True)
def _bypass_api_key(_test_database):
    """Most tests don't care about auth. Override the API-key dependency for the
    whole suite; test_auth.py clears this to exercise the 401/403 path."""
    from api.main import app, verify_api_key
    app.dependency_overrides[verify_api_key] = lambda: "test-bypass"
    yield
    app.dependency_overrides.pop(verify_api_key, None)


@pytest.fixture(autouse=True)
def remove_artificial_delays(monkeypatch):
    """
    Optimizes test execution by stripping artificial simulated delays
    (e.g., from SimulatedLLMAdapter or other simulated infra).
    """
    # Patch time.sleep globally during tests to eliminate artificial latency
    def mock_sleep(seconds):
        pass
    monkeypatch.setattr(time, "sleep", mock_sleep)

def pytest_collection_modifyitems(config, items):
    for item in items:
        # Determine if test is integration or fast
        is_integration = False

        # Check by file name
        if item.fspath.basename in ["test_api_endpoints.py", "test_dataset_lab.py", "test_llm.py", "test_evaluation.py", "test_dataset_api.py"]:
            is_integration = True

        # Check by specific test name (e.g. hits API)
        if "api" in item.name and "endpoint" in item.name:
            is_integration = True

        # Check by fixture requests
        if hasattr(item, "fixturenames"):
            if "client" in item.fixturenames or "session" in item.fixturenames or "db" in item.fixturenames:
                is_integration = True

        if is_integration:
            item.add_marker(pytest.mark.integration)
        else:
            item.add_marker(pytest.mark.fast)
