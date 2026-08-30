import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def unauthed_client():
    """A client with the suite-wide API-key bypass removed."""
    from api.main import app, verify_api_key
    app.dependency_overrides.pop(verify_api_key, None)
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides[verify_api_key] = lambda: "test-bypass"


@pytest.mark.integration
def test_mutating_routes_require_api_key(unauthed_client):
    c = unauthed_client
    ev = {"customer_id": "c", "risk_category": "FAILED_PAYMENT", "external_system": "s",
          "external_event_id": "authtest1", "amount": 10.0, "currency": "USD", "raw_payload": {}}

    # routes with no request body: the auth dependency is the first gate
    assert c.post("/cases/x/advance").status_code == 403
    assert c.post("/cases/x/assess-risk").status_code == 403
    assert c.post("/cases/x/execute").status_code == 403
    assert c.post("/evaluation/run").status_code == 403
    assert c.post("/events", json=ev).status_code == 403

    # with the key it gets past auth (then 404 because case x doesn't exist)
    assert c.post("/cases/x/assess-risk", headers={"X-API-Key": "test-api-key"}).status_code == 404

    # read routes stay open
    assert c.get("/health").status_code == 200
    assert c.get("/cases").status_code == 200
