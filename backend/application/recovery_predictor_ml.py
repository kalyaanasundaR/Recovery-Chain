import os
import re
import json
import joblib
import xgboost as xgb
import numpy as np
import pandas as pd

class MLPaymentFailurePredictor:
    def __init__(self, dataset_id: str = None, registry_dir: str = "backend/ml/models/registry",
                 legacy_model_path: str = "backend/ml/models/failure_risk_tree.json",
                 legacy_features_path: str = "backend/ml/models/features.json"):
        
        self.model = None
        self.features = []
        self.is_legacy = False
        self.metadata = {}
        self.canonical_mapping = {}
        
        # Strictly reject path traversal or malformed dataset_ids
        if dataset_id:
            if not isinstance(dataset_id, str) or not re.match(r'^[a-zA-Z0-9_-]+$', dataset_id):
                return
            
            reg_dir = registry_dir
            if not os.path.exists(reg_dir) and os.path.exists(os.path.join("backend", reg_dir)):
                reg_dir = os.path.join("backend", reg_dir)
            elif not os.path.exists(reg_dir) and reg_dir.startswith("backend/") and os.path.exists(reg_dir[8:]):
                reg_dir = reg_dir[8:]
                
            if os.path.exists(reg_dir):
                metadata_files = [f for f in os.listdir(reg_dir) if f.endswith("_metadata.json")]
                metadata_files.sort(reverse=True)
                
                for meta_file in metadata_files:
                    try:
                        with open(os.path.join(reg_dir, meta_file), "r") as f:
                            meta = json.load(f)
                    except Exception:
                        continue
                        
                    if meta.get("status") == "REJECTED_LOW_QUALITY":
                        # Failed the training quality gate — not fit to serve.
                        continue
                    if meta.get("dataset_id") == dataset_id and meta.get("task") == "payment-failure-risk":
                        self.metadata = meta
                        artifact_path = self.metadata.get("artifact_path")
                        if artifact_path and not os.path.exists(artifact_path):
                            if os.path.exists(os.path.join("backend", artifact_path)):
                                artifact_path = os.path.join("backend", artifact_path)
                            elif artifact_path.startswith("backend/") and os.path.exists(artifact_path[8:]):
                                artifact_path = artifact_path[8:]
                            elif (artifact_path.startswith("backend/") or artifact_path.startswith("backend\\")) and os.path.exists(artifact_path[8:]):
                                artifact_path = artifact_path[8:]
                        
                        if artifact_path and os.path.exists(artifact_path):
                            # Ensure artifact path does not escape
                            abs_path = os.path.abspath(artifact_path)
                            self.model = joblib.load(abs_path)
                            self.features = self.metadata.get("feature_columns", [])
                            self.canonical_mapping = self.metadata.get("canonical_feature_mapping", {})
                            return

        # Fallback to legacy ONLY if dataset_id was explicitly None (not if dataset_id failed lookup or was invalid)
        if dataset_id is None and os.path.exists(legacy_model_path) and os.path.exists(legacy_features_path):
            self.model = xgb.Booster()
            self.model.load_model(legacy_model_path)
            with open(legacy_features_path, "r") as f:
                self.features = json.load(f)
            self.is_legacy = True
            self.metadata = {"model_version": "Legacy_Phase17", "dataset_id": "legacy_billing_v3"}

    def _map_canonical_to_original_features(self, canonical_features: dict) -> dict:
        """
        Maps standard canonical inputs (e.g. 'AMOUNT') to the original column names expected by the model
        using the authoritative canonical_feature_mapping stored during training.
        """
        if self.is_legacy:
            return canonical_features
            
        mapped = {}
        for feature_col in self.features:
            canon = self.canonical_mapping.get(feature_col)
            
            # Use the canonical value if available (and not UNKNOWN)
            if canon and canon != "UNKNOWN" and canon in canonical_features:
                mapped[feature_col] = canonical_features[canon]
            # Fallback for testing or direct original column injection
            elif feature_col in canonical_features:
                mapped[feature_col] = canonical_features[feature_col]
                
        return mapped

    def predict_failure_risk(self, canonical_features: dict) -> dict:
        if self.model is None or not self.features:
            return {"probability": 0.0, "status": "NO_MODEL"}
            
        mapped_features = self._map_canonical_to_original_features(canonical_features)
            
        missing_features = [f for f in self.features if f not in mapped_features]
        if missing_features:
            raise ValueError(f"Incomplete feature set. Missing original features mapped to domain: {missing_features}")
            
        if self.is_legacy:
            x = []
            for f in self.features:
                x.append(mapped_features.get(f, 0.0))
            dmat = xgb.DMatrix(np.array([x]), feature_names=self.features)
            prob = self.model.predict(dmat)[0]
        else:
            df = pd.DataFrame([mapped_features])
            prob = self.model.predict_proba(df[self.features])[0, 1]
            
        return {
            "probability": float(prob),
            "status": "SUCCESS",
            "model_metadata": {
                "dataset_id": self.metadata.get("dataset_id"),
                "model_version": self.metadata.get("model_version", "unknown"),
                "features_used": self.features,
                "shadow_mode_active": True
            }
        }
