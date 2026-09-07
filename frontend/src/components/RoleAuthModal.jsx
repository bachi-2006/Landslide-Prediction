import React, { useState } from 'react';
import { Shield, User, ShieldAlert, Lock, ArrowRight, CheckCircle2, AlertCircle, X, MapPin, Phone } from 'lucide-react';
import api from '../services/api';
import { rbac, ROLES } from '../services/rbac';

const NER_DISTRICTS = [
    'East Khasi Hills',
    'West Khasi Hills',
    'Phek',
    'Kohima',
    'Aizawl',
    'East Sikkim (Gangtok)',
    'North Sikkim (Mangan)',
    'Kamrup Metropolitan (Guwahati)',
    'Dima Hasao'
];

export default function RoleAuthModal({ isOpen, onClose, onAuthSuccess }) {
    const [selectedRole, setSelectedRole] = useState(ROLES.CITIZEN);
    
    // Form fields
    const [name, setName] = useState(() => localStorage.getItem('ne_citizen_name') || '');
    const [phone, setPhone] = useState(() => localStorage.getItem('ne_ice_phone') || '');
    const [district, setDistrict] = useState(() => localStorage.getItem('ne_user_district') || 'East Khasi Hills');
    const [unit, setUnit] = useState('1st SDRF Rapid Response Bn');
    const [password, setPassword] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);

        const cleanPass = password.trim();

        // 1. Client-side password validation
        if (selectedRole === ROLES.FIELD_OFFICER && cleanPass !== '9') {
            setErrorMsg("Invalid Field Officer Password. Hint: Default is '9'");
            setLoading(false);
            return;
        }
        if (selectedRole === ROLES.ADMIN && cleanPass !== '99') {
            setErrorMsg("Invalid Admin Password. Hint: Default is '99'");
            setLoading(false);
            return;
        }

        const fallbackToken = `neshield_${selectedRole === ROLES.ADMIN ? 'adm' : selectedRole === ROLES.FIELD_OFFICER ? 'off' : 'usr'}_${Date.now()}`;
        const fallbackProfile = {
            id: `usr-${Date.now()}`,
            name: name.trim() || (selectedRole === ROLES.CITIZEN ? 'Citizen Resident' : selectedRole === ROLES.FIELD_OFFICER ? 'Field Officer' : 'SEOC Commander'),
            role: selectedRole,
            phone: phone.trim(),
            district: district.trim(),
            unit: unit.trim()
        };

        try {
            const payload = {
                role: selectedRole,
                name: fallbackProfile.name,
                phone: phone.trim(),
                district: district.trim(),
                unit: unit.trim(),
                password: cleanPass
            };

            let authenticated = false;
            let finalToken = fallbackToken;
            let finalUser = fallbackProfile;

            try {
                const resp = await api.post('/auth/login', payload);
                if (resp.data && resp.data.success) {
                    authenticated = true;
                    if (resp.data.token) finalToken = resp.data.token;
                    if (resp.data.user) finalUser = resp.data.user;
                }
            } catch (networkErr) {
                console.warn("Backend auth call unavailable, proceeding with verified offline credentials:", networkErr);
            }

            // Save user profile & session tokens locally
            localStorage.setItem('ne_citizen_name', finalUser.name);
            if (phone) localStorage.setItem('ne_ice_phone', phone.trim());
            if (district) localStorage.setItem('ne_user_district', district.trim());
            localStorage.setItem('ne_shield_user_profile', JSON.stringify(finalUser));
            
            sessionStorage.setItem('neshield_auth_token', finalToken);
            localStorage.setItem('neshield_auth_token', finalToken);
            localStorage.setItem('ne_shield_auth_token', finalToken);

            rbac.setRole(selectedRole);
            if (onAuthSuccess) onAuthSuccess(finalUser);
            onClose();
        } catch (err) {
            console.error("Auth error:", err);
            setErrorMsg("Authentication error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                {/* Modal Header */}
                <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
                            <Shield size={22} />
                        </div>
                        <div>
                            <span className="text-[10px] font-mono tracking-wider uppercase text-blue-400 font-bold block">
                                RBAC Access Gate
                            </span>
                            <h2 className="text-lg font-bold text-white">Identify Your Persona</h2>
                        </div>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Role Tabs Selection */}
                <div className="p-6">
                    <p className="text-xs text-slate-500 font-medium mb-4">
                        Select your operational role to enter NE-SHIELD:
                    </p>

                    <div className="grid grid-cols-3 gap-2 mb-6">
                        {/* 1. Citizen */}
                        <button
                            type="button"
                            onClick={() => { setSelectedRole(ROLES.CITIZEN); setErrorMsg(''); }}
                            className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                                selectedRole === ROLES.CITIZEN
                                    ? 'bg-emerald-50/80 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-sm'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            <User size={22} className={selectedRole === ROLES.CITIZEN ? 'text-emerald-600' : 'text-slate-400'} />
                            <span className="text-xs font-bold block">Citizen</span>
                            <span className="text-[10px] text-slate-500 font-normal">Public Resident</span>
                        </button>

                        {/* 2. Field Officer */}
                        <button
                            type="button"
                            onClick={() => { setSelectedRole(ROLES.FIELD_OFFICER); setErrorMsg(''); }}
                            className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                                selectedRole === ROLES.FIELD_OFFICER
                                    ? 'bg-blue-50/80 border-blue-500 text-blue-950 ring-2 ring-blue-500/20 shadow-sm'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            <ShieldAlert size={22} className={selectedRole === ROLES.FIELD_OFFICER ? 'text-blue-600' : 'text-slate-400'} />
                            <span className="text-xs font-bold block">Field Officer</span>
                            <span className="text-[10px] text-slate-500 font-normal">SDRF / Patrol</span>
                        </button>

                        {/* 3. Admin */}
                        <button
                            type="button"
                            onClick={() => { setSelectedRole(ROLES.ADMIN); setErrorMsg(''); }}
                            className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                                selectedRole === ROLES.ADMIN
                                    ? 'bg-purple-50/80 border-purple-500 text-purple-950 ring-2 ring-purple-500/20 shadow-sm'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            <Shield size={22} className={selectedRole === ROLES.ADMIN ? 'text-purple-600' : 'text-slate-400'} />
                            <span className="text-xs font-bold block">HQ Admin</span>
                            <span className="text-[10px] text-slate-500 font-normal">NDMA / SEOC</span>
                        </button>
                    </div>

                    {/* Role Description Callout */}
                    <div className="mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                        {selectedRole === ROLES.CITIZEN && (
                            <p>
                                👤 <strong>Citizen Mode:</strong> Report hazard locations, view real-time landslide risk maps, find nearest safe evacuation havens, and view personalized NDMA precautions.
                            </p>
                        )}
                        {selectedRole === ROLES.FIELD_OFFICER && (
                            <p>
                                🛡️ <strong>Field Officer Mode:</strong> Dispatch rapid-response SDRF units, track responder headcounts on scene, triage hazards, and officially resolve & clear road blockages.
                            </p>
                        )}
                        {selectedRole === ROLES.ADMIN && (
                            <p>
                                🚨 <strong>HQ Admin Mode:</strong> Master control for State Emergency Operations Center (SEOC). Access cloudburst AI simulation, siren broadcast triggers, and district risk overrides.
                            </p>
                        )}
                    </div>

                    {/* Error Banner */}
                    {errorMsg && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 font-medium">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Auth Form */}
                    <form onSubmit={handleSubmit} className="space-y-3.5">
                        {/* Name Input */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                {selectedRole === ROLES.CITIZEN ? 'Full Name' : selectedRole === ROLES.FIELD_OFFICER ? 'Officer Name / Callsign' : 'HQ Admin Identifier'}
                            </label>
                            <input
                                type="text"
                                required
                                placeholder={selectedRole === ROLES.CITIZEN ? 'e.g. Rohith' : selectedRole === ROLES.FIELD_OFFICER ? 'e.g. Insp. K. Sangma' : 'e.g. SEOC State Commander'}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                            />
                        </div>

                        {/* Citizen: Phone (ICE) & District */}
                        {selectedRole === ROLES.CITIZEN && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Phone / ICE Contact
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="+91 98765 43210"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Your District
                                    </label>
                                    <select
                                        value={district}
                                        onChange={(e) => setDistrict(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                                    >
                                        {NER_DISTRICTS.map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Field Officer: Unit & Password */}
                        {selectedRole === ROLES.FIELD_OFFICER && (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Assigned Unit / Battalion
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 1st SDRF Rapid Response Bn"
                                        value={unit}
                                        onChange={(e) => setUnit(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                            <Lock size={12} /> Officer Security Password
                                        </label>
                                        <span className="text-[10px] text-blue-600 font-mono font-bold bg-blue-50 px-1.5 py-0.5 rounded">
                                            Password is: 9
                                        </span>
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        placeholder="Enter officer password (9)"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                                    />
                                </div>
                            </>
                        )}

                        {/* Admin: Password */}
                        {selectedRole === ROLES.ADMIN && (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                        <Lock size={12} /> Master Admin Password
                                    </label>
                                    <span className="text-[10px] text-purple-600 font-mono font-bold bg-purple-50 px-1.5 py-0.5 rounded">
                                        Password is: 99
                                    </span>
                                </div>
                                <input
                                    type="password"
                                    required
                                    placeholder="Enter admin password (99)"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition"
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full font-bold py-3 px-4 rounded-xl text-xs text-white transition-all shadow-md flex items-center justify-center gap-2 mt-4 ${
                                selectedRole === ROLES.CITIZEN
                                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                                    : selectedRole === ROLES.FIELD_OFFICER
                                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                                    : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                            }`}
                        >
                            <span>
                                {loading 
                                    ? 'Verifying...' 
                                    : selectedRole === ROLES.CITIZEN 
                                    ? 'Enter & Register in Disaster Network' 
                                    : `Authenticate as ${selectedRole === ROLES.FIELD_OFFICER ? 'Field Officer' : 'HQ Admin'}`
                                }
                            </span>
                            <ArrowRight size={15} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
