"use client";

import Webcam from "react-webcam";
import { useRef, useState } from "react";

const VIDEO_CONSTRAINTS = {
  width: 640,
  height: 480,
  facingMode: "user",
};

export default function WebcamView() {
  const webcamRef = useRef<Webcam>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
        </>
      )}
    </div>
  );
}
