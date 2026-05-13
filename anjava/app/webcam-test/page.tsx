"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_URL!
const WASM_CDN = "/mediapipe-wasm"
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
const DURATION_MS = 10_000
const INTERVAL_MS = 200

interface Landmark { x: number; y: number; z: number }
interface Frame {
  timestamp: string
  visibility: number
  nose: Landmark
  left_ear: Landmark
  right_ear: Landmark
  left_shoulder: Landmark
  right_shoulder: Landmark
  brightness: number
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

function WebcamTest() {
  const searchParams = useSearchParams()
  const extId = searchParams.get("extId") ?? ""

  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const detectorRef = useRef<any>(null)
  const framesRef  = useRef<Frame[]>([])

  const [phase, setPhase]       = useState<Phase>("cam")
  const [progress, setProgress] = useState(0)
  const [errMsg, setErrMsg]     = useState("")

  // 웹캠 시작
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
      if (v?.srcObject) (v.srcObject as MediaStream).getTracks().forEach(t => t.stop())
    }
  }, [])

  async function initDetector() {
    const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision")
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO" as const,
      numPoses: 1,
    })
    try {
      detectorRef.current = await PoseLandmarker.createFromOptions(vision, opts("GPU"))
    } catch {
      detectorRef.current = await PoseLandmarker.createFromOptions(vision, opts("CPU"))
    }
  }

  async function start() {
    if (phase !== "ready") return
    setPhase("collecting")
    framesRef.current = []

    try {
      await initDetector()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrMsg(`모델 초기화 실패: ${msg}`)
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
          pts      = result.worldLandmarks?.[0]   // 미터 단위 실좌표
          ptsNorm  = result.landmarks?.[0]         // 정규화 좌표 (fallback)
          if (!pts) pts = ptsNorm
        }
      } catch {}

      // 첫 5프레임에 z값 비교 로그
      if (framesRef.current.length < 5 && pts) {
        const noseZ       = pts[0]?.z?.toFixed(4)
        const lShoulderZ  = pts[11]?.z?.toFixed(4)
        const rShoulderZ  = pts[12]?.z?.toFixed(4)
        const noseZNorm   = ptsNorm?.[0]?.z?.toFixed(4)
        const lSNorm      = ptsNorm?.[11]?.z?.toFixed(4)
        console.log(`[frame ${framesRef.current.length}] world z → nose:${noseZ} lShoulder:${lShoulderZ} rShoulder:${rShoulderZ}`)
        console.log(`[frame ${framesRef.current.length}] norm  z → nose:${noseZNorm} lShoulder:${lSNorm}`)
      }

      framesRef.current.push({
        timestamp:      new Date().toISOString(),
        visibility:     pts?.[0]?.visibility ?? ptsNorm?.[0]?.visibility ?? 0,
        nose:           lm(pts, 0),
        left_ear:       lm(pts, 7),
        right_ear:      lm(pts, 8),
        left_shoulder:  lm(pts, 11),
        right_shoulder: lm(pts, 12),
        brightness:     calcBrightness(ctx, canvas.width, canvas.height),
      })
      setTimeout(tick, INTERVAL_MS)
    }
    tick()
  }

  async function upload() {
    setPhase("uploading")
    try {
      const accessToken = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null
      if (!accessToken) throw new Error("로그인이 필요합니다. 웹앱에서 로그인 후 다시 시도해주세요.")

      let userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null
      if (!userId) {
        const meRes = await fetch(`${API_URL}/users/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (meRes.ok) {
          const meJson = await meRes.json()
          userId = meJson.data?.id ?? null
          if (userId) localStorage.setItem("userId", userId)
        }
      }
      if (!userId) throw new Error("사용자 정보를 가져올 수 없습니다.")

      const frames = framesRef.current
      if (frames.length === 0) throw new Error("수집된 프레임이 없습니다.")

      const validCount = frames.filter(f => f.visibility >= 0.8).length
      console.log(`[webcam-test] 총 ${frames.length}프레임 | visibility>=0.8: ${validCount}개 (${Math.round(validCount/frames.length*100)}%)`)

      const res = await fetch(`/v1/baseline/cal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ id: userId, frames }),
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
        throw new Error(errMsg)
      }

      const baselineData = await res.json().catch(() => null)

      // 확장프로그램으로 데이터 전송
      if (extId && typeof window !== "undefined" && (window as any).chrome?.runtime?.sendMessage) {
        try {
          await new Promise<void>((resolve) => {
            ;(window as any).chrome.runtime.sendMessage(
              extId,
              { type: "BASELINE_DONE", baselineData },
              () => resolve()
            )
          })
        } catch {
          // 확장 메시지 전송 실패는 무시 (사용자가 수동으로 확인)
        }
      }

      setPhase("done")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrMsg(msg)
      setPhase("error")
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100">
          <h1 className="text-lg font-bold text-zinc-900">베이스라인 측정</h1>
          <p className="text-sm text-zinc-400 mt-0.5">바른 자세로 앉아 10초간 측정합니다</p>
        </div>

        {/* Camera */}
        <div className="relative bg-zinc-900 aspect-video">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          <canvas ref={canvasRef} className="hidden" />
          {phase === "collecting" && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-6 py-5 space-y-4">
          {phase === "cam" && (
            <p className="text-sm text-zinc-400 text-center">카메라를 불러오는 중…</p>
          )}

          {phase === "ready" && (
            <>
              <p className="text-sm text-zinc-500 text-center leading-relaxed">
                카메라 정면을 바라보고 어깨가 보이도록 앉아주세요.<br />
                준비되면 아래 버튼을 누르세요.
              </p>
              <button
                onClick={start}
                className="w-full h-11 bg-blue-600 text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity"
              >
                측정 시작
              </button>
            </>
          )}

          {phase === "collecting" && (
            <p className="text-sm text-zinc-500 text-center">
              측정 중… <span className="font-bold text-blue-600">{progress}%</span>
            </p>
          )}

          {phase === "uploading" && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-zinc-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-zinc-500">데이터를 저장하는 중…</p>
            </div>
          )}

          {phase === "done" && (
            <div className="text-center space-y-3">
              <div className="text-3xl">✅</div>
              <p className="text-sm font-semibold text-green-600">베이스라인 측정 완료!</p>
              <p className="text-xs text-zinc-400">
                {extId
                  ? "확장프로그램 팝업을 열어 세션을 시작하세요."
                  : "이 창을 닫아도 됩니다."}
              </p>
              <button
                onClick={() => window.close()}
                className="w-full h-10 border border-zinc-200 text-zinc-600 font-medium rounded-xl text-sm hover:bg-zinc-50 transition"
              >
                창 닫기
              </button>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-3">
              <p className="text-sm text-red-500 text-center whitespace-pre-line">{errMsg}</p>
              <button
                onClick={() => window.location.reload()}
                className="w-full h-10 border border-zinc-200 text-zinc-600 font-medium rounded-xl text-sm hover:bg-zinc-50 transition"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function WebcamTestPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <WebcamTest />
    </Suspense>
  )
}
