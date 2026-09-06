import React, { useState } from 'react';
import { Bell, ShieldAlert, Volume2, Check, X, Smartphone, Radio } from 'lucide-react';
import { notificationService } from '../services/notifications';
import { soundEngine } from '../services/soundEngine';
import { mobileApi } from '../services/api';

export default function NotificationCenterModal({ onClose }) {
  const [hasPermission, setHasPermission] = useState(() => {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  });
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState(() => notificationService.getHistory());

  const handleRequestPermission = async () => {
    const granted = await notificationService.requestPermission();
    setHasPermission(granted);
    if (granted) {
      notificationService.notify({
        title: 'Push Notifications Enabled',
        body: 'You will receive critical landslide warnings instantly on this device.',
        level: 'Normal',
        sound: false
      });
      setHistory(notificationService.getHistory());
      // Register token with backend
      mobileApi.registerDeviceToken(`browser-fcm-${Date.now()}`, 'IN-ML-01').catch(console.warn);
    }
  };

  const handleTestAlert = async () => {
    setTesting(true);
    // Play Siren and Haptic Vibration
    notificationService.notify({
      title: '🚨 EMERGENCY ALERT TEST',
      body: 'High landslide risk detected in East Khasi Hills. Evacuate via NH-206 corridor.',
      level: 'Critical',
      sound: true
    });
    setHistory(notificationService.getHistory());

    // Also notify backend hardware endpoint
    try {
      await mobileApi.triggerHardware('Critical', 'IN-ML-01');
    } catch (e) {
      console.warn("Hardware alert fallback:", e);
    } finally {
      setTimeout(() => setTesting(false), 2500);
    }
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
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#e0f2fe', display: 'grid', placeItems: 'center', color: '#0284c7' }}>
              <Bell size={18} />
            </div>
            <div>
              <p className="section-kicker">DEVICE ALERTS</p>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>Notification Center</h2>
            </div>
          </div>
          <button className="icon-button subtle" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        {/* System Push Permission Banner */}
        <div style={{ 
          background: hasPermission ? '#ecfdf5' : '#fffbeb',
          border: `1px solid ${hasPermission ? '#a7f3d0' : '#fde68a'}`,
          borderRadius: '16px',
          padding: '14px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div>
            <strong style={{ fontSize: '12px', display: 'block', color: hasPermission ? '#065f46' : '#92400e' }}>
              {hasPermission ? '✓ Push Notifications Active' : 'Enable Mobile Push Alerts'}
            </strong>
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              {hasPermission ? 'Receiving priority emergency broadcasts' : 'Never miss an evacuation warning'}
            </span>
          </div>

          {!hasPermission ? (
            <button
              onClick={handleRequestPermission}
              style={{ background: '#0f5c5d', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Turn On
            </button>
          ) : (
            <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '18px' }}>✓</span>
          )}
        </div>

        {/* Siren & Alert Trigger Test */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a' }}>Emergency Siren & Vibration Test</span>
            <Radio size={15} className="text-red-500 animate-pulse" />
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
            Verify that your device's audio speakers and haptic motor fire immediately when an evacuation order is broadcast.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleTestAlert}
              disabled={testing}
              style={{ 
                flex: 1, 
                background: '#dc2626', 
                color: 'white', 
                border: 'none', 
                borderRadius: '12px', 
                padding: '11px 14px', 
                fontSize: '12px', 
                fontWeight: 'bold', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '6px', 
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(220,38,38,0.25)' 
              }}
            >
              <Volume2 size={16} />
              <span>{testing ? '🚨 Sounding Siren...' : 'Trigger Siren Test'}</span>
            </button>
            <button
              onClick={() => soundEngine.stopSiren()}
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '12px', padding: '11px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Mute
            </button>
          </div>
        </div>

        {/* Alert History Stream */}
        <h4 style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Recent Notifications & Dispatches
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {history.map((h) => (
            <div 
              key={h.id}
              style={{ 
                background: 'white', 
                border: '1px solid #e2e8f0', 
                borderRadius: '12px', 
                padding: '12px',
                borderLeft: `4px solid ${h.level === 'Critical' ? '#dc2626' : h.level === 'High' ? '#ea580c' : '#0f5c5d'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <strong style={{ fontSize: '12px', color: '#0f172a' }}>{h.title}</strong>
                <time style={{ fontSize: '9px', color: '#94a3b8' }}>
                  {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#475569', lineHeight: '1.4' }}>
                {h.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
