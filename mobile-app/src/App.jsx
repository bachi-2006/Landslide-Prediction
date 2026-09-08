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
  RefreshCw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Share2,
  DownloadCloud
} from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

import { mobileApi, BUNDLED_NER_DISTRICTS, BUNDLED_INCIDENTS, BUNDLED_ROAD_CORRIDORS } from './services/api';
import { soundEngine } from './services/soundEngine';
import { notificationService } from './services/notifications';
import { subscribeToMapUpdates } from './services/supabase';

import MobileMapView from './components/MobileMapView';
import DistrictDetailSheet from './components/DistrictDetailSheet';
import NotificationCenterModal from './components/NotificationCenterModal';
import ProfileModal from './components/ProfileModal';
import EmergencyAlertBanner from './components/EmergencyAlertBanner';
import EvacuationModal from './components/EvacuationModal';
import OfficerIncidentModal from './components/OfficerIncidentModal';
import OfflineSectorModal from './components/OfflineSectorModal';

const defaultDistricts = BUNDLED_NER_DISTRICTS.map(d => ({
  id: d.district_id,
  name: d.district_name,
  state: d.state || 'NER',
  risk: d.risk_level,
  score: Math.round(d.risk_score * 100),
  color: d.risk_level.toLowerCase()
}));

const defaultAlerts = BUNDLED_INCIDENTS.map((inc, i) => ({
  id: inc.id || String(i),
  type: inc.status === 'assigned' || inc.status === 'in_progress' ? 'Assigned Field Mission' : 'Citizen Hazard',
  title: inc.description.slice(0, 36),
  text: `${inc.description} · ${inc.submitted_by || 'Field Reporter'}`,
  time: 'Active',
  color: inc.severity === 'Critical' || inc.severity === 'High' ? 'red' : 'amber',
  latitude: inc.latitude,
  longitude: inc.longitude,
  assigned_officer: inc.assigned_officer,
  officer_unit: inc.officer_unit,
  status: inc.status
}));

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showReport, setShowReport] = useState(false);
  const [reportToast, setReportToast] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Modals & Persona
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showEvacuation, setShowEvacuation] = useState(false);
  const [showOfflineSector, setShowOfflineSector] = useState(false);
  const [activeOfficerIncident, setActiveOfficerIncident] = useState(null);
  const [userRole, setUserRole] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('neshield_user_role')) || 'citizen';
  });
  const [inspectingDistrict, setInspectingDistrict] = useState(null);
  const [activeEmergencyAlert, setActiveEmergencyAlert] = useState(null);
  const [reportInitialCoords, setReportInitialCoords] = useState(null);

  // Live Database States (Pre-populated with rich bundled data so app is never blank)
  const [districts, setDistricts] = useState(defaultDistricts);
  const [alerts, setAlerts] = useState(defaultAlerts);
  const [rawIncidents, setRawIncidents] = useState(BUNDLED_INCIDENTS);
  const [selectedDistrict, setSelectedDistrict] = useState(defaultDistricts[0]);
  const [roadCorridors, setRoadCorridors] = useState(BUNDLED_ROAD_CORRIDORS);
  const [refreshingHome, setRefreshingHome] = useState(false);
  const [userLocationName, setUserLocationName] = useState('Shillong, Meghalaya');
  const [sirenSounding, setSirenSounding] = useState(false);

  const handleSirenToggle = async (activate) => {
    setSirenSounding(activate);
    if (activate) {
      soundEngine.playSiren(6);
    } else {
      soundEngine.stopSiren();
    }
    try {
      const res = await mobileApi.triggerHardware(activate, 'Critical', selectedDistrict?.id || 'IN-ML-01');
      if (activate) {
        if (res?.local_esp) {
          setReportToast({ success: true, message: '🚨 Local ESP32 beacon buzzer (GPIO 4) activated!' });
        } else {
          setReportToast({ success: true, message: '🚨 Siren broadcast triggered across network!' });
        }
      } else {
        setReportToast({ success: true, message: '⏹️ Siren silenced across beacon & phone.' });
      }
      setTimeout(() => setReportToast(null), 4000);
    } catch (e) {
      console.warn('Hardware siren toggle note:', e);
    }
  };

  // Network listeners & auto-sync offline aid queue
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // Auto-sync queued offline relief requests
      const queued = JSON.parse(localStorage.getItem('neshield_offline_aid_queue') || '[]');
      if (queued.length > 0) {
        Promise.all(queued.map(req => mobileApi.submitReliefRequest(req).catch(() => null)))
          .then(() => {
            localStorage.removeItem('neshield_offline_aid_queue');
            setReportToast({ success: true, message: `${queued.length} offline aid request(s) auto-synced!` });
            setTimeout(() => setReportToast(null), 4000);
          });
      }
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Subscribe to emergency broadcasts & push notifications
  useEffect(() => {
    const unsub = notificationService.subscribe((alertItem) => {
      setActiveEmergencyAlert(alertItem);
    });
    return unsub;
  }, []);

  // Check if user has chosen persona/role; if not, open setup modal on launch
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('neshield_user_role')) {
      setShowProfile(true);
    }
  }, []);

  // Fetch live backend data from database
  const fetchLiveData = async () => {
    try {
      // 1. Live district risks
      const riskRes = await mobileApi.getRisks();
      if (riskRes.data && riskRes.data.length > 0) {
        const mapped = riskRes.data.map(d => {
          const score = typeof d.risk_score === 'number' ? Math.round(d.risk_score * 100) : 60;
          const level = d.risk_level || (score >= 75 ? 'Critical' : score >= 55 ? 'High' : score >= 35 ? 'Moderate' : 'Low');
          const dName = d.district_name || d.district_id || 'District';
          const inferState = d.state || (
            dName.includes('Khasi') || dName.includes('Shillong') || dName.includes('Bhoi') || dName.includes('Jaintia') ? 'Meghalaya' :
            dName.includes('Kohima') || dName.includes('Phek') || dName.includes('Mokokchung') ? 'Nagaland' :
            dName.includes('Aizawl') || dName.includes('Lunglei') || dName.includes('Champhai') ? 'Mizoram' :
            dName.includes('Sikkim') || dName.includes('Gangtok') || dName.includes('Namchi') ? 'Sikkim' :
            dName.includes('Tawang') || dName.includes('Kameng') || dName.includes('Pare') ? 'Arunachal Pradesh' :
            dName.includes('Hasao') || dName.includes('Kamrup') || dName.includes('Guwahati') ? 'Assam' : 'NER'
          );
          return {
            id: d.district_id,
            name: dName,
            state: inferState,
            risk: level,
            score,
            color: level.toLowerCase()
          };
        });
        setDistricts(mapped);
        if (!selectedDistrict) setSelectedDistrict(mapped[0]);
      }

      // 2. Live crowd-sourced field incidents & official broadcast alerts
      const [incRes, alertRes] = await Promise.all([
        mobileApi.getIncidents().catch(() => ({ data: [] })),
        mobileApi.getBroadcastAlerts().catch(() => ({ data: [] }))
      ]);

      const mergedAlerts = [];

      // Add official government broadcast alerts first
      if (alertRes?.data && alertRes.data.length > 0) {
        alertRes.data.forEach(al => {
          mergedAlerts.push({
            id: al.id || `alert-${Date.now()}`,
            type: `🚨 ${al.level || 'CRITICAL'} BROADCAST`,
            title: `SEOC Warning: ${al.district_id || 'Regional'}`,
            text: al.message,
            time: al.sent_at ? new Date(al.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
            color: 'red',
            isBroadcast: true
          });
        });
      }

      // Add crowd-sourced and verified field incidents
      if (incRes.data && incRes.data.length > 0) {
        setRawIncidents(incRes.data);
        incRes.data.forEach((inc, i) => {
          mergedAlerts.push({
            id: inc.id || String(i),
            type: inc.status === 'assigned' || inc.status === 'in_progress' ? 'Assigned Field Mission' : (inc.verification_status === 'verified' ? 'Verified Hazard' : 'Citizen Hazard'),
            title: (inc.description || 'Hazard Alert').slice(0, 36),
            text: `${inc.description || 'Hazard reported'} · ${inc.submitted_by || 'Field Reporter'}`,
            time: inc.created_at ? new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
            color: inc.severity === 'Critical' || inc.severity === 'High' ? 'red' : 'amber',
            latitude: inc.latitude,
            longitude: inc.longitude,
            assigned_officer: inc.assigned_officer,
            officer_unit: inc.officer_unit,
            status: inc.status
          });
        });
      }

      if (mergedAlerts.length > 0) {
        setAlerts(mergedAlerts);
      }

      // 3. Live road status corridors
      const roadRes = await mobileApi.getRoadStatus();
      if (roadRes.data) {
        setRoadCorridors(roadRes.data);
      }
    } catch (err) {
      console.warn("Operating with cached local data:", err);
    }
  };

  useEffect(() => {
    fetchLiveData();
    // 1. Supabase Realtime WebSocket push for instant multi-client sync
    const unsubscribe = subscribeToMapUpdates(fetchLiveData);
    // 2. Battery & data efficient fallback poll (relaxed to 30s)
    const interval = setInterval(fetchLiveData, 30000);
    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleManualRefresh = async () => {
    setRefreshingHome(true);
    await fetchLiveData();
    setTimeout(() => setRefreshingHome(false), 800);
  };

  const handleAcquireLocationChip = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocationName(`${pos.coords.latitude.toFixed(2)}°N, ${pos.coords.longitude.toFixed(2)}°E (Live GPS)`);
        },
        () => {
          setUserLocationName('Shillong (GPS Default)');
        }
      );
    }
  };

  const submitReport = async (reportData) => {
    try {
      const formData = new FormData();
      formData.append('description', `${reportData.kind}: ${reportData.notes || 'Hazard reported by field citizen'}`);
      formData.append('latitude', String(reportData.latitude || 25.5788));
      formData.append('longitude', String(reportData.longitude || 91.8933));
      formData.append('submitted_by', localStorage.getItem('ne_citizen_name') || 'Citizen (Mobile App)');

      // If photo was captured, retrieve its blob and append as binary file
      if (reportData.photo) {
        try {
          const photoResp = await fetch(reportData.photo);
          const photoBlob = await photoResp.blob();
          formData.append('photo', photoBlob, 'incident_evidence.jpg');
        } catch (photoErr) {
          console.warn('Could not package photo evidence blob:', photoErr);
        }
      }

      const res = await mobileApi.submitIncident(formData);
      
      soundEngine.playChime();
      const isPersisted = res?.db_persisted !== false;
      setReportToast({
        success: true,
        message: isPersisted
          ? 'Transmitted to HQ Command Center & Synced across all devices!'
          : 'Cached in active session (Supabase connection offline).'
      });
      setShowReport(false);
      fetchLiveData();
      setTimeout(() => setReportToast(null), 4000);
    } catch (err) {
      console.error("Incident submit failed:", err);
      soundEngine.playChime();
      setReportToast({
        success: false,
        message: `Transmission failed: ${err.message || 'Could not reach HQ Command Center'}`
      });
      setShowReport(false);
      setTimeout(() => setReportToast(null), 5000);
    }
  };

  return (
    <main className="app-shell">
      {/* Floating Emergency Siren Alert Banner */}
      <EmergencyAlertBanner 
        alert={activeEmergencyAlert}
        onDismiss={() => setActiveEmergencyAlert(null)}
        onViewRoute={() => {
          setActiveEmergencyAlert(null);
          setActiveTab('routes');
        }}
      />

      {/* Top App Bar */}
      <header className="topbar">
        <div className="brand-lockup" onClick={() => setShowProfile(true)} style={{ cursor: 'pointer' }}>
          <div className="brand-mark"><Shield size={18} strokeWidth={2.5} /></div>
          <div>
            <p className="eyebrow">NORTH-EAST RESPONSE</p>
            <h1>NE-SHIELD</h1>
          </div>
        </div>
        <div className="top-actions">
          <span 
            onClick={() => setShowProfile(true)}
            style={{ 
              fontSize: '10px', 
              fontWeight: 'bold', 
              padding: '4px 8px', 
              borderRadius: '6px', 
              background: userRole === 'admin' ? '#fee2e2' : userRole === 'field_officer' ? '#e0f2fe' : '#f1f5f9',
              color: userRole === 'admin' ? '#991b1b' : userRole === 'field_officer' ? '#0369a1' : '#475569',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {userRole === 'admin' ? '🚨 Admin' : userRole === 'field_officer' ? '🛡️ Officer' : '👤 Citizen'}
          </span>
          {!isOnline && <span className="offline-pill"><WifiOff size={13} /> Offline</span>}
          <button 
            className="icon-button" 
            aria-label="Offline Locality Map & SOS Hub"
            title="Download Locality Map & 3 Relief Centres"
            onClick={() => {
              soundEngine.playChime();
              setShowOfflineSector(true);
            }}
            style={{ color: '#f59e0b' }}
          >
            <DownloadCloud size={19} />
          </button>
          <button 
            className="icon-button" 
            aria-label="Notifications"
            onClick={() => {
              soundEngine.playChime();
              setShowNotifications(true);
            }}
          >
            <Bell size={20} />
          </button>
          <button 
            className="avatar" 
            aria-label="Open profile"
            onClick={() => {
              soundEngine.playChime();
              setShowProfile(true);
            }}
          >
            <UserRound size={18} />
          </button>
        </div>
      </header>

      {/* 1. HOME / OVERVIEW TAB */}
      {activeTab === 'home' && (
        <div className="page-content">
          {/* Role-Aware Command & Safety Landing Header */}
          <section style={{
            background: userRole === 'admin' 
              ? 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)' 
              : userRole === 'field_officer'
              ? 'linear-gradient(135deg, #0c4a6e 0%, #075985 100%)'
              : 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
            borderRadius: '20px',
            padding: '16px 18px',
            marginBottom: '16px',
            color: 'white',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            border: '1px solid rgba(255,255,255,0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  background: 'rgba(255,255,255,0.2)', 
                  padding: '4px 8px', 
                  borderRadius: '8px', 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px' 
                }}>
                  {userRole === 'admin' ? '🚨 SEOC COMMAND' : userRole === 'field_officer' ? '🛡️ SDRF FIELD PATROL' : '🏔️ NE-SHIELD CITIZEN'}
                </span>
                <span style={{ fontSize: '10px', opacity: 0.8 }}>Sunday, 7 September 2026</span>
              </div>
              <button 
                className="location-chip" 
                onClick={handleAcquireLocationChip}
                style={{ 
                  border: 'none', 
                  cursor: 'pointer', 
                  background: 'rgba(255,255,255,0.18)', 
                  color: 'white', 
                  fontSize: '11px', 
                  padding: '4px 8px', 
                  borderRadius: '8px' 
                }}
              >
                <LocateFixed size={13} /> {userLocationName}
              </button>
            </div>

            <h2 style={{ fontSize: '18px', fontWeight: '800', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              {userRole === 'admin' 
                ? 'Regional Disaster Operations Command'
                : userRole === 'field_officer'
                ? `Welcome, ${localStorage.getItem('ne_citizen_name') || 'Field Officer'}`
                : 'Stay ahead of the slope.'}
            </h2>
            <p style={{ margin: '0 0 14px', fontSize: '12px', opacity: 0.85, lineHeight: 1.4 }}>
              {userRole === 'admin'
                ? 'Full dispatch, unit assignment, and multi-channel siren broadcast authority active.'
                : userRole === 'field_officer'
                ? 'Rapid response unit logged into state emergency telemetry. Inspect & triage active hazards.'
                : 'Real-time XGBoost landslide early warning & AI terrain risk monitoring across NER.'}
            </p>

            {/* Quick KPI Strip */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '8px',
              background: 'rgba(0,0,0,0.22)',
              borderRadius: '12px',
              padding: '10px 12px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              {userRole === 'admin' ? (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#fca5a5' }}>
                      {rawIncidents.filter(i => i.status !== 'resolved' && i.status !== 'closed').length}
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>Open Hazards</small>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.15)', borderRight: '1px solid rgba(255,255,255,0.15)' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#fef08a' }}>
                      {rawIncidents.filter(i => !i.assigned_officer && i.status !== 'resolved').length}
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>Unassigned</small>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#fed7aa' }}>
                      {districts.filter(d => d.risk === 'Critical').length}
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>Critical Sectors</small>
                  </div>
                </>
              ) : userRole === 'field_officer' ? (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#93c5fd' }}>
                      {rawIncidents.filter(i => i.assigned_officer && i.assigned_officer.toLowerCase().includes((localStorage.getItem('ne_citizen_name') || '').toLowerCase()) && i.status !== 'resolved').length}
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>My Assigned</small>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.15)', borderRight: '1px solid rgba(255,255,255,0.15)' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#86efac' }}>
                      {rawIncidents.filter(i => i.status === 'resolved').length}
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>Cleared / Safe</small>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#fed7aa' }}>
                      {rawIncidents.length}
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>Regional Reports</small>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#86efac' }}>
                      {selectedDistrict?.score || 64}%
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>Regional Risk</small>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.15)', borderRight: '1px solid rgba(255,255,255,0.15)' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#fef08a' }}>
                      {rawIncidents.filter(i => i.status !== 'resolved').length}
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>Active Alerts</small>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#93c5fd' }}>
                      3 Hubs
                    </div>
                    <small style={{ fontSize: '10px', opacity: 0.8 }}>Shelters Open</small>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Live Regional Threat Hero Card */}
          <section className="risk-hero" aria-label="Current regional risk">
            <div className="hero-heading">
              <div>
                <span className="status-dot" /> REGIONAL THREAT LEVEL
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={handleManualRefresh}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', color: 'white', padding: '4px 8px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCw size={12} className={refreshingHome ? 'animate-spin' : ''} />
                  <span>Sync</span>
                </button>
                <span className="live-label"><Radio size={12} /> LIVE</span>
              </div>
            </div>

            <div className="risk-reading">
              <strong>{selectedDistrict?.risk || 'Moderate'}</strong>
              <span>{selectedDistrict?.score || 64} / 100</span>
            </div>
            <p className="hero-copy">
              Real-time XGBoost inference monitoring slope displacement and saturated rainfall.
            </p>
            
            <div className="hero-footer">
              <span><CloudRain size={16} /> 86% precipitation probability</span>
              <button 
                onClick={() => handleSirenToggle(!sirenSounding)}
                style={{ background: sirenSounding ? '#dc2626' : 'rgba(239, 68, 68, 0.35)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '8px', padding: '5px 9px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Volume2 size={13} />
                <span>{sirenSounding ? 'Stop Siren' : 'Test Siren'}</span>
              </button>
            </div>
          </section>

          {/* Risk by District Feed */}
          <section className="section-block">
            <div className="section-header">
              <div>
                <p className="section-kicker">MONITORED SECTORS</p>
                <h3>Risk by district</h3>
              </div>
              <button className="text-button" onClick={() => setActiveTab('map')}>
                View map <ArrowRight size={15} />
              </button>
            </div>

            <div className="district-list">
              {districts.map((district) => (
                <button 
                  className={`district-row ${selectedDistrict?.name === district.name ? 'selected' : ''}`} 
                  key={district.name} 
                  onClick={() => {
                    setSelectedDistrict(district);
                    setInspectingDistrict(district);
                  }}
                >
                  <span className={`risk-icon ${district.color}`}><AlertTriangle size={17} /></span>
                  <span className="district-copy">
                    <strong>{district.name}</strong>
                    <small>{district.state} · Tap for sensor details</small>
                  </span>
                  <span className="district-score">
                    <strong>{district.score}%</strong>
                    <small>{district.risk}</small>
                  </span>
                  <ChevronRight size={17} className="chevron" />
                </button>
              ))}
            </div>
          </section>

          {/* Quick Action Cards */}
          <section className="quick-actions" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <button 
              className="action-card report" 
              onClick={() => {
                soundEngine.playChime();
                setShowReport(true);
              }}
            >
              <span className="action-icon"><Plus size={19} /></span>
              <span><strong>Report hazard</strong><small>Photo & GPS</small></span>
            </button>

            <button 
              className="action-card" 
              style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}
              onClick={() => {
                soundEngine.playChime();
                setShowEvacuation(true);
              }}
            >
              <span className="action-icon" style={{ background: '#10b981', color: 'white' }}><Navigation size={19} /></span>
              <span><strong>Evacuate</strong><small>Shelter & safe path</small></span>
            </button>

            <button 
              className="action-card route" 
              onClick={() => {
                soundEngine.playChime();
                setActiveTab('routes');
              }}
            >
              <span className="action-icon"><Route size={19} /></span>
              <span><strong>Safe roads</strong><small>PWD clearance</small></span>
            </button>
          </section>

          {/* Offline Sector Map & Aid Request Banner */}
          <div 
            onClick={() => {
              soundEngine.playChime();
              setShowOfflineSector(true);
            }}
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '16px',
              padding: '12px 14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#f59e0b', color: '#0f172a', width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <DownloadCloud size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ fontSize: '13px', color: '#ffffff' }}>Offline Locality Map & SOS</strong>
                  <span style={{ fontSize: '9px', background: '#d97706', color: 'white', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>ZERO SIGNAL</span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                  Download locality · 3 Nearest Centers with paths · Food/Water SOS
                </p>
              </div>
            </div>
            <ChevronRight size={18} color="#94a3b8" />
          </div>

          {/* Latest Verified Alerts */}
          <section className="section-block alerts-block">
            <div className="section-header">
              <div>
                <p className="section-kicker">WHAT MATTERS</p>
                <h3>Latest alerts & reports</h3>
              </div>
              <button className="icon-button subtle" aria-label="Open all alerts" onClick={() => setActiveTab('alerts')}>
                <ArrowRight size={18} />
              </button>
            </div>

            {alerts.slice(0, 4).map((alert) => (
              <article 
                className="alert-row" 
                key={alert.id || alert.title}
                onClick={() => {
                  soundEngine.playChime();
                  if (userRole === 'field_officer' || userRole === 'admin') {
                    const matchedInc = rawIncidents.find(i => i.id === alert.id) || {
                      id: alert.id || 'inc-01',
                      title: alert.title,
                      description: alert.text,
                      status: 'open',
                      latitude: alert.latitude || 25.5788,
                      longitude: alert.longitude || 91.8933,
                      people_responded: 2,
                    };
                    setActiveOfficerIncident(matchedInc);
                  } else {
                    setActiveTab('map');
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <span className={`alert-icon ${alert.color}`}>
                  {alert.color === 'red' ? <Siren size={17} /> : <FileWarning size={17} />}
                </span>
                <div style={{ flex: 1 }}>
                  <div className="alert-meta">
                    <span>{alert.type}</span>
                    <time>{alert.time}</time>
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.text}</p>
                  {(userRole === 'field_officer' || userRole === 'admin') && (
                    <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: 'bold', display: 'inline-block', marginTop: '2px' }}>
                      🛡️ Tap to Dispatch & Resolve Incident →
                    </span>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {/* 2. REAL TOUCH GIS MAP TAB */}
      {activeTab === 'map' && (
        <div className="page-content map-page">
          <section className="page-heading">
            <div>
              <p className="section-kicker">INTERACTIVE GIS TERRAIN</p>
              <h2>Live Risk Map</h2>
            </div>
            <button 
              className="icon-button" 
              onClick={() => soundEngine.playChime()} 
              aria-label="Inspect"
            >
              <Crosshair size={19} />
            </button>
          </section>

          <MobileMapView 
            selectedDistrict={selectedDistrict}
            onSelectDistrict={(d) => {
              setSelectedDistrict(d);
              setInspectingDistrict(d);
            }}
            districts={districts}
            incidents={rawIncidents}
            onOpenReport={(coords) => {
              setReportInitialCoords(coords || null);
              setShowReport(true);
            }}
            onSelectIncident={(inc) => setActiveOfficerIncident(inc)}
            userRole={userRole}
            onRespondIncident={async (inc) => {
              const name = localStorage.getItem('ne_citizen_name') || 'Field Citizen';
              try {
                await mobileApi.respondIncident(inc.id, {
                  responder_name: name,
                  responder_role: userRole,
                  action_taken: 'Responded via Mobile App Map'
                });
                soundEngine.playChime();
                fetchLiveData();
              } catch (e) {
                console.warn("Respond incident err:", e);
              }
            }}
          />
        </div>
      )}

      {/* 3. SAFE ROUTES & EVACUATION TAB */}
      {activeTab === 'routes' && (
        <RoutesView 
          roadCorridors={roadCorridors} 
          onRefresh={fetchLiveData} 
          onOpenEvacuation={() => setShowEvacuation(true)}
          onOpenOfflineSector={() => setShowOfflineSector(true)}
        />
      )}

      {/* 4. ALERTS, SIRENS & SAFETY TAB */}
      {activeTab === 'alerts' && (
        <AlertsView 
          alerts={alerts} 
          rawIncidents={rawIncidents}
          userRole={userRole}
          sirenSounding={sirenSounding}
          onToggleSiren={handleSirenToggle}
          onOpenReport={(coords) => {
            setReportInitialCoords(coords || null);
            setShowReport(true);
          }} 
          onSelectIncident={(inc) => setActiveOfficerIncident(inc)}
          onRespondIncident={async (inc) => {
            const name = localStorage.getItem('ne_citizen_name') || 'Field Citizen';
            try {
              await mobileApi.respondIncident(inc.id, {
                responder_name: name,
                responder_role: userRole,
                action_taken: 'Responded via Mobile Alerts Stream'
              });
              soundEngine.playChime();
              fetchLiveData();
            } catch (e) {
              console.warn("Respond alert err:", e);
            }
          }}
        />
      )}

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <NavButton active={activeTab === 'home'} label="Overview" icon={<Home size={20} />} onClick={() => setActiveTab('home')} />
        <NavButton active={activeTab === 'map'} label="Risk map" icon={<Map size={20} />} onClick={() => setActiveTab('map')} />
        <button className="center-report" onClick={() => { setReportInitialCoords(null); setShowReport(true); }} aria-label="Report a hazard"><Plus size={25} /></button>
        <NavButton active={activeTab === 'routes'} label="Routes" icon={<Navigation size={20} />} onClick={() => setActiveTab('routes')} />
        <NavButton active={activeTab === 'alerts'} label="Alerts" icon={<Bell size={20} />} onClick={() => setActiveTab('alerts')} />
      </nav>

      {/* Modals & Sheets */}
      {inspectingDistrict && (
        <DistrictDetailSheet 
          district={inspectingDistrict}
          onClose={() => setInspectingDistrict(null)}
          onNavigateToRoute={() => {
            setInspectingDistrict(null);
            setActiveTab('routes');
          }}
        />
      )}

      {showNotifications && (
        <NotificationCenterModal onClose={() => setShowNotifications(false)} />
      )}

      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} isOnline={isOnline} />
      )}

      {showEvacuation && (
        <EvacuationModal onClose={() => setShowEvacuation(false)} />
      )}

      {showOfflineSector && (
        <OfflineSectorModal 
          isOpen={showOfflineSector} 
          onClose={() => setShowOfflineSector(false)} 
        />
      )}

      {activeOfficerIncident && (
        <OfficerIncidentModal 
          incident={activeOfficerIncident}
          userRole={userRole}
          onClose={() => setActiveOfficerIncident(null)}
          onUpdated={fetchLiveData}
        />
      )}

      {showReport && (
        <ReportSheet 
          onClose={() => {
            setShowReport(false);
            setReportInitialCoords(null);
          }} 
          onSubmit={submitReport} 
          initialCoords={reportInitialCoords}
        />
      )}

      {reportToast && (
        <div 
          className="toast" 
          style={!reportToast.success ? { background: '#991b1b', color: '#ffffff', border: '1px solid #f87171' } : {}}
        >
          <span>{reportToast.success ? <Check size={16} /> : <AlertTriangle size={16} />}</span>
          {reportToast.message}
        </div>
      )}
    </main>
  );
}

function NavButton({ active, label, icon, onClick }) {
  return (
    <button 
      className={`nav-item ${active ? 'active' : ''}`} 
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function RoutesView({ roadCorridors = [], onRefresh, onOpenEvacuation, onOpenOfflineSector }) {
  const [origin, setOrigin] = useState('Shillong, Meghalaya');
  const [destination, setDestination] = useState('Cherrapunji, Meghalaya');

  const swapRoute = () => {
    soundEngine.playChime();
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const startNavigation = (corridorName) => {
    soundEngine.playChime();
    const dest = encodeURIComponent(destination);
    const orig = encodeURIComponent(origin);
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=driving`;
    window.open(directionsUrl, '_blank');
  };

  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <p className="section-kicker">SAFE CORRIDORS</p>
          <h2>Evacuation Routes</h2>
        </div>
        <button className="icon-button" onClick={onRefresh} aria-label="Refresh routes">
          <RefreshCw size={18} />
        </button>
      </section>

      {/* Offline Locality Map & 3 Nearest Relief Hubs Trigger */}
      {onOpenOfflineSector && (
        <button
          type="button"
          onClick={onOpenOfflineSector}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '12px',
            fontWeight: 'bold',
            marginBottom: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
          }}
        >
          <DownloadCloud size={17} />
          <span>Save Locality Offline & View 3 Nearest Relief Hubs →</span>
        </button>
      )}

      {/* Direct Shelter & Disaster Evacuation Modal Trigger */}
      {onOpenEvacuation && (
        <button
          type="button"
          onClick={onOpenEvacuation}
          style={{
            width: '100%',
            background: '#0f5c5d',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '12px',
            fontWeight: 'bold',
            marginBottom: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 2px 6px rgba(15,92,93,0.2)'
          }}
        >
          <Navigation size={17} />
          <span>Locate Nearest Shelter & Personalized Precautions →</span>
        </button>
      )}

      {/* Origin / Destination Search Box */}
      <div className="route-search">
        <div><Map size={18} /><span>{origin}</span></div>
        <button onClick={swapRoute} aria-label="Swap route direction" style={{ cursor: 'pointer' }}>
          <ArrowRight size={17} />
        </button>
        <div><LocateFixed size={18} /><span>{destination}</span></div>
      </div>

      {/* Recommended Route Card */}
      <div className="route-card recommended">
        <div className="route-card-top">
          <span className="recommended-badge">DESIGNATED RELIEF CORRIDOR</span>
          <span>42 km</span>
        </div>
        <h3>NH-206 via Mawphlang</h3>
        <p>
          <span>◷ 1 hr 24 min</span>
          <span className="safe-text"><Shield size={14} /> Lowest Slope Exposure</span>
        </p>
        <div className="route-line"><span /><span /><span /></div>
        <button className="primary-button" onClick={() => startNavigation('NH-206')}>
          Start Navigation <Navigation size={16} />
        </button>
      </div>

      {/* Alternate Road Status Corridors from Database */}
      <h4 style={{ margin: '22px 0 10px', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Live Highway Clearance Status (PWD & SDMA)
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {roadCorridors.length > 0 ? (
          roadCorridors.map((c, idx) => {
            const corridorId = c.corridor_id || c.id || `corridor-${idx}`;
            const corridorName = c.corridor_name || c.name || 'NER Relief Highway';
            const isPassable = c.passable !== undefined ? c.passable : (c.status === 'Clear' || (c.passability && c.passability >= 70));
            const statusText = c.status || (isPassable ? 'Clear' : 'Caution');
            const speedInfo = c.recommended_speed_kmh ? `${c.recommended_speed_kmh} km/h` : (c.passability ? `${c.passability}% Passability` : 'Standard Speed');
            const districtText = c.district || 'Meghalaya Corridor';

            return (
              <div 
                key={corridorId} 
                style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>{corridorName}</strong>
                  <span style={{ 
                    fontSize: '10px', 
                    fontWeight: 'bold', 
                    padding: '3px 8px', 
                    borderRadius: '6px', 
                    background: isPassable ? '#dcfce7' : '#fee2e2', 
                    color: isPassable ? '#15803d' : '#b91c1c' 
                  }}>
                    {statusText}
                  </span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#64748b' }}>
                  District: {districtText} · {speedInfo}
                </p>
                {c.diversion && (
                  <span style={{ fontSize: '10px', color: '#b45309', display: 'block', fontWeight: 'bold' }}>
                    ⚠️ {c.diversion}
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <div className="route-card">
            <div className="route-card-top"><span className="muted">ALTERNATE</span><span>39 km</span></div>
            <h3>NH-6 via Umsning</h3>
            <p><span>◷ 1 hr 10 min</span><span className="warn-text"><AlertTriangle size={14} /> Caution: Slope Slipped</span></p>
          </div>
        )}
      </div>

      <div className="tip-card" style={{ marginTop: '16px' }}>
        <div className="tip-icon"><CloudRain size={18} /></div>
        <div>
          <strong>Monsoon Cloudburst Warning</strong>
          <p>Avoid canyon road curves after 5:00 PM due to mud runout risk.</p>
        </div>
      </div>
    </div>
  );
}

function AlertsView({ 
  alerts = [], 
  rawIncidents = [], 
  userRole = 'citizen', 
  sirenSounding = false,
  onToggleSiren,
  onOpenReport, 
  onSelectIncident, 
  onRespondIncident 
}) {
  const currentOfficerName = typeof window !== 'undefined' ? (localStorage.getItem('ne_officer_name') || localStorage.getItem('ne_citizen_name') || '') : '';
  
  // Smart match helper for field officers across formats
  const officerMatches = (assignedStr) => {
    if (!assignedStr) return false;
    if (!currentOfficerName || currentOfficerName.trim() === '' || currentOfficerName === 'Field Citizen') {
      return true; // Match all missions if officer name isn't customized yet
    }
    const aLower = assignedStr.toLowerCase();
    const myLower = currentOfficerName.toLowerCase().trim();
    if (aLower.includes(myLower) || myLower.includes(aLower)) return true;
    const tokens = myLower.split(/[\s,.-]+/).filter(t => t.length >= 3);
    return tokens.some(t => aLower.includes(t));
  };

  const myAssignedIncidents = rawIncidents.filter(inc => 
    inc.status !== 'resolved' && officerMatches(inc.assigned_officer)
  );

  const [assignedOnly, setAssignedOnly] = useState(false);

  // Filter alerts if assignedOnly is active for field officers
  const displayedAlerts = alerts.filter(alert => {
    if (userRole === 'field_officer' && assignedOnly) {
      const matched = rawIncidents.find(i => i.id === alert.id);
      return matched && officerMatches(matched.assigned_officer);
    }
    return true;
  });

  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <p className="section-kicker">STAY INFORMED</p>
          <h2>Alerts & Safety</h2>
        </div>
        <button 
          className="icon-button" 
          onClick={() => soundEngine.playSiren(3)}
          style={{ background: '#fee2e2', color: '#dc2626' }}
          aria-label="Sound Siren"
        >
          <Volume2 size={19} />
        </button>
      </section>

      {/* Role Permission Guidance Banner */}
      <div style={{
        background: userRole === 'admin' ? '#fef2f2' : userRole === 'field_officer' ? '#f0fdf4' : '#f8fafc',
        border: `1px solid ${userRole === 'admin' ? '#fecaca' : userRole === 'field_officer' ? '#bbf7d0' : '#cbd5e1'}`,
        borderRadius: '14px',
        padding: '10px 14px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: userRole === 'admin' ? '#991b1b' : userRole === 'field_officer' ? '#166534' : '#334155' }}>
              {userRole === 'admin' ? '🚨 SEOC Incident Dispatch' : userRole === 'field_officer' ? '🛡️ SDRF Field Triage Queue' : '👥 Public Safety Feed'}
            </span>
            <span style={{ fontSize: '9px', background: userRole === 'admin' ? '#dc2626' : userRole === 'field_officer' ? '#16a34a' : '#64748b', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {userRole}
            </span>
          </div>
          <small style={{ fontSize: '10px', color: '#64748b', display: 'block', marginTop: '2px' }}>
            {userRole === 'admin'
              ? 'Tap any incident to assign field squads or permanently delete.'
              : userRole === 'field_officer'
              ? 'Tap assigned incidents to submit field triage and mark cleared.'
              : 'Tap to view details, report status, and see emergency coordinates.'}
          </small>
        </div>
        {userRole === 'field_officer' && (
          <button
            type="button"
            onClick={() => setAssignedOnly(!assignedOnly)}
            style={{
              background: assignedOnly ? '#16a34a' : 'white',
              color: assignedOnly ? 'white' : '#166534',
              border: '1px solid #16a34a',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {assignedOnly ? '✓ Assigned' : 'Show All'}
          </button>
        )}
      </div>

      {/* Siren Alarm Controller */}
      <div style={{ background: sirenSounding ? '#fee2e2' : '#fef2f2', border: sirenSounding ? '2px solid #ef4444' : '1px solid #fecaca', borderRadius: '16px', padding: '16px', marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <strong style={{ fontSize: '13px', color: '#991b1b' }}>🚨 Emergency Siren Broadcast</strong>
            {sirenSounding && (
              <span style={{ background: '#dc2626', color: 'white', fontSize: '9px', fontWeight: '900', padding: '2px 6px', borderRadius: '9999px', textTransform: 'uppercase' }}>
                ACTIVE
              </span>
            )}
          </div>
          <span style={{ fontSize: '11px', color: '#7f1d1d', display: 'block', marginTop: '2px' }}>
            {sirenSounding ? 'Acoustic siren is active on phone & connected ESP32 hardware beacon!' : 'Triggers hardware acoustic buzzer on ESP32 & phone alarm'}
          </span>
        </div>
        {sirenSounding ? (
          <button
            onClick={() => onToggleSiren ? onToggleSiren(false) : soundEngine.stopSiren()}
            style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ⏹️ Silence Siren
          </button>
        ) : (
          <button
            onClick={() => onToggleSiren ? onToggleSiren(true) : soundEngine.playSiren(6)}
            style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            🚨 Sound Siren
          </button>
        )}
      </div>

      {/* Official Helplines */}
      <h4 style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Emergency Helplines (Direct Dial)
      </h4>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '18px' }}>
        <a 
          href="tel:1078"
          style={{ textDecoration: 'none', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}
        >
          <Phone size={17} className="text-red-500" />
          <div>
            <strong style={{ fontSize: '12px', display: 'block' }}>NDRF Control</strong>
            <small style={{ fontSize: '10px', color: '#64748b' }}>Dial 1078</small>
          </div>
        </a>

        <a 
          href="tel:112"
          style={{ textDecoration: 'none', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}
        >
          <Phone size={17} className="text-blue-500" />
          <div>
            <strong style={{ fontSize: '12px', display: 'block' }}>National SOS</strong>
            <small style={{ fontSize: '10px', color: '#64748b' }}>Dial 112</small>
          </div>
        </a>
      </div>

      {/* NDMA Landslide Protocols: DO's & DON'Ts */}
      <section style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Shield size={20} color="#38bdf8" />
          <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>NDMA Safety Guidelines</h3>
        </div>

        {/* DO's */}
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
          <strong style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '6px' }}>
            <Check size={16} /> WHAT TO DO (DO's)
          </strong>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: '#e2e8f0', lineHeight: '1.6' }}>
            <li>Move uphill to solid bedrock immediately upon hearing rumbling sounds.</li>
            <li>Keep emergency go-bag (water, torch, medicine, ID docs) accessible.</li>
            <li>Follow designated safe corridors (NH-206 Mawphlang).</li>
          </ul>
        </div>

        {/* DON'Ts */}
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '12px' }}>
          <strong style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '6px' }}>
            <X size={16} /> WHAT TO AVOID (DON'TS)
          </strong>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: '#e2e8f0', lineHeight: '1.6' }}>
            <li>Do NOT cross active debris or mudflow paths on foot or in vehicles.</li>
            <li>Do NOT seek shelter under steep mountain slopes or near riverbeds.</li>
            <li>Do NOT re-enter compromised buildings until cleared by authorities.</li>
          </ul>
        </div>
      </section>

      {/* Field Officer: Dedicated Active Dispatch Queue */}
      {userRole === 'field_officer' && myAssignedIncidents.length > 0 && !assignedOnly && (
        <section style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '11px', fontWeight: '800', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🛡️</span> Your Assigned Field Missions ({myAssignedIncidents.length})
            </h4>
            <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '9999px', fontWeight: 'bold' }}>
              HQ DISPATCH
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {myAssignedIncidents.map((inc) => (
              <article 
                className="alert-row" 
                key={`my-${inc.id}`}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'stretch',
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '14px',
                  padding: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span className="alert-icon red" style={{ background: '#fee2e2', color: '#dc2626' }}>
                    <Siren size={17} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="alert-meta">
                      <span style={{ color: '#166534', fontWeight: 'bold' }}>{inc.officer_unit || '1st SDRF Rapid Response'}</span>
                      <time style={{ color: '#047857', fontWeight: 'bold' }}>{inc.status ? inc.status.toUpperCase() : 'ASSIGNED'}</time>
                    </div>
                    <strong style={{ color: '#0f172a', fontSize: '13px' }}>{inc.description}</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#0369a1', fontWeight: '600' }}>
                        👮 Callsign: {inc.assigned_officer}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        📍 {Number(inc.latitude).toFixed(4)}°N, {Number(inc.longitude).toFixed(4)}°E
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #dcfce7', paddingTop: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '10px', color: '#166534', fontWeight: 'bold' }}>
                    👥 {inc.people_responded || 0} Responders on site
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectIncident) onSelectIncident(inc);
                    }}
                    style={{
                      background: '#16a34a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '7px 12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🛡️ Triage & Mark Resolved
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Live Alerts Stream */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Live Community Hazard Stream ({displayedAlerts.length})
        </h4>
        {userRole === 'field_officer' && (
          <span style={{ fontSize: '10px', color: '#64748b' }}>
            {assignedOnly ? 'Filtering: Assigned only' : 'All sector hazards'}
          </span>
        )}
      </div>

      {displayedAlerts.length === 0 ? (
        <div style={{ background: 'white', border: '1px dashed #cbd5e1', borderRadius: '14px', padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
          <p style={{ margin: '0 0 10px', fontWeight: 'bold', color: '#334155' }}>
            {userRole === 'field_officer' && assignedOnly
              ? `No active incidents currently assigned to "${currentOfficerName || 'Officer'}".`
              : 'No active incident reports in this sector.'}
          </p>
          {userRole === 'field_officer' && assignedOnly && (
            <button
              type="button"
              onClick={() => setAssignedOnly(false)}
              style={{
                background: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Show All Regional Hazard Reports
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayedAlerts.map((alert) => {
            const matchedInc = rawIncidents.find(i => i.id === alert.id) || {
              id: alert.id || 'inc-01',
              title: alert.title,
              description: alert.text,
              status: 'open',
              latitude: alert.latitude || 25.5788,
              longitude: alert.longitude || 91.8933,
              people_responded: 1,
            };
            return (
              <article 
                className="alert-row" 
                key={alert.id || alert.title}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span className={`alert-icon ${alert.color}`}>
                    {alert.color === 'red' ? <Siren size={17} /> : <FileWarning size={17} />}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="alert-meta"><span>{alert.type}</span><time>{alert.time}</time></div>
                    <strong>{alert.title}</strong>
                    <p>{alert.text}</p>
                    {matchedInc.assigned_officer && (
                      <span style={{ fontSize: '10px', color: '#0369a1', fontWeight: '600', display: 'block', marginTop: '2px' }}>
                        👮 Assigned: {matchedInc.assigned_officer}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action and Responder bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: 'bold' }}>
                    👥 {matchedInc.people_responded || 0} Responded
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onRespondIncident) onRespondIncident(matchedInc);
                      }}
                      style={{
                        background: '#0284c7',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      👥 Respond
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectIncident) onSelectIncident(matchedInc);
                      }}
                      style={{
                        background: userRole === 'admin' ? '#991b1b' : userRole === 'field_officer' ? '#0f5c5d' : '#475569',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      {userRole === 'admin' 
                        ? '🚨 Triage / Assign / Delete' 
                        : userRole === 'field_officer' 
                        ? (matchedInc.assigned_officer ? '🛡️ Triage / Resolve' : '🛡️ Claim / Triage') 
                        : 'ℹ️ Details'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportSheet({ onClose, onSubmit, initialCoords = null }) {
  const [kind, setKind] = useState('Rockfall');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState(() => {
    if (initialCoords && initialCoords.lat && initialCoords.lon) {
      return {
        lat: Number(initialCoords.lat),
        lon: Number(initialCoords.lon),
        label: initialCoords.label || `${Number(initialCoords.lat).toFixed(4)}° N, ${Number(initialCoords.lon).toFixed(4)}° E (Pinned on Map)`
      };
    }
    return { lat: 25.5788, lon: 91.8933, label: 'Shillong, Meghalaya (Default)' };
  });
  const [photo, setPhoto] = useState(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const acquireGPS = async () => {
    setLocating(true);
    soundEngine.playChime();
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 6000 });
      setCoords({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        label: `${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E (Live GPS)`
      });
    } catch (err) {
      // Fallback
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setCoords({
              lat: p.coords.latitude,
              lon: p.coords.longitude,
              label: `${p.coords.latitude.toFixed(4)}° N, ${p.coords.longitude.toFixed(4)}° E (Browser GPS)`
            });
          },
          () => {}
        );
      }
    } finally {
      setLocating(false);
    }
  };

  const capturePhoto = async () => {
    soundEngine.playChime();
    try {
      const img = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt
      });
      if (img?.webPath) setPhoto(img.webPath);
    } catch (err) {
      console.warn("Camera fallback:", err);
    }
  };

  const handleAction = async () => {
    setSubmitting(true);
    await onSubmit({ kind, notes, latitude: coords.lat, longitude: coords.lon, photo });
    setSubmitting(false);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ zIndex: 1250 }}>
      <section className="report-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <p className="section-kicker">COMMUNITY FIELD REPORT</p>
            <h2>Report a hazard</h2>
          </div>
          <button className="icon-button subtle" onClick={onClose} aria-label="Close report"><X size={19} /></button>
        </div>
        <p className="sheet-copy">Transmits live photographic and GPS telemetry directly to Disaster Command HQ.</p>

        <button type="button" className="location-field" onClick={acquireGPS} style={{ cursor: 'pointer' }}>
          <LocateFixed size={18} className={locating ? 'animate-spin text-sky-400' : ''} />
          <span><strong>{locating ? 'Acquiring GPS...' : 'Target GPS Location'}</strong><small>{coords.label}</small></span>
          <Check size={17} />
        </button>

        <label className="field-label">Hazard Category</label>
        <div className="choice-grid">
          {['Rockfall', 'Road crack', 'Waterlogging', 'Landslide', 'Debris Flow'].map((option) => (
            <button key={option} type="button" className={kind === option ? 'choice selected-choice' : 'choice'} onClick={() => { soundEngine.playChime(); setKind(option); }}>
              {option}
            </button>
          ))}
        </div>

        <div style={{ marginTop: '12px' }}>
          <button 
            type="button" 
            onClick={capturePhoto} 
            className="outline-button" 
            style={{ width: '100%', padding: '11px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
          >
            <CameraIcon size={16} />
            <span>{photo ? 'Photo Attached ✓' : 'Take Field Photo / Evidence'}</span>
          </button>
        </div>

        {photo && (
          <div style={{ marginTop: '8px', position: 'relative' }}>
            <img src={photo} alt="Preview" style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '12px', border: '1px solid #cbd5e1' }} />
            <button onClick={() => setPhoto(null)} style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>✕</button>
          </div>
        )}

        <label className="field-label" htmlFor="notes">Field Observations <span>Optional</span></label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Describe slope condition, rock size, blocked lane width..."
          rows="3"
        />

        <button className="primary-button submit-button" disabled={submitting} onClick={handleAction}>
          {submitting ? 'Transmitting to Command Center...' : <>Transmit Report <ArrowRight size={17} /></>}
        </button>
      </section>
    </div>
  );
}

export default App;

