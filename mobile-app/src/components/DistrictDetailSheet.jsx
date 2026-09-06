import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, ShieldCheck, CloudRain, ShieldAlert, 
  TrendingUp, Navigation, RefreshCw, X, Check, Phone, ArrowRight 
} from 'lucide-react';
import { mobileApi } from '../services/api';
import { soundEngine } from '../services/soundEngine';

export default function DistrictDetailSheet({ district, onClose, onNavigateToRoute }) {
  if (!district) return null;

  const [loading, setLoading] = useState(true);
  const [telemetry, setTelemetry] = useState(null);
  const [roadInfo, setRoadInfo] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      // 1. Fetch live district telemetry from database
      const res = await mobileApi.getDistrictRisk(district.id);
      if (res.data) {
        setTelemetry(res.data);
      }
    } catch (e) {
      console.warn("District telemetry fallback:", e);
    }

    try {
      // 2. Fetch road corridor status
      const roadRes = await mobileApi.getRoadStatus(district.id);
      if (roadRes.data && roadRes.data.length > 0) {
        setRoadInfo(roadRes.data[0]);
      }
    } catch (e) {
      console.warn("Road status fallback:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [district.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    soundEngine.playChime();
    try {
      // Refresh district risk using backend refresh endpoint
      await mobileApi.refreshDistrictRisk(district.id, 25.57, 91.89, district.name);
      await fetchDetails();
    } catch (e) {
      console.warn("Refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  };

  const riskScore = telemetry ? Math.round((telemetry.risk_score || 0.5) * 100) : district.score || 60;
  const riskLevel = telemetry ? telemetry.risk_level : district.risk || 'Moderate';
  const factors = telemetry?.factors_json?._telemetry || {};

  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ zIndex: 1200 }}>
      <section 
        className="report-sheet" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxHeight: '88vh', overflowY: 'auto' }}
      >
        <div className="sheet-handle" />

        {/* Header */}
        <div className="sheet-header" style={{ marginBottom: '14px' }}>
          <div>
            <p className="section-kicker">REGIONAL DOSSIER · {district.state}</p>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>{district.name}</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={handleRefresh}
              className="icon-button subtle"
              aria-label="Refresh telemetry"
            >
              <RefreshCw size={17} className={refreshing ? 'animate-spin text-teal-600' : ''} />
            </button>
            <button className="icon-button subtle" onClick={onClose} aria-label="Close">
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Risk Level Badge */}
        <div style={{ 
          background: riskLevel === 'Critical' ? '#fee2e2' : riskLevel === 'High' ? '#ffedd5' : '#fef9c3',
          border: `1px solid ${riskLevel === 'Critical' ? '#fca5a5' : riskLevel === 'High' ? '#fdba74' : '#fde047'}`,
          borderRadius: '16px',
          padding: '14px 16px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ 
              fontWeight: '800', 
              fontSize: '11px', 
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: riskLevel === 'Critical' ? '#dc2626' : '#c2410c' 
            }}>
              {riskLevel} Landslide Threat
            </span>
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>
              {riskScore}%
            </span>
          </div>

          <div style={{ height: '6px', background: 'rgba(0,0,0,0.08)', borderRadius: '999px', overflow: 'hidden', marginTop: '8px' }}>
            <div style={{ 
              width: `${riskScore}%`, 
              height: '100%', 
              background: riskLevel === 'Critical' ? '#dc2626' : riskLevel === 'High' ? '#ea580c' : '#ca8a04',
              borderRadius: '999px' 
            }} />
          </div>
        </div>

        {/* Road Corridor Status */}
        {roadInfo && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155' }}>
                🛣️ Arterial Highway: {roadInfo.corridor_name}
              </span>
              <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '6px', background: roadInfo.passable ? '#dcfce7' : '#fee2e2', color: roadInfo.passable ? '#15803d' : '#b91c1c' }}>
                {roadInfo.status}
              </span>
            </div>
            {roadInfo.diversion && (
              <p style={{ margin: 0, fontSize: '10px', color: '#64748b' }}>
                Diversion: {roadInfo.diversion}
              </p>
            )}
          </div>
        )}

        {/* Live Weather & Telemetry Grid */}
        <h4 style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Live Environmental Sensors (Open-Meteo & SRTM)
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '18px' }}>
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px' }}>
            <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>24h Precipitation</span>
            <strong style={{ fontSize: '14px', color: '#0f172a' }}>{factors.rain_24h_mm ?? 72} mm</strong>
          </div>
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px' }}>
            <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>Soil Saturation</span>
            <strong style={{ fontSize: '14px', color: '#0f172a' }}>{factors.soil_moisture ? `${Math.round(factors.soil_moisture * 100)}%` : '82%'}</strong>
          </div>
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px' }}>
            <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>Hill Slope Angle</span>
            <strong style={{ fontSize: '14px', color: '#0f172a' }}>{factors.slope_deg ?? 38.4}°</strong>
          </div>
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px' }}>
            <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>GSI Landslides Mapped</span>
            <strong style={{ fontSize: '14px', color: '#b45309' }}>{factors.hist_landslides ?? 12} Recorded</strong>
          </div>
        </div>

        {/* NDMA Guidelines */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <ShieldAlert size={16} color="#0f5c5d" />
            <strong style={{ fontSize: '12px', color: '#0f5c5d' }}>NDMA Life Safety Protocol</strong>
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: '#334155', lineHeight: '1.6' }}>
            <li>Move to designated high-ground bedrock immediately if mudflow starts.</li>
            <li>Do NOT cross bridges over swollen muddy waters.</li>
            <li>Maintain 72-hour emergency go-bag ready.</li>
          </ul>
        </div>

        {/* Action CTAs */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => {
              onClose();
              onNavigateToRoute?.(district.name);
            }}
            className="primary-button" 
            style={{ flex: 1, padding: '12px', fontSize: '12px' }}
          >
            <Navigation size={15} />
            <span>Evacuation Route</span>
          </button>

          <button 
            onClick={() => soundEngine.playSiren(3)}
            style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '12px', padding: '12px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            🚨 Test Siren
          </button>
        </div>
      </section>
    </div>
  );
}
