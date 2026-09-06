// Mobile API Service for NE-SHIELD Backend & Database
const getApiBaseUrl = () => {
  // When running in mobile Vite dev server or browser
  if (typeof window !== 'undefined') {
    if (window.location.origin.includes(':5173')) {
      return ''; // Vite proxy forwards /api to backend
    }
  }
  // Android Capacitor or external host
  return 'http://10.82.15.222:8000';
};

const BASE_URL = getApiBaseUrl();

export const mobileApi = {
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

  // 3. Incidents
  async getIncidents() {
    const res = await fetch(`${BASE_URL}/api/incidents`);
    if (!res.ok) throw new Error('Failed to fetch incidents');
    return res.json();
  },

  async submitIncident(formData) {
    const res = await fetch(`${BASE_URL}/api/incidents`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to submit incident');
    return res.json();
  },

  // 4. Road Status Corridors
  async getRoadStatus(districtId = null) {
    const url = districtId 
      ? `${BASE_URL}/api/route/status/${districtId}`
      : `${BASE_URL}/api/route/status`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch road corridor status');
    return res.json();
  },

  // 5. Hardware Siren & Status
  async getHardwareStatus() {
    const res = await fetch(`${BASE_URL}/api/alert/hardware/status`);
    if (!res.ok) throw new Error('Failed to fetch hardware status');
    return res.json();
  },

  async triggerHardware(level = 'Critical', districtId = 'IN-ML-01') {
    const res = await fetch(`${BASE_URL}/api/alert/hardware/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', level, district_id: districtId })
    });
    if (!res.ok) throw new Error('Failed to trigger hardware beacon');
    return res.json();
  },

  // 6. Device Push Token Registration
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
