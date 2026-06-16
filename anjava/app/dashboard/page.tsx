"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AvatarColored from "../components/AvatarColored";
import type { SessionControlState } from "../components/WebcamView";

const WebcamView = dynamic(() => import("../components/WebcamView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-zinc-900 text-xs text-zinc-400">
      카메라 로딩 중...
    </div>
  ),
});

import {
  clearTokens,
  getBadges,
  getAccessToken,
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
  type DetectionState,
} from "../lib/api";
import { syncWebPushToken } from "../lib/fcm";

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
const WEEK_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const STATE_LABEL: Record<string, string> = {
  GOOD_POSTURE:       "자세 교정 완료",
  GOOD:               "자세 교정 완료",
  TURTLE_NECK:        "거북목 발생",
  SHOULDER_ISSUE:     "어깨 자세 이상 발생",
  ROUND_SHOULDER:     "라운드숄더 발생",
  SHOULDER_ASYMMETRY: "어깨 비대칭 발생",
  DARK_ENV:           "어두운 환경 감지",
};
const ISSUE_LABEL: Record<string, string> = {
  turtleNeckCount: "거북목",
  roundShoulderCount: "라운드숄더",
  shoulderAsymmetryCount: "어깨 비대칭",
  shoulderIssueCount: "어깨 자세",
  darkEnvCount: "어두운 환경",
};

type DailySlot = Pick<
  DailyDashboard,
  | "slotIndex"
  | "startHour"
  | "goodPostureCount"
  | "singleBadCount"
  | "overlappingCount"
  | "totalDetectionSec"
  | "goodPostureSec"
  | "turtleNeckSec"
  | "roundShoulderSec"
  | "shoulderAsymmetrySec"
  | "darkEnvSec"
  | "unclassifiedSec"
  | "hasDurationData"
>;

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = toFiniteNumber(value, NaN);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isUnauthorizedError(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "status" in value && (value as { status?: unknown }).status === 401);
}

