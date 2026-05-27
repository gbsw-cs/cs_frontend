const WEB_URL = (process.env.PLASMO_PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")
const API_BASE = `${WEB_URL}/api/backend`

const BREAK_TIPS = [
  "잠시 일어나서 스트레칭 해주세요!",
  "눈을 감고 10초간 쉬어주세요",
  "물 한 잔 마시면서 쉬어가세요",
  "목과 어깨를 돌려 긴장을 풀어주세요",
  "창밖을 보며 눈의 피로를 풀어주세요",
  "제자리에서 가볍게 기지개를 켜주세요"
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
  TURTLE_NECK:        "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
  turtle_neck:        "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
  SHOULDER_ISSUE:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
  ROUND_SHOULDER:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
  round_shoulder:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
  SHOULDER_ASYMMETRY: "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
  shoulder_tilted:    "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
  DARK_ENV:           "어두운 환경이 감지되었어요! 밝기를 높여주세요.",
  dark_env:           "어두운 환경이 감지되었어요! 밝기를 높여주세요.",
  GOOD_POSTURE:       "자세가 교정되었어요! 바른 자세를 유지해보세요.",
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
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
    .slice(0, 1)
}

async function sendToActiveTab(msg: any): Promise<void> {
  const tabs = await getToastTargetTabs()
  if (tabs.length === 0) {
    console.warn("[toast] 주입 가능한 HTTP/HTTPS 탭이 없습니다.")
    return
  }
  const tasks: Promise<unknown>[] = []
  for (const tab of tabs) {
    if (!tab?.id || !tab.url?.match(/^https?:\/\//)) continue
    const isGood = msg.state === "GOOD_POSTURE"
    const text = TOAST_MESSAGES[msg.state as string] ?? msg.message ?? "자세를 확인해주세요."
    const soundEnabled = msg.soundEnabled !== false
    tasks.push(chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (toastText: string, successMode: boolean, shouldPlaySound: boolean) => {
        const playTone = () => {
          if (!shouldPlaySound) return
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
            if (!AudioCtx) return
            const ctx = new AudioCtx()
            const oscillator = ctx.createOscillator()
            const gain = ctx.createGain()
            oscillator.type = "sine"
            oscillator.frequency.setValueAtTime(successMode ? 660 : 880, ctx.currentTime)
            gain.gain.setValueAtTime(0.0001, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22)
            oscillator.connect(gain)
            gain.connect(ctx.destination)
            oscillator.start()
            oscillator.stop(ctx.currentTime + 0.24)
            window.setTimeout(() => ctx.close().catch(() => {}), 400)
          } catch {}
        }
        const TID = "anjava-posture-toast", SID = "anjava-posture-style"
        if (!document.getElementById(SID)) {
          const s = document.createElement("style"); s.id = SID
          s.textContent = `#${TID}{position:fixed;top:24px;right:24px;background:#fff;color:#18181b;padding:0;border-radius:18px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.5;z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.14),0 2px 8px rgba(0,0,0,.08);width:420px;overflow:hidden;border:1px solid rgba(0,0,0,.07);animation:anjava-in .32s cubic-bezier(.16,1,.3,1);pointer-events:auto}#${TID} .ah{display:flex;align-items:center;gap:10px;padding:16px 18px 13px;border-bottom:1px solid #f4f4f5}#${TID} .ai{font-size:22px;flex-shrink:0}#${TID} .at{font-weight:700;font-size:15px;color:#2563eb;flex:1}#${TID}.suc .at{color:#16a34a}#${TID} .ac{background:none;border:none;color:#a1a1aa;cursor:pointer;font-size:18px;padding:0;line-height:1}#${TID} .ac:hover{color:#52525b}#${TID} .ab{padding:13px 18px 15px;font-size:14px;color:#3f3f46;line-height:1.6}#${TID} .ap{height:4px;background:#2563eb;animation:anjava-progress 6s linear forwards;transform-origin:left}#${TID}.suc .ap{background:#16a34a}#${TID}.out{animation:anjava-out .24s ease forwards}@keyframes anjava-in{from{opacity:0;transform:translateX(60px) scale(.95)}to{opacity:1;transform:translateX(0) scale(1)}}@keyframes anjava-out{to{opacity:0;transform:translateX(60px) scale(.95)}}@keyframes anjava-progress{from{transform:scaleX(1)}to{transform:scaleX(0)}}`
          document.head.appendChild(s)
        }
        const old = document.getElementById(TID); if (old) old.remove()
        const el = document.createElement("div"); el.id = TID
        if (successMode) el.classList.add("suc")
        const hdr = document.createElement("div"); hdr.className = "ah"
        const ico = document.createElement("span"); ico.className = "ai"; ico.textContent = successMode ? "✅" : "⚠️"
        const ttl = document.createElement("span"); ttl.className = "at"; ttl.textContent = "자세 교정 알림"
        const cls = document.createElement("button"); cls.className = "ac"; cls.textContent = "✕"
        cls.onclick = () => { el.classList.add("out"); setTimeout(() => el.remove(), 240) }
        hdr.append(ico, ttl, cls)
        const bdy = document.createElement("div"); bdy.className = "ab"; bdy.textContent = toastText
        const bar = document.createElement("div"); bar.className = "ap"
        el.append(hdr, bdy, bar); document.body.appendChild(el)
        playTone()
        setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 240) }, 6000)
      },
      args: [text, isGood, soundEnabled]
    }).catch((e) => console.error("[toast] 주입 실패:", tab.url, e)))
  }
  await Promise.allSettled(tasks)
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
            "profileImg", "userName", "offscreenActive"])
      .then(sendResponse)
    return true
  }

  if (msg.type === "POSTURE_ALERT_FROM_WEB") {
    // The web app already shows its own toast before relaying this message.
    // Avoid creating a second extension toast for the same foreground event.
    sendResponse({ ok: true, skipped: "foreground-web-toast" })
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
    chrome.storage.local.set({ offscreenActive: true })
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
    postTimeline(msg.state, msg.message)
    chrome.storage.local.get("settings").then(({ settings: s }) => {
      if (s?.pushEnabled === false) {
        sendResponse({ success: true, skipped: "push-disabled" })
        return
      }
      sendToActiveTab({
        type: "POSTURE_ALERT",
        state: msg.state,
        message: msg.message,
        soundEnabled: s?.soundEnabled !== false,
      })
        .then(() => sendResponse({ success: true }))
        .catch((e) => {
          console.error("[toast] posture alert 처리 실패:", e)
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
      sendToActiveTab({
        type: "POSTURE_ALERT",
        state: msg.state,
        message: msg.message,
        soundEnabled: s?.soundEnabled !== false,
      })
        .then(() => sendResponse({ success: true }))
        .catch((e) => {
          console.error("[toast] offscreen alert 처리 실패:", e)
          sendResponse({ success: false, error: String(e?.message ?? e) })
        })
    })
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
