import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  DownloadCloud, Wifi, WifiOff, MapPin, Navigation, Shield, HeartPulse,
  UtensilsCrossed, AlertTriangle, Check, Phone, Users, Clock, Send,
  ChevronRight, RefreshCw, X, Radio, Layers, LocateFixed
} from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { mobileApi } from '../services/api';
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
      <div style="position: relative; width: 34px; height: 34px;">
        <div style="position: absolute; inset: -3px; background: ${color}44; border-radius: 50%; animation: pulse 2s infinite;"></div>
        <div style="width: 32px; height: 32px; background: #0f172a; border: 2.5px solid ${color}; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;">
          <div style="transform: rotate(45deg); font-size: 15px;">${symbol}</div>
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34]
  });
};

const createSosIcon = () => L.divIcon({
  className: 'offline-sos-pin',
  html: `
    <div style="position: relative; width: 30px; height: 30px;">
      <div style="position: absolute; inset: -4px; background: rgba(239, 68, 68, 0.5); border-radius: 50%; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 26px; height: 26px; background: #dc2626; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.8); display: grid; place-items: center; color: white; font-weight: 900; font-size: 10px;">
        SOS
      </div>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15]
});

function MapViewController({ bounds, center }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [25, 25], maxZoom: 15 });
    } else if (center) {
      map.flyTo(center, 13, { duration: 1.0 });
    }
  }, [bounds, center, map]);
  return null;
}

export default function OfflineSectorModal({ isOpen, onClose, defaultLocalityId = 'loc-shillong' }) {
  const [localities, setLocalities] = useState([]);
  const [selectedLocalityId, setSelectedLocalityId] = useState(defaultLocalityId);
  const [offlinePack, setOfflinePack] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [activePathId, setActivePathId] = useState(null);
  const [gpsLocating, setGpsLocating] = useState(false);

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

  // Load localities and cached pack on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchLocalities = async () => {
      try {
        const res = await mobileApi.getLocalities();
        if (res.data) {
          setLocalities(res.data);
        }
      } catch (err) {
        console.warn('Failed to fetch localities, checking fallback:', err);
      }
    };
    fetchLocalities();

    // Check cached pack
    const cachedPack = localStorage.getItem(`neshield_offline_pack_${selectedLocalityId}`);
    if (cachedPack) {
      try {
        setOfflinePack(JSON.parse(cachedPack));
      } catch (e) {}
    } else {
      handleDownloadPack(selectedLocalityId, false);
    }

    loadReliefRequests();
  }, [isOpen, selectedLocalityId]);

  const loadReliefRequests = async () => {
    try {
      const res = await mobileApi.getReliefRequests();
      if (res.data) {
        setReliefRequests(res.data);
      }
    } catch (e) {
      const queued = JSON.parse(localStorage.getItem('neshield_offline_aid_queue') || '[]');
      setReliefRequests(queued);
    }
  };

  const handleDownloadPack = async (locId = selectedLocalityId, notify = true) => {
    setDownloading(true);
    soundEngine.playChime();
    try {
      const res = await mobileApi.getOfflinePack({ locality_id: locId });
      if (res.data) {
        const pack = res.data;
        setOfflinePack(pack);
        localStorage.setItem(`neshield_offline_pack_${locId}`, JSON.stringify(pack));
        localStorage.setItem('neshield_active_offline_pack', JSON.stringify(pack));
        if (notify) {
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 3500);
        }
      }
    } catch (err) {
      console.warn('Download offline pack failed, reading local cache:', err);
      const cached = localStorage.getItem(`neshield_offline_pack_${locId}`);
      if (cached) {
        setOfflinePack(JSON.parse(cached));
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleGpsLocate = async () => {
    setGpsLocating(true);
    soundEngine.playChime();
    try {
      let lat = 25.5788;
      let lon = 91.8933;

      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch (e) {
        if (navigator.geolocation) {
          await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (p) => {
                lat = p.coords.latitude;
                lon = p.coords.longitude;
                resolve();
              },
              () => resolve(),
              { timeout: 4000 }
            );
          });
        }
      }

      // Download nearest pack for this coordinate
      setDownloading(true);
      const res = await mobileApi.getOfflinePack({ lat, lon });
      if (res.data) {
        const pack = res.data;
        setOfflinePack(pack);
        setSelectedLocalityId(pack.locality.id);
        localStorage.setItem(`neshield_offline_pack_${pack.locality.id}`, JSON.stringify(pack));
        localStorage.setItem('neshield_active_offline_pack', JSON.stringify(pack));
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 3500);
      }
    } catch (err) {
      console.error('GPS auto-pack lookup failed:', err);
    } finally {
      setGpsLocating(false);
      setDownloading(false);
    }
  };

  const handleSubmitReliefRequest = async (e) => {
    e.preventDefault();
    if (!userName.trim()) return;

    setSubmittingAid(true);
    soundEngine.playChime();

    const currentLat = offlinePack?.user_location?.lat || 25.5788;
    const currentLon = offlinePack?.user_location?.lon || 91.8933;

    const payload = {
      user_name: userName.trim(),
      phone: userPhone.trim(),
      locality_id: selectedLocalityId,
      locality_name: offlinePack?.locality?.name || 'Local Sector',
      latitude: currentLat,
      longitude: currentLon,
      aid_type: aidType,
      people_count: Number(peopleCount) || 1,
      notes: notes.trim(),
    };

    try {
      if (isSimulatedOffline || !navigator.onLine) {
        throw new Error('Offline mode active');
      }

      const res = await mobileApi.submitReliefRequest(payload);
      const newReq = res.data || { ...payload, id: `SOS-${Date.now().toString(36).toUpperCase()}` };
      setReliefRequests(prev => [newReq, ...prev]);
      setAidSuccessMsg(`✓ Aid Request Dispatched: ${newReq.id}`);
    } catch (err) {
      // Offline Queue Fallback
      const queued = JSON.parse(localStorage.getItem('neshield_offline_aid_queue') || '[]');
      const offlineReq = {
        ...payload,
        id: `OFFLINE-${Date.now().toString(36).toUpperCase()}`,
        status: 'queued_offline',
        created_at: new Date().toISOString()
      };
      queued.push(offlineReq);
      localStorage.setItem('neshield_offline_aid_queue', JSON.stringify(queued));
      setReliefRequests(prev => [offlineReq, ...prev]);
      setAidSuccessMsg(`✓ Stored in Zero-Signal Queue: ${offlineReq.id}`);
    } finally {
      setSubmittingAid(false);
      setShowSosForm(false);
      setNotes('');
      setTimeout(() => setAidSuccessMsg(''), 5000);
    }
  };

  // Compute map center and bounds
  const mapCenter = offlinePack?.user_location
    ? [offlinePack.user_location.lat, offlinePack.user_location.lon]
    : [25.5788, 91.8933];

  const mapBounds = offlinePack?.bounding_box
    ? [
        [offlinePack.bounding_box.south, offlinePack.bounding_box.west],
        [offlinePack.bounding_box.north, offlinePack.bounding_box.east]
      ]
    : null;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f172a',
          color: '#ffffff',
          width: '100%',
          height: '94vh',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Handle & Header */}
        <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ width: '40px', height: '4px', background: '#334155', borderRadius: '2px', margin: '0 auto 8px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: '#f59e0b', color: '#0f172a', padding: '6px', borderRadius: '8px', display: 'grid', placeItems: 'center' }}>
                <DownloadCloud size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Offline Sector & Relief Hub</h3>
                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>3-Center Emergency Paths & Aid Queue</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Simulation Offline Toggle */}
              <button
                type="button"
                onClick={() => {
                  soundEngine.playChime();
                  setIsSimulatedOffline(v => !v);
                }}
                style={{
                  background: isSimulatedOffline ? '#ef4444' : '#1e293b',
                  color: 'white',
                  border: '1px solid #334155',
                  borderRadius: '20px',
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isSimulatedOffline ? <WifiOff size={12} /> : <Wifi size={12} />}
                <span>{isSimulatedOffline ? 'Offline' : 'Online'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                style={{
                  background: '#1e293b',
                  color: '#94a3b8',
                  border: 'none',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Locality Selector & Offline Download Bar */}
          <div style={{ background: '#1e293b', borderRadius: '14px', padding: '10px 12px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: 'bold' }}>
                Select Locality & Cache Sector Map
              </span>
              {offlinePack?.cached_at && (
                <span style={{ fontSize: '9px', background: '#064e3b', color: '#34d399', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                  ✓ Cached {new Date(offlinePack.cached_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={selectedLocalityId}
                onChange={(e) => {
                  setSelectedLocalityId(e.target.value);
                  handleDownloadPack(e.target.value, true);
                }}
                style={{
                  flex: 1,
                  background: '#0f172a',
                  color: '#ffffff',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: '600',
                  outline: 'none'
                }}
              >
                {localities.length > 0 ? (
                  localities.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.district}, {loc.state})
                    </option>
                  ))
                ) : (
                  <option value="loc-shillong">Shillong Central (East Khasi Hills, Meghalaya)</option>
                )}
              </select>

              <button
                type="button"
                onClick={handleGpsLocate}
                disabled={gpsLocating}
                style={{
                  background: '#0284c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}
                title="Detect GPS and Auto-Pack"
              >
                <LocateFixed size={14} className={gpsLocating ? 'animate-spin' : ''} />
                <span>GPS</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadPack(selectedLocalityId, true)}
                disabled={downloading}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}
              >
                <DownloadCloud size={14} className={downloading ? 'animate-bounce' : ''} />
                <span>{downloading ? 'Saving...' : 'Save Pack'}</span>
              </button>
            </div>

            {downloadSuccess && (
              <div style={{ marginTop: '8px', background: '#065f46', color: '#a7f3d0', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={14} />
                <span>Sector vector geometry & 3 relief corridors saved offline!</span>
              </div>
            )}
          </div>

          {/* Map Section */}
          <div style={{ position: 'relative', height: '240px', borderRadius: '16px', overflow: 'hidden', border: '1px solid #334155', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <MapViewController bounds={mapBounds} center={mapCenter} />

              {/* Base Tile Layer (or offline fallback) */}
              {!isSimulatedOffline && (
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap"
                />
              )}

              {/* User Current Locality Pin */}
              {offlinePack?.user_location && (
                <Marker
                  position={[offlinePack.user_location.lat, offlinePack.user_location.lon]}
                  icon={createUserIcon()}
                >
                  <Popup>
                    <div style={{ color: '#0f172a', fontSize: '12px', padding: '2px' }}>
                      <strong>Your Locality Sector</strong>
                      <p style={{ margin: '2px 0 0', fontSize: '11px' }}>{offlinePack.locality?.name || 'Current Position'}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* 3 Nearest Centres Markers */}
              {offlinePack?.nearest_centres?.map(c => (
                <Marker
                  key={c.id}
                  position={[c.latitude, c.longitude]}
                  icon={createCentreIcon(c.category, c.category === 'shelter' ? '#10b981' : c.category === 'medical' ? '#0284c7' : '#f59e0b')}
                >
                  <Popup>
                    <div style={{ color: '#0f172a', fontSize: '11px' }}>
                      <strong style={{ display: 'block', fontSize: '12px' }}>{c.name}</strong>
                      <span style={{ color: '#64748b' }}>{c.type} · Capacity: {c.capacity || 'N/A'}</span>
                      <div style={{ marginTop: '4px', fontWeight: 'bold', color: '#0f766e' }}>
                        📞 {c.contact}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Render 3 Distinct Paths */}
              {offlinePack?.paths?.map(p => {
                const isActive = activePathId === p.centre_id;
                return (
                  <Polyline
                    key={p.centre_id}
                    positions={p.coordinates}
                    pathOptions={{
                      color: p.color,
                      weight: isActive ? 6 : 4,
                      opacity: isActive ? 1.0 : 0.85,
                      dashArray: isActive ? '8, 8' : undefined
                    }}
                  />
                );
              })}

              {/* Render Active Relief Requests as SOS Markers */}
              {reliefRequests.map(r => (
                <Marker
                  key={r.id}
                  position={[r.latitude || 25.5788, r.longitude || 91.8933]}
                  icon={createSosIcon()}
                >
                  <Popup>
                    <div style={{ color: '#0f172a', fontSize: '11px' }}>
                      <strong style={{ color: '#dc2626' }}>🚨 SOS: {r.aid_type?.toUpperCase()}</strong>
                      <p style={{ margin: '2px 0' }}>{r.user_name} ({r.people_count} pax)</p>
                      <small style={{ color: '#64748b' }}>Status: {r.status}</small>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* In-Map Offline Overlay Badge */}
            <div style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 1000, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(4px)', padding: '4px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isSimulatedOffline ? '#ef4444' : '#10b981' }} />
              <span>{isSimulatedOffline ? 'Simulated Offline Cache' : 'Zero-Signal Vector Layer'}</span>
            </div>

            <div style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 1000, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(4px)', padding: '4px 8px', borderRadius: '8px', fontSize: '10px', color: '#cbd5e1' }}>
              3 Paths Rendered
            </div>
          </div>

          {/* 3 Nearest Centres Cards with Tap-to-Highlight */}
          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
              3 Nearest Sector Relief Hubs & Routes
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {offlinePack?.nearest_centres?.map(c => {
                const matchedPath = offlinePack?.paths?.find(p => p.centre_id === c.id);
                const isActive = activePathId === c.id;
                const badgeColor = c.category === 'shelter' ? '#10b981' : c.category === 'medical' ? '#0284c7' : '#f59e0b';

                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      soundEngine.playChime();
                      setActivePathId(isActive ? null : c.id);
                    }}
                    style={{
                      background: isActive ? '#1e3a8a' : '#1e293b',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      border: `1px solid ${isActive ? '#3b82f6' : '#334155'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ background: `${badgeColor}22`, border: `1.5px solid ${badgeColor}`, color: badgeColor, width: '30px', height: '30px', borderRadius: '8px', display: 'grid', placeItems: 'center', fontSize: '13px' }}>
                        {c.category === 'shelter' ? '🏠' : c.category === 'medical' ? '🏥' : '🍲'}
                      </div>
                      <div>
                        <strong style={{ fontSize: '12px', display: 'block' }}>{c.name}</strong>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {c.type} · Cap: {c.capacity || 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      {matchedPath && (
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: matchedPath.color }}>
                          {matchedPath.distance_km} km · {matchedPath.duration_min} min
                        </div>
                      )}
                      <span style={{ fontSize: '10px', color: '#38bdf8' }}>📞 {c.contact}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aid Request (Food / Water / Meds) SOS Action */}
          <div style={{ background: '#1e293b', borderRadius: '14px', padding: '12px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UtensilsCrossed size={16} color="#f59e0b" />
                <strong style={{ fontSize: '13px' }}>Request Crisis Supplies (Food / Water)</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playChime();
                  setShowSosForm(v => !v);
                }}
                style={{
                  background: showSosForm ? '#334155' : '#d97706',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {showSosForm ? 'Cancel' : '+ New SOS Request'}
              </button>
            </div>

            {aidSuccessMsg && (
              <div style={{ background: '#065f46', color: '#a7f3d0', padding: '8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>
                {aidSuccessMsg}
              </div>
            )}

            {showSosForm ? (
              <form onSubmit={handleSubmitReliefRequest} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                  {[
                    { id: 'food', label: '🍞 Food' },
                    { id: 'water', label: '💧 Water' },
                    { id: 'medical', label: '💊 Meds' },
                    { id: 'evac', label: '🚨 Rescue' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAidType(opt.id)}
                      style={{
                        background: aidType === opt.id ? '#f59e0b' : '#0f172a',
                        color: aidType === opt.id ? '#0f172a' : '#cbd5e1',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '6px 2px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Your Name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    required
                    style={{
                      flex: 1,
                      background: '#0f172a',
                      color: 'white',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      fontSize: '11px'
                    }}
                  />
                  <input
                    type="tel"
                    placeholder="Contact Number"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    style={{
                      flex: 1,
                      background: '#0f172a',
                      color: 'white',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      fontSize: '11px'
                    }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="50"
                    placeholder="People"
                    value={peopleCount}
                    onChange={(e) => setPeopleCount(e.target.value)}
                    style={{
                      width: '60px',
                      background: '#0f172a',
                      color: 'white',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      fontSize: '11px'
                    }}
                  />
                </div>

                <input
                  type="text"
                  placeholder="Notes (e.g., 2 infants, no drinking water for 12 hours)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    background: '#0f172a',
                    color: 'white',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    fontSize: '11px'
                  }}
                />

                <button
                  type="submit"
                  disabled={submittingAid}
                  style={{
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Send size={14} />
                  <span>{submittingAid ? 'Transmitting...' : 'Dispatch SOS Aid Request'}</span>
                </button>
              </form>
            ) : (
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                In zero-connectivity zones, aid requests are safely queued in device storage and automatically transmitted to NDRF / SDRF upon reconnecting.
              </p>
            )}
          </div>

          {/* Offline Safety Directives */}
          {offlinePack?.safety_instructions && (
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '10px 12px', border: '1px solid #334155' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                Critical Hill Directives
              </span>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
                {offlinePack.safety_instructions.map((inst, i) => (
                  <li key={i}>{inst}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
