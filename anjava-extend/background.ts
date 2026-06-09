const WEB_URL = (process.env.PLASMO_PUBLIC_WEB_URL ?? "https://anjava.vercel.app").replace(/\/$/, "")
const API_BASE = `${WEB_URL}/api/backend`
const FCM_SENDER_ID = process.env.PLASMO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? ""
const DEBUG_ENABLED = process.env.PLASMO_PUBLIC_DEBUG === "1"

const BREAK_TIPS = [
  "잠깐 일어나서 몸을 풀어주세요!",
  "눈을 감고 10초간 쉬어보세요.",
  "목과 어깨를 천천히 돌려보세요.",
  "허리를 펴고 자세를 다시 잡아보세요.",
  "물 한 잔 마시고 돌아오세요.",
  "짧은 휴식이 집중력을 높여줍니다."
]

const BREAK_ALARM = "break-reminder"
const APPROVAL_NOTIFICATION_PREFIX = "approval-request-"
const APPROVAL_TIMEOUT_MS = 60_000
const AUTH_STORAGE_KEY = ["access", "Token"].join("")
const POSTURE_ALERT_COOLDOWN_MS = 3 * 60 * 1000
const DASHBOARD_URL = `${WEB_URL}/dashboard`

let pendingOffscreenData: {
  accessToken: string; userId: string; baselineData: unknown
  sessionId: string
  settings: { darkDetectionEnabled: boolean }
} | null = null

type ExtensionSettings = {
  postureInterval?: number
  breakInterval?: number
  pushEnabled?: boolean
  soundEnabled?: boolean
  darkDetectionEnabled?: boolean
}

type PostureMessage = {
  type: "POSTURE_ALERT" | "POSTURE_ALERT_OFFSCREEN" | "POSTURE_ALERT_FROM_WEB"
  state?: string
  message?: string
  soundEnabled?: boolean
  suppressSystemNotification?: boolean
}

type RuntimeMessage =
  | { type: "GET_STATUS" }
  | PostureMessage
  | { type: "REQUEST_APPROVAL_NOTIFICATION"; title?: string; message?: string; allowLabel?: string; denyLabel?: string }
  | { type: "OFFSCREEN_READY" }
  | { type: "BASELINE_REQUIRED" }
  | { type: "DETECTION_ACTIVE" }
  | { type: "OFFSCREEN_CAMERA_ERROR"; name?: string; message?: string }
  | { type: "CAMERA_PERMISSION_GRANTED" }
  | { type: "FLUSH_START"; count: number; sessionId: string }
  | { type: "OFFSCREEN_HEARTBEAT"; currentState: string; queueSize: number; hasToken: boolean }
  | { type: "FLUSH_RESULT"; ok: boolean; count?: number; accepted?: number; sessionId: string; status?: number; body?: string }
  | { type: "PAUSE_SESSION" }
  | { type: "RESUME_SESSION" }
  | { type: "END_SESSION" }
  | { type: "LOGIN"; accessToken: string; refreshToken?: string }
  | { type: "START_SESSION" }
  | { type: "LOGOUT" }
  | { type: "UPDATE_SETTINGS"; settings: ExtensionSettings }
  | { type: "FETCH_USER_SETTINGS" }
  | { type: "APPROVAL_RESULT"; requestId: string; approved: boolean }
  | { type: "START_DETECTION" | "STOP_DETECTION" }

type ExternalMessage =
  | { type: "PING" }
  | { type: "GET_STATUS" }
  | { type: "BASELINE_DONE"; baselineData: unknown }
  | { type: "LOGIN_FROM_WEB"; credential?: unknown; refreshToken?: unknown }

type ApiJson = {
  data?: unknown
  message?: string
  error?: { message?: string; validationErrors?: unknown }
  validationErrors?: unknown
}

type ApiError = Error & {
  status?: number
  responseBody?: unknown
  validationErrors?: unknown
}

type UserInfoResponse = {
  id: string
  name?: string
  profileImg?: string | null
  settings: {
    pushEnabled?: boolean
    soundEnabled?: boolean
    darkDetectionEnabled?: boolean
  }
}

type ApprovalNotificationOptions = {
  title: string
  message: string
  allowLabel?: string
  denyLabel?: string
}

type ApprovalNotificationResult = {
  approved: boolean
  reason: "allow" | "deny" | "closed" | "timeout"
}

