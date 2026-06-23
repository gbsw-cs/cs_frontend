"use client";

import Webcam from "react-webcam";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPostureFrame, type PostureFrame } from "../lib/poseFrame";
import {
  endDetectionSession,
  getCurrentDetectionSession,
  pauseDetectionSession,
  postDashboardTimeline,
  postSessionSegments,
  resumeDetectionSession,
  startDetectionSession,
  type DetectionSession,
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
const BATCH_SEND_INTERVAL_MS = 3000;
const BATCH_FRAME_COUNT = 3;
const BASELINE_RETRY_COOLDOWN_MS = 30_000;
const EVENT_FLUSH_INTERVAL_MS = 30_000;
const PENDING_EVENTS_STORAGE_KEY = "anjava.pendingDetectionEvents";

type WebcamViewProps = {
  darkDetectionEnabled?: boolean;
  pushEnabled?: boolean;
  soundEnabled?: boolean;
  onDetectionStateChange?: (state: DetectionState, message: string) => void;
  onSessionActiveChange?: (active: boolean, reason?: "paused" | "stopped") => void;
  onDashboardDataChanged?: () => void;
  onTimelinePosted?: () => void;
  onAuthenticationExpired?: () => void;
  sessionControlState?: SessionControlState;
  onSessionControlStateChange?: (state: SessionControlState, error?: string) => void;
};

export type SessionControlState = "checking" | "running" | "paused" | "stopped";

const AI_STATUS_TO_BACKEND_STATE: Record<string, DetectionState> = {
  good: "GOOD_POSTURE",
  good_posture: "GOOD_POSTURE",
  normal: "GOOD_POSTURE",
  turtle_neck: "TURTLE_NECK",
  slouch: "SLOUCHING",
  slouching: "SLOUCHING",
  round_shoulder: "ROUND_SHOULDER",
  shoulder_tilted: "SHOULDER_ASYMMETRY",
  shoulder_asymmetry: "SHOULDER_ASYMMETRY",
  shoulder_issue: "ROUND_SHOULDER",
  dark_env: "DARK_ENV",
  dark_environment: "DARK_ENV",
  unclassified: "UNCLASSIFIED",
};

function toBackendState(finalStatus: string): DetectionState {
  return AI_STATUS_TO_BACKEND_STATE[finalStatus.toLowerCase()] ?? "GOOD_POSTURE";
}

type PostureBatchResult = {
  data?: {
    final_status?: unknown;
    per_frame?: unknown;
  };
  dominant_state?: unknown;
  state?: unknown;
  result?: unknown;
};

type HealthScoreCounts = {
  turtle_neck: number;
  round_shoulder: number;
  shoulder_tilted: number;
  slouch: number;
  dark_environment: number;
};

const HEALTH_SCORE_ISSUE_KEYS = [
  "turtle_neck",
  "round_shoulder",
  "shoulder_tilted",
  "slouch",
  "dark_environment",
] as const;

const ISSUE_PRIORITY = [
  "turtle_neck",
  "slouch",
  "round_shoulder",
  "shoulder_tilted",
  "shoulder_asymmetry",
  "shoulder_issue",
  "dark_environment",
  "dark_env",
] as const;

function normalizeIssue(issue: unknown): string | null {
  if (typeof issue !== "string") return null;
  const value = issue.trim().toLowerCase();
  if (!value || value === "good" || value === "good_posture" || value === "normal" || value === "ok") return null;
  return value;
}

function extractPerFrameIssues(result: PostureBatchResult | null): string[] {
  const perFrame = result?.data?.per_frame;
  if (!Array.isArray(perFrame)) return [];
  return perFrame.flatMap((frame) => {
    const issues = (frame as { issues?: unknown } | null)?.issues;
    if (!Array.isArray(issues)) return [];
    return issues.map(normalizeIssue).filter((issue): issue is string => Boolean(issue));
  });
}

function issuesFromFinalStatus(status: unknown): string[] {
  if (typeof status !== "string") return [];
  return status
    .split("+")
    .map(normalizeIssue)
    .filter((issue): issue is string => Boolean(issue));
}

function countHealthScoreIssues(issues: string[]): HealthScoreCounts {
  const counts: HealthScoreCounts = {
    turtle_neck: 0,
    round_shoulder: 0,
    shoulder_tilted: 0,
    slouch: 0,
    dark_environment: 0,
  };
  issues.forEach((issue) => {
    const key = issue === "dark_env" ? "dark_environment" : issue === "shoulder_asymmetry" ? "shoulder_tilted" : issue;
    if ((HEALTH_SCORE_ISSUE_KEYS as readonly string[]).includes(key)) {
      counts[key as keyof HealthScoreCounts] += 1;
    }
  });
  return counts;
}

function choosePrimaryIssue(issues: string[]): string {
  if (issues.length === 0) return "good_posture";
  const counts = new Map<string, number>();
  issues.forEach((issue) => counts.set(issue, (counts.get(issue) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const aPriority = ISSUE_PRIORITY.indexOf(a[0] as (typeof ISSUE_PRIORITY)[number]);
    const bPriority = ISSUE_PRIORITY.indexOf(b[0] as (typeof ISSUE_PRIORITY)[number]);
    return (aPriority === -1 ? ISSUE_PRIORITY.length : aPriority) -
      (bPriority === -1 ? ISSUE_PRIORITY.length : bPriority);
  })[0]?.[0] ?? "good_posture";
}

function getBatchDetectionSummary(result: PostureBatchResult | null) {
  const perFrameIssues = extractPerFrameIssues(result);
  const fallbackStatus =
    result?.data?.final_status ?? result?.dominant_state ?? result?.state ?? result?.result ?? "";
  const issues = perFrameIssues.length > 0 ? perFrameIssues : issuesFromFinalStatus(fallbackStatus);
  const primaryIssue = choosePrimaryIssue(issues);
  return {
    issues,
    counts: countHealthScoreIssues(issues),
    status: primaryIssue,
    usedPerFrameIssues: perFrameIssues.length > 0,
  };
}

function createDetectionEvent(
  state: DetectionState,
  startedAtMs: number,
  endedAtMs: number,
): DetectionSessionEvent {
  return {
    eventId:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `web-${endedAtMs}-${Math.random().toString(36).slice(2)}`,
    state,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    source: "WEB",
  };
}

function persistPendingEvents(sessionId: string | null, events: DetectionSessionEvent[]) {
  if (typeof window === "undefined") return;
  if (!sessionId || events.length === 0) {
    localStorage.removeItem(PENDING_EVENTS_STORAGE_KEY);
    return;
  }
  localStorage.setItem(PENDING_EVENTS_STORAGE_KEY, JSON.stringify({ sessionId, events }));
}

function restorePendingEvents(sessionId: string): DetectionSessionEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_EVENTS_STORAGE_KEY) ?? "null") as {
      sessionId?: unknown;
      events?: unknown;
    } | null;
    if (stored?.sessionId !== sessionId || !Array.isArray(stored.events)) {
      localStorage.removeItem(PENDING_EVENTS_STORAGE_KEY);
      return [];
    }
    return stored.events.filter((event): event is DetectionSessionEvent =>
      Boolean(
        event &&
        typeof event === "object" &&
        "eventId" in event &&
        "startedAt" in event &&
        "endedAt" in event &&
        "state" in event &&
        (event as { source?: unknown }).source === "WEB",
      )
    );
  } catch {
    localStorage.removeItem(PENDING_EVENTS_STORAGE_KEY);
    return [];
  }
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
  slouch:             "구부정한 자세가 감지되었어요! 허리를 세워주세요.",
  SLOUCH:             "구부정한 자세가 감지되었어요! 허리를 세워주세요.",
  SLOUCHING:          "구부정한 자세가 감지되었어요! 허리를 세워주세요.",
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
  SLOUCH: "구부정한 자세가 감지되었어요! 허리를 세워주세요.",
  SLOUCHING: "구부정한 자세가 감지되었어요! 허리를 세워주세요.",
  ROUND_SHOULDER: "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
  SHOULDER_ASYMMETRY: "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
  DARK_ENV: "어두운 환경이 감지되었어요! 주변 밝기를 높여주세요.",
};

