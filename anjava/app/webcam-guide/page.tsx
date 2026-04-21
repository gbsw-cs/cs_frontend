"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Monitor,
  Play,
  Square,
  Video,
} from "lucide-react";

const TOTAL = 4;

export default function WebcamGuidePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  function onNext() {
    if (step < TOTAL) {
      setStep((s) => s + 1);
    } else {
      router.push("/extension-guide");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10 sm:px-8">
      <div className="w-full max-w-[960px]">
        <div className="mb-5 flex items-center gap-3">
          <Link
            href="/settings"
            aria-label="설정으로 돌아가기"
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100 transition hover:bg-[#2563EB] hover:ring-[#2563EB]"
          >
            <ChevronLeft size={18} strokeWidth={2.2} className="text-zinc-600 transition group-hover:text-white" />
          </Link>
          <h1 className="text-base font-bold text-zinc-900">웹캠 설정 가이드</h1>
        </div>
        <div className="rounded-3xl bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100">
          {/* Slide content */}
          <div className="flex h-[520px] items-center justify-center px-8 py-12 sm:px-16 sm:py-16">
            <div className="flex h-full w-full items-center justify-center">
              {step === 1 && <Slide1 />}
              {step === 2 && <Slide2 />}
              {step === 3 && <Slide3 />}
              {step === 4 && <Slide4 />}
            </div>
          </div>

          {/* Footer nav */}
          <div className="flex items-center justify-between border-t border-zinc-100 px-8 py-5 sm:px-12">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200 transition hover:bg-zinc-100 disabled:opacity-40"
            >
              <ChevronLeft size={14} strokeWidth={2.4} />
              이전
            </button>

            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: TOTAL }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i + 1)}
                    aria-label={`${i + 1}단계로 이동`}
                    className={`h-1.5 rounded-full transition-all ${
                      i + 1 === step ? "w-5 bg-[#2563EB]" : "w-1.5 bg-zinc-300 hover:bg-zinc-400"
                    }`}
                  />
                ))}
              </div>
              <div className="text-[11px] font-medium text-zinc-400">
                {step} / {TOTAL}
              </div>
            </div>

            <button
              onClick={onNext}
              className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              {step === TOTAL ? "확장 프로그램 설치하기" : "다음"}
              <ChevronRight size={14} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slide1() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2563EB]/10 text-[#2563EB]">
        <Video size={26} />
      </div>
      <h2 className="mt-5 text-2xl font-bold text-zinc-900 sm:text-3xl">
        웹캠 설정 가이드
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-zinc-500 sm:text-[15px]">
        정확한 자세 인식을 위한 웹캠 환경을 단계별로 구성합니다.
      </p>
      <div className="mt-8 grid w-full max-w-[520px] grid-cols-3 gap-3">
        <FeatureChip
          icon={<Video size={18} />}
          label="웹캠 테스트"
          desc="장치 인식 확인"
        />
        <FeatureChip
          icon={<Camera size={18} />}
          label="권한 허용"
          desc="브라우저 접근 설정"
        />
        <FeatureChip
          icon={<Monitor size={18} />}
          label="위치 조정"
          desc="최적 거리·각도"
        />
      </div>
    </div>
  );
}

function FeatureChip({
  icon,
  label,
  desc,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-zinc-50 px-3 py-4 ring-1 ring-zinc-100">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#2563EB] ring-1 ring-zinc-100">
        {icon}
      </div>
      <div className="text-xs font-semibold text-zinc-700">{label}</div>
      {desc && <div className="text-[10px] text-zinc-400">{desc}</div>}
    </div>
  );
}

