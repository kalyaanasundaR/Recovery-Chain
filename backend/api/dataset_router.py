from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from infrastructure.db import get_db
from application.dataset_lab import DatasetLabService
import shutil
import os
import uuid
from datetime import datetime, timezone
from infrastructure.dataset_orm import DatasetMetadataModel, DatasetStatus

router = APIRouter(prefix="/datasets", tags=["datasets"])

@router.post("/sync")
def sync_local_datasets(db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    imported = service.import_local_datasets()
    return {"status": "success", "imported_count": len(imported), "dataset_ids": imported}

MAX_FILE_SIZE = 500 * 1024 * 1024 # 500 MB

@router.post("/upload")
def upload_dataset(file: UploadFile = File(...), db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    
    # Security: validate extension
    if not file.filename or '.' not in file.filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
        
    ext = file.filename.split('.')[-1].lower()
    if ext not in ['csv', 'parquet', 'xlsx', 'zip']:
        raise HTTPException(status_code=400, detail="Unsupported file format. Must be CSV, Parquet, or XLSX.")
        
    # Sanitize filename strictly to prevent path traversal
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in ['.', '_', '-'])
    if not safe_filename or safe_filename.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid safe filename.")

    # Store under a unique, dataset-scoped name so re-uploading the same file
    # never collides. The display name keeps the original.
    ds_id = f"ds_{uuid.uuid4().hex[:8]}"
    stored_filename = f"{ds_id}_{safe_filename}"
    os.makedirs(service.dataset_dir, exist_ok=True)
    file_path = os.path.join(service.dataset_dir, stored_filename)

    # Chunked write with size limit
    bytes_written = 0
    oversize = False
    try:
        with open(file_path, "wb") as buffer:
            while True:
                chunk = file.file.read(8192)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > MAX_FILE_SIZE:
                    oversize = True
                    break
                buffer.write(chunk)
    finally:
        file.file.close()
        
    if oversize:
        os.remove(file_path)
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 500MB.")
        
    size = os.path.getsize(file_path)
    new_ds = DatasetMetadataModel(
        dataset_id=ds_id,
        name=safe_filename,
        filename=stored_filename,
        file_type=ext,
        file_size_bytes=size,
        upload_timestamp=datetime.now(timezone.utc),
        status=DatasetStatus.PENDING
    )
    db.add(new_ds)
    db.commit()

    return {"status": "success", "dataset_id": ds_id}


def serialize_dataset(ds):
    d = ds.__dict__.copy()
    d.pop('_sa_instance_state', None)
    return d

@router.get("")
def list_datasets(db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    datasets = service.get_all_datasets()
    return {"datasets": [serialize_dataset(ds) for ds in datasets]}

@router.get("/{dataset_id}")
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    ds = service.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return serialize_dataset(ds)


        

@router.get("/{dataset_id}/preview")
def preview_dataset(dataset_id: str, limit: int = 25, db: Session = Depends(get_db)):
    limit = min(max(1, limit), 100)
    service = DatasetLabService(db)
    ds = service.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    path = os.path.join(service.dataset_dir, ds.filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Dataset file missing")
        
    import pandas as pd
    try:
        if path.endswith('.parquet'):
            import pyarrow.parquet as pq
            pf = pq.ParquetFile(path)
            df = pf.read_row_group(0).to_pandas().head(limit)
        elif path.endswith('.xlsx'):
            df = pd.read_excel(path, nrows=limit)
        else:
            df = pd.read_csv(path, nrows=limit)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate preview: {e}")
        
    schema_map = {s["original_column"]: s["canonical_field"] for s in (ds.recoverchain_signals or [])}
    
    columns = []
    for col in df.columns:
        columns.append({
            "original_name": str(col),
            "canonical_concept": schema_map.get(col, "UNKNOWN")
        })
        
    # Convert dataframe to JSON serializable records
    raw_records = df.to_dict(orient="records")
    records = []
    for r in raw_records:
        clean_r = {}
        for k, v in r.items():
            clean_r[k] = None if pd.isna(v) else v
        records.append(clean_r)
    return {
        "dataset_id": dataset_id,
        "row_count_preview": len(records),
        "columns": columns,
        "rows": records
    }

@router.post("/{dataset_id}/analyze")
def analyze_dataset(dataset_id: str, db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    ds = service.analyze_dataset(dataset_id)
    return {"status": ds.status.value, "dataset_id": ds.dataset_id}

@router.post("/{dataset_id}/ml-readiness")
def evaluate_ml_readiness(dataset_id: str, db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    ds = service.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    if ds.status not in [DatasetStatus.COMPLETED, DatasetStatus.READY_FOR_ANALYSIS, DatasetStatus.FAILED]:
        raise HTTPException(status_code=400, detail="Dataset must have confirmed mappings first.")
        
    ds.status = DatasetStatus.ANALYZING
    db.commit()
    
    from application.ml_readiness import MLReadinessAnalyzer
    file_path = os.path.join(service.dataset_dir, ds.filename)
    try:
        spec = MLReadinessAnalyzer.analyze_readiness(ds, file_path)
        ds.training_suitability = spec
        if spec.get("readiness_status") in ["ML_TRAINING_READY", "ML_TRAINING_READY_WITH_EXCLUSIONS", "ML_TRAINING_READY_WITH_WARNINGS"]:
            ds.status = DatasetStatus.ML_READY
        else:
            ds.status = DatasetStatus.FAILED
        db.commit()
        return spec
    except Exception as e:
        ds.status = DatasetStatus.FAILED
        ds.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=400, detail=f"ML readiness evaluation failed: {str(e)}")
@router.get("/{dataset_id}/ml-readiness")
def get_ml_readiness(dataset_id: str, db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    ds = service.get_dataset(dataset_id)
    if not ds or not ds.training_suitability:
        raise HTTPException(status_code=404, detail="Readiness spec not found")
    return ds.training_suitability

def run_ml_training_task(dataset_id: str, spec: dict, data_path: str):
    from application.ml_training import MLTrainingEngine
    from infrastructure.db import SessionLocal
    from infrastructure.dataset_orm import DatasetMetadataModel, DatasetStatus
    
    db = SessionLocal()
    try:
        engine = MLTrainingEngine(spec, data_path, "ml/models/registry")
        engine.train_and_evaluate()
        
        ds = db.query(DatasetMetadataModel).filter(DatasetMetadataModel.dataset_id == dataset_id).first()
        if ds:
            ds.status = DatasetStatus.TRAINED
            db.commit()
    except Exception as e:
        print(f"Training failed for {dataset_id}: {e}")
        ds = db.query(DatasetMetadataModel).filter(DatasetMetadataModel.dataset_id == dataset_id).first()
        if ds:
            ds.status = DatasetStatus.FAILED
            ds.error_message = str(e)
            db.commit()
    finally:
        db.close()

@router.post("/{dataset_id}/train")
def start_training(dataset_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    ds = service.get_dataset(dataset_id)
    if not ds or not ds.training_suitability:
        raise HTTPException(status_code=400, detail="Dataset must have ML Readiness spec first.")
        
    if ds.status not in [DatasetStatus.ML_READY, DatasetStatus.COMPLETED, DatasetStatus.FAILED]:
        raise HTTPException(status_code=400, detail="Dataset must be ML ready first.")
        
    spec = ds.training_suitability
    status = spec.get("readiness_status", "")
    
    # Quality Gate
    if status not in ["ML_TRAINING_READY", "ML_TRAINING_READY_WITH_EXCLUSIONS", "ML_TRAINING_READY_WITH_WARNINGS"]:
        raise HTTPException(status_code=400, detail=f"Dataset not ready for training. Status: {status}")
        
    ds.status = DatasetStatus.TRAINING
    db.commit()
    
    file_path = os.path.join(service.dataset_dir, ds.filename)
    background_tasks.add_task(run_ml_training_task, dataset_id, spec, file_path)
    return {"status": "Training initiated"}

@router.get("/{dataset_id}/models")
def list_trained_models(dataset_id: str):
    registry_dir = "ml/models/registry"
    if not os.path.exists(registry_dir):
        return []
        
    models = []
    for f in os.listdir(registry_dir):
        if f.endswith("_metadata.json"):
            try:
                with open(os.path.join(registry_dir, f), "r") as meta_f:
                    import json
                    meta = json.load(meta_f)
                    if meta.get("dataset_id") == dataset_id:
                        models.append(meta)
            except Exception:
                continue
    
    # Sort by created_at descending
    models.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return models
@router.get("/{dataset_id}/workflow-status")
def get_workflow_status(dataset_id: str, db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    ds = service.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    detected_fields = ds.recoverchain_signals or []
    
    # Required fields derived from minimum information contract
    from application.dataset_intelligence import CanonicalField
    required_fields = [
        CanonicalField.ENTITY_ID.value,  # entity/account/customer identifier
        CanonicalField.AMOUNT.value,     # amount/balance
        CanonicalField.TIMESTAMP.value,  # timestamp/date
        CanonicalField.TARGET.value      # outcome/target (or OUTCOME)
    ]
    
    detected_canonical = [f["canonical_field"] for f in detected_fields if f.get("canonical_field")]
    
    # Check what is missing (handle aliases in contract)
    missing_required_fields = []
    has_entity = any(f in detected_canonical for f in [CanonicalField.ENTITY_ID.value, CanonicalField.ACCOUNT_ID.value, CanonicalField.CUSTOMER_ID.value])
    if not has_entity: missing_required_fields.append("ENTITY_ID/ACCOUNT_ID")
        
    has_amount = any(f in detected_canonical for f in [CanonicalField.AMOUNT.value, CanonicalField.BALANCE.value])
    if not has_amount: missing_required_fields.append("AMOUNT/BALANCE")
        
    has_time = any(f in detected_canonical for f in [CanonicalField.TIMESTAMP.value, CanonicalField.SETTLEMENT_DATE.value])
    if not has_time: missing_required_fields.append("TIMESTAMP/DATE")
        
    has_target = any(f in detected_canonical for f in [CanonicalField.TARGET.value, CanonicalField.OUTCOME.value])
    if not has_target: missing_required_fields.append("TARGET/OUTCOME")
        
    quality_stats = ds.data_quality_report or {}
    leakage_warnings = ds.leakage_detection or []
    
    suitability = ds.training_suitability or {}
    target_classification = suitability.get("prediction_problem", "unknown")
    ml_readiness = suitability.get("readiness_status", "PENDING" if not suitability else "UNKNOWN")
    if not suitability and ds.status == DatasetStatus.MAPPING_REVIEW:
        ml_readiness = "AWAITING_MAPPING_REVIEW"
        
    return {
        "dataset_id": ds.dataset_id,
        "filename": ds.filename,
        "status": ds.status.value,
        "row_count": ds.row_count,
        "column_count": ds.column_count,
        "detected_canonical_fields": detected_fields,
        "required_fields": ["ENTITY_ID/ACCOUNT_ID", "AMOUNT/BALANCE", "TIMESTAMP/DATE", "TARGET/OUTCOME"],
        "missing_required_fields": missing_required_fields,
        "quality_statistics": quality_stats,
        "leakage_warnings": leakage_warnings,
        "target_classification": target_classification,
        "ml_readiness_status": ml_readiness
    }
from pydantic import BaseModel
from typing import List, Optional

class MappingOverride(BaseModel):
    original_column: str
    canonical_field: str
    action: str # "confirm", "override", "unused"

class MappingConfirmationRequest(BaseModel):
    mappings: List[MappingOverride]

@router.post("/{dataset_id}/mapping")
def confirm_dataset_mapping(dataset_id: str, req: MappingConfirmationRequest, db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    ds = service.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    profile = ds.columns_profile or []
    valid_columns = {c["column_name"] for c in profile}
    
    # Validation 1: Nonexistent columns
    for m in req.mappings:
        if m.original_column not in valid_columns:
            raise HTTPException(status_code=400, detail=f"Column {m.original_column} does not exist.")
            
    # Compile final mappings
    final_mappings = []
    canonical_used = set()
    
    leakage = ds.leakage_detection or []
    leaked_cols = {l["column"] for l in leakage}
    
    from application.dataset_intelligence import CanonicalField
    
    for m in req.mappings:
        if m.action == "unused" or m.canonical_field == CanonicalField.UNKNOWN.value:
            final_mappings.append({
                "original_column": m.original_column,
                "canonical_field": CanonicalField.UNKNOWN.value,
                "confidence": "USER_CONFIRMED",
                "mapping_reason": "User explicitly marked as unused or unknown."
            })
            continue
            
        # Validation 2: Duplicate assignments for single-use fields
        single_use = [CanonicalField.TARGET.value, CanonicalField.OUTCOME.value, CanonicalField.AMOUNT.value]
        if m.canonical_field in single_use:
            if m.canonical_field in canonical_used:
                raise HTTPException(status_code=400, detail=f"Duplicate assignment for {m.canonical_field} prohibited.")
            canonical_used.add(m.canonical_field)
            
        # Validation 3: Target mapped to post-outcome
        if m.canonical_field in [CanonicalField.TARGET.value, CanonicalField.OUTCOME.value]:
            if m.original_column in leaked_cols:
                raise HTTPException(status_code=400, detail=f"Cannot map target to leaked/post-outcome field: {m.original_column}")
                
        final_mappings.append({
            "original_column": m.original_column,
            "canonical_field": m.canonical_field,
            "confidence": "USER_CONFIRMED",
            "mapping_reason": "User confirmed override."
        })
        
    # Validation 4: LOW confidence rejection / unsafe mappings
    # Evaluate against DatasetValidator
    from application.dataset_intelligence import DatasetValidator
    validation_res = DatasetValidator.classify_dataset(final_mappings, leaked_columns=leaked_cols)
    if validation_res["classification"] in ["INSUFFICIENT", "PARTIALLY_USABLE"]:
        raise HTTPException(status_code=400, detail=f"Unsafe mappings: {validation_res['reason']}")
        
    # Validation 5: LOW confidence critical fields must be explicitly overridden?
    # If the user provides overrides, they become USER_CONFIRMED, so they are not LOW anymore.
    # We just need to make sure minimum contract is satisfied.
    
    ds.recoverchain_signals = final_mappings
    ds.status = DatasetStatus.READY_FOR_ANALYSIS
    db.commit()
    
    return {"status": "SUCCESS", "message": "Mapping confirmed.", "classification": validation_res["classification"]}

from api.schemas import DatasetPredictionRequest, DatasetPredictionResponse, GenerateCasesRequest, GenerateCasesResponse
from application.recovery_predictor_ml import MLPaymentFailurePredictor

@router.post("/{dataset_id}/predict", response_model=DatasetPredictionResponse)
def shadow_predict(dataset_id: str, request: DatasetPredictionRequest):
    predictor = MLPaymentFailurePredictor(dataset_id=dataset_id, registry_dir="ml/models/registry")
    if not predictor.model:
        raise HTTPException(status_code=404, detail="No valid model found for this dataset")
        
    try:
        res = predictor.predict_failure_risk(request.canonical_features)
        return DatasetPredictionResponse(
            probability=res.get("probability", 0.0),
            status=res.get("status", "SUCCESS"),
            model_metadata=res.get("model_metadata", {})
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
from pydantic import BaseModel
from typing import List, Optional

@router.post("/{dataset_id}/generate-cases", response_model=GenerateCasesResponse)
def generate_cases_from_dataset(dataset_id: str, req: GenerateCasesRequest, db: Session = Depends(get_db)):
    service = DatasetLabService(db)
    ds = service.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    if not ds.training_suitability or ds.training_suitability.get("readiness_status") not in ["ML_TRAINING_READY", "ML_TRAINING_READY_WITH_EXCLUSIONS", "ML_TRAINING_READY_WITH_WARNINGS"]:
        raise HTTPException(status_code=400, detail="Dataset must be ML ready to generate cases")
        
    file_path = os.path.join(service.dataset_dir, ds.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Dataset file missing")
        
    bounded_max_cases = min(max(1, req.max_cases), 500)
    import pandas as pd
    try:
        if file_path.endswith('.parquet'):
            import pyarrow.parquet as pq
            pf = pq.ParquetFile(file_path)
            df = pf.read_row_group(0).to_pandas()
            if len(df) > bounded_max_cases:
                df = df.head(bounded_max_cases)
        elif file_path.endswith('.xlsx'):
            df = pd.read_excel(file_path, nrows=bounded_max_cases)
        else:
            df = pd.read_csv(file_path, nrows=bounded_max_cases)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")
        
    # Extract mapping
    mappings = ds.recoverchain_signals or []
    canonical_to_original = {}
    for m in mappings:
        if m["canonical_field"] != "UNKNOWN":
            canonical_to_original[m["canonical_field"]] = m["original_column"]
            
    from domain.models import RevenueEvent, RiskCategory, Money
    from infrastructure.repositories import SqlAlchemyCaseRepository, SqlAlchemyAuditRecorder
    from application.case_engine import CaseEngine, DuplicateEventException
    from application.diagnosis_engine import DeterministicDiagnosisEngine
    from application.recovery_predictor_ml import MLPaymentFailurePredictor
    from application.action_evaluator import DeterministicActionEvaluator
    from application.policy_engine import DeterministicPolicyEngine
    from application.agents import AgentOrchestrator
    import uuid
    from datetime import datetime
    
    case_repo = SqlAlchemyCaseRepository(db)
    audit_repo = SqlAlchemyAuditRecorder(db)
    case_engine = CaseEngine(case_repo, audit_repo)
    diag_engine = DeterministicDiagnosisEngine()
    evaluator = DeterministicActionEvaluator()
    policy_engine = DeterministicPolicyEngine()
    agent = AgentOrchestrator()
    
    predictor = MLPaymentFailurePredictor(dataset_id=dataset_id, registry_dir="ml/models/registry")
    
    generated_ids = []
    
    counters = {
        "rows_seen": len(df),
        "rows_accepted": 0,
        "rows_skipped": 0,
        "invalid_amount": 0,
        "invalid_entity": 0,
        "invalid_timestamp": 0,
        "invalid_target": 0,
        "ambiguous_target": 0
    }
    
    for idx, row in df.iterrows():
        # Map canonical fields
        row_dict = row.to_dict()
        
        # 1. Amount validation
        amount_col = canonical_to_original.get("AMOUNT") or canonical_to_original.get("BALANCE")
        if not amount_col:
            counters["rows_skipped"] += 1
            counters["invalid_amount"] += 1
            continue
        amt_val = row_dict.get(amount_col)
        if pd.isna(amt_val):
            counters["rows_skipped"] += 1
            counters["invalid_amount"] += 1
            continue
        try:
            amt = float(amt_val)
            if amt < 0 or pd.isna(amt):
                counters["rows_skipped"] += 1
                counters["invalid_amount"] += 1
                continue
        except (ValueError, TypeError):
            counters["rows_skipped"] += 1
            counters["invalid_amount"] += 1
            continue
            
        # 2. Target/Outcome validation
        target_col = canonical_to_original.get("TARGET") or canonical_to_original.get("OUTCOME")
        if not target_col:
            counters["rows_skipped"] += 1
            counters["invalid_target"] += 1
            continue
        val = row_dict.get(target_col)
        if pd.isna(val):
            counters["rows_skipped"] += 1
            counters["invalid_target"] += 1
            continue
            
        val_str = str(val).strip().lower()
        if val_str in ["0", "false", "no", "success", "paid", "settled", "completed"]:
            is_failed = False
        elif val_str in ["1", "true", "yes", "failed", "unpaid", "returned", "declined", "error", "insufficient_funds"]:
            is_failed = True
        else:
            counters["rows_skipped"] += 1
            counters["ambiguous_target"] += 1
            continue
            
        if not is_failed:
            counters["rows_skipped"] += 1
            continue
            
        # 3. Entity identifier validation
        entity_col = canonical_to_original.get("ENTITY_ID") or canonical_to_original.get("CUSTOMER_ID") or canonical_to_original.get("ACCOUNT_ID")
        if not entity_col:
            counters["rows_skipped"] += 1
            counters["invalid_entity"] += 1
            continue
        customer_id = row_dict.get(entity_col)
        if pd.isna(customer_id) or not str(customer_id).strip():
            counters["rows_skipped"] += 1
            counters["invalid_entity"] += 1
            continue
        customer_id = str(customer_id).strip()
        
        # 4. Timestamp validation
        time_col = canonical_to_original.get("TIMESTAMP")
        if not time_col:
            counters["rows_skipped"] += 1
            counters["invalid_timestamp"] += 1
            continue
        ts_val = row_dict.get(time_col)
        if not ts_val or pd.isna(ts_val):
            counters["rows_skipped"] += 1
            counters["invalid_timestamp"] += 1
            continue
        try:
            from dateutil.parser import parse
            ts = parse(str(ts_val))
            from datetime import timezone
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        except:
            counters["rows_skipped"] += 1
            counters["invalid_timestamp"] += 1
            continue
            
        tx_col = canonical_to_original.get("TRANSACTION_ID")
        tx_id = str(row_dict.get(tx_col, f"tx_{idx}")) if tx_col else f"tx_{idx}"
        
        event = RevenueEvent(
            event_id=f"evt_{uuid.uuid4().hex[:8]}",
            customer_id=customer_id,
            risk_category=RiskCategory.FAILED_PAYMENT,
            external_system=f"Dataset-{dataset_id}",
            external_event_id=f"row_{idx}",
            reference_id=tx_id,
            amount=Money(amount=amt, currency="USD"),
            timestamp=ts,
            raw_payload=row_dict
        )
        
        try:
            case, is_new = case_engine.ingest_normalized_event(event)
        except DuplicateEventException:
            counters["rows_skipped"] += 1
            continue
            
        # Diagnosis
        case.diagnosis = diag_engine.diagnose(case)
        case_repo.save(case)
        
        # ML Shadow Risk
        if predictor.model:
            # Strictly isolate features: only pass approved canonical features and feature_columns, excluding all leakage
            leaked_cols = {l["column"] for l in (ds.leakage_detection or [])}
            canonical_features = {}
            for can, orig in canonical_to_original.items():
                if orig not in leaked_cols:
                    canonical_features[can] = row_dict.get(orig)
                    canonical_features[orig] = row_dict.get(orig)
            active_features = predictor.features or (ds.training_suitability or {}).get("feature_columns", [])
            for feat_col in active_features:
                if feat_col not in leaked_cols and feat_col in row_dict:
                    canonical_features[feat_col] = row_dict.get(feat_col)
            
            try:
                pred_res = predictor.predict_failure_risk(canonical_features)
                failure_prob = pred_res.get("probability", 0.0)
                from domain.models import RecoveryPrediction
                case.prediction = RecoveryPrediction(
                    prediction_id=f"pred_{uuid.uuid4().hex[:8]}",
                    recovery_probability=1.0 - failure_prob,
                    confidence=1.0,
                    model_version=pred_res.get("model_metadata", {}).get("model_version", "unknown"),
                    feature_version="v1",
                    contributing_features=canonical_features,
                    prediction_status="SHADOW_ONLY"
                )
                case_repo.save(case)
            except (ValueError, Exception):
                pass
                
        # Recommendation
        case.recommendation = evaluator.evaluate(case)
        if case.recommendation and case.recommendation.top_candidate:
            case.candidate_action = case.recommendation.top_candidate
            case.expected_recoverable_value = Money(amount=case.candidate_action.expected_recoverable_value, currency="USD")
        case_repo.save(case)
        
        # Policy Engine
        if case.candidate_action:
            try:
                _pctx = case_repo.get_policy_context(case.case_id)
            except Exception:
                _pctx = None
            case.policy_decision = policy_engine.evaluate(case, context=_pctx)
            case_repo.save(case)
            
            # Sandbox Execution
            from domain.models import PolicyDecisionStatus
            if case.policy_decision.status == PolicyDecisionStatus.PERMITTED:
                case.execution_record = agent.execute(case, case.candidate_action.action_type, repo=case_repo)
                case_repo.save(case)
                
        # Verification (Mock)
        if case.execution_record:
            from application.verification_engine import VerificationEngine
            v_engine = VerificationEngine()
            case.outcome = v_engine.reconcile(case, external_reference=case.execution_record.execution_id)
            case_repo.save(case)

        if case.case_id not in generated_ids:
            generated_ids.append(case.case_id)
            counters["rows_accepted"] += 1
            
    return {
        "status": "SUCCESS",
        "cases_generated": len(generated_ids),
        "case_ids": generated_ids,
        "counters": counters
    }