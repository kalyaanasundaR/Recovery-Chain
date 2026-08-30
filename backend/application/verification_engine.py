import uuid
from datetime import datetime, timezone
from typing import Optional

from domain.models import (
    RecoveryCase,
    RecoveryOutcome,
    RecoveryOutcomeStatus,
    Money,
    CaseState
)

class IOutcomeVerification:
    def verify(self, case: RecoveryCase, external_reference: str) -> dict:
        """
        Interacts with the authoritative source to get the true financial outcome.
        Returns a dict with 'status' (RecoveryOutcomeStatus), 'amount' (float), and 'source' (str).
        """
        raise NotImplementedError

class MockOutcomeVerificationAdapter(IOutcomeVerification):
    """SIMULATED settlement source.

    Explicit keywords in `external_reference` ("full" / "partial" / "fail" /
    "pending") force a specific outcome — used by tests. For any other reference
    (e.g. a real execution id) the outcome is derived deterministically from the
    case id, so a genuine execution always reconciles to a terminal result
    instead of hanging in PENDING forever.
    """

    def verify(self, case: RecoveryCase, external_reference: str) -> dict:
        ref = (external_reference or "").lower()
        src = "SIMULATED_STRIPE_MOCK"

        if "full" in ref:
            return {"status": RecoveryOutcomeStatus.FULLY_RECOVERED, "amount": case.amount_at_risk.amount, "source": src}
        if "partial" in ref:
            return {"status": RecoveryOutcomeStatus.PARTIALLY_RECOVERED,
                    "amount": max(0.01, case.amount_at_risk.amount / 2), "source": src}
        if "fail" in ref:
            return {"status": RecoveryOutcomeStatus.NOT_RECOVERED, "amount": 0.0, "source": src}
        if "pending" in ref:
            return {"status": RecoveryOutcomeStatus.PENDING_VERIFICATION, "amount": 0.0, "source": src}

        # Deterministic sandbox outcome: ~70% full, ~20% partial, ~10% none.
        bucket = int(__import__("hashlib").sha1(case.case_id.encode()).hexdigest(), 16) % 10
        if bucket < 7:
            return {"status": RecoveryOutcomeStatus.FULLY_RECOVERED, "amount": case.amount_at_risk.amount, "source": src}
        if bucket < 9:
            return {"status": RecoveryOutcomeStatus.PARTIALLY_RECOVERED,
                    "amount": max(0.01, case.amount_at_risk.amount / 2), "source": src}
        return {"status": RecoveryOutcomeStatus.NOT_RECOVERED, "amount": 0.0, "source": src}

class VerificationEngine:
    def __init__(self, adapter: IOutcomeVerification = MockOutcomeVerificationAdapter()):
        self.adapter = adapter
        
    def reconcile(self, case: RecoveryCase, external_reference: str) -> RecoveryOutcome:
        # 1. Ask authoritative source
        verification_data = self.adapter.verify(case, external_reference)
        
        verified_amount = verification_data.get("amount", 0.0)
        source_status = verification_data.get("status", RecoveryOutcomeStatus.PENDING_VERIFICATION)
        source = verification_data.get("source", "UNKNOWN")
        
        # Financial Invariants Enforcement
        # INVARIANT 5: ActualAmountRecovered must be non-negative.
        if verified_amount < 0:
            verified_amount = 0.0
            
        # INVARIANT 6: ActualAmountRecovered must not exceed the verified recoverable transaction amount.
        if verified_amount > case.amount_at_risk.amount:
            verified_amount = case.amount_at_risk.amount
            
        # Determine exact Status deterministically
        if source_status == RecoveryOutcomeStatus.PENDING_VERIFICATION:
            final_status = RecoveryOutcomeStatus.PENDING_VERIFICATION
            verified_amount = 0.0
            reconciliation = "Pending external source response"
        elif verified_amount >= case.amount_at_risk.amount:
            final_status = RecoveryOutcomeStatus.FULLY_RECOVERED
            verified_amount = case.amount_at_risk.amount
            reconciliation = "Amount fully matches expected"
        elif verified_amount > 0:
            final_status = RecoveryOutcomeStatus.PARTIALLY_RECOVERED
            reconciliation = f"Shortfall of {case.amount_at_risk.amount - verified_amount}"
        else:
            final_status = RecoveryOutcomeStatus.NOT_RECOVERED
            verified_amount = 0.0
            reconciliation = "Confirmed failure from source"
            
        execution_id = case.execution_record.execution_id if case.execution_record else None
            
        return RecoveryOutcome(
            outcome_id=f"out_{uuid.uuid4().hex[:8]}",
            case_id=case.case_id,
            execution_id=execution_id,
            status=final_status,
            expected_amount=case.amount_at_risk,
            actual_amount_recovered=Money(amount=verified_amount, currency=case.amount_at_risk.currency),
            verification_source=source,
            external_reference=external_reference,
            reconciliation_status=reconciliation
        )
        
    def resolve_case_state(self, outcome_status: RecoveryOutcomeStatus) -> CaseState:
        if outcome_status == RecoveryOutcomeStatus.FULLY_RECOVERED:
            return CaseState.FULLY_RECOVERED
        elif outcome_status == RecoveryOutcomeStatus.PARTIALLY_RECOVERED:
            return CaseState.PARTIALLY_RECOVERED
        elif outcome_status == RecoveryOutcomeStatus.NOT_RECOVERED:
            return CaseState.CLOSED_NOT_RECOVERED
        else:
            return CaseState.PENDING_VERIFICATION
