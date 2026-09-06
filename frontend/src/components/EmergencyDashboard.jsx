import React, { useState } from 'react';
import { ShieldAlert, PhoneCall, AlertTriangle, ChevronRight, X, Radio } from 'lucide-react';
import { getTranslation } from '../services/i18n';
import { alertService } from '../services/api';

const EmergencyDashboard = ({ risks, geoJsonData, onSelectDistrict, onClose, lang }) => {
    const t = (key) => getTranslation(lang, key);
    const [selectedLevel, setSelectedLevel] = useState('All');
    const [broadcasting, setBroadcasting] = useState(false);
    const [broadcastStatus, setBroadcastStatus] = useState(null);

    // Merge risk scores with district names
    const districtList = (geoJsonData?.features || []).map(f => {
        const id = f.properties.id;
        const name = f.properties.name || f.properties.district_name || 'District';
        const riskEntry = risks.find(r => r.district_id === id);
        return {
            id,
            name,
            state: f.properties.state || 'NER',
            risk_level: riskEntry?.risk_level || 'Low',
            risk_score: riskEntry?.risk_score || 0.1,
            feature: f
        };
    });

    // Priority ordering
    const priorityOrder = { 'Critical': 1, 'High': 2, 'Moderate': 3, 'Low': 4 };
    districtList.sort((a, b) => (priorityOrder[a.risk_level] || 99) - (priorityOrder[b.risk_level] || 99) || b.risk_score - a.risk_score);

    const filtered = selectedLevel === 'All' 
        ? districtList 
        : districtList.filter(d => d.risk_level === selectedLevel);

    const counts = {
        Critical: districtList.filter(d => d.risk_level === 'Critical').length,
        High: districtList.filter(d => d.risk_level === 'High').length,
        Moderate: districtList.filter(d => d.risk_level === 'Moderate').length,
        Low: districtList.filter(d => d.risk_level === 'Low').length,
    };

    const handleBroadcast = async (districtId, districtName, level) => {
        setBroadcasting(true);
        setBroadcastStatus(null);
        try {
            await alertService.broadcastAlert({
                district_id: districtId,
                level: level,
                message: `URGENT LANDSLIDE ALERT for ${districtName}: High slope instability detected. Avoid vulnerable hill roads.`,
                channels: ['push', 'sms']
            });
            setBroadcastStatus(`Broadcast dispatched for ${districtName} via App Push & SMS!`);
        } catch (e) {
            setBroadcastStatus(`Broadcast failed or authority key invalid for ${districtName}.`);
        } finally {
            setBroadcasting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1100] p-4">
            <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-600 rounded-lg">
                            <ShieldAlert size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{t('emergency_dashboard')}</h2>
                            <p className="text-xs text-slate-400">Regional Disaster Management & Rapid Response Prioritisation</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
                        <X size={22} />
                    </button>
                </div>

                {/* Priority Stats Bar */}
                <div className="grid grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200">
                    <button
                        onClick={() => setSelectedLevel(selectedLevel === 'Critical' ? 'All' : 'Critical')}
                        className={`p-3 rounded-xl border text-left transition-all ${selectedLevel === 'Critical' ? 'border-red-600 bg-red-50' : 'bg-white border-slate-200'}`}
                    >
                        <span className="text-xs font-bold text-red-600 uppercase">{t('priority_critical')}</span>
                        <div className="text-2xl font-black text-slate-900 mt-0.5">{counts.Critical}</div>
                    </button>
                    <button
                        onClick={() => setSelectedLevel(selectedLevel === 'High' ? 'All' : 'High')}
                        className={`p-3 rounded-xl border text-left transition-all ${selectedLevel === 'High' ? 'border-orange-500 bg-orange-50' : 'bg-white border-slate-200'}`}
                    >
                        <span className="text-xs font-bold text-orange-600 uppercase">{t('priority_high')}</span>
                        <div className="text-2xl font-black text-slate-900 mt-0.5">{counts.High}</div>
                    </button>
                    <button
                        onClick={() => setSelectedLevel(selectedLevel === 'Moderate' ? 'All' : 'Moderate')}
                        className={`p-3 rounded-xl border text-left transition-all ${selectedLevel === 'Moderate' ? 'border-yellow-500 bg-yellow-50' : 'bg-white border-slate-200'}`}
                    >
                        <span className="text-xs font-bold text-yellow-600 uppercase">{t('priority_moderate')}</span>
                        <div className="text-2xl font-black text-slate-900 mt-0.5">{counts.Moderate}</div>
                    </button>
                    <button
                        onClick={() => setSelectedLevel(selectedLevel === 'Low' ? 'All' : 'Low')}
                        className={`p-3 rounded-xl border text-left transition-all ${selectedLevel === 'Low' ? 'border-green-500 bg-green-50' : 'bg-white border-slate-200'}`}
                    >
                        <span className="text-xs font-bold text-green-600 uppercase">{t('priority_low')}</span>
                        <div className="text-2xl font-black text-slate-900 mt-0.5">{counts.Low}</div>
                    </button>
                </div>

                {broadcastStatus && (
                    <div className="bg-emerald-50 text-emerald-800 px-5 py-2 text-xs font-semibold flex items-center justify-between border-b border-emerald-100">
                        <span>{broadcastStatus}</span>
                        <button onClick={() => setBroadcastStatus(null)} className="text-emerald-600 font-bold">✕</button>
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filtered.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">{t('no_districts')}</div>
                    ) : (
                        filtered.map(d => {
                            const badgeColor = {
                                'Critical': 'bg-red-100 text-red-700 border-red-200',
                                'High': 'bg-orange-100 text-orange-700 border-orange-200',
                                'Moderate': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                                'Low': 'bg-green-100 text-green-700 border-green-200'
                            }[d.risk_level] || 'bg-slate-100';

                            return (
                                <div
                                    key={d.id}
                                    className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-400 transition-all shadow-sm"
                                >
                                    <div 
                                        onClick={() => { onSelectDistrict(d.feature); onClose(); }}
                                        className="flex items-center gap-3 cursor-pointer flex-1"
                                    >
                                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${badgeColor}`}>
                                            {d.risk_level}
                                        </span>
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm hover:text-blue-600">{d.name}</h4>
                                            <p className="text-xs text-slate-500">Risk Score: {Math.round(d.risk_score * 100)}%</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {(d.risk_level === 'Critical' || d.risk_level === 'High') && (
                                            <button
                                                onClick={() => handleBroadcast(d.id, d.name, d.risk_level)}
                                                disabled={broadcasting}
                                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                            >
                                                <Radio size={14} className={broadcasting ? 'animate-pulse' : ''} />
                                                <span>Issue Multi-Channel Alert</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { onSelectDistrict(d.feature); onClose(); }}
                                            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
                                        >
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Helpline */}
                <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                    <div className="flex items-center gap-4 flex-wrap">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <PhoneCall size={14} className="text-blue-600" /> {t('emergency_contacts')}:
                        </span>
                        <span className="bg-white px-2.5 py-1 rounded border border-slate-200">{t('ndrf_helpline')}</span>
                        <span className="bg-white px-2.5 py-1 rounded border border-slate-200">{t('state_sdma')}</span>
                        <span className="bg-white px-2.5 py-1 rounded border border-slate-200">{t('ambulance')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmergencyDashboard;
