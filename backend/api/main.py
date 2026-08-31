from typing import Optional
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import status
import os

from api.auth import verify_api_key

from sqlalchemy.orm import Session
from sqlalchemy import text, func
from infrastructure.db import get_db, engine, Base
from infrastructure.redis_client import get_redis_client
from infrastructure.repositories import SqlAlchemyCaseRepository, SqlAlchemyAuditRecorder
from application.case_engine import CaseEngine, DuplicateEventException
from domain.models import RevenueEvent, Money, CaseState
from api.schemas import IngestEventRequest, IngestEventResponse, CaseResponse, AuditResponse, RiskAssessmentResponse, DiagnosisResponse, RecoveryPredictionResponse, ActionRecommendationResponse, PolicyDecisionResponse, ExecutionRecordResponse, RecoveryOutcomeResponse, VerifyOutcomeRequest, DashboardMetricsResponse, BatchIngestRequest, BatchIngestItemResult, BatchIngestResponse, AdvanceCaseResponse

# ... (skipping to line 75) ...
# I will use replace_file_content separately for the APIs and CaseResponse mapping.
from infrastructure.orm import AuditModel, EventModel
from infrastructure.dataset_orm import DatasetMetadataModel
import uuid
from datetime import datetime, timezone
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Auto-create tables only for local SQLite dev/test. For Postgres (and any other
# engine) the schema is owned by Alembic migrations: run `alembic upgrade head`.
# Override with AUTO_CREATE_TABLES=1 if you really need create_all elsewhere.
if engine.dialect.name == "sqlite" or os.getenv("AUTO_CREATE_TABLES") == "1":
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="RecoverChain AI Core API", version="0.2.0")

_cors_origins = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _cors_origins == "*" else [o.strip() for o in _cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request, call_next):
    import time as _t
    rid = uuid.uuid4().hex[:12]
    start = _t.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("request_error rid=%s %s %s", rid, request.method, request.url.path)
        raise
    dur_ms = round((_t.perf_counter() - start) * 1000, 1)
    logger.info("request rid=%s %s %s -> %s %sms",
                rid, request.method, request.url.path, response.status_code, dur_ms)
    response.headers["X-Request-ID"] = rid
    return response

from api.dataset_router import router as dataset_router
from api.system_router import router as system_router
app.include_router(dataset_router)
app.include_router(system_router)

