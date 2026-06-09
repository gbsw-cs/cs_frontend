"use client";

import Webcam from "react-webcam";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPostureFrame, type PostureFrame } from "../lib/poseFrame";
import {
  endDetectionSession,
  getCurrentDetectionSession,
  postDashboardTimeline,
  postSessionEvents,
  startDetectionSession,
  type DetectionSessionEvent,
  type DetectionState,
} from "../lib/api";
import { showLocalPostureNotification } from "../lib/fcm";

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
  pushEnabled?: boolean;
  soundEnabled?: boolean;
  onDetectionStateChange?: (state: DetectionState, message: string) => void;
  onSessionActiveChange?: (active: boolean) => void;
  onDashboardDataChanged?: () => void;
  onAuthenticationExpired?: () => void;
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

function shouldPostTimeline(previous: DetectionState | null, next: DetectionState) {
  if (previous === next) return false;
  const wasWarning = previous !== null && previous !== "GOOD_POSTURE";
  const isWarning = next !== "GOOD_POSTURE";
  return isWarning || wasWarning;
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
  const status = "status" in error ? Number((error as Error & { status?: unknown }).status) : 0;
  return status === 409 || /이미 진행 중인 세션|already.*session|session.*already/i.test(error.message);
}

function getErrorStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
}

const POSTURE_MESSAGES: Record<string, string> = {
  turtle_neck:        "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
  TURTLE_NECK:        "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
  round_shoulder:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
  ROUND_SHOULDER:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
  shoulder_tilted:    "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
  shoulder_asymmetry: "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
  SHOULDER_ASYMMETRY: "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
  shoulder_issue:     "어깨 자세 이상이 감지되었어요! 어깨를 바르게 펴주세요.",
  SHOULDER_ISSUE:     "어깨 자세 이상이 감지되었어요! 어깨를 바르게 펴주세요.",
  dark_env:           "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요.",
  DARK_ENV:           "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요.",
};

const BACKEND_STATE_MESSAGES: Partial<Record<DetectionState, string>> = {
  TURTLE_NECK: "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
  ROUND_SHOULDER: "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
  SHOULDER_ASYMMETRY: "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
  SHOULDER_ISSUE: "어깨 자세 이상이 감지되었어요! 어깨를 바르게 펴주세요.",
  DARK_ENV: "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요.",
};

