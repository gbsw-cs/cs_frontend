import { useEffect, useRef, useState } from "react"
import "./baseline.css"

const WEB_URL  = (process.env.PLASMO_PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")
const API_BASE = `${WEB_URL}/api/backend`

const DURATION_MS = 10_000
const INTERVAL_MS = 200

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
  return arr?.[i] ? { x: arr[i].x, y: arr[i].y, z: arr[i].z } : EMPTY
}

function calcBrightness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const d = ctx.getImageData(0, 0, w, h).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4)
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  return Math.round(sum / (d.length / 4))
}

type Phase = "cam" | "ready" | "collecting" | "uploading" | "done" | "error"

export default function BaselinePage() {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const detectorRef = useRef<any>(null)
  const framesRef   = useRef<Frame[]>([])

  const [phase, setPhase]       = useState<Phase>("cam")
  const [progress, setProgress] = useState(0)
  const [errMsg, setErrMsg]     = useState("")

  // ── Webcam ───────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((stream) => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => setPhase("ready")
      })
      .catch(() => {
        setErrMsg("카메라 접근 권한이 필요합니다.")
        setPhase("error")
      })
    return () => {
      const v = videoRef.current
      if (v?.srcObject)
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
    }
  }, [])

  // ── Init MediaPipe (GPU → CPU 폴백) ──────────────────────
  async function initDetector() {
    const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision")
    const wasmPath = chrome.runtime.getURL("assets/mediapipe-wasm")
    console.log("[baseline-tab] WASM 경로:", wasmPath)
    const vision = await FilesetResolver.forVisionTasks(wasmPath)
    console.log("[baseline-tab] FilesetResolver 완료")
    const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO" as const,
      numPoses: 1
    })
    try {
      detectorRef.current = await PoseLandmarker.createFromOptions(vision, opts("GPU"))
      console.log("[baseline-tab] GPU delegate 성공")
    } catch (gpuErr) {
      console.warn("[baseline-tab] GPU 실패, CPU로 재시도:", gpuErr)
      detectorRef.current = await PoseLandmarker.createFromOptions(vision, opts("CPU"))
      console.log("[baseline-tab] CPU delegate 성공")
    }
  }

  // ── Collect ───────────────────────────────────────────────
  async function start() {
    if (phase !== "ready") return
    setPhase("collecting")
    framesRef.current = []

    try {
      await initDetector()
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      console.error("[baseline-tab] detector 초기화 실패:", e)
      setErrMsg(`모델 초기화 실패: ${detail}`)
      setPhase("error")
      return
    }

    const video  = videoRef.current!
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext("2d", { willReadFrequently: true })!
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480

    const startTime = Date.now()

    const tick = () => {
      const elapsed = Date.now() - startTime
      setProgress(Math.min(100, Math.round((elapsed / DURATION_MS) * 100)))

      if (elapsed >= DURATION_MS) { upload(); return }

      ctx.drawImage(video, 0, 0)

      let pts: any[] | undefined
      let ptsNorm: any[] | undefined
      try {
        if (detectorRef.current) {
          const result = detectorRef.current.detectForVideo(video, performance.now())
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
        brightness:     calcBrightness(ctx, canvas.width, canvas.height)
      }
      framesRef.current.push(frame)

      if (framesRef.current.length % 5 === 1) {
        console.log(`[baseline-tab] 프레임 ${framesRef.current.length} | visibility: ${frame.visibility.toFixed(3)} | brightness: ${frame.brightness}`)
      }

      setTimeout(tick, INTERVAL_MS)
    }

    tick()
  }

  // ── Upload ────────────────────────────────────────────────
  async function upload() {
    setPhase("uploading")
    try {
      const { accessToken, userId } =
        await chrome.storage.local.get(["accessToken", "userId"])

      let finalId: string = userId
      if (!finalId && accessToken) {
        try {
          const meRes = await fetch(`${API_BASE}/users/me`, {
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }
          })
          if (meRes.ok) {
            const meJson = await meRes.json()
            finalId = meJson.data?.id
            if (finalId) await chrome.storage.local.set({ userId: finalId })
          }
        } catch {}
      }
      if (!finalId) throw new Error("사용자 정보를 가져올 수 없습니다. 다시 로그인해주세요.")

      const frames = framesRef.current
      if (frames.length === 0) throw new Error("수집된 프레임이 없습니다. 다시 시도해주세요.")

      const validCount = frames.filter(f => f.visibility >= 0.8).length
      console.log(`[baseline-tab] 업로드 | 총 ${frames.length}프레임 | visibility>=0.8: ${validCount}개 (${Math.round(validCount/frames.length*100)}%) | userId: ${finalId}`)

      const res = await fetch(`${WEB_URL}/v1/baseline/cal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: finalId, frames })
      })

      if (!res.ok) {
        const text = await res.text()
        let errMsg = `서버 오류 (${res.status})`
        try {
          const j = JSON.parse(text)
          if (j.code === "E_QUALITY_GATE_FAILED") {
            errMsg = "얼굴과 어깨가 잘 보이지 않습니다.\n카메라 정면을 바라보고 밝은 환경에서 다시 시도해주세요."
          } else {
            const raw = j.message ?? j.detail?.[0]?.msg ?? j.error
            if (raw != null) errMsg = typeof raw === "string" ? raw : JSON.stringify(raw)
          }
        } catch {}
        console.error("[baseline-tab] 업로드 오류:", res.status, text)
        throw new Error(errMsg)
      }

      const baselineData = await res.json().catch(() => null)
      await chrome.storage.local.set({ baselineDone: true, baselineData })
      await new Promise<void>(resolve =>
        chrome.runtime.sendMessage({ type: "START_SESSION" }, () => resolve())
      )
      setPhase("done")
      setTimeout(() => window.close(), 2000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrMsg(msg)
      setPhase("error")
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="bl-page">
      <header className="bl-header">
        <div className="bl-logo">A</div>
        <div>
          <h1 className="bl-title">베이스라인 측정</h1>
          <p className="bl-sub">바른 자세로 앉아 10초간 측정합니다</p>
        </div>
      </header>

      <div className="bl-cam-wrap">
        <video ref={videoRef} autoPlay playsInline muted className="bl-video" />
        <canvas ref={canvasRef} className="bl-canvas" />
        {phase === "collecting" && (
          <div className="bl-progress-bar-wrap">
            <div className="bl-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="bl-controls">
        {phase === "cam" && <p className="bl-hint">카메라를 불러오는 중…</p>}

        {phase === "ready" && (
          <>
            <p className="bl-hint">
              카메라 정면을 바라보고 어깨가 보이도록 앉아주세요.<br />
              준비되면 아래 버튼을 누르세요.
            </p>
            <button className="bl-btn" onClick={start}>측정 시작</button>
          </>
        )}

        {phase === "collecting" && (
          <p className="bl-hint">측정 중… <strong>{progress}%</strong></p>
        )}

        {phase === "uploading" && <p className="bl-hint">데이터를 저장하는 중…</p>}

        {phase === "done" && (
          <p className="bl-success">베이스라인 측정 완료! 창이 닫힙니다.</p>
        )}

        {phase === "error" && (
          <>
            <p className="bl-error" style={{ whiteSpace: "pre-line" }}>{errMsg}</p>
            <button
              className="bl-btn bl-btn-outline"
              onClick={() => window.location.reload()}>
              다시 시도
            </button>
          </>
        )}
      </div>
    </div>
  )
}
