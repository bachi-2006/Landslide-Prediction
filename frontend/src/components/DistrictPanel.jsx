import React from 'react';
import { AlertTriangle, TrendingUp, MapPin, Navigation } from 'lucide-react';
import { riskService, routeService } from '../services/api';

const DistrictPanel = ({ district, onClose }) => {
    if (!district) return null;

    const [data, setData] = React.useState(null);
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        if (district.id) {
            riskService.getDistrictRisk(district.id)
                .then(res => setData(res.data.data))
                .catch(err => console.error(err));
        }
    }, [district]);

    const handleGetRoute = async () => {
        setLoading(true);
        try {
            // In a real app, we'd get current GPS origin. Here we mock.
            const payload = {
                origin_lat: 26.1, origin_lon: 91.7,
                dest_lat: district.lat, dest_lon: district.lon,
                avoid_district_id: district.id
            };
            const res = await routeService.getSafeRoute(payload);
            alert("Safe route generated! Check map overlay.");
        } catch (e) {
            alert("Routing failed");
        } finally {
            setLoading(false);
        }
    };

    const riskColors = {
        'Low': 'bg-green-100 text-green-800',
        'Moderate': 'bg-yellow-100 text-yellow-800',
        'High': 'bg-orange-100 text-orange-800',
        'Critical': 'bg-red-100 text-red-800',
    };

    if (!data) return <div className="p-6">Loading district risk data...</div>;

    return (
        <div className="w-96 h-full bg-white shadow-xl overflow-y-auto p-6 flex flex-col gap-6 border-l border-slate-200">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">{district.name}</h2>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className={`p-4 rounded-lg flex items-center gap-3 ${riskColors[data.risk_level] || 'bg-slate-100'}`}>
                <AlertTriangle size={24} />
                <div>
                    <p className="text-xs uppercase font-semibold">Current Risk Level</p>
                    <p className="text-xl font-bold">{data.risk_level}</p>
                </div>
            </div>

            <div>
                <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-600">Risk Score</span>
                    <span className="text-sm font-bold text-slate-800">{Math.round(data.risk_score * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-600 transition-all duration-500"
                        style={{ width: `${data.risk_score * 100}%` }}
                    />
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <TrendingUp size={16} /> Contributing Factors
                </h3>
                <div className="flex flex-col gap-3">
                    {Object.entries(data.factors_json).map(([factor, value]) => (
                        <div key={factor} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs text-slate-500 capitalize">
                                <span>{factor.replace('_', ' ')}</span>
                                <span>{Math.round(value)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-slate-400"
                                    style={{ width: `${value}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-auto pt-6 border-t border-slate-100">
                <button
                    onClick={handleGetRoute}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:bg-blue-300"
                >
                    <Navigation size={18} />
                    {loading ? "Calculating..." : "Show Safe Route"}
                </button>
            </div>
        </div>
    );
};

import { useState } from 'react'; // Fix missing import

export default DistrictPanel;
