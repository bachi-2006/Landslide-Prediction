"""
Elevation Service
Fetches elevation and slope data from OpenTopoData API.
"""

import httpx
import asyncio
import math
from typing import TypedDict, Optional, List
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ElevationData(TypedDict):
    elevation: float
    slope: float

async def fetch_elevation_and_slope(lat: float, lon: float) -> Optional[ElevationData]:
    """
    Fetch elevation and compute slope for given coordinates.
    Uses OpenTopoData SRTM30m.
    """
    # To calculate slope, we fetch the center point and 8 surrounding points (approx 100m offset)
    # Offset approx 0.001 degrees ~ 111m
    offsets = [
        (0, 0), (0, 0.001), (0, -0.001), (0.001, 0), (-0.001, 0),
        (0.001, 0.001), (0.001, -0.001), (-0.001, 0.001), (-0.001, -0.001)
    ]

    locations = [f"{lat + d_lat},{lon + d_lon}" for d_lat, d_lon in offsets]
    url = "https://api.opentopodata.org/v1/srtm30m"
    params = {"locations": ",".join(locations)}

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                results = response.json().get("results", [])

                if len(results) < 9:
                    logger.warning(f"Incomplete elevation data for {lat}, {lon}")
                    return None

                elevations = [r.get("elevation") for r in results if r.get("elevation") is not None]
                if not elevations:
                    return None

                center_elev = elevations[0]
                if len(elevations) < 2:
                    return {
                        "elevation": round(center_elev, 1),
                        "slope": 0.0
                    }

                # Slope Calculation: Angle in degrees
                # Slope angle = arctan(elevation_rise / horizontal_run)
                # Approximate horizontal offset is ~111 meters
                max_diff = max([abs(e - center_elev) for e in elevations[1:]])
                slope_deg = round(math.degrees(math.atan(max_diff / 111.0)), 1)

                return {
                    "elevation": round(center_elev, 1),
                    "slope": slope_deg
                }

        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            wait_time = 2 ** attempt
            logger.error(f"Attempt {attempt+1} failed to fetch elevation: {e}. Retrying in {wait_time}s...")
            await asyncio.sleep(wait_time)

    logger.error(f"Max retries reached for elevation fetch at {lat}, {lon}")
    return None
