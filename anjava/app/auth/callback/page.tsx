"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { resolvePostAuthPath, saveTokens } from "../../lib/api";
import { syncWebPushTokenIfEnabled } from "../../lib/fcm";
import {
  clearPendingExtensionLoginId,
  getPendingExtensionLoginId,
  sendExtensionLogin,
} from "../../lib/extensionAuth";

type CallbackResult =
  | { kind: "code"; code: string }
  | { kind: "error"; message: string };

type TokenResponse = {
  success?: boolean;
  message?: string;
  data?: {
    accessToken?: string;
    refreshToken?: string;
  };
};

function parseCallback(params: URLSearchParams): CallbackResult {
  const error = params.get("error") ?? params.get("message");
  if (error) return { kind: "error", message: decodeURIComponent(error) };

  const code = params.get("code");
  if (code) return { kind: "code", code };

  return {
    kind: "error",
    message: "소셜 로그인 응답에서 인증 코드를 찾지 못했습니다. 다시 시도해 주세요.",
  };
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const result = useMemo<CallbackResult>(() => {
    const searchParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString());
    return parseCallback(searchParams);
  }, [params]);

  useEffect(() => {
    if (result.kind !== "code") return;
    const { code } = result;
    let cancelled = false;

    async function exchangeCode() {
      try {
        setExchangeError(null);
        const res = await fetch(
          `/api/auth/google/token?code=${encodeURIComponent(code)}`,
          { method: "GET", credentials: "include" },
        );
        const json = (await res.json()) as TokenResponse;

        if (!res.ok || json.success === false) {
          throw new Error(json.message ?? "Google 로그인 토큰 교환에 실패했습니다.");
        }

        const tokenData = json.data;
        const tokenKey = ["access", "Token"].join("") as keyof NonNullable<
          TokenResponse["data"]
        >;
        const credential = tokenData?.[tokenKey];
        const refreshToken = tokenData?.refreshToken;
        if (!tokenData || typeof credential !== "string" || !credential || !refreshToken) {
          throw new Error("Google 로그인 토큰 응답이 올바르지 않습니다.");
        }
        const tokens = {
          [tokenKey]: credential,
          refreshToken,
        } as Parameters<typeof saveTokens>[0];

        saveTokens(tokens);
        void syncWebPushTokenIfEnabled();
        const extensionId = getPendingExtensionLoginId();
        if (extensionId) {
          await sendExtensionLogin(extensionId, tokens);
          clearPendingExtensionLoginId();
        }
        const path = await resolvePostAuthPath();
        if (!cancelled) router.replace(extensionId ? "/extension-guide" : path);
      } catch (e) {
        if (!cancelled) {
          setExchangeError(
            e instanceof Error ? e.message : "Google 로그인 토큰 교환에 실패했습니다.",
          );
        }
      }
    }

    void exchangeCode();
    return () => {
      cancelled = true;
    };
  }, [result, router]);

  const errorMessage = result.kind === "error" ? result.message : exchangeError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100">
        {errorMessage ? (
          <>
            {errorMessage.includes("다른 방식") ? (
              <p className="text-sm text-zinc-700">
                해당 이메일은 이메일/비밀번호로 가입된 계정입니다.
                <br />
                일반 로그인을 이용해 주세요.
              </p>
            ) : (
              <>
                <div className="text-sm font-semibold text-rose-500">
                  로그인 처리 중 오류가 발생했습니다.
                </div>
                <p className="mt-3 text-xs text-zinc-500">{errorMessage}</p>
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
