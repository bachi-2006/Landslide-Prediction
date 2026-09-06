"""
Weather Service
Fetches live weather data from Open-Meteo API.
"""

import httpx
import asyncio
from datetime import datetime
from typing import TypedDict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WeatherData(TypedDict):
    rain_1h: float
    rain_3h: float
    rain_24h: float
    soil_moisture: float

async def fetch_weather(lat: float, lon: float) -> Optional[WeatherData]:
    """
    Fetch weather data for given coordinates using Open-Meteo API.
    Implements retry logic with exponential backoff.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "rain,soil_moisture_0_to_1cm",
        "past_days": 3,
        "forecast_days": 1,
        "timezone": "Asia/Kolkata"
    }

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()

                hourly = data.get("hourly", {})
                rain = hourly.get("rain", [])
                soil = hourly.get("soil_moisture_0_to_1cm", [])
                times = hourly.get("time", [])

                if not rain or not soil or not times:
                    logger.warning(f"Incomplete data received for {lat}, {lon}")
                    return None

                # Find the index corresponding to the current hour (Asia/Kolkata)
                # This ensures we measure observed trailing rainfall, not future forecast rain
                now_str = datetime.now().strftime("%Y-%m-%dT%H:00")
                matching_indices = [i for i, t in enumerate(times) if t <= now_str]
                current_idx = matching_indices[-1] if matching_indices else min(72, len(times) - 1)

                # Observed rainfall:
                # rain_1h: current observed hour
                # rain_3h: sum of trailing 3 hours up to current
                # rain_24h: sum of trailing 24 hours up to current
                rain_1h = float(rain[current_idx]) if current_idx < len(rain) else 0.0
                start_3h = max(0, current_idx - 2)
                rain_3h = float(sum(rain[start_3h:current_idx + 1]))
                start_24h = max(0, current_idx - 23)
                rain_24h = float(sum(rain[start_24h:current_idx + 1]))
                soil_m = float(soil[current_idx]) if current_idx < len(soil) else 0.0

                return {
                    "rain_1h": round(rain_1h, 1),
                    "rain_3h": round(rain_3h, 1),
                    "rain_24h": round(rain_24h, 1),
                    "soil_moisture": round(soil_m, 3)
                }

        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            wait_time = 2 ** attempt
            logger.error(f"Attempt {attempt+1} failed to fetch weather: {e}. Retrying in {wait_time}s...")
            await asyncio.sleep(wait_time)

    logger.error(f"Max retries reached for weather fetch at {lat}, {lon}")
    return None
