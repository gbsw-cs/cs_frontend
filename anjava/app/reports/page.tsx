"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Cell, LabelList,
} from "recharts";
import {
  getCurrentReport,
  getReports,
  getReport,
  resendReport,
  type CurrentReport,
  type ReportListItem,
  type ReportDetail,
  type ReportStatus,
} from "../lib/api";

const STATUS_CONFIG: Record<ReportStatus, { label: string; cls: string }> = {
  PENDING: { label: "대기 중", cls: "bg-amber-50 text-amber-600 ring-1 ring-amber-200" },
  SENT:    { label: "발송 완료", cls: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200" },
  FAILED:  { label: "발송 실패", cls: "bg-rose-50 text-rose-500 ring-1 ring-rose-200" },
};

const ISSUE_LABELS: Record<string, string> = {
  TURTLE_NECK:        "거북목",
  ROUND_SHOULDER:     "라운드숄더",
  SHOULDER_ASYMMETRY: "어깨 비대칭",
  DARK_ENV:           "어둠 환경",
  GOOD_POSTURE:       "바른 자세",
};

const ISSUE_COLORS: Record<string, string> = {
  TURTLE_NECK:        "bg-rose-400",
  ROUND_SHOULDER:     "bg-amber-400",
  SHOULDER_ASYMMETRY: "bg-orange-400",
  DARK_ENV:           "bg-slate-400",
  GOOD_POSTURE:       "bg-emerald-400",
};

const ISSUE_BAR_COLORS: Record<string, string> = {
  TURTLE_NECK:        "#fb7185",
  ROUND_SHOULDER:     "#fbbf24",
  SHOULDER_ASYMMETRY: "#fb923c",
  DARK_ENV:           "#94a3b8",
  GOOD_POSTURE:       "#34d399",
};

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

function fmtDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  return `${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
}

function fmtSec(sec: number) {
  if (sec <= 0) return "0분";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function fmtDateTime(isoStr: string) {
  const d = new Date(isoStr);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mo}.${da} ${hh}:${mm}`;
}

function scoreLabel(score: number | null): { text: string; color: string; bg: string } {
  if (score === null) return { text: "데이터 없음", color: "text-zinc-500", bg: "bg-zinc-100" };
  if (score >= 90) return { text: "훌륭해요", color: "text-emerald-600", bg: "bg-emerald-50 ring-1 ring-emerald-200" };
  if (score >= 70) return { text: "좋음", color: "text-emerald-600", bg: "bg-emerald-50 ring-1 ring-emerald-200" };
  if (score >= 50) return { text: "보통", color: "text-amber-600", bg: "bg-amber-50 ring-1 ring-amber-200" };
  return { text: "개선 필요", color: "text-rose-600", bg: "bg-rose-50 ring-1 ring-rose-200" };
}

const MOCK_REPORT: CurrentReport = {
  weekStartDate: "2026-05-19",
  weekEndDate: "2026-05-25",
  session: { firstStartedAt: "2026-05-19T09:00:00Z", lastEndedAt: "2026-05-25T18:30:00Z", totalDetectionSec: 72000 },
  healthScore: { weekly: 74, daily: [68, 72, 80, 71, 76, 74, null] },
  timeline: [
    { date: "2026-05-19", startHour: 9, startMin: 0, dominantState: "TURTLE_NECK", healthScore: 68 },
    { date: "2026-05-20", startHour: 9, startMin: 30, dominantState: "GOOD_POSTURE", healthScore: 72 },
    { date: "2026-05-21", startHour: 10, startMin: 0, dominantState: "GOOD_POSTURE", healthScore: 80 },
    { date: "2026-05-22", startHour: 9, startMin: 0, dominantState: "ROUND_SHOULDER", healthScore: 71 },
    { date: "2026-05-23", startHour: 9, startMin: 15, dominantState: "GOOD_POSTURE", healthScore: 76 },
    { date: "2026-05-24", startHour: 10, startMin: 30, dominantState: "TURTLE_NECK", healthScore: 74 },
  ],
  topIssues: [
    { type: "TURTLE_NECK", durationSec: 5400, count: 18, rank: 1 },
    { type: "ROUND_SHOULDER", durationSec: 2700, count: 9, rank: 2 },
    { type: "SHOULDER_ASYMMETRY", durationSec: 900, count: 3, rank: 3 },
  ],
  aiSolution: "거북목이 주요 문제로 감지되었습니다. 모니터 높이를 눈높이에 맞게 조정하고, 1시간마다 목 스트레칭을 해보세요. 라운드숄더 예방을 위해 어깨를 뒤로 젖히는 운동도 추천드립니다.",
};

