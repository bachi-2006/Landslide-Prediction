import React, { useState } from 'react';
import { Camera, MapPin, Send, WifiOff, CheckCircle2 } from 'lucide-react';
import { incidentService } from '../services/api';
import { saveOfflineIncident } from '../services/offlineSync';
import { getTranslation } from '../services/i18n';

const IncidentForm = ({ onClose, lang = 'en', onReportSubmitted }) => {
    const t = (key) => getTranslation(lang, key);

    const [formData, setFormData] = useState({
        description: '',
        submitted_by: '',
        latitude: null,
        longitude: null,
    });
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [offlineNotice, setOfflineNotice] = useState(false);
    const [successNotice, setSuccessNotice] = useState(false);

    React.useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude
                    }));
                },
                (err) => {
                    console.warn("GPS lookup failed, using fallback NER coords", err);
                    setFormData(prev => ({
                        ...prev,
                        latitude: 26.15,
                        longitude: 91.77
                    }));
                }
            );
        }
    }, []);

    const handleFileChange = (e) => {
        const selected = e.target.files[0];
        if (selected) {
            setFile(selected);
            setPreviewUrl(URL.createObjectURL(selected));
        }
    };

    const convertFileToBase64 = (f) => new Promise((resolve) => {
        if (!f) return resolve(null);
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(f);
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const lat = formData.latitude || 26.15;
        const lon = formData.longitude || 91.77;

        // If offline, queue locally immediately
        if (!navigator.onLine) {
            const photoBase64 = await convertFileToBase64(file);
            saveOfflineIncident({
                description: formData.description,
                submitted_by: formData.submitted_by,
                latitude: lat,
                longitude: lon,
                photo_base64: photoBase64,
                photo_name: file?.name || 'incident.jpg'
            });
            setOfflineNotice(true);
            setTimeout(() => {
                onClose();
                onReportSubmitted?.();
            }, 1800);
            return;
        }

        // Attempt online upload
        const data = new FormData();
        data.append('description', formData.description);
        data.append('submitted_by', formData.submitted_by);
        data.append('latitude', lat);
        data.append('longitude', lon);
        if (file) data.append('photo', file);

        try {
            await incidentService.submitIncident(data);
            setSuccessNotice(true);
            setTimeout(() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                onClose();
                onReportSubmitted?.();
            }, 1200);
        } catch (err) {
            // Network fallback: save to offline queue
            console.warn("Upload failed, saving offline fallback:", err);
            const photoBase64 = await convertFileToBase64(file);
            saveOfflineIncident({
                description: formData.description,
                submitted_by: formData.submitted_by,
                latitude: lat,
                longitude: lon,
                photo_base64: photoBase64,
                photo_name: file?.name || 'incident.jpg'
            });
            setOfflineNotice(true);
            setTimeout(() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                onClose();
                onReportSubmitted?.();
            }, 1800);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1100] p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
                <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold">{t('report_incident')}</h2>
                        {!navigator.onLine && (
                            <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                                <WifiOff size={10} /> OFFLINE
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-1">✕</button>
                </div>

                {successNotice ? (
                    <div className="p-8 text-center flex flex-col items-center gap-3">
                        <CheckCircle2 size={48} className="text-emerald-500 animate-bounce" />
                        <h3 className="font-bold text-slate-800 text-base">Report Submitted Successfully!</h3>
                        <p className="text-xs text-slate-600 max-w-xs">Your crowd-sourced hazard report and photo evidence have been submitted to the GIS Command Center.</p>
                    </div>
                ) : offlineNotice ? (
                    <div className="p-8 text-center flex flex-col items-center gap-3">
                        <CheckCircle2 size={48} className="text-emerald-500" />
                        <h3 className="font-bold text-slate-800 text-base">{t('offline_mode')}</h3>
                        <p className="text-xs text-slate-600 max-w-xs">{t('offline_desc')}</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-700">{t('your_name')}</label>
                            <input
                                required
                                className="p-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="e.g. Field Officer / Local Resident"
                                value={formData.submitted_by}
                                onChange={e => setFormData({...formData, submitted_by: e.target.value})}
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-700">{t('description')}</label>
                            <textarea
                                required
                                className="p-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24"
                                placeholder="Describe road blockage, mudflow, or slope tension cracks..."
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                            />
                        </div>

                        <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs">
                            <MapPin size={16} className="text-blue-600" />
                            <span>
                                {formData.latitude 
                                    ? `GPS: ${formData.latitude.toFixed(4)}°N, ${formData.longitude.toFixed(4)}°E` 
                                    : 'Locating via GPS...'}
                            </span>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-700">{t('photo_evidence')}</label>
                            <label className="cursor-pointer p-3 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" className="h-24 object-cover rounded-lg" />
                                ) : (
                                    <>
                                        <Camera size={24} className="text-slate-400" />
                                        <span className="text-xs text-slate-500">{t('take_photo')}</span>
                                    </>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:bg-blue-300 text-sm shadow-md"
                        >
                            <Send size={16} />
                            {loading ? t('submitting') : t('submit_report')}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default IncidentForm;
