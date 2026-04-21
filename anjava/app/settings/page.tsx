"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  changePassword,
  getCachedUserId,
  getMe,
  getMySettings,
  logout,
  type Me,
  type ReportPushWay,
  type UserSettings,
  type UserSettingsPatch,
  setDarkDetection,
  updateMySettings,
  withdraw,
} from "../lib/api";
import { validatePassword } from "../lib/validation";

type AvatarColor = { id: string; bg: string; hex: string };

const AVATAR_COLORS: AvatarColor[] = [
  { id: "default", bg: "bg-emerald-100", hex: "#d1fae5" },
  { id: "sky", bg: "bg-sky-100", hex: "#e0f2fe" },
  { id: "violet", bg: "bg-violet-100", hex: "#ede9fe" },
  { id: "rose", bg: "bg-rose-100", hex: "#ffe4e6" },
  { id: "amber", bg: "bg-amber-100", hex: "#fef3c7" },
  { id: "orange", bg: "bg-orange-100", hex: "#ffedd5" },
  { id: "pink", bg: "bg-pink-100", hex: "#fce7f3" },
  { id: "zinc", bg: "bg-zinc-100", hex: "#f4f4f5" },
];

const DEFAULT_SETTINGS: UserSettings = {
  brightnessThreshold: 50,
  darkDetectionEnabled: false,
  reportPushEnabled: true,
  reportPushWay: "EMAIL",
  pushEnabled: true,
  soundEnabled: true,
  avatarHoodColor: "default",
};

