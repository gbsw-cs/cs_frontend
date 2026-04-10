"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, logout, withdraw, type Me } from "../lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [reportConsent, setReportConsent] = useState(true);
  const [pushConsent, setPushConsent] = useState(true);
  const [pushSound, setPushSound] = useState(true);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => router.push("/login"));
  }, [router]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }
  async function handleWithdraw() {
    if (!confirm("정말 회원탈퇴 하시겠습니까?")) return;
    await withdraw();
    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-8 sm:px-8 sm:py-12">
      <div className="w-full max-w-[1280px]">
        <div className="mb-7 flex items-center gap-4">
          <Link
            href="/dashboard"
            aria-label="대시보드로 돌아가기"
            className="group flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100 transition hover:bg-[#2563EB] hover:ring-[#2563EB]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-600 transition group-hover:text-white"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">개인 설정</h1>
            <p className="mt-0.5 text-xs text-zinc-400">프로필과 알림 환경을 관리합니다</p>
          </div>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-[400px_1fr]">
        {/* Profile card */}
        <section className="flex h-full flex-col rounded-3xl bg-white px-8 py-12 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 sm:px-10 sm:py-14">
          <div className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1574144611937-0df059b5ef3e?w=400&h=400&fit=crop"
              alt="프로필 사진"
              className="h-44 w-44 rounded-full object-cover ring-4 ring-white sm:h-52 sm:w-52"
            />
            <h2 className="mt-7 text-2xl font-bold text-zinc-900">{me?.name ?? "—"}</h2>
            <p className="mt-1.5 text-sm text-zinc-400">{me?.email ?? ""}</p>
          </div>

          <div className="mt-10">
            <div className="text-xs font-semibold text-zinc-400">내 뱃지</div>
            <div className="mt-4 flex items-center justify-start gap-4">
              <BadgeCircle className="bg-amber-100">🍯</BadgeCircle>
              <BadgeCircle className="bg-orange-100">🚶</BadgeCircle>
              <BadgeCircle className="bg-rose-100">🥇</BadgeCircle>
              <BadgeCircle className="bg-emerald-100">🌿</BadgeCircle>
            </div>
            <div className="mt-5 text-right">
              <Link
                href="#"
                className="text-xs font-medium text-zinc-500 hover:text-[#2563EB]"
              >
                뱃지 더 보기 →
              </Link>
            </div>
          </div>
        </section>

        {/* Settings card */}
        <section className="rounded-3xl bg-white px-8 py-10 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 sm:px-12 sm:py-12">
          <Group title="웹캠 & 캘리브레이션">
            <Row
              title="웹캠 설정 튜토리얼 다시 보기"
              desc="최초 설치 시 진행한 캘리브레이션 가이드를 다시 확인합니다."
              action={<StartButton href="/webcam-guide" />}
            />
            <Row
              title="확장 프로그램 설정 다시 보기"
              desc="Plasmo 브라우저 확장 사용법을 다시 확인합니다."
              action={<StartButton href="/extension-guide" />}
            />
          </Group>

          <Group title="리포트">
            <Row
              title="타임라인 리포트 수신 동의"
              desc="매일 자세 리포트를 이메일로 받습니다."
              action={<Toggle on={reportConsent} onChange={setReportConsent} />}
            />
          </Group>

          <Group title="알림">
            <Row
              title="푸시 알림 수신 동의"
              desc="경고 상태 진행 시 브라우저에 알림을 보냅니다."
              action={<Toggle on={pushConsent} onChange={setPushConsent} />}
            />
            <Row
              title="푸시 알림 소리 (ON/OFF)"
              desc="알림과 함께 효과음을 재생합니다."
              action={<Toggle on={pushSound} onChange={setPushSound} />}
            />
          </Group>

          <div className="mt-10 flex items-center justify-end gap-7 pt-2 text-sm">
            <button onClick={handleLogout} className="text-zinc-400 transition hover:text-zinc-600">
              로그아웃
            </button>
            <button onClick={handleWithdraw} className="font-semibold text-rose-500 transition hover:text-rose-600">
              회원탈퇴
            </button>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}

function BadgeCircle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-100 py-8 first:pt-0 last:border-b-0 last:pb-2">
      <div className="mb-6 text-sm font-semibold text-[#2563EB]">{title}</div>
      <div className="space-y-7">{children}</div>
    </div>
  );
}

function Row({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-base font-semibold text-zinc-800">{title}</div>
        <div className="mt-2 text-[13px] text-zinc-400">{desc}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function StartButton({ href }: { href?: string }) {
  const className =
    "inline-block rounded-lg bg-zinc-100 px-5 py-2 text-[13px] font-medium text-zinc-600 transition hover:bg-[#2563EB] hover:text-white";
  if (href) {
    return (
      <Link href={href} className={className}>
        시작
      </Link>
    );
  }
  return <button className={className}>시작</button>;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full transition ${
        on ? "bg-[#2563EB]" : "bg-zinc-200"
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

