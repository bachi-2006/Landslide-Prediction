import React, { useState, useEffect } from 'react';
import RiskMap from './components/RiskMap';
import DistrictPanel from './components/DistrictPanel';
import IncidentForm from './components/IncidentForm';
import EmergencyDashboard from './components/EmergencyDashboard';
import LandingPage from './components/LandingPage';
import DisasterSimulator from './components/DisasterSimulator';
import AlertsEngine from './components/AlertsEngine';
import { AlertTriangle, PlusCircle, ShieldAlert, Globe, WifiOff, CheckCircle2, Home, CloudLightning, Radio } from 'lucide-react';
import { requestNotificationPermission, onNotificationReceived } from './services/firebase';
import { languages, getTranslation } from './services/i18n';
import { initOfflineSync } from './services/offlineSync';

const App = () => {
    const [currentView, setCurrentView] = useState('landing'); // 'landing' | 'command_center'
    const [selectedDistrict, setSelectedDistrict] = useState(null);
    const [showIncidentForm, setShowIncidentForm] = useState(false);
    const [showEmergencyDashboard, setShowEmergencyDashboard] = useState(false);
    const [showSimulator, setShowSimulator] = useState(false);
    const [showAlertsEngine, setShowAlertsEngine] = useState(false);

    const [route, setRoute] = useState(null);
    const [riskRefreshKey, setRiskRefreshKey] = useState(0);
    const [mapData, setMapData] = useState({ geoJsonData: null, risks: [] });

    const [lang, setLang] = useState(() => localStorage.getItem('ne_shield_lang') || 'en');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [syncToast, setSyncToast] = useState(null);

    const t = (key) => getTranslation(lang, key);

    useEffect(() => {
        // Initialize Firebase notifications on load
        requestNotificationPermission().then(token => {
            if (token) console.log("FCM Token registered:", token);
        });

        // Listen for foreground push notifications
        onNotificationReceived((payload) => {
            const title = payload?.notification?.title || 'Emergency Landslide Alert';
            const body = payload?.notification?.body || 'Hazard status updated.';
            setSyncToast(`🚨 ${title}: ${body}`);
            setRiskRefreshKey(k => k + 1);
            setTimeout(() => setSyncToast(null), 6000);
        });

        // Network status listeners
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Auto-sync offline incidents when internet is back
        const cleanupSync = initOfflineSync((syncedCount) => {
            setSyncToast(`${syncedCount} cached report(s) auto-synced!`);
            setRiskRefreshKey(k => k + 1);
            setTimeout(() => setSyncToast(null), 4000);
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            cleanupSync();
        };
    }, []);

    const handleLanguageChange = (code) => {
        setLang(code);
        localStorage.setItem('ne_shield_lang', code);
    };

    const handleSimulationComplete = (simulatedDistrict) => {
        // Update risk list in state
        setMapData(prev => {
            const updated = prev.risks.filter(r => r.district_id !== simulatedDistrict.district_id);
            return {
                ...prev,
                risks: [...updated, simulatedDistrict]
            };
        });

        // Highlight simulated district feature
        const feat = mapData.geoJsonData?.features.find(f => f.properties.id === simulatedDistrict.district_id);
        if (feat) {
            setSelectedDistrict(feat);
        }

        setSyncToast(`Simulation applied to ${simulatedDistrict.district_name}: Risk ${simulatedDistrict.risk_level}`);
        setRiskRefreshKey(k => k + 1);
        setTimeout(() => setSyncToast(null), 4000);
    };

    if (currentView === 'landing') {
        return (
            <LandingPage 
                onLaunchDashboard={() => setCurrentView('command_center')}
                lang={lang}
            />
        );
    }

    return (
        <div className="flex h-screen w-full overflow-hidden bg-slate-100 relative">
            {/* Top Navigation Bar */}
            <div className="fixed top-4 left-4 z-[1000] flex flex-wrap gap-2 items-center">
                {/* Switch to Landing Page Button */}
                <button
                    onClick={() => setCurrentView('landing')}
                    className="bg-white/95 backdrop-blur shadow-lg rounded-full px-3.5 py-2 flex items-center gap-1.5 border border-slate-200 text-slate-700 hover:text-blue-600 font-semibold text-xs transition-all"
                >
                    <Home size={15} className="text-blue-600" />
                    <span>Overview</span>
                </button>

                {/* Brand Logo */}
                <div className="bg-white/95 backdrop-blur shadow-lg rounded-full px-4 py-2 flex items-center gap-2 border border-slate-200">
                    <div className="p-1 bg-blue-50 text-blue-600 rounded-full">
                        <AlertTriangle size={16} />
                    </div>
                    <div>
                        <h1 className="text-xs font-black text-slate-800 tracking-tight leading-none">{t('app_title')}</h1>
                        <span className="text-[9px] text-slate-500 font-medium">GIS Command Center</span>
                    </div>
                </div>

                {/* Simulator Trigger */}
                <button
                    onClick={() => setShowSimulator(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-all flex items-center gap-1.5 px-3.5 py-2 font-semibold text-xs border border-indigo-500"
                >
                    <CloudLightning size={15} />
                    <span>Disaster Simulator</span>
                </button>

                {/* Alerts Engine Trigger */}
                <button
                    onClick={() => setShowAlertsEngine(true)}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg transition-all flex items-center gap-1.5 px-3.5 py-2 font-semibold text-xs border border-red-500"
                >
                    <Radio size={15} className="animate-pulse" />
                    <span>Alerts Engine</span>
                </button>

                {/* Emergency Prioritisation Dashboard CTA */}
                <button
                    onClick={() => setShowEmergencyDashboard(true)}
                    className="bg-slate-900 hover:bg-slate-800 text-white rounded-full shadow-lg transition-all flex items-center gap-1.5 px-3.5 py-2 font-semibold text-xs border border-slate-700"
                >
                    <ShieldAlert size={15} className="text-red-400" />
                    <span>{t('emergency_dashboard')}</span>
                </button>

                {/* Report Incident CTA */}
                <button
                    onClick={() => setShowIncidentForm(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all flex items-center gap-1.5 px-3.5 py-2 font-semibold text-xs border border-blue-500"
                >
                    <PlusCircle size={15} />
                    <span>{t('report_incident')}</span>
                </button>

                {/* Language Switcher */}
                <div className="bg-white/95 backdrop-blur shadow-lg rounded-full px-3 py-1.5 flex items-center gap-1 border border-slate-200 text-xs text-slate-700">
                    <Globe size={13} className="text-slate-400" />
                    <select
                        value={lang}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                        className="bg-transparent font-semibold text-xs outline-none cursor-pointer pr-1"
                    >
                        {languages.map(l => (
                            <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                    </select>
                </div>

                {/* Offline Status Badge */}
                {!isOnline && (
                    <div className="bg-amber-500 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 border border-amber-400 animate-pulse">
                        <WifiOff size={13} />
                        <span>{t('offline_mode')}</span>
                    </div>
                )}
            </div>

            {/* Offline Sync Success Toast */}
            {syncToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1200] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border border-slate-700 animate-bounce">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    <span>{syncToast}</span>
                </div>
            )}

            {/* Main Map View */}
            <div className="flex-1 relative">
                <RiskMap
                    setSelectedDistrict={setSelectedDistrict}
                    route={route}
                    refreshKey={riskRefreshKey}
                    onDataLoaded={setMapData}
                />
            </div>

            {/* Right Detail Panel */}
            {selectedDistrict && (
                <DistrictPanel
                    district={selectedDistrict}
                    lang={lang}
                    onClose={() => setSelectedDistrict(null)}
                    onRouteGenerated={setRoute}
                    onRiskUpdated={() => setRiskRefreshKey(value => value + 1)}
                />
            )}

            {/* Incident Report Modal */}
            {showIncidentForm && (
                <IncidentForm
                    lang={lang}
                    onClose={() => setShowIncidentForm(false)}
                    onReportSubmitted={() => setRiskRefreshKey(k => k + 1)}
                />
            )}

            {/* Emergency Priority Dashboard Modal */}
            {showEmergencyDashboard && (
                <EmergencyDashboard
                    lang={lang}
                    risks={mapData.risks}
                    geoJsonData={mapData.geoJsonData}
                    onSelectDistrict={(feature) => setSelectedDistrict(feature)}
                    onClose={() => setShowEmergencyDashboard(false)}
                />
            )}

            {/* Disaster & Cloudburst Simulator Modal */}
            {showSimulator && (
                <DisasterSimulator
                    lang={lang}
                    geoJsonData={mapData.geoJsonData}
                    onSimulationComplete={handleSimulationComplete}
                    onClose={() => setShowSimulator(false)}
                />
            )}

            {/* Multi-Channel Alerts Engine Modal */}
            {showAlertsEngine && (
                <AlertsEngine
                    lang={lang}
                    geoJsonData={mapData.geoJsonData}
                    onClose={() => setShowAlertsEngine(false)}
                />
            )}
        </div>
    );
};

export default App;
