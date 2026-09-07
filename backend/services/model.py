"""
Risk Prediction Model
Handles risk scoring and explainability (SHAP-like factors).
"""

import joblib
import numpy as np
import shap
from typing import TypedDict, Dict, Any
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PredictionResult(TypedDict):
    risk_score: float
    risk_level: str
    shap_factors: Dict[str, float]

from pathlib import Path

# Path to the trained model
ROOT_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT_DIR / "ml" / "model.joblib"
model = None
explainer = None

def load_model():
    """Loads the XGBoost model and initializes SHAP TreeExplainer."""
    global model, explainer
    model_str_path = str(MODEL_PATH)
    if os.path.exists(model_str_path):
        try:
            model = joblib.load(model_str_path)
            explainer = shap.TreeExplainer(model)
            logger.info(f"ML model and SHAP TreeExplainer loaded successfully from {model_str_path}.")
        except Exception as e:
            logger.error(f"Error loading model or SHAP explainer: {e}. Falling back to mock model.")
    else:
        logger.warning(f"model.joblib not found at {model_str_path}. Using heuristic prediction logic.")

def get_risk_level(score: float) -> str:
    """Buckets risk score into levels."""
    if score < 0.25: return "Low"
    if score < 0.55: return "Moderate"
    if score < 0.80: return "High"
    return "Critical"

def predict(features: Dict[str, Any]) -> PredictionResult:
    """
    Predicts landslide risk based on input features.
    If no model is loaded, uses a weighted heuristic mock.
    """
    # Feature keys expected
    # [rain_1h, rain_3h, rain_24h, soil_moisture, elevation, slope, hist_count, hist_fatalities]

    if model:
        # Actual XGBoost inference
        # Convert features dict to array in correct order
        feat_array = np.array([[
            features.get("rain_1h", 0),
            features.get("rain_3h", 0),
            features.get("rain_24h", 0),
            features.get("soil_moisture", 0),
            features.get("elevation", 0),
            features.get("slope", 0),
            features.get("hist_count", 0),
            features.get("hist_fatalities", 0)
        ]])
        score = float(model.predict_proba(feat_array)[0][1])

        # Dynamic SHAP feature attribution
        try:
            shap_vals = explainer.shap_values(feat_array)[0]
            feature_display_names = [
                "Heavy Rainfall (1h)",
                "Antecedent Rain (3h)",
                "Cumulative Rain (24h)",
                "Soil Moisture Saturation",
                "High Elevation",
                "Steep Terrain Slope",
                "Historical Slide Frequency",
                "Past Fatalities Severity"
            ]
            pos_impacts = {feature_display_names[i]: max(float(shap_vals[i]), 0.0) for i in range(len(feature_display_names))}
            total_pos = sum(pos_impacts.values())
            if total_pos > 0:
                pcts = {k: round((v / total_pos) * 100, 1) for k, v in pos_impacts.items()}
            else:
                abs_impacts = {feature_display_names[i]: abs(float(shap_vals[i])) for i in range(len(feature_display_names))}
                total_abs = sum(abs_impacts.values()) or 1.0
                pcts = {k: round((v / total_abs) * 100, 1) for k, v in abs_impacts.items()}
            
            # Keep top 4 contributing factors
            factors = dict(sorted(pcts.items(), key=lambda x: x[1], reverse=True)[:4])
        except Exception as e:
            logger.warning(f"SHAP explanation computation failed: {e}. Falling back to baseline factors.")
            factors = {
                "Rainfall Trigger": 55.0,
                "Terrain Slope": 30.0,
                "Soil Saturation": 15.0
            }
    else:
        # Heuristic Logic fallback:
        # Risk = (Rain * 0.5) + (Slope * 0.3) + (Hist * 0.2)
        rain_impact = min(features.get("rain_24h", 0) / 100.0, 1.0) * 0.5
        slope_impact = min(features.get("slope", 0) / 45.0, 1.0) * 0.3
        hist_impact = min(features.get("hist_count", 0) / 10.0, 1.0) * 0.2

        score = rain_impact + slope_impact + hist_impact

        factors = {
            "Rainfall Accumulation": rain_impact,
            "Terrain Slope": slope_impact,
            "Historical Frequency": hist_impact
        }
        total = sum(factors.values()) or 1.0
        factors = {k: round((v / total) * 100, 1) for k, v in factors.items()}

    return {
        "risk_score": round(score, 3),
        "risk_level": get_risk_level(score),
        "shap_factors": factors
    }

# Load model at module level
load_model()
