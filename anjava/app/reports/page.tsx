"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  if (score === null) return { text: "데이터 없음", color: "text-zinc-400", bg: "bg-zinc-700" };
  if (score >= 90) return { text: "훌륭해요", color: "text-emerald-400", bg: "bg-emerald-500/20" };
  if (score >= 70) return { text: "좋음", color: "text-emerald-400", bg: "bg-emerald-500/20" };
  if (score >= 50) return { text: "보통", color: "text-amber-400", bg: "bg-amber-500/20" };
  return { text: "개선 필요", color: "text-rose-400", bg: "bg-rose-500/20" };
}

export default function ReportsPage() {
  const [current, setCurrent] = useState<CurrentReport | null>(null);
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
            <div className="py-12 text-center text-sm text-zinc-400">
              이번 주 감지 데이터가 없습니다
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

/* ─── ReportDetailView ──────────────────────────────────────── */
function ReportDetailView({ detail }: { detail: CurrentReport }) {
  const daily = detail.healthScore?.daily ?? [];
  const validScores = daily.filter((s): s is number => s !== null && s !== undefined);
  const weekly = detail.healthScore?.weekly
    ?? (validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null);

  const { text: labelText, color: labelColor, bg: labelBg } = scoreLabel(weekly);

  const totalSec = detail.session?.totalDetectionSec ?? 0;
  const totalCount = detail.topIssues.reduce((s, i) => s + i.count, 0);
  const maxDaily = Math.max(...validScores, 1);
  const maxIssueDur = detail.topIssues[0]?.durationSec ?? 1;

  const nextGoal = weekly !== null && weekly >= 70
    ? "현재의 바른 자세 습관을 유지하며, 집중 작업 시 30분마다 스트레칭을 추가해보세요."
    : "매 시간 자세를 점검하고, 모니터 높이와 의자 높이를 올바르게 조정해보세요.";

  return (
    <div className="space-y-4 p-5">

      {/* ① 점수 카드 (다크) */}
      <div className="rounded-2xl bg-zinc-900 p-5">
        <div className="flex items-stretch gap-5">

          {/* 점수 */}
          <div className="flex min-w-[72px] flex-col items-center justify-center">
            <div className="text-5xl font-black leading-none text-white">
              {weekly ?? "—"}
            </div>
            <div className={`mt-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${labelBg} ${labelColor}`}>
              {labelText}
            </div>
          </div>

          {/* 일별 점수 바 차트 */}
          <div className="flex flex-1 items-end gap-1">
            {(daily.length > 0 ? daily : Array(7).fill(null)).map((score, i) => {
              const has = score !== null && score !== undefined;
              const h = has ? Math.max(Math.round((score / maxDaily) * 64), 6) : 6;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  {has && (
                    <span className="text-[8px] font-semibold text-zinc-400">{score}</span>
                  )}
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${h}px`,
                      background: has ? "#3b82f6" : "#27272a",
                    }}
                  />
                  <span className="text-[9px] text-zinc-500">{DAYS[i]}</span>
                </div>
              );
            })}
          </div>

          {/* 이슈 분포 미니 바 */}
          {detail.topIssues.length > 0 && (
            <div className="flex items-end gap-1 border-l border-zinc-700 pl-4">
              {detail.topIssues.slice(0, 4).map((issue) => {
                const h = Math.max(Math.round((issue.durationSec / maxIssueDur) * 64), 6);
                return (
                  <div key={issue.type} className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-4 rounded-t"
                      style={{ height: `${h}px`, background: ISSUE_BAR_COLORS[issue.type] ?? "#71717a" }}
                    />
                    <span className="text-[8px] text-zinc-500">
                      {ISSUE_LABELS[issue.type]?.slice(0, 2) ?? "??"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ② AI 솔루션 */}
      {detail.aiSolution ? (
        <div className="rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-100">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#2563EB]">AI 솔루션</span>
          </div>
          <p className="text-sm leading-relaxed text-zinc-700">{detail.aiSolution}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-200 pt-4">
            <div>
              <div className="text-[10px] text-zinc-400">감지 건수</div>
              <div className="mt-0.5 text-base font-bold text-zinc-900">{totalCount}회</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-400">총 감지 시간</div>
              <div className="mt-0.5 text-base font-bold text-zinc-900">{fmtSec(totalSec)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-100">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#2563EB]">AI 솔루션</span>
          </div>
          <p className="text-sm text-zinc-400">이번 주 데이터가 충분히 쌓이면 AI 솔루션이 제공됩니다.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-200 pt-4">
            <div>
              <div className="text-[10px] text-zinc-400">감지 건수</div>
              <div className="mt-0.5 text-base font-bold text-zinc-900">{totalCount}회</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-400">총 감지 시간</div>
              <div className="mt-0.5 text-base font-bold text-zinc-900">{fmtSec(totalSec)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ③ 다음 주 목표 */}
      <div className="rounded-2xl bg-gradient-to-r from-[#2563EB] to-blue-500 p-5">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-100">
          다음 주 목표
        </div>
        <p className="text-sm leading-relaxed text-white">{nextGoal}</p>
      </div>

      {/* ④ 주요 이슈 바 차트 */}
      {detail.topIssues.length > 0 && (
        <div className="rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-100">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            주요 자세 이슈
          </div>

          {/* 가로 바 차트 */}
          <div className="space-y-3">
            {detail.topIssues.map((issue) => {
              const pct = (issue.durationSec / maxIssueDur) * 100;
              return (
                <div key={issue.type}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-zinc-400">#{issue.rank}</span>
                      <span className="text-xs font-semibold text-zinc-800">
                        {ISSUE_LABELS[issue.type] ?? issue.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {fmtSec(issue.durationSec)} · {issue.count}회
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className={`h-full rounded-full transition-all ${ISSUE_COLORS[issue.type] ?? "bg-zinc-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 세로 막대 그래프 (일별 이슈 분포) */}
          {daily.length > 0 && (
            <div className="mt-5 border-t border-zinc-200 pt-4">
              <div className="mb-3 text-[10px] font-semibold text-zinc-400">일별 건강 점수 추이</div>
              <div className="flex items-end gap-2" style={{ height: 72 }}>
                {daily.map((score, i) => {
                  const has = score !== null && score !== undefined;
                  const h = has ? Math.max(Math.round((score / maxDaily) * 64), 4) : 4;
                  const color = has
                    ? score >= 70 ? "#3b82f6" : score >= 50 ? "#fbbf24" : "#fb7185"
                    : "#e4e4e7";
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      {has && (
                        <span className="text-[9px] font-semibold" style={{ color }}>{score}</span>
                      )}
                      <div
                        className="w-full rounded-t"
                        style={{ height: `${h}px`, background: color }}
                      />
                      <span className="text-[9px] text-zinc-400">{DAYS[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
