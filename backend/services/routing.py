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
    geometry: str # GeoJSON LineString
    distance: float
    duration: float

async def get_alternative_route(start_coord: tuple, end_coord: tuple, avoid_polygons: list = None) -> Optional[RouteResponse]:
    """
    Fetch a route from start to end, optionally avoiding high-risk zones.
    """
    api_key = os.getenv("ORS_API_KEY")
    if not api_key:
        logger.error("ORS_API_KEY not set")
        return None

    url = "https://api.openrouteservice.org/v2/directions/driving-car"

    # ORS expects [lon, lat]
    params = {
        "api_key": api_key,
        "start": f"{start_coord[1]},{start_coord[0]}",
        "end": f"{end_coord[1]},{end_coord[0]}"
    }

    # If avoid_polygons is provided, we can use the 'avoid_polygons' parameter
    # This is a complex GeoJSON object. For MVP, we pass it if available.
    body = {}
    if avoid_polygons:
        body["options"] = {"avoid_polygons": avoid_polygons}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if body:
                response = await client.post(url, params=params, json=body)
            else:
                response = await client.get(url, params=params)

            response.raise_for_status()
            data = response.json()

            # Extract geometry and metrics
            route = data["features"][0]["geometry"]
            metrics = data["features"][0]["properties"]["summary"]

            return {
                "geometry": route,
                "distance": metrics["distance"],
                "duration": metrics["duration"]
            }

    except Exception as e:
        logger.error(f"ORS Routing failed: {e}")
        return None
