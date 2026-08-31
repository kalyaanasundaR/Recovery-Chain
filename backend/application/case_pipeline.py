"""
CasePipelineService — runs the deterministic case lifecycle end to end.

Stages: assess-risk -> diagnose -> predict-recovery -> recommend-action ->
policy-check. Execution and verification stay separate (they have side effects
and their own guards). Each stage is idempotent-ish: calling it again recomputes
and overwrites that stage's result.

The individual API routes in api/main.py still exist for step-by-step control;
this service is what `POST /events/batch?auto=true` and
`POST /cases/{id}/advance` use so a submitted event actually moves.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from domain.models import (
    RecoveryCase,
    RecoveryPrediction,
    Money,
    CaseState,
)


def predict_recovery_for_case(case: RecoveryCase, dataset_id: Optional[str] = None) -> RecoveryPrediction:
    """
    Shadow ML prediction with a deterministic fallback.

    If a dataset-isolated model exists it is used (shadow-only). Otherwise we fall
    back to DeterministicBaselinePredictor so downstream ERV / ranking is never
    driven by a meaningless 0.0.
    """
    from application.recovery_predictor_ml import MLPaymentFailurePredictor
    from application.recovery_predictor import DeterministicBaselinePredictor

    # Start from the raw source row (dataset replay) so a per-dataset model sees
    # the same original columns it was trained on; canonical keys are layered on
    # top as a fallback for models that only know canonical inputs.
    src_event = case.linked_events[-1] if getattr(case, "linked_events", None) else None
    row = dict(src_event.raw_payload) if src_event and src_event.raw_payload else {}
    ts = src_event.timestamp.isoformat() if src_event and src_event.timestamp else \
        datetime.now(timezone.utc).isoformat()

    feature_dict = {
        **row,
        "AMOUNT": case.amount_at_risk.amount if case.amount_at_risk else 0.0,
        "BALANCE": case.amount_at_risk.amount if case.amount_at_risk else 0.0,
        "CUSTOMER_ID": case.customer_id,
        "ACCOUNT_ID": case.customer_id,
        "ENTITY_ID": case.customer_id,
        "TIMESTAMP": ts,
    }

    prob = None
    status = "SUCCESS"
    model_version = "unknown"

    predictor = MLPaymentFailurePredictor(dataset_id=dataset_id)
    if predictor.model is not None:
        try:
            res = predictor.predict_failure_risk(feature_dict)
            if res.get("status") == "SUCCESS":
                # model predicts *failure* risk; recovery probability is the complement
                prob = 1.0 - float(res.get("probability", 0.0))
                status = "SHADOW_ONLY"
                model_version = res.get("model_metadata", {}).get("model_version", "shadow")
        except ValueError:
            prob = None  # incomplete features -> fall through to baseline

    if prob is None:
        baseline = DeterministicBaselinePredictor().predict(case)
        return baseline

    return RecoveryPrediction(
        prediction_id=f"pred_{uuid.uuid4().hex[:8]}",
        recovery_probability=max(0.0, min(1.0, prob)),
        confidence=0.8,
        model_version=model_version,
        feature_version="1.0",
        prediction_timestamp=datetime.now(timezone.utc),
        contributing_features=feature_dict,
        prediction_status=status,
    )


class CasePipelineService:
    def __init__(self, repo, audit):
        self.repo = repo
        self.audit = audit

    # -- individual stages ------------------------------------------------
    def assess_risk(self, case: RecoveryCase) -> RecoveryCase:
        from application.risk_detector import DeterministicRiskDetector
        assessment = DeterministicRiskDetector().assess_risk(case)
        case.risk_assessment = assessment
        case.current_state = CaseState.ASSESSED
        self.audit.log_transition(
            case_id=case.case_id, from_state=CaseState.OPEN.value, to_state=CaseState.ASSESSED.value,
            evidence={"action": "risk_assessment", "score": assessment.score, "level": assessment.risk_level},
        )
        return case

    def diagnose(self, case: RecoveryCase) -> RecoveryCase:
        from application.diagnosis_engine import DeterministicDiagnosisEngine
        diagnosis = DeterministicDiagnosisEngine().diagnose(case)
        case.diagnosis = diagnosis
        case.current_state = CaseState.DIAGNOSING
        self.audit.log_transition(
            case_id=case.case_id, from_state=CaseState.ASSESSED.value, to_state=CaseState.DIAGNOSING.value,
            evidence={"action": "diagnosis", "cause": diagnosis.cause_category, "confidence": diagnosis.confidence},
        )
        return case

    def predict(self, case: RecoveryCase, dataset_id: Optional[str] = None) -> RecoveryCase:
        prediction = predict_recovery_for_case(case, dataset_id=dataset_id)
        case.prediction = prediction
        self.audit.log_transition(
            case_id=case.case_id, from_state=case.current_state.value, to_state=case.current_state.value,
            evidence={"action": "recovery_prediction", "probability": prediction.recovery_probability,
                      "model_version": prediction.model_version, "status": prediction.prediction_status},
        )
        return case

    def recommend(self, case: RecoveryCase) -> RecoveryCase:
        from application.action_evaluator import DeterministicActionEvaluator
        recommendation = DeterministicActionEvaluator().evaluate(case)
        case.recommendation = recommendation
        if recommendation.top_candidate:
            currency = case.amount_at_risk.currency if case.amount_at_risk else "INR"
            case.expected_recoverable_value = Money(
                amount=recommendation.top_candidate.expected_recoverable_value, currency=currency
            )
        case.current_state = CaseState.RECOMMENDING
        top_type = recommendation.top_candidate.action_type if recommendation.top_candidate else "NONE"
        self.audit.log_transition(
            case_id=case.case_id, from_state=CaseState.DIAGNOSING.value, to_state=CaseState.RECOMMENDING.value,
            evidence={"action": "action_recommendation", "top_candidate": str(top_type),
                      "status": recommendation.status.value},
        )
        return case

    def policy_check(self, case: RecoveryCase) -> RecoveryCase:
        from application.policy_engine import DeterministicPolicyEngine
        context = None
        if hasattr(self.repo, "get_policy_context"):
            try:
                context = self.repo.get_policy_context(case.case_id)
            except Exception:
                context = None
        decision = DeterministicPolicyEngine().evaluate(case, context=context)
        case.policy_decision = decision
        case.current_state = CaseState.POLICY_EVALUATED
        self.audit.log_transition(
            case_id=case.case_id, from_state=CaseState.RECOMMENDING.value, to_state=CaseState.POLICY_EVALUATED.value,
            evidence={"action": "policy_evaluation", "decision": decision.status.value, "reason": decision.reason},
        )
        return case

    # -- full run ------------------------------------------------------------
    def advance(self, case: RecoveryCase, dataset_id: Optional[str] = None) -> RecoveryCase:
        if case.current_state in (CaseState.STOPPED, CaseState.FULLY_RECOVERED,
                                  CaseState.CLOSED_NOT_RECOVERED):
            return case
        self.assess_risk(case)
        self.diagnose(case)
        self.predict(case, dataset_id=dataset_id)
        self.recommend(case)
        self.policy_check(case)
        self.repo.save(case)
        return case