function Slide2() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
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
      setActive(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "웹캠 접근 실패";
      if (/Permission|NotAllowed/i.test(msg)) {
        setError(
          "웹캠 접근 권한이 거부되었습니다. 브라우저 주소창 왼쪽의 자물쇠 아이콘에서 카메라 권한을 허용해 주세요.",
        );
      } else if (/NotFound|DevicesNotFound/i.test(msg)) {
        setError("연결된 웹캠을 찾을 수 없습니다.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
        <Camera size={22} />
      </div>
      <h2 className="mt-4 text-xl font-bold text-zinc-900 sm:text-2xl">웹캠을 테스트해보세요</h2>
      <p className="mt-2 text-xs text-zinc-500 sm:text-sm">
        아래 영역을 통해 웹캠이 정상적으로 작동하는지 확인합니다.
      </p>
      <div className="relative mt-6 flex aspect-video w-full max-w-[480px] items-center justify-center overflow-hidden rounded-xl bg-zinc-900 text-xs text-zinc-400 ring-1 ring-zinc-100">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover transition-opacity ${
            active ? "opacity-100" : "opacity-0"
          }`}
        />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-100 text-zinc-400">
            <Camera size={26} className="text-zinc-300" />
            <span>웹캠 미리보기 영역</span>
          </div>
        )}
        {active && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            LIVE
          </div>
        )}
      </div>
      {error && (
        <p className="mt-3 w-full max-w-[480px] rounded-lg bg-rose-50 px-3 py-2 text-left text-[11px] text-rose-600 ring-1 ring-rose-100">
          {error}
        </p>
      )}
      <button
        onClick={active ? stop : start}
        disabled={busy}
        className={`mt-5 flex w-full max-w-[480px] items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${
          active
            ? "bg-rose-500 text-white hover:opacity-90"
            : "bg-[#2563EB] text-white hover:opacity-90"
        }`}
      >
        {active ? (
          <>
            <Square size={14} fill="currentColor" />
            웹캠 테스트 중지
          </>
        ) : (
          <>
            <Play size={14} fill="currentColor" />
            {busy ? "카메라 여는 중..." : "웹캠 테스트 시작"}
          </>
        )}
      </button>
    </div>
  );
}

function Slide3() {
  return (
    <div className="flex flex-col items-center justify-center gap-40 md:flex-row">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">웹캠 권한 허용</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          브라우저에서 웹캠 접근 권한을 요청하면 &lsquo;허용&rsquo;을 클릭하세요.
          <br />
          권한을 허용해야 AI가 자세를 감지할 수 있습니다.
        </p>
        <div className="mt-6 rounded-xl bg-[#2563EB]/5 p-4 ring-1 ring-[#2563EB]/15">
          <div className="text-xs font-semibold text-[#2563EB]">💡 권한 설정 팁</div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            실수로 거부했다면 브라우저 주소창 왼쪽의 자물쇠 아이콘을 클릭하여 권한을 다시
            허용할 수 있습니다.
          </p>
        </div>
      </div>
      <div className="flex aspect-square w-full max-w-[260px] items-center justify-center rounded-xl bg-zinc-50 text-sm text-zinc-400 ring-1 ring-zinc-100">
        관련 도움되는 이미지
      </div>
    </div>
  );
}

function Slide4() {
  return (
    <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
      <div className="flex aspect-square w-full max-w-[260px] items-center justify-center rounded-xl bg-zinc-50 text-sm text-zinc-400 ring-1 ring-zinc-100">
        관련 도움되는 이미지
      </div>
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">최적의 위치 찾기</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          웹캠이 얼굴과 어깨가 모두 보이도록 모니터 상단에 배치하세요.
        </p>
        <div className="mt-5 space-y-2.5">
          <Tip
            icon={<Monitor size={16} />}
            title="모니터 상단 배치"
            desc="눈높이와 일치하도록 조정하세요"
          />
          <Tip
            icon={<Camera size={16} />}
            title="50–80cm 거리"
            desc="얼굴과 어깨가 모두 보이는 거리"
          />
          <Tip
            icon={<Lightbulb size={16} />}
            title="충분한 조명"
            desc="얼굴이 선명하게 보이도록 확보"
          />
        </div>
      </div>
    </div>
  );
}

function Tip({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-100">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2563EB]/10 text-[#2563EB]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-zinc-800">{title}</div>
        <div className="text-[11px] text-zinc-400">{desc}</div>
      </div>
    </div>
  );
}
