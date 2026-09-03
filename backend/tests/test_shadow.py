import uuid
from datetime import UTC, datetime

from application.recovery_predictor_ml import MLPaymentFailurePredictor
from domain.models import RecoveryPrediction


def apply_shadow_prediction(case, db):
    predictor = MLPaymentFailurePredictor()

    # Extract available features from the case
    case_features = {
        "amount": case.amount_at_risk.amount if case.amount_at_risk else 0.0,
        "customer_id": case.customer_id,
        # fallback mapping for testing
        "f1": 1,
        "f2": 0.5,
    }

    try:
        res = predictor.predict_failure_risk(case_features)
        prob = res.get("probability", 0.0)
        status = res.get("status", "FAILED")
        meta = res.get("model_metadata", {})
    except ValueError as e:
        prob = 0.0
        status = f"FAILED: {str(e)}"
        meta = {}

    prediction = RecoveryPrediction(
        prediction_id=f"pred_{uuid.uuid4().hex[:8]}",
        recovery_probability=prob,
        confidence=0.7,
        model_version=meta.get("model_version", "unknown"),
        feature_version="1.0",
        prediction_timestamp=datetime.now(UTC),
        contributing_features=case_features,
        prediction_status=status,
    )

    return prediction
