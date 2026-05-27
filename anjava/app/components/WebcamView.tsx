"use client";

import Webcam from "react-webcam";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPostureFrame, type PostureFrame } from "../lib/poseFrame";
import {
  endDetectionSession,
  postDashboardTimeline,
  postSessionEvents,
  startDetectionSession,
  type DetectionSessionEvent,
  type DetectionState,
} from "../lib/api";

const VIDEO_CONSTRAINTS = {
  width: 640,
  height: 480,
  facingMode: "user",
};
const FRAME_CAPTURE_INTERVAL_MS = 1000;
const BATCH_SEND_INTERVAL_MS = 5000;
const BATCH_FRAME_COUNT = 10;
const BASELINE_RETRY_COOLDOWN_MS = 30_000;
const EVENT_FLUSH_INTERVAL_MS = 30_000;

type WebcamViewProps = {
  darkDetectionEnabled?: boolean;
  onDetectionStateChange?: (state: DetectionState, message: string) => void;
  onDashboardDataChanged?: () => void;
};

const AI_STATUS_TO_BACKEND_STATE: Record<string, DetectionState> = {
  good: "GOOD_POSTURE",
  good_posture: "GOOD_POSTURE",
  normal: "GOOD_POSTURE",
  turtle_neck: "TURTLE_NECK",
  round_shoulder: "ROUND_SHOULDER",
  shoulder_tilted: "SHOULDER_ASYMMETRY",
  shoulder_asymmetry: "SHOULDER_ASYMMETRY",
  shoulder_issue: "SHOULDER_ISSUE",
  dark_env: "DARK_ENV",
  dark_environment: "DARK_ENV",
};

const STATE_SEVERITY: Record<DetectionState, number> = {
  GOOD_POSTURE: 1,
  TURTLE_NECK: 2,
  SHOULDER_ISSUE: 2,
  ROUND_SHOULDER: 2,
  SHOULDER_ASYMMETRY: 2,
  DARK_ENV: 1,
};

function toBackendState(finalStatus: string): DetectionState {
  return AI_STATUS_TO_BACKEND_STATE[finalStatus.toLowerCase()] ?? "GOOD_POSTURE";
}

function getKSTDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

function isBaselineReady() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("aiBaselineReady") === "1";
}

function clearStoredBaseline() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("aiBaseline");
  localStorage.removeItem("aiBaselineReady");
}

function getApiErrorCode(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isDuplicateSessionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /이미 진행 중인 세션|already.*session|session.*already/i.test(error.message);
}

function findDetectedLabels(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDetectedLabels(item, `${prefix}${index}.`));
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const path = `${prefix}${key}`;
    if (
      typeof child === "boolean" &&
      child &&
      !["success", "ok", "valid"].includes(key.toLowerCase())
    ) {
      return [path];
    }
    if (typeof child === "object" && child !== null) {
      return findDetectedLabels(child, `${path}.`);
    }
    return [];
  });
}

const POSTURE_MESSAGES: Record<string, string> = {
  turtle_neck:        "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
  round_shoulder:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
  shoulder_tilted:    "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
  dark_env:           "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요.",
};

