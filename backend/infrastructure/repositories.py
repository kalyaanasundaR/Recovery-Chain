from application.case_engine import ACTIVE_STATES
from domain.interfaces import ICaseRepository
from domain.models import (
    ActionRecommendation,
    ExecutionRecord,
    PolicyDecision,
    RecoveryCase,
    RecoveryOutcome,
    RecoveryPrediction,
    RevenueEvent,
    RiskAssessment,
    RootCauseDiagnosis,
)


class InMemoryCaseRepository(ICaseRepository):
    """A purely in-memory repository for robust unit testing without database constraints."""

    def __init__(self):
        self.cases: dict[str, RecoveryCase] = {}
        self.events: dict[str, RevenueEvent] = {}

    def save(self, case: RecoveryCase) -> None:
        self.cases[case.case_id] = case
        for event in case.linked_events:
            self.events[(event.external_system, event.external_event_id)] = event

    def get_by_id(self, case_id: str) -> RecoveryCase | None:
        return self.cases.get(case_id)

    def get_event_by_external_id(
        self, external_system: str, external_event_id: str
    ) -> RevenueEvent | None:
        return self.events.get((external_system, external_event_id))

    def get_active_case_for_customer(
        self, customer_id: str, risk_category: str, reference_id: str | None
    ) -> RecoveryCase | None:
        if not reference_id:
            return None
        for case in self.cases.values():
            if (
                case.customer_id == customer_id
                and case.risk_category == risk_category
                and case.reference_id == reference_id
            ):
                if case.current_state in ACTIVE_STATES:
                    return case
        return None


import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from domain.interfaces import IAuditRecorder
from domain.models import Money
from infrastructure.orm import (
    AuditModel,
    CaseModel,
    EventModel,
    ExecutionAttemptModel,
    IdempotencyRecord,
)

_PAYMENT_ACTIONS = {"RETRY_PAYMENT", "RETRY_BILLING"}


def _attempt_channel(action_type: str) -> str:
    if action_type in _PAYMENT_ACTIONS:
        return "payment"
    return "communication"


class SqlAlchemyAuditRecorder(IAuditRecorder):
    def __init__(self, db: Session):
        self.db = db

    def has_idempotency_key(self, key: str) -> bool:
        return (
            self.db.query(IdempotencyRecord)
            .filter(IdempotencyRecord.idempotency_key == key)
            .first()
            is not None
        )

    def get_execution_record_by_key(self, key: str) -> dict:
        record = (
            self.db.query(IdempotencyRecord)
            .filter(IdempotencyRecord.idempotency_key == key)
            .first()
        )
        return record.execution_record if record else None

    def save_idempotency_key(self, key: str, execution_record: dict) -> None:
        rec = IdempotencyRecord(idempotency_key=key, execution_record=execution_record)
        self.db.add(rec)
        self.db.flush()

    def log_transition(self, case_id: str, from_state: str, to_state: str, evidence: dict) -> None:
        audit = AuditModel(
            id=uuid.uuid4().hex,
            case_id=case_id if case_id != "SYSTEM" else None,
            from_state=from_state,
            to_state=to_state,
            evidence=evidence,
        )
        self.db.add(audit)
        # Flush to ensure it is in the transaction, but don't commit yet (Repository commits)
        self.db.flush()


