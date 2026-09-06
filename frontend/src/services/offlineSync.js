import { incidentService } from './api';

const DB_NAME = 'ne_shield_db_v1';
const STORE_NAME = 'offline_reports';
const DB_VERSION = 1;

const openDatabase = () => {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            resolve(null);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getOfflineIncidents = async () => {
    try {
        const db = await openDatabase();
        if (!db) {
            const raw = localStorage.getItem('ne_shield_offline_reports_v1');
            return raw ? JSON.parse(raw) : [];
        }
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
};

export const saveOfflineIncident = async (incident) => {
    const record = {
        ...incident,
        id: 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString()
    };
    try {
        const db = await openDatabase();
        if (!db) {
            const cur = JSON.parse(localStorage.getItem('ne_shield_offline_reports_v1') || '[]');
            cur.push(record);
            localStorage.setItem('ne_shield_offline_reports_v1', JSON.stringify(cur));
            return;
        }
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
    } catch (err) {
        console.warn("Failed to persist offline incident to IndexedDB", err);
    }
};

export const clearOfflineIncidents = async () => {
    try {
        const db = await openDatabase();
        if (!db) {
            localStorage.removeItem('ne_shield_offline_reports_v1');
            return;
        }
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
    } catch (err) {
        console.warn("Failed to clear IndexedDB reports", err);
    }
};

export const deleteOfflineIncident = async (id) => {
    try {
        const db = await openDatabase();
        if (db) {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(id);
        }
    } catch (err) {
        console.warn("Failed to delete synced report from IndexedDB", err);
    }
};

export const dataURItoBlob = (dataURI) => {
    if (!dataURI) return null;
    try {
        const parts = dataURI.split(',');
        const byteString = atob(parts[1]);
        const mimeString = parts[0].split(':')[1].split(';')[0];
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
    const reports = await getOfflineIncidents();
    if (!reports.length) return 0;

    let syncedCount = 0;

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
            await deleteOfflineIncident(report.id);
            syncedCount++;
        } catch (e) {
            console.error('Failed to sync offline report, will retry later:', report.id, e);
        }
    }

    return syncedCount;
};

export const initOfflineSync = (onSuccess) => {
    const triggerSync = async () => {
        if (navigator.onLine) {
            const count = await syncOfflineIncidents();
            if (count > 0 && onSuccess) {
                onSuccess(count);
            }
        }
    };

    // Check pending uploads immediately on launch if online
    triggerSync();

    window.addEventListener('online', triggerSync);
    return () => window.removeEventListener('online', triggerSync);
};
