import React, { useState, useEffect } from 'react';
import RiskMap from './components/RiskMap';
import DistrictPanel from './components/DistrictPanel';
import IncidentForm from './components/IncidentForm';
import EmergencyDashboard from './components/EmergencyDashboard';
import LandingPage from './components/LandingPage';
import DisasterSimulator from './components/DisasterSimulator';
import AlertsEngine from './components/AlertsEngine';
import LocationEvacuationModal from './components/LocationEvacuationModal';
import Sidebar from './components/Sidebar';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requestNotificationPermission, onNotificationReceived } from './services/firebase';
import { languages, getTranslation } from './services/i18n';
import { initOfflineSync } from './services/offlineSync';
import { rbac, ROLES, ROLE_CONFIG } from './services/rbac';


const App = () => {
    const [currentView, setCurrentView] = useState('landing'); // 'landing' | 'command_center'
    const [selectedDistrict, setSelectedDistrict] = useState(null);
    const [showIncidentForm, setShowIncidentForm] = useState(false);
    const [showEmergencyDashboard, setShowEmergencyDashboard] = useState(false);
    const [showSimulator, setShowSimulator] = useState(false);
    const [showAlertsEngine, setShowAlertsEngine] = useState(false);
    const [showEvacuationModal, setShowEvacuationModal] = useState(false);
    const [activeRole, setActiveRole] = useState(() => rbac.getCurrentRole());
    const [emergencyBanner, setEmergencyBanner] = useState(null);

    const [route, setRoute] = useState(null);
    const [riskRefreshKey, setRiskRefreshKey] = useState(0);
    const [mapData, setMapData] = useState({ geoJsonData: null, risks: [] });

    const [lang, setLang] = useState(() => localStorage.getItem('ne_shield_lang') || 'en');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [syncToast, setSyncToast] = useState(null);

    const t = (key) => getTranslation(lang, key);

    const handleRoleChange = (newRole) => {
        rbac.setRole(newRole);
        setActiveRole(newRole);
        setSyncToast(`Role switched to: ${ROLE_CONFIG[newRole].label}`);
        setTimeout(() => setSyncToast(null), 3000);
    };

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

        // Trigger Live High-Priority Disaster Emergency Banner
        const pRisk = Math.round(simulatedDistrict.risk_score * 100);
        if (pRisk >= 55) {
            setEmergencyBanner({
                title: `DISASTER SIMULATION WARNING: ${simulatedDistrict.district_name}`,
                probability: pRisk,
                level: simulatedDistrict.risk_level,
                message: `HIGH PROBABILITY OF LANDSLIDE DISASTER DETECTED (${pRisk}%). BE READY: Activate local shelters, clear NH bottlenecks, and prepare evacuation corridors immediately.`
            });
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

    const currentRoleCfg = ROLE_CONFIG[activeRole] || ROLE_CONFIG[ROLES.CITIZEN];

    return (
        <div className="flex h-screen w-full overflow-hidden bg-slate-100 relative">
            {/* Live Disaster Simulation / Crisis Warning Banner */}
            {emergencyBanner && (
                <div className="fixed top-0 left-0 right-0 z-[1500] bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white px-4 py-2.5 shadow-2xl flex items-center justify-between animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2.5 max-w-4xl">
                        <div className="p-1.5 bg-white text-red-600 rounded-full animate-ping shrink-0">
                            <AlertTriangle size={14} />
                        </div>
                        <div className="text-xs">
                            <strong className="font-black uppercase tracking-wider mr-2 bg-black/20 px-2 py-0.5 rounded">
                                🚨 {emergencyBanner.title} (Probability: {emergencyBanner.probability}%)
                            </strong>
                            <span className="font-medium opacity-95">{emergencyBanner.message}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowEmergencyDashboard(true)}
                            className="bg-white text-red-700 font-bold px-3 py-1 rounded-full text-xs hover:bg-slate-100 transition-colors shadow-sm"
                        >
                            Open Action Center
                        </button>
                        <button
                            onClick={() => setEmergencyBanner(null)}
                            className="p-1 text-white/80 hover:text-white rounded-full font-bold ml-1"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* Main Application Shell with Sidebar Layout */}
            <div className="flex h-full w-full overflow-hidden">
                <Sidebar
                    activeRole={activeRole}
                    onRoleChange={handleRoleChange}
                    lang={lang}
                    onLangChange={handleLanguageChange}
                    languages={languages}
                    isOnline={isOnline}
                    emergencyBanner={emergencyBanner}
                    onAction={(action) => {
                        if (action === 'home') setCurrentView('landing');
                        if (action === 'shelter') setShowEvacuationModal(true);
                        if (action === 'report') setShowIncidentForm(true);
                        if (action === 'emergency') setShowEmergencyDashboard(true);
                        if (action === 'simulator') setShowSimulator(true);
                        if (action === 'alerts') setShowAlertsEngine(true);
                    }}
                />

                {/* Main Map Canvas */}
                <div className="flex-1 relative h-full">
                    <RiskMap
                        setSelectedDistrict={setSelectedDistrict}
                        route={route}
                        refreshKey={riskRefreshKey}
                        onDataLoaded={setMapData}
                    />
                </div>
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
                    activeRole={activeRole}
                    onSelectDistrict={(feature) => setSelectedDistrict(feature)}
                    onIncidentUpdated={() => setRiskRefreshKey(k => k + 1)}
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

            {/* Emergency Evacuation & Shelter Finder Modal */}
            <LocationEvacuationModal
                isOpen={showEvacuationModal}
                onClose={() => setShowEvacuationModal(false)}
                onRouteFound={(evacRoute, shelter) => {
                    setRoute(evacRoute);
                    setSyncToast(`Safe evacuation route plotted to ${shelter?.name || 'Safe Shelter'}!`);
                    setTimeout(() => setSyncToast(null), 5000);
                }}
            />
        </div>
    );
};

export default App;