type PendingApproval = {
  resolve: (result: ApprovalNotificationResult) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const pendingApprovals = new Map<string, PendingApproval>()
const lastPostureAlertAt = new Map<string, number>()
const notificationClickTargets = new Map<string, string>()
let paddedNotificationIconUrlPromise: Promise<string> | null = null

function debugLog(...args: unknown[]): void {
  if (DEBUG_ENABLED) console.log(...args)
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function getNotificationIcon(): Promise<string> {
  if (!paddedNotificationIconUrlPromise) {
    paddedNotificationIconUrlPromise = (async () => {
      const fallback = chrome.runtime.getURL("assets/logo.png")
      try {
        const source = await fetch(fallback)
        const blob = await source.blob()
        const bitmap = await createImageBitmap(blob)
        const size = 128
        const padding = 28
        const box = size - padding * 2
        const scale = Math.min(box / bitmap.width, box / bitmap.height)
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = new OffscreenCanvas(size, size)
        const ctx = canvas.getContext("2d")
        if (!ctx) return fallback
        ctx.clearRect(0, 0, size, size)
        ctx.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
        const out = await canvas.convertToBlob({ type: "image/png" })
        const base64 = bytesToBase64(new Uint8Array(await out.arrayBuffer()))
        return `data:image/png;base64,${base64}`
      } catch (error) {
        console.warn("[notification] 아이콘 생성 실패, 기본 아이콘 사용:", error)
        return fallback
      }
    })()
  }

  return paddedNotificationIconUrlPromise
}

async function playPostureAlertSound(soundEnabled: boolean): Promise<void> {
  if (!soundEnabled) return
  try {
    await chrome.runtime.sendMessage({
      type: "PLAY_ALERT_SOUND",
      soundEnabled,
    }).catch(() => {})
  } catch {}
}

// ─── API ────────────────────────────────────────────────────
async function apiCall<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const stored = await chrome.storage.local.get(["accessToken", "refreshToken"])
  const headers: Record<string, string> = { "Accept": "application/json", "Content-Type": "application/json" }
  if (stored.accessToken) headers.Authorization = `Bearer ${stored.accessToken}`

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (res.status === 401 && retry && stored.refreshToken) {
    const r = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored.refreshToken })
    })
    if (r.ok) {
      const d = await r.json()
      await chrome.storage.local.set({
        accessToken: d.data.accessToken,
        refreshToken: d.data.refreshToken
      })
      return apiCall<T>(path, init, false)
    }
    await chrome.storage.local.remove([
      "accessToken", "refreshToken", "currentSessionId", "sessionStartedAt"
    ])
    throw Object.assign(new Error("AUTH_FAILED"), { status: 401 })
  }

  const json = await res.json().catch(() => ({})) as ApiJson
  if (!res.ok) {
    const err: ApiError = Object.assign(
      new Error(json.message ?? json.error?.message ?? `HTTP ${res.status}`),
      {
        status: res.status,
        responseBody: json,
        validationErrors: json.validationErrors ?? json.error?.validationErrors,
      },
    )
    throw err
  }
  return (json.data ?? json) as T
}

function getExtensionDeviceId(): Promise<string> {
  return chrome.storage.local.get("pushDeviceId").then(({ pushDeviceId }) => {
    if (typeof pushDeviceId === "string" && pushDeviceId) return pushDeviceId
    const id = crypto.randomUUID?.() ?? `extension-${Date.now()}-${Math.random().toString(36).slice(2)}`
    return chrome.storage.local.set({ pushDeviceId: id }).then(() => id)
  })
}

function registerGcmToken(): Promise<string | null> {
  if (!FCM_SENDER_ID || !chrome.gcm?.register) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    chrome.gcm.register([FCM_SENDER_ID], (registrationId) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      resolve(registrationId || null)
    })
  })
}

function unregisterGcmToken(): Promise<void> {
  if (!chrome.gcm?.unregister) return Promise.resolve()
  return new Promise((resolve) => {
    chrome.gcm.unregister(() => resolve())
  })
}

async function syncExtensionPushToken(enabled: boolean): Promise<void> {
  const deviceId = await getExtensionDeviceId()

  if (!enabled) {
    await apiCall(`/users/me/push-tokens/${encodeURIComponent(deviceId)}`, { method: "DELETE" }).catch(() => {})
    await unregisterGcmToken()
    return
  }

  const token = await registerGcmToken()
  if (!token) return

  await apiCall("/users/me/push-tokens", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: "extension",
      deviceId,
      userAgent: navigator.userAgent,
    }),
  })
}

// ─── Session ─────────────────────────────────────────────────
async function startSession(): Promise<void> {
  const stored = await chrome.storage.local.get(["accessToken", "currentSessionId"])
  if (!stored.accessToken) return

  // 실제 세션 ID가 이미 있으면 offscreen만 시작 (local- 폴백은 무효 처리)
  const isRealSession = stored.currentSessionId && !String(stored.currentSessionId).startsWith("local-")
  if (isRealSession) {
    try { await startOffscreenDetection() } catch {}
    return
  }
  const startedAt = new Date().toISOString()
  try {
    const data = await apiCall<{ sessionId: string; startedAt: string }>(
      "/sessions",
      { method: "POST", body: JSON.stringify({ startedAt }) }
    )
    await chrome.storage.local.set({
      currentSessionId: data.sessionId,
      sessionStartedAt: data.startedAt
    })
  } catch (apiErr: unknown) {
    const err = apiErr as ApiError
    if (err.status === 409) {
      // 이미 진행 중인 세션 → GET /sessions/current로 기존 세션 ID 복원
      try {
        const cur = await apiCall<{ sessionId: string; startedAt: string } | null>(
          "/sessions/current", { method: "GET" }
        )
        if (cur?.sessionId) {
          await chrome.storage.local.set({
            currentSessionId: cur.sessionId,
            sessionStartedAt: cur.startedAt
          })
          debugLog("[session] 기존 세션 복원:", cur.sessionId)
        }
      } catch {
        await chrome.storage.local.set({
          currentSessionId: `local-${Date.now()}`,
          sessionStartedAt: startedAt
        })
      }
    } else if (err.status === 404 || String(err.message).includes("404")) {
      console.warn("[session] API 없음 → 로컬 세션 생성")
      await chrome.storage.local.set({
        currentSessionId: `local-${Date.now()}`,
        sessionStartedAt: startedAt
      })
    } else {
      console.error("[session] start 실패:", err)
      await chrome.storage.local.set({
        currentSessionId: `local-${Date.now()}`,
        sessionStartedAt: startedAt
      })
    }
  }
  try { await startOffscreenDetection() } catch {}
}

