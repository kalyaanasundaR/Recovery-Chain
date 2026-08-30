from pydantic import BaseModel
from decimal import Decimal
from typing import List, Dict, Any, Optional
from domain.models import RiskCategory, CaseState

class IngestEventRequest(BaseModel):
    customer_id: str
    risk_category: RiskCategory
    external_system: str
    external_event_id: str
    reference_id: Optional[str] = None
    amount: Decimal
    currency: str = "USD"
    raw_payload: Dict[str, Any]

class IngestEventResponse(BaseModel):
    case_id: str
    is_new_case: bool
    status: str
    message: str

class RiskAssessmentResponse(BaseModel):
    score: float
    risk_level: str
    detection_status: str
    primary_risk_signals: Dict[str, Any]
    contributing_evidence_references: List[str]
    assessment_timestamp: str
    detector_version: str

class DiagnosisResponse(BaseModel):
    diagnosis_id: str
    cause_category: str
    confidence: float
    status: str
    supporting_signals: Dict[str, Any]
    evidence_references: List[str]
    diagnostic_method: str
    timestamp: str

class RecoveryPredictionResponse(BaseModel):
    prediction_id: str
    recovery_probability: float
    confidence: float
    model_version: str
    feature_version: str
    prediction_timestamp: str
    contributing_features: Dict[str, Any]
    prediction_status: str

class CandidateActionResponse(BaseModel):
    action_type: str
    estimated_probability: float
    expected_recoverable_value: Decimal
    rationale: str

class ActionRecommendationResponse(BaseModel):
    recommendation_id: str
    candidates: List[CandidateActionResponse]
    top_candidate: Optional[CandidateActionResponse]
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
    rules_evaluated: List[RuleResultResponse]
    failed_rules: List[RuleResultResponse]
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
    risk_level: Optional[str] = None
    cause_category: Optional[str] = None
    recovery_probability: Optional[float] = None
    expected_recoverable_value: Optional[Decimal] = None
    recommended_action: Optional[str] = None
    policy_status: Optional[str] = None
    execution_status: Optional[str] = None
    outcome_status: Optional[str] = None
    actual_amount_recovered: Optional[Decimal] = None

class AuditResponse(BaseModel):
    id: str
    case_id: Optional[str]
    from_state: Optional[str]
    to_state: Optional[str]
    evidence: Dict[str, Any]
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

class DatasetPredictionRequest(BaseModel):
    canonical_features: Dict[str, Any]

class DatasetPredictionResponse(BaseModel):
    probability: float
    status: str
    model_metadata: Dict[str, Any]


class GenerateCasesRequest(BaseModel):
    max_cases: int = 100

class GenerateCasesResponse(BaseModel):
    status: str
    cases_generated: int
    case_ids: List[str]
    counters: Optional[Dict[str, int]] = None

GenerateCasesResponse.model_rebuild()