const TOAST_STYLE = `
  #anjava-web-toast {
    position: fixed; top: 20px; right: 20px;
    background: #fff; color: #18181b;
    border-radius: 16px; z-index: 2147483647;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
    width: 300px; overflow: hidden;
    border: 1px solid rgba(0,0,0,0.07);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Pretendard, sans-serif;
    animation: anjava-web-in 0.32s cubic-bezier(0.16,1,0.3,1);
    pointer-events: auto;
  }
  #anjava-web-toast.out { animation: anjava-web-out 0.24s ease forwards; }
  #anjava-web-toast .anjava-web-header {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 14px 10px; border-bottom: 1px solid #f4f4f5;
  }
  #anjava-web-toast .anjava-web-icon { font-size: 18px; flex-shrink: 0; }
  #anjava-web-toast .anjava-web-title {
    font-weight: 700; font-size: 13px; color: #2563eb; flex: 1;
  }
  #anjava-web-toast .anjava-web-close {
    background: none; border: none; color: #a1a1aa; cursor: pointer;
    font-size: 16px; padding: 0; line-height: 1;
  }
  #anjava-web-toast .anjava-web-body {
    padding: 10px 14px 12px; font-size: 12.5px; color: #3f3f46; line-height: 1.55;
  }
  #anjava-web-toast .anjava-web-progress {
    height: 3px; background: #2563eb;
    animation: anjava-web-progress 6s linear forwards; transform-origin: left;
  }
  @keyframes anjava-web-in {
    from { opacity: 0; transform: translateX(60px) scale(0.95); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }
  @keyframes anjava-web-out {
    to { opacity: 0; transform: translateX(60px) scale(0.95); }
  }
  @keyframes anjava-web-progress {
    from { transform: scaleX(1); }
    to   { transform: scaleX(0); }
  }
`;

let webToastTimer: ReturnType<typeof setTimeout> | null = null;

function closePostureToast(el: HTMLElement) {
  el.classList.add("out");
  setTimeout(() => el.remove(), 240);
}

function showPostureToast(message: string) {
  if (typeof document === "undefined") return;
  if (!document.getElementById("anjava-web-style")) {
    const s = document.createElement("style");
    s.id = "anjava-web-style";
    s.textContent = TOAST_STYLE;
    document.head.appendChild(s);
  }
  if (webToastTimer) { clearTimeout(webToastTimer); webToastTimer = null; }
  const old = document.getElementById("anjava-web-toast");
  if (old) old.remove();

  const el = document.createElement("div");
  el.id = "anjava-web-toast";
  const header = document.createElement("div");
  header.className = "anjava-web-header";
  const icon = document.createElement("span");
  icon.className = "anjava-web-icon";
  icon.textContent = "!";
  const title = document.createElement("span");
  title.className = "anjava-web-title";
  title.textContent = "자세 교정 알림";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "anjava-web-close";
  close.textContent = "x";
  close.addEventListener("click", () => closePostureToast(el));
  header.append(icon, title, close);

  const body = document.createElement("div");
  body.className = "anjava-web-body";
  body.textContent = message;
  const progress = document.createElement("div");
  progress.className = "anjava-web-progress";
  el.append(header, body, progress);
  document.body.appendChild(el);
  webToastTimer = setTimeout(() => {
    closePostureToast(el);
  }, 6000);
}

