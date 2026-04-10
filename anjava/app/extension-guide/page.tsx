"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Settings,
  Sliders,
} from "lucide-react";

const TOTAL = 3;

export default function ExtensionGuidePage() {
  const [step, setStep] = useState(1);

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
          <div className="flex h-[520px] items-center justify-center px-8 py-12 sm:px-16 sm:py-16">
            <div className="flex h-full w-full items-center justify-center">
              {step === 1 && <Slide1 />}
              {step === 2 && <Slide2 />}
              {step === 3 && <Slide3 />}
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
                      i + 1 === step
                        ? "w-5 bg-[#2563EB]"
                        : "w-1.5 bg-zinc-300 hover:bg-zinc-400"
                    }`}
                  />
                ))}
              </div>
              <div className="text-[11px] font-medium text-zinc-400">
                {step} / {TOTAL}
              </div>
            </div>

            <button
              onClick={() => setStep((s) => Math.min(TOTAL, s + 1))}
              disabled={step === TOTAL}
              className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
            >
              다음
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
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2563EB] shadow-lg shadow-[#2563EB]/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chrome.png" alt="Chrome" className="h-9 w-9" />
      </div>
      <h2 className="mt-5 text-2xl font-bold text-zinc-900 sm:text-3xl">
        안자봐 확장 프로그램
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-zinc-500 sm:text-[15px]">
        브라우저에 설치하여 코딩 중 스크린타임을 모니터링하세요.
        <br />
        별도의 앱 설치 없이 브라우저만으로 사용 가능합니다.
      </p>
      <button className="mt-6 flex w-full max-w-[320px] items-center justify-center gap-2 rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90">
        <Download size={15} />
        Chrome 웹 스토어에서 설치
      </button>
      <div className="mt-4 grid w-full max-w-[320px] grid-cols-2 gap-3">
        <MiniChip icon={<Clock size={16} />} label="스크린타임 감지" />
        <MiniChip icon={<Sliders size={16} />} label="맞춤 설정" />
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

function Slide2() {
  return (
    <div className="grid w-full max-w-[820px] grid-cols-1 items-center gap-10 md:grid-cols-[1fr_240px] md:gap-12">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
          1. Chrome 웹 스토어 방문
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Chrome 웹 스토어에서 &lsquo;안자봐&rsquo;를 검색하거나
          <br />
          제공된 링크를 통해 바로 접속할 수 있습니다.
        </p>
        <div className="mt-6 rounded-xl bg-[#2563EB]/5 p-4 ring-1 ring-[#2563EB]/15">
          <div className="text-xs font-semibold text-[#2563EB]">💡 빠른 설치 팁</div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            이전 슬라이드의 다운로드 버튼을 클릭하면 바로 웹 스토어로 이동합니다.
          </p>
        </div>
      </div>
      <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center rounded-xl bg-zinc-50 text-sm text-zinc-400 ring-1 ring-zinc-100">
        관련 도움되는 이미지
      </div>
    </div>
  );
}

function Slide3() {
  return (
    <div className="grid w-full max-w-[820px] grid-cols-1 items-center gap-10 md:grid-cols-[240px_1fr] md:gap-12">
      <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center rounded-xl bg-zinc-50 text-sm text-zinc-400 ring-1 ring-zinc-100">
        관련 도움되는 이미지
      </div>
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
          2. Chrome에 추가
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          &lsquo;Chrome에 추가&rsquo; 버튼을 클릭하고 필요한 권한을 승인합니다.
        </p>
        <div className="mt-5 space-y-2.5">
          <InfoRow
            icon={<CheckCircle2 size={16} />}
            title="권한 승인"
            desc="웹캠과 알림 권한이 필요합니다"
          />
          <InfoRow
            icon={<Settings size={16} />}
            title="자동 설치"
            desc="설치 후 자동으로 활성화됩니다"
          />
        </div>
      </div>
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
