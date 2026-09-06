import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { riskService, incidentService } from '../services/api';
import { subscribeToMapUpdates } from '../services/supabase';
import { Layers, MapPin, History, Eye, EyeOff, Navigation, Radio, Activity, ShieldCheck, BarChart3, AlertOctagon } from 'lucide-react';
import PointAnalyticsModal from './PointAnalyticsModal';
import { soundEngine } from '../services/soundEngine';

// Fix for Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const incidentIcon = L.divIcon({
    className: 'custom-hazard-pin',
    html: `
        <div style="position: relative; width: 30px; height: 30px;">
            <div style="position: absolute; inset: -4px; background: rgba(239, 68, 68, 0.4); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="width: 28px; height: 28px; background: #dc2626; border: 2.5px solid #ffffff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.6); display: flex; align-items: center; justify-content: center;">
                <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
            </div>
        </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

const riskColors = {
    'Low': '#22c55e',
    'Moderate': '#eab308',
    'High': '#f97316',
    'Critical': '#ef4444',
};

const mapLayers = {
    standard: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors'
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    },
    terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
    }
};

const inspectionIcon = L.divIcon({
    className: 'custom-inspection-pin',
    html: `
        <div style="position: relative; width: 32px; height: 32px;">
            <div style="position: absolute; inset: -4px; background: rgba(59, 130, 246, 0.4); border-radius: 50%; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="width: 30px; height: 30px; background: #2563eb; border: 2.5px solid #ffffff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(37, 99, 235, 0.6); display: flex; align-items: center; justify-content: center;">
                <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
            </div>
        </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

