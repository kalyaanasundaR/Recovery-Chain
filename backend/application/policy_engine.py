import uuid
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel

from domain.models import (
    RecoveryCase,
    PolicyDecision,
    PolicyDecisionStatus,
    RuleResult,
    ActionType
)

class MerchantPolicy(BaseModel):
    version: str = "merchant-policy-v1.0"
    payment_max_retries: int = 3
    payment_retry_cooldown_hours: int = 24
    communication_max_messages_24h: int = 2
    financial_max_automated_amount: float = 5000.0


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class PolicyContext(BaseModel):
    """Real recovery history for a case, sourced from the execution_attempts
    ledger. When supplied, the Policy Engine uses this instead of the legacy
    proxy on `case.linked_events` (which counted the triggering failure itself
    as a prior attempt and made the standard retry flow perpetually WAIT)."""
    prior_payment_attempts: int = 0
    last_payment_attempt_at: Optional[datetime] = None
    comms_in_last_24h: int = 0
    consent_ok: bool = True
    stopped: bool = False

class DeterministicPolicyEngine:
    """
    Evaluates actions deterministically against a MerchantPolicy.
    Decision Precedence: DENIED > ESCALATE > WAIT > PERMITTED
    """
    
    def __init__(self, policy: MerchantPolicy = MerchantPolicy()):
        self.policy = policy
        
    def evaluate(self, case: RecoveryCase, context: Optional[PolicyContext] = None) -> PolicyDecision:
        rules_evaluated: List[RuleResult] = []
        failed_rules: List[RuleResult] = []

        status = PolicyDecisionStatus.PERMITTED
        reason = "All policy rules passed."

        # 0. Hard stops (only when a real context is supplied)
        if context is not None and context.stopped:
            return PolicyDecision(
                decision_id=f"pol_{uuid.uuid4().hex[:8]}",
                status=PolicyDecisionStatus.DENIED,
                policy_version=self.policy.version,
                rules_evaluated=[],
                failed_rules=[RuleResult(rule_name="StopRule", passed=False, details="Case is STOPPED; no further automated action.")],
                reason="Case is STOPPED.",
            )
        if context is not None and not context.consent_ok:
            return PolicyDecision(
                decision_id=f"pol_{uuid.uuid4().hex[:8]}",
                status=PolicyDecisionStatus.ESCALATE,
                policy_version=self.policy.version,
                rules_evaluated=[],
                failed_rules=[RuleResult(rule_name="ConsentCheck", passed=False, details="No customer consent on file for outreach.")],
                reason="Missing customer consent.",
            )

        # 1. Evidence Verification
        if not case.recommendation or not case.recommendation.top_candidate:
            return PolicyDecision(
                decision_id=f"pol_{uuid.uuid4().hex[:8]}",
                status=PolicyDecisionStatus.ESCALATE,
                policy_version=self.policy.version,
                rules_evaluated=[],
                failed_rules=[RuleResult(rule_name="EvidenceCheck", passed=False, details="No recommendation available.")],
                reason="Insufficient evidence to authorize an action."
            )
            
        action = case.recommendation.top_candidate.action_type
        
        # 2. Conflicting Diagnosis / Human Escalation Action
        if action == ActionType.ESCALATE_TO_HUMAN:
            r = RuleResult(rule_name="HumanEscalationAction", passed=False, details="Action explicitly requests escalation.")
            rules_evaluated.append(r)
            failed_rules.append(r)
            status = PolicyDecisionStatus.ESCALATE
            reason = r.details
            
        # 3. Financial Limits
        if case.amount_at_risk.amount > self.policy.financial_max_automated_amount:
            r = RuleResult(
                rule_name="FinancialAutomatedLimit", 
                passed=False, 
                details=f"Amount {case.amount_at_risk.amount} exceeds automated threshold {self.policy.financial_max_automated_amount}."
            )
            rules_evaluated.append(r)
            failed_rules.append(r)
            status = PolicyDecisionStatus.ESCALATE
            reason = r.details
        else:
            rules_evaluated.append(RuleResult(rule_name="FinancialAutomatedLimit", passed=True, details="Amount within limit."))
            
        # 4. Action-Specific Limits
        now = datetime.now(timezone.utc)
        if action == ActionType.RETRY_PAYMENT or action == ActionType.RETRY_BILLING:
            if context is not None:
                # Real history from the execution_attempts ledger.
                attempt_count = context.prior_payment_attempts
                in_cooldown = (
                    context.last_payment_attempt_at is not None
                    and (now - _aware(context.last_payment_attempt_at)).total_seconds()
                    <= (self.policy.payment_retry_cooldown_hours * 3600)
                )
            else:
                # Legacy proxy: count linked failure events (kept so unit tests
                # that pass hand-built cases without a ledger still hold).
                recent = [e for e in case.linked_events
                          if (now - e.timestamp).total_seconds() <= (self.policy.payment_retry_cooldown_hours * 3600)]
                attempt_count = len(case.linked_events)
                in_cooldown = len(recent) > 0

            if attempt_count >= self.policy.payment_max_retries:
                r = RuleResult(rule_name="PaymentMaxRetries", passed=False, details="Maximum payment retries exceeded.")
                rules_evaluated.append(r)
                failed_rules.append(r)
                status = PolicyDecisionStatus.DENIED
                reason = r.details
            else:
                rules_evaluated.append(RuleResult(rule_name="PaymentMaxRetries", passed=True, details="Under max retries."))

            if in_cooldown:
                r = RuleResult(rule_name="PaymentRetryCooldown", passed=False, details="Active cooldown period.")
                rules_evaluated.append(r)
                failed_rules.append(r)
                if status != PolicyDecisionStatus.DENIED and status != PolicyDecisionStatus.ESCALATE:
                    status = PolicyDecisionStatus.WAIT
                    reason = r.details
            else:
                rules_evaluated.append(RuleResult(rule_name="PaymentRetryCooldown", passed=True, details="No active cooldown."))

        elif "REMINDER" in action.value:
            if context is not None:
                comms = context.comms_in_last_24h
            else:
                comms = len([e for e in case.linked_events
                             if (now - e.timestamp).total_seconds() <= 24 * 3600])
            if comms > self.policy.communication_max_messages_24h:
                r = RuleResult(rule_name="CommunicationMaxMessages", passed=False, details="Max communications exceeded in 24h.")
                rules_evaluated.append(r)
                failed_rules.append(r)
                if status != PolicyDecisionStatus.DENIED and status != PolicyDecisionStatus.ESCALATE:
                    status = PolicyDecisionStatus.WAIT
                    reason = r.details
            else:
                rules_evaluated.append(RuleResult(rule_name="CommunicationMaxMessages", passed=True, details="Within communication limit."))

        return PolicyDecision(
            decision_id=f"pol_{uuid.uuid4().hex[:8]}",
            status=status,
            policy_version=self.policy.version,
            rules_evaluated=rules_evaluated,
            failed_rules=failed_rules,
            reason=reason
        )