async function endSession(): Promise<void> {
  try { await stopOffscreenDetection() } catch {}
  const { currentSessionId } = await chrome.storage.local.get("currentSessionId")
  if (!currentSessionId) return
  // 로컬 세션이 아닐 때만 API 호출
  if (!String(currentSessionId).startsWith("local-")) {
    try {
      await apiCall(`/sessions/${currentSessionId}/end`, {
        method: "POST",
        body: JSON.stringify({ endedAt: new Date().toISOString() })
      })
    } catch (e) {
      console.error("[session] end:", e)
    }
  }
  await chrome.storage.local.remove(["currentSessionId", "sessionStartedAt"])
}

// ─── Offscreen ───────────────────────────────────────────────
async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("tabs/offscreen.html"),
    reasons: ["USER_MEDIA" as any],
    justification: "Webcam access for background posture detection and alert playback"
  })
}

async function closeOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument()
      debugLog("[offscreen] document closed")
  }
}

async function startOffscreenDetection(): Promise<void> {
  const { accessToken, userId, baselineData, settings, currentSessionId } =
    await chrome.storage.local.get(["accessToken", "userId", "baselineData", "settings", "currentSessionId"])
  if (!accessToken) {
    console.warn("[offscreen] 시작 불가 - accessToken 없음")
    return
  }
  // baselineData 없으면 null로 동작 (brightness 보정 없이 감지)
  let resolvedUserId = userId
  if (!resolvedUserId && accessToken) {
    try {
      const meRes = await fetch(`${API_BASE}/users/me`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }
      })
      if (meRes.ok) {
        const meJson = await meRes.json()
        resolvedUserId = meJson.data?.id
        if (resolvedUserId) await chrome.storage.local.set({ userId: resolvedUserId })
      }
    } catch {}
  }
  if (!resolvedUserId) {
    console.warn("[offscreen] 시작 불가 - userId 없음")
    return
  }
  await chrome.storage.local.remove("offscreenError")
  pendingOffscreenData = {
    accessToken, userId: resolvedUserId, baselineData,
    sessionId: currentSessionId ?? "",
    settings: { darkDetectionEnabled: settings?.darkDetectionEnabled ?? false }
  }
  try {
    await ensureOffscreen()
  } catch (e) {
    console.error("[offscreen] createDocument 실패:", e)
    pendingOffscreenData = null
    return
  }
  // fallback: if OFFSCREEN_READY not received in 3s, send START_DETECTION directly
  setTimeout(() => {
    if (!pendingOffscreenData) return
    console.warn("[offscreen] OFFSCREEN_READY 미수신 → 강제 START_DETECTION")
    const data = pendingOffscreenData
    pendingOffscreenData = null
    chrome.runtime.sendMessage({ type: "START_DETECTION", ...data })
      .then(() => debugLog("[offscreen] 강제 START_DETECTION 완료"))
      .catch(e => console.error("[offscreen] 강제 START_DETECTION 실패:", e))
  }, 3000)
}

async function stopOffscreenDetection(): Promise<void> {
  const has = await chrome.offscreen.hasDocument()
  if (!has) {
    chrome.storage.local.set({ offscreenActive: false })
    return
  }
  chrome.runtime.sendMessage({ type: "STOP_DETECTION" }).catch(() => {})
  await new Promise<void>(r => setTimeout(r, 200))
  chrome.storage.local.set({ offscreenActive: false })
  await closeOffscreen()
}

// ─── Notifications ───────────────────────────────────────────
const TOAST_MESSAGES: Record<string, string> = {
  TURTLE_NECK:        "거북목 자세가 감지됐어요. 목을 바르게 세워주세요.",
  turtle_neck:        "거북목 자세가 감지됐어요. 목을 바르게 세워주세요.",
  SHOULDER_ISSUE:     "어깨 자세 이상이 감지됐어요. 어깨를 뒤로 펴주세요.",
  ROUND_SHOULDER:     "라운드숄더가 감지됐어요. 어깨를 뒤로 펴주세요.",
  round_shoulder:     "라운드숄더가 감지됐어요. 어깨를 뒤로 펴주세요.",
  SHOULDER_ASYMMETRY: "어깨 비대칭이 감지됐어요. 어깨 높이를 맞춰주세요.",
  shoulder_tilted:    "어깨 비대칭이 감지됐어요. 어깨 높이를 맞춰주세요.",
  DARK_ENV:           "어두운 환경이 감지됐어요. 주변 밝기를 높여주세요.",
  dark_env:           "어두운 환경이 감지됐어요. 주변 밝기를 높여주세요.",
  GOOD_POSTURE:       "자세가 교정됐어요. 바른 자세를 유지해보세요.",
}

