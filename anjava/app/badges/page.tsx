"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getBadges,
  getBadgesProgress,
  type ApiBadge,
  type BadgeProgressCategory,
} from "../lib/api";

const CATEGORY_LABELS: Record<string, string> = {
  POSTURE_TIME: "바른 자세 누적 시간",
  STREAK: "연속 달성 일수",
};

export default function BadgesPage() {
  const [badges, setBadges] = useState<ApiBadge[]>([]);
  const [progress, setProgress] = useState<BadgeProgressCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getBadges(), getBadgesProgress()])
      .then(([b, p]) => {
        setBadges(b);
        setProgress(p.categories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-8 sm:px-8 sm:py-12">
      <div className="w-full max-w-[1280px]">
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
            <h1 className="text-xl font-bold text-zinc-900">내 뱃지</h1>
            <p className="mt-0.5 text-xs text-zinc-400">
              지금까지 획득한 뱃지를 확인해보세요
            </p>
          </div>
        </div>

        {/* Summary */}
        <section className="mb-8 rounded-3xl bg-white px-8 py-8 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 sm:px-10">
          {loading ? (
            <div className="h-8 w-40 animate-pulse rounded bg-zinc-100" />
          ) : (
            <div>
              <div className="text-xs font-semibold text-[#2563EB]">컬렉션 현황</div>
              <div className="mt-2 text-2xl font-bold text-zinc-900">
                {badges.length}
                <span className="text-zinc-400"> 개 획득</span>
              </div>
            </div>
          )}
        </section>

        {/* Progress */}
        {!loading && progress.length > 0 && (
          <section className="mb-8 rounded-3xl bg-white px-8 py-8 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 sm:px-10">
            <div className="mb-5 text-sm font-semibold text-[#2563EB]">진행도</div>
            <div className="space-y-5">
              {progress.map((cat) => (
                <ProgressRow key={cat.category} cat={cat} />
              ))}
            </div>
          </section>
        )}

        {/* Badge grid */}
        <section className="rounded-3xl bg-white px-8 py-10 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 sm:px-12 sm:py-12">
          <div className="mb-6 text-sm font-semibold text-[#2563EB]">획득한 뱃지</div>
          {loading ? (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center rounded-2xl border border-zinc-100 px-4 py-6"
                >
                  <div className="h-20 w-20 animate-pulse rounded-full bg-zinc-100" />
                  <div className="mt-4 h-4 w-20 animate-pulse rounded bg-zinc-100" />
                  <div className="mt-3 h-3 w-16 animate-pulse rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          ) : badges.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-400">
              아직 획득한 뱃지가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {badges.map((b) => (
                <BadgeCard key={b.badgeId} badge={b} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BadgeCard({ badge }: { badge: ApiBadge }) {
  const dateStr = new Date(badge.earnedAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div className="group flex flex-col items-center rounded-2xl border border-zinc-100 bg-white px-4 py-6 transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-amber-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {badge.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={badge.iconUrl}
            alt={badge.name}
            className="h-12 w-12 object-contain"
          />
        ) : (
          <span className="text-3xl">🏅</span>
        )}
      </div>
      <div className="mt-4 text-center text-sm font-bold text-zinc-900">
        {badge.name}
      </div>
      <div className="mt-3 rounded-full bg-[#2563EB]/10 px-3 py-1 text-[10px] font-semibold text-[#2563EB]">
        {dateStr} 획득
      </div>
    </div>
  );
}

function ProgressRow({ cat }: { cat: BadgeProgressCategory }) {
  const label = CATEGORY_LABELS[cat.category] ?? cat.category;
  const isTime = cat.category === "POSTURE_TIME";
  const max = cat.next ? cat.next.requirementValue : cat.current;
  const pct = max > 0 ? Math.min((cat.current / max) * 100, 100) : 100;

  function fmt(val: number) {
    return isTime ? `${Math.floor(val / 60)}분` : `${val}일`;
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-zinc-700">{label}</span>
        {cat.next ? (
          <span className="text-zinc-400">
            다음 배지까지 {fmt(cat.next.remaining)} 남음
          </span>
        ) : (
          <span className="font-semibold text-emerald-500">최고 등급 달성!</span>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-[#2563EB] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] text-zinc-400">
        {fmt(cat.current)}
        {cat.next ? ` / ${fmt(cat.next.requirementValue)}` : ""}
      </div>
    </div>
  );
}
