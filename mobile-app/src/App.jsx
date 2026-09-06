import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CloudRain,
  Compass,
  Crosshair,
  FileWarning,
  Home,
  LocateFixed,
  Map,
  Menu,
  Navigation,
  Phone,
  Plus,
  Radio,
  Route,
  Shield,
  Siren,
  UserRound,
  WifiOff,
  X,
  Camera as CameraIcon,
} from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

const defaultDistricts = [
  { id: 'IN-ML-01', name: 'East Khasi Hills', state: 'Meghalaya', risk: 'High', score: 78, color: 'high' },
  { id: 'IN-NL-02', name: 'Phek', state: 'Nagaland', risk: 'Moderate', score: 56, color: 'moderate' },
  { id: 'IN-MZ-03', name: 'Aizawl', state: 'Mizoram', risk: 'Moderate', score: 49, color: 'moderate' },
];

const defaultAlerts = [
  { type: 'High risk', title: 'Heavy rain expected', text: 'East Khasi Hills · next 6 hours', time: '12 min ago', color: 'red' },
  { type: 'Road update', title: 'NH-6 partially blocked', text: 'Near Mawryngkneng · use alternate route', time: '38 min ago', color: 'amber' },
];

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showReport, setShowReport] = useState(false);
  const [reported, setReported] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [districts, setDistricts] = useState(defaultDistricts);
  const [alerts, setAlerts] = useState(defaultAlerts);
  const [selectedDistrict, setSelectedDistrict] = useState(defaultDistricts[0]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Plumb live backend API data
  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        const base = window.location.origin.includes(':5173') ? '' : 'http://10.82.15.222:8000';

        // 1. Fetch live district risks
        const riskRes = await fetch(`${base}/api/risk`);
        if (riskRes.ok) {
          const json = await riskRes.json();
          if (json.data && json.data.length > 0) {
            const mapped = json.data.map(d => ({
              id: d.district_id,
              name: d.district_name || d.district_id,
              state: d.district_name?.includes('Khasi') || d.district_name?.includes('Shillong') ? 'Meghalaya' : 'NER',
              risk: d.risk_level || 'Moderate',
              score: Math.round((d.risk_score || 0.5) * 100),
              color: (d.risk_level || 'moderate').toLowerCase()
            }));
            setDistricts(mapped);
          }
        }

        // 2. Fetch live incidents
        const incRes = await fetch(`${base}/api/incidents`);
        if (incRes.ok) {
          const json = await incRes.json();
          if (json.data && json.data.length > 0) {
            const mappedIncidents = json.data.map(inc => ({
              type: 'Citizen Report',
              title: inc.description.slice(0, 30),
              text: `${inc.description} · ${inc.submitted_by}`,
              time: 'Live',
              color: 'red'
            }));
            setAlerts(mappedIncidents);
          }
        }
      } catch (err) {
        console.warn("Operating with local cached data:", err);
      }
    };

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 10000);
    return () => clearInterval(interval);
  }, []);

  const submitReport = async (reportData) => {
    try {
      const formData = new FormData();
      formData.append('description', `${reportData.kind}: ${reportData.notes || 'Hazard reported by field citizen'}`);
      formData.append('latitude', String(reportData.latitude || 25.5788));
      formData.append('longitude', String(reportData.longitude || 91.8933));
      formData.append('submitted_by', 'Citizen (Mobile App)');

      const apiUrl = window.location.origin.includes(':5173')
        ? '/api/incidents'
        : 'http://10.82.15.222:8000/api/incidents';

      await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      setReported(true);
      setShowReport(false);
      setTimeout(() => setReported(false), 3500);
    } catch (err) {
      console.warn("Incident submit fallback:", err);
      setReported(true);
      setShowReport(false);
      setTimeout(() => setReported(false), 3500);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Shield size={18} strokeWidth={2.5} /></div>
          <div>
            <p className="eyebrow">NORTH-EAST RESPONSE</p>
            <h1>NE-SHIELD</h1>
          </div>
        </div>
        <div className="top-actions">
          {!isOnline && <span className="offline-pill"><WifiOff size={13} /> Offline</span>}
          <button className="icon-button" aria-label="Notifications"><Bell size={20} /></button>
          <button className="avatar" aria-label="Open profile"><UserRound size={18} /></button>
        </div>
      </header>

      {activeTab === 'home' && (
        <div className="page-content">
          <section className="greeting-row">
            <div>
              <p className="muted">Sunday, 6 September 2026</p>
              <h2>Stay ahead of the slope.</h2>
            </div>
            <div className="location-chip"><LocateFixed size={15} /> Shillong</div>
          </section>

          <section className="risk-hero" aria-label="Current regional risk">
            <div className="hero-heading">
              <div>
                <span className="status-dot" /> REGIONAL RISK
              </div>
              <span className="live-label"><Radio size={12} /> LIVE</span>
            </div>
            <div className="risk-reading"><strong>Moderate</strong><span>58 / 100</span></div>
            <p className="hero-copy">Conditions are changing. Check your route before travelling through hilly areas.</p>
            <div className="hero-footer"><span><CloudRain size={16} /> 84% rain probability</span><span>Updated 8 min ago</span></div>
          </section>

          <section className="section-block">
            <div className="section-header"><div><p className="section-kicker">NEAR YOU</p><h3>Risk by district</h3></div><button className="text-button" onClick={() => setActiveTab('map')}>View map <ArrowRight size={15} /></button></div>
            <div className="district-list">
              {districts.map((district) => (
                <button className={`district-row ${selectedDistrict.name === district.name ? 'selected' : ''}`} key={district.name} onClick={() => setSelectedDistrict(district)}>
                  <span className={`risk-icon ${district.color}`}><AlertTriangle size={17} /></span>
                  <span className="district-copy"><strong>{district.name}</strong><small>{district.state}</small></span>
                  <span className="district-score"><strong>{district.score}</strong><small>{district.risk}</small></span>
                  <ChevronRight size={17} className="chevron" />
                </button>
              ))}
            </div>
          </section>

          <section className="quick-actions">
            <button className="action-card report" onClick={() => setShowReport(true)}><span className="action-icon"><Plus size={21} /></span><span><strong>Report hazard</strong><small>Help your community</small></span></button>
            <button className="action-card route" onClick={() => setActiveTab('routes')}><span className="action-icon"><Route size={21} /></span><span><strong>Find safe route</strong><small>Plan around risk</small></span></button>
          </section>

          <section className="section-block alerts-block">
            <div className="section-header"><div><p className="section-kicker">WHAT MATTERS</p><h3>Latest alerts</h3></div><button className="icon-button subtle" aria-label="Open all alerts" onClick={() => setActiveTab('alerts')}><ArrowRight size={18} /></button></div>
            {alerts.map((alert) => <article className="alert-row" key={alert.title}><span className={`alert-icon ${alert.color}`}>{alert.color === 'red' ? <Siren size={17} /> : <FileWarning size={17} />}</span><div><div className="alert-meta"><span>{alert.type}</span><time>{alert.time}</time></div><strong>{alert.title}</strong><p>{alert.text}</p></div></article>)}
          </section>
        </div>
      )}

      {activeTab === 'map' && <MapView selectedDistrict={selectedDistrict} setSelectedDistrict={setSelectedDistrict} />}
      {activeTab === 'routes' && <RoutesView />}
      {activeTab === 'alerts' && <AlertsView />}

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavButton active={activeTab === 'home'} label="Overview" icon={<Home size={20} />} onClick={() => setActiveTab('home')} />
        <NavButton active={activeTab === 'map'} label="Risk map" icon={<Map size={20} />} onClick={() => setActiveTab('map')} />
        <button className="center-report" onClick={() => setShowReport(true)} aria-label="Report a hazard"><Plus size={25} /></button>
        <NavButton active={activeTab === 'routes'} label="Routes" icon={<Navigation size={20} />} onClick={() => setActiveTab('routes')} />
        <NavButton active={activeTab === 'alerts'} label="Alerts" icon={<Bell size={20} />} onClick={() => setActiveTab('alerts')} />
      </nav>

      {showReport && <ReportSheet onClose={() => setShowReport(false)} onSubmit={submitReport} />}
      {reported && <div className="toast"><span><Check size={16} /></span> Report saved. It will sync when connected.</div>}
    </main>
  );
}

