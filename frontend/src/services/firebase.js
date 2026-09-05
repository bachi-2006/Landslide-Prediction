import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { deviceService } from './api';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let messaging = null;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  messaging = getMessaging(app);

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    const swUrl = `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(firebaseConfig.apiKey || '')}&projectId=${encodeURIComponent(firebaseConfig.projectId || '')}&messagingSenderId=${encodeURIComponent(firebaseConfig.messagingSenderId || '')}&appId=${encodeURIComponent(firebaseConfig.appId || '')}`;
    navigator.serviceWorker.register(swUrl).catch(err => {
      console.warn("ServiceWorker registration notice:", err);
    });
  }
} else {
  console.warn("Firebase not configured (VITE_FIREBASE_* env vars missing). Notifications disabled.");
}

export const requestNotificationPermission = async () => {
  if (!messaging) return null;
  if (typeof Notification === 'undefined') return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      const token = await getToken(messaging, { vapidKey });
      if (token) await deviceService.registerToken(token);
      return token;
    }
  } catch (error) {
    console.error("Permission error:", error);
  }
  return null;
};

export const onNotificationReceived = (callback) => {
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    callback(payload);
  });
};

export default messaging;