export default function WebcamView({
  darkDetectionEnabled = false,
  onDetectionStateChange,
  onDashboardDataChanged,
}: WebcamViewProps) {
  const webcamRef = useRef<Webcam>(null);
  const analyzingRef = useRef(false);
  const framesRef = useRef<PostureFrame[]>([]);
  const lastStatusRef = useRef("");
  const lastBatchSentAtRef = useRef(0);
  const baselineRetryAtRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const eventQueueRef = useRef<DetectionSessionEvent[]>([]);
  const stateStartRef = useRef<number>(Date.now());
  const lastBackendStateRef = useRef<DetectionState | null>(null);
  const onDetectionStateChangeRef = useRef(onDetectionStateChange);
  const onDashboardDataChangedRef = useRef(onDashboardDataChanged);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [aiStatus, setAiStatus] = useState<"idle" | "ok" | "error">("idle");

  const flushQueuedEvents = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || eventQueueRef.current.length === 0) return;
    const events = eventQueueRef.current.splice(0, 100);
    try {
      await postSessionEvents(sessionId, events);
      onDashboardDataChangedRef.current?.();
    } catch (e) {
      eventQueueRef.current = [...events, ...eventQueueRef.current].slice(0, 100);
      console.error("Detection events upload failed", e);
    }
  }, []);

  useEffect(() => {
    onDetectionStateChangeRef.current = onDetectionStateChange;
    onDashboardDataChangedRef.current = onDashboardDataChanged;
  }, [onDetectionStateChange, onDashboardDataChanged]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    startDetectionSession()
      .then((session) => {
        if (cancelled) return;
        sessionIdRef.current = session.sessionId;
        stateStartRef.current = Date.now();
      })
      .catch((e) => {
        if (!isDuplicateSessionError(e)) {
          console.error("Detection session start failed", e);
        }
      });

    async function flushEvents() {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const currentState = lastBackendStateRef.current;
      if (currentState) {
        const now = Date.now();
        eventQueueRef.current.push({
          type: currentState,
          severity: STATE_SEVERITY[currentState],
          durationSec: Math.max(1, Math.round((now - stateStartRef.current) / 1000)),
          detectedAt: new Date(stateStartRef.current).toISOString(),
        });
        stateStartRef.current = now;
      }
      await flushQueuedEvents();
    }

    const flushInterval = window.setInterval(flushEvents, EVENT_FLUSH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(flushInterval);
      const previous = lastBackendStateRef.current;
      if (previous) {
        const now = Date.now();
        eventQueueRef.current.push({
          type: previous,
          severity: STATE_SEVERITY[previous],
          durationSec: Math.max(1, Math.round((now - stateStartRef.current) / 1000)),
          detectedAt: new Date(stateStartRef.current).toISOString(),
        });
      }
      const sessionId = sessionIdRef.current;
      const events = eventQueueRef.current.splice(0, 100);
      sessionIdRef.current = null;
      lastBackendStateRef.current = null;
      if (sessionId) {
        if (events.length > 0) {
          void postSessionEvents(sessionId, events).catch((e) => {
            console.error("Detection events final upload failed", e);
          });
        }
        void endDetectionSession(sessionId).then(() => {
          onDashboardDataChangedRef.current?.();
        }).catch((e) => {
          console.error("Detection session end failed", e);
        });
      }
    };
  }, [ready, flushQueuedEvents]);

  useEffect(() => {
    if (!ready) return;

    async function refreshBaseline(id: string, frames: PostureFrame[]) {
      const response = await fetch("/v1/baseline/cal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, frames }),
      });
      if (!response.ok) {
        baselineRetryAtRef.current = Date.now() + BASELINE_RETRY_COOLDOWN_MS;
        const errorBody = await response.json().catch(() => null);
        console.error("Baseline request failed", response.status, errorBody);
        return false;
      }
      localStorage.setItem("aiBaselineReady", "1");
      localStorage.setItem("aiSessionId", id);
      return true;
    }

    function recordStateChange(nextState: DetectionState, message: string) {
      const previous = lastBackendStateRef.current;
      const now = Date.now();
      if (previous && previous !== nextState) {
        eventQueueRef.current.push({
          type: previous,
          severity: STATE_SEVERITY[previous],
          durationSec: Math.max(1, Math.round((now - stateStartRef.current) / 1000)),
          detectedAt: new Date(stateStartRef.current).toISOString(),
        });
        void flushQueuedEvents();
      }
      if (previous !== nextState) {
        stateStartRef.current = now;
        lastBackendStateRef.current = nextState;
        const { date, time } = getKSTDateTime();
        void postDashboardTimeline({
          date,
          time,
          dominantState: nextState,
          message,
        }).then(() => {
          onDashboardDataChangedRef.current?.();
        }).catch((e) => {
          console.error("Dashboard timeline upload failed", e);
        });
      }
      onDetectionStateChangeRef.current?.(nextState, message);
    }

    async function analyzeFrame() {
      if (analyzingRef.current) return;
      analyzingRef.current = true;
      const video = webcamRef.current?.video;
      try {
        if (!video) return;
        const frame = await createPostureFrame(video);
        if (!frame) return;
        framesRef.current = [...framesRef.current.slice(-(BATCH_FRAME_COUNT - 1)), frame];
        if (framesRef.current.length < BATCH_FRAME_COUNT) {
          setAiStatus("idle");
          return;
        }
        const now = Date.now();
        if (lastBatchSentAtRef.current > 0 && now - lastBatchSentAtRef.current < BATCH_SEND_INTERVAL_MS) {
          return;
        }

        // userId를 세션 ID로 사용 (webcam-test와 동일한 ID)
        const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
        const id =
          userId ??
          localStorage.getItem("aiSessionId") ??
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}`);
        localStorage.setItem("aiSessionId", id);

        // baseline 없으면 즉시 측정
        if (!isBaselineReady()) {
          if (Date.now() < baselineRetryAtRef.current) {
            setAiStatus("error");
            return;
          }
          const refreshed = await refreshBaseline(id, framesRef.current);
          if (!refreshed) { setAiStatus("idle"); return; }
        }

        lastBatchSentAtRef.current = now;
        const response = await fetch("/v1/posture/detect/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            frames: framesRef.current,
            z_threshold: 0.07,
            shoulder_threshold: 0.05,
            round_shoulder_ratio: 0.12,
            round_shoulder_z_threshold: 0.05,
            round_shoulder_absolute_max: 0,
            round_shoulder_backup_z_threshold: 0,
            dark_mode: darkDetectionEnabled,
            dark_abs_threshold: 60,
            dark_relative_ratio: 0.5,
          }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const code = getApiErrorCode(errorBody);
          // baseline 없음, 만료, 변조 또는 환경 변화 → 저장값 폐기 후 재측정
          if (
            code === "E_ENVIRONMENT_DRIFT" ||
            code === "E_INVALID_BASELINE" ||
            code === "E_BASELINE_EXPIRED" ||
            code === "E_BASELINE_TAMPERED"
          ) {
            clearStoredBaseline();
            const refreshed = await refreshBaseline(id, framesRef.current);
            setAiStatus(refreshed ? "idle" : "error");
            return;
          }
          console.error("Posture batch request failed", response.status, errorBody);
          setAiStatus("error");
          return;
        }
        const result = await response.json().catch(() => null);
        const finalStatus: string = result?.data?.final_status ?? "";
        const backendState = toBackendState(finalStatus);
        const msg = POSTURE_MESSAGES[finalStatus] ?? "";
        const detectedLabels = findDetectedLabels(result);
        if (detectedLabels.length > 0) {
          console.log("자세 감지됨", detectedLabels);
        }
        // 상태가 바뀔 때마다 toast (나쁜 자세로 전환 시)
        if (msg && finalStatus !== lastStatusRef.current) {
          showPostureToast(msg);
          window.postMessage({ type: "ANJAVA_POSTURE_RELAY", state: finalStatus, message: msg }, "*");
        }
        recordStateChange(backendState, msg);
        lastStatusRef.current = finalStatus;
        setAiStatus("ok");
      } catch {
        setAiStatus("error");
      } finally {
        analyzingRef.current = false;
      }
    }

    analyzeFrame();
    const interval = window.setInterval(analyzeFrame, FRAME_CAPTURE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [ready, darkDetectionEnabled, flushQueuedEvents]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-zinc-900">
      {error ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-zinc-400">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
          </svg>
          <span>웹캠에 접근할 수 없습니다.</span>
          <span className="text-[10px] text-zinc-500">{error}</span>
        </div>
      ) : (
        <>
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored
            screenshotFormat="image/jpeg"
            screenshotQuality={0.75}
            videoConstraints={VIDEO_CONSTRAINTS}
            onUserMedia={() => setReady(true)}
            onUserMediaError={(e) =>
              setError(typeof e === "string" ? e : (e as Error).message)
            }
            className="h-full w-full object-cover"
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
              카메라 연결 중...
            </div>
          )}

          {/* LIVE 배지 */}
          {ready && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white">Live</span>
            </div>
          )}
          {ready && (
            <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
              AI {aiStatus === "ok" ? "ON" : aiStatus === "error" ? "ERR" : "..."}
            </div>
          )}
        </>
      )}
    </div>
  );
}
