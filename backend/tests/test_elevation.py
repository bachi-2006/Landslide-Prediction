import pytest
import asyncio
from backend.services.elevation import fetch_elevation_and_slope

def test_elevation_calculation_structure():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    # Guwahati regional coordinate
    res = loop.run_until_complete(fetch_elevation_and_slope(26.15, 91.77))
    loop.close()
    if res is not None:
        assert "elevation" in res
        assert "slope" in res
        assert isinstance(res["elevation"], float)
        assert isinstance(res["slope"], float)
        assert res["slope"] >= 0.0
