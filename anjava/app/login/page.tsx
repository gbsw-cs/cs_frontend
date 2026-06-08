"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearTokens, getAccessToken, getMe, login, resolvePostAuthPath, saveTokens } from "../lib/api";
import { SocialLoginButtons } from "../components/SocialLoginButtons";
import { syncWebPushTokenIfEnabled } from "../lib/fcm";
import { validatePassword } from "../lib/validation";
import {
  clearPendingExtensionLoginId,
  getCurrentTokensForExtension,
  getPendingExtensionLoginId,
  sendExtensionLogin,
} from "../lib/extensionAuth";

function extensionAuthCompletePath(options?: { failed?: boolean; reason?: string }) {
  if (!options?.failed) return "/extension-auth-complete";
  const params = new URLSearchParams({ status: "failed" });
  if (options.reason) params.set("reason", options.reason);
  return `/extension-auth-complete?${params.toString()}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extensionId, setExtensionId] = useState("");

  const passwordError = validatePassword(password);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pendingExtensionId = getPendingExtensionLoginId(params);
    setExtensionId(pendingExtensionId);

    if (!getAccessToken()) return;

    let cancelled = false;
    getMe()
      .then(async () => {
        if (cancelled) return;
        let extensionPath = "";
        if (pendingExtensionId) {
          const tokens = getCurrentTokensForExtension();
          if (tokens) {
            try {
              const linked = await sendExtensionLogin(pendingExtensionId, tokens);
              clearPendingExtensionLoginId();
              extensionPath = extensionAuthCompletePath({
                failed: !linked,
                reason: linked ? undefined : "확장 프로그램 메시지 연결을 사용할 수 없습니다.",
              });
            } catch {
              clearPendingExtensionLoginId();
              extensionPath = extensionAuthCompletePath({
                failed: true,
                reason: "확장 프로그램 연결 중 오류가 발생했습니다.",
              });
            }
          } else {
            clearPendingExtensionLoginId();
            extensionPath = extensionAuthCompletePath({
              failed: true,
              reason: "웹 로그인 토큰을 찾지 못했습니다.",
            });
          }
        }
        if (!cancelled) router.replace(pendingExtensionId ? extensionPath : "/dashboard");
      })
      .catch(() => {
        clearTokens();
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordError) return;
    setLoading(true);
    try {
      const tokens = await login(email, password);
      saveTokens(tokens);
      void syncWebPushTokenIfEnabled();
      let extensionPath = "";
      if (extensionId) {
        try {
          const linked = await sendExtensionLogin(extensionId, tokens);
          clearPendingExtensionLoginId();
          extensionPath = extensionAuthCompletePath({
            failed: !linked,
            reason: linked ? undefined : "확장 프로그램 메시지 연결을 사용할 수 없습니다.",
          });
        } catch (e) {
          clearPendingExtensionLoginId();
          extensionPath = extensionAuthCompletePath({
            failed: true,
            reason: e instanceof Error ? e.message : "확장 프로그램 연결 중 오류가 발생했습니다.",
          });
        }
      }
      const path = await resolvePostAuthPath();
      router.push(extensionId ? extensionPath : path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-8 sm:px-6">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100 sm:p-10">
        <div className="flex justify-center">
          <Image src="/logo.png" alt="안자봐" width={170} height={70} priority />
        </div>
        <form className="mt-10 space-y-7" onSubmit={onSubmit}>
          <Field label="이메일" type="email" value={email} onChange={setEmail} />
          <PasswordField
            label="비밀번호"
            value={password}
            onChange={setPassword}
            error={passwordError}
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !!passwordError}
            className="mt-2 h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
        <SocialLoginButtons extensionId={extensionId} />
        <p className="mt-6 text-center text-xs text-zinc-400">
          계정이 없으신가요?
          <br />
          <Link href="/register" className="mt-1 inline-block font-semibold text-[#2563EB] underline">
            CS 가입하기
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-zinc-800">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="mt-2 w-full border-0 border-b border-zinc-300 bg-transparent pb-2 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-0"
      />
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const [show, setShow] = useState(false);
  const hasError = Boolean(error);
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-zinc-800">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          aria-invalid={hasError || undefined}
          className={`mt-2 w-full border-0 border-b bg-transparent pb-2 pr-8 text-sm focus:outline-none focus:ring-0 ${
            hasError
              ? "border-rose-400 focus:border-rose-500"
              : "border-zinc-300 focus:border-[#2563EB]"
          }`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
          tabIndex={-1}
        >
          {show ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.77 19.77 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a19.77 19.77 0 01-3.16 4.19M1 1l22 22" />
              <path d="M9.53 9.53a3 3 0 104.95 4.95" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hasError && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-500">{error}</p>
      )}
    </label>
  );
}
