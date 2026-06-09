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
const LOCAL_POSTURE_ALERT_COOLDOWN_MS = 3 * 60 * 1000;
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
const localPostureAlertAt = new Map<string, number>();

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

function showBrowserNotification(title: string, options: NotificationOptions) {
  const notification = new Notification(title, options);
  notification.onclick = () => {
    const targetUrl =
      typeof options.data === "object" && options.data !== null && "url" in options.data
        ? String((options.data as { url?: unknown }).url ?? "/dashboard")
        : "/dashboard";
    window.focus();
    if (window.location.pathname !== targetUrl) window.location.assign(targetUrl);
    notification.close();
  };
}

function playAlertTone(soundEnabled: boolean) {
  if (!soundEnabled) return;
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    const playNote = (frequency: number, start: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    };

    const now = ctx.currentTime;
    playNote(1046.5, now, 0.17);
    playNote(1318.5, now + 0.14, 0.24);
    window.setTimeout(() => ctx.close().catch(() => {}), 650);
  } catch {}
}

export async function showLocalPostureNotification({
  state,
  message,
  soundEnabled = true,
}: {
  state: string;
  message: string;
  soundEnabled?: boolean;
}) {
  if (typeof window === "undefined") return;
  if (!message.trim()) return;
  if (state === "GOOD_POSTURE" || state === "GOOD") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  const now = Date.now();
  const lastAt = localPostureAlertAt.get(state) ?? 0;
  if (now - lastAt < LOCAL_POSTURE_ALERT_COOLDOWN_MS) return;
  localPostureAlertAt.set(state, now);
  playAlertTone(soundEnabled);

  const title = "자세 교정 알림";
  const options = {
    body: message,
    icon: "/logo.png",
    silent: !soundEnabled,
    tag: `anjava-posture-${state}`,
    data: { url: "/dashboard", state },
  } satisfies NotificationOptions;

  // 자세 감지는 열린 웹 페이지에서 실행되므로 데스크톱 알림은 페이지가 직접
  // 생성한다. Windows Chromium에서 서비스 워커 알림이 알림 센터에만 쌓이고
  // 배너가 생략되는 경우를 피하면서 클릭 동작도 동일하게 유지한다.
  showBrowserNotification(title, options);
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
