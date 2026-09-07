import asyncio
import httpx
import pytest
from backend.main import app

def run_async(coro):
    return asyncio.run(coro)

def test_health():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            resp = await client.get('/health')
            assert resp.status_code == 200
            assert resp.json()['status'] == 'ok'
    run_async(_test())

def test_evacuate_endpoint_ml_wiring():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            resp = await client.post('/api/route/evacuate', json={'location_query': 'Cherrapunji'})
            assert resp.status_code == 200
            data = resp.json()
            assert data['success'] is True
            assert 'risk_score' in data
            assert 'shap_factors' in data
            assert 'precautions' in data
    run_async(_test())

def test_simulate_auth_guard():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            resp_bad = await client.post('/api/risk/simulate', json={
                'district_id': 'IN-ML-01',
                'district_name': 'East Khasi Hills',
                'lat': 25.57,
                'lon': 91.88,
                'rain_24h': 150,
                'soil_moisture': 0.5,
                'slope': 40
            })
            assert resp_bad.status_code in [401, 403]

            resp_good = await client.post(
                '/api/risk/simulate',
                json={
                    'district_id': 'IN-ML-01',
                    'district_name': 'East Khasi Hills',
                    'lat': 25.57,
                    'lon': 91.88,
                    'rain_24h': 150,
                    'soil_moisture': 0.5,
                    'slope': 40
                },
                headers={'Authorization': 'Bearer ne-shield-admin-key-2026'}
            )
            assert resp_good.status_code == 200
            assert resp_good.json()['success'] is True
    run_async(_test())
