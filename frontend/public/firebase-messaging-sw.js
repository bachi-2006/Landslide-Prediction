importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAE_9BznaEmmpeechZvwgNWPV0xgeucAfE",
  authDomain: "ne-shield.firebaseapp.com",
  projectId: "ne-shield",
  storageBucket: "ne-shield.firebasestorage.app",
  messagingSenderId: "822039975794",
  appId: "1:822039975794:web:50af1101f1a7d00538afeb",
});

const messaging = firebase.messaging();
