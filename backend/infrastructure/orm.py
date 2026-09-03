from datetime import UTC, datetime

from sqlalchemy import JSON, Column, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import relationship

from domain.models import CaseState, RiskCategory
from infrastructure.db import Base


class CaseModel(Base):
    __tablename__ = "recovery_cases"

    case_id = Column(String, primary_key=True, index=True)
    customer_id = Column(String, index=True, nullable=False)
    risk_category = Column(Enum(RiskCategory), nullable=False)
    reference_id = Column(String, index=True, nullable=True)

    amount_at_risk = Column(Numeric(precision=18, scale=4), nullable=False)
    expected_recoverable_value = Column(Numeric(precision=18, scale=4), nullable=True)
    currency = Column(String, default="INR", nullable=False)

    current_state = Column(Enum(CaseState), nullable=False, default=CaseState.DETECTED)
    risk_assessment = Column(JSON, nullable=True)
    diagnosis = Column(JSON, nullable=True)
    prediction = Column(JSON, nullable=True)
    recommendation = Column(JSON, nullable=True)
    policy_decision = Column(JSON, nullable=True)
    execution_record = Column(JSON, nullable=True)
    outcome = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    events = relationship("EventModel", back_populates="case")
    audits = relationship("AuditModel", back_populates="case")


class EventModel(Base):
    __tablename__ = "revenue_events"

    event_id = Column(String, primary_key=True, index=True)
    case_id = Column(String, ForeignKey("recovery_cases.case_id"), nullable=False)
    customer_id = Column(String, nullable=False)
    external_system = Column(String, nullable=False)
    external_event_id = Column(String, nullable=False, index=True)
    reference_id = Column(String, index=True, nullable=True)
    risk_category = Column(Enum(RiskCategory), nullable=False)

    amount = Column(Numeric(precision=18, scale=4), nullable=False)
    currency = Column(String, default="INR")

    timestamp = Column(DateTime, nullable=False)
    raw_payload = Column(JSON, nullable=False)

    case = relationship("CaseModel", back_populates="events")

    __table_args__ = (
        UniqueConstraint("external_system", "external_event_id", name="uq_external_event_sys_id"),
    )


class AuditModel(Base):
    __tablename__ = "audit_records"

    id = Column(String, primary_key=True)
    case_id = Column(
        String, ForeignKey("recovery_cases.case_id"), index=True, nullable=True
    )  # Nullable for system-level audits like dedup
    from_state = Column(String)
    to_state = Column(String)
    evidence = Column(JSON)
    timestamp = Column(DateTime, default=lambda: datetime.now(UTC))

    case = relationship("CaseModel", back_populates="audits")


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_keys"

    idempotency_key = Column(String, primary_key=True)
    execution_record = Column(JSON, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(UTC))


class ExecutionAttemptModel(Base):
    """Append-only ledger of every recovery action the system has attempted for a
    case. Used by the Policy Engine to enforce retry / cooldown / contact limits
    against real history instead of a proxy on event counts."""

    __tablename__ = "execution_attempts"

    id = Column(String, primary_key=True)
    case_id = Column(String, ForeignKey("recovery_cases.case_id"), index=True, nullable=False)
    action_type = Column(String, nullable=False)
    channel = Column(String, nullable=True)  # "payment" | "communication"
    status = Column(String, nullable=False)  # ExecutionStatus value
    idempotency_key = Column(String, index=True, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), index=True)