class SqlAlchemyCaseRepository(ICaseRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id_for_update(self, case_id: str):
        c = self.db.query(CaseModel).with_for_update().filter(CaseModel.case_id == case_id).first()
        if not c:
            return None
        return self.get_by_id(case_id)

    def has_idempotency_key(self, key: str) -> bool:
        return (
            self.db.query(IdempotencyRecord)
            .filter(IdempotencyRecord.idempotency_key == key)
            .first()
            is not None
        )

    def get_execution_record_by_key(self, key: str) -> dict:
        record = (
            self.db.query(IdempotencyRecord)
            .filter(IdempotencyRecord.idempotency_key == key)
            .first()
        )
        return record.execution_record if record else None

    def save_idempotency_key(self, key: str, execution_record: dict) -> None:
        rec = IdempotencyRecord(idempotency_key=key, execution_record=execution_record)
        self.db.add(rec)
        self.db.flush()

    # -- execution attempt ledger ------------------------------------------
    def record_execution_attempt(
        self, case_id: str, action_type: str, status: str, idempotency_key: str = None
    ) -> None:
        self.db.add(
            ExecutionAttemptModel(
                id=uuid.uuid4().hex,
                case_id=case_id,
                action_type=action_type,
                channel=_attempt_channel(action_type),
                status=status,
                idempotency_key=idempotency_key,
            )
        )
        self.db.flush()

    def get_policy_context(self, case_id: str):
        """Build a PolicyContext from the execution_attempts ledger."""
        from application.policy_engine import PolicyContext

        now = datetime.now(UTC)
        rows = (
            self.db.query(ExecutionAttemptModel)
            .filter(ExecutionAttemptModel.case_id == case_id)
            .all()
        )
        pay = [r for r in rows if r.channel == "payment"]
        comms = [r for r in rows if r.channel == "communication"]
        last_pay = max((r.created_at for r in pay), default=None)
        window = now - timedelta(hours=24)
        comms_24h = sum(
            1
            for r in comms
            if r.created_at
            and (r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=UTC))
            >= window
        )
        return PolicyContext(
            prior_payment_attempts=len(pay),
            last_payment_attempt_at=last_pay,
            comms_in_last_24h=comms_24h,
        )

    def save(self, case: RecoveryCase) -> None:
        # Check if case exists
        db_case = self.db.query(CaseModel).filter(CaseModel.case_id == case.case_id).first()
        if not db_case:
            db_case = CaseModel(
                case_id=case.case_id,
                customer_id=case.customer_id,
                risk_category=case.risk_category,
                reference_id=case.reference_id,
                amount_at_risk=case.amount_at_risk.amount,
                expected_recoverable_value=case.expected_recoverable_value.amount
                if case.expected_recoverable_value
                else None,
                currency=case.amount_at_risk.currency,
                current_state=case.current_state,
                risk_assessment=case.risk_assessment.model_dump(mode="json")
                if case.risk_assessment
                else None,
                diagnosis=case.diagnosis.model_dump(mode="json") if case.diagnosis else None,
                prediction=case.prediction.model_dump(mode="json") if case.prediction else None,
                recommendation=case.recommendation.model_dump(mode="json")
                if case.recommendation
                else None,
                policy_decision=case.policy_decision.model_dump(mode="json")
                if case.policy_decision
                else None,
                execution_record=case.execution_record.model_dump(mode="json")
                if case.execution_record
                else None,
                outcome=case.outcome.model_dump(mode="json") if case.outcome else None,
            )
            self.db.add(db_case)
        else:
            from sqlalchemy.orm.attributes import flag_modified

            db_case.amount_at_risk = case.amount_at_risk.amount
            db_case.expected_recoverable_value = (
                case.expected_recoverable_value.amount if case.expected_recoverable_value else None
            )
            db_case.current_state = case.current_state
            if case.risk_assessment:
                db_case.risk_assessment = case.risk_assessment.model_dump(mode="json")
                flag_modified(db_case, "risk_assessment")
            if case.diagnosis:
                db_case.diagnosis = case.diagnosis.model_dump(mode="json")
                flag_modified(db_case, "diagnosis")
            if case.prediction:
                db_case.prediction = case.prediction.model_dump(mode="json")
                flag_modified(db_case, "prediction")
            if case.recommendation:
                db_case.recommendation = case.recommendation.model_dump(mode="json")
                flag_modified(db_case, "recommendation")
            if case.policy_decision:
                db_case.policy_decision = case.policy_decision.model_dump(mode="json")
                flag_modified(db_case, "policy_decision")
            if case.execution_record:
                db_case.execution_record = case.execution_record.model_dump(mode="json")
                flag_modified(db_case, "execution_record")
            if hasattr(case, "outcome") and case.outcome:
                db_case.outcome = case.outcome.model_dump(mode="json")
                flag_modified(db_case, "outcome")

        # Sync events
        existing_event_ids = {e.event_id for e in db_case.events} if db_case.events else set()
        for event in case.linked_events:
            if event.event_id not in existing_event_ids:
                db_event = EventModel(
                    event_id=event.event_id,
                    case_id=case.case_id,
                    customer_id=event.customer_id,
                    external_system=event.external_system,
                    external_event_id=event.external_event_id,
                    reference_id=event.reference_id,
                    risk_category=event.risk_category,
                    amount=event.amount.amount,
                    currency=event.amount.currency,
                    timestamp=event.timestamp,
                    raw_payload=event.raw_payload,
                )
                self.db.add(db_event)

        # We rely on the caller/dependency injector to call db.commit() OR we commit here.
        # To make it transactional at the use-case level, we commit here — unless a
        # bulk caller (e.g. /datasets/{id}/generate-cases) set `_defer_commit`, in
        # which case we only flush so in-loop reads still see the row and the whole
        # batch is committed once at the end.
        if getattr(self, "_defer_commit", False):
            self.db.flush()
        else:
            self.db.commit()

    def get_by_id(self, case_id: str) -> RecoveryCase | None:
        # Skipping full mapping for brevity in this foundational phase,
        # normally you would map the SQLAlchemy model back to the Pydantic Domain Model.
        # But we need it for the GET API.
        db_case = self.db.query(CaseModel).filter(CaseModel.case_id == case_id).first()
        if not db_case:
            return None

        case = RecoveryCase(
            case_id=db_case.case_id,
            customer_id=db_case.customer_id,
            risk_category=db_case.risk_category,
            reference_id=db_case.reference_id,
            amount_at_risk=Money(amount=db_case.amount_at_risk, currency=db_case.currency),
            expected_recoverable_value=Money(
                amount=db_case.expected_recoverable_value, currency=db_case.currency
            )
            if db_case.expected_recoverable_value is not None
            else None,
            current_state=db_case.current_state,
            risk_assessment=RiskAssessment(**db_case.risk_assessment)
            if db_case.risk_assessment
            else None,
            diagnosis=RootCauseDiagnosis(**db_case.diagnosis) if db_case.diagnosis else None,
            prediction=RecoveryPrediction(**db_case.prediction) if db_case.prediction else None,
            recommendation=ActionRecommendation(**db_case.recommendation)
            if db_case.recommendation
            else None,
            policy_decision=PolicyDecision(**db_case.policy_decision)
            if db_case.policy_decision
            else None,
            execution_record=ExecutionRecord(**db_case.execution_record)
            if db_case.execution_record
            else None,
            outcome=RecoveryOutcome(**db_case.outcome) if db_case.outcome else None,
            linked_events=[
                RevenueEvent(
                    event_id=e.event_id,
                    customer_id=e.customer_id,
                    external_system=e.external_system,
                    external_event_id=e.external_event_id,
                    reference_id=e.reference_id,
                    risk_category=e.risk_category,
                    amount=Money(amount=e.amount, currency=e.currency),
                    timestamp=e.timestamp.replace(tzinfo=UTC)
                    if e.timestamp.tzinfo is None
                    else e.timestamp,
                    raw_payload=e.raw_payload,
                )
                for e in db_case.events
            ],
        )
        return case

    def get_event_by_external_id(
        self, external_system: str, external_event_id: str
    ) -> RevenueEvent | None:
        e = (
            self.db.query(EventModel)
            .filter(
                EventModel.external_system == external_system,
                EventModel.external_event_id == external_event_id,
            )
            .first()
        )
        if e:
            return RevenueEvent(
                event_id=e.event_id,
                customer_id=e.customer_id,
                external_system=e.external_system,
                external_event_id=e.external_event_id,
                reference_id=e.reference_id,
                risk_category=e.risk_category,
                amount=Money(amount=e.amount, currency=e.currency),
                timestamp=e.timestamp.replace(tzinfo=UTC)
                if e.timestamp.tzinfo is None
                else e.timestamp,
                raw_payload=e.raw_payload,
            )
        return None

    def get_active_case_for_customer(
        self, customer_id: str, risk_category: str, reference_id: str | None
    ) -> RecoveryCase | None:
        if not reference_id:
            return None

        db_case = (
            self.db.query(CaseModel)
            .filter(
                CaseModel.customer_id == customer_id,
                CaseModel.risk_category == risk_category,
                CaseModel.reference_id == reference_id,
                CaseModel.current_state.in_(ACTIVE_STATES),
            )
            .first()
        )

        if db_case:
            return self.get_by_id(db_case.case_id)
        return None
