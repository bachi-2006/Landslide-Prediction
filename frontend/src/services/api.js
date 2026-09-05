import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
    baseURL: API_BASE_URL.replace(/\/$/, ''),
});

export const riskService = {
    getAllRisks: () => api.get('/risk'),
    getDistrictRisk: (id) => api.get(`/risk/${id}`),
    refreshRisk: (id, lat, lon, name) =>
        api.post(`/risk/refresh/${id}`, null, { params: { lat, lon, name } }),
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
};

export const deviceService = {
    registerToken: (token, districtId = null) =>
        api.post('/devices/token', { token, district_id: districtId }),
};

export default api;
