import os
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

@pytest.fixture
def mock_upload_file(tmp_path):
    def _create_file(filename, content):
        path = tmp_path / filename
        if isinstance(content, str):
            path.write_text(content)
        else:
            path.write_bytes(content)
        return path
    return _create_file

import uuid
def test_dataset_upload_csv(mock_upload_file):
    fname = f"test_{uuid.uuid4().hex}.csv"
    path = mock_upload_file(fname, "id,amount,date,outcome\n1,100,2023-01-01,success")
    with open(path, "rb") as f:
        response = client.post("/datasets/upload", files={"file": (fname, f, "text/csv")})
    assert response.status_code == 200
    data = response.json()
    assert "dataset_id" in data
    assert data["status"] == "success"

def test_dataset_upload_invalid_extension(mock_upload_file):
    fname = f"test_{uuid.uuid4().hex}.exe"
    path = mock_upload_file(fname, "MZ...")
    with open(path, "rb") as f:
        response = client.post("/datasets/upload", files={"file": (fname, f, "application/octet-stream")})
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]

def test_dataset_upload_no_extension(mock_upload_file):
    fname = f"test_{uuid.uuid4().hex}"
    path = mock_upload_file(fname, "id,amount")
    with open(path, "rb") as f:
        response = client.post("/datasets/upload", files={"file": (fname, f, "text/plain")})
    assert response.status_code == 400
    assert "Invalid filename" in response.json()["detail"]

def test_dataset_upload_oversize(mock_upload_file, monkeypatch):
    import api.dataset_router
    # Temporarily mock the max file size to be very small
    monkeypatch.setattr(api.dataset_router, "MAX_FILE_SIZE", 10)
    
    fname = f"test_large_{uuid.uuid4().hex}.csv"
    path = mock_upload_file(fname, "id,amount,date,outcome\n1,100,2023-01-01,success\n2,200,2023-01-02,failure")
    with open(path, "rb") as f:
        response = client.post("/datasets/upload", files={"file": (fname, f, "text/csv")})
    assert response.status_code == 413
    assert "File too large" in response.json()["detail"]

def test_dataset_upload_parquet(mock_upload_file):
    fname = f"test_{uuid.uuid4().hex}.parquet"
    path = mock_upload_file(fname, b"PAR1...")
    with open(path, "rb") as f:
        response = client.post("/datasets/upload", files={"file": (fname, f, "application/octet-stream")})
    assert response.status_code == 200

def test_dataset_upload_xlsx(mock_upload_file):
    fname = f"test_{uuid.uuid4().hex}.xlsx"
    path = mock_upload_file(fname, b"PK...")
    with open(path, "rb") as f:
        response = client.post("/datasets/upload", files={"file": (fname, f, "application/octet-stream")})
    assert response.status_code == 200

def test_dataset_analyze(mock_upload_file):
    fname = f"analyze_{uuid.uuid4().hex}.csv"
    # Upload first
    path = mock_upload_file(fname, "account_id,tx_id,price,timestamp,actual_recovered\nacc_1,tx_99,150,2023-01-01,success")
    with open(path, "rb") as f:
        up_res = client.post("/datasets/upload", files={"file": (fname, f, "text/csv")})
    ds_id = up_res.json()["dataset_id"]
    
    # Analyze
    an_res = client.post(f"/datasets/{ds_id}/analyze")
    assert an_res.status_code == 200
    
    # Check result
    get_res = client.get(f"/datasets/{ds_id}")
    ds_data = get_res.json()
    assert ds_data["status"] == "MAPPING_REVIEW"
    assert ds_data["row_count"] == 1
    assert ds_data["column_count"] == 5
    
    # Check leakage
    leakages = ds_data.get("leakage_detection", [])
    assert len(leakages) > 0
    assert any("actual_recovered" in L["column"] for L in leakages)
    
    # Check schema
    schema = ds_data.get("recoverchain_signals", [])
    assert any(s["canonical_field"] == "ACCOUNT_ID" and s["original_column"] == "account_id" for s in schema)
    assert any(s["canonical_field"] == "AMOUNT" and s["original_column"] == "price" for s in schema)
    
    # ML Suitability
    suitability = ds_data.get("training_suitability", {})
    assert suitability.get("overall_classification") == "ANALYSIS_READY"
import shutil
import os

def test_ml_readiness_api_billing(mock_upload_file):
    fname = f"billing_{uuid.uuid4().hex}.csv"
    src_path = os.path.join("evaluation", "datasets", "billing_recovery_v3.csv")
    if not os.path.exists(src_path):
        pytest.skip("billing_recovery_v3.csv not found")
        
    with open(src_path, "rb") as f:
        up_res = client.post("/datasets/upload", files={"file": (fname, f, "text/csv")})
    ds_id = up_res.json()["dataset_id"]
    
    # Analyze first
    client.post(f"/datasets/{ds_id}/analyze")
    
    ds_res = client.get(f"/datasets/{ds_id}").json()
    mappings = []
    for sig in ds_res.get("recoverchain_signals", []):
        col = sig["original_column"]
        cf = sig["canonical_field"]
        if col == "bill_amount_excl_late":
            cf = "AMOUNT"
        if col == "prior_ontime":
            cf = "UNKNOWN"
        if col == "year_month":
            cf = "TIMESTAMP"
            
        mappings.append({
            "original_column": col,
            "canonical_field": cf,
            "action": "confirm" if cf != "UNKNOWN" else "unused"
        })
    client.post(f"/datasets/{ds_id}/mapping", json={"mappings": mappings})
    
    # ML Readiness
    ml_res = client.post(f"/datasets/{ds_id}/ml-readiness")
    assert ml_res.status_code == 200
    spec = ml_res.json()
    
    assert spec["prediction_problem"] == "payment-failure-risk"
    assert spec["target_column"] == "target_recovered"
    assert "subscriber_id" in spec["excluded_columns"]
    
def test_ml_readiness_api_ar(mock_upload_file):
    fname = f"ar_{uuid.uuid4().hex}.csv"
    src_path = os.path.join("evaluation", "datasets", "ar_recovery_v2.csv")
    if not os.path.exists(src_path):
        pytest.skip("ar_recovery_v2.csv not found")
        
    with open(src_path, "rb") as f:
        up_res = client.post("/datasets/upload", files={"file": (fname, f, "text/csv")})
    ds_id = up_res.json()["dataset_id"]
    
    # Analyze first
    client.post(f"/datasets/{ds_id}/analyze")
    
    ds_res = client.get(f"/datasets/{ds_id}").json()
    mappings = []
    for sig in ds_res.get("recoverchain_signals", []):
        col = sig["original_column"]
        cf = sig["canonical_field"]
        if col == "InvoiceAmount":
            cf = "AMOUNT"
        if col == "customerID":
            cf = "CUSTOMER_ID"
        if col == "InvoiceDate":
            cf = "TIMESTAMP"
        if col == "target_late":
            cf = "OUTCOME"
            
        mappings.append({
            "original_column": col,
            "canonical_field": cf,
            "action": "confirm" if cf != "UNKNOWN" else "unused"
        })
    client.post(f"/datasets/{ds_id}/mapping", json={"mappings": mappings})
    
    # ML Readiness
    ml_res = client.post(f"/datasets/{ds_id}/ml-readiness")
    assert ml_res.status_code == 200
    spec = ml_res.json()
    
    assert spec["prediction_problem"] == "late-settlement-risk"
    assert spec["target_column"] == "target_late"
    assert "customerID" in spec["excluded_columns"]