function getColorIdx(id: string) {
  const idx = AVATAR_COLORS.findIndex((c) => c.id === id);
  return idx < 0 ? 0 : idx;
}

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [darkMode, setDarkModeState] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = localStorage.getItem("uiDarkMode") === "1";
    setDarkModeState(on);
    document.documentElement.classList.toggle("dark", on);
  }, []);

  function setDarkMode(next: boolean) {
    setDarkModeState(next);
    if (typeof window === "undefined") return;
    localStorage.setItem("uiDarkMode", next ? "1" : "0");
    document.documentElement.classList.toggle("dark", next);
  }

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMessage, setPwMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    // 과거 버전 호환: 계정 구분 없던 키는 즉시 제거
    if (typeof window !== "undefined") {
      localStorage.removeItem("mySettings");
    }
    const userId = getCachedUserId();
    // 1) localStorage 캐시 먼저 적용 — 같은 계정의 마지막 값 복원
    if (typeof window !== "undefined" && userId) {
      const cached = localStorage.getItem(`mySettings:${userId}`);
      if (cached) {
        try {
          setSettings(JSON.parse(cached) as UserSettings);
        } catch {
          /* ignore */
        }
      } else {
        // 해당 사용자 캐시가 없으면 다른 계정 잔여값이 섞이지 않도록 기본값
        setSettings(DEFAULT_SETTINGS);
      }
    }
    // 2) 서버 값으로 덮어쓰기 (있으면)
    getMySettings()
      .then((s) => {
        setSettings(s);
        const id = getCachedUserId();
        if (typeof window !== "undefined" && id) {
          localStorage.setItem(`mySettings:${id}`, JSON.stringify(s));
        }
      })
      .catch(() => {
        /* GET 미지원/타임아웃 — 캐시 또는 기본값 유지 */
      });
  }, []);

  function flash(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }

  function cacheSettings(s: UserSettings) {
    if (typeof window === "undefined") return;
    const id = getCachedUserId();
    if (!id) return;
    localStorage.setItem(`mySettings:${id}`, JSON.stringify(s));
  }

  async function patchSettings(patch: UserSettingsPatch) {
    const previous = settings;
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    cacheSettings(optimistic);
    try {
      const updated = await updateMySettings(patch);
      setSettings(updated);
      cacheSettings(updated);
    } catch (e) {
      setSettings(previous);
      cacheSettings(previous);
      flash(e instanceof Error ? e.message : "설정 저장 실패");
    }
  }

  async function toggleDarkDetection(next: boolean) {
    const previous = settings.darkDetectionEnabled;
    setSettings((s) => {
      const updated = { ...s, darkDetectionEnabled: next };
      cacheSettings(updated);
      return updated;
    });
    try {
      const res = await setDarkDetection(next);
      setSettings((s) => {
        const updated = { ...s, darkDetectionEnabled: res.darkDetectionEnabled };
        cacheSettings(updated);
        return updated;
      });
    } catch (e) {
      setSettings((s) => {
        const updated = { ...s, darkDetectionEnabled: previous };
        cacheSettings(updated);
        return updated;
      });
      flash(e instanceof Error ? e.message : "어둠 감지 저장 실패");
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* 서버 에러여도 로컬 토큰은 이미 정리됨 */
    }
    router.push("/login");
  }

  async function handleWithdraw() {
    if (!confirm("정말 회원탈퇴 하시겠습니까? 이 작업은 되돌릴 수 없습니다."))
      return;
    try {
      await withdraw();
      router.push("/");
    } catch (e) {
      flash(e instanceof Error ? e.message : "회원탈퇴 실패");
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    if (!currentPw) {
      setPwMessage({ kind: "error", text: "현재 비밀번호를 입력해 주세요." });
      return;
    }
    const newErr = validatePassword(newPw);
    if (newErr) {
      setPwMessage({ kind: "error", text: newErr });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage({ kind: "error", text: "새 비밀번호가 일치하지 않습니다." });
      return;
    }
    setPwSubmitting(true);
    try {
      await changePassword(currentPw, newPw);
      setPwMessage({ kind: "ok", text: "비밀번호가 변경되었습니다." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setPwMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "비밀번호 변경 실패",
      });
    } finally {
      setPwSubmitting(false);
    }
  }

  const avatarColorIdx = getColorIdx(settings.avatarHoodColor);
  const badges = ["🥇", "🥇", "🥇", "🥇", ""];

  const newPwInlineError = validatePassword(newPw);
  const confirmInlineError =
    confirmPw.length > 0 && newPw !== confirmPw
      ? "새 비밀번호가 일치하지 않습니다."
      : null;

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
            <p className="mt-0.5 text-xs text-zinc-400">
              프로필과 알림 환경을 관리합니다
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left: character + color + UI dark toggle */}
          <section className="flex flex-col rounded-3xl bg-white px-6 py-8 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100">
            <div className="flex flex-1 flex-col items-center">
              <div
                className={`flex h-36 w-36 items-center justify-center rounded-full text-6xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-colors duration-300 ${AVATAR_COLORS[avatarColorIdx].bg}`}
              >
                🌿
              </div>

              <div className="mt-6 w-full">
                <p className="mb-3 text-center text-xs font-semibold text-zinc-400">
                  아바타 색상
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {AVATAR_COLORS.map((color, i) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() =>
                        patchSettings({ avatarHoodColor: color.id })
                      }
                      style={{ backgroundColor: color.hex }}
                      className={`h-10 w-full rounded-xl transition hover:scale-105 ${
                        avatarColorIdx === i
                          ? "ring-2 ring-[#2563EB] ring-offset-2"
                          : ""
                      }`}
                      aria-label={`색상 ${color.id}`}
                    />
                  ))}
                </div>
              </div>
            </div>

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
                  className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl transition-colors duration-300 ${AVATAR_COLORS[avatarColorIdx].bg}`}
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
                  <div className="text-base font-bold text-zinc-900">
                    {me?.name ?? "—"}
                  </div>
                  <div className="text-sm text-zinc-400">{me?.email ?? ""}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="mr-1 text-xs font-semibold text-zinc-400">
                  내 뱃지
                </span>
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
                error={newPwInlineError}
              />
              <PwInput
                label="새 비밀번호 확인"
                placeholder="새 비밀번호 확인"
                value={confirmPw}
                onChange={setConfirmPw}
                error={confirmInlineError}
              />
              {pwMessage && (
                <p
                  className={`text-xs font-medium ${
                    pwMessage.kind === "ok" ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {pwMessage.text}
                </p>
              )}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={
                    pwSubmitting ||
                    !currentPw ||
                    !newPw ||
                    !confirmPw ||
                    !!newPwInlineError ||
                    !!confirmInlineError
                  }
                  className="rounded-xl bg-[#2563EB] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
                >
                  {pwSubmitting ? "변경 중..." : "비밀번호 변경"}
                </button>
              </div>
            </form>

            {/* Dark detection */}
            <Group title="어둠 감지">
              <Row
                title="어둠 속 코딩 감지 모드"
                desc="카메라 밝기를 분석해 어두운 환경에서의 코딩을 감지합니다."
                action={
                  <Toggle
                    on={settings.darkDetectionEnabled}
                    onChange={toggleDarkDetection}
                  />
                }
              />
            </Group>

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
                desc="매일 자세 리포트를 받습니다."
                action={
                  <Toggle
                    on={settings.reportPushEnabled}
                    onChange={(v) => patchSettings({ reportPushEnabled: v })}
                  />
                }
              />
            </Group>

            {/* Notification delivery */}
            <Group title="알림 수신 방법">
              <Row
                title="수신 채널"
                desc="어디로 리포트를 받을지 선택합니다."
                action={
                  <div className="flex items-center gap-3">
                    <WayButton
                      active={settings.reportPushWay === "EMAIL"}
                      onClick={() => patchSettings({ reportPushWay: "EMAIL" })}
                      ariaLabel="Gmail 로 수신"
                    >
                      <GmailIcon />
                    </WayButton>
                    <WayButton
                      active={settings.reportPushWay === "NOTION"}
                      onClick={() => patchSettings({ reportPushWay: "NOTION" })}
                      ariaLabel="Notion 으로 수신"
                    >
                      <NotionIcon />
                    </WayButton>
                  </div>
                }
              />
            </Group>

            {/* Push notifications */}
            <Group title="알림">
              <Row
                title="푸시 알림 수신 동의"
                desc="경고 상태 진행 시 브라우저에 알림을 보냅니다."
                action={
                  <Toggle
                    on={settings.pushEnabled}
                    onChange={(v) => patchSettings({ pushEnabled: v })}
                  />
                }
              />
              <Row
                title="푸시 알림 소리 (ON/OFF)"
                desc="알림과 함께 효과음을 재생합니다."
                action={
                  <Toggle
                    on={settings.soundEnabled}
                    onChange={(v) => patchSettings({ soundEnabled: v })}
                  />
                }
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

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-zinc-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function PwInput({
  label,
  placeholder,
  value,
  onChange,
  error,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const hasError = Boolean(error);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-zinc-500">
        {label}
      </label>
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={hasError || undefined}
        className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-300 focus:bg-white ${
          hasError
            ? "border-rose-400 focus:border-rose-500"
            : "border-zinc-200 focus:border-[#2563EB]"
        }`}
      />
      {hasError && (
        <p className="mt-1 text-[11px] font-medium text-rose-500">{error}</p>
      )}
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

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
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

function WayButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm transition ${
        active
          ? "ring-2 ring-[#2563EB]"
          : "ring-1 ring-zinc-200 hover:ring-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function GmailIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 48 48"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M6 40V14.5l16 12 16-12V40H32V24.5l-10 7.5-10-7.5V40z"
      />
      <path fill="#34A853" d="M32 40h8a2 2 0 0 0 2-2V14.5L32 22z" />
      <path fill="#FBBC04" d="M42 14.5V12a4 4 0 0 0-4-4h-1L32 11.7v10.3z" />
      <path
        fill="#EA4335"
        d="M6 14.5V12a4 4 0 0 1 4-4h1L16 11.7l6 4.5 6-4.5L33 8h5a4 4 0 0 1 4 4v2.5L22 30z"
      />
      <path fill="#C5221F" d="M6 14.5V12a4 4 0 0 1 4-4h1L16 11.7v10.3z" />
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#000"
        d="M6.02 4.24c.96.79 1.32.73 3.13.61l17.06-1.03c.36 0 .06-.36-.06-.42L23.33 1.35c-.54-.42-1.27-.91-2.65-.79L4.14 1.77c-.6.06-.72.36-.48.6zm.79 3.09v17.95c0 .97.48 1.33 1.57 1.27l18.75-1.09c1.09-.06 1.21-.73 1.21-1.51V6.12c0-.78-.3-1.2-.97-1.14L7.78 6.06c-.73.06-.97.43-.97 1.27zm18.29 1.03c.12.55 0 1.09-.55 1.15l-.9.18v13.29c-.79.42-1.51.66-2.11.66-.97 0-1.21-.3-1.94-1.21l-5.93-9.33v9.02l1.87.43s0 1.09-1.51 1.09l-4.29.24c-.12-.24 0-.85.42-.97l1.09-.3V11.06l-1.51-.12c-.12-.67.36-1.39 1.02-1.45l4.47-.3 6.17 9.44v-8.35l-1.57-.18c-.12-.67.36-1.15.97-1.21z"
      />
    </svg>
  );
}

export type { ReportPushWay };
