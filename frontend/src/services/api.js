import axios from 'axios';
import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || (
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? '/api'
        : 'https://ne-shield-api.onrender.com/api'
);

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
    getIncidents: async () => {
        try {
            const res = await api.get('/incidents');
            if (res.data?.data && res.data.data.length > 0) return res;
        } catch (e) {
            console.warn('Backend getIncidents unreachable, checking Supabase...', e);
        }
        if (supabase) {
            try {
                const { data, error } = await supabase.from('incidents').select('*').order('created_at', { ascending: false });
                if (!error && data) return { data: { success: true, data } };
            } catch (sbErr) {
                console.warn('Supabase getIncidents error:', sbErr);
            }
        }
        return api.get('/incidents');
    },
    submitIncident: (formData) => api.post('/incidents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    /** Requires Admin auth */
    assignIncident: async (id, payload) => {
        let backendOk = false;
        try {
            await api.post(`/incidents/${id}/assign`, payload, {
                headers: authHeader()
            });
            backendOk = true;
        } catch (e) {
            console.warn('Backend assign incident note:', e);
        }

        if (supabase) {
            try {
                const { error } = await supabase.from('incidents').update({
                    assigned_officer: payload.officer_name,
                    officer_unit: payload.officer_unit || 'SDRF',
                    dispatched_personnel: payload.dispatched_personnel || 4,
                    status: 'assigned',
                    assigned_at: new Date().toISOString()
                }).eq('id', id);
                if (!error) return { data: { success: true } };
            } catch (sbErr) {
                console.warn('Supabase assign fallback note:', sbErr);
                if (!backendOk) throw sbErr;
            }
        }

        if (!backendOk) throw new Error('Failed to assign field officer');
        return { data: { success: true } };
    },
    /** No auth required — open to all users */
    respondIncident: (id, payload) => api.post(`/incidents/${id}/respond`, payload),
    /** Requires Officer or Admin auth */
    resolveIncident: async (id, payload) => {
        let backendOk = false;
        try {
            await api.post(`/incidents/${id}/resolve`, payload, {
                headers: authHeader()
            });
            backendOk = true;
        } catch (e) {
            console.warn('Backend resolve incident note:', e);
        }

        if (supabase) {
            try {
                const { error } = await supabase.from('incidents').update({
                    status: 'resolved',
                    resolved_by: payload.officer_name || payload.resolved_by || 'Field Officer',
                    resolution_summary: payload.resolution_summary || payload.resolution_notes || 'Resolved and cleared',
                    resolution_notes: payload.resolution_notes || payload.resolution_summary || 'Resolved and cleared',
                    road_cleared: payload.road_cleared ?? true,
                    people_evacuated: payload.people_evacuated || 0,
                    resolved_at: new Date().toISOString()
                }).eq('id', id);
                if (!error) return { data: { success: true } };
            } catch (sbErr) {
                console.warn('Supabase resolve fallback note:', sbErr);
                if (!backendOk) throw sbErr;
            }
        }

        if (!backendOk) throw new Error('Failed to resolve incident');
        return { data: { success: true } };
    },
    /** Requires Admin auth — permanently delete an incident */
    deleteIncident: async (id) => {
        let backendOk = false;
        try {
            await api.delete(`/incidents/${id}`, {
                headers: authHeader()
            });
            backendOk = true;
        } catch (e) {
            console.warn('Backend delete incident note:', e);
        }

        if (supabase) {
            try {
                const { error } = await supabase.from('incidents').delete().eq('id', id);
                if (!error) return { data: { success: true } };
            } catch (sbErr) {
                if (!backendOk) throw sbErr;
            }
        }

        if (!backendOk) throw new Error('Failed to delete incident');
        return { data: { success: true } };
    },
    /** Requires Admin auth — force-create a pre-verified incident from HQ */
    adminCreateIncident: async (payload) => {
        let backendOk = false;
        try {
            const res = await api.post('/incidents/admin/create', payload, {
                headers: authHeader()
            });
            backendOk = true;
            return res;
        } catch (e) {
            console.warn('Backend adminCreateIncident note:', e);
        }

        if (supabase) {
            try {
                const newRecord = {
                    description: payload.description,
                    latitude: Number(payload.latitude) || 25.5788,
                    longitude: Number(payload.longitude) || 91.8933,
                    severity: payload.severity || 'High',
                    status: payload.assigned_officer ? 'assigned' : 'open',
                    assigned_officer: payload.assigned_officer || null,
                    officer_unit: payload.officer_unit || null,
                    dispatched_personnel: payload.dispatched_personnel || 0,
                    submitted_by: 'SEOC HQ Administrator',
                    reporter_role: 'admin',
                    verified: true,
                    verification_status: 'verified',
                    created_at: new Date().toISOString()
                };
                const { data, error } = await supabase.from('incidents').insert([newRecord]).select();
                if (!error && data) return { data: { success: true, data: data[0] } };
            } catch (sbErr) {
                console.warn('Supabase adminCreate fallback note:', sbErr);
            }
        }

        throw new Error('Failed to create admin incident');
    },
};

export const userService = {
    getUsers: (role = null) => api.get('/auth/users', { params: role ? { role } : {} }),
    async getOfficers() {
        if (supabase) {
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .in('role', ['field_officer', 'officer']);
                if (!error && data && data.length > 0) return data;
            } catch (e) {
                console.warn('Supabase getOfficers error:', e);
            }
        }
        try {
            const res = await api.get('/auth/users', { params: { role: 'field_officer' } });
            return res.data?.data || [];
        } catch (e) {
            return [];
        }
    }
};

export const routeService = {
    getSafeRoute: (payload) => api.post('/route', payload),
    getRoadStatus: (districtId = null) => api.get('/route/status', { params: { district_id: districtId } }),
    getShelters: (lat = null, lon = null) => api.get('/route/shelters', { params: { lat, lon } }),
    calculateEvacuation: (payload) => api.post('/route/evacuate', payload),
    getLocalities: () => api.get('/route/localities'),
    getOfflinePack: (payload) => api.post('/route/offline-pack', payload),
    submitReliefRequest: (payload) => api.post('/route/relief-requests', payload),
    getReliefRequests: (params = {}) => api.get('/route/relief-requests', { params }),
};

export const alertService = {
    testAlert: (payload) => api.post('/alert/test', payload),
    broadcastAlert: (payload, token = null) =>
        api.post('/alert/broadcast', payload, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : authHeader()
        }),
    triggerHardware: (payload) => api.post('/alert/hardware/trigger', payload, {
        headers: authHeader()
    }),
    getHardwareStatus: () => api.get('/alert/hardware/status'),
    getBeaconLogs: () => api.get('/alert/hardware/beacon/logs'),
};


export const deviceService = {
    registerToken: (token, districtId = null) =>
        api.post('/devices/token', { token, district_id: districtId }),
};

export default api;