const TOAST_STYLE = `
  #anjava-web-toast {
    position: fixed; top: 20px; right: 20px;
    background: #fff; color: #18181b;
    border-radius: 16px; z-index: 2147483647;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
    width: 360px; max-width: calc(100vw - 32px); overflow: hidden;
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
  #anjava-web-toast .anjava-web-avatar {
    width: 52px; height: 52px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  #anjava-web-toast .anjava-web-avatar img {
    width: 100%; height: 100%; object-fit: contain; display: block;
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

let webToastTimer: number | null = null;

function playWebToastTone(soundEnabled: boolean) {
  if (!soundEnabled || typeof window === "undefined") return;
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const playNote = (frequency: number, start: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    };
    const now = ctx.currentTime;
    playNote(1046.5, now, 0.17);
    playNote(1318.5, now + 0.14, 0.24);
    window.setTimeout(() => ctx.close().catch(() => {}), 650);
  } catch {}
}

function dismissWebToast(el: HTMLElement) {
  el.classList.add("out");
  window.setTimeout(() => el.remove(), 240);
}

function showWebPostureToast(state: DetectionState, message: string, soundEnabled: boolean) {
  if (typeof document === "undefined") return;
  let style = document.getElementById("anjava-web-toast-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "anjava-web-toast-style";
    style.textContent = TOAST_STYLE;
    document.head.appendChild(style);
  }
  if (webToastTimer) {
    window.clearTimeout(webToastTimer);
    webToastTimer = null;
  }
  const previous = document.getElementById("anjava-web-toast");
  if (previous) previous.remove();

  const toast = document.createElement("div");
  toast.id = "anjava-web-toast";
  const header = document.createElement("div");
  header.className = "anjava-web-header";
  const avatar = document.createElement("div");
  avatar.className = "anjava-web-avatar";
  avatar.setAttribute("aria-hidden", "true");
  const avatarImage = document.createElement("img");
  avatarImage.src = "/avatar.png";
  avatarImage.alt = "";
  avatar.append(avatarImage);
  const icon = document.createElement("div");
  icon.className = "anjava-web-icon";
  icon.textContent = state === "GOOD_POSTURE" ? "✓" : "!";
  const title = document.createElement("div");
  title.className = "anjava-web-title";
  title.textContent = state === "GOOD_POSTURE" ? "자세 교정 완료" : "자세 교정 알림";
  const close = document.createElement("button");
  close.className = "anjava-web-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "닫기");
  close.onclick = () => dismissWebToast(toast);
  const body = document.createElement("div");
  body.className = "anjava-web-body";
  body.textContent = message;
  const progress = document.createElement("div");
  progress.className = "anjava-web-progress";

  header.append(icon, title, avatar, close);
  toast.append(header, body, progress);
  document.body.appendChild(toast);
  playWebToastTone(soundEnabled);
  webToastTimer = window.setTimeout(() => dismissWebToast(toast), 6000);
}

export default function WebcamView({
  darkDetectionEnabled = false,
  pushEnabled = true,
  soundEnabled = true,
  onDetectionStateChange,
  onSessionActiveChange,
  onDashboardDataChanged,
  onTimelinePosted,
  onAuthenticationExpired,
  sessionControlState = "running",
  onSessionControlStateChange,
}: WebcamViewProps) {
  const webcamRef = useRef<Webcam>(null);
  const analyzingRef = useRef(false);
  const framesRef = useRef<PostureFrame[]>([]);
  const lastStatusRef = useRef("");
  const lastBatchSentAtRef = useRef(0);
  const baselineRetryAtRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<string | null>(null);
  const sessionPausedTotalMsRef = useRef(0);
  const sessionPausedRef = useRef(false);
  const eventQueueRef = useRef<DetectionSessionEvent[]>([]);
  const stateStartRef = useRef<number>(Date.now());
  const lastBackendStateRef = useRef<DetectionState | null>(null);
  const onDetectionStateChangeRef = useRef(onDetectionStateChange);
  const onSessionActiveChangeRef = useRef(onSessionActiveChange);
  const onDashboardDataChangedRef = useRef(onDashboardDataChanged);
  const onTimelinePostedRef = useRef(onTimelinePosted);
  const onAuthenticationExpiredRef = useRef(onAuthenticationExpired);
  const onSessionControlStateChangeRef = useRef(onSessionControlStateChange);
  const sessionOperationRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [aiStatus, setAiStatus] = useState<"idle" | "ok" | "error">("idle");
  const [isExtensionSession, setIsExtensionSession] = useState(false);
  const extensionSessionRef = useRef(false);

  const flushQueuedEvents = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || eventQueueRef.current.length === 0) return true;
    const events = eventQueueRef.current.splice(0, 100);
    persistPendingEvents(sessionId, eventQueueRef.current);
    try {
      await postSessionSegments(sessionId, events, "WEB");
      persistPendingEvents(sessionId, eventQueueRef.current);
      onDashboardDataChangedRef.current?.();
      return true;
    } catch (e) {
      eventQueueRef.current = [...events, ...eventQueueRef.current];
      persistPendingEvents(sessionId, eventQueueRef.current);
      const status = e && typeof e === "object" && "status" in e
        ? Number((e as { status?: unknown }).status)
        : 0;
      if (status === 401) {
        onAuthenticationExpiredRef.current?.();
        return false;
      }
      if (status === 404 || status === 409) {
        sessionIdRef.current = null;
        sessionPausedRef.current = false;
        lastBackendStateRef.current = null;
        eventQueueRef.current = [];
        persistPendingEvents(null, []);
        setHasSession(false);
        onSessionActiveChangeRef.current?.(false, "stopped");
        onSessionControlStateChangeRef.current?.("stopped", "세션이 종료되어 감지를 중단했습니다.");
      }
      console.error("Detection events upload failed", e);
      return false;
    }
  }, []);

  useEffect(() => {
    onDetectionStateChangeRef.current = onDetectionStateChange;
    onSessionActiveChangeRef.current = onSessionActiveChange;
    onDashboardDataChangedRef.current = onDashboardDataChanged;
    onTimelinePostedRef.current = onTimelinePosted;
    onAuthenticationExpiredRef.current = onAuthenticationExpired;
    onSessionControlStateChangeRef.current = onSessionControlStateChange;
  }, [onDetectionStateChange, onSessionActiveChange, onDashboardDataChanged, onTimelinePosted, onAuthenticationExpired, onSessionControlStateChange]);

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

  const queueCurrentState = useCallback(() => {
    const currentState = lastBackendStateRef.current;
    if (!currentState) return;
    const now = Date.now();
    const durationSec = Math.round((now - stateStartRef.current) / 1000);
    if (durationSec > 0) {
      eventQueueRef.current.push(createDetectionEvent(currentState, stateStartRef.current, now));
      persistPendingEvents(sessionIdRef.current, eventQueueRef.current);
    }
    stateStartRef.current = now;
    lastBackendStateRef.current = null;
  }, []);

  useEffect(() => {
    const operation = ++sessionOperationRef.current;

    async function assignSession(session: DetectionSession | null) {
      if (operation !== sessionOperationRef.current || !session?.sessionId) return false;
      if (session.source && session.source !== "WEB") {
        extensionSessionRef.current = true;
        setIsExtensionSession(true);
        setHasSession(false);
        sessionIdRef.current = session.sessionId;
        sessionStartedAtRef.current = session.startedAt;
        sessionPausedTotalMsRef.current = (session.totalPausedSec ?? 0) * 1000;
        sessionPausedRef.current = session.status === "PAUSED";
        return true;
      }
      extensionSessionRef.current = false;
      setIsExtensionSession(false);
      sessionIdRef.current = session.sessionId;
      sessionStartedAtRef.current = session.startedAt;
      sessionPausedTotalMsRef.current = (session.totalPausedSec ?? 0) * 1000;
      sessionPausedRef.current = session.status === "PAUSED";
      const restoredEvents = restorePendingEvents(session.sessionId);
      if (restoredEvents.length > 0) {
        const queuedIds = new Set(eventQueueRef.current.map((event) => event.eventId));
        eventQueueRef.current = [
          ...restoredEvents.filter((event) => !queuedIds.has(event.eventId)),
          ...eventQueueRef.current,
        ];
        persistPendingEvents(session.sessionId, eventQueueRef.current);
      }
      setHasSession(true);
      stateStartRef.current = Date.now();
      onSessionActiveChangeRef.current?.(true);
      return true;
    }

    async function resolveExistingSession() {
      try {
        return await getCurrentDetectionSession();
      } catch (error) {
        if (getErrorStatus(error) === 404) return null;
        throw error;
      }
    }

    async function applySessionControl() {
      try {
        if (sessionControlState === "checking") {
          const current = await resolveExistingSession();
          if (await assignSession(current)) {
            const nextState = sessionPausedRef.current ? "paused" : "running";
            onSessionActiveChangeRef.current?.(!sessionPausedRef.current, sessionPausedRef.current ? "paused" : undefined);
            onSessionControlStateChangeRef.current?.(nextState);
            if (!extensionSessionRef.current) {
              window.postMessage({
                type: "ANJAVA_WEB_SESSION_STATE",
                state: nextState,
                sessionId: sessionIdRef.current,
                startedAt: sessionStartedAtRef.current,
                pausedTotalMs: sessionPausedTotalMsRef.current,
              }, "*");
            }
          } else if (operation === sessionOperationRef.current) {
            setHasSession(false);
            onSessionActiveChangeRef.current?.(false, "stopped");
            onSessionControlStateChangeRef.current?.("stopped");
          }
          return;
        }

        if (sessionControlState === "running") {
          if (!sessionIdRef.current) {
            const current = await resolveExistingSession();
            if (!(await assignSession(current))) {
              if (!ready) throw new Error("카메라가 연결된 후 세션을 시작해주세요.");
              try {
                await assignSession(await startDetectionSession(new Date().toISOString(), "WEB"));
              } catch (error) {
                if (!isDuplicateSessionError(error)) throw error;
                await assignSession(await getCurrentDetectionSession());
              }
            }
          }
          if (sessionIdRef.current && sessionPausedRef.current) {
            await resumeDetectionSession(sessionIdRef.current);
            sessionPausedRef.current = false;
          }
          if (operation === sessionOperationRef.current) {
            stateStartRef.current = Date.now();
            onSessionActiveChangeRef.current?.(true);
            onSessionControlStateChangeRef.current?.("running");
            window.postMessage({
              type: "ANJAVA_WEB_SESSION_STATE",
              state: "running",
              sessionId: sessionIdRef.current,
              startedAt: sessionStartedAtRef.current,
              pausedTotalMs: sessionPausedTotalMsRef.current,
            }, "*");
          }
          return;
        }

        if (sessionControlState === "paused") {
          if (!sessionIdRef.current) {
            onSessionActiveChangeRef.current?.(false, "stopped");
            onSessionControlStateChangeRef.current?.("stopped", "진행 중인 세션이 없습니다.");
            return;
          }
          if (!extensionSessionRef.current) {
            queueCurrentState();
            const flushed = await flushQueuedEvents();
            if (!flushed) console.warn("일시정지 전 일부 감지 기록 전송이 지연되었습니다.");
          }
          await pauseDetectionSession(sessionIdRef.current);
          sessionPausedRef.current = true;
          if (operation === sessionOperationRef.current) {
            onSessionActiveChangeRef.current?.(false, "paused");
            onSessionControlStateChangeRef.current?.("paused");
            if (!extensionSessionRef.current) {
              window.postMessage({
                type: "ANJAVA_WEB_SESSION_STATE",
                state: "paused",
                sessionId: sessionIdRef.current,
                startedAt: sessionStartedAtRef.current,
              }, "*");
            }
          }
          return;
        }

        const wasExtension = extensionSessionRef.current;
        if (!wasExtension) {
          queueCurrentState();
          const flushed = await flushQueuedEvents();
          if (!flushed && eventQueueRef.current.length > 0) {
            console.warn("종료 전 일부 감지 기록 전송이 지연되었습니다.");
          }
        }
        const sessionId = sessionIdRef.current;
        sessionIdRef.current = null;
        sessionPausedRef.current = false;
        extensionSessionRef.current = false;
        setHasSession(false);
        setIsExtensionSession(false);
        lastBackendStateRef.current = null;
        if (sessionId) await endDetectionSession(sessionId);
        if (!wasExtension && eventQueueRef.current.length === 0) persistPendingEvents(null, []);
        if (operation === sessionOperationRef.current) {
          onSessionActiveChangeRef.current?.(false, "stopped");
          onSessionControlStateChangeRef.current?.("stopped");
          onDashboardDataChangedRef.current?.();
          if (!wasExtension) window.postMessage({ type: "ANJAVA_WEB_SESSION_STATE", state: "stopped" }, "*");
        }
      } catch (error) {
        if (operation !== sessionOperationRef.current) return;
        const status = getErrorStatus(error);
        if (status === 401) onAuthenticationExpiredRef.current?.();
        const message = error instanceof Error ? error.message : "세션 상태를 변경하지 못했습니다.";
        onSessionControlStateChangeRef.current?.(sessionIdRef.current ? "paused" : "stopped", message);
      }
    }

    void applySessionControl();
  }, [ready, sessionControlState, flushQueuedEvents, queueCurrentState]);

  useEffect(() => {
    if (!ready) return;
    const flushInterval = window.setInterval(() => {
      if (sessionControlState !== "running" || !sessionIdRef.current) return;
      queueCurrentState();
      void flushQueuedEvents();
    }, EVENT_FLUSH_INTERVAL_MS);
    return () => window.clearInterval(flushInterval);
  }, [ready, sessionControlState, flushQueuedEvents, queueCurrentState]);

  useEffect(() => {
    const preservePendingInterval = () => {
      if (sessionControlState !== "running" || !sessionIdRef.current) return;
      queueCurrentState();
    };
    window.addEventListener("pagehide", preservePendingInterval);
    return () => window.removeEventListener("pagehide", preservePendingInterval);
  }, [queueCurrentState, sessionControlState]);

  useEffect(() => {
    if (!isExtensionSession) return;
    const poll = window.setInterval(async () => {
      try {
        const session = await getCurrentDetectionSession();
        if (!session || (session.source && session.source !== "EXTENSION")) {
          extensionSessionRef.current = false;
          setIsExtensionSession(false);
          sessionIdRef.current = null;
          sessionPausedRef.current = false;
          onSessionActiveChangeRef.current?.(false, "stopped");
          onSessionControlStateChangeRef.current?.("stopped");
        }
      } catch {
        extensionSessionRef.current = false;
        setIsExtensionSession(false);
        sessionIdRef.current = null;
        sessionPausedRef.current = false;
        onSessionActiveChangeRef.current?.(false, "stopped");
        onSessionControlStateChangeRef.current?.("stopped");
      }
    }, 5000);
    return () => window.clearInterval(poll);
  }, [isExtensionSession]);

  useEffect(() => {
    if (!ready || sessionControlState !== "running" || !hasSession) {
      setAiStatus("idle");
      return;
    }

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
        eventQueueRef.current.push(createDetectionEvent(previous, stateStartRef.current, now));
        persistPendingEvents(sessionIdRef.current, eventQueueRef.current);
        void flushQueuedEvents();
      }
      if (previous !== nextState) {
        stateStartRef.current = now;
        lastBackendStateRef.current = nextState;
        // 상태 변경 시 타임라인 기록 (경고 발생 또는 정자세 복귀)
        const isBadState = nextState !== "GOOD_POSTURE";
        const isRecovery = nextState === "GOOD_POSTURE" && Boolean(previous) && previous !== "GOOD_POSTURE";
        if (isBadState || isRecovery) {
          const d = new Date();
          const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
          const time = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
          postDashboardTimeline({ date, time, dominantState: nextState, message: message ?? "", eventId: crypto.randomUUID() })
            .then(() => { onTimelinePostedRef.current?.(); })
            .catch(() => {});
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
        const result = await response.json().catch(() => null) as PostureBatchResult | null;
        const detectionSummary = getBatchDetectionSummary(result);
        const backendState = toBackendState(detectionSummary.status);
        const msg = POSTURE_MESSAGES[detectionSummary.status] ?? BACKEND_STATE_MESSAGES[backendState] ?? "";
        // 웹이 활성 상태면 페이지 toast를 우선하고, 백그라운드에서는 웹이 직접
        // 시스템 알림을 표시해 확장 프로그램의 실행 상태에 의존하지 않는다.
        if (pushEnabled && msg && detectionSummary.status !== lastStatusRef.current) {
          const webIsForeground =
            document.visibilityState === "visible" && document.hasFocus();
          const notification = webIsForeground
            ? Promise.resolve(showWebPostureToast(backendState, msg, soundEnabled))
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
        lastStatusRef.current = detectionSummary.status;
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
  }, [ready, hasSession, sessionControlState, darkDetectionEnabled, pushEnabled, soundEnabled, flushQueuedEvents]);

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
            onUserMediaError={(e) => {
              const message = typeof e === "string" ? e : (e as Error).message;
              setError(message);
              if (!sessionIdRef.current) {
                onSessionControlStateChangeRef.current?.("stopped", `카메라를 사용할 수 없습니다: ${message}`);
              }
            }}
            className="h-full w-full object-cover"
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
              카메라 연결 중...
            </div>
          )}

          {/* LIVE 배지 */}
          {ready && sessionControlState === "running" && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                {isExtensionSession ? "Extension Live" : "Live"}
              </span>
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
