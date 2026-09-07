import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// API keys loaded from env (dev defaults are safe for local use only)
const OFFICER_KEY = import.meta.env.VITE_OFFICER_API_KEY || 'ne-shield-officer-key-2026';
const ADMIN_KEY   = import.meta.env.VITE_ADMIN_API_KEY   || 'ne-shield-admin-key-2026';

const api = axios.create({
    baseURL: API_BASE_URL.replace(/\/$/, ''),
    timeout: 15000,
});

/** Returns auth header object for a given role */
const authHeader = (role = 'admin') => ({
    Authorization: `Bearer ${role === 'admin' ? ADMIN_KEY : OFFICER_KEY}`
});

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
