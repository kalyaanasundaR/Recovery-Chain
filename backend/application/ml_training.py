import os
import json
import joblib
import pandas as pd
import numpy as np
import time
from datetime import datetime, timezone
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier
from sklearn.metrics import roc_auc_score, average_precision_score, precision_score, recall_score, f1_score, confusion_matrix, brier_score_loss
from sklearn.calibration import CalibratedClassifierCV

class MLTrainingEngine:
    def __init__(self, spec: dict, data_path: str, output_dir: str):
        self.spec = spec
        self.data_path = data_path
        self.output_dir = output_dir
        self.run_id = f"train_{int(time.time())}"
        
        # Ensure output directory exists
        os.makedirs(self.output_dir, exist_ok=True)
        
    def _invert_target_if_needed(self, df: pd.DataFrame, target_col: str):
        series = df[target_col]
        if not pd.api.types.is_numeric_dtype(series) or str(series.dtype) == 'bool':
            series_str = series.astype(str).str.strip().str.lower()
            mapping = {
                '0': 0, 'false': 0, 'no': 0, 'success': 0, 'paid': 0, 'settled': 0, 'completed': 0,
                '1': 1, 'true': 1, 'yes': 1, 'failed': 1, 'unpaid': 1, 'returned': 1, 'declined': 1, 'error': 1, 'insufficient_funds': 1
            }
            mapped = series_str.map(mapping).fillna(0).astype(int)
            series = mapped
        else:
            try:
                series = pd.to_numeric(series, errors='coerce').fillna(0).astype(int)
            except Exception:
                series = (series > 0).astype(int)
                
        if self.spec["prediction_problem"] == "payment-failure-risk" and "recovered" in target_col.lower():
            return (series == 0).astype(int)
        return series

    def _split_data(self, df: pd.DataFrame):
        # Prefer the pre-computed split if it exists and obeys chronologic rules
        if 'split' in df.columns:
            train_mask = df['split'] == 'train'
            val_mask = df['split'] == 'validation'
            test_mask = df['split'] == 'test'
            return df[train_mask], df[val_mask], df[test_mask]
            
        # Fallback chronological split
        split_col = self.spec["temporal_split"].get("split_column")
        if not split_col or split_col not in df.columns:
            raise ValueError("No valid temporal split column available.")
            
        # Sort chronologically
        df = df.sort_values(split_col)
        n = len(df)
        train_idx = int(n * 0.7)
        val_idx = int(n * 0.85)
        
        return df.iloc[:train_idx], df.iloc[train_idx:val_idx], df.iloc[val_idx:]
        
    def _evaluate(self, model, X, y, threshold=0.5):
        if len(X) == 0:
            return {}
            
        y_prob = model.predict_proba(X)[:, 1]
        y_pred = (y_prob >= threshold).astype(int)
        
        # Guard against single-class in validation/test (though rare)
        if len(np.unique(y)) > 1:
            roc_auc = roc_auc_score(y, y_prob)
            pr_auc = average_precision_score(y, y_prob)
            brier = brier_score_loss(y, y_prob)
        else:
            roc_auc, pr_auc, brier = None, None, None
            
        cm = confusion_matrix(y, y_pred)
        tn, fp, fn, tp = cm.ravel() if len(cm.ravel()) == 4 else (0,0,0,0)
        
        return {
            "roc_auc": roc_auc,
            "pr_auc": pr_auc,
            "brier_score": brier,
            "precision": precision_score(y, y_pred, zero_division=0),
            "recall": recall_score(y, y_pred, zero_division=0),
            "f1": f1_score(y, y_pred, zero_division=0),
            "positive_rate": float(np.mean(y)),
            "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
            "threshold": threshold
        }

    def train_and_evaluate(self):
        start_time = time.time()
        
        # 1. Load Data
        df = pd.read_csv(self.data_path)
        
        target_col = self.spec["target_column"]
        feature_cols = self.spec["feature_columns"]
        
        # Validation
        if target_col not in df.columns:
            raise ValueError(f"Target column {target_col} missing.")
            
        missing_feats = [f for f in feature_cols if f not in df.columns]
        if missing_feats:
            raise ValueError(f"Missing required features: {missing_feats}")
            
        # Target preparation
        y_all = self._invert_target_if_needed(df, target_col)
        
        # Drop excluded cols if they somehow sneaked in
        X_all = df[feature_cols].copy()
        
        num_cols = X_all.select_dtypes(include=['int64', 'float64', 'number']).columns.tolist()
        cat_cols = X_all.select_dtypes(include=['object', 'string', 'category', 'bool']).columns.tolist()
        
        # Split Data
        df['__target__'] = y_all
        train_df, val_df, test_df = self._split_data(df)
        
        X_train, y_train = train_df[feature_cols], train_df['__target__']
        X_val, y_val = val_df[feature_cols], val_df['__target__']
        X_test, y_test = test_df[feature_cols], test_df['__target__']
        
        if len(y_train.unique()) < 2:
            raise ValueError("Training set must contain both classes.")
            
        # 2. Build Preprocessing
        numeric_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler())
        ])
        
        categorical_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='constant', fill_value='missing')),
            ('onehot', OneHotEncoder(handle_unknown='ignore'))
        ])
        
        preprocessor = ColumnTransformer(
            transformers=[
                ('num', numeric_transformer, num_cols),
                ('cat', categorical_transformer, cat_cols)
            ]
        )
        
        # 3. Candidate Models
        # Calculate scale_pos_weight
        pos_count = int((y_train == 1).sum())
        neg_count = len(y_train) - pos_count
        spw = neg_count / max(1, pos_count)
        
        models = {
            "logistic_regression": LogisticRegression(class_weight='balanced', max_iter=1000, random_state=42),
            "xgboost": XGBClassifier(scale_pos_weight=spw, eval_metric='logloss', random_state=42, use_label_encoder=False)
        }
        
        results = {}
        best_model_name = None
        best_pr_auc = -1
        best_pipeline = None
        
        for name, clf in models.items():
            # Pipeline
            pipeline = Pipeline(steps=[
                ('preprocessor', preprocessor),
                ('classifier', clf)
            ])
            
            # Train
            pipeline.fit(X_train, y_train)
            
            # Calibrate if needed (especially XGBoost can be poorly calibrated)
            # We calibrate on validation set to avoid overfitting
            try:
                calibrated = CalibratedClassifierCV(estimator=pipeline, method='sigmoid', cv='prefit')
                calibrated.fit(X_val, y_val)
                final_model = calibrated
            except Exception:
                final_model = pipeline
                
            # Evaluate
            train_metrics = self._evaluate(final_model, X_train, y_train)
            val_metrics = self._evaluate(final_model, X_val, y_val)
            
            results[name] = {
                "train_metrics": train_metrics,
                "val_metrics": val_metrics
            }
            
            # Model Selection via PR-AUC on Validation
            current_pr_auc = val_metrics.get("pr_auc")
            if best_pipeline is None or (current_pr_auc is not None and current_pr_auc > best_pr_auc):
                best_pr_auc = current_pr_auc if current_pr_auc is not None else -1
                best_model_name = name
                best_pipeline = final_model

        # Final Evaluation on Test Set
        test_metrics = self._evaluate(best_pipeline, X_test, y_test)
        
        runtime = time.time() - start_time
        
        # 4. Save Artifacts
        artifact_path = os.path.join(self.output_dir, f"{self.run_id}_model.joblib")
        joblib.dump(best_pipeline, artifact_path)
        
        # 5. Save Metadata Registry Entry
        metadata = {
            "model_id": self.run_id,
            "dataset_id": self.spec["dataset_id"],
            "task": self.spec["prediction_problem"],
            "target_column": target_col,
            "canonical_target_meaning": self.spec.get("target_definition", "Unknown"),
            "feature_columns": feature_cols,
            "canonical_feature_mapping": {col: self.spec.get("canonical_feature_mapping", {}).get(col, "UNKNOWN") for col in feature_cols},
            "preprocessing_pipeline": self.spec.get("preprocessing_steps", []),
            "model_version": best_model_name,
            "feature_schema_version": "1.0",
            "status": "SELECTED",
            "selected_model": best_model_name,
            "candidate_results": results,
            "final_test_metrics": test_metrics,
            "artifact_path": artifact_path,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "training_runtime_sec": round(runtime, 2),
            "split_row_counts": {
                "train": len(X_train),
                "validation": len(X_val),
                "test": len(X_test)
            }
        }
        
        registry_path = os.path.join(self.output_dir, f"{self.run_id}_metadata.json")
        with open(registry_path, "w") as f:
            json.dump(metadata, f, indent=2)
            
        return metadata
