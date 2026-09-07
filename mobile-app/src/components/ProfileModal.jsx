import React, { useState, useEffect } from 'react';
import { UserRound, Phone, Shield, WifiOff, Check, X, Save, Globe, Key, AlertCircle } from 'lucide-react';
import { soundEngine } from '../services/soundEngine';
import { mobileApi } from '../services/api';

export default function ProfileModal({ onClose, isOnline }) {
  const [name, setName] = useState(() => localStorage.getItem('ne_citizen_name') || 'Field Citizen');
  const [icePhone, setIcePhone] = useState(() => localStorage.getItem('ne_ice_phone') || '+91 98765 43210');
  const [district, setDistrict] = useState(() => localStorage.getItem('ne_user_district') || 'East Khasi Hills');
  const [role, setRole] = useState(() => localStorage.getItem('neshield_user_role') || 'citizen');
  const [password, setPassword] = useState('');
  const [apiHost, setApiHost] = useState(() => localStorage.getItem('neshield_api_host') || 'http://10.82.15.222:8000');
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // 1. Password Verification for RBAC
    if (role === 'field_officer') {
      if (password.trim() !== '9') {
        setErrorMsg("Invalid Field Officer Password. Hint: Default is '9'");
        return;
      }
    } else if (role === 'admin') {
      if (password.trim() !== '99') {
        setErrorMsg("Invalid Admin Password. Hint: Default is '99'");
        return;
      }
    }

    // 2. Register Citizen in Database
    try {
      await mobileApi.loginOrRegister({
        role,
        password: password.trim(),
        name: name.trim(),
        phone: icePhone.trim(),
        district: district.trim()
      });
    } catch (apiErr) {
      console.warn("Auth registration sync note:", apiErr);
    }

    localStorage.setItem('ne_citizen_name', name.trim());
    localStorage.setItem('ne_ice_phone', icePhone.trim());
    localStorage.setItem('ne_user_district', district.trim());
    localStorage.setItem('neshield_user_role', role);
    localStorage.setItem('neshield_api_host', apiHost.trim());
    soundEngine.playChime();
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
      window.location.reload();
    }, 800);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ zIndex: 1300 }}>
      <section 
        className="report-sheet" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '88vh', overflowY: 'auto' }}
      >
        <div className="sheet-handle" />

        <div className="sheet-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#dceee5', display: 'grid', placeItems: 'center', color: '#0f5c5d' }}>
              <UserRound size={18} />
            </div>
            <div>
              <p className="section-kicker">RBAC & PREFERENCES</p>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>User Profile & Persona</h2>
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
          padding: '10px 14px',
          marginBottom: '14px',
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
              Offline Mode Active (Cached telemetry enabled)
            </span>
          )}
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '12px',
            padding: '10px 12px',
            marginBottom: '14px',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Profile & ICE Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
          {/* RBAC Role Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
              System Persona / Role (RBAC)
            </label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setErrorMsg('');
              }}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', fontWeight: 'bold' }}
            >
              <option value="citizen">👤 Citizen (Report & Evacuate)</option>
              <option value="field_officer">🛡️ Field Officer / SDRF (Triage & Resolve)</option>
              <option value="admin">🚨 Admin / SEOC Commander (Assign & Sirens)</option>
            </select>
          </div>

          {/* Conditional Passcode Requirement for Officer & Admin */}
          {role === 'field_officer' && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 'bold', color: '#166534', marginBottom: '4px' }}>
                <Key size={13} />
                Field Officer Passcode (Required)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter passcode: 9"
                required
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #86efac', fontSize: '12px', background: '#ffffff', boxSizing: 'border-box' }}
              />
              <small style={{ fontSize: '10px', color: '#15803d', marginTop: '4px', display: 'block' }}>
                🔑 Default passcode for Field Officers is <strong>9</strong>
              </small>
            </div>
          )}

          {role === 'admin' && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '10px 12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 'bold', color: '#991b1b', marginBottom: '4px' }}>
                <Key size={13} />
                SEOC Admin Passcode (Required)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter passcode: 99"
                required
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '12px', background: '#ffffff', boxSizing: 'border-box' }}
              />
              <small style={{ fontSize: '10px', color: '#b91c1c', marginTop: '4px', display: 'block' }}>
                🔑 Default passcode for SEOC Admins is <strong>99</strong>
              </small>
            </div>
          )}

          {role === 'citizen' && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 10px' }}>
              <small style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>
                ℹ️ Citizen mode requires no password. Your profile details will be saved to the database.
              </small>
            </div>
          )}

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
              Emergency (ICE) Phone Number
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

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
              Backend API Host (IP / URL)
            </label>
            <input 
              type="text" 
              value={apiHost} 
              onChange={(e) => setApiHost(e.target.value)}
              placeholder="http://10.82.15.222:8000"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px', fontFamily: 'monospace' }}
            />
            <small style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', display: 'block' }}>
              Tip: Use 10.0.2.2:8000 in Android Emulator, or LAN IP on physical device.
            </small>
          </div>

          <button 
            type="submit"
            className="primary-button" 
            style={{ padding: '11px', fontSize: '12px', marginTop: '4px' }}
          >
            <Save size={15} />
            <span>{saved ? 'Settings Saved ✓' : 'Save Safety Profile & Apply Role'}</span>
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
