from enum import Enum
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from decimal import Decimal

class Money(BaseModel):
    amount: Decimal
    currency: str = "USD"

class RiskCategory(str, Enum):
    FAILED_PAYMENT = "FAILED_PAYMENT"
    CHECKOUT_ABANDONMENT = "CHECKOUT_ABANDONMENT"
    FAILED_SUBSCRIPTION = "FAILED_SUBSCRIPTION"
    OVERDUE_INVOICE = "OVERDUE_INVOICE"
    BROKEN_PROMISE = "BROKEN_PROMISE"

class CaseState(str, Enum):
    DETECTED = "DETECTED"
    OPEN = "OPEN"
    DIAGNOSING = "DIAGNOSING"
    RECOMMENDING = "RECOMMENDING"
    POLICY_EVALUATED = "POLICY_EVALUATED"
    ASSESSED = "ASSESSED"
    ACTION_PROPOSED = "ACTION_PROPOSED"
    POLICY_REVIEW = "POLICY_REVIEW"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    WAITING = "WAITING"
    ESCALATED = "ESCALATED"
    EXECUTION_PREPARING = "EXECUTION_PREPARING"
    EXECUTING = "EXECUTING"
    VERIFYING = "VERIFYING"
    FULLY_RECOVERED = "FULLY_RECOVERED"
    PARTIALLY_RECOVERED = "PARTIALLY_RECOVERED"
    CLOSED_NOT_RECOVERED = "CLOSED_NOT_RECOVERED"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    STOPPED = "STOPPED"

class RevenueEvent(BaseModel):
    event_id: str
    customer_id: str
    risk_category: RiskCategory
    external_system: str
    external_event_id: str
    reference_id: Optional[str] = None
    amount: Money
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ingested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    raw_payload: dict

class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class RiskAssessment(BaseModel):
    score: float  # 0.0 to 1.0
    risk_level: RiskLevel
    detection_status: str
    primary_risk_signals: dict  # Category-specific signals (e.g. {"failure_count": 3, "amount": 100})
    contributing_evidence_references: List[str]  # e.g., ["evt_1", "evt_2"]
    assessment_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    detector_version: str = "deterministic-v1.0"
    confidence: float = 1.0

class DiagnosisStatus(str, Enum):
    CONFIRMED = "CONFIRMED"
    INFERRED = "INFERRED"
    UNKNOWN = "UNKNOWN"

class RootCauseCategory(str, Enum):
    # FAILED_PAYMENT
    NETWORK_FAILURE = "NETWORK_FAILURE"
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    PAYMENT_METHOD_INVALID = "PAYMENT_METHOD_INVALID"
    # CHECKOUT_ABANDONMENT
    PAYMENT_FRICTION = "PAYMENT_FRICTION"
    # FAILED_SUBSCRIPTION
    MANDATE_FAILURE = "MANDATE_FAILURE"
    # OVERDUE_INVOICE
    UNRESOLVED_DISPUTE = "UNRESOLVED_DISPUTE"
    # BROKEN_PROMISE
    MISSED_COMMITMENT = "MISSED_COMMITMENT"
    # GENERAL
    UNKNOWN = "UNKNOWN"
    CONFLICTING_EVIDENCE = "CONFLICTING_EVIDENCE"

class RootCauseDiagnosis(BaseModel):
    diagnosis_id: str
    cause_category: RootCauseCategory
    confidence: float
    status: DiagnosisStatus
    supporting_signals: dict
    evidence_references: List[str]
    diagnostic_method: str = "deterministic-v1.0"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RecoveryPrediction(BaseModel):
    prediction_id: str
    recovery_probability: float  # 0.0 to 1.0
    confidence: float
    model_version: str
    feature_version: str
    prediction_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    contributing_features: dict
    prediction_status: str

