import { useEffect, useRef } from "react"

const AI_API_BASE = process.env.PLASMO_PUBLIC_AI_API_BASE!

interface Landmark { x: number; y: number; z: number }
interface Frame {
  timestamp: string; visibility: number
  nose: Landmark; left_ear: Landmark; right_ear: Landmark
  left_shoulder: Landmark; right_shoulder: Landmark; brightness: number
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

export default function OffscreenPage() {
  const streamRef      = useRef<MediaStream | null>(null)
  const detectorRef    = useRef<any>(null)
  const cancelledRef   = useRef(false)
  const framesRef      = useRef<Frame[]>([])
  const lastAlertMsRef    = useRef(0)
  const darkModeRef       = useRef(false)
  const reportedActiveRef = useRef(false)

  useEffect(() => {
    const handleMessage = (msg: any, _sender: any, sendResponse: any) => {
      if (msg?.type === "START_DETECTION") {
        console.log("[offscreen] START_DETECTION 수신, userId:", msg.userId)
        darkModeRef.current = msg.settings?.darkDetectionEnabled ?? false
        startDetection(msg.accessToken, msg.userId, msg.baselineData)
        sendResponse({ ok: true })
        return true
      }
      if (msg?.type === "STOP_DETECTION") {
        stopDetection()
        sendResponse({ ok: true })
        return true
      }
      if (msg?.type === "UPDATE_SETTINGS") {
        if (msg.settings?.darkDetectionEnabled !== undefined)
          darkModeRef.current = msg.settings.darkDetectionEnabled
        sendResponse({ ok: true })
        return true
      }
    }

    // CRITICAL: register listener BEFORE sending OFFSCREEN_READY
    chrome.runtime.onMessage.addListener(handleMessage)
    console.log("[offscreen] 초기화 완료, OFFSCREEN_READY 전송")
    chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }).catch(e =>
      console.error("[offscreen] OFFSCREEN_READY 전송 실패:", e)
    )

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
      stopDetection()
    }
  }, [])

  function stopDetection() {
    cancelledRef.current = true
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    detectorRef.current = null
  }

  async function startDetection(accessToken: string, userId: string, baselineData: any) {
    cancelledRef.current = false
    framesRef.current = []

    console.log("[offscreen] 웹캠 요청 중...")
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }
      })
      console.log("[offscreen] 웹캠 획득 성공")
    } catch (e) {
      console.error("[offscreen] 웹캠 획득 실패:", e)
      return
    }
    if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
    streamRef.current = stream

    const vid = document.createElement("video")
    vid.autoplay = true; vid.playsInline = true; vid.muted = true
    vid.style.display = "none"
    document.body.appendChild(vid)
    const canvas = document.createElement("canvas")
    canvas.style.display = "none"
    document.body.appendChild(canvas)

    vid.srcObject = stream
    await new Promise<void>(r => { vid.onloadedmetadata = () => r() })
    vid.play()

    // LOCAL model — no CDN download needed
    console.log("[offscreen] MediaPipe 초기화 중 (로컬 모델)...")
    try {
      const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision")
      const wasmPath = chrome.runtime.getURL("assets/mediapipe-wasm")
      const vision = await FilesetResolver.forVisionTasks(wasmPath)
      const MODEL = chrome.runtime.getURL("assets/mediapipe-wasm/pose_landmarker_lite.task")
      const opts = (delegate: "GPU" | "CPU") => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "VIDEO" as const,
        numPoses: 1
      })
      try {
        detectorRef.current = await PoseLandmarker.createFromOptions(vision, opts("GPU"))
        console.log("[offscreen] MediaPipe GPU 성공")
      } catch {
        detectorRef.current = await PoseLandmarker.createFromOptions(vision, opts("CPU"))
        console.log("[offscreen] MediaPipe CPU 성공")
      }
    } catch (e) {
      console.error("[offscreen] MediaPipe 초기화 실패:", e)
    }

    let brightnessOffset = 0
    let calibrated = false

    const tick = async () => {
      if (cancelledRef.current) return

      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      canvas.width = vid.videoWidth || 640
      canvas.height = vid.videoHeight || 480
      ctx.drawImage(vid, 0, 0)

      const rawBrightness = calcBrightness(ctx, canvas.width, canvas.height)
      if (!calibrated) {
        const storedBrightness: number | null = baselineData?.data?.baseline?.brightness ?? null
        if (storedBrightness !== null && rawBrightness > 0)
          brightnessOffset = rawBrightness - storedBrightness
        calibrated = true
      }

      let pts: any[] | undefined
      let ptsNorm: any[] | undefined
      try {
        if (detectorRef.current) {
          const result = detectorRef.current.detectForVideo(vid, performance.now())
          pts = result.worldLandmarks?.[0]
          ptsNorm = result.landmarks?.[0]
          if (!pts) pts = ptsNorm
        }
      } catch {}

      const frame: Frame = {
        timestamp: new Date().toISOString(),
        visibility: pts?.[0]?.visibility ?? ptsNorm?.[0]?.visibility ?? 0,
        nose: lm(pts, 0), left_ear: lm(pts, 7), right_ear: lm(pts, 8),
        left_shoulder: lm(pts, 11), right_shoulder: lm(pts, 12),
        brightness: Math.max(0, Math.round(rawBrightness - brightnessOffset))
      }

      console.log("[offscreen] tick | vis:", frame.visibility.toFixed(2), "| brightness:", frame.brightness)

      if (frame.visibility < 0.5) { setTimeout(tick, 5000); return }

      framesRef.current = [...framesRef.current.slice(-9), frame]

      const { accessToken: currentToken } = await chrome.storage.local.get("accessToken")
      if (currentToken && !cancelledRef.current) {
        try {
          const res = await fetch(`${AI_API_BASE}/v1/posture/detect/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentToken}` },
            body: JSON.stringify({
              id: userId ?? "unknown",
              frames: framesRef.current,
              z_threshold: 0.02, shoulder_threshold: 0.05,
              round_shoulder_ratio: 0.12, round_shoulder_z_threshold: 0.05,
              dark_mode: darkModeRef.current, dark_abs_threshold: 60, dark_relative_ratio: 0.5
            })
          })
          console.log("[offscreen] 응답:", res.status, res.ok ? "OK" : "FAIL")

          if (!res.ok) {
            const errBody = await res.text().catch(() => "")
            try {
              const errJson = JSON.parse(errBody)
              if (errJson?.error?.code === "E_ENVIRONMENT_DRIFT") {
                calibrated = false; brightnessOffset = 0
              }
            } catch {}
          }

          if (res.ok && !cancelledRef.current) {
            if (!reportedActiveRef.current) {
              reportedActiveRef.current = true
              chrome.runtime.sendMessage({ type: "DETECTION_ACTIVE" }).catch(() => {})
            }
            const data = await res.json().catch(() => null)
            const state: string = typeof data === "string" ? data :
              (data?.dominant_state ?? data?.state ?? data?.result ?? "")
            if (state && !["GOOD","good","OK","ok",""].includes(state)) {
              const now = Date.now()
              if (now - lastAlertMsRef.current > 30_000) {
                lastAlertMsRef.current = now
                const msgs: Record<string,string> = {
                  TURTLE_NECK: "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
                  SHOULDER_ISSUE: "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
                  DARK_ENV: "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요."
                }
                const message = msgs[state] ?? "자세 이상이 감지되었어요! 자세를 확인해주세요."
                chrome.runtime.sendMessage({ type: "POSTURE_ALERT_OFFSCREEN", state, message })
              }
            }
          }
        } catch { /* silent */ }
      }

      setTimeout(tick, 5000)
    }

    tick()
  }

  return <div />
}
