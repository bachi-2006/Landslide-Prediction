import pytest
import asyncio
from backend.services.weather import fetch_weather

def test_weather_ingestion_structure():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    # Guwahati regional coordinate
    res = loop.run_until_complete(fetch_weather(26.15, 91.77))
    loop.close()
    if res is not None:
        assert "rain_1h" in res
        assert "rain_3h" in res
        assert "rain_24h" in res
        assert "soil_moisture" in res
        assert res["rain_24h"] >= 0.0
        assert res["soil_moisture"] >= 0.0
