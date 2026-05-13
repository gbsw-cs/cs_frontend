import { useEffect, useRef } from "react"

const AI_API_BASE = process.env.PLASMO_PUBLIC_AI_API_BASE!
const API_BASE = process.env.PLASMO_PUBLIC_API_BASE!

const SEVERITY: Record<string, number> = {
  TURTLE_NECK: 2,
  SHOULDER_ISSUE: 2,
  ROUND_SHOULDER: 2,
  SHOULDER_ASYMMETRY: 2,
  shoulder_tilted: 2,
  round_shoulder: 2,
  turtle_neck: 2,
  DARK_ENV: 1,
  dark_env: 1,
  GOOD_POSTURE: 1,
}

interface DetectionEvent {
  type: string
  severity: number
  durationSec: number
  detectedAt: string
}

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
  const streamRef         = useRef<MediaStream | null>(null)
  const detectorRef       = useRef<any>(null)
  const cancelledRef      = useRef(false)
  const framesRef         = useRef<Frame[]>([])
  const lastAlertMsRef    = useRef(0)
  const darkModeRef       = useRef(false)
  const reportedActiveRef = useRef(false)

  // 이벤트 배치 전송용
  const currentStateRef   = useRef<string | null>(null)
  const stateStartRef     = useRef<number>(0)
  const eventQueueRef     = useRef<DetectionEvent[]>([])
  const batchTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // AI 상태 → 백엔드 이벤트 타입 매핑
  function toBackendType(state: string): string {
    if (state === "TURTLE_NECK" || state === "turtle_neck") return "TURTLE_NECK"
    if (state === "SHOULDER_ISSUE" || state === "round_shoulder") return "ROUND_SHOULDER"
    if (state === "shoulder_tilted") return "SHOULDER_ASYMMETRY"
    if (state === "DARK_ENV" || state === "dark_env") return "DARK_ENV"
    return "GOOD_POSTURE"
  }

  // 상태 변경 시 이전 상태를 이벤트 큐에 추가
  function recordStateChange(newState: string) {
    const prev = currentStateRef.current
    const now = Date.now()
    if (prev !== null && stateStartRef.current > 0) {
      const durationSec = Math.round((now - stateStartRef.current) / 1000)
      if (durationSec >= 1) {
        eventQueueRef.current.push({
          type: toBackendType(prev),
          severity: SEVERITY[toBackendType(prev)] ?? 1,
          durationSec,
          detectedAt: new Date(stateStartRef.current).toISOString(),
        })
      }
    }
    currentStateRef.current = newState
    stateStartRef.current = now
  }

  // 이벤트 큐를 백엔드에 배치 전송
  async function flushEvents() {
    // 현재 진행 중인 상태를 스냅샷으로 큐에 추가 (상태 변화 없어도 주기적 전송)
    if (currentStateRef.current !== null && stateStartRef.current > 0) {
      const now = Date.now()
      const durationSec = Math.round((now - stateStartRef.current) / 1000)
      if (durationSec >= 5) {
        eventQueueRef.current.push({
          type: toBackendType(currentStateRef.current),
          severity: SEVERITY[toBackendType(currentStateRef.current)] ?? 1,
          durationSec,
          detectedAt: new Date(stateStartRef.current).toISOString(),
        })
        stateStartRef.current = now  // 스냅샷 후 타이머 리셋
      }
    }

    if (eventQueueRef.current.length === 0) return
    // extension context 무효화 방어
    if (typeof chrome === "undefined" || !chrome.storage?.local) return
    let currentSessionId: string | undefined
    let accessToken: string | undefined
    try {
      const result = await chrome.storage.local.get(["currentSessionId", "accessToken"])
      currentSessionId = result.currentSessionId
      accessToken = result.accessToken
    } catch {
      return
    }
    // 로컬 세션(local-xxx)은 백엔드에 전송 불가 → 스킵
    if (!currentSessionId || !accessToken || String(currentSessionId).startsWith("local-")) return
    const events = eventQueueRef.current.splice(0)
    console.log(`[offscreen] flush: ${events.length}개 이벤트 전송`, events.map(e => `${e.type}(${e.durationSec}s)`))
    try {
      const res = await fetch(`${API_BASE}/sessions/${currentSessionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ events }),
      })
      if (!res.ok) {
        // 백엔드 오류 시 큐에 복원
        eventQueueRef.current.unshift(...events)
      }
    } catch {
      // 네트워크 오류 시 큐에 복원
      eventQueueRef.current.unshift(...events)
    }
  }

  function stopDetection() {
    cancelledRef.current = true
    if (batchTimerRef.current) { clearInterval(batchTimerRef.current); batchTimerRef.current = null }
    // 남은 이벤트 전송
    if (currentStateRef.current !== null) recordStateChange("__end__")
    flushEvents().catch(() => {})
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    detectorRef.current = null
  }

  async function startDetection(accessToken: string, userId: string, baselineData: any) {
    cancelledRef.current = false
    framesRef.current = []
    currentStateRef.current = null
    stateStartRef.current = 0
    eventQueueRef.current = []

    // 30초마다 이벤트 배치 전송
    if (batchTimerRef.current) clearInterval(batchTimerRef.current)
    batchTimerRef.current = setInterval(() => { flushEvents().catch(() => {}) }, 30_000)

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

      let currentToken: string | undefined
      try {
        const stored = await chrome.storage.local.get("accessToken")
        currentToken = stored.accessToken
      } catch {
        setTimeout(tick, 5000)
        return
      }
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
            // final_status 우선, 구버전 필드 폴백
            const rawState: string = typeof data === "string" ? data :
              (data?.data?.final_status ?? data?.dominant_state ?? data?.state ?? data?.result ?? "")

            // 정규화: 좋은 자세는 GOOD_POSTURE, 나쁜 자세는 원본 유지
            const GOOD_STATES = ["GOOD","good","OK","ok","good_posture","GOOD_POSTURE",""]
            const normalizedState = GOOD_STATES.includes(rawState)
              ? "GOOD_POSTURE"
              : rawState

            console.log(`[offscreen] 감지: ${rawState || "(없음)"} → ${normalizedState}`)

            // 상태 변경 감지 → 이벤트 큐에 추가
            if (normalizedState !== currentStateRef.current) {
              console.log(`[offscreen] 상태 변경: ${currentStateRef.current} → ${normalizedState}`)
              recordStateChange(normalizedState)
            }

            // 나쁜 자세 경고 (30초 쿨다운)
            if (normalizedState !== "GOOD_POSTURE") {
              const now = Date.now()
              if (now - lastAlertMsRef.current > 30_000) {
                lastAlertMsRef.current = now
                const msgs: Record<string,string> = {
                  TURTLE_NECK: "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
                  turtle_neck: "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
                  SHOULDER_ISSUE: "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
                  round_shoulder: "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
                  shoulder_tilted: "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
                  DARK_ENV: "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요.",
                  dark_env: "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요."
                }
                const message = msgs[rawState] ?? "자세 이상이 감지되었어요! 자세를 확인해주세요."
                chrome.runtime.sendMessage({ type: "POSTURE_ALERT_OFFSCREEN", state: rawState, message })
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
