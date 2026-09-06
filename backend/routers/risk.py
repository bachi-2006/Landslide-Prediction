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

import asyncio
from pydantic import BaseModel, Field
from typing import Optional

class SimulationRequest(BaseModel):
    district_id: str
    district_name: str
    lat: float
    lon: float
    rain_24h: float = Field(..., ge=0, le=500)
    soil_moisture: float = Field(..., ge=0.0, le=1.0)
    slope: float = Field(..., ge=0.0, le=90.0)
    elevation: Optional[float] = 1200.0

async def refresh_district_risk(district_id: str, district_name: str, lat: float, lon: float):
    """
    Orchestrates concurrent data fetching and risk prediction for a district.
    """
    # 1. Fetch Weather and Elevation concurrently
    weather_task = fetch_weather(lat, lon)
    topo_task = fetch_elevation_and_slope(lat, lon)
    weather, topo = await asyncio.gather(weather_task, topo_task)

    if not weather or not topo:
        raise HTTPException(status_code=503, detail="External data services unavailable")

    # 2. Query actual historical landslide count from Supabase within ~25km
    db = get_supabase()
    hist_count = 0
    try:
        hist_query = db.table("historical_landslides").select("id", count="exact") \
            .gte("latitude", lat - 0.25).lte("latitude", lat + 0.25) \
            .gte("longitude", lon - 0.25).lte("longitude", lon + 0.25).execute()
        hist_count = hist_query.count if hist_query.count is not None else len(hist_query.data or [])
    except Exception:
        hist_count = 0

    features = {
        "rain_1h": weather["rain_1h"],
        "rain_3h": weather["rain_3h"],
        "rain_24h": weather["rain_24h"],
        "soil_moisture": weather["soil_moisture"],
        "elevation": topo["elevation"],
        "slope": topo["slope"],
        "hist_count": hist_count,
        "hist_fatalities": 1 if hist_count > 5 else 0
    }

    # 3. Predict Risk
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

    # 4. Atomic Upsert to Supabase
    payload = {
        "district_id": district_id,
        "district_name": district_name,
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "factors_json": factors_data,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    db.table("district_risk").upsert(payload, on_conflict="district_id").execute()
    return payload

@router.post("/simulate")
async def simulate_district_risk(req: SimulationRequest):
    """
    Executes real XGBoost inference and dynamic SHAP explainability for user-simulated parameters.
    """
    try:
        # Approximate 1h and 3h rainfall distributions based on 24h total
        rain_3h = round(req.rain_24h * 0.45, 1)
        rain_1h = round(rain_3h * 0.5, 1)

        features = {
            "rain_1h": rain_1h,
            "rain_3h": rain_3h,
            "rain_24h": req.rain_24h,
            "soil_moisture": req.soil_moisture,
            "elevation": req.elevation or 1200.0,
            "slope": req.slope,
            "hist_count": 5,
            "hist_fatalities": 0
        }

        result = predict(features)

        factors_data = dict(result["shap_factors"])
        factors_data["_telemetry"] = {
            "rain_1h_mm": rain_1h,
            "rain_24h_mm": req.rain_24h,
            "soil_moisture": req.soil_moisture,
            "elevation_m": req.elevation or 1200.0,
            "slope_deg": req.slope,
            "hist_landslides": 5
        }

        payload = {
            "district_id": req.district_id,
            "district_name": req.district_name,
            "risk_score": result["risk_score"],
            "risk_level": result["risk_level"],
            "factors_json": factors_data,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        # Save to DB if Supabase is connected
        try:
            db = get_supabase()
            db.table("district_risk").upsert(payload, on_conflict="district_id").execute()
        except Exception:
            pass

        return {"success": True, "data": payload, "error": None}
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

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

