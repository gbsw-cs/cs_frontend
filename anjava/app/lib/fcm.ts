import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { initializeApp, type FirebaseOptions } from "firebase/app";
import { deletePushToken, registerPushToken } from "./api";

const DEVICE_ID_KEY = "anjavaPushDeviceId";

let firebaseApp: ReturnType<typeof initializeApp> | null = null;

function getFirebaseConfig(): FirebaseOptions | null {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
    return null;
  }

  return config;
}

function getVapidKey() {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";
}

function getDeviceId() {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;

  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function getApp(config: FirebaseOptions) {
  firebaseApp ??= initializeApp(config);
  return firebaseApp;
}

async function getServiceWorkerRegistration(config: FirebaseOptions) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string" && value) params.set(key, value);
  }

  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
}

export async function syncWebPushToken() {
  if (typeof window === "undefined") return { ok: false, reason: "server" };
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!(await isSupported())) return { ok: false, reason: "unsupported" };

  const config = getFirebaseConfig();
  const vapidKey = getVapidKey();
  if (!config || !vapidKey) return { ok: false, reason: "missing-config" };

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "permission-denied" };

  const registration = await getServiceWorkerRegistration(config);
  const token = await getToken(getMessaging(getApp(config)), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { ok: false, reason: "empty-token" };

  const deviceId = getDeviceId();
  await registerPushToken({
    token,
    platform: "web",
    deviceId,
    userAgent: navigator.userAgent,
  });

  return { ok: true, token };
}

export async function deleteWebPushToken() {
  if (typeof window === "undefined") return;

  const deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (deviceId) {
    await deletePushToken(deviceId).catch(() => {});
  }

  const config = getFirebaseConfig();
  if (config && (await isSupported())) {
    await deleteToken(getMessaging(getApp(config))).catch(() => {});
  }
}
