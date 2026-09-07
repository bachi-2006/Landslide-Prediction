import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Retrieve ephemeral runtime session token issued by /api/auth/login
const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('neshield_auth_token') ||
           localStorage.getItem('neshield_auth_token') ||
           localStorage.getItem('ne_shield_auth_token') || '';
};

const api = axios.create({
    baseURL: API_BASE_URL.replace(/\/$/, ''),
    timeout: 15000,
});

// Attach session token dynamically if user is logged in
api.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

/** Returns auth header object dynamically from active session */
const authHeader = () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const riskService = {
    getAllRisks: () => api.get('/risk'),
    getDistrictRisk: (id) => api.get(`/risk/${id}`),
    refreshRisk: (id, lat, lon, name) =>
        api.post(`/risk/refresh/${id}`, null, { params: { lat, lon, name } }),
    /** Requires Admin auth */
    simulateRisk: (payload) => api.post('/risk/simulate', payload, {
        headers: authHeader('admin')
    }),
    calculatePointRisk: (lat, lon, label) => api.post('/risk/point', { lat, lon, label }),
};

export const incidentService = {
    getIncidents: () => api.get('/incidents'),
    submitIncident: (formData) => api.post('/incidents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    /** Requires Admin auth */
    assignIncident: (id, payload) => api.post(`/incidents/${id}/assign`, payload, {
        headers: authHeader('admin')
    }),
    /** No auth required — open to all users */
    respondIncident: (id, payload) => api.post(`/incidents/${id}/respond`, payload),
    /** Requires Officer or Admin auth */
    resolveIncident: (id, payload, role = 'field_officer') =>
        api.post(`/incidents/${id}/resolve`, payload, {
            headers: authHeader(role)
        }),
};

export const routeService = {
    getSafeRoute: (payload) => api.post('/route', payload),
    getRoadStatus: (districtId = null) => api.get('/route/status', { params: { district_id: districtId } }),
    getShelters: (lat = null, lon = null) => api.get('/route/shelters', { params: { lat, lon } }),
    calculateEvacuation: (payload) => api.post('/route/evacuate', payload),
};

export const alertService = {
    testAlert: (payload) => api.post('/alert/test', payload),
    broadcastAlert: (payload, token = 'ne-shield-authority-key-2026') =>
        api.post('/alert/broadcast', payload, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }),
    triggerHardware: (payload) => api.post('/alert/hardware/trigger', payload),
};

export const deviceService = {
    registerToken: (token, districtId = null) =>
        api.post('/devices/token', { token, district_id: districtId }),
};

export default api;
