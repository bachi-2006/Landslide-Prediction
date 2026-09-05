"""
Risk API Router
Handles endpoints for retrieving and updating district landslide risk.
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from backend.db.supabase_client import SupabaseNotConfiguredError, get_supabase
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

    # 3. Query actual historical landslide count from Supabase within ~25km
    db = get_supabase()
    hist_count = 0
    try:
        hist_query = db.table("historical_landslides").select("id", count="exact") \
            .gte("latitude", lat - 0.25).lte("latitude", lat + 0.25) \
            .gte("longitude", lon - 0.25).lte("longitude", lon + 0.25).execute()
        hist_count = hist_query.count if hist_query.count is not None else len(hist_query.data or [])
    except Exception as e:
        hist_count = 0

    features = {
        "rain_1h": weather["rain_1h"],
        "rain_3h": weather["rain_3h"],
        "rain_24h": weather["rain_24h"],
        "soil_moisture": weather["soil_moisture"],
        "elevation": topo["elevation"],
        "slope": topo["slope"],
        "hist_count": hist_count,
        "hist_fatalities": 0
    }

    # 4. Predict Risk
    result = predict(features)

    # Attach live weather & terrain telemetry to factors_json for rich dashboard telemetry
    factors_data = dict(result["shap_factors"])
    factors_data["_telemetry"] = {
        "rain_1h_mm": round(weather["rain_1h"], 1),
        "rain_24h_mm": round(weather["rain_24h"], 1),
        "soil_moisture": round(weather["soil_moisture"], 3),
        "elevation_m": round(topo["elevation"], 1),
        "slope_deg": round(topo["slope"], 1),
        "hist_landslides": hist_count
    }

    # 5. Update Supabase
    payload = {
        "district_id": district_id,
        "district_name": district_name,
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "factors_json": factors_data,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    # Upsert based on district_id (requires unique constraint on district_id in DB)
    existing = db.table("district_risk").select("id").eq("district_id", district_id).execute()
    if existing.data:
        db.table("district_risk").update(payload).eq("district_id", district_id).execute()
    else:
        db.table("district_risk").insert(payload).execute()

    return payload

@router.get("")
@router.get("/")
async def get_all_risks():
    """Returns risk scores for all districts."""
    try:
        response = get_supabase().table("district_risk").select("*").execute()
        return {"success": True, "data": response.data, "error": None}
    except SupabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

@router.get("/{district_id}")
async def get_district_risk(district_id: str):
    """Returns detailed risk for a specific district."""
    try:
        response = get_supabase().table("district_risk").select("*").eq("district_id", district_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="District not found")
        return {"success": True, "data": response.data[0], "error": None}
    except SupabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

@router.post("/refresh/{district_id}")
async def trigger_refresh(district_id: str, lat: float, lon: float, name: str):
    """Manual trigger to refresh risk data for a district."""
    try:
        data = await refresh_district_risk(district_id, name, lat, lon)
        return {"success": True, "data": data, "error": None}
    except SupabaseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
