"use client";

import Webcam from "react-webcam";
import { useEffect, useRef, useState } from "react";
import { createPostureFrame, type PostureFrame } from "../lib/poseFrame";

const VIDEO_CONSTRAINTS = {
  width: 640,
  height: 480,
  facingMode: "user",
};
const DETECT_INTERVAL_MS = 1000;
const BATCH_FRAME_COUNT = 10;

type Baseline = {
  neck_forward: number;
  shoulder_diff: number;
  brightness: number;
  shoulder_width: number;
  shoulder_z: number;
  issued_at: string;
  expires_at: string;
  signature: string;
  env_fingerprint: {
    shoulder_width: number;
    nose_y: number;
    brightness: number;
  };
};

function readBaseline() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("aiBaseline");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const baseline = (parsed.data?.baseline ?? parsed.baseline ?? parsed) as Baseline;
    return baseline?.signature ? baseline : null;
  } catch {
    return null;
  }
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
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:12px 14px 10px;border-bottom:1px solid #f4f4f5;">
      <span style="font-size:18px;flex-shrink:0">⚠️</span>
      <span style="font-weight:700;font-size:13px;color:#2563eb;flex:1">자세 교정 알림</span>
      <button onclick="this.closest('#anjava-web-toast').remove()"
        style="background:none;border:none;color:#a1a1aa;cursor:pointer;font-size:16px;padding:0;line-height:1">✕</button>
    </div>
    <div style="padding:10px 14px 12px;font-size:12.5px;color:#3f3f46;line-height:1.55">${message}</div>
    <div style="height:3px;background:#2563eb;animation:anjava-web-progress 6s linear forwards;transform-origin:left"></div>
  `;
  document.body.appendChild(el);
  webToastTimer = setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 240);
  }, 6000);
}

export default function WebcamView() {
  const webcamRef = useRef<Webcam>(null);
  const analyzingRef = useRef(false);
  const framesRef = useRef<PostureFrame[]>([]);
  const lastStatusRef = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [aiStatus, setAiStatus] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => {
    if (!ready) return;

    async function refreshBaseline(id: string, frames: PostureFrame[]) {
      const response = await fetch("/v1/baseline/cal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, frames }),
      });
      if (!response.ok) return false;

      const baselineResponse = await response.json().catch(() => null);
      const baseline =
        baselineResponse?.data?.baseline ??
        baselineResponse?.baseline ??
        baselineResponse;
      if (!baseline?.signature) return false;

      localStorage.setItem("aiBaseline", JSON.stringify(baseline));
      localStorage.setItem("aiSessionId", id);
      return true;
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

        // userId를 세션 ID로 사용 (webcam-test와 동일한 ID)
        const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
        const id =
          userId ??
          localStorage.getItem("aiSessionId") ??
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}`);
        localStorage.setItem("aiSessionId", id);

        let baseline = readBaseline();
        // baseline 없으면 즉시 측정
        if (!baseline) {
          const refreshed = await refreshBaseline(id, framesRef.current);
          if (!refreshed) { setAiStatus("idle"); return; }
          baseline = readBaseline();
          if (!baseline) { setAiStatus("idle"); return; }
        }

        const response = await fetch("/v1/posture/detect/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            frame,
            baseline,
            z_threshold: 0.07,
            shoulder_threshold: 0.05,
            round_shoulder_ratio: 0.12,
            round_shoulder_z_threshold: 0.05,
            dark_mode: false,
            dark_abs_threshold: 60,
            dark_relative_ratio: 0.5,
            frames: framesRef.current,
          }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const code = errorBody?.error?.code;
          // baseline 없음 또는 환경 변화 → 재측정
          if (code === "E_ENVIRONMENT_DRIFT" || code === "E_INVALID_BASELINE") {
            localStorage.removeItem("aiBaseline");
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
        const detectedLabels = findDetectedLabels(result);
        if (detectedLabels.length > 0) {
          console.log("자세 감지됨", detectedLabels);
        }
        // 상태가 바뀔 때마다 toast (나쁜 자세로 전환 시)
        const msg = POSTURE_MESSAGES[finalStatus];
        if (msg && finalStatus !== lastStatusRef.current) {
          showPostureToast(msg);
        }
        lastStatusRef.current = finalStatus;
        setAiStatus("ok");
      } catch {
        setAiStatus("error");
      } finally {
        analyzingRef.current = false;
      }
    }

    analyzeFrame();
    const interval = window.setInterval(analyzeFrame, DETECT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [ready]);

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
