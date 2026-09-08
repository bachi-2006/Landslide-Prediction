import React, { useState } from 'react';
import {
    Home, PlusCircle, ShieldAlert, CloudLightning, Radio, Navigation,
    ChevronLeft, ChevronRight, Globe, WifiOff, AlertTriangle, DownloadCloud
} from 'lucide-react';
import { rbac, ROLES, ROLE_CONFIG } from '../services/rbac';

const Sidebar = ({ activeRole, onRoleChange, onAction, emergencyBanner, lang, onLangChange, languages, isOnline }) => {
    const [collapsed, setCollapsed] = useState(false);

    const items = [
        { id: 'home', icon: Home, label: 'Overview', show: true },
        { id: 'offline_map', icon: DownloadCloud, label: 'Offline Map & SOS Hub', show: true, highlight: true },
        { id: 'shelter', icon: Navigation, label: 'Find Shelter & Evacuate', show: true },
        { id: 'report', icon: PlusCircle, label: activeRole === ROLES.FIELD_OFFICER ? 'Field Inspection Log' : 'Report Incident', show: true },
        { id: 'emergency', icon: ShieldAlert, label: 'Emergency Priority', show: true },
        { id: 'simulator', icon: CloudLightning, label: 'Disaster Simulator', show: rbac.hasPermission(activeRole, 'canSimulate') },
        { id: 'alerts', icon: Radio, label: 'Alerts Engine', show: rbac.hasPermission(activeRole, 'canBroadcast') }
    ];

    return (
        <div className={`flex flex-col h-full bg-slate-900 text-white transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} shadow-2xl z-[1000] border-r border-slate-800 relative`}>
            <div className="flex items-center justify-between p-3.5 border-b border-slate-800">
                {!collapsed && (
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                            <Globe size={16} />
                        </div>
                        <div>
                            <h1 className="text-xs font-black tracking-wider text-white">NE-SHIELD</h1>
                            <p className="text-[9px] text-slate-400 font-semibold">GIS Command Center</p>
                        </div>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            {!collapsed && (
                <div className="p-3 border-b border-slate-800 bg-slate-950/40">
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Current Persona
                        </label>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            activeRole === ROLES.ADMIN 
                                ? 'bg-purple-900/60 text-purple-300 border-purple-500/40' 
                                : activeRole === ROLES.FIELD_OFFICER 
                                ? 'bg-blue-900/60 text-blue-300 border-blue-500/40' 
                                : 'bg-emerald-900/60 text-emerald-300 border-emerald-500/40'
                        }`}>
                            {activeRole === ROLES.ADMIN ? '🚨 Admin' : activeRole === ROLES.FIELD_OFFICER ? '🛡️ Officer' : '👤 Citizen'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => onAction('switch_role')}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-lg py-2 px-3 border border-slate-700 transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                        <span>Switch Persona / Log In</span>
                    </button>
                </div>
            )}

            <nav className="flex-1 py-3 px-2 space-y-1.5 overflow-y-auto">
                {items.filter(i => i.show).map(item => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onAction(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-xs transition-all text-left ${item.highlight ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-900/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                            title={collapsed ? item.label : undefined}
                        >
                            <Icon size={18} className="shrink-0" />
                            {!collapsed && <span>{item.label}</span>}
                        </button>
                    );
                })}
            </nav>


            {!collapsed && (
                <div className="p-3 border-t border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg p-2 border-slate-700">
                        <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                            <Globe size={14} /> Language
                        </span>
                        <select
                            value={lang}
                            onChange={(e) => onLangChange(e.target.value)}
                            className="bg-transparent text-white font-bold outline-none cursor-pointer text-xs"
                        >
                            {languages.map(l => (
                                <option key={l.code} value={l.code} className="bg-slate-900 text-white">{l.label}</option>
                            ))}
                        </select>
                    </div>
                    {!isOnline && (
                        <div className="bg-amber-500/20 text-amber-300 font-bold p-2 rounded-lg flex items-center gap-2 border border-amber-500/30 animate-pulse text-[11px]">
                            <WifiOff size={14} /> Offline Mode Active
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Sidebar;