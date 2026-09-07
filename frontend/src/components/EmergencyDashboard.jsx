import React, { useState, useEffect } from 'react';
import { ShieldAlert, PhoneCall, AlertTriangle, ChevronRight, X, Radio, Users, CheckCircle, Clock, ShieldCheck, UserCheck } from 'lucide-react';
import { getTranslation } from '../services/i18n';
import { alertService, incidentService } from '../services/api';
import { ROLES, rbac } from '../services/rbac';

const EmergencyDashboard = ({ risks, geoJsonData, onSelectDistrict, onClose, lang, activeRole = 'citizen', onIncidentUpdated }) => {
    const t = (key) => getTranslation(lang, key);
    const [activeTab, setActiveTab] = useState('districts'); // 'districts' | 'incidents'
    const [selectedLevel, setSelectedLevel] = useState('All');
    const [broadcasting, setBroadcasting] = useState(false);
    const [broadcastStatus, setBroadcastStatus] = useState(null);
    const [incidents, setIncidents] = useState([]);
    const [incidentsLoading, setIncidentsLoading] = useState(false);
    const [selectedOfficer, setSelectedOfficer] = useState({});
    const [actionMsg, setActionMsg] = useState(null);

    const loadIncidents = async () => {
        setIncidentsLoading(true);
        try {
            const res = await incidentService.getIncidents();
            const list = res.data?.data || res.data || [];
            setIncidents(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error('Failed to load incidents in dashboard', e);
        } finally {
            setIncidentsLoading(false);
        }
    };

    useEffect(() => {
        loadIncidents();
    }, []);

    const handleAssignOfficer = async (incidentId) => {
        const officerName = selectedOfficer[incidentId] || 'Inspector H. Lyngdoh - Patrol Alpha';
        try {
            await incidentService.assignIncident(incidentId, {
                officer_name: officerName,
                officer_role: 'field_officer'
            });
            setActionMsg(`Officer "${officerName}" assigned to incident #${incidentId}`);
            await loadIncidents();
            if (onIncidentUpdated) onIncidentUpdated();
            setTimeout(() => setActionMsg(null), 4000);
        } catch (err) {
            setActionMsg(`Failed to assign officer: ${err.response?.data?.detail || err.message}`);
        }
    };

    const handleRespondToIncident = async (incidentId) => {
        try {
            await incidentService.respondIncident(incidentId, {
                responder_name: 'Volunteer First Responder',
                headcount: 1
            });
            setActionMsg(`Recorded your emergency response to incident #${incidentId}!`);
            await loadIncidents();
            if (onIncidentUpdated) onIncidentUpdated();
            setTimeout(() => setActionMsg(null), 4000);
        } catch (err) {
            setActionMsg(`Failed to record response: ${err.message}`);
        }
    };

    const handleResolveIncident = async (incidentId) => {
        try {
            await incidentService.resolveIncident(incidentId, {
                officer_name: 'Field Officer Unit',
                resolution_notes: 'Debris cleared, hazard zone secured and marked safe for traffic.'
            });
            setActionMsg(`Incident #${incidentId} marked as RESOLVED & safe!`);
            await loadIncidents();
            if (onIncidentUpdated) onIncidentUpdated();
            setTimeout(() => setActionMsg(null), 4000);
        } catch (err) {
            setActionMsg(`Failed to resolve incident: ${err.message}`);
        }
    };

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
                    <button onClick={onClose} aria-label="Close dashboard" className="text-slate-400 hover:text-white p-1 rounded-lg">
                        <X size={22} />
                    </button>
                </div>

                {/* Dashboard Tabs & Action Message */}
                <div className="bg-slate-800 px-5 py-2 flex items-center justify-between border-b border-slate-700">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('districts')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                                activeTab === 'districts'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                            }`}
                        >
                            <span>🏢 Regional District Prioritisation</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('incidents')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                                activeTab === 'incidents'
                                    ? 'bg-amber-600 text-white'
                                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                            }`}
                        >
                            <span>🚨 Incident Triage &amp; Officer Dispatch ({incidents.length})</span>
                        </button>
                    </div>

                    <div className="text-[11px] text-slate-300">
                        Current Role: <strong className="text-amber-400 uppercase">{activeRole}</strong>
                    </div>
                </div>

                {actionMsg && (
                    <div className="bg-blue-900/90 text-blue-100 px-5 py-2 text-xs font-semibold flex items-center justify-between border-b border-blue-700">
                        <span>ℹ️ {actionMsg}</span>
                        <button onClick={() => setActionMsg(null)} className="text-blue-300 hover:text-white font-bold">✕</button>
                    </div>
                )}

                {activeTab === 'districts' && (
                    <>
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
                </>
                )}

                {/* Incidents Triage & Officer Management Tab */}
                {activeTab === 'incidents' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                        {incidentsLoading ? (
                            <div className="text-center py-12 text-slate-500">Loading live incident telemetry...</div>
                        ) : incidents.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">No active incidents reported across the region.</div>
                        ) : (
                            incidents.map((inc) => {
                                const isOfficer = inc.reporter_role === 'field_officer' || (inc.submitted_by && inc.submitted_by.toLowerCase().includes('officer'));
                                const isResolved = inc.status === 'resolved';

                                return (
                                    <div
                                        key={inc.id}
                                        className={`p-4 bg-white border rounded-xl shadow-sm transition-all ${
                                            isResolved ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200 hover:border-slate-400'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xl">
                                                    {isResolved ? '✅' : isOfficer ? '🛡️' : '🚨'}
                                                </span>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900 text-sm">
                                                            {inc.submitted_by || 'Anonymous Resident'}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                            isOfficer 
                                                                ? 'bg-blue-100 text-blue-700 border-blue-300' 
                                                                : 'bg-red-100 text-red-700 border-red-300'
                                                        }`}>
                                                            {isOfficer ? 'Field Officer Verified' : 'Community Hazard Report'}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                            isResolved 
                                                                ? 'bg-emerald-100 text-emerald-800' 
                                                                : inc.status === 'in_progress' 
                                                                ? 'bg-blue-100 text-blue-800' 
                                                                : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            Status: {inc.status || 'open'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        📍 Lat: {Number(inc.latitude).toFixed(4)}°, Lon: {Number(inc.longitude).toFixed(4)}° • {inc.created_at ? new Date(inc.created_at).toLocaleString() : 'Just now'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Community Headcount Metrics */}
                                            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
                                                <span title="People responded to this location">👥 {inc.people_responded || 0} Responded</span>
                                                <span className="text-slate-300">|</span>
                                                <span title="Evacuated individuals">🏕️ {inc.people_evacuated || 0} Evacuated</span>
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3">
                                            {inc.description}
                                        </p>

                                        {inc.photo_url && (
                                            <div className="mb-3">
                                                <img src={inc.photo_url} alt="Evidence" className="h-28 w-auto rounded-lg object-cover border border-slate-200" />
                                            </div>
                                        )}

                                        {/* Assigned Officer Status */}
                                        {inc.assigned_officer && (
                                            <div className="mb-3 p-2 bg-blue-50/80 border border-blue-200 rounded-lg flex items-center justify-between text-xs">
                                                <span className="text-blue-900 font-medium">
                                                    👮 Field Officer in charge: <strong>{inc.assigned_officer}</strong>
                                                </span>
                                                <span className="text-[11px] text-blue-600 bg-white px-2 py-0.5 rounded font-mono border border-blue-200">
                                                    Patrol Active
                                                </span>
                                            </div>
                                        )}

                                        {/* RBAC Action Row */}
                                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                                            
                                            {/* Admin Action: Assign Field Officer */}
                                            {(activeRole === ROLES.ADMIN || activeRole === 'admin') && !isResolved && (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={selectedOfficer[inc.id] || 'Inspector H. Lyngdoh (Patrol Alpha)'}
                                                        onChange={(e) => setSelectedOfficer({ ...selectedOfficer, [inc.id]: e.target.value })}
                                                        className="bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-medium outline-none"
                                                    >
                                                        <option value="Inspector H. Lyngdoh (Patrol Alpha)">Inspector H. Lyngdoh (Patrol Alpha)</option>
                                                        <option value="Captain K. Roy (SDRF Quick Response)">Captain K. Roy (SDRF Quick Response)</option>
                                                        <option value="Officer T. Ao (Nagaland Hill Patrol)">Officer T. Ao (Nagaland Hill Patrol)</option>
                                                        <option value="Officer L. Sangma (Garo Hills Unit)">Officer L. Sangma (Garo Hills Unit)</option>
                                                    </select>
                                                    <button
                                                        onClick={() => handleAssignOfficer(inc.id)}
                                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                                                    >
                                                        Assign Officer
                                                    </button>
                                                </div>
                                            )}

                                            {/* Field Officer Action: Mark Issue Resolved & Cleared */}
                                            {(activeRole === ROLES.FIELD_OFFICER || activeRole === ROLES.ADMIN || activeRole === 'field_officer') && !isResolved && (
                                                <button
                                                    onClick={() => handleResolveIncident(inc.id)}
                                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5 ml-auto"
                                                >
                                                    <CheckCircle size={14} />
                                                    <span>Mark Resolved &amp; Safe</span>
                                                </button>
                                            )}

                                            {/* Citizen / Volunteer Action: Respond / Help */}
                                            {!isResolved && (
                                                <button
                                                    onClick={() => handleRespondToIncident(inc.id)}
                                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition shadow-sm flex items-center gap-1.5"
                                                >
                                                    <Users size={13} />
                                                    <span>I Am Responding / Assisting</span>
                                                </button>
                                            )}

                                            {isResolved && (
                                                <span className="text-emerald-700 text-xs font-bold flex items-center gap-1">
                                                    ✓ Debris Cleared &amp; Issue Closed
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

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