type NotificationSettings = {
  pushEnabled?: boolean
  soundEnabled?: boolean
}

type TabWithLastAccessed = chrome.tabs.Tab & { lastAccessed?: number }

function getTabLastAccessed(tab: chrome.tabs.Tab): number {
  return (tab as TabWithLastAccessed).lastAccessed ?? 0
}

async function getToastTargetTabs(): Promise<chrome.tabs.Tab[]> {
  const activeFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const activeTabs = activeFocused.length > 0
    ? activeFocused
    : await chrome.tabs.query({ active: true })
  const httpTabs = activeTabs.filter((tab) => tab?.id && tab.url?.match(/^https?:\/\//))
  if (httpTabs.length > 0) return httpTabs

  const allTabs = await chrome.tabs.query({})
  return allTabs
    .filter((tab) => tab?.id && tab.url?.match(/^https?:\/\//))
    .sort((a, b) => getTabLastAccessed(b) - getTabLastAccessed(a))
    .slice(0, 1)
}

async function sendToActiveTab(msg: PostureMessage): Promise<void> {
  const tabs = await getToastTargetTabs()
  if (tabs.length === 0) {
    console.warn("[toast] ?? ??? HTTP/HTTPS ?? ????.")
    return
  }

  const tasks = tabs
    .filter((tab) => tab?.id && tab.url?.match(/^https?:\/\//))
    .map((tab) => chrome.tabs.sendMessage(tab.id!, msg).catch((e) => {
      console.warn("[toast] content script ??? ?? ??:", tab.url, e)
    }))

  await Promise.allSettled(tasks)
}

function getPostureAlertMessage(state: unknown, fallback: unknown): string {
  const key = typeof state === "string" ? state : ""
  const message = typeof fallback === "string" ? fallback : ""
  return TOAST_MESSAGES[key] ?? message ?? "자세를 확인해주세요."
}

function shouldShowSystemPostureNotification(state: unknown, message: string): boolean {
  return state !== "GOOD_POSTURE" && message.trim().length > 0
}

async function shouldSuppressSystemPostureNotification(msg: PostureMessage): Promise<boolean> {
  if (msg.suppressSystemNotification === true) return true

  const windows = await chrome.windows.getAll({ populate: true }).catch(() => [])
  const focusedWindow = windows.find((window) => window.focused)
  if (!focusedWindow?.tabs) return false

  const activeTab = focusedWindow.tabs.find((tab) => tab.active)
  const activeUrl = activeTab?.url ?? ""
  return activeUrl.startsWith(WEB_URL)
}

function isPostureSystemNotificationCoolingDown(state: unknown): boolean {
  const alertState = typeof state === "string" ? state : "UNKNOWN"
  if (alertState === "GOOD_POSTURE" || alertState === "GOOD") return false

  const now = Date.now()
  const lastAt = lastPostureAlertAt.get(alertState) ?? 0
  if (now - lastAt < POSTURE_ALERT_COOLDOWN_MS) {
    debugLog(`[notification] ${alertState} 시스템 알림 쿨다운으로 생략`)
    return true
  }

  lastPostureAlertAt.set(alertState, now)
  return false
}

async function showPostureSystemNotification(msg: PostureMessage, settings: NotificationSettings): Promise<void> {
  const message = getPostureAlertMessage(msg.state, msg.message)
  if (!shouldShowSystemPostureNotification(msg.state, message)) return
  if (isPostureSystemNotificationCoolingDown(msg.state)) return

  const notificationId = `posture-${Date.now()}`
  notificationClickTargets.set(notificationId, DASHBOARD_URL)
  const iconUrl = await getNotificationIcon()
  await chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl,
    title: "자세 교정 알림",
    message,
    priority: 2,
    silent: settings.soundEnabled === false,
  })
  await playPostureAlertSound(settings.soundEnabled !== false)
}

async function deliverPostureAlert(msg: PostureMessage, settings: NotificationSettings): Promise<void> {
  const soundEnabled = msg.soundEnabled ?? (settings.soundEnabled !== false)
  const alert: PostureMessage = {
    type: "POSTURE_ALERT",
    state: msg.state,
    message: getPostureAlertMessage(msg.state, msg.message),
    soundEnabled,
  }

  const tasks: Promise<void>[] = [sendToActiveTab(alert)]
  const suppressSystemNotification = await shouldSuppressSystemPostureNotification(msg)
  if (!suppressSystemNotification) {
    tasks.unshift(showPostureSystemNotification(alert, { ...settings, soundEnabled }))
  }

  const results = await Promise.allSettled(tasks)

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[notification] 자세 알림 처리 실패:", result.reason)
    }
  }
}

async function showNotification(): Promise<void> {
  const { settings } = await chrome.storage.local.get("settings")
  const s = settings || {}
  if (s.pushEnabled === false) return

  const message = rand(BREAK_TIPS)
  const notificationId = `break-${Date.now()}`
  notificationClickTargets.set(notificationId, DASHBOARD_URL)
  const iconUrl = await getNotificationIcon()

  await chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl,
    title: "휴식 알림",
    message,
    priority: 2,
    silent: s.soundEnabled === false
  })
}

