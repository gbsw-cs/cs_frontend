"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ChevronLeft, Play, RotateCcw, Square } from "lucide-react";
import { createPostureFrame, isUsablePostureFrame, type PostureFrame } from "../lib/poseFrame";

const BASELINE_SECONDS = 10;
const BASELINE_FRAME_INTERVAL_MS = 250;
const BASELINE_MIN_FRAMES = 20;

type Phase = "idle" | "preview" | "measuring" | "done" | "error";

export default function BaselineCalibrationPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [validFrames, setValidFrames] = useState(0);

  const stopCamera = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSecondsLeft(0);
    setProgress(0);
    setValidFrames(0);
    setPhase((current) => (current === "done" ? current : "idle"));
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("이 브라우저는 웹캠을 지원하지 않습니다.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("preview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "웹캠 접근 실패";
      if (/Permission|NotAllowed/i.test(msg)) {
        setError("웹캠 접근 권한이 거부되었습니다. 브라우저 주소창 왼쪽의 자물쇠 아이콘에서 카메라 권한을 허용해 주세요.");
      } else if (/NotFound|DevicesNotFound/i.test(msg)) {
        setError("연결된 웹캠을 찾을 수 없습니다.");
      } else {
        setError(msg);
      }
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }, []);

  const measureBaseline = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError(null);
    setPhase("measuring");
    setSecondsLeft(BASELINE_SECONDS);
    setProgress(0);
    setValidFrames(0);

    const countdown = window.setInterval(() => {
      setSecondsLeft((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    try {
      const video = videoRef.current;
      if (!video) throw new Error("카메라 영상이 준비되지 않았습니다.");

      await createPostureFrame(video);
      const frames: PostureFrame[] = [];
      const startedAt = Date.now();

      while (Date.now() - startedAt < BASELINE_SECONDS * 1000) {
        if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
        const frame = await createPostureFrame(video);
        if (frame && isUsablePostureFrame(frame)) {
          frames.push(frame);
          setValidFrames(frames.length);
        }
        setProgress(Math.min(100, Math.round(((Date.now() - startedAt) / (BASELINE_SECONDS * 1000)) * 100)));
        await new Promise((resolve) => window.setTimeout(resolve, BASELINE_FRAME_INTERVAL_MS));
      }

      if (frames.length < BASELINE_MIN_FRAMES) {
        throw new Error(`유효 프레임이 ${frames.length}개입니다. 얼굴과 양쪽 어깨가 보이게 앉아 다시 측정해주세요.`);
      }

      const storedUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
      const id =
        storedUserId ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`);

      const response = await fetch("/v1/baseline/cal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, frames }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? "베이스라인 계산에 실패했습니다.");
      }

      const baselineResponse = await response.json().catch(() => null);
      const baseline = baselineResponse?.data?.baseline ?? baselineResponse?.baseline ?? baselineResponse;
      if (baseline && typeof window !== "undefined") {
        localStorage.setItem("aiBaseline", JSON.stringify(baseline));
        localStorage.setItem("aiBaselineReady", "1");
        localStorage.setItem("aiSessionId", id);
      }
      setProgress(100);
      setSecondsLeft(0);
      setPhase("done");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "베이스라인 측정에 실패했습니다.");
        setPhase("error");
      }
    } finally {
      window.clearInterval(countdown);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, []);

  const canMeasure = phase === "preview" || phase === "done" || phase === "error";
  const measuring = phase === "measuring";
  const isCameraActive = phase === "preview" || phase === "measuring" || phase === "done";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10 sm:px-8">
      <div className="w-full max-w-[920px]">
        <div className="mb-5 flex items-center gap-3">
          <Link
            href="/settings"
            aria-label="설정으로 돌아가기"
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100 transition hover:bg-[#2563EB] hover:ring-[#2563EB]"
          >
            <ChevronLeft size={18} strokeWidth={2.2} className="text-zinc-600 transition group-hover:text-white" />
          </Link>
          <h1 className="text-base font-bold text-zinc-900">베이스라인 다시 측정</h1>
        </div>

        <div className="rounded-3xl bg-white px-8 py-10 shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 sm:px-12">
          <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
                <Camera size={22} />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-zinc-900">현재 자세를 기준으로 저장합니다</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                허리를 세우고 얼굴과 양쪽 어깨가 보이도록 앉은 뒤 10초 동안 유지하세요.
                완료 후 대시보드 감지는 새 기준 자세를 사용합니다.
              </p>
              <div className="mt-5 rounded-xl bg-zinc-50 px-4 py-3 text-[12px] leading-relaxed text-zinc-500 ring-1 ring-zinc-100">
                측정 중에는 몸을 크게 움직이지 말고, 화면이 너무 어둡지 않은지 확인하세요.
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-900 text-xs text-zinc-400 ring-1 ring-zinc-100">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover transition-opacity ${isCameraActive ? "opacity-100" : "opacity-0"}`}
                />
                {!isCameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-100 text-zinc-400">
                    <Camera size={26} className="text-zinc-300" />
                    <span>웹캠 미리보기 영역</span>
                  </div>
                )}
                {phase === "measuring" && (
                  <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white">
                    {secondsLeft}초
                  </div>
                )}
                {phase === "done" && (
                  <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-semibold text-white">
                    <CheckCircle2 size={12} />
                    완료
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-200">
                <div className="h-2 rounded-full bg-[#2563EB] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>유효 프레임 {validFrames}개</span>
                <span>{progress}%</span>
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-600 ring-1 ring-rose-100">
                  {error}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={isCameraActive ? stopCamera : startCamera}
                  disabled={busy || phase === "measuring"}
                  className="flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-3 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-200 disabled:opacity-50"
                >
                  {isCameraActive ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  {isCameraActive ? "카메라 끄기" : busy ? "여는 중..." : "카메라 켜기"}
                </button>
                <button
                  type="button"
                  onClick={measureBaseline}
                  disabled={!canMeasure || measuring}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-3 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  {phase === "measuring" ? "측정 중..." : phase === "done" ? "다시 측정" : "측정 시작"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
