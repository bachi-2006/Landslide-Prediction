importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

// Securely retrieve Firebase parameters from registration URL query string
const urlParams = new URL(location).searchParams;
const apiKey = urlParams.get("apiKey");
const projectId = urlParams.get("projectId") || "ne-shield";
const messagingSenderId = urlParams.get("messagingSenderId");
const appId = urlParams.get("appId");

if (apiKey && projectId && appId) {
  firebase.initializeApp({
    apiKey: apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId: projectId,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: messagingSenderId,
    appId: appId,
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "NE-SHIELD Landslide Alert";
    const options = {
      body: payload.notification?.body || "Severe hazard status detected in your sector.",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: payload.data || {}
    };
    self.registration.showNotification(title, options);
  });
}
