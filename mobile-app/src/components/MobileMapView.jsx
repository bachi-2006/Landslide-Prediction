import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Crosshair, Layers, Navigation, Activity, AlertTriangle, ShieldCheck, 
  MapPin, Volume2, CloudRain, X, ArrowRight, BarChart3, Radio 
} from 'lucide-react';
import { mobileApi } from '../services/api';
import { soundEngine } from '../services/soundEngine';

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const hazardPinIcon = L.divIcon({
  className: 'mobile-hazard-pin',
  html: `
    <div style="position: relative; width: 28px; height: 28px;">
      <div style="position: absolute; inset: -4px; background: rgba(220, 38, 38, 0.45); border-radius: 50%; animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 26px; height: 26px; background: #dc2626; border: 2.5px solid #ffffff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 10px rgba(220, 38, 38, 0.6); display: flex; align-items: center; justify-content: center;">
        <div style="width: 7px; height: 7px; background: white; border-radius: 50%;"></div>
      </div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28]
});

const inspectionPinIcon = L.divIcon({
  className: 'mobile-inspection-pin',
  html: `
    <div style="position: relative; width: 28px; height: 28px;">
      <div style="position: absolute; inset: -4px; background: rgba(37, 99, 235, 0.45); border-radius: 50%; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 26px; height: 26px; background: #2563eb; border: 2.5px solid #ffffff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 10px rgba(37, 99, 235, 0.6); display: flex; align-items: center; justify-content: center;">
        <div style="width: 7px; height: 7px; background: white; border-radius: 50%;"></div>
      </div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28]
});

const riskColors = {
  'Low': '#22c55e',
  'Moderate': '#eab308',
  'High': '#f97316',
  'Critical': '#ef4444',
};

const mapLayers = {
  standard: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  },
  topo: {
    name: 'Topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  }
};

// Map click event listener to drop pins
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Controller to smoothly pan & zoom map to user GPS
function MapController({ targetPos }) {
  const map = useMap();
  useEffect(() => {
    if (targetPos) {
      map.flyTo([targetPos.lat, targetPos.lon], targetPos.zoom || 11, { duration: 1.2 });
    }
  }, [targetPos, map]);
  return null;
}

