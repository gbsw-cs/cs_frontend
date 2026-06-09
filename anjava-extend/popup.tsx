declare module "react-toastify/dist/ReactToastify.css";

import { useCallback, useEffect, useRef, useState } from "react"
import { toast, ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import logoUrl from "url:./assets/logo.png"
import "./popup.css"

const WEB_URL  = (process.env.PLASMO_PUBLIC_WEB_URL ?? "https://anjava.vercel.app").replace(/\/$/, "")
const API_BASE = `${WEB_URL}/api/backend`
const AUTH_STORAGE_KEY = ["access", "Token"].join("")

interface ExtSettings {
  postureInterval: number
  breakInterval: number
  pushEnabled: boolean
  soundEnabled: boolean
  darkDetectionEnabled: boolean
}

type StatusResponse = {
  accessToken?: string
  currentSessionId?: string
  sessionStartedAt?: string
  settings?: Partial<ExtSettings>
  baselineDone?: boolean
  isPaused?: boolean
  pausedTotalMs?: number
  profileImg?: string
  userName?: string
  offscreenActive?: boolean
  offscreenError?: string
  lastSettingsSyncedAt?: string
}

type UserSettingsResponse = {
  settings?: Partial<ExtSettings>
  name?: string
  profileImg?: string
  lastSettingsSyncedAt?: string
}

type StartSessionResponse = {
  currentSessionId?: string
  sessionStartedAt?: string
  error?: string
}

type ResumeSessionResponse = {
  success?: boolean
  pausedTotalMs?: number
}

type SessionActionResponse = { success?: boolean }

type LoginResponse = {
  success?: boolean
  message?: string
  data?: {
    accessToken?: string
    refreshToken?: string
  }
}

type PopupRuntimeMessage =
  | { type: "DETECTION_ACTIVE" }
  | { type: "OFFSCREEN_CAMERA_ERROR"; name?: string; message?: string }

type ApprovalNotificationResponse = {
  ok?: boolean
  approved?: boolean
  reason?: "allow" | "deny" | "closed" | "timeout"
  error?: string
}

const DEFAULT_SETTINGS: ExtSettings = {
  postureInterval: 30,
  breakInterval: 60,
  pushEnabled: true,
  soundEnabled: true,
  darkDetectionEnabled: false
}

const INTERVALS = [
  { value: 15,  label: "15분" },
  { value: 30,  label: "30분" },
  { value: 45,  label: "45분" },
  { value: 60,  label: "1시간" },
  { value: 90,  label: "1시간 30분" },
  { value: 120, label: "2시간" }
]

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}시간 ${m}분`
  if (m > 0) return `${m}분 ${sec}초`
  return `${sec}초`
}

function fmtSyncTime(value: string) {
  if (!value) return "아직 동기화 전"
  const diffMs = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return "방금 전"
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return "방금 전"
  if (min < 60) return `${min}분 전`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function WebcamCircle() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState("")
  const [retrying, setRetrying] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const acquireCamera = (stream: MediaStream) => {
    streamRef.current = stream
    const v = videoRef.current
    if (v) {
      v.srcObject = stream
      v.onloadedmetadata = () => { v.play().catch(() => {}); setActive(true) }
    }
  }

  const startCamera = () => {
    setError("")
    navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 160, facingMode: "user" } })
      .then(acquireCamera)
      .catch((e: DOMException) => {
        console.error("[popup] 카메라 권한 확인 실패:", e.name, e.message, e)
        setError(e.name || "CameraError")
      })
  }

  const retryPermission = () => {
    if (retrying) return
    setRetrying(true)
    setError("")
    navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 160, facingMode: "user" } })
      .then(stream => { acquireCamera(stream); setRetrying(false) })
      .catch((e: DOMException) => {
        setError(e.name || "CameraError")
        setRetrying(false)
        // 직접 요청 실패 시 권한 설정 페이지로 이동
        chrome.tabs.create({ url: chrome.runtime.getURL("tabs/camera-permission.html"), active: true }).catch(() => {})
      })
  }

  useEffect(() => {
    startCamera()
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const errorLabel =
    error === "NotAllowedError"
      ? "카메라 권한 필요"
      : error === "NotFoundError" || error === "DevicesNotFoundError"
      ? "카메라 없음"
      : error === "NotReadableError" || error === "TrackStartError"
      ? "카메라 사용 중"
      : "카메라 오류"

  return (
    <div className="webcam-circle-wrap">
      <div className={`webcam-circle ${active ? "webcam-circle-on" : "webcam-circle-off"}`}>
        <video
          ref={videoRef}
          muted
          playsInline
          className="webcam-circle-video"
          style={{ transform: "scaleX(-1)", display: active ? "block" : "none" }}
        />
        {!active && !error && <span className="webcam-circle-icon" style={{ fontSize: 24 }}>⏳</span>}
        {error && <span className="webcam-circle-icon">🚫</span>}
      </div>
      <span className="webcam-circle-label">{active ? "● 라이브" : error ? errorLabel : "연결 중..."}</span>
      {error === "NotAllowedError" && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <button
            className="btn-outline"
            style={{ fontSize: 11, padding: "3px 10px" }}
            disabled={retrying}
            onClick={retryPermission}
          >
            {retrying ? "권한 요청 중..." : "권한 다시 요청"}
          </button>
          <button
            className="btn-outline"
            style={{ fontSize: 10, padding: "2px 8px", opacity: 0.7 }}
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("tabs/camera-permission.html"), active: true }).catch(() => {})}
          >
            권한 설정 페이지 열기
          </button>
          <span style={{ fontSize: 9, color: "#a1a1aa", textAlign: "center", lineHeight: 1.4 }}>
            권한 창이 안 뜨면 아래 버튼으로<br/>설정 페이지에서 직접 허용해주세요
          </span>
        </div>
      )}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`toggle ${on ? "toggle-on" : "toggle-off"}`}>
      <span className="toggle-thumb" />
    </button>
  )
}

function Troubleshooter({
  loggedIn,
  baselineDone,
  sessionId,
  offscreenError,
  onGoogleLogin,
  onBaseline,
  onStartSession,
  onCameraSettings,
}: {
  loggedIn: boolean
  baselineDone: boolean
  sessionId: string | null
  offscreenError: string
  onGoogleLogin: () => void
  onBaseline: () => void
  onStartSession: () => void
  onCameraSettings: () => void
}) {
  const items: Array<{
    key: string
    title: string
    desc: string
    action: string
    onClick: () => void
    tone?: "warn" | "error"
  }> = []

  if (!loggedIn) {
    items.push({
      key: "login",
      title: "로그인이 필요합니다",
      desc: "소셜 계정은 Google 로그인을 사용해 확장과 연결하세요.",
      action: "Google 로그인",
      onClick: onGoogleLogin,
      tone: "warn",
    })
  } else if (!baselineDone) {
    items.push({
      key: "baseline",
      title: "베이스라인 측정 필요",
      desc: "정확한 자세 감지를 위해 10초 기준 자세를 먼저 측정하세요.",
      action: "지금 측정",
      onClick: onBaseline,
      tone: "warn",
    })
  } else if (!sessionId) {
    items.push({
      key: "session",
      title: "세션이 시작되지 않았습니다",
      desc: "세션을 시작하면 백그라운드 자세 감지와 알림이 동작합니다.",
      action: "세션 시작",
      onClick: onStartSession,
    })
  }

  if (offscreenError) {
    items.push({
      key: "camera",
      title: "카메라 연결 확인 필요",
      desc: offscreenError,
      action: "카메라 설정",
      onClick: onCameraSettings,
      tone: "error",
    })
  }

  if (items.length === 0) return null

  return (
    <div className="trouble-card">
      <p className="card-label">현재 문제 해결</p>
      <div className="trouble-list">
        {items.map((item) => (
          <div key={item.key} className={`trouble-item ${item.tone === "error" ? "trouble-error" : ""}`}>
            <div className="trouble-copy">
              <p className="trouble-title">{item.title}</p>
              <p className="trouble-desc">{item.desc}</p>
            </div>
            <button className="trouble-action" onClick={item.onClick}>
              {item.action}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function IndexPopup() {
  const [phase, setPhase]         = useState<"loading" | "login" | "main">("loading")
  const [tab, setTab]             = useState<"home" | "settings">("home")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStart, setStart]  = useState<Date | null>(null)
  const [elapsed, setElapsed]     = useState(0)
  const [settings, setSettings]   = useState<ExtSettings>(DEFAULT_SETTINGS)
  const [userName, setUserName]   = useState("")
  const [profileImg, setProfileImg] = useState("")
  const [email, setEmail]         = useState("")
  const [password, setPassword]   = useState("")
  const [baselineDone, setBaselineDone]   = useState(true)
  const [isPaused, setIsPaused]           = useState(false)
  const [pausedTotalMs, setPausedTotalMs] = useState(0)
  const [loginLoading, setLLoading]       = useState(false)
  const [loginError, setLError]           = useState("")
  const [offscreenActive, setOffscreenActive] = useState(false)
  const [offscreenError, setOffscreenError] = useState("")
  const [lastSettingsSyncedAt, setLastSettingsSyncedAt] = useState("")
  const emailRef = useRef<HTMLInputElement>(null)

  const fetchUserSettings = useCallback(() => {
    chrome.runtime.sendMessage({ type: "FETCH_USER_SETTINGS" }, (r: UserSettingsResponse) => {
      if (r?.settings)  setSettings(s => ({ ...s, ...r.settings }))
      if (r?.name)      setUserName(r.name)
      if (r?.profileImg !== undefined) setProfileImg(r.profileImg)
      if (r?.lastSettingsSyncedAt) setLastSettingsSyncedAt(r.lastSettingsSyncedAt)
    })
  }, [])

  const applyStatus = useCallback((res?: StatusResponse) => {
    const credential = (res as Record<string, unknown> | undefined)?.[AUTH_STORAGE_KEY]
    if (typeof credential !== "string" || !credential) {
      setLLoading(false)
      setSessionId(null)
      setStart(null)
      setBaselineDone(false)
      setUserName("")
      setProfileImg("")
      setOffscreenActive(false)
      setOffscreenError("")
      setLastSettingsSyncedAt("")
      setIsPaused(false)
      setPausedTotalMs(0)
      setElapsed(0)
      setPhase("login")
      return
    }
    if (res.currentSessionId) {
      setSessionId(res.currentSessionId)
      setStart(new Date(res.sessionStartedAt))
    } else {
      setSessionId(null)
      setStart(null)
    }
    if (res.settings)  setSettings({ ...DEFAULT_SETTINGS, ...res.settings })
    if (res.userName)  setUserName(res.userName)
    if (res.profileImg) setProfileImg(res.profileImg)
    setBaselineDone(res.baselineDone === true)
    setIsPaused(res.isPaused === true)
    setPausedTotalMs(res.pausedTotalMs ?? 0)
    setOffscreenActive(res.offscreenActive === true)
    setOffscreenError(res.offscreenError ?? "")
    if (res.lastSettingsSyncedAt) setLastSettingsSyncedAt(res.lastSettingsSyncedAt)
    setLLoading(false)
    setLError("")
    setPhase("main")
    fetchUserSettings()
  }, [fetchUserSettings])

  const refreshStatus = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res: StatusResponse) => {
      applyStatus(res)
    })
  }, [applyStatus])

  // ── Init ─────────────────────────────────────────────────
  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return
      const watchedKeys = [
        AUTH_STORAGE_KEY,
        "baselineDone",
        "currentSessionId",
        "sessionStartedAt",
        "isPaused",
        "pausedTotalMs",
        "offscreenActive",
        "offscreenError",
        "lastSettingsSyncedAt",
      ]
      if (!watchedKeys.some((key) => changes[key])) return

      if (changes[AUTH_STORAGE_KEY] && !changes[AUTH_STORAGE_KEY].newValue) {
        setPhase("login")
      } else {
        refreshStatus()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [refreshStatus])

  useEffect(() => {
    const listener = (msg: PopupRuntimeMessage) => {
      if (msg?.type === "DETECTION_ACTIVE") {
        setOffscreenActive(true)
        setOffscreenError("")
      }
      if (msg?.type === "OFFSCREEN_CAMERA_ERROR") {
        setOffscreenActive(false)
        const name = msg.name ?? "UnknownError"
        const detail =
          name === "NotAllowedError"
            ? "카메라 권한을 허용한 뒤 세션을 다시 시작해주세요."
            : name === "NotReadableError" || name === "TrackStartError"
            ? "카메라가 다른 앱에서 사용 중인지 확인해주세요."
            : msg.message || "카메라를 시작하지 못했습니다."
        setOffscreenError(`${name}: ${detail}`)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  useEffect(() => {
    if (phase === "login") setTimeout(() => emailRef.current?.focus(), 50)
  }, [phase])

  // ── Elapsed timer ─────────────────────────────────────────
  useEffect(() => {
    if (!sessionStart) { setElapsed(0); return }
    if (isPaused) return
    const tick = () =>
      setElapsed(Date.now() - sessionStart.getTime() - pausedTotalMs)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sessionStart, isPaused, pausedTotalMs])

  // ── Pause / Resume / Stop ─────────────────────────────────
  const handlePause = () => {
    chrome.runtime.sendMessage({ type: "PAUSE_SESSION" }, (r: SessionActionResponse) => {
      if (chrome.runtime.lastError || !r?.success) {
        setOffscreenError("세션을 일시정지하지 못했습니다. 감지 기록 전송 상태를 확인해주세요.")
        return
      }
      setOffscreenError("")
      setIsPaused(true)
    })
  }

  const handleResume = () => {
    chrome.runtime.sendMessage({ type: "RESUME_SESSION" }, (r: ResumeSessionResponse) => {
      if (chrome.runtime.lastError || !r?.success) {
        setOffscreenError("세션을 재개하지 못했습니다.")
        return
      }
      setOffscreenError("")
      setIsPaused(false)
      if (r?.pausedTotalMs !== undefined) setPausedTotalMs(r.pausedTotalMs)
    })
  }

  const handleStop = () => {
    chrome.runtime.sendMessage({ type: "END_SESSION" }, (r: SessionActionResponse) => {
      if (chrome.runtime.lastError || !r?.success) {
        setOffscreenError("세션 종료 전 감지 기록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.")
        return
      }
      setOffscreenError("")
      setSessionId(null)
      setStart(null)
      setIsPaused(false)
      setPausedTotalMs(0)
      setElapsed(0)
    })
  }

  const handleStartSession = () => {
    chrome.runtime.sendMessage({ type: "START_SESSION" }, (r: StartSessionResponse) => {
      if (!chrome.runtime.lastError && r?.currentSessionId) {
        setOffscreenError("")
        setSessionId(r.currentSessionId)
        setStart(r.sessionStartedAt ? new Date(r.sessionStartedAt) : new Date())
      } else {
        setOffscreenError(r?.error ?? "세션을 시작하지 못했습니다.")
      }
    })
  }

  // ── Login ─────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) return
    setLLoading(true)
    setLError("")
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
      const text = await res.text()
      let json: LoginResponse = {}
      try { json = JSON.parse(text) } catch {
        throw new Error(`서버 응답 오류 (${res.status}): 서버가 올바른 응답을 반환하지 않았습니다.`)
      }
      if (!json.success || !json.data?.accessToken) {
        throw new Error(typeof json.message === "string" ? json.message : `로그인 실패 (${res.status})`)
      }

      chrome.runtime.sendMessage(
        { type: "LOGIN", accessToken: json.data.accessToken, refreshToken: json.data.refreshToken },
        () => {
          refreshStatus()
        }
      )
    } catch (e) {
      setLError((e as Error).message || "로그인에 실패했습니다.")
      setLLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    setLError("웹 탭에서 Google 로그인을 완료한 뒤 이 팝업을 다시 열어주세요.")
    chrome.tabs.create({ url: `${WEB_URL}/login?extId=${chrome.runtime.id}` })
  }

  const openBaseline = () => {
    chrome.tabs.create({ url: `${WEB_URL}/webcam-test?extId=${chrome.runtime.id}` })
  }

  const openCameraSettings = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("tabs/camera-permission.html") })
  }

  const handleLogout = () => {
    chrome.runtime.sendMessage({ type: "LOGOUT" }, () => {
      setPhase("login")
      setSessionId(null)
      setStart(null)
      setBaselineDone(false)
      setUserName("")
      setProfileImg("")
      setEmail("")
      setPassword("")
    })
  }

  const handleRebaseline = async () => {
    await chrome.storage.local.set({ baselineDone: false, baselineData: null })
    setBaselineDone(false)
    chrome.runtime.sendMessage({ type: "END_SESSION" })
    setSessionId(null)
    setStart(null)
    setElapsed(0)
    setIsPaused(false)
    setPausedTotalMs(0)
    openBaseline()
  }

  const updateSetting = <K extends keyof ExtSettings>(key: K, value: ExtSettings[K]) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", settings: next }, () => {
      setLastSettingsSyncedAt(new Date().toISOString())
    })
  }

  const handleApprovalNotificationTest = () => {
    chrome.runtime.sendMessage(
      {
        type: "REQUEST_APPROVAL_NOTIFICATION",
        title: "작업 승인 요청",
        message: "테스트 작업을 실행할까요?",
        allowLabel: "허용",
        denyLabel: "거부",
      },
      (res: ApprovalNotificationResponse) => {
        if (chrome.runtime.lastError) {
          toast.error(chrome.runtime.lastError.message || "승인 알림 요청에 실패했습니다.")
          return
        }
        if (!res?.ok) {
          toast.error(res?.error || "승인 알림 요청에 실패했습니다.")
          return
        }
        if (res.approved) {
          toast.success("승인되었습니다.")
        } else {
          const reasonLabel =
            res.reason === "timeout" ? "시간 초과"
            : res.reason === "closed" ? "알림 닫힘"
            : "거부"
          toast.info(`승인되지 않았습니다: ${reasonLabel}`)
        }
      },
    )
  }

  // ── Loading ───────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="popup center">
        <div className="spin" />
      </div>
    )
  }

  // ── Login ─────────────────────────────────────────────────
  if (phase === "login") {
    return (
      <div className="popup">
        <header className="header">
          <img src={logoUrl} alt="Anjava" className="logo-img" />
          <div>
            <h1 className="header-title">Anjava</h1>
            <p className="header-sub">자세 교정 도우미</p>
          </div>
        </header>

        <div className="content">
          <Troubleshooter
            loggedIn={false}
            baselineDone={false}
            sessionId={null}
            offscreenError=""
            onGoogleLogin={handleGoogleLogin}
            onBaseline={openBaseline}
            onStartSession={handleStartSession}
            onCameraSettings={openCameraSettings}
          />
          <div className="card">
            <p className="card-label">로그인</p>
            <div className="field-group">
              <input
                ref={emailRef}
                className="field"
                type="email"
                placeholder="이메일"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
              <input
                className="field"
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
              {loginError && <p className="error-text">{loginError}</p>}
              <button
                className="btn-primary"
                onClick={handleLogin}
                disabled={loginLoading || !email || !password}>
                {loginLoading ? "로그인 중…" : "로그인"}
              </button>
            </div>
            <div className="social-divider">
              <span />
              <p>간편 로그인</p>
              <span />
            </div>
            <button
              type="button"
              className="btn-google"
              onClick={handleGoogleLogin}
              disabled={loginLoading}
              aria-label="Google 로 계속하기">
              <GoogleIcon />
              <span>Google 로 계속하기</span>
            </button>
            <p className="hint-text" style={{ marginTop: 12 }}>
              계정이 없으신가요?{" "}
              <span
                className="link"
                onClick={() => chrome.tabs.create({ url: WEB_URL })}>
                웹사이트에서 가입
              </span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Main ──────────────────────────────────────────────────
  return (
    <div className="popup">
      <ToastContainer />

      <header className="header">
        <img src={logoUrl} alt="Anjava" className="logo-img"/>
        <div className="header-right">
          <div className="user-info-stack">
            <div className="traffic-lights">
              <button className="tl-btn tl-red"    title="닫기"     onClick={() => window.close()} />
              <button className="tl-btn tl-yellow" title="세션 종료" onClick={handleStop} />
            </div>
            <div className="user-info-row">
              {sessionId && baselineDone && (
                <span className="det-dot" title="자세 감지 중">●</span>
              )}
              {profileImg
                ? <img src={profileImg} alt={userName} className="avatar-sm" />
                : <div className="avatar-sm avatar-placeholder">{userName?.[0]?.toUpperCase() ?? "A"}</div>
              }
              {userName && <span className="header-username">{userName}</span>}
            </div>
          </div>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab ${tab === "home" ? "tab-on" : ""}`}
          onClick={() => setTab("home")}>
          홈
        </button>
        <button
          className={`tab ${tab === "settings" ? "tab-on" : ""}`}
          onClick={() => setTab("settings")}>
          설정
        </button>
      </div>

      {tab === "home" ? (
        <div className="content">
          {!baselineDone && (
            <div className="baseline-card">
              <p className="baseline-title">베이스라인 측정 필요</p>
              <p className="baseline-desc">
                정확한 자세 감지를 위해 초기 측정이 필요합니다.
              </p>
              <button
                className="btn-primary"
                style={{ marginTop: 10 }}
                onClick={openBaseline}>
                지금 측정하기
              </button>
            </div>
          )}

          <Troubleshooter
            loggedIn={true}
            baselineDone={baselineDone}
            sessionId={sessionId}
            offscreenError={offscreenError}
            onGoogleLogin={handleGoogleLogin}
            onBaseline={openBaseline}
            onStartSession={handleStartSession}
            onCameraSettings={openCameraSettings}
          />

          <div className={`session-card ${sessionId ? (isPaused ? "session-paused" : "session-active") : "session-idle"}`}>
            <div className="session-row">
              <span className={`dot ${sessionId && !isPaused ? "dot-on" : "dot-off"}`} />
              <span className="session-label">
                {!sessionId ? "세션 없음" : isPaused ? "일시정지됨" : "감지 세션 진행 중"}
              </span>
              {sessionId && !isPaused && offscreenActive && (
                <span className="webcam-badge">웹캠 작동 중</span>
              )}
            </div>
            {sessionId && elapsed > 0 && (
              <p className="session-time">{fmtDuration(elapsed)}</p>
            )}
            {sessionId && !isPaused && offscreenError && (
              <p className="error-text" style={{ marginTop: 8 }}>{offscreenError}</p>
            )}
            {sessionId ? (
              <div className="session-btns">
                {isPaused ? (
                  <button className="sess-btn sess-resume" onClick={handleResume}>▶ 재개</button>
                ) : (
                  <button className="sess-btn sess-pause" onClick={handlePause}>⏸ 일시정지</button>
                )}
                <button className="sess-btn sess-stop" onClick={handleStop}>⏹ 종료</button>
              </div>
            ) : baselineDone ? (
              <button className="btn-primary" style={{ marginTop: 10 }} onClick={handleStartSession}>
                세션 시작하기
              </button>
            ) : null}
          </div>

          <WebcamCircle />

          <div className="card">
            <p className="card-label">대시보드</p>
            <p className="hint-text" style={{ margin: "4px 0 12px" }}>
              자세한 통계와 건강 점수를 확인하세요
            </p>
            <button
              className="btn-outline"
              onClick={() => chrome.tabs.create({ url: `${WEB_URL}/dashboard` })}>
              대시보드 열기
            </button>
          </div>

          <button className="btn-ghost" style={{ color: "#a1a1aa" }} onClick={handleRebaseline}>
            자세 다시측정하기
          </button>
          <button className="btn-ghost" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      ) : (
        <div className="content">
          <div className="sync-status">
            <span>설정 동기화</span>
            <strong>{fmtSyncTime(lastSettingsSyncedAt)}</strong>
          </div>
          <div className="card">
            <p className="card-label">알림 설정</p>

            <div className="setting-row">
              <div className="setting-info">
                <p className="setting-name">푸시 알림 수신</p>
                <p className="setting-desc">경고 상태 시 브라우저 알림을 받습니다</p>
              </div>
              <Toggle
                on={settings.pushEnabled}
                onChange={v => updateSetting("pushEnabled", v)}
              />
            </div>

            <div className="divider" />

            <div className="setting-row">
              <div className="setting-info">
                <p className="setting-name">알림 소리</p>
                <p className="setting-desc">알림과 함께 효과음을 재생합니다</p>
              </div>
              <Toggle
                on={settings.soundEnabled}
                onChange={v => updateSetting("soundEnabled", v)}
              />
            </div>

            <div className="divider" />

            <button className="btn-outline" onClick={handleApprovalNotificationTest}>
              승인 알림 테스트
            </button>
          </div>

          <div className="card">
            <p className="card-label">감지 설정</p>
            <div className="setting-row">
              <div className="setting-info">
                <p className="setting-name">어둠 속 코딩 감지</p>
                <p className="setting-desc">카메라 밝기로 어두운 환경을 감지합니다</p>
              </div>
              <Toggle
                on={settings.darkDetectionEnabled}
                onChange={v => updateSetting("darkDetectionEnabled", v)}
              />
            </div>
          </div>

          <div className="card">
            <p className="card-label">알림 간격</p>
            <div className="setting-row">
              <p className="setting-name">자세 교정 알림</p>
              <select
                className="sel"
                value={settings.postureInterval}
                onChange={e => updateSetting("postureInterval", Number(e.target.value))}>
                {INTERVALS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="divider" />
            <div className="setting-row">
              <p className="setting-name">휴식 알림</p>
              <select
                className="sel"
                value={settings.breakInterval}
                onChange={e => updateSetting("breakInterval", Number(e.target.value))}>
                {INTERVALS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}
