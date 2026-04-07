import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-7 flex justify-center">
          <span className="rounded-full bg-[#2563EB]/10 px-5 py-2 text-sm font-semibold text-[#2563EB] ring-1 ring-[#2563EB]/20">
            ● AI 신체 활성화 중
          </span>
        </div>

        <div className="grid grid-cols-12 gap-4 sm:gap-5">
          {/* Row 1 */}
          <Card className="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-emerald-100" />
                <div>
                  <div className="text-sm font-bold">김00에</div>
                  <div className="text-[11px] text-zinc-500">교정 마스터</div>
                </div>
              </div>
              <Link
                href="/settings"
                aria-label="개인 설정"
                className="text-zinc-400 transition hover:text-[#2563EB]"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
            </div>
            <div className="mt-3 text-[11px] text-zinc-500">뱃지</div>
            <div className="mt-1 flex gap-2 text-xl">🏆 🎖 🥇</div>
          </Card>

          <Card className="col-span-12 sm:col-span-6 lg:col-span-9">
            <div className="text-base font-semibold">최근 활동</div>
            <div className="text-[11px] text-zinc-400">오늘 당신이 만든 자세 변화입니다.</div>
            <ul className="mt-3 space-y-2 text-xs text-zinc-700">
              {[
                ["자세 교정 완료", "10:32"],
                ["스트레칭 알림", "10:20"],
                ["자세 교정 완료", "10:05"],
                ["스탠딩 모드 시작", "09:50"],
                ["오늘의 첫 자세 체크 완료", "09:30"],
              ].map(([t, time]) => (
                <li key={t} className="flex justify-between">
                  <span className="text-emerald-500">✓ <span className="text-zinc-700">{t}</span></span>
                  <span className="text-zinc-400">{time}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Row 2 */}
          <Card className="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="flex flex-col items-center">
              <div className="text-6xl sm:text-7xl">🧍</div>
              <button className="mt-4 w-full rounded-full bg-emerald-100 py-2 text-xs font-semibold text-emerald-700">
                정확한 자세입니다 👍
              </button>
            </div>
          </Card>

          <Card className="col-span-12 lg:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold">일일 스코어링</div>
              <div className="flex flex-wrap gap-2 text-[11px] sm:gap-3">
                <span className="text-emerald-500">● 좋음</span>
                <span className="text-amber-500">● 경고</span>
                <span className="text-rose-500">● 위험</span>
              </div>
            </div>
            <div className="mt-1 text-xl font-bold sm:text-2xl">7시간</div>
            <div className="mt-3 flex h-24 items-end gap-1 sm:h-28 sm:gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-emerald-200 to-emerald-400"
                    style={{ height: `${30 + ((i * 17) % 60)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between px-1 text-[9px] text-zinc-400 sm:text-[10px]">
              {["0","4","8","12","16","20","24"].map((h) => (
                <span key={h}>{h}시</span>
              ))}
            </div>
          </Card>

          <Card className="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="text-base font-semibold">오늘의 건강 점수</div>
            <div className="mt-4 flex items-center justify-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-[10px] border-emerald-300 text-2xl font-bold">
                0
              </div>
            </div>
            <div className="mt-3 space-y-0.5 text-[11px]">
              <div className="text-emerald-600">● 매우좋음</div>
              <div className="text-amber-500">● 보통</div>
              <div className="text-rose-500">● 주의필요</div>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
              <span>15% 향상</span>
              <span>2% 저하</span>
            </div>
          </Card>

          {/* Row 3 */}
          <Card className="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="text-[11px] font-semibold text-zinc-500">실시간 안내 상태</div>
            <div className="mt-2 rounded-lg bg-[#2563EB]/10 p-3 text-[11px] text-[#2563EB]">
              김00에님의 현재의 모드입니다.
            </div>
            <ul className="mt-3 space-y-1.5 text-[11px] text-zinc-600">
              <li className="flex justify-between"><span>• 자세 교정 알림</span><span className="text-[#2563EB]">설정</span></li>
              <li className="flex justify-between"><span>• 스탠딩 알림</span><span className="text-[#2563EB]">설정</span></li>
              <li className="flex justify-between"><span>• 휴식 시간</span><span className="text-[#2563EB]">설정</span></li>
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-zinc-50 p-2 text-[11px]">
              <span>어둠 속 코딩 감지 모드</span>
              <div className="flex h-5 w-9 items-center rounded-full bg-[#2563EB] p-0.5">
                <div className="ml-auto h-4 w-4 rounded-full bg-white" />
              </div>
            </div>
          </Card>

          <Card className="col-span-12 sm:col-span-6 lg:col-span-9">
            <div className="text-base font-semibold">주간 스코어링</div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="평균 자세 시간" value="12h" color="text-rose-500" />
              <Stat label="스트레칭 횟수" value="12회" color="text-amber-500" />
              <Stat label="가장 좋은 요일" value="화요일" color="text-zinc-800" />
              <Stat label="목표 달성률" value="60%" color="text-emerald-500" />
            </div>
            <div className="mt-6 border-t border-zinc-100 pt-3 text-center text-[11px] text-zinc-400">
              잘자세 유지 시간
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white px-5 py-7 shadow-sm ring-1 ring-zinc-100 sm:px-7 sm:py-9 ${className}`}>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold sm:text-3xl ${color}`}>{value}</div>
    </div>
  );
}
