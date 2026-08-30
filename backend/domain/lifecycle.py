from domain.models import RecoveryCase, CaseState, PolicyDecisionStatus
from typing import List

class CaseLifecycleManager:
    @staticmethod
    def initialize_case(case: RecoveryCase) -> None:
        if case.current_state != CaseState.DETECTED:
            raise ValueError("Case must start in DETECTED state.")
        case.current_state = CaseState.OPEN

    @staticmethod
    def move_to_diagnosing(case: RecoveryCase) -> None:
        valid_from = [CaseState.OPEN, CaseState.WAITING]
        if case.current_state not in valid_from:
            raise ValueError(f"Cannot transition to DIAGNOSING from {case.current_state}")
        case.current_state = CaseState.DIAGNOSING

    @staticmethod
    def record_diagnosis(case: RecoveryCase) -> None:
        if case.current_state != CaseState.DIAGNOSING:
            raise ValueError(f"Cannot transition to ASSESSED from {case.current_state}")
        case.current_state = CaseState.ASSESSED

    @staticmethod
    def record_prediction_and_action(case: RecoveryCase) -> None:
        if case.current_state != CaseState.ASSESSED:
            raise ValueError(f"Cannot transition to ACTION_PROPOSED from {case.current_state}")
        case.current_state = CaseState.ACTION_PROPOSED

    @staticmethod
    def submit_for_policy_review(case: RecoveryCase) -> None:
        if case.current_state != CaseState.ACTION_PROPOSED:
            raise ValueError(f"Cannot transition to POLICY_REVIEW from {case.current_state}")
        case.current_state = CaseState.POLICY_REVIEW

    @staticmethod
    def apply_policy_decision(case: RecoveryCase) -> None:
        if case.current_state != CaseState.POLICY_REVIEW:
            raise ValueError(f"Cannot apply policy unless in POLICY_REVIEW")
        
        if not case.policy_decision:
            raise ValueError("No policy decision found on case")
            
        status = case.policy_decision.status
        if status == PolicyDecisionStatus.PERMITTED:
            case.current_state = CaseState.APPROVED
        elif status == PolicyDecisionStatus.DENIED:
            case.current_state = CaseState.DENIED
        elif status == PolicyDecisionStatus.WAIT:
            case.current_state = CaseState.WAITING
        elif status == PolicyDecisionStatus.ESCALATE:
            case.current_state = CaseState.ESCALATED
            
    # Add more state transitions as needed for execution and verification
