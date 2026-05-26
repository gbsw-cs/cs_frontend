"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getAllBadges,
  getBadges,
  getBadgesProgress,
  type ApiBadge,
  type BadgeProgressCategory,
  type MasterBadge,
} from "../lib/api";

const CATEGORY_LABELS: Record<string, string> = {
  POSTURE_TIME: "바른 자세 시간",
  STREAK: "연속 달성",
  SPECIAL: "특별 뱃지",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  POSTURE_TIME: "⏱️",
  STREAK: "🔥",
  SPECIAL: "⭐",
};

const CATEGORY_ORDER = ["POSTURE_TIME", "STREAK", "SPECIAL"];

function fmtProgress(val: number, isTime: boolean) {
  if (isTime) {
    const h = Math.floor(val / 3600);
    const m = Math.floor((val % 3600) / 60);
    if (h > 0 && m > 0) return `${h}시간 ${m}분`;
    if (h > 0) return `${h}시간`;
    return `${m}분`;
  }
  return `${val}일`;
}

export default function BadgesPage() {
  const [masterBadges, setMasterBadges] = useState<MasterBadge[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<ApiBadge[]>([]);
  const [progress, setProgress] = useState<BadgeProgressCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getAllBadges()
      .then((master) => {
        if (!active) return;
        setMasterBadges(master);
        return Promise.allSettled([getBadges(), getBadgesProgress()] as const);
      })
      .then((results) => {
        if (!active || !results) return;

        const [earned, prog] = results;
        if (earned.status === "fulfilled") {
          setEarnedBadges(earned.value);
        }
        if (prog.status === "fulfilled") {
          setProgress(prog.value.categories);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "데이터를 불러올 수 없습니다."))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const earnedMap = new Map(earnedBadges.map((b) => [b.code, b]));
  const total = masterBadges.length;
  const earnedCount = earnedBadges.length;

  const categorized = CATEGORY_ORDER.reduce<Record<string, MasterBadge[]>>(
    (acc, cat) => {
      acc[cat] = masterBadges.filter((b) => b.category === cat);
      return acc;
    },
    {},
  );
  const categoryKeys = [
    ...CATEGORY_ORDER,
    ...masterBadges
      .map((b) => b.category)
      .filter((cat, index, arr) => !CATEGORY_ORDER.includes(cat) && arr.indexOf(cat) === index),
  ];

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-[1100px]">
        {/* Header */}
        <div className="mb-7 flex items-center gap-4">
          <Link
            href="/settings"
            aria-label="설정으로 돌아가기"
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
            <h1 className="text-xl font-bold text-zinc-900">뱃지 컬렉션</h1>
            <p className="mt-0.5 text-xs text-zinc-400">
              바른 자세를 유지할수록 더 많은 뱃지를 획득할 수 있어요
            </p>
          </div>
        </div>

        {/* Summary + Progress */}
        <div className="mb-4 grid grid-cols-12 gap-3">
          {/* Summary card */}
          <div className="col-span-12 rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-zinc-100 sm:col-span-4">
            {loading ? (
              <div className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
                <div className="h-10 w-32 animate-pulse rounded bg-zinc-100" />
                <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-zinc-100" />
              </div>
            ) : (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-[#2563EB]">
                  컬렉션 현황
                </div>
                <div className="mt-2 flex items-end gap-1.5">
                  <span className="text-4xl font-bold text-zinc-900">{earnedCount}</span>
                  <span className="mb-1.5 text-lg text-zinc-400">/ {total}</span>
                </div>
                <div className="text-[11px] text-zinc-400">개 획득</div>
                {total > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-[#2563EB] transition-all duration-700"
                      style={{ width: `${(earnedCount / total) * 100}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Progress */}
          <div className="col-span-12 rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-zinc-100 sm:col-span-8">
            <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[#2563EB]">
              진행도
            </div>
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 w-40 animate-pulse rounded bg-zinc-100" />
                    <div className="h-1.5 w-full animate-pulse rounded-full bg-zinc-100" />
                    <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-100" />
                  </div>
                ))}
              </div>
            ) : progress.length === 0 ? (
              <p className="text-xs text-zinc-400">아직 진행 중인 카테고리가 없습니다.</p>
            ) : (
              <div className="space-y-5">
                {progress.map((cat) => (
                  <ProgressRow key={cat.category} cat={cat} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-2xl bg-rose-50 px-6 py-4 ring-1 ring-rose-100">
            <div className="text-sm font-semibold text-rose-500">데이터를 불러오지 못했습니다</div>
            <div className="mt-0.5 text-xs text-rose-400">{error}</div>
          </div>
        )}

        {/* Badge sections */}
        {loading ? (
          <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-zinc-100">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl bg-zinc-100" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {categoryKeys.map((cat) => {
              const badges = categorized[cat] ?? masterBadges.filter((b) => b.category === cat);
              if (badges.length === 0) return null;
              const catEarned = badges.filter((b) => earnedMap.has(b.code)).length;
              return (
                <section
                  key={cat}
                  className="rounded-2xl bg-white px-6 py-6 shadow-sm ring-1 ring-zinc-100"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span className="text-2xl">{CATEGORY_EMOJIS[cat] ?? "🏅"}</span>
                    <div>
                      <div className="text-sm font-bold text-zinc-900">
                        {CATEGORY_LABELS[cat] ?? cat}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {catEarned} / {badges.length} 획득
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {badges.map((badge) => (
                      <BadgeCard
                        key={badge.id}
                        master={badge}
                        earned={earnedMap.get(badge.code)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {masterBadges.length === 0 && (
              <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-zinc-100">
                <div className="mb-2 text-3xl">🏅</div>
                <div className="text-sm font-medium text-zinc-500">등록된 뱃지가 없습니다</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BadgeCard({
  master,
  earned,
}: {
  master: MasterBadge;
  earned: ApiBadge | undefined;
}) {
  const isEarned = !!earned;
  const dateStr = earned
    ? new Date(earned.earnedAt).toLocaleDateString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
      })
    : null;

  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl border px-3 py-5 transition ${
        isEarned
          ? "border-amber-100 bg-gradient-to-b from-amber-50/60 to-white hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)]"
          : "border-zinc-100 bg-zinc-50/50"
      }`}
    >
      {/* Status badge */}
      {isEarned ? (
        <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      ) : (
        <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200">
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-400"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      )}

      {/* Icon */}
      <div
        className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full ${
          isEarned
            ? "bg-amber-100 shadow-[0_2px_12px_rgba(251,191,36,0.25)]"
            : "bg-zinc-100"
        }`}
      >
        {master.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={master.iconUrl}
            alt={master.name}
            className={`h-10 w-10 object-contain ${!isEarned ? "opacity-25 grayscale" : ""}`}
          />
        ) : (
          <span className={`text-2xl ${!isEarned ? "opacity-25 grayscale" : ""}`}>
            🏅
          </span>
        )}
      </div>

      {/* Text */}
      <div
        className={`mt-3 text-center text-xs font-bold ${
          isEarned ? "text-zinc-900" : "text-zinc-400"
        }`}
      >
        {master.name}
      </div>
      <div
        className={`mt-1 text-center text-[10px] leading-snug ${
          isEarned ? "text-zinc-400" : "text-zinc-300"
        }`}
      >
        {master.description}
      </div>

      {/* Earned date */}
      {isEarned && dateStr && (
        <div className="mt-3 rounded-full bg-[#2563EB]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#2563EB]">
          {dateStr} 획득
        </div>
      )}
    </div>
  );
}

function ProgressRow({ cat }: { cat: BadgeProgressCategory }) {
  const label = CATEGORY_LABELS[cat.category] ?? cat.category;
  const isTime = cat.category === "POSTURE_TIME";
  const max = cat.next ? cat.next.requirementValue : cat.current || 1;
  const pct = max > 0 ? Math.min((cat.current / max) * 100, 100) : 100;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-zinc-700">
          {CATEGORY_EMOJIS[cat.category]} {label}
        </span>
        {cat.next ? (
          <span className="text-zinc-400">
            다음 뱃지까지{" "}
            <span className="font-semibold text-zinc-600">
              {fmtProgress(cat.next.remaining, isTime)}
            </span>{" "}
            남음
          </span>
        ) : (
          <span className="font-semibold text-emerald-500">최고 등급 달성!</span>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-[#2563EB] transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{fmtProgress(cat.current, isTime)}</span>
        {cat.next && <span>{fmtProgress(cat.next.requirementValue, isTime)}</span>}
      </div>
    </div>
  );
}
