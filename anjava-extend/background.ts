const WEB_URL = (process.env.PLASMO_PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")
const API_BASE = `${WEB_URL}/api/backend`
const FCM_SENDER_ID = process.env.PLASMO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? ""

const BREAK_TIPS = [
  "?? ???? ???? ????!",
  "?? ?? 10?? ?????.",
  "? ? ? ???? ?????.",
  "?? ??? ?? ??? ?????.",
  "??? ?? ?? ??? ?????.",
  "????? ??? ???? ????."
]

const BREAK_ALARM = "break-reminder"

let pendingOffscreenData: {
  accessToken: string; userId: string; baselineData: any
  sessionId: string
  settings: { darkDetectionEnabled: boolean }
} | null = null

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getNotificationIcon(): string {
  const icons = (chrome.runtime.getManifest() as any).icons ?? {}
  const path = icons["128"] ?? icons["48"] ?? icons["32"] ?? ""
  return path ? chrome.runtime.getURL(path) : ""
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

  const json = await res.json().catch(() => ({})) as any
  if (!res.ok) {
    const err = Object.assign(
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
  } catch (apiErr: any) {
    if (apiErr?.status === 409) {
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
          console.log("[session] 기존 세션 복원:", cur.sessionId)
        }
      } catch {
        await chrome.storage.local.set({
          currentSessionId: `local-${Date.now()}`,
          sessionStartedAt: startedAt
        })
      }
    } else if (apiErr?.status === 404 || String(apiErr?.message).includes("404")) {
      console.warn("[session] API 없음 → 로컬 세션 생성")
      await chrome.storage.local.set({
        currentSessionId: `local-${Date.now()}`,
        sessionStartedAt: startedAt
      })
    } else {
      console.error("[session] start 실패:", apiErr)
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
    justification: "Webcam access for background posture detection"
  })
}

async function closeOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument()
    console.log("[offscreen] document closed")
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
      .then(() => console.log("[offscreen] 강제 START_DETECTION 완료"))
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
  TURTLE_NECK:        "??? ??? ?????. ?? ??? ?????.",
  turtle_neck:        "??? ??? ?????. ?? ??? ?????.",
  SHOULDER_ISSUE:     "?? ?? ??? ?????. ??? ?? ????.",
  ROUND_SHOULDER:     "?????? ?????. ??? ?? ????.",
  round_shoulder:     "?????? ?????. ??? ?? ????.",
  SHOULDER_ASYMMETRY: "?? ???? ?????. ?? ??? ?????.",
  shoulder_tilted:    "?? ???? ?????. ?? ??? ?????.",
  DARK_ENV:           "??? ??? ?????. ?? ??? ?????.",
  dark_env:           "??? ??? ?????. ?? ??? ?????.",
  GOOD_POSTURE:       "??? ?????. ?? ??? ??????.",
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

async function sendToActiveTab(msg: any): Promise<void> {
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

async function showPostureSystemNotification(msg: any, settings: NotificationSettings): Promise<void> {
  const message = getPostureAlertMessage(msg.state, msg.message)
  if (!shouldShowSystemPostureNotification(msg.state, message)) return

  await chrome.notifications.create(`posture-${Date.now()}`, {
    type: "basic",
    iconUrl: getNotificationIcon(),
    title: "자세 교정 알림",
    message,
    priority: 2,
    silent: settings.soundEnabled === false,
  })
}

async function deliverPostureAlert(msg: any, settings: NotificationSettings): Promise<void> {
  const soundEnabled = msg.soundEnabled ?? (settings.soundEnabled !== false)
  const alert = {
    type: "POSTURE_ALERT",
    state: msg.state,
    message: getPostureAlertMessage(msg.state, msg.message),
    soundEnabled,
  }

  const results = await Promise.allSettled([
    showPostureSystemNotification(alert, { ...settings, soundEnabled }),
    sendToActiveTab(alert),
  ])

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

  await chrome.notifications.create({
    type: "basic",
    iconUrl: getNotificationIcon(),
    title: "휴식 알림",
    message,
    priority: 2,
    silent: s.soundEnabled === false
  })
}

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

    chrome.notifications.create(`fcm-${Date.now()}`, {
      type: "basic",
      iconUrl: getNotificationIcon(),
      title,
      message: body,
      priority: 2,
      silent: s?.soundEnabled === false,
    })
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
  console.log(`[timeline] POST date=${date} time=${time} state=${dominantState} msg="${message}"`)
  apiCall("/dashboard/timeline", {
    method: "POST",
    body: JSON.stringify({ date, time, dominantState, message: message ?? "" }),
  }).then(() => {
    console.log(`[timeline] 저장 성공: ${dominantState}`)
  }).catch((e: any) => {
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
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // These types are sent FROM background TO offscreen — ignore if echoed back
  if (["START_DETECTION", "STOP_DETECTION"].includes(msg.type)) return

  if (msg.type === "GET_STATUS") {
    chrome.storage.local
      .get(["accessToken", "currentSessionId", "sessionStartedAt", "settings",
            "baselineDone", "isPaused", "pausedAt", "pausedTotalMs",
            "profileImg", "userName", "offscreenActive", "offscreenError"])
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

  if (msg.type === "FLUSH_START") {
    console.log(`[events] 🚀 fetch 시작: ${msg.count}개 → session: ${msg.sessionId}`)
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "OFFSCREEN_HEARTBEAT") {
    console.log(`[offscreen] 💓 heartbeat | state: ${msg.currentState} | queue: ${msg.queueSize} | hasToken: ${msg.hasToken}`)
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "FLUSH_RESULT") {
    if (msg.ok) {
      console.log(`[events] ✅ ${msg.count}개 전송 성공 (accepted: ${msg.accepted}) session: ${msg.sessionId}`)
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
        await syncExtensionPushToken(next.pushEnabled)
        if (next.darkDetectionEnabled !== undefined) {
          await apiCall("/users/me/dark-detection", {
            method: "PATCH",
            body: JSON.stringify({ enabled: next.darkDetectionEnabled })
          })
        }
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
    postTimeline(msg.state, msg.message)
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
    postTimeline(msg.state, msg.message)
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
    apiCall<any>("/users/me", { method: "GET" })
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
          chrome.storage.local.set({ settings: merged, userId: me.id, profileImg: me.profileImg ?? "", userName: me.name ?? "" })
          sendResponse({ settings: merged, name: me.name, profileImg: me.profileImg ?? "" })
        })
      )
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }
})

// ─── External messages (web page → extension) ────────────
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "BASELINE_DONE") {
    chrome.storage.local.set({ baselineDone: true, baselineData: msg.baselineData })
      .then(() => startSession())
      .then(() => chrome.storage.local.get(["currentSessionId", "sessionStartedAt"]))
      .then(sendResponse)
    return true
  }
})

export {}
