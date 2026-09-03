import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
    baseURL: API_BASE_URL,
});

export const riskService = {
    getAllRisks: () => api.get('/api/risk'),
    getDistrictRisk: (id) => api.get(`/api/risk/${id}`),
    refreshRisk: (id, lat, lon, name) =>
        api.post(`/api/risk/refresh/${id}`, null, { params: { lat, lon, name } }),
};

export const incidentService = {
    getIncidents: () => api.get('/api/incidents'),
    submitIncident: (formData) => api.post('/api/incidents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
};

export const routeService = {
    getSafeRoute: (payload) => api.post('/api/route', payload),
};

export const alertService = {
    testAlert: (payload) => api.post('/api/alert/test', payload),
};

export default api;
