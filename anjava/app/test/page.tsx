'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PoseLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

const AI_BASE = 'http://127.0.0.1:8000';
const V1 = `${AI_BASE}/v1`;

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const IDX = { nose: 0, leftEar: 7, rightEar: 8, leftShoulder: 11, rightShoulder: 12 };

const BASELINE_STORAGE_KEY = 'sitdown_baseline_v2';

type Vec3 = { x: number; y: number; z: number };
type Frame = {
  timestamp: string;
  visibility: number;
  nose: Vec3;
  left_ear: Vec3;
  right_ear: Vec3;
  left_shoulder: Vec3;
  right_shoulder: Vec3;
  brightness: number;
};
type Baseline = {
  neck_forward: number;
  shoulder_diff: number;
  brightness: number;
  shoulder_width: number;
  shoulder_z: number;
  issued_at: string;
  expires_at: string;
  signature: string;
  sample_count?: number;
};
type Quality = {
  passed: boolean;
  score: number;
  warnings: string[];
  passed_gates: string[];
  failed_gates: string[];
};
type ApiEnvelope<T> = {
  success: boolean;
  version: string;
  data: T | null;
  error: { code: string; message: string; hint: string | null } | null;
};
type BatchRecord = {
  sent_at: string;
  frames: Frame[];
  response: unknown;
};

const pick = (l: NormalizedLandmark): Vec3 => ({ x: l.x, y: l.y, z: l.z });

const loadSavedBaseline = (): Baseline | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Baseline;
    if (Date.now() >= new Date(parsed.expires_at).getTime()) {
      localStorage.removeItem(BASELINE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const saveBaselineToStorage = (baseline: Baseline) => {
  localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(baseline));
};

const clearSavedBaseline = () => {
  localStorage.removeItem(BASELINE_STORAGE_KEY);
};

const formatAgo = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  return `${hr}시간 ${min % 60}분 전`;
};