function settleApprovalNotification(
  notificationId: string,
  result: ApprovalNotificationResult,
): void {
  const pending = pendingApprovals.get(notificationId)
  if (!pending) return

  clearTimeout(pending.timeoutId)
  pendingApprovals.delete(notificationId)
  pending.resolve(result)
  chrome.notifications.clear(notificationId)
}

async function requestApprovalNotification(
  options: ApprovalNotificationOptions,
): Promise<ApprovalNotificationResult> {
  const requestId = `${APPROVAL_NOTIFICATION_PREFIX}${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`

  const params = new URLSearchParams({
    requestId,
    title:      options.title,
    message:    options.message,
    allowLabel: options.allowLabel ?? "허용",
    denyLabel:  options.denyLabel  ?? "거부",
  })
  const url = chrome.runtime.getURL(`tabs/approval.html?${params.toString()}`)

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 400,
    height: 220,
    focused: true,
  })

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      settleApprovalNotification(requestId, { approved: false, reason: "timeout" })
      chrome.windows.remove(win.id!).catch(() => {})
    }, APPROVAL_TIMEOUT_MS)

    pendingApprovals.set(requestId, { resolve, timeoutId })
  })
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (!notificationId.startsWith(APPROVAL_NOTIFICATION_PREFIX)) return

  settleApprovalNotification(notificationId, {
    approved: buttonIndex === 0,
    reason: buttonIndex === 0 ? "allow" : "deny",
  })
})

async function openNotificationTarget(url: string): Promise<void> {
  const tabs = await chrome.tabs.query({ url: `${WEB_URL}/*` }).catch(() => [])
  const dashboardTab = tabs.find((tab) => tab.url?.startsWith(DASHBOARD_URL))
  const targetTab = dashboardTab ?? tabs[0]

  if (targetTab?.id) {
    await chrome.tabs.update(targetTab.id, { active: true, url }).catch(() => {})
    if (targetTab.windowId !== undefined) {
      await chrome.windows.update(targetTab.windowId, { focused: true }).catch(() => {})
    }
    return
  }

  await chrome.tabs.create({ url }).catch(() => {})
}

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith(APPROVAL_NOTIFICATION_PREFIX)) return

  const url = notificationClickTargets.get(notificationId) ?? DASHBOARD_URL
  notificationClickTargets.delete(notificationId)
  chrome.notifications.clear(notificationId)
  openNotificationTarget(url).catch((e) => {
    console.error("[notification] 클릭 이동 실패:", e)
  })
})

chrome.notifications.onClosed.addListener((notificationId) => {
  notificationClickTargets.delete(notificationId)
  if (!notificationId.startsWith(APPROVAL_NOTIFICATION_PREFIX)) return
  settleApprovalNotification(notificationId, { approved: false, reason: "closed" })
})

// ─── Alarms ──────────────────────────────────────────────────
async function stopAlarms(): Promise<void> {
  await chrome.alarms.clearAll()
}

async function restartAlarms(): Promise<void> {
  const { settings } = await chrome.storage.local.get("settings")
  const s = settings || { postureInterval: 30, breakInterval: 60 }
  await chrome.alarms.clearAll()
  chrome.alarms.create(BREAK_ALARM, {
    delayInMinutes: s.breakInterval,
    periodInMinutes: s.breakInterval
  })
}

async function getPublicExtensionStatus() {
  const stored = await chrome.storage.local.get([
    AUTH_STORAGE_KEY,
    "baselineDone",
    "currentSessionId",
    "isPaused",
    "offscreenActive",
    "offscreenError",
    "lastSettingsSyncedAt",
  ])
  return {
    ok: true,
    installed: true,
    loggedIn: typeof stored[AUTH_STORAGE_KEY] === "string" && stored[AUTH_STORAGE_KEY].length > 0,
    baselineDone: stored.baselineDone === true,
    sessionActive: typeof stored.currentSessionId === "string" && stored.currentSessionId.length > 0,
    isPaused: stored.isPaused === true,
    offscreenActive: stored.offscreenActive === true,
    offscreenError: typeof stored.offscreenError === "string" ? stored.offscreenError : "",
    lastSettingsSyncedAt:
      typeof stored.lastSettingsSyncedAt === "string" ? stored.lastSettingsSyncedAt : "",
  }
}

// ─── Lifecycle ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings")
  if (!settings) {
    await chrome.storage.local.set({
      settings: {
        postureInterval: 30,
        breakInterval: 60,
        pushEnabled: true,
        soundEnabled: true,
        darkDetectionEnabled: false
      }
    })
  }
  await startSession()
  await restartAlarms()
})

chrome.runtime.onStartup.addListener(async () => {
  // baseline은 유지 (Chrome 재시작해도 재측정 불필요)
  await startSession()
  await restartAlarms()
})

chrome.runtime.onSuspend.addListener(async () => {
  await endSession()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BREAK_ALARM) showNotification()
})

  chrome.gcm?.onMessage?.addListener((message) => {
  chrome.storage.local.get("settings").then(({ settings: s }) => {
    if (s?.pushEnabled === false) return

    const data = (message.data ?? {}) as Record<string, unknown>
    const title = typeof data.title === "string" ? data.title : "Anjava 알림"
    const body = typeof data.body === "string"
      ? data.body
      : typeof data.message === "string"
      ? data.message
      : "자세 상태를 확인해주세요."
    const notificationId = `fcm-${Date.now()}`
    const targetUrl = typeof data.url === "string" ? new URL(data.url, WEB_URL).href : DASHBOARD_URL
    notificationClickTargets.set(notificationId, targetUrl)
    getNotificationIcon().then((iconUrl) =>
      chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl,
        title,
        message: body,
        priority: 2,
        silent: s?.soundEnabled === false,
      })
    ).catch(() => {})
  })
})