def get_case_engine(db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    return CaseEngine(repository=repo, audit_recorder=audit)

@app.post("/events", response_model=IngestEventResponse)
def ingest_event(request: IngestEventRequest, engine: CaseEngine = Depends(get_case_engine), api_key: str = Depends(verify_api_key)):
    # Normalize event
    event = RevenueEvent(
        event_id=f"evt_{uuid.uuid4().hex[:8]}",
        customer_id=request.customer_id,
        risk_category=request.risk_category,
        external_system=request.external_system,
        external_event_id=request.external_event_id,
        reference_id=request.reference_id,
        amount=Money(amount=request.amount, currency=request.currency),
        timestamp=datetime.now(timezone.utc),
        raw_payload=request.raw_payload
    )
    
    try:
        case, is_new = engine.ingest_normalized_event(event)
        return IngestEventResponse(
            case_id=case.case_id,
            is_new_case=is_new,
            status="success",
            message="Event ingested successfully"
        )
    except DuplicateEventException as e:
        # Idempotent return or 409 Conflict. A 200 with duplicate message is fine for idempotency
        return IngestEventResponse(
            case_id="N/A",
            is_new_case=False,
            status="ignored",
            message=str(e)
        )
    except Exception as e:
        logger.error(f"Failed to ingest event: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during ingestion")


@app.post("/events/batch", response_model=BatchIngestResponse)
def ingest_events_batch(request: BatchIngestRequest, db: Session = Depends(get_db), api_key: str = Depends(verify_api_key)):
    """Ingest many events in one call; optionally run the deterministic pipeline
    (assess -> diagnose -> predict -> recommend -> policy) on each new/affected case."""
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    engine = CaseEngine(repository=repo, audit_recorder=audit)
    from application.case_pipeline import CasePipelineService
    pipeline = CasePipelineService(repo, audit)

    results: list[BatchIngestItemResult] = []
    ingested = duplicates = failed = 0

    for item in request.events:
        event = RevenueEvent(
            event_id=f"evt_{uuid.uuid4().hex[:8]}",
            customer_id=item.customer_id,
            risk_category=item.risk_category,
            external_system=item.external_system,
            external_event_id=item.external_event_id,
            reference_id=item.reference_id,
            amount=Money(amount=item.amount, currency=item.currency),
            timestamp=datetime.now(timezone.utc),
            raw_payload=item.raw_payload,
        )
        try:
            case, is_new = engine.ingest_normalized_event(event)
        except DuplicateEventException as e:
            duplicates += 1
            results.append(BatchIngestItemResult(external_event_id=item.external_event_id, status="ignored", message=str(e)))
            continue
        except Exception as e:
            failed += 1
            logger.error(f"batch ingest failed for {item.external_event_id}: {e}")
            results.append(BatchIngestItemResult(external_event_id=item.external_event_id, status="error", message=str(e)))
            continue

        ingested += 1
        pol_status = None
        if request.auto_advance:
            try:
                case = pipeline.advance(case)
                pol_status = case.policy_decision.status.value if case.policy_decision else None
            except Exception as e:
                logger.error(f"pipeline advance failed for {case.case_id}: {e}")
        results.append(BatchIngestItemResult(
            external_event_id=item.external_event_id,
            case_id=case.case_id,
            is_new_case=is_new,
            status="success",
            current_state=case.current_state.value if hasattr(case.current_state, "value") else str(case.current_state),
            policy_status=pol_status,
            message="ingested" + (" + advanced" if request.auto_advance else ""),
        ))

    return BatchIngestResponse(
        submitted=len(request.events), ingested=ingested, duplicates=duplicates, failed=failed, results=results
    )


@app.post("/cases/{case_id}/advance", response_model=AdvanceCaseResponse)
def advance_case(case_id: str, dataset_id: Optional[str] = None, db: Session = Depends(get_db), api_key: str = Depends(verify_api_key)):
    """Run the full deterministic pipeline on an existing case in one call."""
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    from application.case_pipeline import CasePipelineService
    case = CasePipelineService(repo, audit).advance(case, dataset_id=dataset_id)

    return AdvanceCaseResponse(
        case_id=case.case_id,
        current_state=case.current_state.value if hasattr(case.current_state, "value") else str(case.current_state),
        risk_level=case.risk_assessment.risk_level if case.risk_assessment else None,
        cause_category=case.diagnosis.cause_category if case.diagnosis else None,
        recovery_probability=case.prediction.recovery_probability if case.prediction else None,
        prediction_status=case.prediction.prediction_status if case.prediction else None,
        recommended_action=(case.recommendation.top_candidate.action_type
                            if case.recommendation and case.recommendation.top_candidate else None),
        expected_recoverable_value=(case.expected_recoverable_value.amount
                                    if case.expected_recoverable_value else None),
        policy_status=case.policy_decision.status.value if case.policy_decision else None,
        policy_reason=case.policy_decision.reason if case.policy_decision else None,
    )


@app.post("/cases/{case_id}/stop")
def stop_case(case_id: str, reason: str = "manual_stop", db: Session = Depends(get_db), api_key: str = Depends(verify_api_key)):
    """Halt all automated recovery on a case (customer opt-out, dispute, manual hold)."""
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    old = case.current_state.value if hasattr(case.current_state, "value") else str(case.current_state)
    case.current_state = CaseState.STOPPED
    audit.log_transition(case_id=case.case_id, from_state=old, to_state=CaseState.STOPPED.value,
                         evidence={"action": "stop", "reason": reason})
    repo.save(case)
    return {"status": "success", "case_id": case_id, "current_state": "STOPPED", "reason": reason}


@app.get("/cases/{case_id}", response_model=CaseResponse)
def get_case(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    return CaseResponse(
        case_id=case.case_id,
        customer_id=case.customer_id,
        risk_category=case.risk_category,
        amount_at_risk=case.amount_at_risk.amount,
        currency=case.amount_at_risk.currency,
        current_state=case.current_state,
        event_count=len(case.linked_events),
        risk_level=case.risk_assessment.risk_level if case.risk_assessment else None,
        cause_category=case.diagnosis.cause_category if case.diagnosis else None,
        recovery_probability=case.prediction.recovery_probability if case.prediction else None,
        expected_recoverable_value=case.expected_recoverable_value.amount if hasattr(case, 'expected_recoverable_value') and case.expected_recoverable_value else None,
        recommended_action=case.recommendation.top_candidate.action_type if case.recommendation and case.recommendation.top_candidate else None,
        policy_status=case.policy_decision.status.value if case.policy_decision else None,
        execution_status=case.execution_record.status.value if hasattr(case, 'execution_record') and case.execution_record else None,
        outcome_status=case.outcome.status.value if hasattr(case, 'outcome') and case.outcome else None,
        actual_amount_recovered=case.outcome.actual_amount_recovered.amount if hasattr(case, 'outcome') and case.outcome else None
    )

@app.get("/cases/{case_id}/events")
def get_case_events(case_id: str, db: Session = Depends(get_db)):
    events = db.query(EventModel).filter(EventModel.case_id == case_id).all()
    return [{"event_id": e.event_id, "amount": e.amount, "external_id": e.external_event_id} for e in events]

@app.get("/cases/{case_id}/audit", response_model=list[AuditResponse])
def get_case_audit(case_id: str, db: Session = Depends(get_db)):
    audits = db.query(AuditModel).filter(AuditModel.case_id == case_id).order_by(AuditModel.timestamp).all()
    return [
        AuditResponse(
            id=a.id,
            case_id=a.case_id,
            from_state=a.from_state,
            to_state=a.to_state,
            evidence=a.evidence,
            timestamp=a.timestamp.isoformat() if a.timestamp else ""
        ) for a in audits
    ]

@app.post("/cases/{case_id}/assess-risk", dependencies=[Depends(verify_api_key)], response_model=RiskAssessmentResponse)
def assess_risk(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    from application.risk_detector import DeterministicRiskDetector
    from domain.models import CaseState
    
    detector = DeterministicRiskDetector()
    assessment = detector.assess_risk(case)
    
    # Integrate to case
    case.risk_assessment = assessment
    
    # Assuming CaseLifecycleManager would normally be involved, but here we just update state directly for phase 5
    case.current_state = CaseState.ASSESSED
    
    audit.log_transition(
        case_id=case.case_id,
        from_state="OPEN", # Simplified
        to_state="ASSESSED",
        evidence={"action": "risk_assessment", "score": assessment.score, "level": assessment.risk_level}
    )
    
    repo.save(case)
    
    return RiskAssessmentResponse(
        score=assessment.score,
        risk_level=assessment.risk_level,
        detection_status=assessment.detection_status,
        primary_risk_signals=assessment.primary_risk_signals,
        contributing_evidence_references=assessment.contributing_evidence_references,
        assessment_timestamp=assessment.assessment_timestamp.isoformat(),
        detector_version=assessment.detector_version
    )

@app.get("/cases/{case_id}/risk", response_model=RiskAssessmentResponse)
def get_risk(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    case = repo.get_by_id(case_id)
    if not case or not case.risk_assessment:
        raise HTTPException(status_code=404, detail="Risk assessment not found")
        
    assessment = case.risk_assessment
    return RiskAssessmentResponse(
        score=assessment.score,
        risk_level=assessment.risk_level,
        detection_status=assessment.detection_status,
        primary_risk_signals=assessment.primary_risk_signals,
        contributing_evidence_references=assessment.contributing_evidence_references,
        assessment_timestamp=assessment.assessment_timestamp.isoformat(),
        detector_version=assessment.detector_version
    )

@app.post("/cases/{case_id}/diagnose", dependencies=[Depends(verify_api_key)], response_model=DiagnosisResponse)
def diagnose_case(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    from application.diagnosis_engine import DeterministicDiagnosisEngine
    from domain.models import CaseState
    
    engine = DeterministicDiagnosisEngine()
    diagnosis = engine.diagnose(case)
    
    case.diagnosis = diagnosis
    case.current_state = CaseState.DIAGNOSING
    
    audit.log_transition(
        case_id=case.case_id,
        from_state="ASSESSED",
        to_state="DIAGNOSING",
        evidence={"action": "diagnosis", "cause": diagnosis.cause_category, "confidence": diagnosis.confidence}
    )
    
    repo.save(case)
    
    return DiagnosisResponse(
        diagnosis_id=diagnosis.diagnosis_id,
        cause_category=diagnosis.cause_category,
        confidence=diagnosis.confidence,
        status=diagnosis.status,
        supporting_signals=diagnosis.supporting_signals,
        evidence_references=diagnosis.evidence_references,
        diagnostic_method=diagnosis.diagnostic_method,
        timestamp=diagnosis.timestamp.isoformat()
    )

@app.get("/cases/{case_id}/diagnosis", response_model=DiagnosisResponse)
def get_diagnosis(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    case = repo.get_by_id(case_id)
    if not case or not case.diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
        
    d = case.diagnosis
    return DiagnosisResponse(
        diagnosis_id=d.diagnosis_id,
        cause_category=d.cause_category,
        confidence=d.confidence,
        status=d.status,
        supporting_signals=d.supporting_signals,
        evidence_references=d.evidence_references,
        diagnostic_method=d.diagnostic_method,
        timestamp=d.timestamp.isoformat()
    )

@app.post("/cases/{case_id}/predict-recovery", dependencies=[Depends(verify_api_key)], response_model=RecoveryPredictionResponse)
def predict_recovery(case_id: str, dataset_id: Optional[str] = None, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    from application.case_pipeline import predict_recovery_for_case

    # Shadow ML if a dataset-isolated model exists, else deterministic baseline
    # (never a meaningless 0.0).
    prediction = predict_recovery_for_case(case, dataset_id=dataset_id)
    case.prediction = prediction
    
    audit.log_transition(
        case_id=case.case_id,
        from_state=case.current_state.value,
        to_state=case.current_state.value, # State doesn't change here just for prediction
        evidence={"action": "recovery_prediction", "probability": prediction.recovery_probability, "model_version": prediction.model_version}
    )
    
    repo.save(case)
    
    return RecoveryPredictionResponse(
        prediction_id=prediction.prediction_id,
        recovery_probability=prediction.recovery_probability,
        confidence=prediction.confidence,
        model_version=prediction.model_version,
        feature_version=prediction.feature_version,
        prediction_timestamp=prediction.prediction_timestamp.isoformat(),
        contributing_features=prediction.contributing_features,
        prediction_status=prediction.prediction_status
    )

@app.get("/cases/{case_id}/recovery-prediction", response_model=RecoveryPredictionResponse)
def get_prediction(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    case = repo.get_by_id(case_id)
    if not case or not case.prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")
        
    p = case.prediction
    return RecoveryPredictionResponse(
        prediction_id=p.prediction_id,
        recovery_probability=p.recovery_probability,
        confidence=p.confidence,
        model_version=p.model_version,
        feature_version=p.feature_version,
        prediction_timestamp=p.prediction_timestamp.isoformat(),
        contributing_features=p.contributing_features,
        prediction_status=p.prediction_status
    )

@app.post("/cases/{case_id}/recommend-action", dependencies=[Depends(verify_api_key)], response_model=ActionRecommendationResponse)
def recommend_action(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    from application.action_evaluator import DeterministicActionEvaluator
    from domain.models import CaseState
    
    evaluator = DeterministicActionEvaluator()
    recommendation = evaluator.evaluate(case)

    case.recommendation = recommendation
    if recommendation.top_candidate:
        _cur = case.amount_at_risk.currency if case.amount_at_risk else "INR"
        case.expected_recoverable_value = Money(
            amount=recommendation.top_candidate.expected_recoverable_value, currency=_cur
        )
    case.current_state = CaseState.RECOMMENDING
    
    top_type = recommendation.top_candidate.action_type if recommendation.top_candidate else "NONE"
    
    audit.log_transition(
        case_id=case.case_id,
        from_state=case.current_state.value,
        to_state=CaseState.RECOMMENDING.value,
        evidence={"action": "action_recommendation", "top_candidate": top_type, "status": recommendation.status.value}
    )
    
    repo.save(case)
    
    return ActionRecommendationResponse(
        recommendation_id=recommendation.recommendation_id,
        candidates=[c.model_dump() for c in recommendation.candidates],
        top_candidate=recommendation.top_candidate.model_dump() if recommendation.top_candidate else None,
        status=recommendation.status.value,
        rationale=recommendation.rationale,
        engine_version=recommendation.engine_version,
        timestamp=recommendation.timestamp.isoformat()
    )

@app.get("/cases/{case_id}/recommendation", response_model=ActionRecommendationResponse)
def get_recommendation(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    case = repo.get_by_id(case_id)
    if not case or not case.recommendation:
        raise HTTPException(status_code=404, detail="Recommendation not found")
        
    rec = case.recommendation
    return ActionRecommendationResponse(
        recommendation_id=rec.recommendation_id,
        candidates=[c.model_dump() for c in rec.candidates],
        top_candidate=rec.top_candidate.model_dump() if rec.top_candidate else None,
        status=rec.status.value,
        rationale=rec.rationale,
        engine_version=rec.engine_version,
        timestamp=rec.timestamp.isoformat()
    )

@app.post("/cases/{case_id}/policy-check", dependencies=[Depends(verify_api_key)], response_model=PolicyDecisionResponse)
def policy_check(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    from application.policy_engine import DeterministicPolicyEngine
    from domain.models import CaseState
    
    engine = DeterministicPolicyEngine()
    try:
        _ctx = repo.get_policy_context(case_id)
    except Exception:
        _ctx = None
    decision = engine.evaluate(case, context=_ctx)

    case.policy_decision = decision
    case.current_state = CaseState.POLICY_EVALUATED
    
    action_type = case.recommendation.top_candidate.action_type if case.recommendation and case.recommendation.top_candidate else "NONE"
    
    audit.log_transition(
        case_id=case.case_id,
        from_state=case.current_state.value,
        to_state=CaseState.POLICY_EVALUATED.value,
        evidence={"action": "policy_evaluation", "candidate_action": action_type, "decision": decision.status.value, "reason": decision.reason}
    )
    
    repo.save(case)
    
    return PolicyDecisionResponse(
        decision_id=decision.decision_id,
        status=decision.status.value,
        policy_version=decision.policy_version,
        rules_evaluated=[r.model_dump() for r in decision.rules_evaluated],
        failed_rules=[r.model_dump() for r in decision.failed_rules],
        reason=decision.reason,
        timestamp=decision.timestamp.isoformat()
    )

@app.get("/cases/{case_id}/policy-decision", response_model=PolicyDecisionResponse)
def get_policy_decision(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    case = repo.get_by_id(case_id)
    if not case or not case.policy_decision:
        raise HTTPException(status_code=404, detail="Policy decision not found")
        
    dec = case.policy_decision
    return PolicyDecisionResponse(
        decision_id=dec.decision_id,
        status=dec.status.value,
        policy_version=dec.policy_version,
        rules_evaluated=[r.model_dump() for r in dec.rules_evaluated],
        failed_rules=[r.model_dump() for r in dec.failed_rules],
        reason=dec.reason,
        timestamp=dec.timestamp.isoformat()
    )

@app.post("/cases/{case_id}/execute", response_model=ExecutionRecordResponse)
def execute_action(case_id: str, db: Session = Depends(get_db), api_key: str = Depends(verify_api_key)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    from application.agents import AgentOrchestrator
    from domain.models import CaseState, ActionType, ExecutionStatus
    
    # We execute whatever action the policy authorized
    if not case.policy_decision or not case.recommendation or not case.recommendation.top_candidate:
        raise HTTPException(status_code=400, detail="Missing policy or recommendation")
        
    requested_action = case.recommendation.top_candidate.action_type
    
    orchestrator = AgentOrchestrator()
    record = orchestrator.execute(case, requested_action, repo=repo)

    case.execution_record = record
    
    if record.status == ExecutionStatus.COMPLETED_SIMULATED:
        case.current_state = CaseState.PENDING_VERIFICATION
    elif record.status == ExecutionStatus.REJECTED:
        pass # keep current state
    else:
        case.current_state = CaseState.EXECUTING # Wait or failed
    
    audit.log_transition(
        case_id=case.case_id,
        from_state=case.current_state.value, # Logging the state it's in now
        to_state=case.current_state.value,
        evidence={"action": "execution", "agent": record.agent_type, "status": record.status.value, "adapter": record.adapter_used}
    )
    
    repo.save(case)
    
    return ExecutionRecordResponse(
        execution_id=record.execution_id,
        action_type=record.action_type.value,
        agent_type=record.agent_type,
        policy_decision_id=record.policy_decision_id,
        status=record.status.value,
        adapter_used=record.adapter_used,
        timestamp=record.timestamp.isoformat(),
        result_metadata=record.result_metadata
    )

@app.post("/cases/{case_id}/verify", dependencies=[Depends(verify_api_key)], response_model=RecoveryOutcomeResponse)
def verify_outcome(case_id: str, request: VerifyOutcomeRequest, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    
    case = repo.get_by_id(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    from application.verification_engine import VerificationEngine
    from domain.models import CaseState
    
    engine = VerificationEngine()
    outcome = engine.reconcile(case, request.external_reference)
    
    # Financial Invariants Enforcement
    # INVARIANT 1 & 2: Actual amount comes from outcome, not prediction
    case.outcome = outcome
    case.actual_amount_recovered = outcome.actual_amount_recovered
    
    new_state = engine.resolve_case_state(outcome.status)
    case.current_state = new_state
    
    audit.log_transition(
        case_id=case.case_id,
        from_state=case.current_state.value,
        to_state=new_state.value,
        evidence={"action": "verification", "outcome": outcome.status.value, "amount": str(outcome.actual_amount_recovered.amount), "source": outcome.verification_source}
    )
    
    repo.save(case)
    
    return RecoveryOutcomeResponse(
        outcome_id=outcome.outcome_id,
        status=outcome.status.value,
        expected_amount=outcome.expected_amount.amount,
        actual_amount_recovered=outcome.actual_amount_recovered.amount,
        currency=outcome.actual_amount_recovered.currency,
        verification_source=outcome.verification_source,
        external_reference=outcome.external_reference,
        reconciliation_status=outcome.reconciliation_status,
        timestamp=outcome.verification_timestamp.isoformat()
    )

@app.get("/cases/{case_id}/outcome", response_model=RecoveryOutcomeResponse)
def get_outcome(case_id: str, db: Session = Depends(get_db)):
    repo = SqlAlchemyCaseRepository(db)
    case = repo.get_by_id(case_id)
    if not case or not case.outcome:
        raise HTTPException(status_code=404, detail="Outcome not found")
        
    outcome = case.outcome
    return RecoveryOutcomeResponse(
        outcome_id=outcome.outcome_id,
        status=outcome.status.value,
        expected_amount=outcome.expected_amount.amount,
        actual_amount_recovered=outcome.actual_amount_recovered.amount,
        currency=outcome.actual_amount_recovered.currency,
        verification_source=outcome.verification_source,
        external_reference=outcome.external_reference,
        reconciliation_status=outcome.reconciliation_status,
        timestamp=outcome.verification_timestamp.isoformat()
    )

@app.post("/evaluation/run", dependencies=[Depends(verify_api_key)])
def run_evaluation(db: Session = Depends(get_db)):
    from evaluation.scenarios import SCENARIOS
    from evaluation.runner import EvaluationRunner
    
    runner = EvaluationRunner(db)
    metrics = runner.run_all(SCENARIOS)
    
    return metrics.model_dump()

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    from infrastructure.redis_client import redis_enabled
    health_status = {"api": "ok", "db": "unknown", "redis": "disabled"}
    try:
        db.execute(text("SELECT 1"))
        health_status["db"] = "ok"
    except Exception:
        health_status["db"] = "error"

    if redis_enabled():
        try:
            get_redis_client().ping()
            health_status["redis"] = "ok"
        except Exception:
            health_status["redis"] = "error"
    return health_status

from infrastructure.orm import CaseModel

def _json_get(blob, *keys):
    cur = blob
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def _scalar(v):
    """Unwrap a serialized Money dict ({'amount','currency'}) to its amount."""
    return v.get("amount") if isinstance(v, dict) else v


@app.get('/cases', response_model=list[CaseResponse])
def list_cases(limit: int = 200, offset: int = 0, db: Session = Depends(get_db)):
    """Read straight from the persisted JSON columns — one query, no per-row
    domain rehydration (was an N+1 over every case)."""
    limit = max(1, min(limit, 500))
    q = (db.query(CaseModel, func.count(EventModel.event_id))
         .outerjoin(EventModel, EventModel.case_id == CaseModel.case_id)
         .group_by(CaseModel.case_id)
         .order_by(CaseModel.created_at.desc())
         .offset(offset).limit(limit))
    result = []
    for c, event_count in q.all():
        result.append(CaseResponse(
            case_id=c.case_id,
            customer_id=c.customer_id,
            risk_category=c.risk_category,
            amount_at_risk=c.amount_at_risk,
            currency=c.currency,
            current_state=c.current_state,
            event_count=event_count or 0,
            risk_level=_json_get(c.risk_assessment, "risk_level"),
            cause_category=_json_get(c.diagnosis, "cause_category"),
            recovery_probability=_json_get(c.prediction, "recovery_probability"),
            expected_recoverable_value=c.expected_recoverable_value,
            recommended_action=_json_get(c.recommendation, "top_candidate", "action_type"),
            policy_status=_json_get(c.policy_decision, "status"),
            execution_status=_json_get(c.execution_record, "status"),
            outcome_status=_json_get(c.outcome, "status"),
            actual_amount_recovered=_scalar(_json_get(c.outcome, "actual_amount_recovered")),
        ))
    return result

@app.get('/dashboard/metrics', response_model=DashboardMetricsResponse)
def get_dashboard_metrics(db: Session = Depends(get_db)):
    cases = db.query(CaseModel).all()

    total_risk = 0.0
    active = high_crit = pending = waiting = 0
    opportunities = 0.0
    recovered = 0.0
    _terminal = {'FULLY_RECOVERED', 'PARTIALLY_RECOVERED', 'CLOSED_NOT_RECOVERED', 'STOPPED', 'DENIED'}

    for c in cases:
        total_risk += float(c.amount_at_risk or 0)

        state_val = c.current_state.value if hasattr(c.current_state, 'value') else str(c.current_state)
        if state_val not in _terminal:
            active += 1

        if _json_get(c.risk_assessment, "risk_level") in ('HIGH', 'CRITICAL'):
            high_crit += 1

        pol_val = _json_get(c.policy_decision, "status")
        if pol_val == 'ESCALATE':
            pending += 1
        elif pol_val == 'WAIT':
            waiting += 1

        erv = _json_get(c.recommendation, "top_candidate", "expected_recoverable_value")
        if erv is not None:
            opportunities += float(erv)

        amt = _scalar(_json_get(c.outcome, "actual_amount_recovered"))
        if amt is not None:
            recovered += float(amt)

    return DashboardMetricsResponse(
        total_revenue_at_risk=total_risk,
        active_cases=active,
        high_critical_cases=high_crit,
        pending_human_review=pending,
        waiting_cases=waiting,
        recovery_opportunities=opportunities,
        verified_recovery=recovered,
        recovery_gap=total_risk - recovered
    )




from api.schemas import HumanReviewRequest
from domain.models import PolicyDecisionStatus

@app.post("/cases/{case_id}/human-review")
def submit_human_review(case_id: str, request: HumanReviewRequest, db: Session = Depends(get_db), api_key: str = Depends(verify_api_key)):
    repo = SqlAlchemyCaseRepository(db)
    audit = SqlAlchemyAuditRecorder(db)
    
    case = repo.get_by_id_for_update(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    if not case.policy_decision or case.policy_decision.status != PolicyDecisionStatus.ESCALATE:
        raise HTTPException(status_code=400, detail="Case is not pending human escalation.")
        
    old_state = case.current_state.value
    
    if request.decision.upper() == 'APPROVE':
        case.policy_decision.status = PolicyDecisionStatus.PERMITTED
        case.policy_decision.reason += f" [Human Approved: {request.note}]"
        case.current_state = CaseState.POLICY_REVIEW # Ready for execute
    else:
        case.policy_decision.status = PolicyDecisionStatus.DENIED
        case.policy_decision.reason += f" [Human Rejected: {request.note}]"
        # remains in escalated or moves to closed
        
    audit.log_transition(
        case_id=case.case_id,
        from_state=old_state,
        to_state=case.current_state.value,
        evidence={"action": "human_review", "decision": request.decision, "note": request.note}
    )
    
    repo.save(case)
    db.commit()
    return {"status": "success", "decision": case.policy_decision.status.value}

