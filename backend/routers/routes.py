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

        if req.avoid_district_id or req.avoid_lat is not None:
            av_lat = req.avoid_lat if req.avoid_lat is not None else req.dest_lat
            av_lon = req.avoid_lon if req.avoid_lon is not None else req.dest_lon
            avoid_center = (av_lat, av_lon)
            
            # Construct a bounding polygon around the hazard center in NER coordinates
            delta = 0.15
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