function getRequestErrorStatus(value: unknown): number {
  return value && typeof value === "object" && "status" in value
    ? Number((value as { status?: unknown }).status)
    : 0;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatDuration(sec: number | null): string {
  if (sec === null) return "—";
  const totalMinutes = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m > 0 ? `${m}m` : ""}`.trim();
  return `${m}m`;
}

function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function createEmptyDailySlots(): DailySlot[] {
  return Array.from({ length: 8 }, (_, i) => ({
    slotIndex: i,
    startHour: i * 3,
    goodPostureCount: 0,
    singleBadCount: 0,
    overlappingCount: 0,
    totalDetectionSec: 0,
    goodPostureSec: 0,
    turtleNeckSec: 0,
    roundShoulderSec: 0,
    shoulderAsymmetrySec: 0,
    darkEnvSec: 0,
    unclassifiedSec: 0,
    hasDurationData: false,
  }));
}

function toDailySlots(daily: DailyDashboard[] | null): DailySlot[] {
  const slots = createEmptyDailySlots();
  if (!daily) return slots;
  daily.forEach((item) => {
    const slotIndex = Math.max(0, Math.min(7, Math.trunc(toFiniteNumber(item.slotIndex))));
    slots[slotIndex] = {
      slotIndex,
      startHour: toFiniteNumber(item.startHour, slotIndex * 3),
      goodPostureCount: toFiniteNumber(item.goodPostureCount),
      singleBadCount: toFiniteNumber(item.singleBadCount),
      overlappingCount: toFiniteNumber(item.overlappingCount),
      totalDetectionSec: toFiniteNumber(item.totalDetectionSec),
      goodPostureSec: toFiniteNumber(item.goodPostureSec),
      turtleNeckSec: toFiniteNumber(item.turtleNeckSec),
      roundShoulderSec: toFiniteNumber(item.roundShoulderSec),
      shoulderAsymmetrySec: toFiniteNumber(item.shoulderAsymmetrySec),
      darkEnvSec: toFiniteNumber(item.darkEnvSec),
      unclassifiedSec: toFiniteNumber(item.unclassifiedSec),
      hasDurationData: item.hasDurationData,
    };
  });
  return slots;
}

// ── 컴포넌트 ──────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [today, setToday] = useState<TodayDashboard | null>(null);
  const [weekly, setWeekly] = useState<WeeklyDashboard | null>(null);
  const [timeline, setTimeline] = useState<TimelineDashboard | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [darkPending, setDarkPending] = useState(false);
  const [badges, setBadges] = useState<ApiBadge[]>([]);
  const [webcamVisible, setWebcamVisible] = useState(false);
  const [sessionCommand, setSessionCommand] = useState<SessionControlState>("checking");
  const [sessionStatus, setSessionStatus] = useState<SessionControlState>("checking");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [liveDetection, setLiveDetection] = useState<{
    state: DetectionState;
    message: string;
    updatedAt: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshCooldownRef = useRef(0);
  const dashboardRequestInFlightRef = useRef(false);
  const dashboardBackoffUntilRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const sessionStateChangedAtRef = useRef(0);
  const lastReportedDetectionStateRef = useRef<DetectionState | null>(null);
  const realtimeDateRef = useRef(getKSTDate());
  const [serverDailySlots, setServerDailySlots] = useState<DailySlot[]>(() => createEmptyDailySlots());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [notificationPermissionPending, setNotificationPermissionPending] = useState(false);

  const loadDashboardData = useCallback(async () => {
    if (document.hidden) return;
    if (dashboardRequestInFlightRef.current || Date.now() < dashboardBackoffUntilRef.current) return;
    dashboardRequestInFlightRef.current = true;
    const date = getKSTDate();
    const monday = getMondayKST();
    if (realtimeDateRef.current !== date) {
      realtimeDateRef.current = date;
      setServerDailySlots(createEmptyDailySlots());
    }

    try {
      const [t, w, d, tl] = await Promise.allSettled([
        getDashboardToday(),
        getDashboardWeekly(monday),
        getDashboardDaily(date),
        getDashboardTimeline(date),
      ]);
      const results = [t, w, d, tl];
      if (results.some((result) => result.status === "rejected" && isUnauthorizedError(result.reason))) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        clearTokens();
        router.replace("/login");
        return;
      }
      const retryStatus = results.reduce((status, result) => {
        if (result.status !== "rejected") return status;
        const next = getRequestErrorStatus(result.reason);
        return status === 429 || next === 429 ? 429 : Math.max(status, next);
      }, 0);
      if (retryStatus === 429 || retryStatus >= 500) {
        dashboardBackoffUntilRef.current = Date.now() + (retryStatus === 429 ? 60_000 : 20_000);
      }
      if (t.status === "fulfilled") setToday(t.value);
      else if (getRequestErrorStatus(t.reason) < 429) console.error("[dashboard] today 실패:", t.reason);
      if (w.status === "fulfilled") {
        setWeekly(w.value);
      } else if (getRequestErrorStatus(w.reason) < 429) console.error("[dashboard] weekly 실패:", w.reason);
      if (d.status === "fulfilled") {
        setServerDailySlots(toDailySlots(d.value));
      } else if (getRequestErrorStatus(d.reason) < 429) console.error("[dashboard] daily 실패:", d.reason);
      if (tl.status === "fulfilled") setTimeline(tl.value);
      else if (getRequestErrorStatus(tl.reason) < 429) console.error("[dashboard] timeline 실패:", tl.reason);
    } finally {
      dashboardRequestInFlightRef.current = false;
    }
  }, [router]);

  const refreshDashboardDataSoon = useCallback(() => {
    const now = Date.now();
    if (now - refreshCooldownRef.current < 5_000) return;
    refreshCooldownRef.current = now;
    void loadDashboardData();
  }, [loadDashboardData]);

  const refreshTimeline = useCallback(() => {
    const date = getKSTDate();
    getDashboardTimeline(date)
      .then((tl) => setTimeline(tl))
      .catch(() => {});
  }, []);

  const refreshSessionState = useCallback(() => {
    setSessionError(null);
    setSessionStatus("checking");
    setSessionCommand("checking");
    setWebcamVisible(true);
  }, []);

  // 확장 프로그램이 타임라인을 저장하면 content script가 ANJAVA_TIMELINE_POSTED를 릴레이
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "ANJAVA_TIMELINE_POSTED") refreshTimeline();
      if (e.data?.type === "ANJAVA_SESSION_CHANGED") {
        refreshSessionState();
        refreshDashboardDataSoon();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refreshTimeline, refreshDashboardDataSoon, refreshSessionState]);

  const handleSessionActiveChange = useCallback((active: boolean, reason?: "paused" | "stopped") => {
    sessionActiveRef.current = active;
    sessionStateChangedAtRef.current = Date.now();
    if (!active && reason === "stopped") {
      lastReportedDetectionStateRef.current = null;
      setLiveDetection(null);
    }
  }, []);

  const handleSessionControlStateChange = useCallback((state: SessionControlState, error?: string) => {
    setSessionStatus(state);
    setSessionCommand(state);
    setSessionError(error ?? null);
  }, []);

  const requestSessionState = useCallback((state: Exclude<SessionControlState, "checking">) => {
    setSessionError(null);
    setSessionStatus("checking");
    setSessionCommand(state);
    if (state === "running") setWebcamVisible(true);
  }, []);

  const handleAuthenticationExpired = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  const handleDetectionStateChange = useCallback((state: DetectionState, message: string) => {
    if (!sessionActiveRef.current) {
      return;
    }
    if (lastReportedDetectionStateRef.current !== state) {
      lastReportedDetectionStateRef.current = state;
      setLiveDetection({
        state,
        message,
        updatedAt: new Date().toLocaleTimeString("en-GB", {
          timeZone: "Asia/Seoul",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }
  }, []);

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

  async function enableNotifications() {
    if (notificationPermissionPending) return;
    setNotificationPermissionPending(true);
    try {
      const result = await syncWebPushToken({ requestPermission: true });
      setNotificationPermission(
        typeof Notification === "undefined" ? "unsupported" : Notification.permission,
      );
      if (!result.ok) {
        console.warn("[push] 알림 활성화 실패:", result.reason);
      }
    } finally {
      setNotificationPermissionPending(false);
    }
  }

  useEffect(() => {
    const updateNotificationPermission = () => setNotificationPermission(
      typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    );
    updateNotificationPermission();
    window.addEventListener("focus", updateNotificationPermission);
    if (!getAccessToken()) {
      clearTokens();
      router.replace("/login");
      return () => window.removeEventListener("focus", updateNotificationPermission);
    }

    let cancelled = false;
    void getMe()
      .then((m) => {
        if (cancelled) return;
        setMe(m);
        setDarkMode(m.settings.darkDetectionEnabled);
        void getBadges().then((b) => {
          if (!cancelled) setBadges(b.slice(0, 3));
        }).catch(() => {});
        void loadDashboardData();
        pollRef.current = setInterval(loadDashboardData, 120_000);
      })
      .catch(() => {
        if (cancelled) return;
        clearTokens();
        router.replace("/login");
      });

    return () => {
      window.removeEventListener("focus", updateNotificationPermission);
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [loadDashboardData, router]);

  // ── 파생 데이터 ────────────────────────────────────────

  // 일일 슬롯 차트 (8개 slots, 데이터 없으면 더미)
  const slots = serverDailySlots;
  const hasDailyDurationData = slots.some((slot) => slot.hasDurationData);

  // 서버 값 직접 사용
  const rawScore: number | null = firstFiniteNumber(today?.postureScore, today?.healthScore);
  const healthScore = rawScore ?? 0;
  const warningCount = firstFiniteNumber(today?.warningCount) ?? 0;

  // 총 이벤트 수
  const totalEventCount = slots.reduce(
    (s, sl) => s + sl.goodPostureCount + sl.singleBadCount + sl.overlappingCount,
    0,
  );
  const measuredPostureCount = slots.reduce(
    (s, sl) => s + sl.singleBadCount + sl.overlappingCount,
    0,
  );

  const todayIssueEntries = [
    { key: "turtleNeckCount", count: toFiniteNumber(today?.breakdown?.turtleNeckCount) },
    { key: "roundShoulderCount", count: toFiniteNumber(today?.breakdown?.roundShoulderCount) },
    { key: "shoulderAsymmetryCount", count: toFiniteNumber(today?.breakdown?.shoulderAsymmetryCount) },
    { key: "shoulderIssueCount", count: toFiniteNumber(today?.breakdown?.shoulderIssueCount) },
    { key: "darkEnvCount", count: toFiniteNumber(today?.breakdown?.darkEnvCount) },
  ];
  const todayBreakdownTotal = todayIssueEntries.reduce((sum, item) => sum + item.count, 0);
  const topTodayIssue = todayIssueEntries.reduce((top, item) =>
    item.count > top.count ? item : top
  , todayIssueEntries[0]);
  const todayWarningLabel =
    topTodayIssue.count > 0 && todayBreakdownTotal >= warningCount
      ? ISSUE_LABEL[topTodayIssue.key] ?? "자세 경고"
      : "자세 경고";
  const busiestSlot = slots.reduce<{ label: string; count: number }>((top, slot) => {
    const count = slot.singleBadCount + slot.overlappingCount;
    const label = `${String(slot.startHour).padStart(2, "0")}~${String((slot.startHour + 3) % 24).padStart(2, "0")}시`;
    return count > top.count ? { label, count } : top;
  }, { label: "—", count: 0 });
  const hasTodayData = hasDailyDurationData || totalEventCount > 0 || Boolean(today?.warningCount !== undefined);
  const todaySummaryText =
    warningCount > 0
      ? `오늘 ${todayWarningLabel} ${warningCount}회, 집중 시간대 ${busiestSlot.count > 0 ? busiestSlot.label : "분석 중"}`
      : hasTodayData
      ? "오늘 자세 경고 없이 안정적으로 감지 중입니다."
      : "오늘 감지 데이터가 쌓이면 요약이 표시됩니다.";

  // 최근 활동 (타임라인 버킷 → 현재 시각 이전, 실제 감지 데이터만)
  const kstNow = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
  const [kstH, kstM] = kstNow.split(":").map(Number);
  const nowMin = kstH * 60 + kstM;
  const timelineActivity = timeline?.buckets
    .filter((b) => {
      // 신 API: time="09:00" / 구 API: startHour+startMin
      const bMin = b.time
        ? (() => { const [h, m] = b.time.split(":").map(Number); return h * 60 + m; })()
        : ((b.startHour ?? 0) * 60 + (b.startMin ?? 0));
      return bMin <= nowMin && STATE_LABEL[b.dominantState] !== undefined;
    })
    .reverse() ?? [];
  const recentActivity = timelineActivity.filter((bucket, index, buckets) => {
    const key = bucket.eventId ?? `${bucket.time ?? `${bucket.startHour}:${bucket.startMin}`}-${bucket.dominantState}`;
    return buckets.findIndex((candidate) =>
      (candidate.eventId ?? `${candidate.time ?? `${candidate.startHour}:${candidate.startMin}`}-${candidate.dominantState}`) === key
    ) === index;
  });

  // 비교 통계 (null이면 데이터 없음)
  const yDiff = firstFiniteNumber(today?.vsYesterday);
  const wDiff = firstFiniteNumber(today?.vsLastWeek);

  // 주간 통계 (서버 값 직접 사용)
  const turtleSec = toFiniteNumber(weekly?.turtleNeckTotalSec);
  const roundShoulderSec = toFiniteNumber(weekly?.roundShoulderTotalSec);
  const asymSec = toFiniteNumber(weekly?.shoulderAsymmetryTotalSec);
  const darkSec = toFiniteNumber(weekly?.darkEnvTotalSec);
  const badPostureSec = weekly
    ? toFiniteNumber(weekly.badPostureSec, turtleSec + roundShoulderSec + asymSec)
    : 0;
  const weeklyScreenSec: number | null = weekly ? toFiniteNumber(weekly.totalDetectionSec) : null;
  const weeklyGoodSec: number | null = weekly ? toFiniteNumber(weekly.goodPostureSec) : null;
  const weeklyRiskPct = weekly ? clampPercent(Math.round(toFiniteNumber(weekly.riskPercent))) : 0;
  const unclassifiedSec: number | null = weekly ? toFiniteNumber(weekly.unclassifiedSec) : null;
  const weeklyGoodPct = weekly ? clampPercent(Math.round(toFiniteNumber(weekly.goodPostureRatio) * 100)) : 0;

  // 주간 선형 차트 값
  const mondayKST = getMondayKST();
  const todayKST = getKSTDate();
  const weeklyDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${mondayKST}T00:00:00+09:00`);
    date.setDate(date.getDate() + i);
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
    const isFuture = dateKey > todayKST;
    const day = isFuture ? undefined : weekly?.days.find((item) => item.date === dateKey);
    const hasData = !isFuture && Boolean(day?.hasData);
    return {
      date: dateKey,
      isFuture,
      hasData,
      badPostureRatio: hasData && day ? toFiniteNumber(day.badPostureRatio) : null,
      hasDetectionData: hasData,
      totalDetectionSec: day ? toFiniteNumber(day.totalDetectionSec) : 0,
      goodPostureSec: day ? toFiniteNumber(day.goodPostureSec) : 0,
      unclassifiedSec: day ? toFiniteNumber(day.unclassifiedSec) : 0,
      hasExplicitGoodPostureData: Boolean(day?.hasExplicitGoodPostureData),
      turtleNeckSec: day ? toFiniteNumber(day.turtleNeckSec) : 0,
      roundShoulderSec: day ? toFiniteNumber(day.roundShoulderSec) : 0,
      shoulderAsymmetrySec: day ? toFiniteNumber(day.shoulderAsymmetrySec) : 0,
      darkEnvSec: day ? toFiniteNumber(day.darkEnvSec) : 0,
    };
  });
  const weeklyBadValues = weeklyDays.map((d) =>
    !d.hasData || d.badPostureRatio === null
      ? null
      : clampPercent(d.badPostureRatio * 100),
  );
  const weeklyDateRangeLabel = weekly?.from && weekly?.to
    ? `${formatMonthDay(weekly.from)}~${formatMonthDay(weekly.to)}`
    : `${formatMonthDay(mondayKST)}~${formatMonthDay(todayKST)}`;
  const weeklyAvgBadPct = weeklyRiskPct;
  const worstWeekday =
    weekly?.worstWeekday ||
    weeklyDays.reduce<{ index: number; value: number } | null>((worst, day, index) => {
      if (!day.hasData || day.badPostureRatio === null) return worst;
      const value = day.badPostureRatio;
      return !worst || value > worst.value ? { index, value } : worst;
    }, null);
  const worstWeekdayLabel =
    typeof worstWeekday === "string"
      ? WEEKDAY_KR[worstWeekday] ?? "—"
      : worstWeekday
      ? WEEK_LABELS[worstWeekday.index]
      : "—";
  const liveIsGood = liveDetection?.state === "GOOD_POSTURE";
  const liveIsBad = Boolean(liveDetection && !liveIsGood);
  const liveJudgementText = liveDetection
    ? liveIsGood
      ? "정상"
      : "교정 필요"
    : rawScore !== null && healthScore >= 70
    ? "정상"
    : "분석 중";
  const liveStatusTone = liveDetection
    ? liveIsGood
      ? { text: "양호", sentence: "양호합니다", color: "text-emerald-500", ring: "ring-emerald-300" }
      : { text: "주의 필요", sentence: "주의가 필요합니다", color: "text-rose-500", ring: "ring-rose-300" }
    : rawScore !== null
    ? healthScore >= 70
      ? { text: "양호", sentence: "양호합니다", color: "text-emerald-500", ring: "ring-emerald-300" }
      : healthScore >= 40
      ? { text: "보통", sentence: "보통입니다", color: "text-amber-500", ring: "ring-amber-300" }
      : { text: "주의 필요", sentence: "주의가 필요합니다", color: "text-rose-500", ring: "ring-rose-300" }
    : { text: "분석 중", sentence: "분석 중입니다", color: "text-zinc-400", ring: "ring-zinc-200" };
  const liveJudgementTone =
    liveJudgementText === "정상"
      ? { dot: "bg-emerald-400", color: "text-emerald-500" }
      : liveJudgementText === "분석 중"
      ? { dot: "bg-zinc-300", color: "text-zinc-400" }
      : { dot: "bg-rose-400", color: "text-rose-500" };
  const avatarStatusText = liveDetection
    ? liveIsGood
      ? "정확한 자세입니다 ✅"
      : `${STATE_LABEL[liveDetection.state] ?? "자세 이상 발생"}`
    : sessionStatus === "stopped"
    ? "세션을 시작해주세요."
    : rawScore !== null
    ? healthScore >= 60
      ? "정확한 자세입니다 ✅"
      : "자세를 교정해주세요 ⚠️"
    : "자세 데이터 수집 중...";

  if (!me) {
    return (
      <div className="min-h-dvh bg-zinc-50 px-3 py-2 sm:px-4 sm:py-3">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-2 h-6 w-40 animate-pulse rounded-full bg-zinc-100" />
          <div className="grid grid-cols-12 gap-2">
            {[3, 5, 4, 2, 6, 4, 3, 9].map((span, i) => (
              <div key={i} className={`col-span-12 h-44 animate-pulse rounded-2xl bg-zinc-100 sm:col-span-6 lg:col-span-${span}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh overflow-y-auto bg-zinc-50 px-3 pb-1 pt-[3px] transition-colors duration-300 sm:px-4 sm:pb-2 sm:pt-[3px] lg:h-dvh lg:overflow-hidden lg:pb-[0.35vh] lg:pt-[3px]">
      <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col lg:h-full lg:min-h-0">
        {me.settings.pushEnabled && notificationPermission === "default" && (
          <div className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <span>백그라운드 자세 알림을 받으려면 브라우저 알림 권한이 필요합니다.</span>
            <button
              type="button"
              onClick={enableNotifications}
              disabled={notificationPermissionPending}
              className="shrink-0 rounded-md bg-[#2563EB] px-3 py-1.5 font-semibold text-white disabled:opacity-60"
            >
              {notificationPermissionPending ? "요청 중..." : "알림 허용"}
            </button>
          </div>
        )}
        {me.settings.pushEnabled && notificationPermission === "denied" && (
          <div className="mb-2 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-semibold">알림이 차단되어 있습니다.</span>
            {" "}주소창 왼쪽 🔒 아이콘 → 알림 → 허용으로 변경한 후 페이지를 새로고침하세요.
          </div>
        )}
        <div className="grid min-h-0 flex-1 grid-cols-12 gap-2 overflow-visible lg:grid-rows-[minmax(180px,0.88fr)_minmax(165px,0.72fr)_minmax(215px,1.12fr)] lg:gap-x-2 lg:gap-y-2 lg:overflow-hidden">

          {/* ── Row 1 ── */}

          {/* 프로필 */}
          <Card className="col-span-12 flex min-h-0 flex-col sm:col-span-6 lg:col-span-3 lg:h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-3xl">
                  {me?.profileImg ? (
                    <Image
                      src={me.profileImg}
                      className="h-16 w-16 object-cover"
                      alt="프로필"
                      width={64}
                      height={64}
                      unoptimized
                    />
                  ) : "🌿"}
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
          <Card className="col-span-12 flex min-h-0 flex-col overflow-hidden sm:col-span-6 lg:col-span-5 lg:h-full">
            <div className="flex shrink-0 items-start justify-between">
              <div>
                <div className="text-xs font-bold text-zinc-900">타임라인</div>
                <div className="mt-0.5 text-[10px] text-zinc-400">오늘 감지 이력을 확인해보세요.</div>
              </div>
            </div>

            {recentActivity.length > 0 ? (
              <ul className="mt-2 max-h-40 flex-1 space-y-1.5 overflow-y-auto pr-1 [scrollbar-color:#a1a1aa_transparent] [scrollbar-width:thin]">
                {recentActivity.map((b, i) => {
                  const timeStr = b.time ?? `${String(b.startHour ?? 0).padStart(2,"0")}:${String(b.startMin ?? 0).padStart(2,"0")}`;
                  const isGoodState = b.dominantState === "GOOD" || b.dominantState === "GOOD_POSTURE";
                  const icon =
                    isGoodState
                      ? "✅"
                      : b.dominantState === "DARK_ENV"
                      ? "🌙"
                      : "⚠️";
                  const dotColor =
                    isGoodState
                      ? "bg-emerald-400"
                      : b.dominantState === "DARK_ENV"
                      ? "bg-zinc-400"
                      : "bg-amber-400";
                  const label = `${STATE_LABEL[b.dominantState] ?? "자세 이상 발생"} ${icon}`;
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
          <Card className="col-span-12 flex min-h-0 flex-col px-2 py-2 sm:col-span-6 sm:px-2.5 sm:py-2.5 lg:col-span-4 lg:h-full">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-bold text-zinc-900">실시간 카메라</div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${
                  sessionStatus === "running"
                    ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
                    : sessionStatus === "paused"
                    ? "bg-amber-50 text-amber-600 ring-amber-200"
                    : "bg-zinc-50 text-zinc-500 ring-zinc-200"
                }`}>
                  {sessionStatus === "running"
                    ? "감지 중"
                    : sessionStatus === "paused"
                    ? "일시정지"
                    : sessionStatus === "checking"
                    ? "처리 중"
                    : "세션 없음"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {sessionStatus === "stopped" && (
                  <button
                    type="button"
                    onClick={() => requestSessionState("running")}
                    className="h-8 rounded-lg bg-[#2563EB] px-3 text-[11px] font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                  >
                    세션 시작
                  </button>
                )}
                {sessionStatus === "running" && (
                  <button
                    type="button"
                    onClick={() => requestSessionState("paused")}
                    className="h-8 rounded-lg bg-white px-3 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  >
                    일시정지
                  </button>
                )}
                {sessionStatus === "paused" && (
                  <button
                    type="button"
                    onClick={() => requestSessionState("running")}
                    className="h-8 rounded-lg bg-emerald-500 px-3 text-[11px] font-bold text-white shadow-sm shadow-emerald-100 transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                  >
                    재개
                  </button>
                )}
                {(sessionStatus === "running" || sessionStatus === "paused") && (
                  <button
                    type="button"
                    onClick={() => requestSessionState("stopped")}
                    className="h-8 rounded-lg bg-white px-3 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                  >
                    종료
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setWebcamVisible((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-50 text-zinc-400 ring-1 ring-zinc-100 transition hover:text-[#2563EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
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
            </div>
            {sessionError && <div role="alert" className="mt-1 text-[9px] text-rose-500">{sessionError}</div>}
            <div className="relative mt-1 min-h-[240px] flex-1 overflow-hidden rounded-xl sm:min-h-[280px] lg:min-h-0">
              <WebcamView
                darkDetectionEnabled={darkMode}
                pushEnabled={me?.settings?.pushEnabled ?? true}
                soundEnabled={me?.settings?.soundEnabled ?? true}
                onSessionActiveChange={handleSessionActiveChange}
                onAuthenticationExpired={handleAuthenticationExpired}
                onDetectionStateChange={handleDetectionStateChange}
                onDashboardDataChanged={refreshDashboardDataSoon}
                onTimelinePosted={refreshTimeline}
                sessionControlState={sessionCommand}
                onSessionControlStateChange={handleSessionControlStateChange}
              />
              {sessionStatus === "paused" && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <span className="rounded-full bg-amber-500/90 px-3 py-1 text-[10px] font-semibold text-white shadow-sm">감지 일시정지됨</span>
                </div>
              )}
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
          <Card className="col-span-12 flex min-h-0 flex-col overflow-hidden sm:col-span-6 lg:col-span-2">
            <div className="-mt-4 flex min-h-0 flex-col items-center">
              <div className="flex h-32 w-full shrink-0 justify-center overflow-hidden lg:h-28 xl:h-32">
                <AvatarColored
                  hoodColorId={me?.settings?.avatarHoodColor ?? "default"}
                  className="avatar-float h-full w-auto max-w-full"
                />
              </div>
              <button className={`-mt-0.5 w-full shrink-0 rounded-full py-1 text-[10px] font-semibold ring-1 transition ${
                liveIsGood
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-200 hover:bg-emerald-100"
                  : liveIsBad
                  ? "bg-rose-50 text-rose-600 ring-rose-200 hover:bg-rose-100"
                  : rawScore !== null && healthScore > 0
                  ? healthScore >= 60
                    ? "bg-emerald-50 text-emerald-600 ring-emerald-200 hover:bg-emerald-100"
                    : "bg-amber-50 text-amber-600 ring-amber-200 hover:bg-amber-100"
                  : "bg-zinc-50 text-zinc-500 ring-zinc-200 hover:bg-zinc-100"
              }`}>
                {avatarStatusText}
              </button>
              <div className="mt-1.5 w-full shrink-0 rounded-lg px-2.5 py-1.5 text-center ring-1 ring-zinc-100">
                <div className="text-[9px] font-semibold text-zinc-400">실시간 감지 상태</div>
                <div className={`mt-0.5 text-[11px] font-bold ${
                  liveIsGood
                    ? "text-emerald-500"
                    : liveIsBad
                    ? "text-rose-500"
                    : "text-zinc-400"
                }`}>
                  {liveDetection ? (STATE_LABEL[liveDetection.state] ?? liveDetection.state) : sessionStatus === "stopped" ? "세션을 시작해주세요." : "분석 대기 중"}
                </div>
                {liveDetection?.message ? (
                  <div className="mt-0.5 truncate text-[9px] text-zinc-500">{liveDetection.message}</div>
                ) : null}
                <div className="mt-0.5 text-[8px] text-zinc-300">
                  {liveDetection ? `${liveDetection.updatedAt} 갱신` : sessionStatus === "stopped" ? "" : "웹캠 연결 후 자동 갱신"}
                </div>
              </div>
            </div>
          </Card>

          {/* 일간 스크린타임 */}
          <Card className="col-span-12 flex min-h-0 flex-col overflow-hidden lg:col-span-6">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="text-xs font-bold text-zinc-900">일간 스크린타임</div>
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px]">
                {hasDailyDurationData ? (
                  <>
                    <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />정상</span>
                    <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />거북목</span>
                    <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />라운드숄더</span>
                    <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />비대칭</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />양호</span>
                    <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />경고</span>
                    <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />위험</span>
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-stretch gap-3">
              {/* 좌측: 오늘 감지 시간 또는 자세 측정 수 */}
              <div className="flex shrink-0 flex-col justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-zinc-900">
                    {hasDailyDurationData
                      ? formatDuration(slots.reduce((s, sl) => s + sl.totalDetectionSec, 0))
                      : measuredPostureCount}
                  </span>
                  {!hasDailyDurationData && <span className="text-[10px] text-zinc-500">건</span>}
                </div>
                <div className="translate-y-1 text-[9px] text-zinc-400">
                  {hasDailyDurationData ? "오늘 감지" : "자세 측정"}
                </div>
              </div>

              {/* 우측: 스택 바 차트 (8개 slots) */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-24 items-end justify-around gap-1.5 border-b border-zinc-200 pb-1">
                  {slots.map((slot, i) => {
                    if (slot.hasDurationData) {
                      const issueSec = slot.turtleNeckSec + slot.roundShoulderSec + slot.shoulderAsymmetrySec;
                      const categorizedSec = slot.goodPostureSec + issueSec + slot.darkEnvSec + slot.unclassifiedSec;
                      const totalSec = Math.max(slot.totalDetectionSec, categorizedSec);
                      const pct = (sec: number) => totalSec > 0 ? clampPercent((sec / totalSec) * 100) : 0;
                      const otherSec = Math.max(
                        slot.darkEnvSec + slot.unclassifiedSec,
                        totalSec - slot.goodPostureSec - issueSec,
                      );
                      return (
                        <div key={i} className="flex h-full w-4 flex-col justify-end">
                          <div className="flex h-full w-full flex-col overflow-hidden rounded-full bg-zinc-200">
                            <div className="bg-zinc-300" style={{ height: `${pct(otherSec)}%` }} />
                            <div className="bg-emerald-400" style={{ height: `${pct(slot.goodPostureSec)}%` }} />
                            <div className="bg-rose-400" style={{ height: `${pct(slot.turtleNeckSec)}%` }} />
                            <div className="bg-amber-400" style={{ height: `${pct(slot.roundShoulderSec)}%` }} />
                            <div className="bg-violet-400" style={{ height: `${pct(slot.shoulderAsymmetrySec)}%` }} />
                          </div>
                        </div>
                      );
                    }
                    const total = slot.goodPostureCount + slot.singleBadCount + slot.overlappingCount;
                    const goodH = total > 0 ? (slot.goodPostureCount / total) * 100 : 0;
                    const singleH = total > 0 ? (slot.singleBadCount / total) * 100 : 0;
                    const overH = total > 0 ? (slot.overlappingCount / total) * 100 : 0;
                    const hasData = total > 0;
                    return (
                      <div key={i} className="flex h-full w-4 flex-col justify-end">
                        <div className="flex h-full w-full flex-col overflow-hidden rounded-full">
                          <div className="bg-zinc-200" style={{ height: hasData ? `${Math.max(0, 100 - goodH - singleH - overH)}%` : "100%" }} />
                          <div className="bg-emerald-400" style={{ height: `${goodH}%` }} />
                          <div className="bg-amber-400" style={{ height: `${singleH}%` }} />
                          <div className="bg-rose-400" style={{ height: `${overH}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-around text-[8px] text-zinc-400">
                  {["0시", "3시", "6시", "9시", "12시", "15시", "18시", "21시"].map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* 오늘의 건강 점수 */}
          <Card className="col-span-12 flex min-h-0 flex-col overflow-hidden sm:col-span-6 lg:col-span-4 lg:h-full lg:self-end">
            <div className="mt-0 flex items-center justify-between gap-2">
              <div className="shrink-0 text-sm font-bold text-zinc-900">오늘의 건강 점수</div>
              <div className="min-w-0 truncate rounded-full bg-[#2563EB]/5 px-2.5 py-1 text-[10px] font-semibold text-[#2563EB] ring-1 ring-[#2563EB]/15">
                {todaySummaryText}
              </div>
            </div>

            <div className="mt-1 flex items-start justify-between gap-1">
              {/* 좌측 리스트 */}
              <div className="ml-[10px] mt-0 w-[146px] shrink-0 space-y-0.5 pt-1 text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-zinc-700"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />자세 점수</span>
                  <span className="text-[11px] font-bold text-emerald-500">{rawScore !== null ? healthScore : "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-zinc-700"><span className="inline-block h-2 w-2 rounded-full bg-rose-400" />자세 경고 총 횟수</span>
                  <span className="text-[11px] font-bold text-rose-500">
                    {warningCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-zinc-700"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />상태 판정</span>
                  <span className="text-[11px] font-bold text-amber-500">
                    {today ? (healthScore >= 40 ? 0 : 10) : 0}
                  </span>
                </div>
              </div>

              {/* 도넛 차트 (단색) */}
              <div className="relative -mt-3 mr-[10px] shrink-0">
                {(() => {
                  const size = 116;
                  const r = 38;
                  const circ = 2 * Math.PI * r;
                  const gapDeg = 60;
                  const usable = circ * (1 - gapDeg / 360);
                  const score = healthScore;
                  const goodLen = usable * (score / 100);
                  const badLen = usable - goodLen;
                  const gapLen = circ * (gapDeg / 360);
                  const rotation = 90 + gapDeg / 2;
                  return (
                    <svg width={size} height={size} viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r={r} fill="none" stroke="#f4f4f5" strokeWidth="15" strokeLinecap="round" strokeDasharray={`${usable} ${gapLen}`} transform={`rotate(${rotation} 60 60)`} />
                      {goodLen > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke="#4ade80" strokeWidth="15" strokeLinecap="round" strokeDasharray={`${goodLen} ${circ}`} transform={`rotate(${rotation} 60 60)`} />}
                      {badLen > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke="#f87171" strokeWidth="15" strokeLinecap="round" strokeDasharray={`${badLen} ${circ}`} strokeDashoffset={-goodLen} transform={`rotate(${rotation} 60 60)`} />}
                    </svg>
                  );
                })()}
                <span className="absolute left-0 top-0 flex h-[116px] w-[116px] items-center justify-center text-3xl font-bold leading-none text-zinc-900">
                  {rawScore !== null ? healthScore : "—"}
                </span>
              </div>
            </div>

            {/* 비교 통계 */}
            {(() => {
              const fmt = (n: number | null) =>
                n === null ? "—" : n > 0 ? `+${n}% 향상` : n < 0 ? `${n}% 하락` : "변동 없음";
              const color = (n: number | null) =>
                n === null ? "text-zinc-300" : n > 0 ? "text-[#2563EB]" : n < 0 ? "text-rose-500" : "text-zinc-500";
              return (
                <div className="-mt-1 grid grid-cols-2 gap-2 border-t border-zinc-200 pt-1">
                  <div className="text-center">
                    <div className="text-[10px] text-zinc-400">어제 대비</div>
                    <div className={`mt-0.5 text-xs font-bold ${color(yDiff)}`}>{fmt(yDiff)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-zinc-400">지난주 대비</div>
                    <div className={`mt-0.5 text-xs font-bold ${color(wDiff)}`}>{fmt(wDiff)}</div>
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* ── Row 3 ── */}

          {/* 실시간 감지 상태 + 어둠 감지 모드 */}
          <div className="col-span-12 flex h-full w-full flex-col gap-2 sm:col-span-6 lg:col-span-2">
            <Card className="flex min-h-0 w-full flex-1 flex-col">
              <div className="text-xs font-bold text-zinc-900">실시간 감지 상태</div>

              {/* 종합 상태 메시지 */}
              <div className={`mt-1.5 rounded-full px-3 py-1.5 text-center text-[11px] font-semibold ring-2 ${liveStatusTone.color} ${liveStatusTone.ring}`}>
                {me?.name ?? "사용자"}님의 상태는 {liveStatusTone.sentence}.
              </div>

              {/* 감지 항목 리스트 */}
              <ul className="mt-1.5 space-y-1">
                <li className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-zinc-700">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${liveJudgementTone.dot}`} />
                    자세 경고 총 횟수
                  </span>
                  <span className="text-[10px] font-semibold text-rose-500">{warningCount}</span>
                </li>
                <li className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-zinc-700">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${liveJudgementTone.dot}`} />
                    상태 판정
                  </span>
                  <span className={`text-[10px] font-medium ${liveJudgementTone.color}`}>{liveJudgementText}</span>
                </li>
              </ul>
            </Card>

            {/* 어둠 속 코딩 감지 모드 */}
            <Card className="w-full shrink-0 py-2.5">
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
          <Card className="col-span-12 flex min-h-0 flex-col overflow-hidden sm:col-span-6 lg:col-span-10">
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-zinc-900">이번 주 누적 스크린타임</div>
              </div>
              <div className="rounded-full bg-zinc-50 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-100">
                {weeklyDateRangeLabel} · 오늘까지
              </div>
            </div>

            <div className="mt-1 grid shrink-0 grid-cols-2 gap-1 lg:grid-cols-5">
              <div className="col-span-2 rounded-xl bg-[#2563EB]/5 px-2.5 py-1 ring-1 ring-[#2563EB]/15 lg:col-span-1">
                <div className="text-[9px] font-medium leading-tight text-[#2563EB]">총 감지 스크린타임</div>
                <div className="text-base font-bold leading-tight text-zinc-900">{formatDuration(weeklyScreenSec)}</div>
                <div className="text-[8px] leading-tight text-zinc-400">{weeklyScreenSec === null ? "데이터 수집 중" : `자세 경고 비율 ${weeklyRiskPct}%`}</div>
              </div>
              <WeeklyMetric label="정자세 시간" value={formatDuration(weeklyGoodSec)} tone="good" />
              <WeeklyMetric label="자세 경고 시간" value={formatDuration(badPostureSec)} tone="bad" />
              <WeeklyMetric label="기타/미분류 시간" value={formatDuration(unclassifiedSec)} tone="dark" />
              <WeeklyMetric label="어둠 감지 시간" value={formatDuration(darkSec)} tone="dark" />
            </div>

            <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-1 gap-1.5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="flex min-h-0 flex-col justify-start rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
                <div className="grid grid-cols-3 gap-2">
                  <WeeklyCompactStat label="자세 경고 비율" value={`${weeklyAvgBadPct}%`} tone="bad" />
                  <WeeklyCompactStat label="정자세 비율" value={`${weeklyGoodPct}%`} tone="good" />
                  <WeeklyCompactStat label="주의 요일" value={worstWeekdayLabel} tone="dark" />
                </div>
                <div className="mt-2 space-y-1">
                  <div className="px-0.5 text-[10px] font-semibold leading-tight text-zinc-500">자세 경고 유형별 비중</div>
                  {weekly === null ? (
                    <div className="space-y-1 py-1">
                      {[1,2,3].map((k) => <div key={k} className="h-8 animate-pulse rounded-lg bg-zinc-100" />)}
                    </div>
                  ) : badPostureSec === 0 ? (
                    <div className="flex min-h-[92px] items-center justify-center rounded-lg bg-white px-3 py-3 text-center text-[11px] font-medium text-zinc-400 ring-1 ring-zinc-100">이번 주 자세 경고 데이터가 없습니다</div>
                  ) : (
                    <>
                      <IssueBar label="거북목" sec={turtleSec} totalSec={badPostureSec} color="bg-rose-400" />
                      <IssueBar label="라운드 숄더" sec={roundShoulderSec} totalSec={badPostureSec} color="bg-amber-400" />
                      <IssueBar label="자세 비대칭" sec={asymSec} totalSec={badPostureSec} color="bg-violet-400" />
                    </>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-col rounded-xl px-2.5 py-1.5 ring-1 ring-zinc-100">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-[9px] font-semibold text-zinc-500">요일별 자세 시간 구성 <span className="font-normal text-zinc-400">(상단 숫자: 해당 요일의 자세 경고 시간 비율)</span></div>
                  <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[8px] text-zinc-400">
                    <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />정상</span>
                    <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />거북목</span>
                    <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />라운드숄더</span>
                    <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />비대칭</span>
                    <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />기타</span>
                  </div>
                </div>
                {(() => {
                  const values = weeklyBadValues;
                  const dayLabels = WEEK_LABELS;
                  return (
                    <div className="relative grid min-h-0 flex-1 grid-cols-7 items-stretch gap-2">
                      {weekly !== null && !weeklyDays.some(d => d.hasData) && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="rounded-full bg-zinc-50/90 px-2 py-1 text-[9px] text-zinc-400">이번 주 감지 데이터가 아직 없습니다</span>
                        </div>
                      )}
                      {values.map((value, i) => {
                        const isFuture = weeklyDays[i]?.isFuture;
                        const hasValue = value !== null;
                        const dayTotalSec = weeklyDays[i]?.totalDetectionSec ?? 0;
                        const dayGoodSec = weeklyDays[i]?.goodPostureSec ?? 0;
                        const dayUnclassifiedSec = weeklyDays[i]?.unclassifiedSec ?? 0;
                        const dayTurtleSec = weeklyDays[i]?.turtleNeckSec ?? 0;
                        const dayRoundSec = weeklyDays[i]?.roundShoulderSec ?? 0;
                        const dayAsymSec = weeklyDays[i]?.shoulderAsymmetrySec ?? 0;
                        const dayDarkSec = weeklyDays[i]?.darkEnvSec ?? 0;
                        const dayIssueSec = dayTurtleSec + dayRoundSec + dayAsymSec;
                        const dayCategorizedSec = dayGoodSec + dayIssueSec + dayDarkSec + dayUnclassifiedSec;
                        const chartTotalSec = Math.max(dayTotalSec, dayCategorizedSec);
                        const hasDayBreakdown = chartTotalSec > 0 && dayCategorizedSec > 0;
                        const goodH = hasDayBreakdown
                          ? clampPercent((dayGoodSec / chartTotalSec) * 100)
                          : 0;
                        const turtleH = !hasValue
                          ? 0
                          : hasDayBreakdown
                          ? clampPercent((dayTurtleSec / chartTotalSec) * 100)
                          : 0;
                        const roundH = !hasValue
                          ? 0
                          : hasDayBreakdown
                          ? clampPercent((dayRoundSec / chartTotalSec) * 100)
                          : 0;
                        const asymH = !hasValue
                          ? 0
                          : hasDayBreakdown
                          ? clampPercent((dayAsymSec / chartTotalSec) * 100)
                          : 0;
                        const otherSec = Math.max(
                          dayDarkSec + dayUnclassifiedSec,
                          chartTotalSec - dayGoodSec - dayIssueSec,
                        );
                        const otherH = hasDayBreakdown
                          ? clampPercent((otherSec / chartTotalSec) * 100)
                          : 0;
                        return (
                          <div key={dayLabels[i]} className="flex flex-col items-center gap-0.5 px-7">
                            <div className="h-3 text-[8px] font-semibold leading-none text-zinc-400">
                              {hasValue && !isFuture ? `경고 ${Math.round(value)}%` : ""}
                            </div>
                            <div className="flex w-full flex-1 flex-col-reverse overflow-hidden rounded-sm bg-zinc-100">
                              {isFuture ? null : !hasValue ? (
                                <div className="w-full bg-zinc-200" style={{ height: "8%" }} />
                              ) : (
                                <>
                                  {hasDayBreakdown ? (
                                    <>
                                      <div className="w-full bg-zinc-300 transition-all" style={{ height: `${otherH}%` }} />
                                      <div className="w-full bg-emerald-300 transition-all" style={{ height: `${goodH}%` }} />
                                      <div className="w-full bg-rose-400 transition-all" style={{ height: `${turtleH}%` }} />
                                      <div className="w-full bg-amber-400 transition-all" style={{ height: `${roundH}%` }} />
                                      <div className="w-full bg-violet-400 transition-all" style={{ height: `${asymH}%` }} />
                                    </>
                                  ) : value > 0 ? (
                                    <div className="w-full bg-rose-400 transition-all" style={{ height: `${value}%` }} />
                                  ) : null}
                                </>
                              )}
                            </div>
                            <span className={`mt-0.5 text-[9px] font-medium ${isFuture ? "text-zinc-300" : "text-zinc-500"}`}>
                              {dayLabels[i]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-zinc-100 sm:px-4 sm:py-3.5 lg:px-3 lg:py-2.5 ${className}`}>
      {children}
    </div>
  );
}

function WeeklyMetric({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "dark" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-500"
      : tone === "bad"
      ? "text-rose-500"
      : "text-zinc-700";
  return (
    <div className="rounded-xl px-2.5 py-1 ring-1 ring-zinc-100">
      <div className="text-[9px] leading-tight text-zinc-400">{label}</div>
      <div className={`text-[13px] font-bold leading-tight ${toneClass}`}>{value}</div>
    </div>
  );
}

function WeeklyCompactStat({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "dark" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-500"
      : tone === "bad"
      ? "text-rose-500"
      : "text-zinc-700";
  return (
    <div className="flex min-h-[46px] flex-col items-center justify-center rounded-lg bg-white px-1.5 text-center ring-1 ring-zinc-100">
      <div className="text-[10px] leading-tight text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-base font-bold leading-tight ${toneClass}`}>{value}</div>
    </div>
  );
}

function IssueBar({ label, sec, totalSec, color }: { label: string; sec: number; totalSec: number; color: string }) {
  const pct = totalSec > 0 ? clampPercent(Math.round((sec / totalSec) * 100)) : 0;
  return (
    <div className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-zinc-100">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[10px] leading-tight text-zinc-500">{label}</div>
        <div className="shrink-0 text-[10px] font-semibold leading-tight text-zinc-500">{pct}%</div>
      </div>
      <div className="mt-0.5 text-xs font-bold leading-tight text-zinc-900">{formatDuration(sec)}</div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
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
