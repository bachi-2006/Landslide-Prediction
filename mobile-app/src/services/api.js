// Mobile API Service for NE-SHIELD Backend & Database
export const getApiBaseUrl = () => {
  // Check if user set custom host in Profile/Settings
  if (typeof window !== 'undefined' && window.localStorage) {
    const customHost = localStorage.getItem('neshield_api_host');
    if (customHost && customHost.trim()) return customHost.trim().replace(/\/+$/, '');
  }

  // When running in mobile Vite dev server or browser
  if (typeof window !== 'undefined') {
    if (window.location.origin.includes(':5173') || window.location.origin.includes(':3000')) {
      return ''; // Vite proxy forwards /api to backend
    }
  }
  // Android Capacitor default (host IP or emulator loopback)
  return 'http://10.82.15.222:8000';
};

// Dynamic Base URL resolver that checks custom settings on each call
const BASE_URL = { toString: () => getApiBaseUrl() };

// Retrieve dynamic runtime session token issued by backend
const getAuthHeader = () => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('neshield_auth_token') ||
                  localStorage.getItem('neshield_auth_token') ||
                  localStorage.getItem('ne_shield_auth_token') || '';
    if (token) return { 'Authorization': `Bearer ${token}` };
  }
  return {};
};

export const mobileApi = {
  // 0. Auth & Identity
  async loginOrRegister(payload) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data && data.token) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('neshield_auth_token', data.token);
        localStorage.setItem('neshield_auth_token', data.token);
      }
    }
    return data;
  },

  // 1. District Risks
  async getRisks() {
    const res = await fetch(`${BASE_URL}/api/risk`);
    if (!res.ok) throw new Error('Failed to fetch risks');
    return res.json();
  },

  async getDistrictRisk(districtId) {
    const res = await fetch(`${BASE_URL}/api/risk/${districtId}`);
    if (!res.ok) throw new Error(`Failed to fetch district risk for ${districtId}`);
    return res.json();
  },

  async refreshDistrictRisk(districtId, lat, lon, name) {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), name });
    const res = await fetch(`${BASE_URL}/api/risk/refresh/${districtId}?${params.toString()}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to refresh district telemetry');
    return res.json();
  },

  // 2. Real-Time Micro-Site Point Risk & Topo Calculation
  async calculatePointRisk(lat, lon, label = 'Mobile Field Point') {
    const res = await fetch(`${BASE_URL}/api/risk/point`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: Number(lat), lon: Number(lon), label })
    });
    if (!res.ok) throw new Error('Failed to calculate point risk');
    return res.json();
  },

  // 3. Evacuation Shelter & Route Calculation with Personalized Precautions
  async calculateEvacuation(latitude, longitude, locationName = 'Current Location') {
    const res = await fetch(`${BASE_URL}/api/route/evacuate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: Number(latitude),
        lon: Number(longitude),
        latitude: Number(latitude),
        longitude: Number(longitude),
        location_query: locationName,
        location_name: locationName
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to calculate evacuation route');
    }
    return res.json();
  },

  async getShelters(lat = null, lon = null) {
    const query = lat && lon ? `?lat=${lat}&lon=${lon}` : '';
    const res = await fetch(`${BASE_URL}/api/route/shelters${query}`);
    if (!res.ok) throw new Error('Failed to fetch relief shelters');
    return res.json();
  },

  // 4. Incidents & Officer Assignment / Resolution
  async getIncidents() {
    const res = await fetch(`${BASE_URL}/api/incidents`);
    if (!res.ok) throw new Error('Failed to fetch incidents');
    return res.json();
  },

  async submitIncident(formData) {
    const res = await fetch(`${BASE_URL}/api/incidents`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to submit incident');
    }
    return res.json();
  },

  async respondIncident(incidentId, payload) {
    const res = await fetch(`${BASE_URL}/api/incidents/${incidentId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to record responder');
    return res.json();
  },

  async assignIncident(incidentId, payload) {
    const res = await fetch(`${BASE_URL}/api/incidents/${incidentId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader('admin')
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to assign field officer');
    return res.json();
  },

  async resolveIncident(incidentId, payload) {
    const res = await fetch(`${BASE_URL}/api/incidents/${incidentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader('field_officer')
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to resolve incident');
    return res.json();
  },

  // 5. Road Status Corridors
  async getRoadStatus(districtId = null) {
    const url = districtId 
      ? `${BASE_URL}/api/route/status/${districtId}`
      : `${BASE_URL}/api/route/status`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch road corridor status');
    return res.json();
  },

  // 6. Hardware Siren & Status
  async getHardwareStatus() {
    const res = await fetch(`${BASE_URL}/api/alert/hardware/status`);
    if (!res.ok) throw new Error('Failed to fetch hardware status');
    return res.json();
  },

  async triggerHardware(level = 'Critical', districtId = 'IN-ML-01') {
    const res = await fetch(`${BASE_URL}/api/alert/hardware/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        active: true,
        status: 'active',
        level,
        district_id: districtId,
        message: `Disaster alert triggered for ${districtId} (${level})`
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to trigger hardware beacon');
    }
    return res.json();
  },

  // 7. Device Push Token Registration
  async registerDeviceToken(token, districtId = null) {
    const res = await fetch(`${BASE_URL}/api/devices/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, district_id: districtId })
    });
    if (!res.ok) throw new Error('Failed to register device push token');
    return res.json();
  }
};

