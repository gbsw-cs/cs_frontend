"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { markOnboardingComplete } from "../lib/api";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Monitor,
  MousePointerClick,
  Settings,
  ShieldCheck,
  Sliders,
} from "lucide-react";

const TOTAL = 4;
const STORE_URL =
  process.env.NEXT_PUBLIC_EXTENSION_STORE_URL ??
  "https://chromewebstore.google.com/detail/anjava-extend/ieiojonlbjdkdlpjlcfealifodahjfal";

export default function ExtensionGuidePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  function onNext() {
    if (step < TOTAL) {
      setStep((s) => s + 1);
    } else {
      markOnboardingComplete();
      router.push("/dashboard");
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
          <h1 className="text-base font-bold text-zinc-900">확장 프로그램 가이드</h1>
        </div>

        <div className="rounded-3xl bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100">
          <div className="flex min-h-[520px] items-center justify-center px-8 py-12 sm:px-16 sm:py-16">
            <div className="flex h-full w-full items-center justify-center">
              {step === 1 && <Slide1 storeUrl={STORE_URL} />}
              {step === 2 && <Slide2 storeUrl={STORE_URL} />}
              {step === 3 && <Slide3 />}
              {step === 4 && <Slide4 />}
            </div>
          </div>

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
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 ${
                step === TOTAL ? "bg-emerald-500" : "bg-[#2563EB]"
              }`}
            >
              {step === TOTAL ? (
                <>
                  <Check size={14} strokeWidth={2.6} />
                  완료
                </>
              ) : (
                <>
                  다음
                  <ChevronRight size={14} strokeWidth={2.4} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slide1({ storeUrl }: { storeUrl: string }) {
  return (
    <div className="grid w-full max-w-[820px] grid-cols-1 items-center gap-9 md:grid-cols-[1fr_280px] md:gap-12">
      <div className="text-center md:text-left">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2563EB] shadow-lg shadow-[#2563EB]/30 md:mx-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chrome.png" alt="Chrome" className="h-9 w-9" />
        </div>
        <h2 className="mt-5 text-2xl font-bold text-zinc-900 sm:text-3xl">Anjava 확장 프로그램</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500 sm:text-[15px]">
          Chrome에 설치하면 코딩 중 스크린타임, 자세 감지, 백그라운드 알림을 함께 사용할 수 있습니다.
        </p>
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex w-full max-w-[320px] items-center justify-center gap-2 rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 md:w-fit md:px-5"
        >
          <Download size={15} />
          Chrome 웹 스토어에서 설치
        </a>
        <div className="mt-4 grid w-full max-w-[320px] grid-cols-2 gap-3">
          <MiniChip icon={<Clock size={16} />} label="스크린타임 감지" />
          <MiniChip icon={<Sliders size={16} />} label="맞춤 설정" />
        </div>
      </div>

      <GuideVisual title="백그라운드 자세 알림" />
    </div>
  );
}

function Slide2({ storeUrl }: { storeUrl: string }) {
  return (
    <div className="grid w-full max-w-[820px] grid-cols-1 items-center gap-10 md:grid-cols-[1fr_280px] md:gap-12">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">1. Chrome 웹 스토어 방문</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          설치 버튼을 누르면 Anjava extend 상세 페이지로 바로 이동합니다.
        </p>
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex w-fit items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <Download size={15} />
          확장 프로그램 설치하기
        </a>
        <div className="mt-4 rounded-xl bg-[#2563EB]/5 p-4 ring-1 ring-[#2563EB]/15">
          <div className="text-xs font-semibold text-[#2563EB]">빠른 설치 팁</div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            웹 스토어 페이지에서 Chrome에 추가 버튼을 누르면 설치가 시작됩니다.
          </p>
        </div>
      </div>

      <StoreVisual />
    </div>
  );
}

function Slide3() {
  return (
    <div className="grid w-full max-w-[820px] grid-cols-1 items-center gap-10 md:grid-cols-[280px_1fr] md:gap-12">
      <PermissionVisual />
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">2. Chrome에 추가</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          설치 후 알림 권한을 허용하면 VSCode를 보고 있어도 시스템 알림을 받을 수 있습니다.
        </p>
        <div className="mt-5 space-y-2.5">
          <InfoRow icon={<ShieldCheck size={16} />} title="권한 승인" desc="알림과 백그라운드 감지 권한이 필요합니다" />
          <InfoRow icon={<Settings size={16} />} title="설정 동기화" desc="푸시 알림 수신 여부가 웹 설정과 연동됩니다" />
        </div>
      </div>
    </div>
  );
}

function Slide4() {
  return (
    <div className="grid w-full max-w-[840px] grid-cols-1 items-center gap-10 md:grid-cols-[1fr_300px] md:gap-12">
      <div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563EB]/10 text-[#2563EB]">
          <Bell size={22} />
        </div>
        <h2 className="mt-5 text-2xl font-bold text-zinc-900 sm:text-3xl">3. 알림이 안 보일 때 확인하기</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Discord나 전체화면 앱을 켜둔 상태에서는 Windows 알림 설정 때문에 배너가 숨겨질 수 있습니다.
        </p>
        <div className="mt-5 grid gap-2.5">
          <SetupRow label="Windows 알림" desc="설정 → 시스템 → 알림에서 Chrome 알림을 허용하세요." />
          <SetupRow label="방해 금지" desc="집중 지원 또는 방해 금지를 꺼주세요." />
          <SetupRow label="Chrome 사이트 권한" desc="주소창 왼쪽 아이콘 → 사이트 설정 → 알림을 허용하세요." />
          <SetupRow label="알림 배너" desc="Windows 알림의 Chrome 항목에서 알림 배너 표시를 켜세요." />
          <SetupRow label="Discord 전체화면" desc="전체화면 모드에서는 알림 배너가 숨겨질 수 있어요." />
        </div>
      </div>

      <NotificationSettingsVisual />
    </div>
  );
}

function GuideVisual({ title }: { title: string }) {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563EB]/10 text-[#2563EB]">
            <Bell size={20} />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-900">{title}</div>
            <div className="mt-0.5 text-[11px] text-zinc-400">Anjava extend</div>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">
          거북목 자세가 감지되었어요.
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["Chrome", "VSCode", "알림"].map((label) => (
          <div key={label} className="rounded-lg bg-white px-2 py-2 text-center text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-100">
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoreVisual() {
  return (
    <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chrome.png" alt="" className="h-5 w-5" />
        <div className="text-[11px] font-semibold text-zinc-500">Chrome 웹 스토어</div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Anjava" className="h-12 w-12 rounded-xl object-contain ring-1 ring-zinc-100" />
          <div>
            <div className="text-sm font-bold text-zinc-900">Anjava extend</div>
            <div className="mt-1 text-[11px] text-zinc-400">자세 감지 확장 프로그램</div>
          </div>
        </div>
        <div className="mt-5 rounded-lg bg-[#2563EB] px-4 py-2.5 text-center text-xs font-semibold text-white">
          Chrome에 추가
        </div>
      </div>
    </div>
  );
}

function PermissionVisual() {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MousePointerClick size={18} />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-900">권한 확인</div>
            <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
              설치 후 알림 권한을 허용하면 백그라운드 경고가 표시됩니다.
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <VisualCheck label="알림 표시" />
          <VisualCheck label="백그라운드 실행" />
        </div>
      </div>
    </div>
  );
}

function NotificationSettingsVisual() {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563EB]/10 text-[#2563EB]">
            <Monitor size={19} />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-900">Windows 알림</div>
            <div className="mt-0.5 text-[11px] text-zinc-400">Chrome 배너 허용</div>
          </div>
        </div>
        <div className="mt-4 space-y-2.5">
          <VisualToggle label="Chrome 알림" on />
          <VisualToggle label="방해 금지" />
          <VisualToggle label="알림 배너" on />
        </div>
        <div className="mt-4 rounded-xl bg-[#2563EB]/5 px-3 py-2 text-[11px] leading-relaxed text-[#2563EB] ring-1 ring-[#2563EB]/15">
          Discord를 보고 있어도 Windows 알림 배너가 화면 구석에 표시됩니다.
        </div>
      </div>
    </div>
  );
}

function VisualCheck({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2">
      <CheckCircle2 size={14} className="text-emerald-500" />
      <span className="text-[11px] font-semibold text-zinc-600">{label}</span>
    </div>
  );
}

function VisualToggle({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
      <span className="text-[11px] font-semibold text-zinc-600">{label}</span>
      <span className={`relative h-5 w-9 rounded-full ${on ? "bg-[#2563EB]" : "bg-zinc-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </div>
  );
}

function SetupRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-100">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563EB]/10">
        <Check size={12} className="text-[#2563EB]" strokeWidth={2.6} />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-zinc-800">{label}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">{desc}</div>
      </div>
    </div>
  );
}

function MiniChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl bg-white px-3 py-3 ring-1 ring-zinc-100">
      <div className="text-[#2563EB]">{icon}</div>
      <div className="text-[11px] font-semibold text-zinc-600">{label}</div>
    </div>
  );
}

function InfoRow({
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
      <div className="text-[#2563EB]">{icon}</div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-zinc-800">{title}</div>
        <div className="text-[11px] text-zinc-400">{desc}</div>
      </div>
    </div>
  );
}