function relayPostureAlertToExtension(state: DetectionState, message: string, soundEnabled: boolean) {
  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const suppressSystemNotification =
      document.visibilityState === "visible" && document.hasFocus();
    const relayId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `posture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onAck);
      resolve(false);
    }, 400);
    function onAck(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== "ANJAVA_POSTURE_RELAY_ACK" || event.data.relayId !== relayId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onAck);
      resolve(true);
    }
    window.addEventListener("message", onAck);
    window.postMessage({
      type: "ANJAVA_POSTURE_RELAY",
      relayId,
      state,
      message,
      soundEnabled,
      suppressSystemNotification,
    }, "*");
  });
}

/*
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
*/

export default function WebcamView({
  darkDetectionEnabled = false,
  pushEnabled = true,
  soundEnabled = true,
  onDetectionStateChange,
  onSessionActiveChange,
  onDashboardDataChanged,
  onAuthenticationExpired,
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
  const onSessionActiveChangeRef = useRef(onSessionActiveChange);
  const onDashboardDataChangedRef = useRef(onDashboardDataChanged);
  const onAuthenticationExpiredRef = useRef(onAuthenticationExpired);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [aiStatus, setAiStatus] = useState<"idle" | "ok" | "error">("idle");

  const scheduleSessionRecoveryRef = useRef<((delayMs: number) => void) | null>(null);

  const flushQueuedEvents = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || eventQueueRef.current.length === 0) return;
    const events = eventQueueRef.current.splice(0, 100);
    try {
      await postSessionEvents(sessionId, events);
    } catch (e) {
      eventQueueRef.current = [...events, ...eventQueueRef.current].slice(0, 100);
      const status = e && typeof e === "object" && "status" in e
        ? Number((e as { status?: unknown }).status)
        : 0;
      if (status === 401) {
        onAuthenticationExpiredRef.current?.();
        return;
      }
      if (status === 404 || status === 409) {
        sessionIdRef.current = null;
        lastBackendStateRef.current = null;
        onSessionActiveChangeRef.current?.(false);
        scheduleSessionRecoveryRef.current?.(5_000);
      }
      console.error("Detection events upload failed", e);
    }
  }, []);

  useEffect(() => {
    onDetectionStateChangeRef.current = onDetectionStateChange;
    onSessionActiveChangeRef.current = onSessionActiveChange;
    onDashboardDataChangedRef.current = onDashboardDataChanged;
    onAuthenticationExpiredRef.current = onAuthenticationExpired;
  }, [onDetectionStateChange, onSessionActiveChange, onDashboardDataChanged, onAuthenticationExpired]);

  useEffect(() => {
    const allowBackgroundAlert = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        lastStatusRef.current = "";
      }
    };
    document.addEventListener("visibilitychange", allowBackgroundAlert);
    window.addEventListener("blur", allowBackgroundAlert);
    return () => {
      document.removeEventListener("visibilitychange", allowBackgroundAlert);
      window.removeEventListener("blur", allowBackgroundAlert);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let sessionRetryTimer: number | null = null;

    const assignSession = (session: { sessionId: string } | null) => {
      if (cancelled || !session?.sessionId) return false;
      sessionIdRef.current = session.sessionId;
      stateStartRef.current = Date.now();
      onSessionActiveChangeRef.current?.(true);
      return true;
    };

    const resolveSession = async () => {
      try {
        const current = await getCurrentDetectionSession();
        if (assignSession(current)) return;
      } catch (error) {
        if (getErrorStatus(error) !== 404) throw error;
      }

      try {
        assignSession(await startDetectionSession());
      } catch (error) {
        if (!isDuplicateSessionError(error)) throw error;
        assignSession(await getCurrentDetectionSession());
      }
    };

    const startSessionResolution = () => void resolveSession().catch((error) => {
        if (!cancelled) {
          onSessionActiveChangeRef.current?.(false);
          const status = getErrorStatus(error);
          if (status === 401) {
            onAuthenticationExpiredRef.current?.();
          } else if (status === 429 || status >= 500) {
            sessionRetryTimer = window.setTimeout(
              startSessionResolution,
              status === 429 ? 65_000 : 25_000,
            );
          } else {
            console.error("Detection session resolution failed", error);
          }
        }
      });
    startSessionResolution();

    const scheduleSessionRecovery = (delayMs: number) => {
      if (cancelled) return;
      if (sessionRetryTimer !== null) window.clearTimeout(sessionRetryTimer);
      sessionRetryTimer = window.setTimeout(() => {
        if (!cancelled && !sessionIdRef.current) {
          startSessionResolution();
        }
      }, delayMs);
    };
    scheduleSessionRecoveryRef.current = scheduleSessionRecovery;

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
      scheduleSessionRecoveryRef.current = null;
      if (sessionRetryTimer !== null) window.clearTimeout(sessionRetryTimer);
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
      onSessionActiveChangeRef.current?.(false);
      if (sessionId) {
        const eventsPromise = events.length > 0
          ? postSessionEvents(sessionId, events).catch((e) => {
              console.error("Detection events final upload failed", e);
            })
          : Promise.resolve();
        void eventsPromise.finally(() => {
          void endDetectionSession(sessionId).then(() => {
            onDashboardDataChangedRef.current?.();
          }).catch((e) => {
            console.error("Detection session end failed", e);
          });
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
        if (shouldPostTimeline(previous, nextState)) {
          const { date, time } = getKSTDateTime();
          void postDashboardTimeline({
            date,
            time,
            dominantState: nextState,
            message,
          }).catch((e) => {
            if (getErrorStatus(e) === 401) {
              onAuthenticationExpiredRef.current?.();
            } else {
              console.error("Dashboard timeline upload failed", e);
            }
          });
        }
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
        const msg = POSTURE_MESSAGES[finalStatus] ?? BACKEND_STATE_MESSAGES[backendState] ?? "";
        // 웹이 활성 상태면 페이지 toast를 우선하고, 백그라운드에서는 웹이 직접
        // 시스템 알림을 표시해 확장 프로그램의 실행 상태에 의존하지 않는다.
        if (pushEnabled && msg && finalStatus !== lastStatusRef.current) {
          const webIsForeground =
            document.visibilityState === "visible" && document.hasFocus();
          const notification = webIsForeground
            ? relayPostureAlertToExtension(backendState, msg, soundEnabled).then((handledByExtension) => {
                if (handledByExtension) return;
                return showLocalPostureNotification({
                  state: backendState,
                  message: msg,
                  soundEnabled,
                });
              })
            : showLocalPostureNotification({
              state: backendState,
              message: msg,
              soundEnabled,
            });
          void notification.catch((notificationError) => {
            console.error("Posture notification failed", notificationError);
          });
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
  }, [ready, darkDetectionEnabled, pushEnabled, soundEnabled, flushQueuedEvents]);

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
