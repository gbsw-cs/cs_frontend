"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AvatarColored from "../components/AvatarColored";

const WebcamView = dynamic(() => import("../components/WebcamView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-zinc-900 text-xs text-zinc-400">
      카메라 로딩 중...
    </div>
  ),
});

import {
  getBadges,
  getMe,
  setDarkDetection,
  type ApiBadge,
  getDashboardToday,
  getDashboardWeekly,
  getDashboardDaily,
  getDashboardTimeline,
  type Me,
  type TodayDashboard,
  type WeeklyDashboard,
  type DailyDashboard,
  type TimelineDashboard,
} from "../lib/api";

// ── 날짜 헬퍼 ──────────────────────────────────────────────

function getKSTDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function getMondayKST(): string {
  const today = new Date(getKSTDate());
  const day = today.getDay(); // 0=Sun
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  today.setDate(diff);
  return today.toISOString().split("T")[0];
}

const WEEKDAY_KR: Record<string, string> = {
  MON: "월요일", TUE: "화요일", WED: "수요일", THU: "목요일",
  FRI: "금요일", SAT: "토요일", SUN: "일요일",
};
const DAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

const STATE_LABEL: Record<string, string> = {
  GOOD: "정확한 자세 유지",
  TURTLE_NECK: "거북목 자세 감지",
  SHOULDER_ISSUE: "어깨 자세 교정 필요",
  DARK_ENV: "어두운 환경 감지",
};

