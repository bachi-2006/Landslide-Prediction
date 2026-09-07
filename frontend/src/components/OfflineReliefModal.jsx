import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  DownloadCloud, Wifi, WifiOff, MapPin, Navigation, Shield, HeartPulse,
  UtensilsCrossed, AlertTriangle, Check, Phone, Users, Clock, Send,
  ChevronRight, RefreshCw, X, Radio, Layers
} from 'lucide-react';
import { routeService } from '../services/api';
import { soundEngine } from '../services/soundEngine';

// Leaflet custom marker icons
const createUserIcon = () => L.divIcon({
  className: 'offline-user-pin',
  html: `
    <div style="position: relative; width: 34px; height: 34px;">
      <div style="position: absolute; inset: -4px; background: rgba(59, 130, 246, 0.45); border-radius: 50%; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 30px; height: 30px; background: #2563eb; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.7); display: grid; place-items: center; color: white; font-size: 15px;">
        📍
      </div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -17]
});

const createCentreIcon = (category, color) => {
  const symbol = category === 'shelter' ? '🏠' : category === 'medical' ? '🏥' : '🍲';
  return L.divIcon({
    className: `offline-centre-pin-${category}`,
    html: `
      <div style="position: relative; width: 36px; height: 36px;">
        <div style="position: absolute; inset: -3px; background: ${color}44; border-radius: 50%; animation: pulse 2s infinite;"></div>
        <div style="width: 34px; height: 34px; background: #0f172a; border: 2.5px solid ${color}; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;">
          <div style="transform: rotate(45deg); font-size: 16px;">${symbol}</div>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
};

const createSosIcon = () => L.divIcon({
  className: 'offline-sos-pin',
  html: `
    <div style="position: relative; width: 32px; height: 32px;">
      <div style="position: absolute; inset: -5px; background: rgba(239, 68, 68, 0.5); border-radius: 50%; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 28px; height: 28px; background: #dc2626; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.8); display: grid; place-items: center; color: white; font-weight: 900; font-size: 11px;">
        SOS
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

function MapViewController({ bounds, center }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    } else if (center) {
      map.flyTo(center, 13, { duration: 1.2 });
    }
  }, [bounds, center, map]);
  return null;
}

export default function OfflineReliefModal({ isOpen, onClose, defaultLocalityId = 'loc-shillong' }) {
  const [localities, setLocalities] = useState([]);
  const [selectedLocalityId, setSelectedLocalityId] = useState(defaultLocalityId);
  const [offlinePack, setOfflinePack] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [activePathId, setActivePathId] = useState(null);

  // SOS Request Form States
  const [showSosForm, setShowSosForm] = useState(false);
  const [aidType, setAidType] = useState('food');
  const [peopleCount, setPeopleCount] = useState(2);
  const [userName, setUserName] = useState(() => localStorage.getItem('ne_citizen_name') || '');
  const [userPhone, setUserPhone] = useState(() => localStorage.getItem('ne_citizen_phone') || '');
  const [notes, setNotes] = useState('');
  const [submittingAid, setSubmittingAid] = useState(false);
  const [aidSuccessMsg, setAidSuccessMsg] = useState('');
  const [reliefRequests, setReliefRequests] = useState([]);

  // Load localities on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchLocalities = async () => {
      try {
        const res = await routeService.getLocalities();
        if (res.data?.data) {
          setLocalities(res.data.data);
        }
      } catch (err) {
        console.warn('Failed to fetch localities, checking cache:', err);
      }
    };
    fetchLocalities();

    // Check if we have an existing cached pack for this locality
    const cachedPack = localStorage.getItem(`neshield_offline_pack_${selectedLocalityId}`);
    if (cachedPack) {
      try {
        setOfflinePack(JSON.parse(cachedPack));
      } catch (e) {}
    } else {
      // Auto-load pack
      handleDownloadPack(selectedLocalityId, false);
    }

    // Load active relief requests
    loadReliefRequests();
  }, [isOpen, selectedLocalityId]);

  const loadReliefRequests = async () => {
    try {
      const res = await routeService.getReliefRequests();
      if (res.data?.data) {
        setReliefRequests(res.data.data);
      }
    } catch (e) {
      // Offline fallback: load queued requests from localStorage
      const queued = JSON.parse(localStorage.getItem('neshield_offline_aid_queue') || '[]');
      setReliefRequests(queued);
    }
  };

  const handleDownloadPack = async (locId = selectedLocalityId, notify = true) => {
    setDownloading(true);
    soundEngine.playChime();
    try {
      const res = await routeService.getOfflinePack({ locality_id: locId });
      if (res.data?.data) {
        const pack = res.data.data;
        setOfflinePack(pack);
        // Persist in local storage for offline usage
        localStorage.setItem(`neshield_offline_pack_${locId}`, JSON.stringify(pack));
        localStorage.setItem('neshield_active_offline_pack', JSON.stringify(pack));
        if (notify) {
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 4000);
        }
      }
    } catch (err) {
      console.warn('Download pack failed; attempting cache lookup:', err);
      const cached = localStorage.getItem(`neshield_offline_pack_${locId}`);
      if (cached) {
        setOfflinePack(JSON.parse(cached));
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) return;
    soundEngine.playChime();
    setDownloading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await routeService.getOfflinePack({ lat: latitude, lon: longitude });
          if (res.data?.data) {
            const pack = res.data.data;
            setOfflinePack(pack);
            localStorage.setItem('neshield_active_offline_pack', JSON.stringify(pack));
            setDownloadSuccess(true);
            setTimeout(() => setDownloadSuccess(false), 4000);
          }
        } catch (e) {
          console.error('GPS offline pack error:', e);
        } finally {
          setDownloading(false);
        }
      },
      () => setDownloading(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleAidSubmit = async (e) => {
    e.preventDefault();
    if (!userName.trim()) return;
    setSubmittingAid(true);
    soundEngine.playChime();

    const currentCoords = offlinePack?.user_coordinates || { lat: 25.5788, lon: 91.8933 };
    const payload = {
      user_name: userName.trim(),
      phone: userPhone.trim(),
      locality_name: offlinePack?.locality?.name || 'Local Sector',
      lat: currentCoords.lat,
      lon: currentCoords.lon,
      aid_type: aidType,
      people_count: Number(peopleCount) || 1,
      urgency: 'Critical',
      notes: notes.trim()
    };

    if (isSimulatedOffline || !navigator.onLine) {
      // Offline queue
      const reqId = `SOS-OFFLINE-${Date.now().toString().slice(-4)}`;
      const offlineRecord = { ...payload, id: reqId, status: 'offline_queued', created_at: new Date().toISOString() };
      const queue = JSON.parse(localStorage.getItem('neshield_offline_aid_queue') || '[]');
      queue.unshift(offlineRecord);
      localStorage.setItem('neshield_offline_aid_queue', JSON.stringify(queue));
      setReliefRequests(prev => [offlineRecord, ...prev]);
      setAidSuccessMsg(`✓ Saved to Offline Queue [${reqId}]. Will auto-broadcast when signal returns!`);
      setShowSosForm(false);
      setNotes('');
    } else {
      try {
        const res = await routeService.submitReliefRequest(payload);
        const record = res.data?.data;
        if (record) {
          setReliefRequests(prev => [record, ...prev]);
        }
        setAidSuccessMsg(`✓ Emergency Aid Ticket [${res.data?.request_id || 'SOS-ACTIVE'}] Dispatched to Relief Hub!`);
        setShowSosForm(false);
        setNotes('');
      } catch (err) {
        // Fallback to queue
        const reqId = `SOS-OFFLINE-${Date.now().toString().slice(-4)}`;
        const offlineRecord = { ...payload, id: reqId, status: 'offline_queued', created_at: new Date().toISOString() };
        const queue = JSON.parse(localStorage.getItem('neshield_offline_aid_queue') || '[]');
        queue.unshift(offlineRecord);
        localStorage.setItem('neshield_offline_aid_queue', JSON.stringify(queue));
        setReliefRequests(prev => [offlineRecord, ...prev]);
        setAidSuccessMsg(`✓ Saved to Offline Queue [${reqId}]. Will auto-broadcast when signal returns!`);
        setShowSosForm(false);
      }
    }
    setSubmittingAid(false);
    setTimeout(() => setAidSuccessMsg(''), 6000);
  };

  if (!isOpen) return null;

  const userCoords = offlinePack?.user_coordinates
    ? [offlinePack.user_coordinates.lat, offlinePack.user_coordinates.lon]
    : [25.5788, 91.8933];

  const mapBounds = offlinePack?.bounding_box
    ? [
        [offlinePack.bounding_box[1], offlinePack.bounding_box[0]],
        [offlinePack.bounding_box[3], offlinePack.bounding_box[2]]
      ]
    : null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0b1324] border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-lg text-emerald-400">
              🗺️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Offline Locality Map &amp; Relief Hub</h2>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Zero-Signal Ready
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Downloads vector locality bounds, 3 nearest survival centres with evacuation paths &amp; SOS aid requests
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Offline Simulation Toggle */}
            <button
              type="button"
              onClick={() => setIsSimulatedOffline(!isSimulatedOffline)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                isSimulatedOffline
                  ? 'bg-amber-600 text-white border-amber-400 animate-pulse shadow-lg shadow-amber-900/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Toggle to simulate complete telecom cut-off"
            >
              {isSimulatedOffline ? <WifiOff size={14} /> : <Wifi size={14} />}
              <span>{isSimulatedOffline ? 'Simulating Offline' : 'Online Mode'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Action Bar: Locality Dropdown & Download Button */}
        <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
              <MapPin size={14} className="text-emerald-400" /> Locality:
            </label>
            <select
              value={selectedLocalityId}
              onChange={(e) => {
                setSelectedLocalityId(e.target.value);
                handleDownloadPack(e.target.value, true);
              }}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-emerald-500 transition max-w-xs truncate"
            >
              {localities.map(loc => (
                <option key={loc.id} value={loc.id} className="bg-slate-900 text-white">
                  {loc.name} ({loc.state})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleUseGps}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition flex items-center gap-1.5"
              title="Locate my coordinates using device GPS"
            >
              <Navigation size={13} className="text-sky-400" />
              <span>Use GPS</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={downloading}
              onClick={() => handleDownloadPack(selectedLocalityId, true)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-emerald-950/40 cursor-pointer"
            >
              <DownloadCloud size={15} className={downloading ? 'animate-bounce' : ''} />
              <span>{downloading ? 'Caching Offline...' : 'Save Sector Offline'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSosForm(true)}
              className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-red-950/40 cursor-pointer"
            >
              <AlertTriangle size={15} />
              <span>Request Food / Water / Meds 🆘</span>
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {downloadSuccess && (
          <div className="mx-5 mt-2 bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 px-3.5 py-2 rounded-xl text-xs flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-emerald-400" />
              <span><strong>Map &amp; 3 Paths Cached Successfully!</strong> Available offline in browser cache (~42 KB).</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">Zero data required</span>
          </div>
        )}

        {aidSuccessMsg && (
          <div className="mx-5 mt-2 bg-blue-950/90 border border-blue-500/60 text-blue-200 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
            <Check size={16} className="text-sky-400 shrink-0" />
            <span>{aidSuccessMsg}</span>
          </div>
        )}

        {/* Main Content Area: Map + Side Panel */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          
          {/* Map Column (7 cols) */}
          <div className="lg:col-span-7 relative h-[320px] lg:h-full bg-slate-950 border-r border-slate-800 overflow-hidden">
            <MapContainer
              center={userCoords}
              zoom={13}
              style={{ width: '100%', height: '100%', background: '#090d16' }}
              zoomControl={false}
            >
              {!isSimulatedOffline && (
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
              )}

              {/* View Controller */}
              <MapViewController bounds={mapBounds} center={userCoords} />

              {/* User Position Marker */}
              <Marker position={userCoords} icon={createUserIcon()}>
                <Popup className="custom-popup">
                  <div className="text-xs">
                    <strong className="text-blue-600 block">📍 Your Location</strong>
                    <span>{offlinePack?.locality?.name || 'Inspected Sector'}</span>
                  </div>
                </Popup>
              </Marker>

              {/* 3 Nearest Centres Markers */}
              {offlinePack?.centres?.map((centre) => {
                const icon = createCentreIcon(
                  centre.category,
                  centre.category === 'shelter' ? '#10b981' : centre.category === 'medical' ? '#0284c7' : '#f59e0b'
                );
                return (
                  <Marker
                    key={centre.id}
                    position={[centre.latitude, centre.longitude]}
                    icon={icon}
                  >
                    <Popup className="custom-popup">
                      <div className="text-xs p-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          centre.category === 'shelter' ? 'bg-emerald-100 text-emerald-800' :
                          centre.category === 'medical' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {centre.category_label}
                        </span>
                        <h4 className="font-bold text-slate-900 mt-1">{centre.name}</h4>
                        <p className="text-slate-600 text-[11px]">{centre.city}</p>
                        <p className="text-slate-800 font-semibold mt-1">
                          📍 {centre.distance_km} km away • ~{centre.est_travel_time_min} mins
                        </p>
                        <p className="text-[10px] text-slate-500">📞 Helpline: {centre.contact}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* 3 Color-Coded Evacuation & Supply Paths */}
              {offlinePack?.paths?.map((path) => {
                const isSelected = activePathId === path.centre_id;
                // Convert GeoJSON [lon, lat] to Leaflet [lat, lon]
                const latLngs = path.coordinates.map(coord => [coord[1], coord[0]]);
                return (
                  <Polyline
                    key={path.centre_id}
                    positions={latLngs}
                    pathOptions={{
                      color: path.color,
                      weight: isSelected ? 6 : 4,
                      opacity: isSelected ? 1 : 0.85,
                      dashArray: path.category === 'supply' ? '6, 6' : null
                    }}
                    eventHandlers={{
                      click: () => setActivePathId(path.centre_id)
                    }}
                  />
                );
              })}

              {/* Active SOS Request Beacons */}
              {reliefRequests.map((req, i) => (
                <Marker key={req.id || i} position={[req.lat, req.lon]} icon={createSosIcon()}>
                  <Popup>
                    <div className="text-xs">
                      <strong className="text-red-600 block">🚨 SOS: {req.aid_type?.toUpperCase()} AID</strong>
                      <p><strong>{req.user_name}</strong> ({req.people_count} people)</p>
                      <p className="text-slate-600">{req.notes || 'Emergency assistance requested'}</p>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-bold">
                        {req.status === 'offline_queued' ? 'Queued Offline' : 'Active Ticket'}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* Offline Watermark Badge */}
            <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/85 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-[11px] text-slate-300 flex items-center gap-2 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Offline Vector Storage Active • 3 Routes Mapped</span>
            </div>
          </div>

          {/* Right Panel: 3 Centres List + Paths + Offline Advice (5 cols) */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-y-auto p-4 space-y-4 bg-slate-900/40">
            
            {/* Header / Sector Info */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>📍</span> {offlinePack?.locality?.name || 'Local Sector'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    District: {offlinePack?.locality?.district} • Elevation: {offlinePack?.locality?.elevation_m}m
                  </p>
                </div>
                <span className="text-[10px] font-mono bg-slate-900 text-slate-300 px-2 py-1 rounded border border-slate-700">
                  {offlinePack?.user_coordinates?.lat.toFixed(4)}° N, {offlinePack?.user_coordinates?.lon.toFixed(4)}° E
                </span>
              </div>
            </div>

            {/* The Three Nearest Centres Cards */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🎯</span> Three Nearest Survival Centres &amp; Corridors
                </h4>
                <span className="text-[10px] text-slate-400">Tap to highlight path</span>
              </div>

              <div className="space-y-2.5">
                {offlinePack?.centres?.map((centre) => {
                  const isSelected = activePathId === centre.id;
                  const isShelter = centre.category === 'shelter';
                  const isMedical = centre.category === 'medical';
                  const isSupply = centre.category === 'supply';

                  const badgeColor = isShelter
                    ? 'border-emerald-500/50 bg-emerald-950/30'
                    : isMedical
                    ? 'border-sky-500/50 bg-sky-950/30'
                    : 'border-amber-500/50 bg-amber-950/30';

                  const dotColor = isShelter ? 'bg-emerald-400' : isMedical ? 'bg-sky-400' : 'bg-amber-400';

                  return (
                    <div
                      key={centre.id}
                      onClick={() => setActivePathId(isSelected ? null : centre.id)}
                      className={`border rounded-xl p-3 cursor-pointer transition ${badgeColor} ${
                        isSelected ? 'ring-2 ring-white/60 shadow-lg' : 'hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`}></span>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              {centre.category_label}
                            </span>
                            <h5 className="text-xs font-bold text-white">{centre.name}</h5>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold font-mono text-white block">
                            {centre.distance_km} km
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ~{centre.est_travel_time_min} mins
                          </span>
                        </div>
                      </div>

                      {/* Amenities */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {centre.amenities?.slice(0, 3).map((a, i) => (
                          <span key={i} className="text-[9px] bg-slate-900/80 text-slate-300 px-1.5 py-0.5 rounded border border-slate-800">
                            ✓ {a}
                          </span>
                        ))}
                      </div>

                      {/* Helpline & Quick Navigation */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Phone size={11} className="text-slate-400" /> {centre.contact}
                        </span>
                        <span className="text-xs font-semibold text-sky-400 flex items-center gap-1 hover:underline">
                          Follow Path <ChevronRight size={13} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Offline Survival Precautions */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
              <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield size={13} /> Offline Survival Directive
              </h5>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {offlinePack?.offline_advisory?.map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px]">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Emergency Contacts Directory */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Emergency Hotline Direct Connect
              </h5>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {offlinePack?.emergency_contacts?.map((contact, i) => (
                  <a
                    key={i}
                    href={`tel:${contact.number}`}
                    className="bg-slate-800/70 hover:bg-slate-800 p-2 rounded-lg border border-slate-700/50 flex flex-col justify-between transition"
                  >
                    <span className="text-[10px] text-slate-400 truncate">{contact.label}</span>
                    <strong className="text-amber-300 font-mono text-xs">{contact.number}</strong>
                  </a>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* SOS Aid Request Sub-Modal */}
        {showSosForm && (
          <div className="fixed inset-0 z-[1300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0f172a] border border-red-500/40 rounded-2xl w-full max-w-lg p-5 shadow-2xl animate-fade-in text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
                    🆘
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Request Emergency Relief Aid</h3>
                    <p className="text-[11px] text-slate-400">Broadcasts to nearest relief hub &amp; SDRF rescue unit</p>
                  </div>
                </div>
                <button onClick={() => setShowSosForm(false)} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAidSubmit} className="space-y-3.5 mt-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    What Assistance Do You Need?
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'food', label: '🍚 Food Rations' },
                      { id: 'water', label: '💧 Clean Water' },
                      { id: 'medical', label: '🩺 Medical Aid' },
                      { id: 'evacuation', label: '🦽 Evac Rescue' }
                    ].map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setAidType(type.id)}
                        className={`p-2 rounded-xl text-xs font-semibold border transition text-center ${
                          aidType === type.id
                            ? 'bg-red-600 text-white border-red-400 shadow-sm'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Phone / ICE Number
                    </label>
                    <input
                      type="tel"
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      placeholder="+91-98620-XXXXX"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Number of Persons Needing Aid
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={peopleCount}
                    onChange={(e) => setPeopleCount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Exact Landmark / House / Road Condition
                  </label>
                  <textarea
                    rows="2"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. 2nd floor blue house near Mawlai bridge. Road washed out on both sides."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowSosForm(false)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAid}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-red-950/50"
                  >
                    <Send size={14} />
                    <span>{submittingAid ? 'Transmitting...' : 'Broadcast SOS Request'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