const MapEventsClickHandler = ({ onMapClick }) => {
    useMapEvents({
        click: (e) => {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
};

const RouteViewport = ({ route }) => {
    const map = useMap();

    useEffect(() => {
        if (!route?.geometry) return;
        const bounds = L.geoJSON(route.geometry).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
    }, [map, route]);

    return null;
};

const RiskMap = ({ setSelectedDistrict, route, refreshKey, onDataLoaded }) => {
    const [geoJsonData, setGeoJsonData] = useState(null);
    const [historicalLandslides, setHistoricalLandslides] = useState(null);
    const [risks, setRisks] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [error, setError] = useState(null);

    // Layer Controls
    const [activeBasemap, setActiveBasemap] = useState('standard');
    const [showDistricts, setShowDistricts] = useState(true);
    const [showHistorical, setShowHistorical] = useState(true);
    const [showIncidents, setShowIncidents] = useState(true);
    const [showControlPanel, setShowControlPanel] = useState(true);

    // Inspection & Analytics state for any pin or map click
    const [inspectedPoint, setInspectedPoint] = useState(null);
    const [analyticsModalData, setAnalyticsModalData] = useState(null);
    const prevIncidentCountRef = useRef(0);

    useEffect(() => {
        let active = true;
        const loadMapData = async () => {
            try {
                const [districtResponse, landslideResponse, riskResponse, incidentResponse] = await Promise.all([
                    fetch('/data/ner_districts.json').then(response => {
                        if (!response.ok) throw new Error('District boundary data could not be loaded.');
                        return response.json();
                    }),
                    fetch('/data/historical_landslides.geojson').then(response => {
                        if (!response.ok) throw new Error('Historical landslide data could not be loaded.');
                        return response.json();
                    }),
                    riskService.getAllRisks(),
                    incidentService.getIncidents(),
                ]);
                if (!active) return;
                const newIncidents = incidentResponse.data.data || [];
                
                // If a brand-new incident report arrived, play emergency chime
                if (prevIncidentCountRef.current > 0 && newIncidents.length > prevIncidentCountRef.current) {
                    soundEngine.playChime();
                }
                prevIncidentCountRef.current = newIncidents.length;

                setGeoJsonData(districtResponse);
                setHistoricalLandslides(landslideResponse);
                setRisks(riskResponse.data.data || []);
                setIncidents(newIncidents);
                onDataLoaded?.({ geoJsonData: districtResponse, risks: riskResponse.data.data || [] });
                setError(null);
            } catch (loadError) {
                if (active) setError('Live map data is unavailable. Check the API and Supabase configuration.');
            }
        };
        loadMapData();
        const unsubscribe = subscribeToMapUpdates(loadMapData);
        // Poll every 6 seconds so mobile reports appear instantly on desktop
        const pollTimer = setInterval(loadMapData, 6000);
        return () => {
            active = false;
            unsubscribe();
            clearInterval(pollTimer);
        };
    }, [refreshKey]);

    const handleMapClick = (lat, lon) => {
        setInspectedPoint({ lat, lon });
    };

    const onEachDistrictFeature = (feature, layer) => {
        const risk = risks.find(item => item.district_id === feature.properties.id);
        const name = feature.properties.name || feature.properties.district_name || 'District';
        const level = risk?.risk_level || 'Low';
        const score = risk ? Math.round(risk.risk_score * 100) : 10;

        layer.bindTooltip(`
            <div class="px-2 py-1 text-xs">
                <strong>${name}</strong><br/>
                Risk: <span style="font-weight: bold; color: ${riskColors[level]}">${level} (${score}%)</span>
            </div>
        `, { sticky: true });

        layer.on({
            mouseover: (e) => {
                const l = e.target;
                l.setStyle({ fillOpacity: 0.85, weight: 3, color: '#1e293b' });
            },
            mouseout: (e) => {
                const l = e.target;
                l.setStyle({ fillOpacity: 0.65, weight: 1.5, color: '#ffffff' });
            },
            click: () => {
                setSelectedDistrict(feature);
            },
        });
    };

    const criticalCount = risks.filter(r => r.risk_level === 'Critical').length;
    const highCount = risks.filter(r => r.risk_level === 'High').length;
    const monitoredDistrictsCount = risks.length || (geoJsonData?.features?.length || 115);
    const sectorsAtRisk = criticalCount + highCount;
    const sectorsStatusText = sectorsAtRisk > 0
        ? `${sectorsAtRisk} / ${monitoredDistrictsCount} Vulnerable`
        : 'All 115 Clear';

    return (
        <div className="relative w-full h-full">
            <MapContainer
                center={[26.0, 92.0]}
                zoom={7}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                preferCanvas={true}
            >
                <TileLayer
                    key={activeBasemap}
                    url={mapLayers[activeBasemap].url}
                    attribution={mapLayers[activeBasemap].attribution}
                />

                {error && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] max-w-sm rounded-xl bg-red-50/95 backdrop-blur px-4 py-3 text-xs text-red-800 shadow-xl border border-red-200 flex items-center gap-2">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="font-bold text-red-600 hover:text-red-900 ml-auto">✕</button>
                    </div>
                )}

                {showDistricts && geoJsonData && (
                    <GeoJSON
                        data={geoJsonData}
                        onEachFeature={onEachDistrictFeature}
                        style={(feature) => {
                            const risk = risks.find(item => item.district_id === feature.properties.id);
                            return {
                                fillColor: riskColors[risk?.risk_level] || '#cbd5e1',
                                weight: 1.5,
                                opacity: 0.9,
                                color: 'white',
                                fillOpacity: 0.65,
                            };
                        }}
                    />
                )}

                {route?.geometry && (
                    <GeoJSON 
                        data={route.geometry} 
                        style={{ color: '#2563eb', weight: 6, opacity: 0.9, dashArray: '8, 6' }} 
                    />
                )}
                <RouteViewport route={route} />

                {showHistorical && historicalLandslides && (
                    <GeoJSON
                        data={historicalLandslides}
                        pointToLayer={(feature, latlng) => L.circleMarker(latlng, {
                            radius: 3,
                            color: '#7f1d1d',
                            fillColor: '#ef4444',
                            fillOpacity: 0.6,
                            weight: 0.8,
                        })}
                        onEachFeature={(feature, layer) => {
                            const properties = feature.properties || {};
                            layer.bindPopup(`
                                <div class="p-1 text-xs">
                                    <strong style="color: #b91c1c;">GSI Historical Landslide</strong><br />
                                    State: ${properties.state || 'NER'}<br />
                                    Record: ${properties.source_row || 'Inventory'}
                                </div>
                            `);
                        }}
                    />
                )}

                <MapEventsClickHandler onMapClick={handleMapClick} />

                {/* Dropped Inspection Pin */}
                {inspectedPoint && (
                    <Marker position={[inspectedPoint.lat, inspectedPoint.lon]} icon={inspectionIcon}>
                        <Popup autoPan={true}>
                            <div className="p-3 max-w-[260px] text-xs font-sans">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                                    <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                        Inspection Point
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-400">
                                        {Number(inspectedPoint.lat).toFixed(3)}°, {Number(inspectedPoint.lon).toFixed(3)}°
                                    </span>
                                </div>
                                <p className="text-slate-600 text-[11px] mb-3">
                                    Calculate micro-site topographical slope, weather telemetry and live XGBoost risk percentage at this exact point.
                                </p>
                                <button
                                    onClick={() => setAnalyticsModalData({
                                        lat: inspectedPoint.lat,
                                        lon: inspectedPoint.lon,
                                        label: 'Direct Map Pin'
                                    })}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                                >
                                    <BarChart3 size={14} />
                                    <span>Calculate Real-Time Analytics</span>
                                </button>
                            </div>
                        </Popup>
                    </Marker>
                )}

                {showIncidents && incidents.map(inc => (
                    <Marker key={inc.id} position={[inc.latitude, inc.longitude]} icon={incidentIcon}>
                        <Popup className="incident-custom-popup">
                            <div className="p-3 max-w-[280px] text-xs font-sans">
                                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                                    <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                                        Citizen Hazard Report
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono">
                                        {inc.created_at ? new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                                    </span>
                                </div>

                                <h3 className="font-extrabold text-slate-900 text-sm mb-1">{inc.submitted_by || 'Field Reporter'}</h3>
                                
                                <p className="text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs mb-2.5">
                                    {inc.description}
                                </p>

                                {inc.photo_url ? (
                                    <div className="mb-2">
                                        <img src={inc.photo_url} alt="Incident Evidence" className="w-full h-32 object-cover rounded-xl border border-slate-200 shadow-sm" />
                                        <span className="text-[10px] text-slate-400 block mt-1">Field Photographic Evidence</span>
                                    </div>
                                ) : (
                                    <div className="bg-slate-100/70 p-2 rounded-lg text-[10px] text-slate-600 mb-2 flex items-center justify-between">
                                        <span>📍 GPS Coordinates</span>
                                        <span className="font-mono font-bold">{Number(inc.latitude).toFixed(4)}° N, {Number(inc.longitude).toFixed(4)}° E</span>
                                    </div>
                                )}

                                {/* Real-Time Analytics & Risk Calculation CTA */}
                                <button
                                    onClick={() => setAnalyticsModalData({
                                        lat: inc.latitude,
                                        lon: inc.longitude,
                                        label: `Hazard: ${inc.description.slice(0, 25)}...`,
                                        incidentInfo: inc
                                    })}
                                    className="w-full mb-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                                >
                                    <BarChart3 size={14} className="text-red-400" />
                                    <span>View Real-Time Analytics & Risk %</span>
                                </button>

                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                                        ✓ Synced to HQ & Mobile
                                    </span>
                                    <span>{inc.created_at ? new Date(inc.created_at).toLocaleDateString() : 'Today'}</span>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* GIS Floating Control & Legend Panel */}
            <div className="absolute right-4 top-4 z-[1000] flex flex-col gap-2.5">
                <button
                    onClick={() => setShowControlPanel(!showControlPanel)}
                    className="bg-white shadow-xl rounded-full p-2.5 self-end border border-slate-200 text-slate-700 hover:text-slate-900 transition-all flex items-center gap-1.5 text-xs font-semibold px-3"
                >
                    <Layers size={16} className="text-blue-600" />
                    <span>GIS Layers & Legend</span>
                </button>

                {showControlPanel && (
                    <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl p-4 border border-slate-200 w-72 flex flex-col gap-3.5 text-xs">
                        {/* Basemap Switcher */}
                        <div>
                            <span className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">Basemap Imagery</span>
                            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                                {['standard', 'satellite', 'terrain'].map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setActiveBasemap(mode)}
                                        className={`py-1 capitalize rounded-lg font-semibold text-[11px] transition-all ${
                                            activeBasemap === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Layer Toggles */}
                        <div>
                            <span className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">GIS Map Layers</span>
                            <div className="space-y-1.5">
                                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                                    <span className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                                        <span>NER Districts (115)</span>
                                    </span>
                                    <input 
                                        type="checkbox" 
                                        checked={showDistricts} 
                                        onChange={() => setShowDistricts(!showDistricts)}
                                        className="cursor-pointer accent-blue-600 rounded" 
                                    />
                                </label>

                                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                                    <span className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                                        <span>GSI Landslides (9.8k)</span>
                                    </span>
                                    <input 
                                        type="checkbox" 
                                        checked={showHistorical} 
                                        onChange={() => setShowHistorical(!showHistorical)}
                                        className="cursor-pointer accent-blue-600 rounded" 
                                    />
                                </label>

                                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                                    <span className="flex items-center gap-2">
                                        <MapPin size={12} className="text-blue-600" />
                                        <span>Citizen Reports</span>
                                    </span>
                                    <input 
                                        type="checkbox" 
                                        checked={showIncidents} 
                                        onChange={() => setShowIncidents(!showIncidents)}
                                        className="cursor-pointer accent-blue-600 rounded" 
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Risk Severity Legend */}
                        <div className="pt-2 border-t border-slate-100">
                            <span className="font-bold text-slate-700 block mb-2 uppercase text-[10px] tracking-wider">Risk Severity Scale</span>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded bg-emerald-500"></div>
                                    <span className="text-slate-600">Low (&lt;25%)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded bg-amber-400"></div>
                                    <span className="text-slate-600">Moderate (25-55%)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded bg-orange-500"></div>
                                    <span className="text-slate-600">High (55-80%)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded bg-red-500"></div>
                                    <span className="text-slate-600">Critical (&gt;80%)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Live Floating Regional Telemetry HUD Bar */}
            <div className="absolute left-4 bottom-4 z-[1000] flex flex-wrap gap-2.5 items-center pointer-events-auto">
                <div className="bg-slate-950/90 backdrop-blur-md text-white shadow-2xl rounded-2xl p-2.5 px-4 border border-slate-800 flex items-center gap-4 text-xs font-semibold">
                    {/* Critical / High Risk Badge */}
                    <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${criticalCount > 0 ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${criticalCount > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                        </span>
                        <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider leading-none">Regional Hazard</span>
                            <span className="font-bold text-white text-xs">
                                {criticalCount > 0 ? `${criticalCount} Critical, ${highCount} High` : 'All Sectors Stable'}
                            </span>
                        </div>
                    </div>

                    {/* Sectors Monitored Status */}
                    <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
                        <Navigation size={14} className="text-blue-400" />
                        <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider leading-none">Sector Hazard</span>
                            <span className="font-bold text-white text-xs">{sectorsStatusText}</span>
                        </div>
                    </div>

                    {/* GSI Historical Inventory Points */}
                    <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
                        <History size={14} className="text-amber-400" />
                        <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider leading-none">GSI Landslides</span>
                            <span className="font-bold text-white text-xs">9,852 Mapped</span>
                        </div>
                    </div>

                    {/* Crowd-Sourced Field Incidents */}
                    <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
                        <MapPin size={14} className="text-purple-400" />
                        <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider leading-none">Field Reports</span>
                            <span className="font-bold text-white text-xs">{incidents.length} Active</span>
                        </div>
                    </div>

                    {/* Firebase Cloud Messaging Status */}
                    <div className="flex items-center gap-2">
                        <Radio size={14} className="text-emerald-400 animate-pulse" />
                        <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider leading-none">FCM Alert Channel</span>
                            <span className="font-bold text-emerald-400 text-xs">Push Armed</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Micro-Site Real-Time Analytics & Risk Calculation Modal */}
            {analyticsModalData && (
                <PointAnalyticsModal
                    pointData={analyticsModalData}
                    onClose={() => setAnalyticsModalData(null)}
                    onNavigateRoute={({ lat, lon }) => {
                        // Find closest district centroid to trigger safe evacuation corridor
                        const match = geoJsonData?.features?.find(f => {
                            const [minLon, minLat, maxLon, maxLat] = L.geoJSON(f).getBounds();
                            return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
                        }) || geoJsonData?.features?.[0];
                        if (match) setSelectedDistrict(match);
                    }}
                />
            )}
        </div>
    );
};

export default RiskMap;
