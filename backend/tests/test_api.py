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

def test_hardware_siren_trigger():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            # 1. Trigger hardware siren -> 200
            resp_trigger = await client.post(
                '/api/alert/hardware/trigger',
                json={'active': True, 'message': 'Simulated hardware test siren', 'level': 'Critical'}
            )
            assert resp_trigger.status_code == 200
            assert resp_trigger.json()['status'] == 'success'
            assert resp_trigger.json()['data']['is_active'] is True

            # 2. Hardware status endpoint reflects active alert -> 200
            resp_status = await client.get('/api/alert/hardware/status')
            assert resp_status.status_code == 200
            assert resp_status.json()['is_active'] is True

            # 3. Reset hardware siren -> 200
            resp_reset = await client.post('/api/alert/hardware/trigger', json={'active': False})
            assert resp_reset.status_code == 200
            assert resp_reset.json()['data']['is_active'] is False
    run_async(_test())

def test_evacuate_unknown_location_rejection():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            # Unknown location with no coords must return 400, NOT silently route to Shillong
            resp_bad = await client.post('/api/route/evacuate', json={'location_query': 'Unknown Fictional Place 999'})
            assert resp_bad.status_code == 400
            assert 'could not be resolved' in resp_bad.json()['detail']

            # Passing lat/lon coordinates explicitly works
            resp_good = await client.post('/api/route/evacuate', json={'lat': 25.5788, 'lon': 91.8933})
            assert resp_good.status_code == 200
            assert resp_good.json()['success'] is True
    run_async(_test())

def test_incident_reporter_role_verification():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            # Untrusted request claiming field_officer without auth token is demoted to citizen
            resp_unauth = await client.post(
                '/api/incidents',
                data={
                    'description': 'Test hazard',
                    'latitude': 25.57,
                    'longitude': 91.88,
                    'reporter_role': 'field_officer'
                }
            )
            assert resp_unauth.status_code == 200
            assert resp_unauth.json()['data']['reporter_role'] == 'citizen'
            assert resp_unauth.json()['data']['verification_status'] == 'community_reported'

            # Valid officer auth token preserves field_officer role
            resp_auth = await client.post(
                '/api/incidents',
                data={
                    'description': 'Verified slope failure',
                    'latitude': 25.57,
                    'longitude': 91.88,
                    'reporter_role': 'field_officer'
                },
                headers={'Authorization': 'Bearer ne-shield-officer-key-2026'}
            )
            assert resp_auth.status_code == 200
            assert resp_auth.json()['data']['reporter_role'] == 'field_officer'
            assert resp_auth.json()['data']['verification_status'] == 'verified'
    run_async(_test())

def test_get_ner_localities():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            resp = await client.get('/api/route/localities')
            assert resp.status_code == 200
            data = resp.json()
            assert data['success'] is True
            assert len(data['data']) >= 16
            assert any(loc['id'] == 'loc-shillong' for loc in data['data'])
            assert any(loc['id'] == 'loc-sohra' for loc in data['data'])
    run_async(_test())

def test_generate_offline_pack():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            resp = await client.post('/api/route/offline-pack', json={'locality_id': 'loc-shillong'})
            assert resp.status_code == 200
            data = resp.json()
            assert data['success'] is True
            pack = data['data']
            assert pack['locality']['id'] == 'loc-shillong'
            # Must return 3 nearest relief centres
            assert len(pack['centres']) == 3
            # Must return 3 distinct paths with valid GeoJSON coordinate lists
            assert len(pack['paths']) == 3
            for path in pack['paths']:
                assert 'coordinates' in path
                assert len(path['coordinates']) >= 2
                assert 'color' in path
                assert 'distance_km' in path
            # Must include emergency contacts and offline advisory
            assert len(pack['offline_advisory']) >= 3
            assert len(pack['emergency_contacts']) >= 3
    run_async(_test())

def test_relief_requests():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            # 1. Create a request for food and potable water
            post_resp = await client.post(
                '/api/route/relief-requests',
                json={
                    'user_name': 'Mary Nongkynrih',
                    'phone': '+91-98620-99887',
                    'locality_name': 'Mawlai, Shillong',
                    'lat': 25.5920,
                    'lon': 91.8840,
                    'aid_type': 'food',
                    'people_count': 5,
                    'urgency': 'Critical',
                    'notes': 'Landslide cut road access; family needs rations and water.'
                }
            )
            assert post_resp.status_code == 200
            post_data = post_resp.json()
            assert post_data['success'] is True
            assert 'SOS-' in post_data['request_id']

            # 2. Get list of relief requests
            get_resp = await client.get('/api/route/relief-requests')
            assert get_resp.status_code == 200
            get_data = get_resp.json()
            assert get_data['success'] is True
            assert len(get_data['data']) >= 1
            assert any(r['user_name'] == 'Mary Nongkynrih' for r in get_data['data'])
    run_async(_test())


def test_admin_create_and_delete_incident():
    async def _test():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            # Login as Admin (password 99)
            login_resp = await client.post('/api/auth/login', json={'role': 'admin', 'password': '99', 'name': 'Commander Roy'})
            assert login_resp.status_code == 200
            admin_token = login_resp.json()['token']

            # 1. Admin creates pre-verified incident
            create_resp = await client.post(
                '/api/incidents/admin/create',
                headers={'Authorization': f'Bearer {admin_token}'},
                json={
                    'description': 'Admin Verified: Hillside erosion block on NH-40',
                    'latitude': 25.5910,
                    'longitude': 91.8920,
                    'severity': 'Critical',
                    'assigned_officer': 'Inspector H. Lyngdoh',
                    'officer_unit': 'SDRF Patrol Alpha',
                    'dispatched_personnel': 6
                }
            )
            assert create_resp.status_code == 200
            inc_data = create_resp.json()
            assert inc_data['success'] is True
            inc_id = inc_data['data']['id']
            assert inc_data['data']['reporter_role'] == 'admin'
            assert inc_data['data']['verification_status'] == 'admin_verified'
            assert inc_data['data']['status'] == 'in_progress'

            # 2. Non-admin (officer or citizen) cannot delete incident -> 403
            off_login = await client.post('/api/auth/login', json={'role': 'field_officer', 'password': '9', 'name': 'Officer Test'})
            off_token = off_login.json()['token']
            del_bad = await client.delete(
                f'/api/incidents/{inc_id}',
                headers={'Authorization': f'Bearer {off_token}'}
            )
            assert del_bad.status_code == 403

            # 3. Admin successfully deletes incident -> 200
            del_good = await client.delete(
                f'/api/incidents/{inc_id}',
                headers={'Authorization': f'Bearer {admin_token}'}
            )
            assert del_good.status_code == 200
            assert del_good.json()['success'] is True
            assert del_good.json()['deleted_id'] == inc_id
    run_async(_test())


def test_session_token_restart_safe():
    from backend.services.auth import create_session, verify_session, ACTIVE_SESSIONS
    # 1. Issue admin token
    token = create_session('admin', user_name='HQ Commander Dave', district='East Khasi Hills')
    assert token.startswith('neshield_adm_')

    # 2. Simulate server restart by clearing in-memory session cache
    ACTIVE_SESSIONS.clear()
    assert token not in ACTIVE_SESSIONS

    # 3. Verify session still validates via HMAC signature and restores user profile
    session = verify_session(token, required_role='admin')
    assert session is not None
    assert session['role'] == 'admin'
    assert session['name'] == 'HQ Commander Dave'
    assert session['district'] == 'East Khasi Hills'


