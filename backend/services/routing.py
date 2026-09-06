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

async def get_alternative_route(start_coord: tuple, end_coord: tuple, avoid_polygons: list = None, avoid_center: tuple = None) -> Optional[RouteResponse]:
    """
    Fetch a route from start to end, optionally avoiding high-risk zones.
    Returns None if external routing engine (ORS) is not configured or fails,
    preventing fabricated geometric routes through hazardous terrain.
    """
    api_key = os.getenv("ORS_API_KEY")
    if not api_key or "your_" in api_key.lower():
        logger.warning("ORS_API_KEY is not configured. Safe road routing requires an active OpenRouteService key.")
        return None

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
        logger.warning(f"ORS Routing failed ({e}). Returning None so client displays safe route unavailable.")
        return None