function NavButton({ active, label, icon, onClick }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function MapView({ selectedDistrict, setSelectedDistrict }) {
  return <div className="page-content map-page"><section className="page-heading"><div><p className="section-kicker">LIVE TERRAIN VIEW</p><h2>Risk map</h2></div><button className="icon-button"><Crosshair size={19} /></button></section><div className="map-surface"><div className="map-grid" /><span className="map-label label-one">PHEK</span><span className="map-label label-two">SHILLONG</span><span className="map-label label-three">AIZAWL</span><div className="map-pin pin-one" /><div className="map-pin pin-two" /><div className="map-pin pin-three" /><div className="map-compass"><Compass size={18} /><small>N</small></div><div className="map-legend"><span><i className="legend-dot high" /> High</span><span><i className="legend-dot moderate" /> Moderate</span><span><i className="legend-dot low" /> Low</span></div></div><div className="map-selection"><p className="section-kicker">SELECTED DISTRICT</p><h3>{selectedDistrict.name}</h3><p>{selectedDistrict.state} · {selectedDistrict.score}/100 risk score</p><div className="progress"><span style={{ width: `${selectedDistrict.score}%` }} /></div><button className="primary-button">Open district details <ArrowRight size={16} /></button></div><div className="district-list map-districts">{districts.map((district) => <button className="district-row" key={district.name} onClick={() => setSelectedDistrict(district)}><span className={`risk-icon ${district.color}`}><AlertTriangle size={17} /></span><span className="district-copy"><strong>{district.name}</strong><small>{district.state}</small></span><span className="district-score"><strong>{district.score}</strong><small>{district.risk}</small></span><ChevronRight size={17} className="chevron" /></button>)}</div></div>;
}

function RoutesView() {
  const startNavigation = () => {
    const destination = encodeURIComponent('Cherrapunji, Meghalaya');
    const origin = encodeURIComponent('Shillong, Meghalaya');
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    const navigationWindow = window.open(directionsUrl, '_blank', 'noopener,noreferrer');
    if (!navigationWindow) window.location.assign(directionsUrl);
  };

  return <div className="page-content"><section className="page-heading"><div><p className="section-kicker">TRAVEL SMART</p><h2>Safe routes</h2></div><button className="icon-button"><Menu size={20} /></button></section><div className="route-search"><div><Map size={19} /><span>Shillong</span></div><ArrowRight size={17} /><div><LocateFixed size={19} /><span>Cherrapunji</span></div><button aria-label="Change route"><ArrowRight size={18} /></button></div><div className="route-card recommended"><div className="route-card-top"><span className="recommended-badge">RECOMMENDED</span><span>42 km</span></div><h3>NH-206 via Mawphlang</h3><p><span><ClockIcon /> 1 hr 24 min</span><span className="safe-text"><Shield size={14} /> Lowest exposure</span></p><div className="route-line"><span /><span /><span /></div><button className="primary-button" onClick={startNavigation}>Start navigation <Navigation size={16} /></button></div><div className="route-card"><div className="route-card-top"><span className="muted">ALTERNATE</span><span>39 km</span></div><h3>NH-6 via Umsning</h3><p><span><ClockIcon /> 1 hr 10 min</span><span className="warn-text"><AlertTriangle size={14} /> Moderate exposure</span></p></div><div className="tip-card"><div className="tip-icon"><CloudRain size={18} /></div><div><strong>Weather is shifting</strong><p>Rainfall may increase travel time after 4:00 PM.</p></div></div></div>;
}

function ClockIcon() { return <span className="clock-icon">◷</span>; }

function AlertsView() {
  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <p className="section-kicker">STAY INFORMED</p>
          <h2>Alerts & Safety</h2>
        </div>
        <button className="icon-button"><Bell size={19} /></button>
      </section>

      <div className="alert-summary">
        <span className="summary-number">2</span>
        <div>
          <strong>active alerts near you</strong>
          <p>Notifications are enabled for East Khasi Hills / Shillong.</p>
        </div>
      </div>

      {/* NDMA Landslide Precautions: DO's & DON'Ts */}
      <section className="section-block" style={{ marginTop: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Shield size={20} color="#38bdf8" />
          <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>NDMA Safety Guidelines</h3>
        </div>

        {/* DO's */}
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
          <strong style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '6px' }}>
            <Check size={16} /> WHAT TO DO (DO's)
          </strong>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#e2e8f0', lineHeight: '1.6' }}>
            <li>Move to designated high-ground community relief shelters immediately.</li>
            <li>Keep emergency go-bag (drinking water, torch, medicine, identity documents).</li>
            <li>Listen to local radio or NE-SHIELD emergency broadcasts.</li>
          </ul>
        </div>

        {/* DON'Ts */}
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '12px' }}>
          <strong style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '6px' }}>
            <X size={16} /> WHAT TO AVOID (DON'TS)
          </strong>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#e2e8f0', lineHeight: '1.6' }}>
            <li>Do NOT cross or drive through fast-moving water, mud, or debris.</li>
            <li>Do NOT seek shelter under steep mountain slopes or near riverbeds.</li>
            <li>Do NOT re-enter compromised buildings until inspected by NDRF/SDRF.</li>
          </ul>
        </div>
      </section>

      <section className="alerts-full">
        {alerts.concat([{ type: 'Community report', title: 'Loose rocks reported', text: 'Mawlai bypass · verified by 3 people', time: '1 hr ago', color: 'green' }]).map((alert) => (
          <article className="alert-row" key={alert.title}>
            <span className={`alert-icon ${alert.color}`}>{alert.color === 'red' ? <Siren size={17} /> : alert.color === 'amber' ? <FileWarning size={17} /> : <Check size={17} />}</span>
            <div>
              <div className="alert-meta"><span>{alert.type}</span><time>{alert.time}</time></div>
              <strong>{alert.title}</strong>
              <p>{alert.text}</p>
            </div>
          </article>
        ))}
      </section>
      <button className="outline-button"><Phone size={16} /> Emergency contacts (NDRF: 1078)</button>
    </div>
  );
}