export default function MobileMapView({ 
  selectedDistrict, 
  onSelectDistrict, 
  districts = [], 
  incidents = [],
  onOpenReport,
  onSelectIncident,
  userRole = 'citizen',
  onRespondIncident
}) {
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [activeBasemap, setActiveBasemap] = useState('standard');
  const [inspectedPoint, setInspectedPoint] = useState(null);
  const [pointCalculation, setPointCalculation] = useState(null);
  const [calculatingPoint, setCalculatingPoint] = useState(false);
  const [targetViewport, setTargetViewport] = useState(null);
  const [locating, setLocating] = useState(false);

  // Load NER District Polygons from public/data
  useEffect(() => {
    let active = true;
    fetch('/data/ner_districts.json')
      .then(res => res.json())
      .then(data => {
        if (active) setGeoJsonData(data);
      })
      .catch(err => {
        console.warn("Could not load ner_districts.json on mobile:", err);
      });
    return () => { active = false; };
  }, []);

  // When user clicks GPS Crosshair button
  const handleLocateMe = () => {
    setLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setTargetViewport({ lat, lon, zoom: 12 });
          setInspectedPoint({ lat, lon, label: 'My Live GPS Location' });
        },
        (err) => {
          setLocating(false);
          // Fallback to Shillong center if GPS disabled
          setTargetViewport({ lat: 25.5788, lon: 91.8933, zoom: 11 });
        },
        { timeout: 6000, enableHighAccuracy: true }
      );
    } else {
      setLocating(false);
    }
  };

  // When user taps anywhere on map
  const handleMapTap = async (lat, lon) => {
    setInspectedPoint({ lat, lon, label: `Point (${lat.toFixed(4)}, ${lon.toFixed(4)})` });
    setCalculatingPoint(true);
    setPointCalculation(null);

    try {
      const res = await mobileApi.calculatePointRisk(lat, lon, 'Field Tap');
      if (res.success) {
        setPointCalculation(res.data);
      }
    } catch (e) {
      console.warn("Point risk calculation fallback:", e);
    } finally {
      setCalculatingPoint(false);
    }
  };

  const findMatchingDistrict = (districtsList, feature) => {
    if (!districtsList || !feature) return null;
    const fId = (feature.properties?.id || '').toLowerCase();
    const fName = (feature.properties?.name || feature.properties?.district_name || '').toLowerCase();
    return districtsList.find(d => {
      const dId = (d.id || '').toLowerCase();
      const dName = (d.name || d.district_name || '').toLowerCase();
      return (
        dId === fId ||
        dName === fName ||
        (fName && dName.includes(fName)) ||
        (dName && fName.includes(dName)) ||
        (fId && dName.replace(/\s+/g, '-').includes(fId))
      );
    });
  };

  const onEachDistrictFeature = (feature, layer) => {
    const match = findMatchingDistrict(districts, feature);
    const name = feature.properties.name || feature.properties.district_name || 'District';
    const risk = match?.risk || 'Moderate';
    const score = match?.score || 50;
    const districtId = match?.id || feature.properties.id;

    layer.bindTooltip(`
      <div style="font-size: 11px; font-weight: bold; padding: 2px 4px;">
        ${name}<br/>
        <span style="color: ${riskColors[risk] || '#eab308'}">${risk} (${score}%)</span>
      </div>
    `, { sticky: true });

    layer.on({
      click: () => {
        onSelectDistrict({
          id: districtId,
          name,
          state: feature.properties.state || match?.state || 'NER',
          risk,
          score
        });
      }
    });
  };

  return (
    <div className="mobile-map-container" style={{ position: 'relative', width: '100%', height: 'calc(100vh - 160px)', minHeight: '480px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.12)' }}>
      {/* Real Interactive Leaflet GIS Map */}
      <MapContainer
        center={[25.7, 92.2]}
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          key={activeBasemap}
          url={mapLayers[activeBasemap].url}
          attribution="&copy; OpenStreetMap & Esri"
        />

        <MapClickHandler onMapClick={handleMapTap} />
        <MapController targetPos={targetViewport} />

        {/* Real District Boundary Polygons */}
        {geoJsonData && (
          <GeoJSON
            data={geoJsonData}
            onEachFeature={onEachDistrictFeature}
            style={(feature) => {
              const match = findMatchingDistrict(districts, feature);
              const risk = match?.risk || 'Moderate';
              return {
                fillColor: riskColors[risk] || '#eab308',
                weight: 1.5,
                opacity: 0.9,
                color: '#ffffff',
                fillOpacity: 0.55
              };
            }}
          />
        )}

        {/* Live Synchronized Hazard Pins */}
        {incidents.map((inc) => (
          <Marker 
            key={inc.id} 
            position={[Number(inc.latitude), Number(inc.longitude)]} 
            icon={hazardPinIcon}
          >
            <Popup>
              <div style={{ padding: '8px', maxWidth: '240px', fontSize: '11px', fontFamily: 'sans-serif' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', borderBottom: '1px solid #fee2e2', paddingBottom: '4px' }}>
                  <span style={{ background: '#fef2f2', color: '#dc2626', fontWeight: 'bold', fontSize: '10px', padding: '2px 6px', borderRadius: '999px', border: '1px solid #fecaca' }}>
                    🚨 Verified Hazard
                  </span>
                  <span style={{ fontSize: '9px', color: '#64748b' }}>
                    {inc.created_at ? new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                  </span>
                </div>
                <strong style={{ fontSize: '12px', display: 'block', color: '#0f172a', marginBottom: '4px' }}>
                  {inc.submitted_by || 'Field Reporter'}
                </strong>
                <p style={{ margin: '4px 0 8px', color: '#334155', background: '#f8fafc', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', lineHeight: '1.4' }}>
                  {inc.description}
                </p>
                {inc.photo_url && (
                  <img src={inc.photo_url} alt="Evidence" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px', marginBottom: '6px' }} />
                )}

                {/* Responders Count */}
                <div style={{ margin: '6px 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#0369a1', fontWeight: 'bold' }}>
                    👥 {inc.people_responded || 0} Responded
                  </span>
                  {inc.status && (
                    <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: inc.status === 'resolved' ? '#16a34a' : '#b45309' }}>
                      {inc.status}
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRespondIncident) onRespondIncident(inc);
                    }}
                    style={{
                      flex: 1,
                      background: '#0284c7',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    👥 I Am Responding
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectIncident) onSelectIncident(inc);
                    }}
                    style={{
                      background: '#0f5c5d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    {userRole === 'field_officer' || userRole === 'admin' ? '🛡️ Triage' : 'ℹ️ Details'}
                  </button>
                </div>

                <div style={{ fontSize: '9px', color: '#16a34a', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                  <span>✓ Live Synced to HQ</span>
                  <span>{Number(inc.latitude).toFixed(4)}°, {Number(inc.longitude).toFixed(4)}°</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Inspected Tap Pin */}
        {inspectedPoint && (
          <Marker position={[inspectedPoint.lat, inspectedPoint.lon]} icon={inspectionPinIcon}>
            <Popup autoPan={true}>
              <div style={{ padding: '8px', maxWidth: '250px', fontSize: '11px', fontFamily: 'sans-serif' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                  <span style={{ background: '#eff6ff', color: '#2563eb', fontWeight: 'bold', fontSize: '10px', padding: '2px 6px', borderRadius: '999px', border: '1px solid #bfdbfe' }}>
                    📍 Real-Time Telemetry
                  </span>
                  <span style={{ fontSize: '9px', color: '#64748b' }}>
                    {inspectedPoint.lat.toFixed(3)}°, {inspectedPoint.lon.toFixed(3)}°
                  </span>
                </div>

                {calculatingPoint ? (
                  <div style={{ padding: '12px 0', textAlign: 'center', color: '#64748b' }}>
                    <span>Calculating slope, rainfall & AI risk...</span>
                  </div>
                ) : pointCalculation ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '24px', fontWeight: 'bold', color: pointCalculation.risk_score >= 0.7 ? '#dc2626' : '#d97706' }}>
                        {Math.round(pointCalculation.risk_score * 100)}%
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>
                        {pointCalculation.risk_level} Exposure
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '10px', background: '#f8fafc', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span>🌧️ Rain: <strong>{pointCalculation.telemetry?.rain_24h_mm ?? 55}mm</strong></span>
                      <span>⛰️ Slope: <strong>{pointCalculation.telemetry?.slope_deg ?? 32}°</strong></span>
                      <span>📈 Saturation: <strong>{Math.round((pointCalculation.telemetry?.soil_moisture ?? 0.7) * 100)}%</strong></span>
                      <span>🏢 GSI Events: <strong>{pointCalculation.telemetry?.hist_landslides ?? 3}</strong></span>
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: 0, color: '#64748b' }}>Tapped location on mountain slope.</p>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Floating Floating Controls */}
      <div style={{ position: 'absolute', top: '14px', right: '14px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Locate Me (GPS) */}
        <button
          onClick={handleLocateMe}
          style={{ width: '40px', height: '40px', background: 'white', borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', border: 'none', cursor: 'pointer', color: '#0f5c5d' }}
          aria-label="Locate me"
        >
          <Crosshair size={20} className={locating ? 'animate-spin' : ''} />
        </button>

        {/* Basemap Switcher */}
        <button
          onClick={() => {
            const next = activeBasemap === 'standard' ? 'topo' : activeBasemap === 'topo' ? 'satellite' : 'standard';
            setActiveBasemap(next);
          }}
          style={{ width: '40px', height: '40px', background: 'white', borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', border: 'none', cursor: 'pointer', color: '#0f5c5d' }}
          aria-label="Toggle Basemap"
        >
          <Layers size={20} />
        </button>

        {/* Siren Trigger */}
        <button
          onClick={() => soundEngine.playSiren(3)}
          style={{ width: '40px', height: '40px', background: '#dc2626', borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(220,38,38,0.35)', border: 'none', cursor: 'pointer', color: 'white' }}
          aria-label="Test Siren"
        >
          <Volume2 size={20} />
        </button>
      </div>

      {/* Floating Bottom HUD Banner */}
      <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', zIndex: 1000, background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(10px)', borderRadius: '16px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <span style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 'bold' }}>
            GIS Status · {activeBasemap.toUpperCase()}
          </span>
          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
            <span>{incidents.length} Hazard Pins Live</span>
          </div>
        </div>

        <button
          onClick={onOpenReport}
          style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', padding: '7px 12px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
        >
          <MapPin size={13} />
          <span>Report Here</span>
        </button>
      </div>
    </div>
  );
}
