from decimal import Decimal
from typing import Any

from pydantic import BaseModel

from domain.models import CaseState, RiskCategory


class IngestEventRequest(BaseModel):
    customer_id: str
    risk_category: RiskCategory
    external_system: str
    external_event_id: str
    reference_id: str | None = None
    amount: Decimal
    currency: str = "INR"
    raw_payload: dict[str, Any]


class IngestEventResponse(BaseModel):
    case_id: str
    is_new_case: bool
    status: str
    message: str


class RiskAssessmentResponse(BaseModel):
    score: float
    risk_level: str
    detection_status: str
    primary_risk_signals: dict[str, Any]
    contributing_evidence_references: list[str]
    assessment_timestamp: str
    detector_version: str


class DiagnosisResponse(BaseModel):
    diagnosis_id: str
    cause_category: str
    confidence: float
    status: str
    supporting_signals: dict[str, Any]
    evidence_references: list[str]
    diagnostic_method: str
    timestamp: str


class RecoveryPredictionResponse(BaseModel):
    prediction_id: str
    recovery_probability: float
    confidence: float
    model_version: str
    feature_version: str
    prediction_timestamp: str
    contributing_features: dict[str, Any]
    prediction_status: str


class CandidateActionResponse(BaseModel):
    action_type: str
    estimated_probability: float
    expected_recoverable_value: Decimal
    rationale: str


class ActionRecommendationResponse(BaseModel):
    recommendation_id: str
    candidates: list[CandidateActionResponse]
    top_candidate: CandidateActionResponse | None
    status: str
    rationale: str
    engine_version: str
    timestamp: str


class RuleResultResponse(BaseModel):
    rule_name: str
    passed: bool
    details: str


class PolicyDecisionResponse(BaseModel):
    decision_id: str
    status: str
    policy_version: str
    rules_evaluated: list[RuleResultResponse]
    failed_rules: list[RuleResultResponse]
    reason: str
    timestamp: str


class ExecutionRecordResponse(BaseModel):
    execution_id: str
    action_type: str
    agent_type: str
    policy_decision_id: str
    status: str
    adapter_used: str
    timestamp: str
    result_metadata: dict


class RecoveryOutcomeResponse(BaseModel):
    outcome_id: str
    status: str
    expected_amount: Decimal
    actual_amount_recovered: Decimal
    currency: str
    verification_source: str
    external_reference: str
    reconciliation_status: str
    timestamp: str


class VerifyOutcomeRequest(BaseModel):
    external_reference: str


class CaseResponse(BaseModel):
    case_id: str
    customer_id: str
    risk_category: RiskCategory
    amount_at_risk: Decimal
    currency: str
    current_state: CaseState
    event_count: int
    risk_level: str | None = None
    cause_category: str | None = None
    recovery_probability: float | None = None
    expected_recoverable_value: Decimal | None = None
    recommended_action: str | None = None
    policy_status: str | None = None
    execution_status: str | None = None
    outcome_status: str | None = None
    actual_amount_recovered: Decimal | None = None


class AuditResponse(BaseModel):
    id: str
    case_id: str | None
    from_state: str | None
    to_state: str | None
    evidence: dict[str, Any]
    timestamp: str


class DashboardMetricsResponse(BaseModel):
    total_revenue_at_risk: Decimal
    active_cases: int
    high_critical_cases: int
    pending_human_review: int
    waiting_cases: int
    recovery_opportunities: Decimal
    verified_recovery: Decimal
    recovery_gap: Decimal


class HumanReviewRequest(BaseModel):
    decision: str
    note: str


class BatchIngestRequest(BaseModel):
    events: list[IngestEventRequest]
    auto_advance: bool = True


class BatchIngestItemResult(BaseModel):
    external_event_id: str
    case_id: str | None = None
    is_new_case: bool = False
    status: str
    current_state: str | None = None
    policy_status: str | None = None
    message: str = ""


class BatchIngestResponse(BaseModel):
    submitted: int
    ingested: int
    duplicates: int
    failed: int
    results: list[BatchIngestItemResult]


class AdvanceCaseResponse(BaseModel):
    case_id: str
    current_state: str
    risk_level: str | None = None
    cause_category: str | None = None
    recovery_probability: float | None = None
    prediction_status: str | None = None
    recommended_action: str | None = None
    expected_recoverable_value: Decimal | None = None
    policy_status: str | None = None
    policy_reason: str | None = None


class DatasetPredictionRequest(BaseModel):
    canonical_features: dict[str, Any]


class DatasetPredictionResponse(BaseModel):
    probability: float
    status: str
    model_metadata: dict[str, Any]


class GenerateCasesRequest(BaseModel):
    max_cases: int = 100


class GenerateCasesResponse(BaseModel):
    status: str
    cases_generated: int
    case_ids: list[str]
    counters: dict[str, int] | None = None


GenerateCasesResponse.model_rebuild()
