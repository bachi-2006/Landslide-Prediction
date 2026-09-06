import pytest
from backend.services.model import predict, get_risk_level

def test_get_risk_level():
    assert get_risk_level(0.10) == "Low"
    assert get_risk_level(0.35) == "Moderate"
    assert get_risk_level(0.65) == "High"
    assert get_risk_level(0.85) == "Critical"

def test_predict_benign_features():
    features = {
        "rain_1h": 0.0,
        "rain_3h": 0.0,
        "rain_24h": 5.0,
        "soil_moisture": 0.18,
        "elevation": 150.0,
        "slope": 4.0,
        "hist_count": 0,
        "hist_fatalities": 0
    }
    result = predict(features)
    assert "risk_score" in result
    assert "risk_level" in result
    assert "shap_factors" in result
    assert result["risk_score"] < 0.35
    assert result["risk_level"] in ["Low", "Moderate"]
    assert len(result["shap_factors"]) > 0

def test_predict_severe_monsoon_features():
    features = {
        "rain_1h": 45.0,
        "rain_3h": 90.0,
        "rain_24h": 210.0,
        "soil_moisture": 0.55,
        "elevation": 1850.0,
        "slope": 44.0,
        "hist_count": 12,
        "hist_fatalities": 1
    }
    result = predict(features)
    assert result["risk_score"] > 0.60
    assert result["risk_level"] in ["High", "Critical"]
    assert len(result["shap_factors"]) > 0
