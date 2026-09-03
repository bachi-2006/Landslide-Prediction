"""
Risk API Router
Handles endpoints for retrieving and updating district landslide risk.
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from backend.db.supabase_client import supabase
from backend.services.weather import fetch_weather
from backend.services.elevation import fetch_elevation_and_slope
from backend.services.model import predict
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/api/risk", tags=["Risk"])

async def refresh_district_risk(district_id: str, district_name: str, lat: float, lon: float):
    """
    Orchestrates data fetching and risk prediction for a district.
    """
    # 1. Fetch Weather
    weather = await fetch_weather(lat, lon)
    # 2. Fetch Elevation/Slope
    topo = await fetch_elevation_and_slope(lat, lon)

    if not weather or not topo:
        raise HTTPException(status_code=503, detail="External data services unavailable")

    # 3. Assemble features (including mock historical data for MVP)
    features = {
        "rain_1h": weather["rain_1h"],
        "rain_3h": weather["rain_3h"],
        "rain_24h": weather["rain_24h"],
        "soil_moisture": weather["soil_moisture"],
        "elevation": topo["elevation"],
        "slope": topo["slope"],
        "hist_count": 5, # Mock historical count
        "hist_fatalities": 2 # Mock historical fatalities
    }

    # 4. Predict Risk
    result = predict(features)

    # 5. Update Supabase
    payload = {
        "district_id": district_id,
        "district_name": district_name,
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "factors_json": result["shap_factors"],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    # Upsert based on district_id (requires unique constraint on district_id in DB)
    # For MVP simplicity, we'll search for existing and update or insert
    existing = supabase.table("district_risk").select("id").eq("district_id", district_id).execute()
    if existing.data:
        supabase.table("district_risk").update(payload).eq("district_id", district_id).execute()
    else:
        supabase.table("district_risk").insert(payload).execute()

    return payload

@router.get("/")
async def get_all_risks():
    """Returns risk scores for all districts."""
    try:
        response = supabase.table("district_risk").select("*").execute()
        return {"success": True, "data": response.data, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

@router.get("/{district_id}")
async def get_district_risk(district_id: str):
    """Returns detailed risk for a specific district."""
    try:
        response = supabase.table("district_risk").select("*").eq("district_id", district_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="District not found")
        return {"success": True, "data": response.data[0], "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

@router.post("/refresh/{district_id}")
async def trigger_refresh(district_id: str, lat: float, lon: float, name: str):
    """Manual trigger to refresh risk data for a district."""
    try:
        data = await refresh_district_risk(district_id, name, lat, lon)
        return {"success": True, "data": data, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
