// Mobile Push Notification & Notification Center Manager
import { soundEngine } from './soundEngine';

class MobileNotificationService {
  constructor() {
    this.hasPermission = false;
    this.listeners = new Set();
    this.history = [
      {
        id: 'init-1',
        title: 'NE-SHIELD Armed',
        body: 'Disaster monitoring is active across all North-East states.',
        level: 'Normal',
        timestamp: new Date().toISOString()
      }
    ];
  }

  async requestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    try {
      const perm = await Notification.requestPermission();
      this.hasPermission = perm === 'granted';
      return this.hasPermission;
    } catch (e) {
      console.warn('Notification permission request error:', e);
      return false;
    }
  }

  notify({ title, body, level = 'Moderate', vibrate = true, sound = true }) {
    const item = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title,
      body,
      level,
      timestamp: new Date().toISOString()
    };

    this.history.unshift(item);
    if (this.history.length > 30) this.history.pop();

    // Trigger audible alarm & vibration
    if (sound) {
      if (level === 'Critical' || level === 'High') {
        soundEngine.playSiren(3);
      } else {
        soundEngine.playChime();
      }
    }

    // System Notification if granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          vibrate: [200, 100, 200]
        });
      } catch (e) {
        // notification constructor fallback
      }
    }

    // Inform all active UI listeners (e.g. Floating Banner)
    this.listeners.forEach(cb => {
      try { cb(item); } catch (e) {}
    });

    return item;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getHistory() {
    return this.history;
  }
}

export const notificationService = new MobileNotificationService();
