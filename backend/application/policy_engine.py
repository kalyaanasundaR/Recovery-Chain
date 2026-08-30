import uuid
from typing import List
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

class DeterministicPolicyEngine:
    """
    Evaluates actions deterministically against a MerchantPolicy.
    Decision Precedence: DENIED > ESCALATE > WAIT > PERMITTED
    """
    
    def __init__(self, policy: MerchantPolicy = MerchantPolicy()):
        self.policy = policy
        
    def evaluate(self, case: RecoveryCase) -> PolicyDecision:
        rules_evaluated: List[RuleResult] = []
        failed_rules: List[RuleResult] = []
        
        status = PolicyDecisionStatus.PERMITTED
        reason = "All policy rules passed."
        
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
        if action == ActionType.RETRY_PAYMENT or action == ActionType.RETRY_BILLING:
            # Fake retry count check by counting failure events in the past 24h
            # Real impl would track execution events, but we don't have execution yet
            # So we approximate via event history
            now = datetime.now(timezone.utc)
            recent_failures = [
                e for e in case.linked_events 
                if (now - e.timestamp).total_seconds() <= (self.policy.payment_retry_cooldown_hours * 3600)
            ]
            
            if len(case.linked_events) >= self.policy.payment_max_retries:
                r = RuleResult(rule_name="PaymentMaxRetries", passed=False, details="Maximum payment retries exceeded.")
                rules_evaluated.append(r)
                failed_rules.append(r)
                # DENIED takes precedence over ESCALATE
                status = PolicyDecisionStatus.DENIED
                reason = r.details
            else:
                rules_evaluated.append(RuleResult(rule_name="PaymentMaxRetries", passed=True, details="Under max retries."))
                
            if len(recent_failures) > 0:
                r = RuleResult(rule_name="PaymentRetryCooldown", passed=False, details="Active cooldown period.")
                rules_evaluated.append(r)
                failed_rules.append(r)
                # If it's already DENIED, keep DENIED. Otherwise WAIT.
                if status != PolicyDecisionStatus.DENIED and status != PolicyDecisionStatus.ESCALATE:
                    status = PolicyDecisionStatus.WAIT
                    reason = r.details
            else:
                rules_evaluated.append(RuleResult(rule_name="PaymentRetryCooldown", passed=True, details="No active cooldown."))
                
        elif "REMINDER" in action.value:
            # We mock a communication limit check similarly
            now = datetime.now(timezone.utc)
            recent_failures = [
                e for e in case.linked_events 
                if (now - e.timestamp).total_seconds() <= 24 * 3600
            ]
            if len(recent_failures) > self.policy.communication_max_messages_24h:
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
