import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from domain.models import (
    RecoveryCase,
    RecoveryPrediction,
    RiskCategory,
    RootCauseCategory,
    DiagnosisStatus
)

class FeatureExtractor:
    """Extracts features strictly based on information available AT PREDICTION TIME."""
    
    VERSION = "features-v1.0"

    @staticmethod
    def extract_features(case: RecoveryCase) -> Dict[str, Any]:
        features: Dict[str, Any] = {
            "risk_score": case.risk_assessment.score if case.risk_assessment else 0.5,
            "risk_category": case.risk_category.value,
            "amount": case.amount_at_risk.amount,
            "event_count": len(case.linked_events),
        }
        
        if case.diagnosis:
            features["cause_category"] = case.diagnosis.cause_category.value
            features["diagnosis_confidence"] = case.diagnosis.confidence
            features["diagnosis_status"] = case.diagnosis.status.value
        else:
            features["cause_category"] = RootCauseCategory.UNKNOWN.value
            features["diagnosis_confidence"] = 0.0
            features["diagnosis_status"] = DiagnosisStatus.UNKNOWN.value
            
        # Age feature
        age_hours = 0.0
        if case.linked_events:
            events = sorted(case.linked_events, key=lambda e: e.timestamp)
            first_timestamp = events[0].timestamp
            age_hours = max((datetime.now(timezone.utc) - first_timestamp).total_seconds() / 3600.0, 0)
        features["age_hours"] = round(age_hours, 2)
        
        return features


class DeterministicBaselinePredictor:
    """
    A baseline predictor used when INSUFFICIENT TRAINING DATA exists for real ML.
    It produces a synthetic, heuristic-driven probability to satisfy the pipeline contract.
    """
    
    VERSION = "baseline-deterministic-v1.0"
    
    def predict(self, case: RecoveryCase) -> RecoveryPrediction:
        features = FeatureExtractor.extract_features(case)
        
        # Base probability defaults to 50%
        prob = 0.50
        
        # Risk Score inversely impacts recoverability generally
        # A risk score of 1.0 (Critical) pulls probability down, 0.0 pulls it up.
        prob += (0.5 - features["risk_score"]) * 0.4
        
        # Category adjustments
        cat = features["cause_category"]
        if cat == RootCauseCategory.INSUFFICIENT_FUNDS.value:
            prob += 0.20 # Often recoverable on payday
        elif cat == RootCauseCategory.NETWORK_FAILURE.value:
            prob += 0.40 # Highly recoverable on retry
        elif cat == RootCauseCategory.PAYMENT_METHOD_INVALID.value:
            prob -= 0.30 # Hard failure, requires customer action
        elif cat == RootCauseCategory.MISSED_COMMITMENT.value:
            prob -= 0.20 # Trust broken
        elif cat == RootCauseCategory.UNRESOLVED_DISPUTE.value:
            prob -= 0.40 # Requires human resolution
            
        # Age penalty
        # Drop probability by 5% every 24 hours
        days_old = features["age_hours"] / 24.0
        prob -= (days_old * 0.05)
        
        # Bound probability between 0 and 1
        prob = max(0.0, min(1.0, prob))
        
        return RecoveryPrediction(
            prediction_id=f"pred_{uuid.uuid4().hex[:8]}",
            recovery_probability=round(prob, 3),
            confidence=0.5, # Baseline confidence is mediocre
            model_version=self.VERSION,
            feature_version=FeatureExtractor.VERSION,
            prediction_timestamp=datetime.now(timezone.utc),
            contributing_features=features,
            prediction_status="SUCCESS_BASELINE"
        )
