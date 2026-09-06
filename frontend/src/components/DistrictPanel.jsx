import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, TrendingUp, Navigation, CloudRain, Droplets, Mountain, Compass, ShieldCheck, PhoneCall, ShieldAlert, CheckCircle2, AlertOctagon } from 'lucide-react';
import { riskService, routeService } from '../services/api';
import { getTranslation } from '../services/i18n';

const DistrictPanel = ({ district, onClose, onRouteGenerated, onRiskUpdated, lang = 'en' }) => {
    if (!district) return null;

    const t = (key) => getTranslation(lang, key);

    // Compute a simple centroid from a GeoJSON polygon/multipolygon
    const deriveCentroid = (feature) => {
        const geom = feature?.geometry;
        let coords = [];
        if (geom?.type === 'Polygon') coords = geom.coordinates[0];
        if (geom?.type === 'MultiPolygon') coords = geom.coordinates[0]?.[0] || [];
        if (!coords.length) return { lat: 26.0, lon: 92.0 }; // fallback NER center
        let lat = 0, lon = 0;
        coords.forEach(([lng, latv]) => { lon += lng; lat += latv; });
        return { lat: lat / coords.length, lon: lon / coords.length };
    };

    const props = district.properties || district;
    const name = props.name || props.district_name || 'Unknown district';
    const centroid = deriveCentroid(district);

    const [data, setData] = React.useState(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    React.useEffect(() => {
        let active = true;
        setData(null);
        setError(null);
        if (props.id) {
            riskService.getDistrictRisk(props.id)
                .then(res => { if (active) setData(res.data.data); })
                .catch(() => { if (active) setError('Risk data is unavailable for this district.'); });
        }
        return () => { active = false; };
    }, [district]);

    const handleRefreshRisk = async () => {
        if (!props.id) return;
        setRefreshing(true);
        setError(null);
        try {
            const response = await riskService.refreshRisk(props.id, centroid.lat, centroid.lon, name);
            setData(response.data.data);
            onRiskUpdated?.();
        } catch (refreshError) {
            setError('Risk refresh failed. Verify external weather/elevation services.');
        } finally {
            setRefreshing(false);
        }
    };

    const handleGetRoute = async () => {
        setLoading(true);
        try {
            // Safe relief corridor calculation from regional transport hub (Guwahati Hub or User GPS)
            const payload = {
                origin_lat: 26.1, origin_lon: 91.7, // Regional Transit Hub
                dest_lat: centroid.lat, dest_lon: centroid.lon,
                avoid_district_id: props.id
            };
            const res = await routeService.getSafeRoute(payload);
            onRouteGenerated?.(res.data.data);
        } catch (e) {
            setError('Routing failed or routing service unavailable.');
        } finally {
            setLoading(false);
        }
    };

    const riskColors = {
        'Low': 'bg-green-100 text-green-800 border-green-200',
        'Moderate': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'High': 'bg-orange-100 text-orange-800 border-orange-200',
        'Critical': 'bg-red-100 text-red-800 border-red-200',
    };

    if (!data) {
        return (
            <div className="w-full sm:w-96 h-full bg-white p-6 text-sm text-slate-600 shadow-xl border-l border-slate-200 flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-slate-800">{name}</h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close district panel">✕</button>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
                        {error ? (
                            <div className="text-red-600 font-medium">{error}</div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <RefreshCw size={16} className="animate-spin text-blue-600" />
                                <span>Loading district risk data...</span>
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs"
                >
                    Close Panel
                </button>
            </div>
        );
    }

    const factors = Object.entries(data.factors_json || {}).filter(([k]) => !k.startsWith('_'));
    const telemetry = data.factors_json?._telemetry || null;

    const roadStatus = data.risk_level === 'Critical'
        ? { text: t('road_blocked'), color: 'bg-red-50 text-red-700 border-red-200' }
        : data.risk_level === 'High'
        ? { text: t('road_at_risk'), color: 'bg-orange-50 text-orange-700 border-orange-200' }
        : { text: t('road_clear'), color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };

    return (
        <div className="w-96 h-full bg-white shadow-xl overflow-y-auto p-6 flex flex-col gap-5 border-l border-slate-200 text-slate-800">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">{name}</h2>
                    <span className="text-xs text-slate-400">NER District ID: {props.id}</span>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close district panel">✕</button>
            </div>

            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {/* Risk Badge */}
            <div className={`p-4 rounded-xl flex items-center gap-3 border ${riskColors[data.risk_level] || 'bg-slate-100 border-slate-200'}`}>
                <AlertTriangle size={24} />
                <div>
                    <p className="text-xs uppercase font-semibold opacity-75">{t('current_risk_level')}</p>
                    <p className="text-xl font-black">{data.risk_level}</p>
                </div>
            </div>

            {/* Road Status */}
            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${roadStatus.color}`}>
                <ShieldCheck size={18} />
                <div>
                    <span className="block opacity-75 font-normal">{t('road_status')}</span>
                    <span>{roadStatus.text}</span>
                </div>
            </div>

            {/* Risk Score bar */}
            <div>
                <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-600">{t('risk_score')}</span>
                    <span className="text-sm font-bold text-slate-900">{Math.round(data.risk_score * 100)}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${
                            data.risk_score > 0.8 ? 'bg-red-600' : data.risk_score > 0.5 ? 'bg-orange-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${Math.min(data.risk_score * 100, 100)}%` }}
                    />
                </div>
            </div>

            {/* Live Weather & Telemetry Card */}
            {telemetry && (
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <h3 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
                        <CloudRain size={14} className="text-blue-600" /> {t('weather_telemetry')}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block">{t('rain_24h')}</span>
                            <span className="font-bold text-slate-800">{telemetry.rain_24h_mm} mm</span>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block">{t('soil_moisture')}</span>
                            <span className="font-bold text-slate-800">{telemetry.soil_moisture} m³/m³</span>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block">{t('elevation')}</span>
                            <span className="font-bold text-slate-800">{telemetry.elevation_m} m</span>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block">{t('slope_angle')}</span>
                            <span className="font-bold text-slate-800">{telemetry.slope_deg}°</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Disaster Precautions & Safety Advisory (NDMA Standard) */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldAlert size={15} className={data.risk_level === 'Critical' ? 'text-red-600' : 'text-amber-600'} />
                        NDMA Safety Guidelines
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        data.risk_level === 'Critical' ? 'bg-red-100 text-red-700' :
                        data.risk_level === 'High' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                    }`}>
                        {data.risk_level} Protocol
                    </span>
                </div>

                <div className="space-y-2 text-xs">
                    {/* DO's */}
                    <div className="bg-emerald-50/90 border border-emerald-200 rounded-lg p-2.5">
                        <p className="font-bold text-emerald-800 flex items-center gap-1 mb-1">
                            <CheckCircle2 size={13} className="text-emerald-600" /> DO'S:
                        </p>
                        <ul className="list-disc list-inside text-emerald-900 space-y-1 leading-relaxed text-[11px]">
                            {data.risk_level === 'Critical' ? (
                                <>
                                    <li><strong>Evacuate immediately</strong> along the marked safe uphill route.</li>
                                    <li>Keep emergency go-bag ready (torch, water, IDs, first-aid).</li>
                                    <li>Stay tuned to local SDMA radio/FCM emergency broadcasts.</li>
                                </>
                            ) : data.risk_level === 'High' ? (
                                <>
                                    <li>Inspect hillside slope retaining walls for new tension cracks.</li>
                                    <li>Identify community safe high-ground relief centers.</li>
                                    <li>Charge communication devices and avoid mountain highways.</li>
                                </>
                            ) : (
                                <>
                                    <li>Keep perimeter drainage channels and roof gutters clear.</li>
                                    <li>Check regional weather advisories before travelling.</li>
                                </>
                            )}
                        </ul>
                    </div>

                    {/* DONT'S */}
                    <div className="bg-rose-50/90 border border-rose-200 rounded-lg p-2.5">
                        <p className="font-bold text-rose-800 flex items-center gap-1 mb-1">
                            <AlertOctagon size={13} className="text-rose-600" /> DON'TS:
                        </p>
                        <ul className="list-disc list-inside text-rose-900 space-y-1 leading-relaxed text-[11px]">
                            {data.risk_level === 'Critical' ? (
                                <>
                                    <li><strong>Do NOT cross active debris or mudflow paths</strong> by foot or vehicle.</li>
                                    <li>Do NOT delay evacuation to pack heavy household assets.</li>
                                    <li>Do NOT re-enter damaged buildings until certified safe.</li>
                                </>
                            ) : data.risk_level === 'High' ? (
                                <>
                                    <li>Do NOT drive through steep road cuts during continuous heavy downpours.</li>
                                    <li>Do NOT construct makeshift retaining walls during rain.</li>
                                </>
                            ) : (
                                <>
                                    <li>Do NOT dump construction debris or soil into natural hill nullahs.</li>
                                </>
                            )}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Contributing Factors */}
            <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <TrendingUp size={16} /> {t('contributing_factors')}
                </h3>
                <div className="flex flex-col gap-2.5">
                    {factors.map(([factor, value]) => (
                        <div key={factor} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs text-slate-500 capitalize">
                                <span>{factor.replace('_', ' ')}</span>
                                <span className="font-medium">{Math.round(value)}%</span>
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

            {/* Emergency Hotline */}
            <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl text-xs space-y-1">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                    <PhoneCall size={14} className="text-blue-600" /> {t('emergency_contacts')}
                </span>
                <p className="text-blue-800">{t('ndrf_helpline')}</p>
                <p className="text-blue-800">{t('state_sdma')}</p>
            </div>

            {/* Action Buttons */}
            <div className="mt-auto pt-4 border-t border-slate-100 space-y-2">
                <button
                    onClick={handleRefreshRisk}
                    disabled={refreshing}
                    className="w-full py-2.5 border border-slate-300 text-slate-700 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-60 text-sm transition-all"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? t('refreshing') : t('refresh_risk')}
                </button>
                <button
                    onClick={handleGetRoute}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:bg-blue-300 text-sm shadow-md"
                >
                    <Navigation size={18} />
                    {loading ? t('calculating') : t('show_safe_route')}
                </button>
            </div>
        </div>
    );
};

export default DistrictPanel;
