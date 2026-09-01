import os
import re
import json
from typing import List, Dict, Any, Optional
from decimal import Decimal
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from infrastructure.db import get_db
from infrastructure.orm import CaseModel, EventModel, AuditModel, IdempotencyRecord
from infrastructure.dataset_orm import DatasetMetadataModel, DatasetStatus

router = APIRouter(prefix="/system", tags=["System Observability"])

# ----------------------------------------------------------------------
# Response Schemas (Read-Only)
# ----------------------------------------------------------------------

class HealthStatusResponse(BaseModel):
    status: str
    timestamp: str
    database: Dict[str, Any]
    ml_subsystem: Dict[str, Any]
    policy_engine: Dict[str, Any]
    execution_engine: Dict[str, Any]

class SystemSummaryResponse(BaseModel):
    datasets_count: int
    cases_count: int
    revenue_events_count: int
    models_count: int
    policy_decisions_count: int
    executions_count: int
    audit_records_count: int
    idempotency_records_count: int
    outcomes_count: int
    availability: Dict[str, str]

class DatasetItemResponse(BaseModel):
    dataset_id: str
    name: str
    filename: str
    file_type: str
    file_size_bytes: int
    status: str
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    upload_timestamp: Optional[str] = None

class DatasetListResponse(BaseModel):
    total_count: int
    limit: int
    offset: int
    items: List[DatasetItemResponse]

class DatasetDetailResponse(BaseModel):
    dataset_id: str
    name: str
    filename: str
    file_type: str
    file_size_bytes: int
    status: str
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    upload_timestamp: Optional[str] = None
    error_message: Optional[str] = None
    profile_summary: Optional[Dict[str, Any]] = None
    semantic_mappings: Optional[List[Dict[str, Any]]] = None
    data_quality_report: Optional[Dict[str, Any]] = None
    training_suitability: Optional[Dict[str, Any]] = None
    leakage_detection: Optional[List[Dict[str, Any]]] = None
    associated_models_count: int = 0
    associated_cases_count: int = 0

class CaseSummaryItem(BaseModel):
    case_id: str
    customer_id: str
    risk_category: str
    reference_id: Optional[str] = None
    amount_at_risk: float
    currency: str
    current_state: str
    risk_level: Optional[str] = None
    cause_category: Optional[str] = None
    recovery_probability: Optional[float] = None
    prediction_status: Optional[str] = None
    policy_decision: Optional[str] = None
    execution_status: Optional[str] = None
    outcome_status: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class CaseListResponse(BaseModel):
    total_count: int
    limit: int
    offset: int
    items: List[CaseSummaryItem]

class CaseDetailSnapshotResponse(BaseModel):
    case_id: str
    customer_id: str
    risk_category: str
    reference_id: Optional[str] = None
    amount_at_risk: float
    expected_recoverable_value: Optional[float] = None
    currency: str
    current_state: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    data_events: List[Dict[str, Any]]
    risk_assessment: Optional[Dict[str, Any]] = None
    diagnosis: Optional[Dict[str, Any]] = None
    ml_shadow_prediction: Optional[Dict[str, Any]] = None
    recommendation: Optional[Dict[str, Any]] = None
    policy_decision: Optional[Dict[str, Any]] = None
    execution_record: Optional[Dict[str, Any]] = None
    outcome: Optional[Dict[str, Any]] = None
    audit_history: List[Dict[str, Any]]

class ModelRegistryItem(BaseModel):
    model_id: str
    dataset_id: Optional[str] = None
    task: str
    algorithm: str
    model_version: str
    created_at: Optional[str] = None
    feature_columns: List[str] = Field(default_factory=list)
    target_column: Optional[str] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    status: str

class ModelListResponse(BaseModel):
    total_count: int
    items: List[ModelRegistryItem]

class RevenueEventItem(BaseModel):
    event_id: str
    case_id: str
    customer_id: str
    external_system: str
    external_event_id: str
    reference_id: Optional[str] = None
    risk_category: str
    amount: float
    currency: str
    timestamp: str

