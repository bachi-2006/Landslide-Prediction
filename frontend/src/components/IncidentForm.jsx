import React, { useState } from 'react';
import { Camera, MapPin, Send } from 'lucide-react';
import { incidentService } from '../services/api';

const IncidentForm = ({ onClose }) => {
    const [formData, setFormData] = useState({
        description: '',
        submitted_by: '',
        latitude: null,
        longitude: null,
    });
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition((pos) => {
                setFormData(prev => ({
                    ...prev,
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude
                }));
            });
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const data = new FormData();
        data.append('description', formData.description);
        data.append('submitted_by', formData.submitted_by);
        data.append('latitude', formData.latitude);
        data.append('longitude', formData.longitude);
        if (file) data.append('photo', file);

        try {
            await incidentService.submitIncident(data);
            alert("Incident reported successfully!");
            onClose();
        } catch (err) {
            alert("Error submitting report");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
                    <h2 className="text-xl font-bold">Report Incident</h2>
                    <button onClick={onClose} className="text-white/80 hover:text-white">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">Your Name</label>
                        <input
                            required
                            className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={formData.submitted_by}
                            onChange={e => setFormData({...formData, submitted_by: e.target.value})}
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">Description</label>
                        <textarea
                            required
                            className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        />
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-slate-100 rounded-lg text-slate-600 text-sm">
                        <MapPin size={16} />
                        <span>Location: {formData.latitude ? `${formData.latitude.toFixed(4)}, ${formData.longitude.toFixed(4)}` : 'Fetching GPS...'}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">Photo Evidence</label>
                        <label className="cursor-pointer p-4 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
                            <Camera size={24} className="text-slate-400" />
                            <span className="text-xs text-slate-500">{file ? file.name : 'Upload photo'}</span>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => setFile(e.target.files[0])}
                            />
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:bg-blue-300"
                    >
                        <Send size={18} />
                        {loading ? "Uploading..." : "Submit Report"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default IncidentForm;
