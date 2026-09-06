import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
    baseURL: API_BASE_URL.replace(/\/$/, ''),
    timeout: 15000,
});

export const riskService = {
    getAllRisks: () => api.get('/risk'),
    getDistrictRisk: (id) => api.get(`/risk/${id}`),
    refreshRisk: (id, lat, lon, name) =>
        api.post(`/risk/refresh/${id}`, null, { params: { lat, lon, name } }),
    simulateRisk: (payload) => api.post('/risk/simulate', payload),
};

export const incidentService = {
    getIncidents: () => api.get('/incidents'),
    submitIncident: (formData) => api.post('/incidents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
};

export const routeService = {
    getSafeRoute: (payload) => api.post('/route', payload),
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