const formatRemaining = (iso: string): string => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '만료됨';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}분 남음`;
  const hr = Math.floor(min / 60);
  return `${hr}시간 ${min % 60}분 남음`;
};

export default function TestPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const brightnessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const frameBufRef = useRef<Frame[]>([]);
  const rafRef = useRef<number | null>(null);
  const monitorTimerRef = useRef<number | null>(null);
  const batchLogRef = useRef<BatchRecord[]>([]);
  const sessionStartRef = useRef<string>(new Date().toISOString());

  const [phase, setPhase] = useState<string>('로딩 중…');
  const [ready, setReady] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibProgress, setCalibProgress] = useState(0);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [status, setStatus] = useState<string>('—');
  const [confidence, setConfidence] = useState<number>(0);
  const [log, setLog] = useState<string>('');
  const [recordedCount, setRecordedCount] = useState(0);

  const appendLog = useCallback((s: string) => {
    setLog((prev) => (prev + '\n' + s).slice(-4000));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const saved = loadSavedBaseline();
    if (saved) {
      setBaseline(saved);
      appendLog(`✓ 저장된 baseline 복원 (${formatAgo(saved.issued_at)} · ${formatRemaining(saved.expires_at)})`);
    }

    const setup = async () => {
      try {
        setPhase('MediaPipe 초기화 중…');
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const lm = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (cancelled) return;
        landmarkerRef.current = lm;

        setPhase('웹캠 권한 요청 중…');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        setPhase('준비 완료');
        setReady(true);
        appendLog('✓ MediaPipe + 웹캠 준비 완료');
        startLandmarkLoop();
      } catch (e) {
        setPhase(`초기화 실패: ${String(e)}`);
        appendLog(`ERROR: ${String(e)}`);
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (monitorTimerRef.current) clearInterval(monitorTimerRef.current);
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  const measureBrightness = (): number => {
    const video = videoRef.current;
    const canvas = brightnessCanvasRef.current;
    if (!video || !canvas) return 128;
    const w = 80, h = 60;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 128;
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return sum / (w * h);
  };

  const startLandmarkLoop = () => {
    const video = videoRef.current!;
    const lm = landmarkerRef.current!;
    let lastTs = 0;

    const loop = () => {
      if (video.readyState >= 2) {
        const nowMs = performance.now();
        if (nowMs - lastTs >= 33) {
          lastTs = nowMs;
          const result = lm.detectForVideo(video, nowMs);
          if (result.landmarks && result.landmarks[0]) {
            const lms = result.landmarks[0];
            const pts = {
              nose: lms[IDX.nose],
              leftEar: lms[IDX.leftEar],
              rightEar: lms[IDX.rightEar],
              leftShoulder: lms[IDX.leftShoulder],
              rightShoulder: lms[IDX.rightShoulder],
            };
            const vis = Math.min(
              pts.nose.visibility ?? 1,
              pts.leftEar.visibility ?? 1,
              pts.rightEar.visibility ?? 1,
              pts.leftShoulder.visibility ?? 1,
              pts.rightShoulder.visibility ?? 1,
            );
            const frame: Frame = {
              timestamp: new Date().toISOString(),
              visibility: vis,
              nose: pick(pts.nose),
              left_ear: pick(pts.leftEar),
              right_ear: pick(pts.rightEar),
              left_shoulder: pick(pts.leftShoulder),
              right_shoulder: pick(pts.rightShoulder),
              brightness: measureBrightness(),
            };
            frameBufRef.current.push(frame);
            if (frameBufRef.current.length > 60) {
              frameBufRef.current.shift();
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const startCalibration = async () => {
    if (!ready || calibrating) return;
    setCalibrating(true);
    frameBufRef.current = [];
    appendLog('--- baseline 측정 시작 (10초 정자세 유지) ---');

    const collected: Frame[] = [];
    const startAt = performance.now();
    const DURATION_MS = 10000;

    const tick = () => {
      const elapsed = performance.now() - startAt;
      setCalibProgress(Math.min(1, elapsed / DURATION_MS));
      const buf = frameBufRef.current;
      if (buf.length > 0) {
        const last = buf[buf.length - 1];
        if (!collected.includes(last)) collected.push(last);
      }
      if (elapsed < DURATION_MS) {
        setTimeout(tick, 100);
      } else {
        finishCalibration(collected);
      }
    };
    tick();
  };

  const finishCalibration = async (frames: Frame[]) => {
    appendLog(`수집 프레임: ${frames.length}개`);
    try {
      const res = await fetch(`${V1}/baseline/cal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'webcam-test', frames }),
      });
      const body: ApiEnvelope<{ baseline: Baseline; quality: Quality }> = await res.json();
      if (!body.success || !body.data) {
        const err = body.error;
        appendLog(`baseline 실패: ${err?.code} — ${err?.message}${err?.hint ? ` (${err.hint})` : ''}`);
        return;
      }
      const { baseline: bl, quality: q } = body.data;
      setBaseline(bl);
      setQuality(q);
      saveBaselineToStorage(bl);
      appendLog(
        `✓ baseline 수신 + 저장 (sample=${bl.sample_count}, quality=${q.score}, expires=${formatRemaining(bl.expires_at)})`,
      );
    } catch (e) {
      appendLog(`baseline 네트워크 에러: ${String(e)}`);
    } finally {
      setCalibrating(false);
    }
  };

  const handleClearBaseline = () => {
    clearSavedBaseline();
    setBaseline(null);
    setQuality(null);
    appendLog('저장된 baseline 삭제됨');
  };

  const startMonitoring = () => {
    if (!baseline || monitoring) return;
    setMonitoring(true);
    batchLogRef.current = [];
    setRecordedCount(0);
    sessionStartRef.current = new Date().toISOString();
    appendLog('--- 실시간 감지 시작 (1Hz × 10프레임 batch) ---');
    monitorTimerRef.current = window.setInterval(() => sendBatch(), 1000);
  };

  const stopMonitoring = () => {
    if (monitorTimerRef.current) {
      clearInterval(monitorTimerRef.current);
      monitorTimerRef.current = null;
    }
    setMonitoring(false);
    appendLog(`--- 감지 중지 (기록된 batch: ${batchLogRef.current.length}개) ---`);
  };

  const sendBatch = async () => {
    if (!baseline) return;
    const buf = frameBufRef.current;
    if (buf.length < 3) return;

    const step = Math.max(1, Math.floor(buf.length / 10));
    const sampled: Frame[] = [];
    for (let i = 0; i < buf.length && sampled.length < 10; i += step) {
      sampled.push(buf[i]);
    }
    if (sampled.length < 3) return;

    try {
      const res = await fetch(`${V1}/posture/detect/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'webcam-test', baseline, frames: sampled }),
      });
      const body: ApiEnvelope<{ final_status: string; confidence: number }> = await res.json();
      if (!body.success || !body.data) {
        const code = body.error?.code;
        appendLog(`detect 실패: ${code} — ${body.error?.message}`);
        if (code === 'E_BASELINE_EXPIRED' || code === 'E_BASELINE_TAMPERED') {
          stopMonitoring();
          handleClearBaseline();
          appendLog('→ baseline 폐기. 재측정이 필요합니다.');
        }
        return;
      }
      setStatus(body.data.final_status ?? '—');
      setConfidence(body.data.confidence ?? 0);
      batchLogRef.current.push({
        sent_at: new Date().toISOString(),
        frames: sampled,
        response: body,
      });
      if (batchLogRef.current.length > 1800) batchLogRef.current.shift();
      setRecordedCount(batchLogRef.current.length);
    } catch (e) {
      appendLog(`detect 네트워크 에러: ${String(e)}`);
    }
  };

  const downloadLog = () => {
    const payload = {
      session_id: sessionStartRef.current,
      started_at: sessionStartRef.current,
      ended_at: new Date().toISOString(),
      baseline,
      quality,
      batches: batchLogRef.current,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sitdown_log_${sessionStartRef.current.replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendLog(`✓ 로그 파일 다운로드: ${batchLogRef.current.length}개 batch`);
  };

  const statusColor =
    status === 'good' ? 'text-green-400'
    : status === 'low_visibility' ? 'text-yellow-400'
    : status === '—' ? 'text-gray-400'
    : 'text-red-400';

  return (
    <main className="p-6 max-w-4xl mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-4">앉아봐 — 실시간 자세 감지 E2E 테스트 (v1)</h1>

      <div className="mb-4 p-3 bg-gray-100 rounded text-sm">
        <div>상태: <strong>{phase}</strong></div>
        <div className="text-xs text-gray-600">서버: {V1}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <video
            ref={videoRef}
            className="w-full rounded bg-black aspect-[4/3]"
            playsInline
            muted
          />
          <canvas ref={brightnessCanvasRef} className="hidden" />
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={startCalibration}
            disabled={!ready || calibrating || monitoring}
            className="px-4 py-3 bg-blue-600 text-white rounded disabled:bg-gray-400"
          >
            {calibrating
              ? `측정 중… ${Math.round(calibProgress * 100)}%`
              : baseline
              ? '재측정 (10초 정자세 유지)'
              : 'baseline 측정 시작 (10초 정자세)'}
          </button>

          {!monitoring ? (
            <button
              onClick={startMonitoring}
              disabled={!baseline || calibrating}
              className="px-4 py-3 bg-green-600 text-white rounded disabled:bg-gray-400"
            >
              ▶ 실시간 감지 시작
            </button>
          ) : (
            <button
              onClick={stopMonitoring}
              className="px-4 py-3 bg-red-600 text-white rounded"
            >
              ■ 감지 중지
            </button>
          )}

          <div className="flex gap-2">
            <button
              onClick={downloadLog}
              disabled={recordedCount === 0}
              className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded text-sm disabled:bg-gray-400"
            >
              📥 로그 저장 ({recordedCount})
            </button>
            {baseline && (
              <button
                onClick={handleClearBaseline}
                disabled={calibrating || monitoring}
                className="flex-1 px-3 py-2 bg-gray-500 text-white rounded text-sm disabled:bg-gray-400"
              >
                🗑 baseline 삭제
              </button>
            )}
          </div>

          <div className="p-4 bg-gray-900 rounded">
            <div className="text-xs text-gray-400 mb-1">현재 상태</div>
            <div className={`text-3xl font-bold ${statusColor}`}>{status}</div>
            <div className="text-xs text-gray-400 mt-2">
              confidence: {(confidence * 100).toFixed(0)}%
            </div>
            {baseline && (
              <div className="text-xs text-gray-500 mt-2 leading-5">
                baseline · {formatAgo(baseline.issued_at)} 발급 · {formatRemaining(baseline.expires_at)}
                <br />
                neck_forward={baseline.neck_forward.toFixed(3)} · sig={baseline.signature.slice(0, 8)}…
              </div>
            )}
            {quality && (
              <div className="text-xs text-gray-500 mt-1">
                quality {quality.score}/100 · gates: {quality.passed_gates.join(', ') || '—'}
                {quality.warnings.length > 0 && (
                  <span className="text-yellow-500"> · ⚠ {quality.warnings.join('; ')}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-bold mb-1">로그</h2>
        <pre className="bg-gray-900 text-green-300 p-3 rounded text-xs overflow-auto whitespace-pre-wrap max-h-60">
          {log || '(로그 없음)'}
        </pre>
      </div>

      <div className="mt-6 text-sm text-gray-700 leading-6">
        <strong>테스트 순서</strong>
        <ol className="list-decimal ml-5">
          <li>상단 상태가 &quot;준비 완료&quot;로 바뀔 때까지 대기</li>
          <li>정자세로 앉아서 &quot;baseline 측정 시작&quot; → 10초 유지 (quality 게이트 통과 확인)</li>
          <li>&quot;실시간 감지 시작&quot; → 고개 앞뒤로 움직여 상태 변화 확인</li>
          <li>새로고침(F5) 후 baseline 자동 복원 확인</li>
          <li>baseline의 signature/neck_forward를 DevTools로 변조 → E_BASELINE_TAMPERED 발생 확인</li>
        </ol>
      </div>
    </main>
  );
}
