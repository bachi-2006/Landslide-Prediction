import React, { useState, useEffect } from 'react';
import { UserRound, Phone, Shield, WifiOff, Check, X, Save, Globe } from 'lucide-react';
import { soundEngine } from '../services/soundEngine';

export default function ProfileModal({ onClose, isOnline }) {
  const [name, setName] = useState(() => localStorage.getItem('ne_citizen_name') || 'Field Citizen');
  const [icePhone, setIcePhone] = useState(() => localStorage.getItem('ne_ice_phone') || '+91 98765 43210');
  const [district, setDistrict] = useState(() => localStorage.getItem('ne_user_district') || 'East Khasi Hills');
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem('ne_citizen_name', name);
    localStorage.setItem('ne_ice_phone', icePhone);
    localStorage.setItem('ne_user_district', district);
    soundEngine.playChime();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ zIndex: 1300 }}>
      <section 
        className="report-sheet" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="sheet-handle" />

        <div className="sheet-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#dceee5', display: 'grid', placeItems: 'center', color: '#0f5c5d' }}>
              <UserRound size={18} />
            </div>
            <div>
              <p className="section-kicker">USER IDENTITY & ICE</p>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>Citizen Profile</h2>
            </div>
          </div>
          <button className="icon-button subtle" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        {/* Network State Badge */}
        <div style={{ 
          background: isOnline ? '#ecfdf5' : '#fffbeb',
          border: `1px solid ${isOnline ? '#a7f3d0' : '#fde68a'}`,
          borderRadius: '14px',
          padding: '12px 14px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {isOnline ? (
            <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }}></span>
              Connected to NE-SHIELD Disaster Cloud & Database
            </span>
          ) : (
            <span style={{ color: '#b45309', fontWeight: 'bold', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <WifiOff size={14} />
              Offline Mode Active (Cached telemetry & local hotspot enabled)
            </span>
          )}
        </div>

        {/* Profile & ICE Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
              Your Name / Callsign
            </label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
              In Case of Emergency (ICE) Phone Number
            </label>
            <input 
              type="tel" 
              value={icePhone} 
              onChange={(e) => setIcePhone(e.target.value)}
              placeholder="+91 98765 43210"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
              Registered Home District
            </label>
            <input 
              type="text" 
              value={district} 
              onChange={(e) => setDistrict(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px' }}
            />
          </div>

          <button 
            type="submit"
            className="primary-button" 
            style={{ padding: '11px', fontSize: '12px', marginTop: '4px' }}
          >
            <Save size={15} />
            <span>{saved ? 'Settings Saved ✓' : 'Save Safety Profile'}</span>
          </button>
        </form>

        {/* Quick Emergency Dialers */}
        <h4 style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Official Disaster Helplines (Direct Call)
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <a 
            href="tel:1078"
            style={{ textDecoration: 'none', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b' }}
          >
            <Phone size={16} />
            <div>
              <strong style={{ fontSize: '12px', display: 'block' }}>NDRF Control</strong>
              <small style={{ fontSize: '10px' }}>Dial 1078</small>
            </div>
          </a>

          <a 
            href="tel:112"
            style={{ textDecoration: 'none', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0369a1' }}
          >
            <Phone size={16} />
            <div>
              <strong style={{ fontSize: '12px', display: 'block' }}>Emergency Police</strong>
              <small style={{ fontSize: '10px' }}>Dial 112</small>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
