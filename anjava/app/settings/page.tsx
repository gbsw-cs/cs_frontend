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
  const [darkMode, setDarkMode] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

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

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      alert("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    alert("비밀번호가 변경되었습니다.");
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
  }

  const badges = ["🥇", "🥇", "🥇", "🥇", ""];
  const avatarColors = [
    { bg: "bg-emerald-100", hex: "#d1fae5" },
    { bg: "bg-sky-100", hex: "#e0f2fe" },
    { bg: "bg-violet-100", hex: "#ede9fe" },
    { bg: "bg-rose-100", hex: "#ffe4e6" },
    { bg: "bg-amber-100", hex: "#fef3c7" },
    { bg: "bg-orange-100", hex: "#ffedd5" },
    { bg: "bg-pink-100", hex: "#fce7f3" },
    { bg: "bg-zinc-100", hex: "#f4f4f5" },
  ];
  const [avatarColorIdx, setAvatarColorIdx] = useState(0);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-8 sm:px-8 sm:py-12">
      <div className="w-full max-w-[1100px]">
        {/* Header */}
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

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left: character + badges + dark mode */}
          <section className="flex flex-col rounded-3xl bg-white px-6 py-8 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100">
            <div className="flex flex-1 flex-col items-center">
              {/* Avatar */}
              <div
                className={`flex h-36 w-36 items-center justify-center rounded-full text-6xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-colors duration-300 ${avatarColors[avatarColorIdx].bg}`}
              >
                🌿
              </div>

              {/* Color picker */}
              <div className="mt-6 w-full">
                <p className="mb-3 text-center text-xs font-semibold text-zinc-400">아바타 색상</p>
                <div className="grid grid-cols-4 gap-2">
                  {avatarColors.map((color, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAvatarColorIdx(i)}
                      style={{ backgroundColor: color.hex }}
                      className={`h-10 w-full rounded-xl transition hover:scale-105 ${
                        avatarColorIdx === i
                          ? "ring-2 ring-[#2563EB] ring-offset-2"
                          : ""
                      }`}
                      aria-label={`색상 ${i + 1}`}
                    />
                  ))}
                </div>
              </div>

            </div>

            {/* Dark mode toggle */}
            <div className="mt-40 flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
                <span>☀️</span>
                <span>다크모드</span>
              </div>
              <div className="flex items-center gap-2">
                <Toggle on={darkMode} onChange={setDarkMode} />
                <span className="text-base">🌙</span>
              </div>
            </div>
          </section>

          {/* Right: settings */}
          <section className="rounded-3xl bg-white px-8 py-8 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 sm:px-10">
            {/* Profile + badges */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-6">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl transition-colors duration-300 ${avatarColors[avatarColorIdx].bg}`}
                >
                  {me?.profileImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={me.profileImg}
                      alt="프로필"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    "🌿"
                  )}
                </div>
                <div>
                  <div className="text-base font-bold text-zinc-900">{me?.name ?? "—"}</div>
                  <div className="text-sm text-zinc-400">{me?.email ?? ""}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="mr-1 text-xs font-semibold text-zinc-400">내 뱃지</span>
                {badges.map((badge, i) => (
                  <div
                    key={i}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${
                      badge ? "bg-amber-100" : "bg-zinc-100"
                    }`}
                  >
                    {badge}
                  </div>
                ))}
              </div>
            </div>

            {/* Password change */}
            <form
              onSubmit={handlePasswordChange}
              className="space-y-3 border-b border-zinc-100 py-6"
            >
              <PwInput
                label="현재 비밀번호"
                placeholder="현재 비밀번호 입력"
                value={currentPw}
                onChange={setCurrentPw}
              />
              <PwInput
                label="새 비밀번호"
                placeholder="새 비밀번호 입력"
                value={newPw}
                onChange={setNewPw}
              />
              <PwInput
                label="새 비밀번호 확인"
                placeholder="새 비밀번호 확인"
                value={confirmPw}
                onChange={setConfirmPw}
              />
              <div className="pt-1">
                <button
                  type="submit"
                  className="rounded-xl bg-[#2563EB] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
                >
                  비밀번호 변경
                </button>
              </div>
            </form>

            {/* Webcam & calibration */}
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

            {/* Report */}
            <Group title="리포트">
              <Row
                title="리포트 수신 동의"
                desc="매일 자세 리포트를 이메일로 받습니다."
                action={<Toggle on={reportConsent} onChange={setReportConsent} />}
              />
            </Group>

            {/* Notification method */}
            <Group title="알림 수신 방법">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 transition hover:bg-zinc-200"
                  aria-label="이메일 알림"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-zinc-500"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 transition hover:bg-zinc-200"
                  aria-label="Gmail 알림"
                >
                  <span className="text-sm font-bold text-red-500">M</span>
                </button>
              </div>
            </Group>

            {/* Push notifications */}
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

            {/* Logout / Withdraw */}
            <div className="mt-6 flex items-center justify-end gap-7 pt-2 text-sm">
              <button
                onClick={handleLogout}
                className="text-zinc-400 transition hover:text-zinc-600"
              >
                로그아웃
              </button>
              <button
                onClick={handleWithdraw}
                className="font-semibold text-rose-500 transition hover:text-rose-600"
              >
                회원탈퇴
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PwInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-zinc-500">{label}</label>
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-300 focus:border-[#2563EB] focus:bg-white"
      />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-100 py-6 last:border-b-0 last:pb-0">
      <div className="mb-5 text-sm font-semibold text-[#2563EB]">{title}</div>
      <div className="space-y-6">{children}</div>
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
        <div className="text-sm font-semibold text-zinc-800">{title}</div>
        <div className="mt-1 text-[13px] text-zinc-400">{desc}</div>
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