// ── 컴포넌트 ──────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [today, setToday] = useState<TodayDashboard | null>(null);
  const [weekly, setWeekly] = useState<WeeklyDashboard | null>(null);
  const [daily, setDaily] = useState<DailyDashboard | null>(null);
  const [timeline, setTimeline] = useState<TimelineDashboard | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [darkPending, setDarkPending] = useState(false);
  const [badges, setBadges] = useState<ApiBadge[]>([]);
  const [webcamVisible, setWebcamVisible] = useState(false);

  async function toggleDarkDetection(next: boolean) {
    if (darkPending) return;
    const prev = darkMode;
    setDarkMode(next);
    setDarkPending(true);
    try {
      const res = await setDarkDetection(next);
      setDarkMode(res.darkDetectionEnabled);
    } catch {
      setDarkMode(prev);
    } finally {
      setDarkPending(false);
    }
  }

  useEffect(() => {
    const date = getKSTDate();
    const monday = getMondayKST();

    getMe()
      .then(setMe)
      .catch(() => router.push("/login"));

    getBadges()
      .then((b) => setBadges(b.slice(0, 3)))
      .catch(() => {});

    Promise.allSettled([
      getDashboardToday(),
      getDashboardWeekly(monday),
      getDashboardDaily(date),
      getDashboardTimeline(date),
    ]).then(([t, w, d, tl]) => {
      if (t.status === "fulfilled") {
        setToday(t.value);
        setDarkMode(t.value.darkDetectionMode === "ON");
      }
      if (w.status === "fulfilled") setWeekly(w.value);
      if (d.status === "fulfilled") setDaily(d.value);
      if (tl.status === "fulfilled") setTimeline(tl.value);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 파생 데이터 ────────────────────────────────────────

  // 건강 점수
  const healthScore = today?.healthScore ?? 0;

  // 일일 바 차트 (24시간, 데이터 없으면 더미)
  const hourBars = daily?.hours ?? Array.from({ length: 24 }, (_, i) => ({
    hour: i, goodRatio: 0, turtleNeckRatio: 0,
    shoulderIssueRatio: 0, darkEnvRatio: 0,
    turtleNeckCount: 0, shoulderIssueCount: 0, darkEnvCount: 0,
  }));

  // 최근 활동 (타임라인 버킷 → 최근 5개, 현재 시각 이전, 실제 감지 데이터만)
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const recentActivity = timeline?.buckets
    .filter(
      (b) =>
        b.startHour * 60 + b.startMin <= nowMin &&
        b.dominantState !== null &&
        b.dominantState !== undefined &&
        STATE_LABEL[b.dominantState] !== undefined
    )
    .slice(-5)
    .reverse() ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Top badge */}
        <div className="mb-3 flex shrink-0 justify-center">
          <span className="rounded-full bg-[#2563EB]/10 px-4 py-1 text-xs font-semibold text-[#2563EB] ring-1 ring-[#2563EB]/20">
            ● AI 신체 활성화 중 ●
          </span>
        </div>

        <div className="grid grid-cols-12 gap-3">

          {/* ── Row 1 ── */}

          {/* 프로필 */}
          <Card className="col-span-12 flex flex-col sm:col-span-6 lg:col-span-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-3xl">
                  {me?.profileImg
                    ? <img src={me.profileImg} className="h-16 w-16 object-cover" alt="프로필" />
                    : "🌿"}
                </div>
                <div>
                  <div className="text-lg font-bold text-zinc-900">{me?.name ?? "—"}</div>
                  <div className="text-sm text-zinc-400">교정 마스터</div>
                </div>
              </div>
              <Link href="/settings" aria-label="개인 설정" className="text-zinc-300 transition hover:text-[#2563EB]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
            </div>
            <div className="mt-2 text-[10px] text-zinc-500">뱃지</div>
            <div className="mt-0.5 flex gap-1.5">
              {badges.length === 0 ? (
                <span className="text-[10px] text-zinc-400">없음</span>
              ) : badges.map((b) =>
                b.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={b.badgeId} src={b.iconUrl} alt={b.name} width={18} height={18} className="rounded-full object-contain" />
                ) : (
                  <span key={b.badgeId} className="text-base">🏅</span>
                )
              )}
            </div>
          </Card>

          {/* 타임라인 */}
          <Card className="col-span-12 flex min-h-[220px] flex-col overflow-hidden sm:col-span-6 lg:col-span-5">
            <div className="flex shrink-0 items-start justify-between">
              <div>
                <div className="text-xs font-bold text-zinc-900">타임라인</div>
                <div className="mt-0.5 text-[10px] text-zinc-400">오늘 감지 이력을 확인해보세요.</div>
              </div>
              <button className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition hover:text-[#2563EB]" aria-label="타임라인 상세">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {recentActivity.length > 0 ? (
              <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                {recentActivity.map((b, i) => {
                  const isGood = b.dominantState === "GOOD";
                  const timeStr = `${String(b.startHour).padStart(2, "0")}:${String(b.startMin).padStart(2, "0")}`;
                  const icon =
                    b.dominantState === "GOOD"
                      ? "✅"
                      : b.dominantState === "TURTLE_NECK"
                      ? "⚠️"
                      : b.dominantState === "SHOULDER_ISSUE"
                      ? "🚨"
                      : "🌙";
                  const dotColor =
                    b.dominantState === "GOOD"
                      ? "bg-emerald-400"
                      : b.dominantState === "TURTLE_NECK"
                      ? "bg-amber-400"
                      : b.dominantState === "SHOULDER_ISSUE"
                      ? "bg-rose-400"
                      : "bg-zinc-400";
                  const label = isGood
                    ? `자세 교정 완료 ${icon}`
                    : `${STATE_LABEL[b.dominantState]} ${icon}`;
                  return (
                    <li key={i} className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                      <span className="shrink-0 text-zinc-700">{label}</span>
                      <span className="flex-1 border-b border-dashed border-zinc-200" />
                      <span className="shrink-0 text-zinc-400">{timeStr}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 text-center">
                <div className="text-2xl">📭</div>
                <div className="text-xs text-zinc-400">감지 이력이 없습니다</div>
              </div>
            )}
          </Card>

          {/* 웹캠 */}
          <Card className="col-span-12 flex flex-col sm:col-span-6 lg:col-span-4">
            <div className="flex shrink-0 items-start justify-between">
              <div>
                <div className="text-xs font-bold text-zinc-900">실시간 카메라</div>
                <div className="mt-0.5 text-[10px] text-zinc-400">자세 감지가 진행 중입니다.</div>
              </div>
              <button
                onClick={() => setWebcamVisible((v) => !v)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition hover:text-[#2563EB]"
                aria-label={webcamVisible ? "카메라 숨기기" : "카메라 보기"}
              >
                {webcamVisible ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
            <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl">
              <WebcamView />
              {!webcamVisible && (
                <div
                  className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 bg-zinc-900/60 backdrop-blur-md"
                  onClick={() => setWebcamVisible(true)}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span className="text-[11px] text-white/60">클릭하여 카메라 보기</span>
                </div>
              )}
            </div>
          </Card>

          {/* ── Row 2 ── */}

          {/* 3D 아바타 */}
          <Card className="col-span-12 flex flex-col sm:col-span-6 lg:col-span-3">
            <div className="flex flex-col items-center">
              <div className="h-44 w-full overflow-hidden">
                <AvatarColored
                  hoodColorId={me?.settings?.avatarHoodColor ?? "default"}
                  className="avatar-float h-full w-full"
                />
              </div>
              <button className={`mt-2 w-full rounded-full py-1.5 text-xs font-semibold ring-1 transition ${
                today && today.goodPostureRatio >= 0.6
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-200 hover:bg-emerald-100"
                  : today && today.goodPostureRatio > 0
                  ? "bg-amber-50 text-amber-600 ring-amber-200 hover:bg-amber-100"
                  : "bg-zinc-50 text-zinc-500 ring-zinc-200 hover:bg-zinc-100"
              }`}>
                {today
                  ? today.goodPostureRatio >= 0.6
                    ? "정확한 자세입니다 👍"
                    : today.goodPostureRatio > 0
                    ? "자세를 교정해주세요 ⚠️"
                    : "자세 데이터 수집 중..."
                  : "자세 데이터 수집 중..."}
              </button>
            </div>
          </Card>

          {/* 일간 스크린타임 */}
          <Card className="col-span-12 flex flex-col lg:col-span-6">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="text-xs font-bold text-zinc-900">일간 스크린타임</div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />양호</span>
                <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />경고</span>
                <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />위험</span>
                <button className="ml-0.5 text-zinc-400 transition hover:text-[#2563EB]" aria-label="일간 상세">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-stretch gap-3">
              {/* 좌측: 총 시간 */}
              <div className="flex shrink-0 flex-col justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-zinc-900">
                    {today ? Math.floor((today.totalDetectionSec ?? 0) / 3600) : 0}
                  </span>
                  <span className="text-xs text-zinc-500">시간</span>
                </div>
                <div className="text-[10px] text-zinc-400">상태 비율</div>
              </div>

              {/* 우측: 스택 바 차트 */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-24 items-end justify-around gap-1.5 border-b border-zinc-200 pb-1">
                  {(() => {
                    const buckets: (typeof hourBars[0] & { label: string })[] = [];
                    for (let i = 0; i < 8; i++) {
                      const startH = i * 3;
                      const slice = hourBars.slice(startH, startH + 3);
                      const avg = {
                        hour: startH,
                        goodRatio: slice.reduce((s, h) => s + h.goodRatio, 0) / 3,
                        turtleNeckRatio: slice.reduce((s, h) => s + h.turtleNeckRatio, 0) / 3,
                        shoulderIssueRatio: slice.reduce((s, h) => s + h.shoulderIssueRatio, 0) / 3,
                        darkEnvRatio: slice.reduce((s, h) => s + h.darkEnvRatio, 0) / 3,
                        turtleNeckCount: 0,
                        shoulderIssueCount: 0,
                        darkEnvCount: 0,
                        label: `${startH}시`,
                      };
                      buckets.push(avg);
                    }
                    return buckets.map((b, i) => {
                      const good = Math.max(0, b.goodRatio) * 100;
                      const warn = (Math.max(0, b.turtleNeckRatio) + Math.max(0, b.darkEnvRatio)) * 100;
                      const danger = Math.max(0, b.shoulderIssueRatio) * 100;
                      const total = good + warn + danger;
                      const hasData = total > 0;
                      const inactive = Math.max(0, 100 - total);
                      return (
                        <div key={i} className="flex h-full w-4 flex-col justify-end">
                          <div className="flex h-full w-full flex-col overflow-hidden rounded-full">
                            <div className="bg-zinc-200" style={{ height: `${hasData ? inactive : 100}%` }} />
                            <div className="bg-emerald-400" style={{ height: `${good}%` }} />
                            <div className="bg-amber-400" style={{ height: `${warn}%` }} />
                            <div className="bg-rose-400" style={{ height: `${danger}%` }} />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="mt-1 flex justify-around text-[9px] text-zinc-400">
                  {["0시", "3시", "6시", "9시", "12시", "15시", "18시", "21시", "24시"].map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* 오늘의 건강 점수 */}
          <Card className="col-span-12 flex flex-col sm:col-span-6 lg:col-span-3">
            <div className="text-sm font-bold text-zinc-900">오늘의 건강 점수</div>

            <div className="mt-3 flex items-center gap-4">
              {/* 도넛 차트 */}
              <div className="relative shrink-0">
                {(() => {
                  const size = 130;
                  const r = 48;
                  const circ = 2 * Math.PI * r;
                  const gapDeg = 60;
                  const usable = circ * (1 - gapDeg / 360);
                  const good = today ? today.goodPostureRatio : 0;
                  const total = today ? today.totalDetectionSec : 0;
                  const warnRatio = total > 0 && today?.breakdown
                    ? (today.breakdown.turtleNeckSec + today.breakdown.darkEnvSec) / total
                    : 0;
                  const dangerRatio = total > 0 && today?.breakdown
                    ? today.breakdown.shoulderIssueSec / total
                    : 0;
                  const goodLen = usable * good;
                  const warnLen = usable * warnRatio;
                  const dangerLen = usable * dangerRatio;
                  const gapLen = circ * (gapDeg / 360);
                  const rotation = 90 + gapDeg / 2;
                  return (
                    <svg width={size} height={size} viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r={r} fill="none" stroke="#f4f4f5" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${usable} ${gapLen}`} transform={`rotate(${rotation} 60 60)`} />
                      {goodLen > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke="#4ade80" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${goodLen} ${circ}`} transform={`rotate(${rotation} 60 60)`} />}
                      {warnLen > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke="#fbbf24" strokeWidth="14" strokeLinecap="round" strokeDasharray={`0 ${goodLen} ${warnLen} ${circ}`} transform={`rotate(${rotation} 60 60)`} />}
                      {dangerLen > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke="#f87171" strokeWidth="14" strokeLinecap="round" strokeDasharray={`0 ${goodLen + warnLen} ${dangerLen} ${circ}`} transform={`rotate(${rotation} 60 60)`} />}
                    </svg>
                  );
                })()}
                <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-zinc-900">
                  {healthScore}
                </span>
              </div>

              {/* 우측 리스트 */}
              <div className="flex-1 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-zinc-700"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />자세 점수</span>
                  <span className="text-sm font-bold text-emerald-500">{healthScore}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-zinc-700"><span className="inline-block h-2 w-2 rounded-full bg-rose-400" />경고 횟수</span>
                  <span className="text-sm font-bold text-rose-500">
                    {(today?.breakdown?.turtleNeckCount ?? 0) + (today?.breakdown?.shoulderIssueCount ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-zinc-700"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />조명 환경</span>
                  <span className="text-sm font-bold text-amber-500">{today?.breakdown?.darkEnvCount ?? 0}</span>
                </div>
              </div>
            </div>

            {/* 비교 통계 */}
            {(() => {
              const yDay = new Date();
              yDay.setDate(yDay.getDate() - 1);
              const ySrc = weekly?.days.find((d) => d.date === yDay.toISOString().split("T")[0]);
              const yDiff = today && ySrc ? today.healthScore - ySrc.healthScore : 0;
              const weekAvg = weekly && weekly.days.length > 0
                ? weekly.days.reduce((s, d) => s + d.healthScore, 0) / weekly.days.length
                : 0;
              const wDiff = today ? Math.round(today.healthScore - weekAvg) : 0;
              const fmt = (n: number) =>
                n > 0 ? `${n}% 향상` : n < 0 ? `${Math.abs(n)}% 하락` : "변동 없음";
              const color = (n: number) =>
                n > 0 ? "text-[#2563EB]" : n < 0 ? "text-rose-500" : "text-zinc-500";
              return (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="border-t border-zinc-200 pt-2 text-center">
                    <div className="text-[11px] text-zinc-400">어제 대비</div>
                    <div className={`mt-0.5 text-sm font-bold ${color(yDiff)}`}>{fmt(yDiff)}</div>
                  </div>
                  <div className="border-t border-zinc-200 pt-2 text-center">
                    <div className="text-[11px] text-zinc-400">지난주 대비</div>
                    <div className={`mt-0.5 text-sm font-bold ${color(wDiff)}`}>{fmt(wDiff)}</div>
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* ── Row 3 ── */}

          {/* 실시간 감지 상태 + 어둠 감지 모드 */}
          <div className="col-span-12 flex h-full flex-col gap-2 sm:col-span-6 lg:col-span-3">
            <Card className="flex flex-1 flex-col">
              <div className="text-xs font-bold text-zinc-900">실시간 감지 상태</div>

              {/* 종합 상태 메시지 */}
              {(() => {
                const score = today?.healthScore ?? 0;
                const tone =
                  score >= 70
                    ? { text: "양호", color: "text-emerald-500", ring: "ring-emerald-300" }
                    : score >= 40
                    ? { text: "보통", color: "text-amber-500", ring: "ring-amber-300" }
                    : today
                    ? { text: "주의 필요", color: "text-rose-500", ring: "ring-rose-300" }
                    : { text: "분석 중", color: "text-zinc-400", ring: "ring-zinc-200" };
                return (
                  <div className={`mt-2 rounded-full px-3 py-1.5 text-center text-[11px] font-semibold ring-2 ${tone.color} ${tone.ring}`}>
                    {me?.name ?? "사용자"}님의 상태는 {tone.text}합니다.
                  </div>
                );
              })()}

              {/* 감지 항목 리스트 */}
              <ul className="mt-2 space-y-1.5">
                {[
                  { label: "거북목 감지", count: today?.breakdown?.turtleNeckCount },
                  { label: "라운드 숄더 감지", count: today?.breakdown?.shoulderIssueCount },
                  { label: "어둠 속 코딩 감지", count: today?.breakdown?.darkEnvCount },
                  { label: "상태 표시", count: today?.healthScore !== undefined ? (today.healthScore >= 40 ? 0 : 10) : undefined },
                ].map(({ label, count }) => {
                  const status =
                    count === undefined
                      ? { text: "분석 중", dot: "bg-zinc-300", color: "text-zinc-400" }
                      : count === 0
                      ? { text: "상태 좋음", dot: "bg-emerald-400", color: "text-emerald-500" }
                      : count < 5
                      ? { text: "주의", dot: "bg-amber-400", color: "text-amber-500" }
                      : { text: "경고", dot: "bg-rose-400", color: "text-rose-500" };
                  return (
                    <li key={label} className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-zinc-700">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {label}
                      </span>
                      <span className={`text-[10px] font-medium ${status.color}`}>{status.text}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* 어둠 속 코딩 감지 모드 */}
            <Card className="shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-zinc-900">어둠 속 코딩 감지 모드</div>
                  <div className="text-[10px] text-zinc-400">어두운 환경에서 알림을 보내요.</div>
                </div>
                <Toggle on={darkMode} onChange={toggleDarkDetection} disabled={darkPending} />
              </div>
            </Card>
          </div>

          {/* 주간 스크린타임 */}
          <Card className="col-span-12 flex flex-col sm:col-span-6 lg:col-span-9">
            <div className="flex shrink-0 items-center justify-between">
              <div className="text-xs font-bold text-zinc-900">주간 스크린타임</div>
              <button className="text-zinc-400 transition hover:text-[#2563EB]" aria-label="주간 상세">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* 통계 카드 행 */}
            {(() => {
              const turtleH = weekly ? Math.round(weekly.days.reduce((s, d) => s + d.turtleNeckSec, 0) / 3600) : 0;
              const shoulderH = weekly ? Math.round(weekly.days.reduce((s, d) => s + d.shoulderIssueSec, 0) / 3600) : 0;
              const asymH = weekly ? Math.round(weekly.days.reduce((s, d) => s + d.turtleNeckSec + d.shoulderIssueSec, 0) / 3600 / 2) : 0;
              const darkH = weekly ? Math.round(weekly.days.reduce((s, d) => s + d.darkEnvSec, 0) / 3600) : 0;
              const goodPct = weekly
                ? Math.round(
                    weekly.days.reduce((s, d) => s + (d.totalDetectionSec > 0 ? d.goodPostureSec / d.totalDetectionSec : 0), 0) /
                    weekly.days.length * 100
                  )
                : 0;

              return (
                <div className="mt-2 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-6">
                  <div className="col-span-2 rounded-lg ring-1 ring-zinc-100 sm:col-span-4">
                    <div className="grid grid-cols-2 divide-x divide-zinc-100 sm:grid-cols-4">
                      <DurationStat label="거북목 지속 시간" hour={turtleH} />
                      <DurationStat label="라운드 숄더 지속 시간" hour={shoulderH} />
                      <DurationStat label="자세 비대칭 지속 시간" hour={asymH} />
                      <DurationStat label="어둠 코딩 지속 시간" hour={darkH} />
                    </div>
                  </div>
                  <div className="rounded-lg px-3 py-2 ring-1 ring-zinc-100">
                    <div className="text-[10px] text-zinc-400">최악 요일</div>
                    <div className="text-lg font-bold text-rose-500">{weekly?.worstWeekday ? (WEEKDAY_KR[weekly.worstWeekday] ?? "—") : "—"}</div>
                  </div>
                  <div className="rounded-lg px-3 py-2 ring-1 ring-zinc-100">
                    <div className="text-[10px] text-zinc-400">정자세 비율</div>
                    <div className="text-lg font-bold text-[#2563EB]">{goodPct}%</div>
                  </div>
                </div>
              );
            })()}

            {/* 선형 차트 */}
            <div className="relative mt-2 flex flex-col">
              <div className="absolute left-0 top-0 text-[9px] leading-tight text-zinc-400">
                비정상<br />자세 비율
              </div>
              {(() => {
                const values = weekly?.days.map((d) => {
                  if (!d.totalDetectionSec) return 0;
                  return (((d.turtleNeckSec ?? 0) + (d.shoulderIssueSec ?? 0) + (d.darkEnvSec ?? 0)) / d.totalDetectionSec) * 100;
                }) ?? [30, 55, 40, 30, 35, 50, 35];
                const W = 700;
                const H = 120;
                const step = values.length > 1 ? W / (values.length - 1) : 0;
                const coords = values.map((v, i) => [i * step, H - (v / 100) * H] as [number, number]);
                const line = coords.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
                const dayLabels = weekly?.days.map((d) => DAY_KR[new Date(d.date).getDay()]) ?? ["월", "화", "수", "목", "금", "토", "일"];
                return (
                  <>
                    <svg viewBox={`0 0 ${W} ${H + 4}`} preserveAspectRatio="none" className="h-28 w-full">
                      <line x1="0" y1={H} x2={W} y2={H} stroke="#e4e4e7" strokeWidth="1" />
                      <path d={line} fill="none" stroke="#d4d4d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      {coords.map(([x, y], i) => (
                        <circle key={i} cx={x} cy={y} r="4" fill="#e4e4e7" stroke="#ffffff" strokeWidth="1.5" />
                      ))}
                    </svg>
                    <div className="mt-1 flex shrink-0 justify-between px-1 text-[10px] font-medium text-zinc-500">
                      {dayLabels.map((d, i) => <span key={i}>{d}</span>)}
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-zinc-100 sm:px-4 sm:py-3.5 ${className}`}>
      {children}
    </div>
  );
}

function DurationStat({ label, hour }: { label: string; hour: number }) {
  return (
    <div className="px-2 py-2">
      <div className="truncate text-[9px] text-zinc-400">{label}</div>
      <div className="text-base font-bold text-zinc-900">{hour}h</div>
      <div className="text-[9px] text-zinc-400">↓4h 저번주 대비</div>
    </div>
  );
}

function Toggle({ on, onChange, disabled = false }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-[#2563EB]" : "bg-zinc-300"} ${disabled ? "opacity-60" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}
