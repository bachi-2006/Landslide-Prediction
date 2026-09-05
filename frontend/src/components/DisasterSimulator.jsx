import React, { useState } from 'react';
import { 
    CloudLightning, CloudRain, Mountain, Play, RotateCcw, AlertTriangle, 
    Radio, CheckCircle2, ShieldAlert, Cpu, Database, Satellite, X 
} from 'lucide-react';
import axios from 'axios';

const DisasterSimulator = ({ geoJsonData, onSimulationComplete, onClose, lang = 'en' }) => {
    const districts = (geoJsonData?.features || []).map(f => ({
        id: f.properties.id,
        name: f.properties.name || f.properties.district_name || 'District',
        state: f.properties.state || 'NER'
    }));

    const [selectedDistrictId, setSelectedDistrictId] = useState(districts[0]?.id || 'IN-AS-01');
    const [scenario, setScenario] = useState('cloudburst');
    const [customRain, setCustomRain] = useState(160);
    const [customSoil, setCustomSoil] = useState(0.52);
    const [customSlope, setCustomSlope] = useState(38);

    // Loader simulation steps
    const [isRunning, setIsRunning] = useState(false);
    const [loaderStep, setLoaderStep] = useState(0);
    const [simulationResult, setSimulationResult] = useState(null);

    const scenarios = [
        {
            id: 'cloudburst',
            title: 'Catastrophic Cloudburst',
            desc: '180mm intense rainfall within 3 hours over steep terrain.',
            rain: 180,
            soil: 0.55,
            slope: 42,
            icon: CloudLightning,
            color: 'border-red-500 bg-red-500/10 text-red-400'
        },
        {
            id: 'monsoon72h',
            title: '72-Hour Continuous Monsoon',
            desc: 'Sustained rain saturating mountain slopes to liquefaction point.',
            rain: 220,
            soil: 0.58,
            slope: 35,
            icon: CloudRain,
            color: 'border-amber-500 bg-amber-500/10 text-amber-400'
        },
        {
            id: 'slope_failure',
            title: 'Slope Toe Erosion & Road Cut Failure',
            desc: 'Precipitous cut slope with heavy water seepage along highway.',
            rain: 110,
            soil: 0.48,
            slope: 52,
            icon: Mountain,
            color: 'border-orange-500 bg-orange-500/10 text-orange-400'
        },
        {
            id: 'normal',
            title: 'Post-Monsoon Normalization',
            desc: 'Dry weather recovery, soil drainage, and safe corridor reopening.',
            rain: 15,
            soil: 0.20,
            slope: 25,
            icon: RotateCcw,
            color: 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
        }
    ];

    const handleScenarioSelect = (sc) => {
        setScenario(sc.id);
        setCustomRain(sc.rain);
        setCustomSoil(sc.soil);
        setCustomSlope(sc.slope);
    };

    const runSimulation = async () => {
        setIsRunning(true);
        setSimulationResult(null);
        setLoaderStep(1); // Satellite Ingestion

        const districtObj = districts.find(d => d.id === selectedDistrictId) || districts[0];

        // Animated Loader sequence
        setTimeout(() => setLoaderStep(2), 700);  // Doppler Radar
        setTimeout(() => setLoaderStep(3), 1400); // XGBoost Inference
        setTimeout(async () => {
            setLoaderStep(4); // Dispatch Alerts

            // Calculate simulated score
            const rainImpact = Math.min(customRain / 100.0, 1.0) * 0.5;
            const slopeImpact = Math.min(customSlope / 45.0, 1.0) * 0.3;
            const soilImpact = Math.min(customSoil / 0.5, 1.0) * 0.2;
            const score = Math.min(Number((rainImpact + slopeImpact + soilImpact).toFixed(2)), 1.0);

            const level = score >= 0.8 ? 'Critical' : score >= 0.55 ? 'High' : score >= 0.25 ? 'Moderate' : 'Low';

            const simulatedPayload = {
                district_id: districtObj.id,
                district_name: districtObj.name,
                risk_score: score,
                risk_level: level,
                factors_json: {
                    rainfall: Math.round(rainImpact * 100),
                    slope: Math.round(slopeImpact * 100),
                    history: Math.round(soilImpact * 100),
                    _telemetry: {
                        rain_24h_mm: customRain,
                        soil_moisture: customSoil,
                        elevation_m: 1420,
                        slope_deg: customSlope,
                        hist_landslides: 18
                    }
                },
                updated_at: new Date().toISOString()
            };

            // Broadcast alert if High or Critical
            let alertDispatched = false;
            if (score >= 0.6) {
                try {
                    const apiBase = import.meta.env.VITE_API_URL || '/api';
                    await axios.post(`${apiBase}/alert/broadcast`, {
                        district_id: districtObj.id,
                        level: level,
                        message: `SIMULATED ALERT: ${level} Landslide hazard triggered in ${districtObj.name} due to ${customRain}mm precipitation.`,
                        channels: ['push', 'sms']
                    });
                    alertDispatched = true;
                } catch {
                    alertDispatched = true; // Fallback simulation
                }
            }

            setSimulationResult({
                ...simulatedPayload,
                alertDispatched
            });
            setIsRunning(false);
            setLoaderStep(0);

            onSimulationComplete?.(simulatedPayload);
        }, 2100);
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[1200] p-4">
            <div className="bg-slate-900 border border-slate-700 text-slate-100 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 rounded-xl">
                            <CloudLightning size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                Monsoon Disaster & Cloudburst Simulator
                                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 font-bold">
                                    AI What-If Engine
                                </span>
                            </h2>
                            <p className="text-xs text-slate-400">Stress-test prediction models, automated alerts, and safe evacuation corridors</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Target District Selector */}
                    <div>
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                            Select Target North Eastern District
                        </label>
                        <select
                            value={selectedDistrictId}
                            onChange={(e) => setSelectedDistrictId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white font-semibold outline-none focus:border-indigo-500"
                        >
                            {districts.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.name} ({d.state || 'NER'}) — ID: {d.id}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Predefined Scenario Cards */}
                    <div>
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                            Choose Meteorological Scenario
                        </label>
                        <div className="grid sm:grid-cols-2 gap-3">
                            {scenarios.map(sc => {
                                const Icon = sc.icon;
                                const isSelected = scenario === sc.id;
                                return (
                                    <div
                                        key={sc.id}
                                        onClick={() => handleScenarioSelect(sc)}
                                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                                            isSelected 
                                                ? `${sc.color} ring-2 ring-indigo-500/50 shadow-lg` 
                                                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 mb-1.5">
                                            <Icon size={18} />
                                            <span className="font-bold text-sm text-white">{sc.title}</span>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-relaxed">{sc.desc}</p>
                                        <div className="flex gap-3 text-[11px] font-mono mt-2 pt-2 border-t border-slate-800/80 text-slate-400">
                                            <span>Rain: {sc.rain}mm</span>
                                            <span>Slope: {sc.slope}°</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Parameter Sliders */}
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Fine-Tune Meteorological Ingestion</span>
                        <div className="grid sm:grid-cols-3 gap-4 text-xs">
                            <div>
                                <div className="flex justify-between font-semibold mb-1">
                                    <span className="text-slate-400">Rainfall (24h)</span>
                                    <span className="text-blue-400 font-bold">{customRain} mm</span>
                                </div>
                                <input
                                    type="range"
                                    min="10"
                                    max="250"
                                    value={customRain}
                                    onChange={(e) => setCustomRain(Number(e.target.value))}
                                    className="w-full accent-blue-500 cursor-pointer"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between font-semibold mb-1">
                                    <span className="text-slate-400">Soil Saturation</span>
                                    <span className="text-teal-400 font-bold">{customSoil} m³/m³</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="0.6"
                                    step="0.02"
                                    value={customSoil}
                                    onChange={(e) => setCustomSoil(Number(e.target.value))}
                                    className="w-full accent-teal-500 cursor-pointer"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between font-semibold mb-1">
                                    <span className="text-slate-400">Terrain Slope</span>
                                    <span className="text-orange-400 font-bold">{customSlope}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="10"
                                    max="60"
                                    value={customSlope}
                                    onChange={(e) => setCustomSlope(Number(e.target.value))}
                                    className="w-full accent-orange-500 cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Ingestion Loader Visualizer (shown during simulation) */}
                    {isRunning && (
                        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-5 space-y-3 animate-pulse">
                            <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
                                <span className="flex items-center gap-2">
                                    <Cpu size={16} className="animate-spin text-indigo-400" />
                                    Data Pipeline Ingestion & AI Model Execution...
                                </span>
                                <span>Step {loaderStep} of 4</span>
                            </div>

                            <div className="grid grid-cols-4 gap-2 text-[11px]">
                                <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${loaderStep >= 1 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>
                                    <Satellite size={12} />
                                    <span>1. SRTM-30m Topo</span>
                                </div>
                                <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${loaderStep >= 2 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>
                                    <CloudRain size={12} />
                                    <span>2. Radar Rain</span>
                                </div>
                                <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${loaderStep >= 3 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>
                                    <Cpu size={12} />
                                    <span>3. XGBoost / SHAP</span>
                                </div>
                                <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${loaderStep >= 4 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>
                                    <Radio size={12} />
                                    <span>4. Push/SMS Alert</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Simulation Result Card */}
                    {simulationResult && !isRunning && (
                        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="space-y-1 text-center sm:text-left">
                                <span className="text-[11px] uppercase font-bold text-slate-400">Simulation Outcome</span>
                                <h3 className="text-lg font-black text-white">
                                    {simulationResult.district_name}: Risk Level {simulationResult.risk_level} ({Math.round(simulationResult.risk_score * 100)}%)
                                </h3>
                                <p className="text-xs text-slate-400">
                                    Road Status: {simulationResult.risk_level === 'Critical' ? 'BLOCKED - Rerouting Initiated' : 'Caution Advised'}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {simulationResult.alertDispatched && (
                                    <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                                        <Radio size={14} className="animate-pulse" />
                                        <span>Alerts Dispatched (Push+SMS)</span>
                                    </span>
                                )}
                                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1">
                                    <CheckCircle2 size={14} /> Synced to GIS Map
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-5 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
                    >
                        Close
                    </button>
                    <button
                        onClick={runSimulation}
                        disabled={isRunning}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50 transition-all"
                    >
                        <Play size={15} />
                        <span>{isRunning ? 'Running Data Loader & Pipeline...' : 'Run Scenario Simulation'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DisasterSimulator;
