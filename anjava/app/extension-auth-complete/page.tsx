import Link from "next/link";

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    reason?: string;
  }>;
};

export default async function ExtensionAuthCompletePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const failed = params.status === "failed";
  const reason = typeof params.reason === "string" ? params.reason : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <section className="w-full max-w-[420px] rounded-2xl bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100">
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold ${
            failed ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {failed ? "!" : "✓"}
        </div>
        <h1 className="mt-5 text-xl font-bold text-zinc-900">
          {failed ? "웹 로그인은 완료됐지만 확장 연결에 실패했습니다" : "확장 프로그램 로그인이 완료됐습니다"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          {failed
            ? "확장 프로그램이 설치되어 있고 최신 버전인지 확인한 뒤 확장 팝업에서 Google 로그인을 다시 시도해 주세요."
            : "Anjava 확장 팝업을 다시 열면 바로 로그인된 상태로 사용할 수 있습니다."}
        </p>
        {failed && reason && (
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            {reason}
          </p>
        )}
        <div className="mt-6 grid gap-2">
          <Link
            href="/extension-guide"
            className="flex h-11 items-center justify-center rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition hover:opacity-90"
          >
            확장 가이드 보기
          </Link>
          <Link
            href="/dashboard"
            className="flex h-11 items-center justify-center rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            대시보드로 이동
          </Link>
        </div>
      </section>
    </main>
  );
}