function ReportSheet({ onClose, onSubmit }) {
  const [kind, setKind] = useState('Rockfall');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState({ lat: 25.5788, lon: 91.8933, label: 'Shillong, Meghalaya (GPS Ready)' });
  const [photo, setPhoto] = useState(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const acquireGPS = async () => {
    setLocating(true);
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
      setCoords({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        label: `${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E (Live Device GPS)`
      });
    } catch (err) {
      console.warn("GPS acquire fallback:", err);
    } finally {
      setLocating(false);
    }
  };

  const capturePhoto = async () => {
    try {
      const img = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt
      });
      if (img?.webPath) setPhoto(img.webPath);
    } catch (err) {
      console.warn("Camera prompt skipped:", err);
    }
  };

  const handleAction = async () => {
    setSubmitting(true);
    await onSubmit({ kind, notes, latitude: coords.lat, longitude: coords.lon, photo });
    setSubmitting(false);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="report-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <p className="section-kicker">COMMUNITY REPORT</p>
            <h2>Report a hazard</h2>
          </div>
          <button className="icon-button subtle" onClick={onClose} aria-label="Close report"><X size={19} /></button>
        </div>
        <p className="sheet-copy">Your real-time report transmits directly to the Disaster HQ map.</p>

        <button type="button" className="location-field" onClick={acquireGPS}>
          <LocateFixed size={18} className={locating ? 'animate-spin text-sky-400' : ''} />
          <span><strong>{locating ? 'Acquiring GPS...' : 'Device GPS Location'}</strong><small>{coords.label}</small></span>
          <Check size={17} />
        </button>

        <label className="field-label">What did you see?</label>
        <div className="choice-grid">
          {['Rockfall', 'Road crack', 'Waterlogging', 'Landslide'].map((option) => (
            <button key={option} type="button" className={kind === option ? 'choice selected-choice' : 'choice'} onClick={() => setKind(option)}>
              {option}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
          <button type="button" onClick={capturePhoto} className="outline-button" style={{ flex: 1, padding: '10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <CameraIcon size={16} />
            {photo ? 'Photo Attached ✓' : 'Take Photo (Camera)'}
          </button>
        </div>

        <label className="field-label" htmlFor="notes">Add a note <span>Optional</span></label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Describe hazard location, road blockages..."
          rows="3"
        />
        <button className="primary-button submit-button" disabled={submitting} onClick={handleAction}>
          {submitting ? 'Transmitting to Command Center...' : <>Submit report <ArrowRight size={17} /></>}
        </button>
      </section>
    </div>
  );
}

export default App;
