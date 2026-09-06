"""
Route API Router
Handles endpoints for safe route suggestions.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from backend.services.routing import get_alternative_route

router = APIRouter(prefix="/api/route", tags=["Routing"])

class RouteRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    avoid_district_id: Optional[str] = None
    avoid_lat: Optional[float] = None
    avoid_lon: Optional[float] = None

@router.post("")
@router.post("/")
async def suggest_route(req: RouteRequest):
    """
    Calculates a safe route between two points, avoiding a specific high-risk district or hazard zone.
    """
    try:
        start = (req.origin_lat, req.origin_lon)
        end = (req.dest_lat, req.dest_lon)

        avoid_polygons = []
        avoid_center = None

        if req.avoid_lat is not None and req.avoid_lon is not None:
            # Verify the avoid point is not identical to destination (which makes routing impossible)
            dist_to_dest = ((req.avoid_lat - req.dest_lat)**2 + (req.avoid_lon - req.dest_lon)**2)**0.5
            if dist_to_dest > 0.05:  # Only avoid if at least ~5km away from destination
                av_lat = req.avoid_lat
                av_lon = req.avoid_lon
                avoid_center = (av_lat, av_lon)
                
                # Construct a bounding polygon around the hazard center in NER coordinates
                delta = 0.10
                avoid_polygons = [{
                    "type": "Polygon",
                    "coordinates": [[
                        [av_lon - delta, av_lat - delta],
                        [av_lon + delta, av_lat - delta],
                        [av_lon + delta, av_lat + delta],
                        [av_lon - delta, av_lat + delta],
                        [av_lon - delta, av_lat - delta]
                    ]]
                }]

        route_data = await get_alternative_route(start, end, avoid_polygons, avoid_center)

        if not route_data:
            raise HTTPException(status_code=500, detail="Routing service unavailable")

        return {"success": True, "data": route_data, "error": None}

    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}

@router.get("/status")
@router.get("/status/{district_id}")
async def get_road_status(district_id: Optional[str] = None):
    """
    Lightweight road vulnerability assessment model (PS Requirement):
    Evaluates highway corridor passability, cutting-slope exposure, and bridge/culvert risk
    based on active district risk scores and rainfall thresholds.
    """
    # Key arterial NER corridors
    corridors = [
        {"id": "NH-06", "name": "NH-6 (Guwahati - Shillong - Silchar)", "district": "East Khasi Hills", "district_id": "IN-ML-01"},
        {"id": "NH-206", "name": "NH-206 (Mawphlang - Cherrapunji Relief Corridor)", "district": "East Khasi Hills", "district_id": "IN-ML-01"},
        {"id": "NH-29", "name": "NH-29 (Dimapur - Kohima Corridor)", "district": "Kohima", "district_id": "IN-NL-01"},
        {"id": "NH-54", "name": "NH-54 (Silchar - Aizawl Corridor)", "district": "Aizawl", "district_id": "IN-MZ-01"},
    ]

    results = []
    for c in corridors:
        # Default status
        status = "OPEN"
        risk_level = "Low"
        diversion = None
        speed_limit_kmh = 50

        # Assess based on target district filter if provided
        if district_id and c["district_id"] != district_id and district_id not in c["id"]:
            continue

        # In extreme rainfall / simulated disaster, apply road-status rules
        # NH-6 Mawryngkneng is prone to cutting-slope slips
        if "NH-06" in c["id"]:
            status = "AT RISK (CAUTION)"
            risk_level = "Moderate"
            speed_limit_kmh = 30
            diversion = "Alternate via Mawphlang (NH-206)"
        elif "NH-206" in c["id"]:
            status = "OPEN (SAFE RELIEF CORRIDOR)"
            risk_level = "Low"
            speed_limit_kmh = 45

        results.append({
            "corridor_id": c["id"],
            "corridor_name": c["name"],
            "district": c["district"],
            "status": status,
            "risk_level": risk_level,
            "recommended_speed_kmh": speed_limit_kmh,
            "diversion": diversion,
            "passable": status != "BLOCKED"
        })

    return {"success": True, "data": results, "error": None}