class EventListResponse(BaseModel):
    total_count: int
    limit: int
    offset: int
    items: List[RevenueEventItem]

class PolicyRecordItem(BaseModel):
    case_id: str
    customer_id: str
    decision_status: str
    policy_version: Optional[str] = None
    reason: Optional[str] = None
    candidate_action: Optional[str] = None
    rules_evaluated_count: int = 0
    failed_rules_count: int = 0
    timestamp: Optional[str] = None

class PolicyListResponse(BaseModel):
    total_count: int
    limit: int
    offset: int
    items: List[PolicyRecordItem]

class ExecutionRecordItem(BaseModel):
    case_id: str
    execution_id: Optional[str] = None
    action_type: Optional[str] = None
    agent_type: Optional[str] = None
    execution_mode: str = "SIMULATED/SANDBOX"
    status: str
    adapter_used: Optional[str] = None
    timestamp: Optional[str] = None

class ExecutionListResponse(BaseModel):
    total_count: int
    limit: int
    offset: int
    items: List[ExecutionRecordItem]

class AuditRecordItem(BaseModel):
    audit_id: str
    case_id: Optional[str] = None
    from_state: Optional[str] = None
    to_state: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None

class AuditListResponse(BaseModel):
    total_count: int
    limit: int
    offset: int
    items: List[AuditRecordItem]

# ----------------------------------------------------------------------
# Helper Functions
# ----------------------------------------------------------------------

