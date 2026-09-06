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
    Fetch a real driving route from start to end.
    Prioritizes OpenRouteService (ORS) if ORS_API_KEY is configured,
    and seamlessly falls back to OpenStreetMap OSRM routing service so routing
    works reliably out of the box without requiring API keys.
    """
    api_key = os.getenv("ORS_API_KEY")

    # 1. Try OpenRouteService if an active key is present
    if api_key and "your_" not in api_key.lower():
        url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
        headers = {
            "Authorization": api_key,
            "Content-Type": "application/json"
        }
        body = {
            "coordinates": [
                [float(start_coord[1]), float(start_coord[0])],
                [float(end_coord[1]), float(end_coord[0])]
            ]
        }
        if avoid_polygons:
            body["options"] = {"avoid_polygons": avoid_polygons}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, headers=headers, json=body)
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
            logger.warning(f"ORS Routing failed ({e}), falling back to OSRM.")

    # 2. Keyless OpenStreetMap OSRM (Open Source Routing Machine)
    try:
        # Coordinates in lon,lat order
        start_lon, start_lat = float(start_coord[1]), float(start_coord[0])
        end_lon, end_lat = float(end_coord[1]), float(end_coord[0])

        osrm_url = f"https://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "false"
        }

        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(osrm_url, params=params)
            response.raise_for_status()
            data = response.json()

            if not data.get("routes"):
                logger.warning("OSRM returned no routes between the coordinates.")
                return None

            primary_route = data["routes"][0]
            return {
                "geometry": primary_route["geometry"],
                "distance": primary_route.get("distance", 0.0),
                "duration": primary_route.get("duration", 0.0)
            }
    except Exception as e:
        logger.error(f"Routing failed via all engines: {e}")
        return None