// ─── Timeline ────────────────────────────────────────────────
// 백엔드 허용값: TURTLE_NECK, ROUND_SHOULDER, SHOULDER_ASYMMETRY, DARK_ENV, GOOD_POSTURE
const TIMELINE_STATE_MAP: Record<string, string> = {
  TURTLE_NECK:        "TURTLE_NECK",
  turtle_neck:        "TURTLE_NECK",
  SHOULDER_ISSUE:     "ROUND_SHOULDER",
  ROUND_SHOULDER:     "ROUND_SHOULDER",
  round_shoulder:     "ROUND_SHOULDER",
  SHOULDER_ASYMMETRY: "SHOULDER_ASYMMETRY",
  shoulder_tilted:    "SHOULDER_ASYMMETRY",
  DARK_ENV:           "DARK_ENV",
  dark_env:           "DARK_ENV",
  GOOD_POSTURE:       "GOOD_POSTURE",
  GOOD:               "GOOD_POSTURE",
}

function postTimeline(rawState: string, message: string): void {
  const dominantState = TIMELINE_STATE_MAP[rawState]
  if (!dominantState) return  // POSTURE_REMINDER 등 비감지 상태 제외

  const now = new Date()
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  })
  debugLog(`[timeline] POST date=${date} time=${time} state=${dominantState} msg="${message}"`)
  apiCall("/dashboard/timeline", {
    method: "POST",
    body: JSON.stringify({ date, time, dominantState, message: message ?? "" }),
  }).then(() => {
    debugLog(`[timeline] 저장 성공: ${dominantState}`)
  }).catch((e: ApiError) => {
    console.error(
      `[timeline] 저장 실패 [${dominantState}]:`,
      e.message,
      "status:",
      e.status,
      "validationErrors:",
      e.validationErrors,
      "response:",
      e.responseBody,
    )
  })
}

