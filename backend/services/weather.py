"""
Weather Service
Fetches live weather data from Open-Meteo API.
"""

import httpx
import asyncio
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

                if not rain or not soil:
                    logger.warning(f"Incomplete data received for {lat}, {lon}")
                    return None

                # Simple aggregation for MVP:
                # rain_1h: latest hour
                # rain_3h: sum of last 3 hours
                # rain_24h: sum of last 24 hours
                return {
                    "rain_1h": rain[-1] if rain else 0.0,
                    "rain_3h": sum(rain[-3:]) if len(rain) >= 3 else sum(rain),
                    "rain_24h": sum(rain[-24:]) if len(rain) >= 24 else sum(rain),
                    "soil_moisture": soil[-1] if soil else 0.0
                }

        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            wait_time = 2 ** attempt
            logger.error(f"Attempt {attempt+1} failed to fetch weather: {e}. Retrying in {wait_time}s...")
            await asyncio.sleep(wait_time)

    logger.error(f"Max retries reached for weather fetch at {lat}, {lon}")
    return None