def _get_model_registry_dir() -> str:
    candidates = [
        os.path.join(os.getcwd(), "ml", "models", "registry"),
        os.path.join(os.getcwd(), "backend", "ml", "models", "registry"),
        os.path.join(os.path.dirname(__file__), "..", "ml", "models", "registry")
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
    return candidates[0]

def _read_model_metadata_files() -> List[Dict[str, Any]]:
    reg_dir = _get_model_registry_dir()
    if not os.path.exists(reg_dir):
        return []
    
    models = []
    for fname in os.listdir(reg_dir):
        if fname.endswith("_metadata.json"):
            try:
                fpath = os.path.join(reg_dir, fname)
                with open(fpath, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    models.append(meta)
            except Exception:
                continue
    models.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return models

# ----------------------------------------------------------------------
# Endpoints (Read-Only)
# ----------------------------------------------------------------------

@router.get("/health", response_model=HealthStatusResponse)
def get_system_health(db: Session = Depends(get_db)):
    """Safe read-only system health and subsystem telemetry."""
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return HealthStatusResponse(
        status="HEALTHY" if db_ok else "DEGRADED",
        timestamp=datetime.now(timezone.utc).isoformat(),
        database={
            "connected": db_ok,
            "dialect": db.bind.dialect.name if hasattr(db, "bind") and db.bind else "sqlite"
        },
        ml_subsystem={
            "mode": "SHADOW_ONLY",
            "status": "ACTIVE",
            "authority": "ADVISORY_TELEMETRY_ONLY"
        },
        policy_engine={
            "authority": "DETERMINISTIC_AUTHORITY",
            "status": "ACTIVE",
            "execution_gate": "ENFORCED"
        },
        execution_engine={
            "mode": "SIMULATED_SANDBOX",
            "adapter": "MockExecutionAdapter",
            "live_gateways_connected": False
        }
    )

@router.get("/summary", response_model=SystemSummaryResponse)
def get_system_summary(db: Session = Depends(get_db)):
    """Aggregate counts of persisted domain entities."""
    datasets_cnt = db.query(func.count(DatasetMetadataModel.dataset_id)).scalar() or 0
    cases_cnt = db.query(func.count(CaseModel.case_id)).scalar() or 0
    events_cnt = db.query(func.count(EventModel.event_id)).scalar() or 0
    audits_cnt = db.query(func.count(AuditModel.id)).scalar() or 0
    idemp_cnt = db.query(func.count(IdempotencyRecord.idempotency_key)).scalar() or 0
    
    # Counts of JSON-persisted lifecycle milestones
    policy_cnt = db.query(func.count(CaseModel.case_id)).filter(CaseModel.policy_decision.isnot(None)).scalar() or 0
    exec_cnt = db.query(func.count(CaseModel.case_id)).filter(CaseModel.execution_record.isnot(None)).scalar() or 0
    outcome_cnt = db.query(func.count(CaseModel.case_id)).filter(CaseModel.outcome.isnot(None)).scalar() or 0

    # Model registry count from filesystem
    models = _read_model_metadata_files()

    return SystemSummaryResponse(
        datasets_count=datasets_cnt,
        cases_count=cases_cnt,
        revenue_events_count=events_cnt,
        models_count=len(models),
        policy_decisions_count=policy_cnt,
        executions_count=exec_cnt,
        audit_records_count=audits_cnt,
        idempotency_records_count=idemp_cnt,
        outcomes_count=outcome_cnt,
        availability={
            "datasets": "AVAILABLE",
            "cases": "AVAILABLE",
            "revenue_events": "AVAILABLE",
            "models": "AVAILABLE",
            "policy_decisions": "AVAILABLE",
            "executions": "AVAILABLE",
            "audit_records": "AVAILABLE",
            "idempotency_records": "AVAILABLE"
        }
    )

@router.get("/datasets", response_model=DatasetListResponse)
def list_system_datasets(
    limit: int = Query(50, ge=1, le=100, description="Max items to return (1-100)"),
    offset: int = Query(0, ge=0, description="Items to skip"),
    db: Session = Depends(get_db)
):
    """Bounded listing of persisted datasets with safe metadata."""
    total = db.query(func.count(DatasetMetadataModel.dataset_id)).scalar() or 0
    ds_records = db.query(DatasetMetadataModel).order_by(
        DatasetMetadataModel.upload_timestamp.desc()
    ).offset(offset).limit(limit).all()

    items = []
    for d in ds_records:
        items.append(DatasetItemResponse(
            dataset_id=d.dataset_id,
            name=d.name,
            filename=d.filename,
            file_type=d.file_type,
            file_size_bytes=d.file_size_bytes,
            status=d.status.value if hasattr(d.status, "value") else str(d.status),
            row_count=d.row_count,
            column_count=d.column_count,
            upload_timestamp=d.upload_timestamp.isoformat() if d.upload_timestamp else None
        ))

    return DatasetListResponse(
        total_count=total,
        limit=limit,
        offset=offset,
        items=items
    )

@router.get("/datasets/{dataset_id}", response_model=DatasetDetailResponse)
def get_system_dataset_detail(dataset_id: str, db: Session = Depends(get_db)):
    """Safe detailed inspection of a single dataset without exposing raw files."""
    if not re.match(r'^[a-zA-Z0-9_-]+$', dataset_id):
        raise HTTPException(status_code=400, detail="Invalid dataset ID format")

    ds = db.query(DatasetMetadataModel).filter(DatasetMetadataModel.dataset_id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Associated models count
    models = _read_model_metadata_files()
    assoc_models = [m for m in models if m.get("dataset_id") == dataset_id]

    # Associated cases count (via linked revenue event external system matching)
    assoc_cases_cnt = db.query(func.count(EventModel.case_id.distinct())).filter(
        EventModel.external_system == f"Dataset-{dataset_id}"
    ).scalar() or 0

    return DatasetDetailResponse(
        dataset_id=ds.dataset_id,
        name=ds.name,
        filename=ds.filename,
        file_type=ds.file_type,
        file_size_bytes=ds.file_size_bytes,
        status=ds.status.value if hasattr(ds.status, "value") else str(ds.status),
        row_count=ds.row_count,
        column_count=ds.column_count,
        upload_timestamp=ds.upload_timestamp.isoformat() if ds.upload_timestamp else None,
        error_message=ds.error_message,
        profile_summary=ds.columns_profile,
        semantic_mappings=ds.recoverchain_signals,
        data_quality_report=ds.data_quality_report,
        training_suitability=ds.training_suitability,
        leakage_detection=ds.leakage_detection,
        associated_models_count=len(assoc_models),
        associated_cases_count=assoc_cases_cnt
    )

@router.get("/cases", response_model=CaseListResponse)
def list_system_cases(
    limit: int = Query(50, ge=1, le=100, description="Max items to return (1-100)"),
    offset: int = Query(0, ge=0, description="Items to skip"),
    risk_category: Optional[str] = Query(None, description="Optional category filter"),
    db: Session = Depends(get_db)
):
    """Bounded listing of persisted recovery cases with stored lifecycle fields."""
    query = db.query(CaseModel)
    if risk_category:
        query = query.filter(CaseModel.risk_category == risk_category)

    total = query.count()
    cases = query.order_by(CaseModel.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for c in cases:
        pol_status = None
        if c.policy_decision:
            pol_status = c.policy_decision.get("status")

        exec_status = None
        if c.execution_record:
            exec_status = c.execution_record.get("status")

        out_status = None
        if c.outcome:
            out_status = c.outcome.get("status")

        pred_prob = None
        pred_status = None
        if c.prediction:
            pred_prob = c.prediction.get("recovery_probability")
            pred_status = c.prediction.get("prediction_status", "SHADOW_ONLY")

        risk_lvl = None
        if c.risk_assessment:
            risk_lvl = c.risk_assessment.get("risk_level")

        diag_cat = None
        if c.diagnosis:
            diag_cat = c.diagnosis.get("cause_category")

        items.append(CaseSummaryItem(
            case_id=c.case_id,
            customer_id=c.customer_id,
            risk_category=c.risk_category.value if hasattr(c.risk_category, "value") else str(c.risk_category),
            reference_id=c.reference_id,
            amount_at_risk=float(c.amount_at_risk) if c.amount_at_risk is not None else 0.0,
            currency=c.currency,
            current_state=c.current_state.value if hasattr(c.current_state, "value") else str(c.current_state),
            risk_level=risk_lvl,
            cause_category=diag_cat,
            recovery_probability=pred_prob,
            prediction_status=pred_status,
            policy_decision=pol_status,
            execution_status=exec_status,
            outcome_status=out_status,
            created_at=c.created_at.isoformat() if c.created_at else None,
            updated_at=c.updated_at.isoformat() if c.updated_at else None
        ))

    return CaseListResponse(
        total_count=total,
        limit=limit,
        offset=offset,
        items=items
    )

@router.get("/cases.csv")
def export_cases_csv(
    risk_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """M2 — download every recovery case as a flat CSV (one row per case)."""
    import csv, io
    from fastapi.responses import StreamingResponse

    q = db.query(CaseModel)
    if risk_category:
        q = q.filter(CaseModel.risk_category == risk_category)

    cols = ["case_id", "customer_id", "risk_category", "reference_id", "amount_at_risk",
            "currency", "current_state", "risk_level", "cause_category",
            "recovery_probability", "prediction_status", "recommended_action",
            "expected_recoverable_value", "policy_status", "execution_status",
            "outcome_status", "actual_amount_recovered", "created_at"]

    def _g(blob, *path):
        for p in path:
            blob = (blob or {}).get(p) if isinstance(blob, dict) else None
        return blob

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for c in q.order_by(CaseModel.created_at.desc()).all():
        rec_amt = _g(c.outcome, "actual_amount_recovered")
        if isinstance(rec_amt, dict):
            rec_amt = rec_amt.get("amount")
        w.writerow([
            c.case_id, c.customer_id,
            c.risk_category.value if hasattr(c.risk_category, "value") else c.risk_category,
            c.reference_id,
            float(c.amount_at_risk) if c.amount_at_risk is not None else "",
            c.currency,
            c.current_state.value if hasattr(c.current_state, "value") else c.current_state,
            _g(c.risk_assessment, "risk_level"),
            _g(c.diagnosis, "cause_category"),
            _g(c.prediction, "recovery_probability"),
            _g(c.prediction, "prediction_status"),
            _g(c.recommendation, "top_candidate", "action_type"),
            float(c.expected_recoverable_value) if c.expected_recoverable_value is not None else "",
            _g(c.policy_decision, "status"),
            _g(c.execution_record, "status"),
            _g(c.outcome, "status"),
            rec_amt if rec_amt is not None else "",
            c.created_at.isoformat() if c.created_at else "",
        ])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="recoverchain_cases.csv"'})


@router.get("/cases/{case_id}", response_model=CaseDetailSnapshotResponse)
def get_system_case_detail(case_id: str, db: Session = Depends(get_db)):
    """Complete safe 7-stage lifecycle snapshot for a single case."""
    if not re.match(r'^[a-zA-Z0-9_-]+$', case_id):
        raise HTTPException(status_code=400, detail="Invalid case ID format")

    case = db.query(CaseModel).filter(CaseModel.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Safe events
    events_data = []
    for e in case.events:
        events_data.append({
            "event_id": e.event_id,
            "external_system": e.external_system,
            "external_event_id": e.external_event_id,
            "reference_id": e.reference_id,
            "amount": float(e.amount),
            "currency": e.currency,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None
        })

    # Safe audits
    audits_data = []
    for a in case.audits:
        audits_data.append({
            "audit_id": a.id,
            "from_state": a.from_state,
            "to_state": a.to_state,
            "evidence": a.evidence,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None
        })

    return CaseDetailSnapshotResponse(
        case_id=case.case_id,
        customer_id=case.customer_id,
        risk_category=case.risk_category.value if hasattr(case.risk_category, "value") else str(case.risk_category),
        reference_id=case.reference_id,
        amount_at_risk=float(case.amount_at_risk) if case.amount_at_risk is not None else 0.0,
        expected_recoverable_value=float(case.expected_recoverable_value) if case.expected_recoverable_value is not None else None,
        currency=case.currency,
        current_state=case.current_state.value if hasattr(case.current_state, "value") else str(case.current_state),
        created_at=case.created_at.isoformat() if case.created_at else None,
        updated_at=case.updated_at.isoformat() if case.updated_at else None,
        data_events=events_data,
        risk_assessment=case.risk_assessment,
        diagnosis=case.diagnosis,
        ml_shadow_prediction=case.prediction,
        recommendation=case.recommendation,
        policy_decision=case.policy_decision,
        execution_record=case.execution_record,
        outcome=case.outcome,
        audit_history=audits_data
    )

@router.get("/models", response_model=ModelListResponse)
def list_system_models(
    dataset_id: Optional[str] = Query(None, description="Optional dataset ID filter")
):
    """Safe listing of trained model registry metadata without exposing binaries."""
    raw_models = _read_model_metadata_files()
    if dataset_id:
        raw_models = [m for m in raw_models if m.get("dataset_id") == dataset_id]

    items = []
    for m in raw_models:
        metrics = m.get("final_test_metrics") or m.get("test_metrics") or {}
        items.append(ModelRegistryItem(
            model_id=m.get("model_id") or m.get("model_version", "unknown"),
            dataset_id=m.get("dataset_id"),
            task=m.get("task", "payment-failure-risk"),
            algorithm=m.get("algorithm", "XGBoostClassifier"),
            model_version=m.get("model_version", "1.0.0"),
            created_at=m.get("created_at"),
            feature_columns=m.get("feature_columns", []),
            target_column=m.get("target_column"),
            metrics=metrics,
            status=m.get("status", "TRAINED")
        ))

    return ModelListResponse(
        total_count=len(items),
        items=items
    )

@router.get("/events", response_model=EventListResponse)
def list_system_events(
    limit: int = Query(50, ge=1, le=100, description="Max items to return (1-100)"),
    offset: int = Query(0, ge=0, description="Items to skip"),
    case_id: Optional[str] = Query(None, description="Optional case ID filter"),
    db: Session = Depends(get_db)
):
    """Bounded listing of persisted revenue events."""
    query = db.query(EventModel)
    if case_id:
        query = query.filter(EventModel.case_id == case_id)

    total = query.count()
    events = query.order_by(EventModel.timestamp.desc()).offset(offset).limit(limit).all()

    items = []
    for e in events:
        items.append(RevenueEventItem(
            event_id=e.event_id,
            case_id=e.case_id,
            customer_id=e.customer_id,
            external_system=e.external_system,
            external_event_id=e.external_event_id,
            reference_id=e.reference_id,
            risk_category=e.risk_category.value if hasattr(e.risk_category, "value") else str(e.risk_category),
            amount=float(e.amount),
            currency=e.currency,
            timestamp=e.timestamp.isoformat() if e.timestamp else ""
        ))

    return EventListResponse(
        total_count=total,
        limit=limit,
        offset=offset,
        items=items
    )

@router.get("/policy", response_model=PolicyListResponse)
def list_system_policy_decisions(
    limit: int = Query(50, ge=1, le=100, description="Max items to return (1-100)"),
    offset: int = Query(0, ge=0, description="Items to skip"),
    db: Session = Depends(get_db)
):
    """Bounded listing of persisted policy decision records."""
    query = db.query(CaseModel).filter(CaseModel.policy_decision.isnot(None))
    total = query.count()
    cases = query.order_by(CaseModel.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for c in cases:
        pol = c.policy_decision or {}
        items.append(PolicyRecordItem(
            case_id=c.case_id,
            customer_id=c.customer_id,
            decision_status=pol.get("status", "UNKNOWN"),
            policy_version=pol.get("policy_version"),
            reason=pol.get("reason"),
            candidate_action=((c.recommendation or {}).get("top_candidate") or {}).get("action_type"),
            rules_evaluated_count=len(pol.get("rules_evaluated", [])),
            failed_rules_count=len(pol.get("failed_rules", [])),
            timestamp=pol.get("timestamp")
        ))

    return PolicyListResponse(
        total_count=total,
        limit=limit,
        offset=offset,
        items=items
    )

@router.get("/executions", response_model=ExecutionListResponse)
def list_system_executions(
    limit: int = Query(50, ge=1, le=100, description="Max items to return (1-100)"),
    offset: int = Query(0, ge=0, description="Items to skip"),
    db: Session = Depends(get_db)
):
    """Bounded listing of simulated execution records."""
    query = db.query(CaseModel).filter(CaseModel.execution_record.isnot(None))
    total = query.count()
    cases = query.order_by(CaseModel.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for c in cases:
        ex = c.execution_record or {}
        items.append(ExecutionRecordItem(
            case_id=c.case_id,
            execution_id=ex.get("execution_id"),
            action_type=ex.get("action_type"),
            agent_type=ex.get("agent_type"),
            execution_mode="SIMULATED/SANDBOX",
            status=ex.get("status", "UNKNOWN"),
            adapter_used=ex.get("adapter_used", "MockExecutionAdapter"),
            timestamp=ex.get("timestamp")
        ))

    return ExecutionListResponse(
        total_count=total,
        limit=limit,
        offset=offset,
        items=items
    )

@router.get("/audit", response_model=AuditListResponse)
def list_system_audit_records(
    limit: int = Query(50, ge=1, le=100, description="Max items to return (1-100)"),
    offset: int = Query(0, ge=0, description="Items to skip"),
    case_id: Optional[str] = Query(None, description="Optional case ID filter"),
    db: Session = Depends(get_db)
):
    """Bounded listing of audit trail records."""
    query = db.query(AuditModel)
    if case_id:
        query = query.filter(AuditModel.case_id == case_id)

    total = query.count()
    audits = query.order_by(AuditModel.timestamp.desc()).offset(offset).limit(limit).all()

    items = []
    for a in audits:
        items.append(AuditRecordItem(
            audit_id=a.id,
            case_id=a.case_id,
            from_state=a.from_state,
            to_state=a.to_state,
            evidence=a.evidence,
            timestamp=a.timestamp.isoformat() if a.timestamp else None
        ))

    return AuditListResponse(
        total_count=total,
        limit=limit,
        offset=offset,
        items=items
    )
