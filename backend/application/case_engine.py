import uuid

from domain.interfaces import IAuditRecorder, ICaseRepository
from domain.lifecycle import CaseLifecycleManager
from domain.models import CaseState, RecoveryCase, RevenueEvent

# A case is "active" (still eligible to have new events correlated onto it)
# unless it has reached a terminal outcome. Derive from CaseState so new
# in-flight states can't be silently missed by correlation.
_TERMINAL_STATES = {
    CaseState.FULLY_RECOVERED,
    CaseState.PARTIALLY_RECOVERED,
    CaseState.CLOSED_NOT_RECOVERED,
    CaseState.DENIED,
    CaseState.STOPPED,
}
ACTIVE_STATES = {s for s in CaseState if s not in _TERMINAL_STATES}


class DuplicateEventException(Exception):
    pass


class CaseEngine:
    def __init__(self, repository: ICaseRepository, audit_recorder: IAuditRecorder):
        self.repository = repository
        self.audit_recorder = audit_recorder

    def ingest_normalized_event(self, event: RevenueEvent) -> tuple[RecoveryCase, bool]:
        """
        Takes a normalized RevenueEvent and deduplicates/correlates it.
        Returns the RecoveryCase and a boolean indicating if it was newly created.
        """
        # 1. Deduplication
        existing_event = self.repository.get_event_by_external_id(
            external_system=event.external_system, external_event_id=event.external_event_id
        )
        if existing_event:
            self.audit_recorder.log_transition(
                case_id="SYSTEM",
                from_state="N/A",
                to_state="N/A",
                evidence={"action": "deduplicated", "external_id": event.external_event_id},
            )
            raise DuplicateEventException(f"Event {event.external_event_id} already processed.")

        # 2. Correlation
        # If the event lacks a strong reference_id (e.g. invoice id, transaction id), it cannot be safely
        # correlated to an existing financial obligation. Therefore, it will form a new separate case.
        active_case = None
        if event.reference_id:
            active_case = self.repository.get_active_case_for_customer(
                customer_id=event.customer_id,
                risk_category=event.risk_category,
                reference_id=event.reference_id,
            )

        is_new_case = False
        if active_case:
            case = active_case
            case.linked_events.append(event)
            self._update_amount_at_risk(case)
            self.audit_recorder.log_transition(
                case_id=case.case_id,
                from_state=case.current_state,
                to_state=case.current_state,
                evidence={
                    "action": "event_attached",
                    "event_id": event.event_id,
                    "reference_id": event.reference_id,
                },
            )
        else:
            is_new_case = True
            case = RecoveryCase(
                case_id=f"case_{uuid.uuid4().hex[:8]}",
                customer_id=event.customer_id,
                risk_category=event.risk_category,
                reference_id=event.reference_id,
                linked_events=[event],
                amount_at_risk=event.amount,
            )
            # Initialize lifecycle
            CaseLifecycleManager.initialize_case(case)
            self.audit_recorder.log_transition(
                case_id=case.case_id,
                from_state=CaseState.DETECTED,
                to_state=CaseState.OPEN,
                evidence={
                    "action": "case_created",
                    "trigger_event": event.event_id,
                    "reference_id": event.reference_id,
                },
            )

        # 3. Transactional Save (The repository handles the atomic commit)
        self.repository.save(case)
        return case, is_new_case

    def _update_amount_at_risk(self, case: RecoveryCase):
        """
        Deterministic rule: Amount at risk is determined by the latest event's amount,
        assuming related events in the same case are retries/updates for the same obligation.
        We do NOT simply sum them.
        """
        if not case.linked_events:
            return

        # Sort by timestamp to find the latest
        latest_event = max(case.linked_events, key=lambda e: e.timestamp)
        case.amount_at_risk = latest_event.amount
