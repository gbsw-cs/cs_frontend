const API_BASE = process.env.PLASMO_PUBLIC_API_BASE!

const POSTURE_TIPS = [
  "허리를 펴고 앉아주세요!",
  "모니터와 눈 높이를 맞춰주세요",
  "어깨를 뒤로 젖히고 긴장을 풀어주세요",
  "턱을 당기고 목을 바르게 세워주세요",
  "의자에 깊숙이 앉아 등받이에 기대주세요",
  "손목이 꺾이지 않게 키보드 위치를 확인하세요",
  "양 발을 바닥에 평평하게 놓아주세요",
  "화면과의 거리를 팔 길이 정도로 유지하세요"
]

const BREAK_TIPS = [
  "잠시 일어나서 스트레칭 해주세요!",
  "눈을 감고 10초간 쉬어주세요",
  "물 한 잔 마시면서 쉬어가세요",
  "목과 어깨를 돌려 긴장을 풀어주세요",
  "창밖을 보며 눈의 피로를 풀어주세요",
  "제자리에서 가볍게 기지개를 켜주세요"
]

const POSTURE_ALARM = "posture-reminder"
const BREAK_ALARM = "break-reminder"

let pendingOffscreenData: {
  accessToken: string; userId: string; baselineData: any
  settings: { darkDetectionEnabled: boolean }
} | null = null

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── API ────────────────────────────────────────────────────
async function apiCall<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const stored = await chrome.storage.local.get(["accessToken", "refreshToken"])
  const headers: Record<string, string> = { "Content-Type": "application/json" }
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
    const err = Object.assign(new Error(json.message ?? `HTTP ${res.status}`), { status: res.status })
    throw err
  }
  return json.data as T
}

// ─── Session ─────────────────────────────────────────────────
async function startSession(): Promise<void> {
  const stored = await chrome.storage.local.get(["accessToken", "currentSessionId"])
  if (!stored.accessToken) return

  // 세션 ID가 이미 있으면 세션 생성은 건너뛰고 offscreen만 시작
  if (stored.currentSessionId) {
    try { await startOffscreenDetection() } catch {}
    return
  }
  const startedAt = new Date().toISOString()
  try {
    const data = await apiCall<{ sessionId: string; startedAt: string }>(
      "/sessions/start",
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
  console.log("[offscreen] creating document...")
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("tabs/offscreen.html"),
    reasons: ["USER_MEDIA" as any],
    justification: "Webcam access for background posture detection"
  })
  console.log("[offscreen] document created")
}

async function closeOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument()
    console.log("[offscreen] document closed")
  }
}

async function startOffscreenDetection(): Promise<void> {
  const { accessToken, userId, baselineData, settings } =
    await chrome.storage.local.get(["accessToken", "userId", "baselineData", "settings"])
  console.log("[offscreen] startOffscreenDetection:", {
    hasToken: !!accessToken, hasUserId: !!userId, hasBaseline: !!baselineData
  })
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
  pendingOffscreenData = {
    accessToken, userId: resolvedUserId, baselineData,
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
async function sendToActiveTab(msg: object): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  for (const tab of tabs) {
    if (tab?.id && tab.url?.match(/^https?:\/\//)) {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {})
    }
  }
}

async function showNotification(type: "posture" | "break"): Promise<void> {
  const { settings } = await chrome.storage.local.get("settings")
  const s = settings || {}
  if (s.pushEnabled === false) return

  const isPosture = type === "posture"
  const message = isPosture ? rand(POSTURE_TIPS) : rand(BREAK_TIPS)

  // 시스템 알림
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon.png",
    title: isPosture ? "자세 교정 알림" : "휴식 알림",
    message,
    priority: 2,
    silent: s.soundEnabled === false
  })

  // 활성 탭 content script toast
  if (isPosture) {
    await sendToActiveTab({ type: "POSTURE_ALERT", state: "POSTURE_REMINDER", message })
  }
}

// ─── Alarms ──────────────────────────────────────────────────
async function stopAlarms(): Promise<void> {
  await chrome.alarms.clearAll()
}

