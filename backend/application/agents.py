import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from domain.models import (
    RecoveryCase,
    ActionType,
    PolicyDecisionStatus,
    ExecutionRecord,
    ExecutionStatus,
    RiskCategory
)
from infrastructure.adapters import MockExecutionAdapter

class IRecoveryAgent:
    def can_handle(self, action: ActionType) -> bool:
        raise NotImplementedError
        
    def prepare_execution(self, case: RecoveryCase, action: ActionType) -> dict:
        raise NotImplementedError

class PaymentRecoveryAgent(IRecoveryAgent):
    def can_handle(self, action: ActionType) -> bool:
        return action in [ActionType.RETRY_PAYMENT, ActionType.REQUEST_PAYMENT_METHOD_UPDATE, ActionType.SEND_PAYMENT_REMINDER]
        
    def prepare_execution(self, case: RecoveryCase, action: ActionType) -> dict:
        return {
            "customer_id": case.customer_id,
            "amount": case.amount_at_risk.amount,
            "currency": case.amount_at_risk.currency,
            "reference_id": case.reference_id,
            "action": action.value,
            "agent_type": "PaymentRecoveryAgent"
        }

class CheckoutRecoveryAgent(IRecoveryAgent):
    def can_handle(self, action: ActionType) -> bool:
        return action in [ActionType.SEND_CHECKOUT_REMINDER, ActionType.OFFER_CHECKOUT_ASSISTANCE]
        
    def prepare_execution(self, case: RecoveryCase, action: ActionType) -> dict:
        return {
            "customer_id": case.customer_id,
            "action": action.value,
            "agent_type": "CheckoutRecoveryAgent"
        }

class SubscriptionRecoveryAgent(IRecoveryAgent):
    def can_handle(self, action: ActionType) -> bool:
        return action in [ActionType.RETRY_BILLING, ActionType.SEND_SUBSCRIPTION_REMINDER]
        
    def prepare_execution(self, case: RecoveryCase, action: ActionType) -> dict:
        return {
            "customer_id": case.customer_id,
            "action": action.value,
            "agent_type": "SubscriptionRecoveryAgent"
        }

class AgentOrchestrator:
    def __init__(self, execution_adapter=MockExecutionAdapter()):
        self.adapter = execution_adapter
        self.agents = [
            PaymentRecoveryAgent(),
            CheckoutRecoveryAgent(),
            SubscriptionRecoveryAgent()
        ]
        
    def _is_policy_fresh(self, case: RecoveryCase) -> bool:
        # Simplistic freshness: No new events since policy was evaluated
        if not case.policy_decision:
            return False
        
        last_event_time = max([e.timestamp for e in case.linked_events]) if case.linked_events else None
        if last_event_time and last_event_time > case.policy_decision.timestamp:
            return False
            
        # In reality, also check if case amount changed, etc.
        return True
        
    def execute(self, case: RecoveryCase, requested_action: ActionType) -> Optional[ExecutionRecord]:
        # 1. Verify Policy Exists and is PERMITTED
        if not case.policy_decision or case.policy_decision.status != PolicyDecisionStatus.PERMITTED:
            return ExecutionRecord(
                execution_id=f"exec_{uuid.uuid4().hex[:8]}",
                action_type=requested_action,
                agent_type="Orchestrator",
                policy_decision_id=case.policy_decision.decision_id if case.policy_decision else "NONE",
                policy_version=case.policy_decision.policy_version if case.policy_decision else "NONE",
                parameters={},
                idempotency_key="REJECTED_POLICY",
                status=ExecutionStatus.REJECTED,
                adapter_used="NONE",
                result_metadata={"error": "Policy not PERMITTED."}
            )
            
        # 2. Verify Freshness
        if not self._is_policy_fresh(case):
            return ExecutionRecord(
                execution_id=f"exec_{uuid.uuid4().hex[:8]}",
                action_type=requested_action,
                agent_type="Orchestrator",
                policy_decision_id=case.policy_decision.decision_id,
                policy_version=case.policy_decision.policy_version,
                parameters={},
                idempotency_key="REJECTED_STALE",
                status=ExecutionStatus.REJECTED,
                adapter_used="NONE",
                result_metadata={"error": "Policy decision is stale."}
            )
            
        # 3. Verify Exact Action Match
        # The recommended action must match the requested action, and policy must have evaluated it.
        # Since policy evaluates the top candidate, we check the top candidate.
        if case.recommendation.top_candidate.action_type != requested_action:
            return ExecutionRecord(
                execution_id=f"exec_{uuid.uuid4().hex[:8]}",
                action_type=requested_action,
                agent_type="Orchestrator",
                policy_decision_id=case.policy_decision.decision_id,
                policy_version=case.policy_decision.policy_version,
                parameters={},
                idempotency_key="REJECTED_MISMATCH",
                status=ExecutionStatus.REJECTED,
                adapter_used="NONE",
                result_metadata={"error": "Requested action does not match policy-authorized action."}
            )
            
        # 4. Select Agent
        selected_agent = None
        for agent in self.agents:
            if agent.can_handle(requested_action):
                selected_agent = agent
                break
                
        if not selected_agent:
            return ExecutionRecord(
                execution_id=f"exec_{uuid.uuid4().hex[:8]}",
                action_type=requested_action,
                agent_type="Orchestrator",
                policy_decision_id=case.policy_decision.decision_id,
                policy_version=case.policy_decision.policy_version,
                parameters={},
                idempotency_key="REJECTED_NO_AGENT",
                status=ExecutionStatus.REJECTED,
                adapter_used="NONE",
                result_metadata={"error": "No specialized agent found for action."}
            )
            
        # 5. Prepare Execution
        try:
            params = selected_agent.prepare_execution(case, requested_action)
        except Exception as e:
            return ExecutionRecord(
                execution_id=f"exec_{uuid.uuid4().hex[:8]}",
                action_type=requested_action,
                agent_type=selected_agent.__class__.__name__,
                policy_decision_id=case.policy_decision.decision_id,
                policy_version=case.policy_decision.policy_version,
                parameters={},
                idempotency_key="FAILED_PREP",
                status=ExecutionStatus.FAILED,
                adapter_used="NONE",
                result_metadata={"error": f"Agent prep failed: {str(e)}"}
            )
            
        # Idempotency Key
        idem_key = f"{case.case_id}_{requested_action.value}_{case.policy_decision.decision_id}"
        
        # 6. Execute (Simulated)
        try:
            adapter_result = self.adapter.execute(params)
            status = ExecutionStatus.COMPLETED_SIMULATED if adapter_result["adapter_status"] == "COMPLETED_SIMULATED" else ExecutionStatus.FAILED
        except Exception as e:
            adapter_result = {"error": str(e)}
            status = ExecutionStatus.FAILED
            
        return ExecutionRecord(
            execution_id=f"exec_{uuid.uuid4().hex[:8]}",
            action_type=requested_action,
            agent_type=selected_agent.__class__.__name__,
            policy_decision_id=case.policy_decision.decision_id,
            policy_version=case.policy_decision.policy_version,
            parameters=params,
            idempotency_key=idem_key,
            status=status,
            adapter_used=self.adapter.__class__.__name__,
            result_metadata=adapter_result
        )
