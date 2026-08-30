import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from domain.models import (
    RecoveryCase,
    RootCauseDiagnosis,
    RootCauseCategory,
    DiagnosisStatus,
    RiskCategory,
    RevenueEvent
)

class EvidenceBuilder:
    """Extracts structured evidence from the Case and its RevenueEvents."""
    
    @staticmethod
    def extract_evidence(case: RecoveryCase) -> Dict[str, Any]:
        events = sorted(case.linked_events, key=lambda e: e.timestamp)
        
        evidence: Dict[str, Any] = {
            "event_count": len(events),
            "failure_codes": [],
            "error_messages": [],
            "has_nsf_evidence": False,
            "has_network_timeout": False,
            "has_expired_card": False,
            "abandonment_stage": None,
            "promise_date_passed": False
        }
        
        now = datetime.now(timezone.utc)
        
        for e in events:
            payload = e.raw_payload or {}
            failure_code = payload.get("failure_code") or payload.get("decline_code")
            if failure_code:
                evidence["failure_codes"].append(failure_code)
                
                if failure_code in ["insufficient_funds", "nsf", "balance_too_low"]:
                    evidence["has_nsf_evidence"] = True
                if failure_code in ["network_error", "timeout", "gateway_timeout"]:
                    evidence["has_network_timeout"] = True
                if failure_code in ["expired_card", "invalid_expiry"]:
                    evidence["has_expired_card"] = True
            
            error_msg = payload.get("error_message")
            if error_msg:
                evidence["error_messages"].append(error_msg)
                
            stage = payload.get("checkout_stage")
            if stage:
                evidence["abandonment_stage"] = stage
                
            promise_date_str = payload.get("promise_date")
            if promise_date_str:
                try:
                    promise_date = datetime.fromisoformat(promise_date_str)
                    if promise_date.tzinfo is None:
                        promise_date = promise_date.replace(tzinfo=timezone.utc)
                    if promise_date < now:
                        evidence["promise_date_passed"] = True
                except ValueError:
                    pass
                    
        return evidence


class DeterministicDiagnosisEngine:
    """Diagnoses the root cause deterministically based on structured evidence."""
    
    def __init__(self, version: str = "deterministic-v1.0"):
        self.version = version

    def diagnose(self, case: RecoveryCase) -> RootCauseDiagnosis:
        evidence = EvidenceBuilder.extract_evidence(case)
        event_ids = [e.event_id for e in case.linked_events]
        
        cause = RootCauseCategory.UNKNOWN
        status = DiagnosisStatus.UNKNOWN
        confidence = 0.0
        
        # Conflicting Evidence Check
        if evidence["has_nsf_evidence"] and evidence["has_expired_card"]:
            return RootCauseDiagnosis(
                diagnosis_id=f"diag_{uuid.uuid4().hex[:8]}",
                cause_category=RootCauseCategory.CONFLICTING_EVIDENCE,
                confidence=0.3,
                status=DiagnosisStatus.UNKNOWN,
                supporting_signals={"conflict": "NSF and Expired Card both present"},
                evidence_references=event_ids,
                diagnostic_method=self.version
            )
            
        if case.risk_category == RiskCategory.FAILED_PAYMENT:
            if evidence["has_nsf_evidence"]:
                cause = RootCauseCategory.INSUFFICIENT_FUNDS
                status = DiagnosisStatus.CONFIRMED
                confidence = 0.95
            elif evidence["has_network_timeout"]:
                cause = RootCauseCategory.NETWORK_FAILURE
                status = DiagnosisStatus.INFERRED
                confidence = 0.70
            elif evidence["has_expired_card"]:
                cause = RootCauseCategory.PAYMENT_METHOD_INVALID
                status = DiagnosisStatus.CONFIRMED
                confidence = 0.95
                
        elif case.risk_category == RiskCategory.CHECKOUT_ABANDONMENT:
            if evidence["abandonment_stage"] == "payment":
                cause = RootCauseCategory.PAYMENT_FRICTION
                status = DiagnosisStatus.INFERRED
                confidence = 0.80
                
        elif case.risk_category == RiskCategory.FAILED_SUBSCRIPTION:
            if evidence["has_nsf_evidence"]:
                cause = RootCauseCategory.INSUFFICIENT_FUNDS
                status = DiagnosisStatus.CONFIRMED
                confidence = 0.95
            elif evidence["failure_codes"]:
                # If there are failure codes but not NSF/expired
                cause = RootCauseCategory.MANDATE_FAILURE
                status = DiagnosisStatus.INFERRED
                confidence = 0.60
                
        elif case.risk_category == RiskCategory.OVERDUE_INVOICE:
            if evidence["event_count"] > 1:
                cause = RootCauseCategory.UNRESOLVED_DISPUTE
                status = DiagnosisStatus.INFERRED
                confidence = 0.50
                
        elif case.risk_category == RiskCategory.BROKEN_PROMISE:
            if evidence["promise_date_passed"]:
                cause = RootCauseCategory.MISSED_COMMITMENT
                status = DiagnosisStatus.CONFIRMED
                confidence = 0.90
        
        return RootCauseDiagnosis(
            diagnosis_id=f"diag_{uuid.uuid4().hex[:8]}",
            cause_category=cause,
            confidence=confidence,
            status=status,
            supporting_signals=evidence,
            evidence_references=event_ids,
            diagnostic_method=self.version
        )
