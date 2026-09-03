"""
Risk Prediction Model
Handles risk scoring and explainability (SHAP-like factors).
"""

import joblib
import numpy as np
from typing import TypedDict, Dict, Any
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PredictionResult(TypedDict):
    risk_score: float
    risk_level: str
    shap_factors: Dict[str, float]

# Path to the trained model
MODEL_PATH = "backend/ml/model.joblib"
model = None

def load_model():
    """Loads the XGBoost model from disk."""
    global model
    if os.path.exists(MODEL_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            logger.info("ML model loaded successfully.")
        except Exception as e:
            logger.error(f"Error loading model: {e}. Falling back to mock model.")
    else:
        logger.warning("model.joblib not found. Using mock prediction logic for MVP.")

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

        # Mock SHAP factors for now if SHAP library is not integrated
        # In production, use shap.TreeExplainer(model).shap_values(feat_array)
        factors = {
            "heavy rainfall": 0.6,
            "steep slope": 0.3,
            "historical events": 0.1
        }
    else:
        # Mock Heuristic Logic:
        # Risk = (Rain * 0.5) + (Slope * 0.3) + (Hist * 0.2)
        rain_impact = min(features.get("rain_24h", 0) / 100.0, 1.0) * 0.5
        slope_impact = min(features.get("slope", 0) / 45.0, 1.0) * 0.3
        hist_impact = min(features.get("hist_count", 0) / 10.0, 1.0) * 0.2

        score = rain_impact + slope_impact + hist_impact

        # Generate mock factors based on which had most impact
        factors = {
            "rainfall": rain_impact,
            "slope": slope_impact,
            "history": hist_impact
        }
        # Normalize factors to percentages
        total = sum(factors.values()) or 1.0
        factors = {k: (v / total) * 100 for k, v in factors.items()}

    return {
        "risk_score": round(score, 3),
        "risk_level": get_risk_level(score),
        "shap_factors": factors
    }

# Load model at module level
load_model()