// ─── Messages ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
  const msg = rawMsg as RuntimeMessage
  // These types are sent FROM background TO offscreen — ignore if echoed back
  if (["START_DETECTION", "STOP_DETECTION"].includes(msg.type)) return

  if (msg.type === "GET_STATUS") {
    chrome.storage.local
      .get(["accessToken", "currentSessionId", "sessionStartedAt", "settings",
            "baselineDone", "isPaused", "pausedAt", "pausedTotalMs",
            "profileImg", "userName", "offscreenActive", "offscreenError",
            "lastSettingsSyncedAt"])
      .then(sendResponse)
    return true
  }

  if (msg.type === "POSTURE_ALERT_FROM_WEB") {
    chrome.storage.local.get("settings").then(({ settings: s }) => {
      if (s?.pushEnabled === false) {
        sendResponse({ ok: true, skipped: "push-disabled" })
        return
      }
      deliverPostureAlert(msg, s ?? {})
        .then(() => sendResponse({ ok: true }))
        .catch((e) => {
          console.error("[notification] web relay 처리 실패:", e)
          sendResponse({ ok: false, error: String(e?.message ?? e) })
        })
    })
    return true
  }

  if (msg.type === "REQUEST_APPROVAL_NOTIFICATION") {
    requestApprovalNotification({
      title: typeof msg.title === "string" ? msg.title : "작업 승인 요청",
      message: typeof msg.message === "string" ? msg.message : "이 작업을 실행할까요?",
      allowLabel: typeof msg.allowLabel === "string" ? msg.allowLabel : undefined,
      denyLabel: typeof msg.denyLabel === "string" ? msg.denyLabel : undefined,
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e) => {
        console.error("[approval] 알림 요청 실패:", e)
        sendResponse({ ok: false, error: String(e?.message ?? e) })
      })
    return true
  }

  if (msg.type === "APPROVAL_RESULT") {
    const requestId = typeof msg.requestId === "string" ? msg.requestId : ""
    const approved = msg.approved === true
    settleApprovalNotification(requestId, { approved, reason: approved ? "allow" : "deny" })
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "OFFSCREEN_READY") {
    if (pendingOffscreenData) {
      const data = pendingOffscreenData
      pendingOffscreenData = null
      chrome.runtime.sendMessage({ type: "START_DETECTION", ...data })
        .catch(e => console.error("[offscreen] START_DETECTION 전송 실패:", e))
    }
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "BASELINE_REQUIRED") {
    console.warn("[detection] ⚠️ baseline 재측정 필요 - 팝업에서 베이스라인 측정을 다시 실행하세요")
    chrome.storage.local.set({ baselineDone: false, baselineData: null })
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "DETECTION_ACTIVE") {
    chrome.storage.local.set({ offscreenActive: true, offscreenError: null })
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "OFFSCREEN_CAMERA_ERROR") {
    const name = msg.name ?? "UnknownError"
    const detail =
      name === "NotAllowedError"
        ? "카메라 권한이 거부되었습니다. 확장 프로그램 팝업에서 카메라 권한을 허용한 뒤 세션을 다시 시작해주세요."
        : name === "NotFoundError" || name === "DevicesNotFoundError"
        ? "사용 가능한 카메라를 찾지 못했습니다."
        : name === "NotReadableError" || name === "TrackStartError"
        ? "카메라가 다른 앱에서 사용 중이거나 OS 권한이 차단되어 있습니다."
        : msg.message || "카메라를 시작하지 못했습니다."
    chrome.storage.local.set({
      offscreenActive: false,
      offscreenError: `${name}: ${detail}`,
    })
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "CAMERA_PERMISSION_GRANTED") {
    chrome.storage.local.set({ offscreenActive: false, offscreenError: null })
      .then(async () => {
        await stopOffscreenDetection().catch(() => {})
        const { currentSessionId } = await chrome.storage.local.get("currentSessionId")
        if (currentSessionId) await startOffscreenDetection()
      })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }))
    return true
  }

  if (msg.type === "FLUSH_START") {
    debugLog(`[events] fetch 시작: ${msg.count}개 → session: ${msg.sessionId}`)
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "OFFSCREEN_HEARTBEAT") {
    debugLog(`[offscreen] heartbeat | state: ${msg.currentState} | queue: ${msg.queueSize} | hasToken: ${msg.hasToken}`)
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "FLUSH_RESULT") {
    if (msg.ok) {
      debugLog(`[events] 전송 성공 (${msg.count ?? 0}개, accepted: ${msg.accepted ?? 0}) session: ${msg.sessionId}`)
    } else {
      console.error(`[events] ❌ 전송 실패 HTTP ${msg.status} | session: ${msg.sessionId} | ${msg.body}`)
    }
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "PAUSE_SESSION") {
    chrome.storage.local.get("pausedTotalMs")
      .then(({ pausedTotalMs }) =>
        chrome.storage.local.set({
          isPaused: true,
          pausedAt: Date.now(),
          pausedTotalMs: pausedTotalMs ?? 0
        })
      )
      .then(() => stopAlarms())
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }))
    return true
  }

  if (msg.type === "RESUME_SESSION") {
    chrome.storage.local.get(["pausedAt", "pausedTotalMs"])
      .then(({ pausedAt, pausedTotalMs }) => {
        const added = pausedAt ? Date.now() - pausedAt : 0
        const total = (pausedTotalMs ?? 0) + added
        return chrome.storage.local
          .set({ isPaused: false, pausedAt: null, pausedTotalMs: total })
          .then(() => restartAlarms())
          .then(() => total)
      })
      .then((total) => sendResponse({ success: true, pausedTotalMs: total }))
      .catch(() => sendResponse({ success: false }))
    return true
  }

  if (msg.type === "END_SESSION") {
    endSession()
      .then(() => chrome.storage.local.set({ isPaused: false, pausedAt: null, pausedTotalMs: 0 }))
      .then(() => stopAlarms())
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }))
    return true
  }

  if (msg.type === "LOGIN") {
    chrome.storage.local
      .set({ accessToken: msg.accessToken, refreshToken: msg.refreshToken })
      .then(() => chrome.storage.local.get(["currentSessionId", "sessionStartedAt"]))
      .then(sendResponse)
    return true
  }

  if (msg.type === "START_SESSION") {
    startSession()
      .then(() => chrome.storage.local.get(["currentSessionId", "sessionStartedAt"]))
      .then(sendResponse)
    return true
  }

  if (msg.type === "LOGOUT") {
    Promise.resolve()
      .then(() => stopOffscreenDetection().catch(() => {}))
      .then(() => syncExtensionPushToken(false).catch(() => {}))
      .then(() => endSession())
      .then(() =>
        chrome.storage.local.remove([
          "accessToken", "refreshToken", "currentSessionId", "sessionStartedAt",
          "baselineDone", "baselineData", "userId", "profileImg", "userName"
        ])
      )
      .then(() =>
        chrome.storage.local.set({ isPaused: false, pausedAt: null, pausedTotalMs: 0 })
      )
      .then(() => stopAlarms())
      .then(() => sendResponse({ success: true }))
    return true
  }

  if (msg.type === "UPDATE_SETTINGS") {
    const next = msg.settings
    chrome.storage.local.set({ settings: next }).then(async () => {
      await restartAlarms()
      try {
        await apiCall("/users/me/settings", {
          method: "PATCH",
          body: JSON.stringify({
            pushEnabled: next.pushEnabled,
            soundEnabled: next.soundEnabled
          })
        })
        await syncExtensionPushToken(next.pushEnabled !== false)
        if (next.darkDetectionEnabled !== undefined) {
          await apiCall("/users/me/dark-detection", {
            method: "PATCH",
            body: JSON.stringify({ enabled: next.darkDetectionEnabled })
          })
        }
        await chrome.storage.local.set({ lastSettingsSyncedAt: new Date().toISOString() })
      } catch (e) {
        console.error("[settings] sync:", e)
      }
      sendResponse({ success: true })
      chrome.offscreen.hasDocument().then(has => {
        if (has) chrome.runtime.sendMessage({
          type: "UPDATE_SETTINGS",
          settings: { darkDetectionEnabled: next.darkDetectionEnabled ?? false }
        }).catch(() => {})
      })
    })
    return true
  }

  if (msg.type === "POSTURE_ALERT") {
    postTimeline(msg.state ?? "", msg.message ?? "")
    chrome.storage.local.get("settings").then(({ settings: s }) => {
      if (s?.pushEnabled === false) {
        sendResponse({ success: true, skipped: "push-disabled" })
        return
      }
      deliverPostureAlert(msg, s ?? {})
        .then(() => sendResponse({ success: true }))
        .catch((e) => {
          console.error("[notification] posture alert 처리 실패:", e)
          sendResponse({ success: false, error: String(e?.message ?? e) })
        })
    })
    return true
  }

  if (msg.type === "POSTURE_ALERT_OFFSCREEN") {
    postTimeline(msg.state ?? "", msg.message ?? "")
    chrome.storage.local.get("settings").then(({ settings: s }) => {
      if (s?.pushEnabled === false) {
        sendResponse({ success: true, skipped: "push-disabled" })
        return
      }
      deliverPostureAlert(msg, s ?? {})
        .then(() => sendResponse({ success: true }))
        .catch((e) => {
          console.error("[notification] offscreen alert 처리 실패:", e)
          sendResponse({ success: false, error: String(e?.message ?? e) })
        })
    })
    return true
  }

  if (msg.type === "FETCH_USER_SETTINGS") {
    apiCall<UserInfoResponse>("/users/me", { method: "GET" })
      .then((me) =>
        chrome.storage.local.get("settings").then(async ({ settings: local }) => {
          const merged = {
            postureInterval: local?.postureInterval ?? 30,
            breakInterval: local?.breakInterval ?? 60,
            pushEnabled: me.settings.pushEnabled ?? true,
            soundEnabled: me.settings.soundEnabled ?? true,
            darkDetectionEnabled: me.settings.darkDetectionEnabled ?? false
          }
          await syncExtensionPushToken(merged.pushEnabled).catch((e) =>
            console.error("[push] extension FCM 토큰 동기화 실패:", e)
          )
          const lastSettingsSyncedAt = new Date().toISOString()
          chrome.storage.local.set({
            settings: merged,
            userId: me.id,
            profileImg: me.profileImg ?? "",
            userName: me.name ?? "",
            lastSettingsSyncedAt,
          })
          sendResponse({ settings: merged, name: me.name, profileImg: me.profileImg ?? "", lastSettingsSyncedAt })
        })
      )
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }
})

