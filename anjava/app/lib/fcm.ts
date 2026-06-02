import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from "firebase/messaging";
import { initializeApp, type FirebaseOptions } from "firebase/app";
import { deletePushToken, getMySettings, registerPushToken } from "./api";

const DEVICE_ID_KEY = "anjavaPushDeviceId";
const FIREBASE_CONFIG: Required<
  Pick<FirebaseOptions, "apiKey" | "authDomain" | "projectId" | "storageBucket" | "messagingSenderId" | "appId">
> & { measurementId: string } = {
  apiKey: "AIzaSyB9QbJ1OeudBnGgaKjGYa2tYtnNbJKNogA",
  authDomain: "anjava-52950.firebaseapp.com",
  projectId: "anjava-52950",
  storageBucket: "anjava-52950.firebasestorage.app",
  messagingSenderId: "56363432316",
  appId: "1:56363432316:web:01983736728ba677cdccf9",
  measurementId: "G-TMEM3K29LC",
};

let firebaseApp: ReturnType<typeof initializeApp> | null = null;
let foregroundMessageListenerReady = false;

type SyncWebPushTokenOptions = {
  requestPermission?: boolean;
};

type SyncWebPushTokenResult =
  | { ok: true; token: string; deviceId: string }
  | {
      ok: false;
      reason:
        | "server"
        | "unsupported"
        | "permission-default"
        | "permission-denied"
        | "empty-token"
        | "token-request-failed"
        | "token-registration-failed";
    };

function getFirebaseConfig(): FirebaseOptions {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? FIREBASE_CONFIG.apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? FIREBASE_CONFIG.authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? FIREBASE_CONFIG.projectId,
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? FIREBASE_CONFIG.storageBucket,
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
      FIREBASE_CONFIG.messagingSenderId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? FIREBASE_CONFIG.appId,
    measurementId:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? FIREBASE_CONFIG.measurementId,
  };

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

  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`, {
    scope: "/",
  });
}

function getNotificationContent(payload: MessagePayload) {
  const notification = payload.notification ?? {};
  const data = payload.data ?? {};
  return {
    title: notification.title ?? data.title ?? "Anjava 알림",
    options: {
      body: notification.body ?? data.body ?? "자세 상태를 확인해주세요.",
      icon: notification.icon ?? "/logo.png",
      badge: "/logo.png",
      data: {
        url: data.url ?? "/dashboard",
        ...data,
      },
    } satisfies NotificationOptions,
  };
}

function setupForegroundMessageListener(registration: ServiceWorkerRegistration) {
  if (foregroundMessageListenerReady) return;
  foregroundMessageListenerReady = true;

  onMessage(getMessaging(getApp(getFirebaseConfig())), (payload) => {
    if (Notification.permission !== "granted") return;
    const { title, options } = getNotificationContent(payload);
    void registration.showNotification(title, options);
  });
}

async function isMessagingSupported() {
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function syncWebPushToken(
  options: SyncWebPushTokenOptions = { requestPermission: true },
): Promise<SyncWebPushTokenResult> {
  if (typeof window === "undefined") return { ok: false, reason: "server" };
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!(await isMessagingSupported())) return { ok: false, reason: "unsupported" };

  const config = getFirebaseConfig();
  const vapidKey = getVapidKey();
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : options.requestPermission
        ? await Notification.requestPermission()
        : Notification.permission;

  if (permission === "default") return { ok: false, reason: "permission-default" };
  if (permission !== "granted") return { ok: false, reason: "permission-denied" };

  const registration = await getServiceWorkerRegistration(config);
  let token = "";
  try {
    token = await getToken(getMessaging(getApp(config)), {
      ...(vapidKey ? { vapidKey } : {}),
      serviceWorkerRegistration: registration,
    });
  } catch {
    return { ok: false, reason: "token-request-failed" };
  }
  if (!token) return { ok: false, reason: "empty-token" };

  const deviceId = getDeviceId();
  try {
    await registerPushToken({
      token,
      platform: "web",
      deviceId,
      userAgent: navigator.userAgent,
    });
  } catch {
    return { ok: false, reason: "token-registration-failed" };
  }

  setupForegroundMessageListener(registration);

  return { ok: true, token, deviceId };
}

export async function syncWebPushTokenIfEnabled() {
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  try {
    const settings = await getMySettings();
    if (settings.pushEnabled) {
      await syncWebPushToken({ requestPermission: false });
    }
  } catch {
    // Push token sync must not block login/navigation.
  }
}

export async function deleteWebPushToken() {
  if (typeof window === "undefined") return;

  const deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (deviceId) {
    await deletePushToken(deviceId).catch(() => {});
  }

  const config = getFirebaseConfig();
  if (await isMessagingSupported()) {
    await deleteToken(getMessaging(getApp(config))).catch(() => {});
  }

  localStorage.removeItem(DEVICE_ID_KEY);
}
