import uuid
from decimal import Decimal
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
    "pending") force a specific outcome — used by tests. Otherwise the outcome
    is drawn deterministically from the case id BUT weighted by the case's own
    recovery-probability estimate, so a case the pipeline scored at 80% mostly
    comes back and a 10% case mostly does not. This keeps the sandbox honest —
    the "chance back" column and the "recovered" column tell one story instead
    of contradicting each other.
    """

    def verify(self, case: RecoveryCase, external_reference: str) -> dict:
        ref = (external_reference or "").lower()
        src = "SANDBOX_SIMULATION"
        amt = float(case.amount_at_risk.amount)

        if "full" in ref:
            return {"status": RecoveryOutcomeStatus.FULLY_RECOVERED, "amount": amt, "source": src}
        if "partial" in ref:
            return {"status": RecoveryOutcomeStatus.PARTIALLY_RECOVERED, "amount": max(0.01, amt / 2), "source": src}
        if "fail" in ref:
            return {"status": RecoveryOutcomeStatus.NOT_RECOVERED, "amount": 0.0, "source": src}
        if "pending" in ref:
            return {"status": RecoveryOutcomeStatus.PENDING_VERIFICATION, "amount": 0.0, "source": src}

        # A stable pseudo-random draw in [0, 1) for this case + execution.
        seed = f"{case.case_id}:{external_reference}"
        u = (int(__import__("hashlib").sha1(seed.encode()).hexdigest(), 16) % 10_000) / 10_000.0

        p = 0.5
        if case.prediction and case.prediction.recovery_probability is not None:
            p = max(0.0, min(1.0, float(case.prediction.recovery_probability)))

        if u < p * 0.72:                       # the confident core of the estimate lands in full
            return {"status": RecoveryOutcomeStatus.FULLY_RECOVERED, "amount": amt, "source": src}
        if u < p:                              # the tail of the estimate lands as a partial
            frac = 0.25 + 0.55 * (u / max(p, 1e-6))
            return {"status": RecoveryOutcomeStatus.PARTIALLY_RECOVERED,
                    "amount": round(max(0.01, amt * frac), 2), "source": src}
        return {"status": RecoveryOutcomeStatus.NOT_RECOVERED, "amount": 0.0, "source": src}

class VerificationEngine:
    def __init__(self, adapter: IOutcomeVerification = MockOutcomeVerificationAdapter()):
        self.adapter = adapter
        
    def reconcile(self, case: RecoveryCase, external_reference: str) -> RecoveryOutcome:
        # 1. Ask authoritative source
        verification_data = self.adapter.verify(case, external_reference)
        
        verified_amount = float(verification_data.get("amount", 0.0) or 0.0)
        source_status = verification_data.get("status", RecoveryOutcomeStatus.PENDING_VERIFICATION)
        source = verification_data.get("source", "UNKNOWN")
        expected = float(case.amount_at_risk.amount)

        # Financial Invariants Enforcement
        # INVARIANT 5: ActualAmountRecovered must be non-negative.
        if verified_amount < 0:
            verified_amount = 0.0

        # INVARIANT 6: ActualAmountRecovered must not exceed the verified recoverable transaction amount.
        if verified_amount > expected:
            verified_amount = expected

        # Determine exact Status deterministically
        if source_status == RecoveryOutcomeStatus.PENDING_VERIFICATION:
            final_status = RecoveryOutcomeStatus.PENDING_VERIFICATION
            verified_amount = 0.0
            reconciliation = "Pending external source response"
        elif verified_amount >= expected:
            final_status = RecoveryOutcomeStatus.FULLY_RECOVERED
            verified_amount = expected
            reconciliation = "Amount fully matches expected"
        elif verified_amount > 0:
            final_status = RecoveryOutcomeStatus.PARTIALLY_RECOVERED
            reconciliation = f"Shortfall of {round(expected - verified_amount, 2)}"
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
            actual_amount_recovered=Money(amount=Decimal(f"{verified_amount:.4f}"), currency=case.amount_at_risk.currency),
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
