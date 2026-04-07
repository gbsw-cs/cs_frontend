"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, saveTokens } from "../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await login(email, password);
      saveTokens(tokens);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-10 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100">
        <div className="flex justify-center">
          <Image src="/logo.png" alt="안자봐" width={170} height={70} priority />
        </div>
        <form className="mt-10 space-y-7" onSubmit={onSubmit}>
          <Field label="이메일" type="email" value={email} onChange={setEmail} />
          <PasswordField label="비밀번호" value={password} onChange={setPassword} />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-zinc-800">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="mt-2 w-full border-0 border-b border-zinc-300 bg-transparent pb-2 pr-8 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-0"
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
    </label>
  );
}
