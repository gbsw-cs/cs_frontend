declare module "react-toastify/dist/ReactToastify.css";

import { useEffect, useRef, useState } from "react"
import { toast, ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import logoUrl from "url:./assets/logo.png"
import "./popup.css"

const WEB_URL  = (process.env.PLASMO_PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")
const API_BASE = `${WEB_URL}/api/backend`

interface ExtSettings {
  postureInterval: number
  breakInterval: number
  pushEnabled: boolean
  soundEnabled: boolean
  darkDetectionEnabled: boolean
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

function WebcamCircle() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState("")
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 160, facingMode: "user" } })
      .then(stream => {
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          v.onloadedmetadata = () => { v.play().catch(() => {}); setActive(true) }
        }
      })
      .catch((e: DOMException) => {
        console.error("[popup] 카메라 권한 확인 실패:", e.name, e.message, e)
        setError(e.name || "CameraError")
      })
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
        {/* 항상 렌더링, active 아닐 때 숨김 */}
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
  const emailRef = useRef<HTMLInputElement>(null)

  // ── Init ─────────────────────────────────────────────────
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res: any) => {
      if (!res?.accessToken) {
        setPhase("login")
        return
      }
      if (res.currentSessionId) {
        setSessionId(res.currentSessionId)
        setStart(new Date(res.sessionStartedAt))
      }
      if (res.settings)  setSettings({ ...DEFAULT_SETTINGS, ...res.settings })
      if (res.userName)  setUserName(res.userName)
      if (res.profileImg) setProfileImg(res.profileImg)
      setBaselineDone(res.baselineDone === true)
      setIsPaused(res.isPaused === true)
      setPausedTotalMs(res.pausedTotalMs ?? 0)
      setOffscreenActive(res.offscreenActive === true)
      setOffscreenError(res.offscreenError ?? "")
      setPhase("main")

      chrome.runtime.sendMessage({ type: "FETCH_USER_SETTINGS" }, (r: any) => {
        if (r?.settings)  setSettings(s => ({ ...s, ...r.settings }))
        if (r?.name)      setUserName(r.name)
        if (r?.profileImg !== undefined) setProfileImg(r.profileImg)
      })
    })
  }, [])

  useEffect(() => {
    const listener = (msg: any) => {
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
    setIsPaused(true)
    chrome.runtime.sendMessage({ type: "PAUSE_SESSION" })
  }

  const handleResume = () => {
    setIsPaused(false)
    chrome.runtime.sendMessage({ type: "RESUME_SESSION" }, (r: any) => {
      if (chrome.runtime.lastError) return
      if (r?.pausedTotalMs !== undefined) setPausedTotalMs(r.pausedTotalMs)
    })
  }

  const handleStop = () => {
    setSessionId(null)
    setStart(null)
    setIsPaused(false)
    setPausedTotalMs(0)
    setElapsed(0)
    chrome.runtime.sendMessage({ type: "END_SESSION" })
  }

  const handleStartSession = () => {
    chrome.runtime.sendMessage({ type: "START_SESSION" }, (r: any) => {
      if (!chrome.runtime.lastError && r?.currentSessionId) {
        setSessionId(r.currentSessionId)
        setStart(new Date(r.sessionStartedAt))
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
      let json: any = {}
      try { json = JSON.parse(text) } catch {
        throw new Error(`서버 응답 오류 (${res.status}): 서버가 올바른 응답을 반환하지 않았습니다.`)
      }
      if (!json.success) throw new Error(typeof json.message === "string" ? json.message : `로그인 실패 (${res.status})`)

      chrome.runtime.sendMessage(
        { type: "LOGIN", accessToken: json.data.accessToken, refreshToken: json.data.refreshToken },
        () => {
          setPhase("main")
          chrome.runtime.sendMessage({ type: "FETCH_USER_SETTINGS" }, (info: any) => {
            if (info?.settings)  setSettings(s => ({ ...s, ...info.settings }))
            if (info?.name)      setUserName(info.name)
            if (info?.profileImg !== undefined) setProfileImg(info.profileImg)
          })
        }
      )
    } catch (e) {
      setLError((e as Error).message || "로그인에 실패했습니다.")
      setLLoading(false)
    }
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
    chrome.tabs.create({ url: `${WEB_URL}/webcam-test?extId=${chrome.runtime.id}` })
  }

  const updateSetting = <K extends keyof ExtSettings>(key: K, value: ExtSettings[K]) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", settings: next })
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
                onClick={() => chrome.tabs.create({ url: `${WEB_URL}/webcam-test?extId=${chrome.runtime.id}` })}>
                지금 측정하기
              </button>
            </div>
          )}

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
