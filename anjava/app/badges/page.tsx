"use client";

import Link from "next/link";

type Badge = {
  icon: string;
  name: string;
  desc: string;
  bg: string;
  earned: boolean;
  date?: string;
};

const badges: Badge[] = [
  { icon: "🍯", name: "꿀잠 지킴이", desc: "7일 연속 바른 자세 유지", bg: "bg-amber-100", earned: true, date: "2026.03.12" },
  { icon: "🚶", name: "부지런한 걸음", desc: "하루 5회 스트레칭 완료", bg: "bg-orange-100", earned: true, date: "2026.03.18" },
  { icon: "🥇", name: "자세 마스터", desc: "한 달간 경고 10회 이하", bg: "bg-rose-100", earned: true, date: "2026.03.25" },
  { icon: "🌿", name: "새싹 회원", desc: "서비스 첫 가입 완료", bg: "bg-emerald-100", earned: true, date: "2026.02.01" },
  { icon: "🔥", name: "열정 가득", desc: "30일 연속 접속", bg: "bg-red-100", earned: true, date: "2026.04.01" },
  { icon: "⭐", name: "별점왕", desc: "누적 점수 1000점 달성", bg: "bg-yellow-100", earned: true, date: "2026.04.05" },
  { icon: "💎", name: "다이아 등급", desc: "프리미엄 자세 점수 유지", bg: "bg-sky-100", earned: false },
  { icon: "🏆", name: "챔피언", desc: "월간 랭킹 1위 달성", bg: "bg-indigo-100", earned: false },
  { icon: "🎯", name: "정확도 100%", desc: "일주일간 완벽한 자세 유지", bg: "bg-fuchsia-100", earned: false },
  { icon: "🌙", name: "야행성 지킴이", desc: "야간 작업 중에도 바른 자세", bg: "bg-violet-100", earned: false },
  { icon: "🚀", name: "성장 로켓", desc: "자세 점수 50% 이상 향상", bg: "bg-cyan-100", earned: false },
  { icon: "🧘", name: "명상의 달인", desc: "스트레칭 100회 완료", bg: "bg-lime-100", earned: false },
];

export default function BadgesPage() {
  const earnedCount = badges.filter((b) => b.earned).length;

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
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="text-xs font-semibold text-[#2563EB]">컬렉션 현황</div>
              <div className="mt-2 text-2xl font-bold text-zinc-900">
                {earnedCount}
                <span className="text-zinc-400"> / {badges.length}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                전체 뱃지 중 {Math.round((earnedCount / badges.length) * 100)}% 획득
              </p>
            </div>
            <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-[#2563EB] transition-all"
                style={{ width: `${(earnedCount / badges.length) * 100}%` }}
              />
            </div>
          </div>
        </section>

        {/* Badge grid */}
        <section className="rounded-3xl bg-white px-8 py-10 shadow-[0_2px_20px_rgba(0,0,0,0.05)] ring-1 ring-zinc-100 sm:px-12 sm:py-12">
          <div className="mb-6 text-sm font-semibold text-[#2563EB]">
            전체 뱃지
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {badges.map((b) => (
              <BadgeCard key={b.name} badge={b} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  return (
    <div
      className={`group flex flex-col items-center rounded-2xl border border-zinc-100 px-4 py-6 transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] ${
        badge.earned ? "bg-white" : "bg-zinc-50"
      }`}
    >
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full text-4xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${
          badge.earned ? badge.bg : "bg-zinc-200"
        } ${badge.earned ? "" : "grayscale opacity-40"}`}
      >
        {badge.icon}
      </div>
      <div
        className={`mt-4 text-sm font-bold ${
          badge.earned ? "text-zinc-900" : "text-zinc-400"
        }`}
      >
        {badge.name}
      </div>
      <div className="mt-1.5 text-center text-[11px] leading-relaxed text-zinc-400">
        {badge.desc}
      </div>
      {badge.earned ? (
        <div className="mt-3 rounded-full bg-[#2563EB]/10 px-3 py-1 text-[10px] font-semibold text-[#2563EB]">
          {badge.date} 획득
        </div>
      ) : (
        <div className="mt-3 rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-semibold text-zinc-400">
          미획득
        </div>
      )}
    </div>
  );
}
