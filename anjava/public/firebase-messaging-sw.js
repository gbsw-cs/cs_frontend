importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get("apiKey") || "AIzaSyB9QbJ1OeudBnGgaKjGYa2tYtnNbJKNogA",
  authDomain: params.get("authDomain") || "anjava-52950.firebaseapp.com",
  projectId: params.get("projectId") || "anjava-52950",
  storageBucket: params.get("storageBucket") || "anjava-52950.firebasestorage.app",
  messagingSenderId: params.get("messagingSenderId") || "56363432316",
  appId: params.get("appId") || "1:56363432316:web:01983736728ba677cdccf9",
  measurementId: params.get("measurementId") || "G-TMEM3K29LC",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || "Anjava 알림";
  const body = notification.body || data.body || "자세 상태를 확인해주세요.";

  self.registration.showNotification(title, {
    body,
    icon: notification.icon || "/logo.png",
    image: notification.image || data.image || "/logo.png",
    data: {
      ...data,
      url: data.url || "/dashboard",
    },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/dashboard",
    self.location.origin,
  ).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