// ─── External messages (web page → extension) ────────────
chrome.runtime.onMessageExternal.addListener((rawMsg, _sender, sendResponse) => {
  const msg = rawMsg as ExternalMessage
  if (msg.type === "PING") {
    sendResponse({ ok: true })
    return false
  }

  if (msg.type === "GET_STATUS") {
    getPublicExtensionStatus()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }))
    return true
  }

  if (msg.type === "LOGIN_FROM_WEB") {
    if (typeof msg.credential !== "string" || !msg.credential) {
      sendResponse({ ok: false, error: "missing-access-token" })
      return false
    }

    chrome.storage.local
      .set({
        [AUTH_STORAGE_KEY]: msg.credential,
        ...(typeof msg.refreshToken === "string" && msg.refreshToken
          ? { refreshToken: msg.refreshToken }
          : {}),
      })
      .then(() => apiCall<UserInfoResponse>("/users/me", { method: "GET" }))
      .then((me) =>
        chrome.storage.local.get("settings").then(async ({ settings: local }) => {
          const merged = {
            postureInterval: local?.postureInterval ?? 30,
            breakInterval: local?.breakInterval ?? 60,
            pushEnabled: me.settings.pushEnabled ?? true,
            soundEnabled: me.settings.soundEnabled ?? true,
            darkDetectionEnabled: me.settings.darkDetectionEnabled ?? false,
          }
          await chrome.storage.local.set({
            settings: merged,
            userId: me.id,
            profileImg: me.profileImg ?? "",
            userName: me.name ?? "",
            lastSettingsSyncedAt: new Date().toISOString(),
          })
          await syncExtensionPushToken(merged.pushEnabled).catch((e) =>
            console.error("[push] extension FCM 토큰 동기화 실패:", e)
          )
        })
      )
      .then(() => {
        const notificationId = `login-success-${Date.now()}`
        notificationClickTargets.set(notificationId, DASHBOARD_URL)
        getNotificationIcon().then((iconUrl) =>
          chrome.notifications.create(notificationId, {
            type: "basic",
            iconUrl,
            title: "로그인 완료",
            message: "확장 프로그램 팝업을 열어 사용을 시작하세요.",
            priority: 1,
          })
        ).catch(() => {})
        sendResponse({ ok: true })
      })
      .catch((e) => {
        console.error("[auth] web login sync 실패:", e)
        sendResponse({ ok: false, error: String(e?.message ?? e) })
      })
    return true
  }

  if (msg.type === "BASELINE_DONE") {
    chrome.storage.local.set({ baselineDone: true, baselineData: msg.baselineData })
      .then(() => startSession())
      .then(() => chrome.storage.local.get(["currentSessionId", "sessionStartedAt"]))
      .then(sendResponse)
    return true
  }
})

export {}