export default function ReportsPage() {
  const [current, setCurrent] = useState<CurrentReport | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [currentLoading, setCurrentLoading] = useState(true);
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    getCurrentReport()
      .then(setCurrent)
      .catch(() => {})
      .finally(() => setCurrentLoading(false));

    getReports()
      .then((r) => setReports(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : "데이터를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function handleView(id: string) {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await getReport(id);
      setDetail(d);
    } catch {
      showToast("리포트를 불러올 수 없습니다.");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleResend(id: string) {
    setResendingId(id);
    try {
      await resendReport(id);
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "PENDING" as ReportStatus } : r)),
      );
      showToast("재발송 요청이 완료되었습니다.");
    } catch (e) {
      showToast((e as Error).message ?? "재발송에 실패했습니다.");
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-[860px]">

        {/* Header */}
        <div className="mb-7 flex items-center gap-4">
          <Link
            href="/settings"
            aria-label="설정으로 돌아가기"
            className="group flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100 transition hover:bg-[#2563EB] hover:ring-[#2563EB]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 transition group-hover:text-white">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">주간 리포트</h1>
            <p className="mt-0.5 text-xs text-zinc-400">
              매주 월요일 자정에 지난 주 리포트가 자동으로 발송됩니다
            </p>
          </div>
        </div>

        {/* 이번 주 현황 */}
        <div className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
          {/* 카드 헤더 */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">이번 주 현황</div>
              {current && (
                <div className="mt-0.5 text-sm font-bold text-zinc-900">
                  {fmtDate(current.weekStartDate)} ~ {fmtDate(current.weekEndDate)}
                </div>
              )}
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-500 ring-1 ring-blue-100">
              진행 중
            </span>
          </div>

          {currentLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
              ))}
            </div>
          ) : !current ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-zinc-400">이번 주 감지 데이터가 없습니다</p>
              <button
                onClick={() => setShowSample((v) => !v)}
                className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-200"
              >
                {showSample ? "샘플 닫기" : "샘플로 미리보기"}
              </button>
              {showSample && <ReportDetailView detail={MOCK_REPORT} />}
            </div>
          ) : (
            <ReportDetailView detail={current} />
          )}
        </div>

        {/* 과거 리포트 목록 */}
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          발송된 리포트
        </div>
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
          {loading ? (
            <div className="divide-y divide-zinc-50">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-5">
                  <div className="space-y-2">
                    <div className="h-4 w-44 animate-pulse rounded bg-zinc-100" />
                    <div className="h-3 w-28 animate-pulse rounded bg-zinc-100" />
                  </div>
                  <div className="h-7 w-20 animate-pulse rounded-full bg-zinc-100" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-20 text-center">
              <div className="mb-3 text-4xl">⚠️</div>
              <div className="text-sm font-semibold text-zinc-500">리포트를 불러오지 못했습니다</div>
              <div className="mt-1.5 text-xs text-zinc-400">{error}</div>
            </div>
          ) : reports.length === 0 ? (
            <div className="py-20 text-center">
              <div className="mb-3 text-4xl">📭</div>
              <div className="text-sm font-semibold text-zinc-500">아직 발송된 리포트가 없습니다</div>
              <div className="mt-1.5 text-xs text-zinc-400">리포트는 매주 월요일 자정에 자동으로 발송돼요</div>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {reports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  onView={() => handleView(report.id)}
                  onResend={() => handleResend(report.id)}
                  resending={resendingId === report.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 상세 모달 */}
      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
        >
          <div
            className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
            style={{ maxHeight: "90vh" }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-7 py-5">
              <div>
                <div className="text-sm font-bold text-zinc-900">
                  {detail
                    ? `${fmtDate(detail.weekStartDate)} ~ ${fmtDate(detail.weekEndDate)}`
                    : "리포트 불러오는 중..."}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">주간 자세 리포트</div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto">
              {detailLoading ? (
                <div className="space-y-3 p-7">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
                  ))}
                </div>
              ) : detail ? (
                <ReportDetailView detail={detail} />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-zinc-900 px-5 py-3 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ─── ReportRow ─────────────────────────────────────────────── */
function ReportRow({
  report, onView, onResend, resending,
}: {
  report: ReportListItem;
  onView: () => void;
  onResend: () => void;
  resending: boolean;
}) {
  const status = STATUS_CONFIG[report.status];
  return (
    <div className="flex flex-col gap-3 px-6 py-5 transition hover:bg-zinc-50/60 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-zinc-900">
            {fmtDate(report.weekStartDate)} ~ {fmtDate(report.weekEndDate)}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${status.cls}`}>
            {status.label}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-400">
          <span>{report.deliveryWay === "EMAIL" ? "📧 이메일" : "📓 노션"}</span>
          {report.sentAt && <span>{fmtDateTime(report.sentAt)} 발송</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {report.status === "FAILED" && (
          <button
            onClick={onResend}
            disabled={resending}
            className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-100 disabled:opacity-50"
          >
            {resending ? "요청 중..." : "재발송"}
          </button>
        )}
        <button
          onClick={onView}
          className="flex items-center gap-1.5 rounded-xl bg-[#2563EB]/10 px-3.5 py-1.5 text-xs font-semibold text-[#2563EB] transition hover:bg-[#2563EB]/20"
        >
          상세 보기
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ─── ScoreLineChart (recharts) ─────────────────────────────── */
function ScoreLineChart({ data }: { data: (number | null)[] }) {
  const entries = DAYS.map((day, i) => ({
    day,
    score: data[i] !== null && data[i] !== undefined ? data[i] : undefined,
  }));
  return (
    <ResponsiveContainer width="100%" height={88}>
      <LineChart data={entries} margin={{ top: 14, right: 6, bottom: 0, left: -36 }}>
        <CartesianGrid stroke="#e4e4e7" strokeDasharray="2 2" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 8, fill: "#71717a" }} tickLine={false} axisLine={false} />
        <YAxis hide domain={["auto", "auto"]} />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#2563EB"
          strokeWidth={2}
          dot={{ r: 2.5, fill: "#2563EB", strokeWidth: 0 }}
          activeDot={{ r: 3.5 }}
          connectNulls={false}
          isAnimationActive={false}
          label={{ position: "top", fontSize: 7, fill: "#71717a", dy: -2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── ScoreBarChart (recharts) ──────────────────────────────── */
function ScoreBarChart({ data }: { data: (number | null)[] }) {
  const entries = DAYS.map((day, i) => ({
    day,
    score: data[i] !== null && data[i] !== undefined ? (data[i] as number) : 0,
    real: data[i] !== null && data[i] !== undefined,
  }));
  return (
    <ResponsiveContainer width="100%" height={88}>
      <BarChart data={entries} margin={{ top: 14, right: 6, bottom: 0, left: -36 }}>
        <XAxis dataKey="day" tick={{ fontSize: 8, fill: "#71717a" }} tickLine={false} axisLine={false} />
        <YAxis hide />
        <Bar dataKey="score" radius={[3, 3, 0, 0]} minPointSize={4} isAnimationActive={false}>
          {entries.map((e, i) => (
            <Cell
              key={i}
              fill={!e.real ? "#f4f4f5" : e.score >= 70 ? "#2563EB" : e.score >= 50 ? "#f59e0b" : "#f43f5e"}
            />
          ))}
          <LabelList
            dataKey="score"
            position="top"
            style={{ fontSize: "7px", fill: "#71717a" }}
            formatter={(v: unknown) => (typeof v === "number" && v > 0 ? v : "")}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── ReportDetailView ──────────────────────────────────────── */
function ReportDetailView({ detail }: { detail: CurrentReport }) {
  const daily = detail.healthScore?.daily ?? [];
  const validScores = daily.filter((s): s is number => s !== null && s !== undefined);
  const weekly = detail.healthScore?.weekly
    ?? (validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null);

  const { text: labelText, color: labelColor, bg: labelBg } = scoreLabel(weekly);

  const totalSec = detail.session?.totalDetectionSec ?? 0;
  const totalCount = detail.topIssues.reduce((s, i) => s + i.count, 0);

  const nextGoal = weekly !== null && weekly >= 70
    ? "현재의 바른 자세 습관을 유지하며, 집중 작업 시 30분마다 스트레칭을 추가해보세요."
    : "매 시간 자세를 점검하고, 모니터 높이와 의자 높이를 올바르게 조정해보세요.";

  const chartData: (number | null)[] = daily.length > 0 ? daily : Array(7).fill(null);

  return (
    <div className="space-y-3 p-5">

      {/* Row 1 — 3 equal cards */}
      <div className="grid grid-cols-3 gap-3">

        {/* Card 1: 이번 주 점수 */}
        <div className="rounded-2xl bg-white p-4 flex flex-col ring-1 ring-zinc-100 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            이번 주 점수
          </div>
          <div className="text-5xl font-black leading-none text-[#2563EB]">
            {weekly ?? "—"}
          </div>
          <div className={`mt-2 self-start rounded-full px-2.5 py-0.5 text-[10px] font-bold ${labelBg} ${labelColor}`}>
            {labelText}
          </div>
          <div className="my-3 border-t border-zinc-100" />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">감지 건수</span>
              <span className="text-[11px] font-semibold text-zinc-700">{totalCount}회</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">감지 시간</span>
              <span className="text-[11px] font-semibold text-zinc-700">{fmtSec(totalSec)}</span>
            </div>
          </div>
        </div>

        {/* Card 2: 자세 점수 추이 */}
        <div className="rounded-2xl bg-white p-4 flex flex-col ring-1 ring-zinc-100 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            자세 점수 추이
          </div>
          <div className="flex-1 flex items-center">
            <ScoreLineChart data={chartData} />
          </div>
        </div>

        {/* Card 3: 요일별 평균 */}
        <div className="rounded-2xl bg-white p-4 flex flex-col ring-1 ring-zinc-100 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            요일별 평균
          </div>
          <div className="flex-1 flex items-center">
            <ScoreBarChart data={chartData} />
          </div>
        </div>
      </div>

      {/* Row 2: AI 솔루션 */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-blue-100 border-l-4 border-[#2563EB]">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#2563EB]">AI 솔루션</span>
        </div>
        {detail.aiSolution ? (
          <p className="text-sm leading-relaxed text-zinc-700">{detail.aiSolution}</p>
        ) : (
          <p className="text-sm text-zinc-400">이번 주 데이터가 충분히 쌓이면 AI 솔루션이 제공됩니다.</p>
        )}
        {detail.topIssues.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3">
            {detail.topIssues.map((issue) => (
              <div key={issue.type} className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-700">
                  {ISSUE_LABELS[issue.type] ?? issue.type}
                </span>
                <span className="text-[11px] text-zinc-400">{fmtSec(issue.durationSec)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 3: 다음 주 목표 */}
      <div className="rounded-2xl bg-gradient-to-r from-[#2563EB] to-blue-500 p-5">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-100">
          다음 주 목표
        </div>
        <p className="text-sm leading-relaxed text-white">{nextGoal}</p>
      </div>
    </div>
  );
}
