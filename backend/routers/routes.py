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

@router.post("/")
async def suggest_route(req: RouteRequest):
    """
    Calculates a safe route between two points, avoiding a specific high-risk district.
    """
    try:
        start = (req.origin_lat, req.origin_lon)
        end = (req.dest_lat, req.dest_lon)

        # In a full implementation, we would fetch the GeoJSON polygon for avoid_district_id
        # For MVP, we simulate the 'avoid' logic if the ID is present.
        avoid_polygons = []
        if req.avoid_district_id:
            # Mock polygon for the district
            avoid_polygons = [{"type": "Polygon", "coordinates": [[[0,0],[0,1],[1,1],[1,0],[0,0]]]}]

        route_data = await get_alternative_route(start, end, avoid_polygons)

        if not route_data:
            raise HTTPException(status_code=500, detail="Routing service unavailable")

        return {"success": True, "data": route_data, "error": None}

    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}
