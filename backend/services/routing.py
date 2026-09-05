"""
Routing Service
Integrates with OpenRouteService (ORS) for route suggestions.
"""

import httpx
import os
from typing import TypedDict, Optional
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RouteResponse(TypedDict):
    geometry: dict
    distance: float
    duration: float

def _generate_fallback_route(start_coord: tuple, end_coord: tuple, avoid_center: tuple = None) -> RouteResponse:
    """Generates a smooth fallback route connecting coordinates if external API is unreachable."""
    start_lat, start_lon = start_coord
    end_lat, end_lon = end_coord
    
    # Calculate distance approx in meters
    dlat = (end_lat - start_lat) * 111000
    dlon = (end_lon - start_lon) * 111000
    approx_dist = (dlat**2 + dlon**2) ** 0.5

    # If avoiding a center, add an offset waypoint
    coords = [[start_lon, start_lat]]
    if avoid_center:
        av_lat, av_lon = avoid_center
        # Offset waypoint perpendicularly
        mid_lat = (start_lat + end_lat) / 2
        mid_lon = (start_lon + end_lon) / 2
        offset_lat = mid_lat + (0.15 if av_lat >= mid_lat else -0.15)
        offset_lon = mid_lon + (0.15 if av_lon >= mid_lon else -0.15)
        coords.append([offset_lon, offset_lat])
    else:
        # Midpoint
        coords.append([(start_lon + end_lon) / 2, (start_lat + end_lat) / 2])
        
    coords.append([end_lon, end_lat])

    return {
        "geometry": {
            "type": "LineString",
            "coordinates": coords
        },
        "distance": round(approx_dist, 1),
        "duration": round(approx_dist / 11.1, 1) # ~40 km/h average in hills
    }

async def get_alternative_route(start_coord: tuple, end_coord: tuple, avoid_polygons: list = None, avoid_center: tuple = None) -> Optional[RouteResponse]:
    """
    Fetch a route from start to end, optionally avoiding high-risk zones.
    """
    api_key = os.getenv("ORS_API_KEY")
    if not api_key:
        logger.info("ORS_API_KEY not configured, using fallback safe trajectory")
        return _generate_fallback_route(start_coord, end_coord, avoid_center)

    url = "https://api.openrouteservice.org/v2/directions/driving-car"

    params = {
        "api_key": api_key,
        "start": f"{start_coord[1]},{start_coord[0]}",
        "end": f"{end_coord[1]},{end_coord[0]}"
    }

    body = {}
    if avoid_polygons:
        body["options"] = {"avoid_polygons": avoid_polygons}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if body:
                response = await client.post(url, params=params, json=body)
            else:
                response = await client.get(url, params=params)

            response.raise_for_status()
            data = response.json()

            route = data["features"][0]["geometry"]
            metrics = data["features"][0]["properties"]["summary"]

            return {
                "geometry": route,
                "distance": metrics["distance"],
                "duration": metrics["duration"]
            }

    except Exception as e:
        logger.warning(f"ORS Routing failed ({e}), returning safe fallback trajectory")
        return _generate_fallback_route(start_coord, end_coord, avoid_center)
