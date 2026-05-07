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
  if (!res.ok) throw new Error(json.message ?? `HTTP ${res.status}`)
  return json.data as T
}

// ─── Session ─────────────────────────────────────────────────
async function startSession(): Promise<void> {
  const stored = await chrome.storage.local.get(["accessToken", "currentSessionId", "baselineDone"])
  if (!stored.accessToken || stored.currentSessionId || !stored.baselineDone) return
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
    // 세션 API 미구현(404) 또는 실패 시 로컬 세션으로 폴백
    if (apiErr?.status === 404 || String(apiErr?.message).includes("404")) {
      console.warn("[session] API 없음 → 로컬 세션 생성")
    } else {
      console.error("[session] start 실패:", apiErr)
    }
    await chrome.storage.local.set({
      currentSessionId: `local-${Date.now()}`,
      sessionStartedAt: startedAt
    })
  }
}

async function endSession(): Promise<void> {
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

// ─── Notifications ───────────────────────────────────────────
async function showNotification(type: "posture" | "break"): Promise<void> {
  const { settings } = await chrome.storage.local.get("settings")
  const s = settings || {}
  if (s.pushEnabled === false) return

  const isPosture = type === "posture"
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon.png",
    title: isPosture ? "자세 교정 알림" : "휴식 알림",
    message: isPosture ? rand(POSTURE_TIPS) : rand(BREAK_TIPS),
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
  await chrome.storage.local.set({ baselineDone: false, baselineData: null })
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

// ─── Messages ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_STATUS") {
    chrome.storage.local
      .get(["accessToken", "currentSessionId", "sessionStartedAt", "settings",
            "baselineDone", "isPaused", "pausedAt", "pausedTotalMs",
            "profileImg", "userName"])
      .then(sendResponse)
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
    endSession()
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