class ActionType(str, Enum):
    # FAILED_PAYMENT
    RETRY_PAYMENT = "RETRY_PAYMENT"
    REQUEST_PAYMENT_METHOD_UPDATE = "REQUEST_PAYMENT_METHOD_UPDATE"
    SEND_PAYMENT_REMINDER = "SEND_PAYMENT_REMINDER"
    # CHECKOUT_ABANDONMENT
    SEND_CHECKOUT_REMINDER = "SEND_CHECKOUT_REMINDER"
    OFFER_CHECKOUT_ASSISTANCE = "OFFER_CHECKOUT_ASSISTANCE"
    # FAILED_SUBSCRIPTION
    RETRY_BILLING = "RETRY_BILLING"
    SEND_SUBSCRIPTION_REMINDER = "SEND_SUBSCRIPTION_REMINDER"
    # OVERDUE_INVOICE
    SEND_INVOICE_REMINDER = "SEND_INVOICE_REMINDER"
    SEND_PAYMENT_LINK = "SEND_PAYMENT_LINK"
    ESCALATE_COLLECTION = "ESCALATE_COLLECTION"
    # BROKEN_PROMISE
    SEND_PROMISE_REMINDER = "SEND_PROMISE_REMINDER"
    REQUEST_NEW_COMMITMENT = "REQUEST_NEW_COMMITMENT"
    # GENERAL
    ESCALATE_TO_HUMAN = "ESCALATE_TO_HUMAN"
    NO_ACTION_POSSIBLE = "NO_ACTION_POSSIBLE"

class CandidateAction(BaseModel):
    action_type: ActionType
    estimated_probability: float
    expected_recoverable_value: float
    rationale: str

class RecommendationStatus(str, Enum):
    RECOMMENDED = "RECOMMENDED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"

class ActionRecommendation(BaseModel):
    recommendation_id: str
    candidates: List[CandidateAction]
    top_candidate: Optional[CandidateAction]
    status: RecommendationStatus
    rationale: str
    engine_version: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PolicyDecisionStatus(str, Enum):
    PERMITTED = "PERMITTED"
    DENIED = "DENIED"
    WAIT = "WAIT"
    ESCALATE = "ESCALATE"

class RuleResult(BaseModel):
    rule_name: str
    passed: bool
    details: str

class PolicyDecision(BaseModel):
    decision_id: str
    status: PolicyDecisionStatus
    policy_version: str
    rules_evaluated: List[RuleResult]
    failed_rules: List[RuleResult]
    reason: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RecoveryOutcomeStatus(str, Enum):
    FULLY_RECOVERED = "FULLY_RECOVERED"
    PARTIALLY_RECOVERED = "PARTIALLY_RECOVERED"
    NOT_RECOVERED = "NOT_RECOVERED"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"

class RecoveryOutcome(BaseModel):
    outcome_id: str
    case_id: str
    execution_id: Optional[str] = None
    status: RecoveryOutcomeStatus
    expected_amount: Money
    actual_amount_recovered: Money
    verification_source: str
    external_reference: str
    reconciliation_status: str
    verification_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))



class ExecutionStatus(str, Enum):
    PREPARED = "PREPARED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED_SIMULATED = "COMPLETED_SIMULATED"
    FAILED = "FAILED"
    REJECTED = "REJECTED"

class ExecutionRecord(BaseModel):
    execution_id: str
    action_type: ActionType
    agent_type: str
    policy_decision_id: str
    policy_version: str
    parameters: dict
    idempotency_key: str
    status: ExecutionStatus
    adapter_used: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    result_metadata: dict = Field(default_factory=dict)

class RecoveryCase(BaseModel):
    case_id: str
    customer_id: str
    risk_category: RiskCategory
    reference_id: Optional[str] = None
    amount_at_risk: Money
    expected_recoverable_value: Optional[Money] = None
    actual_amount_recovered: Optional[Money] = None
    current_state: CaseState = CaseState.DETECTED
    linked_events: List[RevenueEvent] = Field(default_factory=list)
    risk_assessment: Optional[RiskAssessment] = None
    diagnosis: Optional[RootCauseDiagnosis] = None
    prediction: Optional[RecoveryPrediction] = None
    recommendation: Optional[ActionRecommendation] = None
    policy_decision: Optional[PolicyDecision] = None
    execution_record: Optional[ExecutionRecord] = None
    candidate_action: Optional[CandidateAction] = None
    outcome: Optional[RecoveryOutcome] = None
