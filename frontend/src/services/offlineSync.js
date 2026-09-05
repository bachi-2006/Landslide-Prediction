import { incidentService } from './api';

const OFFLINE_KEY = 'ne_shield_offline_reports_v1';

export const getOfflineIncidents = () => {
    try {
        const stored = localStorage.getItem(OFFLINE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const saveOfflineIncident = (incident) => {
    const reports = getOfflineIncidents();
    reports.push({
        ...incident,
        id: 'offline_' + Date.now(),
        timestamp: new Date().toISOString()
    });
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(reports));
};

export const clearOfflineIncidents = () => {
    localStorage.removeItem(OFFLINE_KEY);
};

export const dataURItoBlob = (dataURI) => {
    if (!dataURI) return null;
    try {
        const byteString = atob(dataURI.split(',')[1]);
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
    } catch {
        return null;
    }
};

export const syncOfflineIncidents = async () => {
    const reports = getOfflineIncidents();
    if (!reports.length) return 0;

    let syncedCount = 0;
    const remaining = [];

    for (const report of reports) {
        try {
            const data = new FormData();
            data.append('description', report.description);
            data.append('submitted_by', report.submitted_by);
            data.append('latitude', report.latitude);
            data.append('longitude', report.longitude);

            if (report.photo_base64) {
                const blob = dataURItoBlob(report.photo_base64);
                if (blob) {
                    data.append('photo', blob, report.photo_name || 'incident.jpg');
                }
            }

            await incidentService.submitIncident(data);
            syncedCount++;
        } catch (e) {
            console.error('Failed to sync offline report', report, e);
            remaining.push(report);
        }
    }

    if (remaining.length > 0) {
        localStorage.setItem(OFFLINE_KEY, JSON.stringify(remaining));
    } else {
        clearOfflineIncidents();
    }

    return syncedCount;
};

export const initOfflineSync = (onSuccess) => {
    const handleOnline = async () => {
        if (navigator.onLine) {
            const count = await syncOfflineIncidents();
            if (count > 0 && onSuccess) {
                onSuccess(count);
            }
        }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
};
