declare module "react-toastify/dist/ReactToastify.css";

import { useEffect, useRef, useState } from "react"
import { toast, ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import logoUrl from "url:./assets/logo.png"
import "./popup.css"

const API_BASE = process.env.PLASMO_PUBLIC_API_BASE!
const WEB_URL  = process.env.PLASMO_PUBLIC_WEB_URL!
const AI_API_BASE = process.env.PLASMO_PUBLIC_AI_API_BASE!

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

interface Landmark { x: number; y: number; z: number }
interface Frame {
  timestamp:      string
  visibility:     number
  nose:           Landmark
  left_ear:       Landmark
  right_ear:      Landmark
  left_shoulder:  Landmark
  right_shoulder: Landmark
  brightness:     number
}

const EMPTY: Landmark = { x: -2, y: -2, z: -2 }

function lm(arr: any[] | undefined, i: number): Landmark {
  if (!arr?.[i]) return EMPTY
  return { x: arr[i].x, y: arr[i].y, z: Math.max(-2, arr[i].z) }
}

function calcBrightness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const d = ctx.getImageData(0, 0, w, h).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4)
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  return Math.round(sum / (d.length / 4))
}

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}시간 ${m}분`
  if (m > 0) return `${m}분 ${sec}초`
  return `${sec}초`
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
  const emailRef = useRef<HTMLInputElement>(null)

  const detVideoRef    = useRef<HTMLVideoElement>(null)
  const detCanvasRef   = useRef<HTMLCanvasElement>(null)
  const detStreamRef   = useRef<MediaStream | null>(null)
  const detDetectorRef = useRef<any>(null)
  const recentFramesRef = useRef<Frame[]>([])
  const lastToastMs    = useRef(0)
  const darkModeRef    = useRef(false)

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
      setPhase("main")

      chrome.runtime.sendMessage({ type: "FETCH_USER_SETTINGS" }, (r: any) => {
        if (r?.settings)  setSettings(s => ({ ...s, ...r.settings }))
        if (r?.name)      setUserName(r.name)
        if (r?.profileImg !== undefined) setProfileImg(r.profileImg)
      })
    })
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

  // ── darkMode ref sync ─────────────────────────────────────
  useEffect(() => {
    darkModeRef.current = settings.darkDetectionEnabled
  }, [settings.darkDetectionEnabled])

  // ── Posture detection loop ────────────────────────────────
  useEffect(() => {
    if (phase !== "main" || !baselineDone || !sessionId) {
      detStreamRef.current?.getTracks().forEach(t => t.stop())
      detStreamRef.current = null
      return
    }

    let cancelled = false

    const run = async () => {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" }
        })
      } catch {
        return
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
      detStreamRef.current = stream

      const vid = detVideoRef.current
      if (!vid) return
      vid.srcObject = stream
      await new Promise<void>(r => { vid.onloadedmetadata = () => r() })
      vid.play()

      try {
        const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision")
        const wasmPath = chrome.runtime.getURL("assets/mediapipe-wasm")
        const vision = await FilesetResolver.forVisionTasks(wasmPath)
        const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
        const opts = (delegate: "GPU" | "CPU") => ({
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: "VIDEO" as const,
          numPoses: 1
        })
        try {
          detDetectorRef.current = await PoseLandmarker.createFromOptions(vision, opts("GPU"))
        } catch {
          detDetectorRef.current = await PoseLandmarker.createFromOptions(vision, opts("CPU"))
        }
      } catch (e) {
        console.error("[detect] MediaPipe 초기화 실패:", e)
      }

      let brightnessOffset = 0
      let calibrated = false

      const tick = async () => {
        if (cancelled) return

        const v = detVideoRef.current
        const c = detCanvasRef.current
        if (!v || !c) { setTimeout(tick, 5000); return }

        const ctx = c.getContext("2d", { willReadFrequently: true })!
        c.width  = v.videoWidth  || 640
        c.height = v.videoHeight || 480
        ctx.drawImage(v, 0, 0)

        const rawBrightness = calcBrightness(ctx, c.width, c.height)
        if (!calibrated) {
          const { baselineData } = await chrome.storage.local.get(["baselineData"])
          const storedBrightness: number | null = baselineData?.data?.baseline?.brightness ?? null
          if (storedBrightness !== null && rawBrightness > 0) {
            brightnessOffset = rawBrightness - storedBrightness
            console.log(`[posture] 밝기 캘리브레이션: offset=${brightnessOffset.toFixed(1)} (popup=${rawBrightness}, baseline=${storedBrightness})`)
          }
          calibrated = true
        }

        let pts: any[] | undefined
        let ptsNorm: any[] | undefined
        try {
          if (detDetectorRef.current) {
            const result = detDetectorRef.current.detectForVideo(v, performance.now())
            pts     = result.worldLandmarks?.[0]
            ptsNorm = result.landmarks?.[0]
            if (!pts) pts = ptsNorm
          }
        } catch {}

        const frame: Frame = {
          timestamp:      new Date().toISOString(),
          visibility:     pts?.[0]?.visibility ?? ptsNorm?.[0]?.visibility ?? 0,
          nose:           lm(pts, 0),
          left_ear:       lm(pts, 7),
          right_ear:      lm(pts, 8),
          left_shoulder:  lm(pts, 11),
          right_shoulder: lm(pts, 12),
          brightness:     Math.max(0, Math.round(rawBrightness - brightnessOffset))
        }

        if (frame.visibility < 0.5) {
          setTimeout(tick, 5000)
          return
        }

        recentFramesRef.current = [...recentFramesRef.current.slice(-9), frame]

        const { accessToken, userId } =
          await chrome.storage.local.get(["accessToken", "userId"])

        if (accessToken && !cancelled) {
          try {
            const res = await fetch(`${AI_API_BASE}/v1/posture/detect/batch`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                id: userId ?? "unknown",
                frames: recentFramesRef.current,
                z_threshold: 0.02,
                shoulder_threshold: 0.05,
                round_shoulder_ratio: 0.12,
                round_shoulder_z_threshold: 0.05,
                dark_mode: darkModeRef.current,
                dark_abs_threshold: 60,
                dark_relative_ratio: 0.5
              })
            })
            if (!res.ok) {
              const errBody = await res.text().catch(() => "")
              console.error("[posture] 400 에러 body:", errBody)
              try {
                const errJson = JSON.parse(errBody)
                if (errJson?.error?.code === "E_ENVIRONMENT_DRIFT") {
                  calibrated = false
                  brightnessOffset = 0
                  const now = Date.now()
                  if (now - lastToastMs.current > 30_000) {
                    lastToastMs.current = now
                    toast.warning("조명이 변경되어 밝기를 재조정합니다.", {
                      position: "top-center",
                      autoClose: 4000,
                      toastId: "env-drift"
                    })
                  }
                }
              } catch {}
            }
            if (res.ok && !cancelled) {
              const data = await res.json().catch(() => null)
              const state: string =
                typeof data === "string"
                  ? data
                  : (data?.dominant_state ?? data?.state ?? data?.result ?? "")
              if (state && !["GOOD", "good", "OK", "ok", ""].includes(state)) {
                const now = Date.now()
                if (now - lastToastMs.current > 30_000) {
                  lastToastMs.current = now
                  const msgs: Record<string, string> = {
                    TURTLE_NECK:    "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
                    SHOULDER_ISSUE: "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
                    DARK_ENV:       "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요."
                  }
                  const alertMsg = msgs[state] ?? "자세 이상이 감지되었어요! 자세를 확인해주세요."
                  toast.warning(alertMsg, {
                    position: "top-center",
                    autoClose: 5000,
                    toastId: "posture-warn"
                  })
                  chrome.runtime.sendMessage({ type: "POSTURE_ALERT", state, message: alertMsg })
                }
              }
            }
          } catch { /* silent */ }
        }

        setTimeout(tick, 5000)
      }

      tick()
    }

    run()

    return () => {
      cancelled = true
      detStreamRef.current?.getTracks().forEach(t => t.stop())
      detStreamRef.current = null
      detDetectorRef.current = null
    }
  }, [phase, baselineDone, sessionId])

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
      <video ref={detVideoRef} autoPlay playsInline muted style={{ display: "none" }} />
      <canvas ref={detCanvasRef} style={{ display: "none" }} />
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
            </div>
            {sessionId && elapsed > 0 && (
              <p className="session-time">{fmtDuration(elapsed)}</p>
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
