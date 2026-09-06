import React from 'react';
import { Siren, VolumeX, ArrowRight, X } from 'lucide-react';
import { soundEngine } from '../services/soundEngine';

export default function EmergencyAlertBanner({ alert, onDismiss, onViewRoute }) {
  if (!alert) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      left: '14px',
      right: '14px',
      zIndex: 2000,
      background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)',
      color: 'white',
      borderRadius: '18px',
      padding: '14px 16px',
      boxShadow: '0 12px 35px rgba(220, 38, 38, 0.45)',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            width: '28px', 
            height: '28px', 
            borderRadius: '50%', 
            background: 'white', 
            color: '#dc2626', 
            display: 'grid', 
            placeItems: 'center',
            boxShadow: '0 0 12px rgba(255,255,255,0.6)',
            animation: 'pulse 1s infinite'
          }}>
            <Siren size={16} />
          </span>
          <div>
            <span style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85 }}>
              EMERGENCY SIREN BROADCAST
            </span>
            <strong style={{ fontSize: '13px', display: 'block', lineHeight: '1.2' }}>
              {alert.title || 'Landslide Evacuation Warning'}
            </strong>
          </div>
        </div>

        <button 
          onClick={onDismiss}
          style={{ background: 'transparent', border: 'none', color: 'white', opacity: 0.8, cursor: 'pointer', padding: '2px' }}
        >
          <X size={18} />
        </button>
      </div>

      <p style={{ margin: '0 0 10px', fontSize: '11px', color: '#fee2e2', lineHeight: '1.4' }}>
        {alert.body || alert.text || 'High slope instability detected. Move to safe high ground immediately.'}
      </p>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => {
            soundEngine.stopSiren();
            onViewRoute?.();
          }}
          style={{
            flex: 1,
            background: 'white',
            color: '#991b1b',
            border: 'none',
            borderRadius: '10px',
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: '800',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <span>View Safe Corridor</span>
          <ArrowRight size={14} />
        </button>

        <button
          onClick={() => soundEngine.stopSiren()}
          style={{
            background: 'rgba(0,0,0,0.25)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '10px',
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer'
          }}
        >
          <VolumeX size={14} />
          <span>Silence</span>
        </button>
      </div>
    </div>
  );
}
