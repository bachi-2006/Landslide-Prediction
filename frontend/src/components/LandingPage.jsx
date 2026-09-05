import React, { useState } from 'react';
import { 
    Shield, AlertTriangle, CloudRain, Mountain, Radio, Navigation, 
    Smartphone, WifiOff, Globe, ArrowRight, CheckCircle2, ChevronRight,
    Activity, Layers, Users, PhoneCall, Zap, Compass, RefreshCw
} from 'lucide-react';
import { getTranslation } from '../services/i18n';

const LandingPage = ({ onLaunchDashboard, lang = 'en' }) => {
    const t = (key) => getTranslation(lang, key);

    // Interactive Simulation Playground State
    const [simRain, setSimRain] = useState(65);
    const [simSlope, setSimSlope] = useState(32);
    const [simSoil, setSimSoil] = useState(0.42);

    // Calculate simulated risk
    const rainImpact = Math.min(simRain / 100.0, 1.0) * 0.5;
    const slopeImpact = Math.min(simSlope / 45.0, 1.0) * 0.3;
    const soilImpact = Math.min(simSoil / 0.5, 1.0) * 0.2;
    const simScore = Math.min(Math.round((rainImpact + slopeImpact + soilImpact) * 100), 100);

    const getSimLevel = (score) => {
        if (score < 25) return { label: 'Low', color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200' };
        if (score < 55) return { label: 'Moderate', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' };
        if (score < 80) return { label: 'High', color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' };
        return { label: 'Critical', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
    };

    const simLevel = getSimLevel(simScore);

    const problemsSolved = [
        {
            title: "Fragile Mountain Terrain & Unplanned Hill Cutting",
            desc: "The North Eastern Region is geologically young with seismic fault lines and loose soil. Unregulated slope excavation triggers massive landslides during monsoon seasons.",
            icon: Mountain,
            color: "text-amber-500 bg-amber-50 border-amber-200"
        },
        {
            title: "Frequent Connectivity Disruptions on Lifeline Highways",
            desc: "Critical transit arteries like NH-10 (Sikkim) and NH-29 (Nagaland) face recurring road closures, stranding supply trucks, ambulances, and isolating remote villages for weeks.",
            icon: Navigation,
            color: "text-blue-500 bg-blue-50 border-blue-200"
        },
        {
            title: "Reactive & Delayed Disaster Response",
            desc: "Current monitoring largely depends on manual reporting after a failure occurs. Authorities lack real-time predictive lead-time to pre-deploy earthmovers or issue evacuations.",
            icon: AlertTriangle,
            color: "text-red-500 bg-red-50 border-red-200"
        },
        {
            title: "Communication Blackouts & Low-Network Remote Zones",
            desc: "During severe storms, telecom towers often lose grid power. Local field officials and residents cannot upload field evidence or receive alerts without offline support.",
            icon: WifiOff,
            color: "text-purple-500 bg-purple-50 border-purple-200"
        }
    ];

    const coreFeatures = [
        {
            title: "Real-Time AI/ML Risk Scoring",
            desc: "Fuses live Open-Meteo precipitation, SRTM-30m satellite elevation, soil moisture, and 9,800+ GSI historical records into an XGBoost classifier with explainable risk factors.",
            icon: Activity,
            tag: "AI / ML Engine"
        },
        {
            title: "Interactive GIS Command Center",
            desc: "Color-coded geospatial visualization across 115 Northeast districts with Street, Satellite (Esri), and Topographic Terrain basemaps.",
            icon: Layers,
            tag: "Geospatial GIS"
        },
        {
            title: "Hazard-Aware Safe Routing",
            desc: "Calculates smart alternative corridors avoiding high-risk landslide zones to protect emergency responders and civilian transit.",
            icon: Compass,
            tag: "Safe Routing"
        },
        {
            title: "Offline Sync & Crowd-Sourced Field Reporting",
            desc: "Field officials and citizens capture geo-tagged photos and damage reports. Works seamlessly offline with automatic cloud synchronization.",
            icon: Smartphone,
            tag: "Field Reporting"
        },
        {
            title: "Multi-Channel Emergency Alerts (Push + SMS)",
            desc: "Dispatches instant Web Push (FCM) and automated SMS warnings to district administrations, disaster management authorities, and local community leaders.",
            icon: Radio,
            tag: "Early Warning"
        },
        {
            title: "Regional Multilingual Localization",
            desc: "Provides native localized interfaces in Assamese (অসমীয়া), Bengali (বাংলা), Hindi (हिन्दी), and English to bridge the last-mile community gap.",
            icon: Globe,
            tag: "Community Access"
        }
    ];

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
            {/* Top Navigation */}
            <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30 text-white">
                            <Shield size={24} />
                        </div>
                        <div>
                            <span className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                                NE-SHIELD
                                <span className="text-[10px] uppercase font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                                    NER SIH-2026
                                </span>
                            </span>
                            <span className="text-xs text-slate-400 block -mt-0.5">AI Landslide Early Warning & Monitoring Platform</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={onLaunchDashboard}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2"
                        >
                            <span>Launch GIS Command Center</span>
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <header className="relative overflow-hidden pt-16 pb-20 border-b border-slate-800">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-950/30 via-transparent to-transparent pointer-events-none"></div>
                <div className="max-w-6xl mx-auto px-6 text-center relative z-10">
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-4 py-1.5 text-xs font-semibold text-blue-400 mb-6">
                        <Zap size={14} className="text-blue-400" />
                        Next-Generation Climate Resilient Disaster Governance
                    </div>

                    <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto mb-6">
                        AI-Powered Real-Time Landslide Prediction & Early Warning for the <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400">North Eastern Region</span>
                    </h1>

                    <p className="text-lg text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
                        Protecting communities across 8 Northeast states with live satellite slope analysis, real-time meteorological precipitation feeds, hazard-aware routing, and crowd-sourced incident tracking.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-4">
                        <button
                            onClick={onLaunchDashboard}
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-base rounded-2xl shadow-xl shadow-blue-600/40 transition-all flex items-center gap-3 group"
                        >
                            <span>Explore Live GIS Command Center</span>
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                        <a
                            href="#interactive-sim"
                            className="px-6 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-base rounded-2xl border border-slate-700 transition-all"
                        >
                            Try Interactive AI Simulator
                        </a>
                    </div>

                    {/* Stats Ticker */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mt-16 text-left">
                        <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-2xl backdrop-blur">
                            <div className="text-3xl font-black text-white">115</div>
                            <div className="text-xs text-slate-400 mt-1">NER Districts Monitored</div>
                        </div>
                        <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-2xl backdrop-blur">
                            <div className="text-3xl font-black text-white">9,852</div>
                            <div className="text-xs text-slate-400 mt-1">GSI Historical Landslide Records</div>
                        </div>
                        <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-2xl backdrop-blur">
                            <div className="text-3xl font-black text-white">&lt; 10s</div>
                            <div className="text-xs text-slate-400 mt-1">Live Risk Inference Latency</div>
                        </div>
                        <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-2xl backdrop-blur">
                            <div className="text-3xl font-black text-white">4 Languages</div>
                            <div className="text-xs text-slate-400 mt-1">EN, অসমীয়া, বাংলা, हिन्दी</div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Problem Statement Section */}
            <section className="py-20 max-w-6xl mx-auto px-6">
                <div className="text-center max-w-3xl mx-auto mb-14">
                    <span className="text-xs font-bold uppercase tracking-widest text-blue-400">The Ground Reality</span>
                    <h2 className="text-3xl font-extrabold text-white mt-2">Critical Challenges in the North Eastern Region</h2>
                    <p className="text-slate-400 text-sm mt-3">
                        Why traditional post-disaster manual reporting fails during the intense Himalayan monsoon season.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {problemsSolved.map((prob, idx) => {
                        const Icon = prob.icon;
                        return (
                            <div key={idx} className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/60 hover:border-slate-600 transition-all flex items-start gap-4">
                                <div className={`p-3 rounded-xl border shrink-0 ${prob.color}`}>
                                    <Icon size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-base mb-2">{prob.title}</h3>
                                    <p className="text-xs text-slate-300 leading-relaxed">{prob.desc}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Interactive Simulation Section */}
            <section id="interactive-sim" className="py-20 bg-slate-950 border-y border-slate-800">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="text-center max-w-2xl mx-auto mb-12">
                        <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Interactive Model Demo</span>
                        <h2 className="text-3xl font-black text-white mt-2">Try the AI Risk Scoring Engine</h2>
                        <p className="text-slate-400 text-sm mt-2">
                            Adjust live meteorological and geological parameters below to see how NE-SHIELD calculates real-time landslide risk severity.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-12 gap-8 items-center bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl">
                        {/* Sliders Area */}
                        <div className="md:col-span-7 space-y-6">
                            <div>
                                <div className="flex justify-between text-xs font-semibold mb-2">
                                    <span className="text-slate-300 flex items-center gap-1.5">
                                        <CloudRain size={16} className="text-blue-400" /> 24h Accumulated Rainfall
                                    </span>
                                    <span className="text-blue-400 font-bold">{simRain} mm</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={simRain}
                                    onChange={(e) => setSimRain(Number(e.target.value))}
                                    className="w-full accent-blue-500 cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                    <span>Dry (0mm)</span>
                                    <span>Heavy Rain (100mm)</span>
                                    <span>Cloudburst (200mm)</span>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-semibold mb-2">
                                    <span className="text-slate-300 flex items-center gap-1.5">
                                        <Mountain size={16} className="text-orange-400" /> Terrain Slope Gradient
                                    </span>
                                    <span className="text-orange-400 font-bold">{simSlope}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="60"
                                    value={simSlope}
                                    onChange={(e) => setSimSlope(Number(e.target.value))}
                                    className="w-full accent-orange-500 cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                    <span>Gentle (5°)</span>
                                    <span>Steep Hill (30°)</span>
                                    <span>Precipitous Cliff (60°)</span>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-semibold mb-2">
                                    <span className="text-slate-300 flex items-center gap-1.5">
                                        <Activity size={16} className="text-teal-400" /> Soil Moisture Saturation
                                    </span>
                                    <span className="text-teal-400 font-bold">{simSoil.toFixed(2)} m³/m³</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="0.6"
                                    step="0.02"
                                    value={simSoil}
                                    onChange={(e) => setSimSoil(Number(e.target.value))}
                                    className="w-full accent-teal-500 cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                    <span>Dry Soil (0.1)</span>
                                    <span>Saturated Mud (0.6)</span>
                                </div>
                            </div>
                        </div>

                        {/* Live Score Gauge Display */}
                        <div className="md:col-span-5 bg-slate-950 p-6 rounded-2xl border border-slate-800 text-center flex flex-col items-center justify-center">
                            <span className="text-xs uppercase font-bold text-slate-400">Calculated Landslide Probability</span>
                            
                            <div className="relative my-4 flex items-center justify-center">
                                <div className="text-5xl font-black text-white">{simScore}%</div>
                            </div>

                            <div className={`px-4 py-2 rounded-xl font-bold text-sm border inline-flex items-center gap-2 mb-4 ${simLevel.bg} ${simLevel.color}`}>
                                <AlertTriangle size={16} />
                                <span>{simLevel.label} Hazard Alert</span>
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed">
                                {simScore > 80 
                                    ? "Immediate road diversion recommended. Slope failure threshold exceeded."
                                    : simScore > 50
                                    ? "High alert for hill routes. Pre-position disaster response teams."
                                    : "Normal monitoring conditions. Standard vigilance advised."}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Core Features Grid */}
            <section className="py-20 max-w-6xl mx-auto px-6">
                <div className="text-center max-w-2xl mx-auto mb-14">
                    <span className="text-xs font-bold uppercase tracking-widest text-blue-400">System Capabilities</span>
                    <h2 className="text-3xl font-extrabold text-white mt-2">Comprehensive Solution Features</h2>
                    <p className="text-slate-400 text-sm mt-2">
                        Designed to satisfy every clause of the North Eastern Region disaster management mandate.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {coreFeatures.map((feat, idx) => {
                        const Icon = feat.icon;
                        return (
                            <div key={idx} className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/60 hover:border-blue-500/50 hover:bg-slate-800/70 transition-all flex flex-col">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/20">
                                        <Icon size={22} />
                                    </div>
                                    <span className="text-[10px] font-bold text-blue-300 bg-blue-950/60 border border-blue-800/60 px-2.5 py-1 rounded-full uppercase">
                                        {feat.tag}
                                    </span>
                                </div>
                                <h3 className="font-bold text-white text-base mb-2">{feat.title}</h3>
                                <p className="text-xs text-slate-300 leading-relaxed mt-auto">{feat.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Architecture / How It Works */}
            <section className="py-16 bg-slate-950 border-t border-slate-800">
                <div className="max-w-5xl mx-auto px-6 text-center">
                    <h2 className="text-2xl font-bold text-white mb-8">Integrated Disaster Data Architecture</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-medium text-slate-300">
                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                            <span className="block font-bold text-blue-400 mb-1">1. Ingestion</span>
                            Open-Meteo Weather + SRTM 30m Topo + GSI Bhusanket Data
                        </div>
                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                            <span className="block font-bold text-indigo-400 mb-1">2. ML Inference</span>
                            XGBoost Classifier + SHAP Explainability Scoring
                        </div>
                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                            <span className="block font-bold text-teal-400 mb-1">3. Real-Time Sync</span>
                            Supabase PostgreSQL + Realtime Geospatial State
                        </div>
                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                            <span className="block font-bold text-emerald-400 mb-1">4. Multi-Channel Alert</span>
                            FCM Push + SMS Broadcast + Leaflet GIS Dashboard
                        </div>
                    </div>
                </div>
            </section>

            {/* Call to Action Footer */}
            <footer className="py-16 bg-slate-900 border-t border-slate-800 text-center">
                <div className="max-w-4xl mx-auto px-6">
                    <h2 className="text-3xl font-black text-white mb-4">Ready to test the Live Command Center?</h2>
                    <p className="text-slate-400 text-sm max-w-xl mx-auto mb-8">
                        Launch the interactive GIS map with 115 Northeast districts, historical inventory points, and real-time hazard routing.
                    </p>
                    <button
                        onClick={onLaunchDashboard}
                        className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-base rounded-2xl shadow-xl shadow-blue-600/40 transition-all inline-flex items-center gap-2"
                    >
                        <span>Launch GIS Command Center</span>
                        <ArrowRight size={18} />
                    </button>
                    <div className="mt-8 text-xs text-slate-500">
                        NE-SHIELD © 2026 • AI Landslide Monitoring Platform for the North Eastern Region of India
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
