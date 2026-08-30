from abc import ABC, abstractmethod
from typing import List, Optional
from domain.models import (
    RecoveryCase, RevenueEvent, CandidateAction, PolicyDecision, Money, RecoveryOutcome
)

# --- Core Domain Orchestration Interfaces ---

class IEventIngestion(ABC):
    @abstractmethod
    def ingest(self, raw_payload: dict) -> RevenueEvent:
        pass

class ICaseRepository(ABC):
    @abstractmethod
    def save(self, case: RecoveryCase) -> None:
        pass

    @abstractmethod
    def get_by_id(self, case_id: str) -> Optional[RecoveryCase]:
        pass

    @abstractmethod
    def get_event_by_external_id(self, external_system: str, external_event_id: str) -> Optional[RevenueEvent]:
        """Used for idempotency / deduplication"""
        pass

    @abstractmethod
    def get_active_case_for_customer(self, customer_id: str, risk_category: str, reference_id: Optional[str]) -> Optional[RecoveryCase]:
        """Finds an open/active case matching the customer, risk category, and financial obligation reference."""
        pass

class ICaseStateManager(ABC):
    @abstractmethod
    def transition_state(self, case: RecoveryCase, to_state: str) -> None:
        pass

class IPolicyEvaluator(ABC):
    @abstractmethod
    def evaluate(self, case: RecoveryCase, action: CandidateAction) -> PolicyDecision:
        pass

class IOutcomeVerification(ABC):
    @abstractmethod
    def verify(self, case: RecoveryCase) -> RecoveryOutcome:
        pass

class IAuditRecorder(ABC):
    @abstractmethod
    def log_transition(self, case_id: str, from_state: str, to_state: str, evidence: dict) -> None:
        pass

# --- External Adapter Boundaries ---

class IPaymentAdapter(ABC):
    @abstractmethod
    def trigger_retry(self, customer_id: str, amount: Money) -> str:
        """Returns an execution tracking ID"""
        pass

class ICheckoutAdapter(ABC):
    @abstractmethod
    def retrieve_session(self, session_id: str) -> dict:
        pass

class ISubscriptionAdapter(ABC):
    @abstractmethod
    def get_subscription_status(self, subscription_id: str) -> str:
        pass

class IInvoiceAdapter(ABC):
    @abstractmethod
    def get_invoice_details(self, invoice_id: str) -> dict:
        pass

class ICommunicationAdapter(ABC):
    @abstractmethod
    def send_message(self, customer_id: str, template: str, context: dict) -> str:
        """Returns an execution tracking ID"""
        pass

class ICRMAdapter(ABC):
    @abstractmethod
    def check_consent(self, customer_id: str) -> bool:
        pass
