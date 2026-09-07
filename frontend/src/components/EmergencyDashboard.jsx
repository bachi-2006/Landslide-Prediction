import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, PhoneCall, AlertTriangle, ChevronRight, X, Radio, Users, CheckCircle, Clock, ShieldCheck, UserCheck, Trash2, Plus, Search } from 'lucide-react';
import { getTranslation } from '../services/i18n';
import { alertService, incidentService } from '../services/api';
import { ROLES, rbac } from '../services/rbac';

// Predefined officer roster for admin assignment search
const OFFICER_ROSTER = [
    { name: 'Inspector H. Lyngdoh', unit: 'SDRF Patrol Alpha' },
    { name: 'Captain K. Roy', unit: 'SDRF Quick Response' },
    { name: 'Officer T. Ao', unit: 'Nagaland Hill Patrol' },
    { name: 'Officer L. Sangma', unit: 'Garo Hills Unit' },
    { name: 'SI P. Dhar', unit: 'Meghalaya SDRF Bn-2' },
    { name: 'Inspector R. Nongkynmaw', unit: 'East Khasi Hills Patrol' },
    { name: 'Captain B. Thinley', unit: 'Sikkim Mountain Response' },
    { name: 'ASI D. Marak', unit: 'West Garo Hills Unit' },
];

