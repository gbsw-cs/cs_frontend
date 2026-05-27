"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import { resolvePostAuthPath, saveTokens } from "../../lib/api";

type CallbackResult =
  | { kind: "ok"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string };

function parseCallback(params: URLSearchParams): CallbackResult {
  const err = params.get("error") ?? params.get("message");
  if (err) return { kind: "error", message: decodeURIComponent(err) };

  const queryAccess = params.get("accessToken") ?? params.get("access_token");
  const queryRefresh = params.get("refreshToken") ?? params.get("refresh_token");
  if (queryAccess && queryRefresh) {
    return { kind: "ok", accessToken: queryAccess, refreshToken: queryRefresh };
  }

  if (typeof window !== "undefined" && window.location.hash) {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hashAccess = hash.get("accessToken") ?? hash.get("access_token");
    const hashRefresh = hash.get("refreshToken") ?? hash.get("refresh_token");
    if (hashAccess && hashRefresh) {
      return { kind: "ok", accessToken: hashAccess, refreshToken: hashRefresh };
    }
  }

  return {
    kind: "error",
    message: "소셜 로그인 응답에서 토큰을 찾지 못했습니다. 다시 시도해 주세요.",
  };
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  const result = useMemo<CallbackResult>(() => {
    const searchParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString());
    return parseCallback(searchParams);
  }, [params]);

  useEffect(() => {
    if (result.kind !== "ok") return;
    let cancelled = false;
    saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    resolvePostAuthPath().then((path) => {
      if (!cancelled) router.replace(path);
    });
    return () => {
      cancelled = true;
    };
  }, [result, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100">
        {result.kind === "error" ? (
          <>
            {result.message.includes("다른 방식") ? (
              <p className="text-sm text-zinc-700">
                이 이메일은 이메일/비밀번호로 가입된 계정입니다.
                <br />
                일반 로그인을 이용해 주세요.
              </p>
            ) : (
              <>
                <div className="text-sm font-semibold text-rose-500">
                  로그인 처리 중 오류가 발생했습니다.
                </div>
                <p className="mt-3 text-xs text-zinc-500">{result.message}</p>
              </>
            )}
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-6 h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition hover:opacity-90"
            >
              로그인 화면으로
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-[#2563EB]" />
            <div className="mt-5 text-sm font-semibold text-zinc-700">
              로그인 처리 중...
            </div>
            <p className="mt-2 text-xs text-zinc-400">잠시만 기다려 주세요.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-[#2563EB]" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