async function restartAlarms(): Promise<void> {
  const { settings } = await chrome.storage.local.get("settings")
  const s = settings || { postureInterval: 30, breakInterval: 60 }
  await chrome.alarms.clearAll()
  chrome.alarms.create(POSTURE_ALARM, {
    delayInMinutes: s.postureInterval,
    periodInMinutes: s.postureInterval
  })
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
  if (alarm.name === POSTURE_ALARM) showNotification("posture")
  else if (alarm.name === BREAK_ALARM) showNotification("break")
})

// ─── Timeline ────────────────────────────────────────────────
const TIMELINE_STATE_MAP: Record<string, string> = {
  TURTLE_NECK: "TURTLE_NECK",
  turtle_neck: "TURTLE_NECK",
  ROUND_SHOULDER: "SHOULDER_ISSUE",
  round_shoulder: "SHOULDER_ISSUE",
  SHOULDER_ASYMMETRY: "SHOULDER_ISSUE",
  shoulder_tilted: "SHOULDER_ISSUE",
  DARK_ENV: "DARK_ENV",
  dark_env: "DARK_ENV",
  GOOD_POSTURE: "GOOD",
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

  apiCall("/dashboard/timeline", {
    method: "POST",
    body: JSON.stringify({ date, time, dominantState, message }),
  }).catch(() => {})
}

// ─── Messages ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // These types are sent FROM background TO offscreen — ignore if echoed back
  if (["START_DETECTION", "STOP_DETECTION"].includes(msg.type)) return

  if (msg.type === "GET_STATUS") {
    chrome.storage.local
      .get(["accessToken", "currentSessionId", "sessionStartedAt", "settings",
            "baselineDone", "isPaused", "pausedAt", "pausedTotalMs",
            "profileImg", "userName", "offscreenActive"])
      .then(sendResponse)
    return true
  }

  if (msg.type === "OFFSCREEN_READY") {
    console.log("[offscreen] OFFSCREEN_READY 수신")
    if (pendingOffscreenData) {
      const data = pendingOffscreenData
      pendingOffscreenData = null
      chrome.runtime.sendMessage({ type: "START_DETECTION", ...data })
        .then(() => console.log("[offscreen] START_DETECTION 전송 완료"))
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
    chrome.storage.local.set({ offscreenActive: true })
    console.log("[detection] ✅ offscreen 감지 시작됨")
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
    sendToActiveTab({ type: "POSTURE_ALERT", state: msg.state, message: msg.message })
    postTimeline(msg.state, msg.message)
    chrome.storage.local.get("settings").then(({ settings: s }) => {
      if (s?.pushEnabled !== false) {
        chrome.notifications.create("posture-detect", {
          type: "basic",
          iconUrl: "assets/icon.png",
          title: "자세 경고",
          message: msg.message,
          priority: 2,
          silent: s?.soundEnabled === false
        })
      }
    })
    sendResponse({ success: true })
    return true
  }

  if (msg.type === "POSTURE_ALERT_OFFSCREEN") {
    sendToActiveTab({ type: "POSTURE_ALERT", state: msg.state, message: msg.message })
    postTimeline(msg.state, msg.message)
    chrome.storage.local.get("settings").then(({ settings: s }) => {
      if (s?.pushEnabled !== false) {
        chrome.notifications.create("posture-offscreen", {
          type: "basic",
          iconUrl: "assets/icon.png",
          title: "자세 경고",
          message: msg.message,
          priority: 2,
          silent: s?.soundEnabled === false
        })
      }
    })
    sendResponse({ success: true })
    return true
  }

  if (msg.type === "FETCH_USER_SETTINGS") {
    apiCall<any>("/users/me", { method: "GET" })
      .then((me) =>
        chrome.storage.local.get("settings").then(({ settings: local }) => {
          const merged = {
            postureInterval: local?.postureInterval ?? 30,
            breakInterval: local?.breakInterval ?? 60,
            pushEnabled: me.settings.pushEnabled ?? true,
            soundEnabled: me.settings.soundEnabled ?? true,
            darkDetectionEnabled: me.settings.darkDetectionEnabled ?? false
          }
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