const EmergencyDashboard = ({ risks, geoJsonData, onSelectDistrict, onClose, lang, activeRole = 'citizen', onIncidentUpdated }) => {
    const t = (key) => getTranslation(lang, key);
    const [activeTab, setActiveTab] = useState('districts'); // 'districts' | 'incidents'
    const [selectedLevel, setSelectedLevel] = useState('All');
    const [broadcasting, setBroadcasting] = useState(false);
    const [broadcastStatus, setBroadcastStatus] = useState(null);
    const [incidents, setIncidents] = useState([]);
    const [incidentsLoading, setIncidentsLoading] = useState(false);
    const [actionMsg, setActionMsg] = useState(null);
    const [actionMsgType, setActionMsgType] = useState('info'); // 'info' | 'error' | 'success'

    // Officer search state per incident
    const [officerSearch, setOfficerSearch] = useState({}); // { [incidentId]: searchText }
    const [officerUnit, setOfficerUnit] = useState({}); // { [incidentId]: unit }
    const [showOfficerDropdown, setShowOfficerDropdown] = useState({}); // { [incidentId]: bool }

    // Resolve form state per incident
    const [resolveNotes, setResolveNotes] = useState({}); // { [incidentId]: notes }
    const [showResolveForm, setShowResolveForm] = useState({}); // { [incidentId]: bool }

    // Admin create incident state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createForm, setCreateForm] = useState({
        description: '', latitude: '25.5788', longitude: '91.8933',
        severity: 'High', assigned_officer: '', officer_unit: ''
    });

    // Assign only my incidents filter (for field officers)
    const [filterMyOnly, setFilterMyOnly] = useState(false);

    // ESP32 Hardware Beacon & Captive Portal SOS state
    const [beaconLogs, setBeaconLogs] = useState([]);
    const [beaconStatus, setBeaconStatus] = useState({ is_active: false, web_access: true, database_connected: true });
    const [beaconLoading, setBeaconLoading] = useState(false);

    const myOfficerName = typeof window !== 'undefined' ? localStorage.getItem('ne_citizen_name') || '' : '';

    const canAssign = rbac.hasPermission(activeRole, 'canAssignOfficer');
    const canResolve = rbac.hasPermission(activeRole, 'canResolveIncident');
    const canDelete = rbac.hasPermission(activeRole, 'canDeleteIncident');
    const canCreate = rbac.hasPermission(activeRole, 'canCreateAdminIncident');
    const viewAssignedOnly = rbac.hasPermission(activeRole, 'canViewAssignedOnly');

    const showMsg = (msg, type = 'info') => {
        setActionMsg(msg);
        setActionMsgType(type);
        setTimeout(() => setActionMsg(null), 4500);
    };

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

    const loadBeaconData = async () => {
        setBeaconLoading(true);
        try {
            const [statRes, logRes] = await Promise.all([
                alertService.getHardwareStatus().catch(() => ({ data: { is_active: false } })),
                alertService.getBeaconLogs().catch(() => ({ data: { data: [] } }))
            ]);
            setBeaconStatus(statRes.data || { is_active: false });
            const logs = logRes.data?.data || logRes.data || [];
            setBeaconLogs(Array.isArray(logs) ? logs : []);
        } catch (err) {
            console.warn('Beacon data load err', err);
        } finally {
            setBeaconLoading(false);
        }
    };

    const handleToggleSiren = async (activate) => {
        try {
            await alertService.triggerHardware({
                active: activate,
                message: activate ? 'MANDATORY EVACUATION SIREN: Landslide hazard detected in sector.' : 'Siren Silenced by Admin Command',
                level: 'Critical'
            });
            showMsg(activate ? '🚨 Mandatory Siren ACTIVATED across all ESP32 beacons!' : '🔕 Siren SILENCED.', activate ? 'error' : 'success');
            await loadBeaconData();
        } catch (err) {
            showMsg('Failed to toggle siren: ' + err.message, 'error');
        }
    };

    const handleTrigger15sIncidentTest = async () => {
        try {
            await incidentService.adminCreateIncident({
                description: 'CRITICAL ALERT: Tension cracks expanding along NH-40 cutting slope',
                latitude: 25.5788,
                longitude: 91.8933,
                severity: 'Critical',
                assigned_officer: 'Inspector H. Lyngdoh',
                officer_unit: 'SDRF Patrol Alpha',
                dispatched_personnel: 6
            });
            showMsg('🚨 Alert broadcast! ESP32 I2C OLED will display alert & LED will blink for 15s.', 'success');
            await loadIncidents();
            await loadBeaconData();
            if (onIncidentUpdated) onIncidentUpdated();
        } catch (err) {
            showMsg('Failed: ' + err.message, 'error');
        }
    };

    useEffect(() => {
        loadIncidents();
        loadBeaconData();
    }, []);

    // Filtered incidents based on role
    const filteredIncidents = (() => {
        if (filterMyOnly && viewAssignedOnly && myOfficerName) {
            return incidents.filter(inc =>
                inc.assigned_officer && inc.assigned_officer.toLowerCase().includes(myOfficerName.toLowerCase())
            );
        }
        return incidents;
    })();

    const handleAssignOfficer = async (incidentId) => {
        const officerName = officerSearch[incidentId] || '';
        const unit = officerUnit[incidentId] || 'SDRF';
        if (!officerName.trim()) {
            showMsg('Please select or type an officer name.', 'error');
            return;
        }
        try {
            await incidentService.assignIncident(incidentId, {
                officer_name: officerName.trim(),
                officer_unit: unit.trim(),
                dispatched_personnel: 4
            });
            showMsg(`Officer "${officerName}" assigned to incident #${incidentId.slice(-6)}`, 'success');
            setShowOfficerDropdown({ ...showOfficerDropdown, [incidentId]: false });
            await loadIncidents();
            if (onIncidentUpdated) onIncidentUpdated();
        } catch (err) {
            showMsg(`Assignment failed: ${err.response?.data?.detail || err.message}`, 'error');
        }
    };

    const handleResolveFinal = async (incidentId) => {
        const notes = resolveNotes[incidentId] || 'Debris cleared, hazard zone secured and marked safe.';
        try {
            await incidentService.resolveIncident(incidentId, {
                officer_name: myOfficerName || 'Field Officer',
                resolution_summary: notes,
                road_cleared: true
            });
            showMsg(`Incident #${incidentId.slice(-6)} marked as RESOLVED & cleared!`, 'success');
            setShowResolveForm({ ...showResolveForm, [incidentId]: false });
            await loadIncidents();
            if (onIncidentUpdated) onIncidentUpdated();
        } catch (err) {
            showMsg(`Resolve failed: ${err.message}`, 'error');
        }
    };

    const handleDeleteIncident = async (incidentId) => {
        if (!window.confirm('Permanently delete this incident? This cannot be undone.')) return;
        try {
            await incidentService.deleteIncident(incidentId);
            showMsg(`Incident #${incidentId.slice(-6)} deleted.`, 'success');
            await loadIncidents();
            if (onIncidentUpdated) onIncidentUpdated();
        } catch (err) {
            showMsg(`Delete failed: ${err.response?.data?.detail || err.message}`, 'error');
        }
    };

    const handleRespondToIncident = async (incidentId) => {
        try {
            await incidentService.respondIncident(incidentId, {
                responder_name: myOfficerName || 'Volunteer Responder',
                headcount: 1
            });
            showMsg(`Response to incident #${incidentId.slice(-6)} recorded!`, 'success');
            await loadIncidents();
            if (onIncidentUpdated) onIncidentUpdated();
        } catch (err) {
            showMsg(`Failed to record response: ${err.message}`, 'error');
        }
    };

    const handleAdminCreate = async (e) => {
        e.preventDefault();
        if (!createForm.description.trim()) return;
        try {
            await incidentService.adminCreateIncident({
                description: createForm.description,
                latitude: parseFloat(createForm.latitude) || 25.5788,
                longitude: parseFloat(createForm.longitude) || 91.8933,
                severity: createForm.severity,
                assigned_officer: createForm.assigned_officer || null,
                officer_unit: createForm.officer_unit || null,
                dispatched_personnel: 4,
            });
            showMsg('Incident created by HQ Admin and added to DB.', 'success');
            setShowCreateForm(false);
            setCreateForm({ description: '', latitude: '25.5788', longitude: '91.8933', severity: 'High', assigned_officer: '', officer_unit: '' });
            await loadIncidents();
            if (onIncidentUpdated) onIncidentUpdated();
        } catch (err) {
            showMsg(`Create failed: ${err.response?.data?.detail || err.message}`, 'error');
        }
    };

    // Merge risk scores with district names
    const districtList = (geoJsonData?.features || []).map(f => {
        const id = f.properties.id;
        const name = f.properties.name || f.properties.district_name || 'District';
        const riskEntry = risks.find(r => r.district_id === id);
        return {
            id, name, state: f.properties.state || 'NER',
            risk_level: riskEntry?.risk_level || 'Low',
            risk_score: riskEntry?.risk_score || 0.1,
            feature: f
        };
    });

    const priorityOrder = { 'Critical': 1, 'High': 2, 'Moderate': 3, 'Low': 4 };
    districtList.sort((a, b) => (priorityOrder[a.risk_level] || 99) - (priorityOrder[b.risk_level] || 99) || b.risk_score - a.risk_score);

    const filtered = selectedLevel === 'All' ? districtList : districtList.filter(d => d.risk_level === selectedLevel);
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
                district_id: districtId, level,
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

    // Officer search dropdown helpers
    const filteredOfficers = (search) =>
        OFFICER_ROSTER.filter(o => o.name.toLowerCase().includes((search || '').toLowerCase()));

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1100] p-4">
            <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-600 rounded-lg"><ShieldAlert size={24} /></div>
                        <div>
                            <h2 className="text-xl font-bold">{t('emergency_dashboard')}</h2>
                            <p className="text-xs text-slate-400">Regional Disaster Management & Rapid Response Prioritisation</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close dashboard" className="text-slate-400 hover:text-white p-1 rounded-lg">
                        <X size={22} />
                    </button>
                </div>

                {/* Tabs & Role */}
                <div className="bg-slate-800 px-5 py-2 flex items-center justify-between border-b border-slate-700">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('districts')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeTab === 'districts' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                        >🏢 Regional District Prioritisation</button>
                        <button
                            onClick={() => { setActiveTab('incidents'); loadIncidents(); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeTab === 'incidents' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                        >🚨 Incident Triage & Officer Dispatch ({incidents.length})</button>
                        <button
                            onClick={() => { setActiveTab('beacons'); loadBeaconData(); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeTab === 'beacons' ? 'bg-purple-700 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                        >📡 ESP32 Beacons & Citizen SOS ({beaconLogs.length})</button>
                    </div>
                    <div className="text-[11px] text-slate-300">
                        Role: <strong className="text-amber-400 uppercase">{activeRole}</strong>
                        {myOfficerName && <span className="ml-2 text-slate-400">· {myOfficerName}</span>}
                    </div>
                </div>

                {/* Action message bar */}
                {actionMsg && (
                    <div className={`px-5 py-2 text-xs font-semibold flex items-center justify-between border-b ${actionMsgType === 'error' ? 'bg-red-900/80 text-red-100 border-red-700' : actionMsgType === 'success' ? 'bg-emerald-900/80 text-emerald-100 border-emerald-700' : 'bg-blue-900/90 text-blue-100 border-blue-700'}`}>
                        <span>{actionMsgType === 'success' ? '✅' : actionMsgType === 'error' ? '❌' : 'ℹ️'} {actionMsg}</span>
                        <button onClick={() => setActionMsg(null)} className="font-bold ml-2">✕</button>
                    </div>
                )}

                {/* ─── DISTRICTS TAB ─── */}
                {activeTab === 'districts' && (
                    <>
                        <div className="grid grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200">
                            {['Critical', 'High', 'Moderate', 'Low'].map((lvl) => {
                                const colors = { Critical: 'red', High: 'orange', Moderate: 'yellow', Low: 'green' };
                                const cls = { Critical: 'border-red-600 bg-red-50', High: 'border-orange-500 bg-orange-50', Moderate: 'border-yellow-500 bg-yellow-50', Low: 'border-green-500 bg-green-50' };
                                const tcls = { Critical: 'text-red-600', High: 'text-orange-600', Moderate: 'text-yellow-600', Low: 'text-green-600' };
                                return (
                                    <button key={lvl} onClick={() => setSelectedLevel(selectedLevel === lvl ? 'All' : lvl)}
                                        className={`p-3 rounded-xl border text-left transition-all ${selectedLevel === lvl ? cls[lvl] : 'bg-white border-slate-200'}`}>
                                        <span className={`text-xs font-bold uppercase ${tcls[lvl]}`}>{lvl}</span>
                                        <div className="text-2xl font-black text-slate-900 mt-0.5">{counts[lvl]}</div>
                                    </button>
                                );
                            })}
                        </div>
                        {broadcastStatus && (
                            <div className="bg-emerald-50 text-emerald-800 px-5 py-2 text-xs font-semibold flex items-center justify-between border-b border-emerald-100">
                                <span>{broadcastStatus}</span>
                                <button onClick={() => setBroadcastStatus(null)} className="text-emerald-600 font-bold">✕</button>
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {filtered.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">{t('no_districts')}</div>
                            ) : filtered.map(d => {
                                const badgeColor = {
                                    'Critical': 'bg-red-100 text-red-700 border-red-200',
                                    'High': 'bg-orange-100 text-orange-700 border-orange-200',
                                    'Moderate': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                                    'Low': 'bg-green-100 text-green-700 border-green-200'
                                }[d.risk_level] || 'bg-slate-100';
                                return (
                                    <div key={d.id} className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-400 transition-all shadow-sm">
                                        <div onClick={() => { onSelectDistrict(d.feature); onClose(); }} className="flex items-center gap-3 cursor-pointer flex-1">
                                            <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${badgeColor}`}>{d.risk_level}</span>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm hover:text-blue-600">{d.name}</h4>
                                                <p className="text-xs text-slate-500">Risk Score: {Math.round(d.risk_score * 100)}%</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(d.risk_level === 'Critical' || d.risk_level === 'High') && rbac.hasPermission(activeRole, 'canBroadcast') && (
                                                <button onClick={() => handleBroadcast(d.id, d.name, d.risk_level)} disabled={broadcasting}
                                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50">
                                                    <Radio size={14} className={broadcasting ? 'animate-pulse' : ''} />
                                                    <span>Issue Multi-Channel Alert</span>
                                                </button>
                                            )}
                                            <button onClick={() => { onSelectDistrict(d.feature); onClose(); }} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg">
                                                <ChevronRight size={18} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {/* ─── INCIDENTS TAB ─── */}
                {activeTab === 'incidents' && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* Incident tab toolbar */}
                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-3 flex-wrap">
                            {/* Admin: create incident */}
                            {canCreate && (
                                <button onClick={() => setShowCreateForm(!showCreateForm)}
                                    className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition shadow-sm">
                                    <Plus size={14} />
                                    Create Incident (HQ)
                                </button>
                            )}
                            {/* Field Officer: my assigned filter */}
                            {viewAssignedOnly && (
                                <button onClick={() => setFilterMyOnly(!filterMyOnly)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${filterMyOnly ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'}`}>
                                    {filterMyOnly ? '✓ My Assigned Only' : '📋 My Assigned Only'}
                                </button>
                            )}
                            <span className="text-xs text-slate-500 ml-auto">
                                {filteredIncidents.length} incident{filteredIncidents.length !== 1 ? 's' : ''} shown
                            </span>
                        </div>

                        {/* Admin: create incident form */}
                        {showCreateForm && canCreate && (
                            <form onSubmit={handleAdminCreate} className="px-4 py-3 bg-purple-50 border-b border-purple-200 space-y-2">
                                <p className="text-xs font-bold text-purple-900 uppercase">HQ Admin — Create Verified Incident</p>
                                <textarea
                                    required rows={2} placeholder="Incident description (e.g. Tension cracks on NH-40 cutting slope, width 12cm)"
                                    value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                                    className="w-full text-xs border border-purple-300 rounded-lg px-3 py-2 outline-none resize-none"
                                />
                                <div className="flex gap-2 flex-wrap">
                                    <input type="number" step="any" placeholder="Latitude" value={createForm.latitude}
                                        onChange={e => setCreateForm({ ...createForm, latitude: e.target.value })}
                                        className="flex-1 text-xs border border-purple-300 rounded-lg px-2 py-1.5 min-w-[120px]" />
                                    <input type="number" step="any" placeholder="Longitude" value={createForm.longitude}
                                        onChange={e => setCreateForm({ ...createForm, longitude: e.target.value })}
                                        className="flex-1 text-xs border border-purple-300 rounded-lg px-2 py-1.5 min-w-[120px]" />
                                    <select value={createForm.severity} onChange={e => setCreateForm({ ...createForm, severity: e.target.value })}
                                        className="text-xs border border-purple-300 rounded-lg px-2 py-1.5">
                                        <option>Critical</option><option>High</option><option>Moderate</option><option>Low</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="Assign officer (name)" value={createForm.assigned_officer}
                                        onChange={e => setCreateForm({ ...createForm, assigned_officer: e.target.value })}
                                        className="flex-1 text-xs border border-purple-300 rounded-lg px-2 py-1.5" />
                                    <input type="text" placeholder="Unit / Battalion" value={createForm.officer_unit}
                                        onChange={e => setCreateForm({ ...createForm, officer_unit: e.target.value })}
                                        className="flex-1 text-xs border border-purple-300 rounded-lg px-2 py-1.5" />
                                </div>
                                <div className="flex gap-2">
                                    <button type="submit" className="px-4 py-1.5 bg-purple-700 text-white text-xs font-bold rounded-lg hover:bg-purple-800 transition">Create & Dispatch</button>
                                    <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition">Cancel</button>
                                </div>
                            </form>
                        )}

                        {/* Incident list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                            {incidentsLoading ? (
                                <div className="text-center py-12 text-slate-500">Loading live incident telemetry...</div>
                            ) : filteredIncidents.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    {filterMyOnly ? 'No incidents assigned to you.' : 'No active incidents reported across the region.'}
                                </div>
                            ) : filteredIncidents.map((inc) => {
                                const isOfficer = inc.reporter_role === 'field_officer' || (inc.submitted_by && inc.submitted_by.toLowerCase().includes('officer')) || (inc.submitted_by && inc.submitted_by.toLowerCase().includes('hq admin'));
                                const isResolved = inc.status === 'resolved' || inc.status === 'closed';
                                const officers = filteredOfficers(officerSearch[inc.id] || '');

                                return (
                                    <div key={inc.id} className={`p-4 bg-white border rounded-xl shadow-sm transition-all ${isResolved ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200 hover:border-slate-300'}`}>
                                        {/* Incident header */}
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xl">{isResolved ? '✅' : isOfficer ? '🛡️' : '🚨'}</span>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-slate-900 text-sm">{inc.submitted_by || 'Anonymous Resident'}</span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isOfficer ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-red-100 text-red-700 border-red-300'}`}>
                                                            {isOfficer ? 'Verified' : 'Community Report'}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isResolved ? 'bg-emerald-100 text-emerald-800' : inc.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                                                            {inc.status || 'open'}
                                                        </span>
                                                        {inc.severity && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inc.severity === 'Critical' ? 'bg-red-200 text-red-900' : inc.severity === 'High' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>{inc.severity}</span>}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        📍 {Number(inc.latitude).toFixed(4)}°N, {Number(inc.longitude).toFixed(4)}°E · {inc.created_at ? new Date(inc.created_at).toLocaleString() : 'Just now'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 shrink-0">
                                                <span>👥 {inc.people_responded || 0}</span>
                                                <span className="text-slate-300">|</span>
                                                <span>🏕️ {inc.people_evacuated || 0}</span>
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3">{inc.description}</p>

                                        {inc.photo_url && (
                                            <div className="mb-3">
                                                <img src={inc.photo_url} alt="Evidence" className="h-28 w-auto rounded-lg object-cover border border-slate-200" />
                                            </div>
                                        )}

                                        {/* Assigned officer status */}
                                        {inc.assigned_officer && (
                                            <div className="mb-3 p-2 bg-blue-50/80 border border-blue-200 rounded-lg flex items-center justify-between text-xs">
                                                <span className="text-blue-900 font-medium">👮 Officer: <strong>{inc.assigned_officer}</strong></span>
                                                <span className="text-[11px] text-blue-600 bg-white px-2 py-0.5 rounded font-mono border border-blue-200">Patrol Active</span>
                                            </div>
                                        )}

                                        {/* ── RBAC Action Row ── */}
                                        <div className="pt-2 border-t border-slate-100 space-y-2">
                                            {/* ADMIN: Searchable officer assignment */}
                                            {canAssign && !isResolved && (
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Assign Field Officer</p>
                                                    <div className="relative">
                                                        <div className="flex gap-2">
                                                            <div className="relative flex-1">
                                                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Search officer name..."
                                                                    value={officerSearch[inc.id] || ''}
                                                                    onChange={(e) => {
                                                                        setOfficerSearch({ ...officerSearch, [inc.id]: e.target.value });
                                                                        setShowOfficerDropdown({ ...showOfficerDropdown, [inc.id]: true });
                                                                        // Auto-fill unit if officer matched
                                                                        const matched = OFFICER_ROSTER.find(o => o.name.toLowerCase() === e.target.value.toLowerCase());
                                                                        if (matched) setOfficerUnit({ ...officerUnit, [inc.id]: matched.unit });
                                                                    }}
                                                                    onFocus={() => setShowOfficerDropdown({ ...showOfficerDropdown, [inc.id]: true })}
                                                                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                                                />
                                                                {showOfficerDropdown[inc.id] && (officerSearch[inc.id] || '').length > 0 && officers.length > 0 && (
                                                                    <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg mt-0.5 max-h-36 overflow-y-auto">
                                                                        {officers.map(o => (
                                                                            <button key={o.name} type="button"
                                                                                onClick={() => {
                                                                                    setOfficerSearch({ ...officerSearch, [inc.id]: o.name });
                                                                                    setOfficerUnit({ ...officerUnit, [inc.id]: o.unit });
                                                                                    setShowOfficerDropdown({ ...showOfficerDropdown, [inc.id]: false });
                                                                                }}
                                                                                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-100 last:border-0">
                                                                                <span className="font-semibold text-slate-800">{o.name}</span>
                                                                                <span className="text-slate-500 ml-2">({o.unit})</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <input type="text" placeholder="Unit"
                                                                value={officerUnit[inc.id] || ''}
                                                                onChange={(e) => setOfficerUnit({ ...officerUnit, [inc.id]: e.target.value })}
                                                                className="w-32 px-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none" />
                                                            <button onClick={() => handleAssignOfficer(inc.id)}
                                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-sm whitespace-nowrap">
                                                                Assign
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* OFFICER / ADMIN: Resolve form */}
                                            {canResolve && !isResolved && (
                                                <div>
                                                    {!showResolveForm[inc.id] ? (
                                                        <button onClick={() => setShowResolveForm({ ...showResolveForm, [inc.id]: true })}
                                                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5">
                                                            <CheckCircle size={14} />
                                                            <span>Mark Resolved & Safe</span>
                                                        </button>
                                                    ) : (
                                                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 space-y-2">
                                                            <p className="text-[10px] font-bold text-emerald-800 uppercase">Resolution Notes (by {myOfficerName || 'Officer'})</p>
                                                            <textarea rows={2}
                                                                value={resolveNotes[inc.id] !== undefined ? resolveNotes[inc.id] : 'Debris cleared, hazard zone secured and marked safe.'}
                                                                onChange={e => setResolveNotes({ ...resolveNotes, [inc.id]: e.target.value })}
                                                                className="w-full text-xs border border-emerald-300 rounded-lg px-2 py-1.5 outline-none resize-none"
                                                            />
                                                            <div className="flex gap-2">
                                                                <button onClick={() => handleResolveFinal(inc.id)}
                                                                    className="px-3 py-1 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition">Confirm Resolve</button>
                                                                <button onClick={() => setShowResolveForm({ ...showResolveForm, [inc.id]: false })}
                                                                    className="px-3 py-1 bg-white border border-slate-300 text-slate-700 text-xs rounded-lg hover:bg-slate-50 transition">Cancel</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ALL: Respond */}
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                {!isResolved && (
                                                    <button onClick={() => handleRespondToIncident(inc.id)}
                                                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition shadow-sm flex items-center gap-1.5">
                                                        <Users size={13} />
                                                        <span>I Am Responding / Assisting</span>
                                                    </button>
                                                )}

                                                {isResolved && (
                                                    <span className="text-emerald-700 text-xs font-bold flex items-center gap-1">✓ Cleared & Issue Closed</span>
                                                )}

                                                {/* ADMIN: Delete */}
                                                {canDelete && (
                                                    <button onClick={() => handleDeleteIncident(inc.id)}
                                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition ml-auto" title="Delete incident (Admin only)">
                                                        <Trash2 size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ─── ESP32 BEACONS & CITIZEN SOS TAB ─── */}
                {activeTab === 'beacons' && (
                    <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                        {/* Section 1: Mandatory Acoustic Siren Warning Control */}
                        <div className={`p-4 rounded-2xl border transition-all shadow-sm ${beaconStatus.is_active ? 'bg-red-500/10 border-red-500' : 'bg-white border-slate-200'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-xl text-white ${beaconStatus.is_active ? 'bg-red-600 animate-pulse' : 'bg-slate-800'}`}>
                                        <Radio size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-extrabold text-slate-900 text-sm">Mandatory Acoustic Siren Alert System</h3>
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${beaconStatus.is_active ? 'bg-red-600 text-white animate-ping' : 'bg-slate-200 text-slate-700'}`}>
                                                {beaconStatus.is_active ? 'SIREN SOUNDING (ACTIVE)' : 'STANDBY'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 mt-0.5">
                                            {beaconStatus.is_active
                                                ? `🚨 High-decibel alarm broadcast active: "${beaconStatus.message || 'Evacuate Uphill Corridor'}"`
                                                : 'Siren warning is mandatory for urgent landslide threats. Triggers hardware buzzer and phone sirens.'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {beaconStatus.is_active ? (
                                        <button
                                            onClick={() => handleToggleSiren(false)}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm"
                                        >
                                            🔕 Silence Siren
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleToggleSiren(true)}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm"
                                        >
                                            🚨 Trigger Mandatory Siren Alert
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Hardware Beacon Telemetry & Diagnostic LEDs */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div>
                                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                        <span>📡 Node: <strong>ESP32-OFFGRID-01</strong></span>
                                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Deployed Sector: NH-40 Shillong</span>
                                    </h4>
                                    <p className="text-xs text-slate-500">Autonomous Dual-Mode Wi-Fi Node with I2C Display & Captive DNS Intercept</p>
                                </div>
                                <button
                                    onClick={handleTrigger15sIncidentTest}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
                                    title="Dispatches test incident to trigger 15-second LED blink & I2C display message"
                                >
                                    ⚡ Test 15s Incident Alert on ESP32
                                </button>
                            </div>

                            {/* LED Indicators Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* LED 1: Database Connection */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] shrink-0"></div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase block">LED 1 (GPIO 18)</span>
                                        <strong className="text-xs text-slate-800">DB Connection: {beaconStatus.database_connected !== false ? 'ONLINE' : 'OFFLINE'}</strong>
                                        <p className="text-[10px] text-slate-500">Solid green when synced to Supabase</p>
                                    </div>
                                </div>

                                {/* LED 2: Web Access / Wi-Fi */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] shrink-0"></div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase block">LED 2 (GPIO 19)</span>
                                        <strong className="text-xs text-slate-800">Web Access: ONLINE</strong>
                                        <p className="text-[10px] text-slate-500">Station Wi-Fi: MSI 6704</p>
                                    </div>
                                </div>

                                {/* LED 3: Incident Alert Blinker */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] shrink-0"></div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase block">LED 3 (GPIO 5) & I2C</span>
                                        <strong className="text-xs text-slate-800">15s Incident Blinker</strong>
                                        <p className="text-[10px] text-slate-500">SSD1306 OLED Screen Ready</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Citizen Registrations from ESP32 Captive Portal Wi-Fi */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                        <span>👥 Citizen Registrations from Beacon Wi-Fi</span>
                                        <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">SSID: NE-SHIELD-EMERGENCY</span>
                                    </h4>
                                    <p className="text-xs text-slate-500">Victims who connected to the ESP32 emergency Wi-Fi network and entered their details</p>
                                </div>
                                <button
                                    onClick={loadBeaconData}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                                >
                                    🔄 Refresh ({beaconLogs.length})
                                </button>
                            </div>

                            {beaconLogs.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    No victim registrations logged yet. When stranded citizens connect to the <strong>NE-SHIELD-EMERGENCY</strong> Wi-Fi beacon, their distress details will populate here automatically.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200">
                                            <tr>
                                                <th className="py-2.5 px-3">Citizen Name</th>
                                                <th className="py-2.5 px-3">Contact</th>
                                                <th className="py-2.5 px-3">People</th>
                                                <th className="py-2.5 px-3">Medical Need</th>
                                                <th className="py-2.5 px-3">Distress Notes</th>
                                                <th className="py-2.5 px-3">Registered At</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {beaconLogs.map((log, idx) => (
                                                <tr key={log.id || idx} className="hover:bg-slate-50/80 transition">
                                                    <td className="py-2.5 px-3 font-bold text-slate-900">{log.citizen_name}</td>
                                                    <td className="py-2.5 px-3 text-slate-600">{log.phone || 'N/A'}</td>
                                                    <td className="py-2.5 px-3 text-slate-700">👥 {log.people_count || 1}</td>
                                                    <td className="py-2.5 px-3">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${log.medical_needs && log.medical_needs !== 'None' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                                            {log.medical_needs || 'None'}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate">{log.notes || 'No notes provided'}</td>
                                                    <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                                                        {log.created_at ? new Date(log.created_at).toLocaleTimeString() : 'Just now'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
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
