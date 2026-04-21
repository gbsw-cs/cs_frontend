"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveTokens, sendEmailCode, signup, uploadImageToCloudinary, verifyEmailCode } from "../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  // step 1
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  // step 2
  const [name, setName] = useState("");
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSendCode() {
    setError(null);
    setSendingCode(true);
    try {
      await sendEmailCode(email);
      setCodeSent(true);
      setEmailVerified(false);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "코드 발송 실패");
    } finally {
      setSendingCode(false);
    }
  }

  async function onVerifyCode() {
    setError(null);
    setVerifyingCode(true);
    try {
      await verifyEmailCode(email, code);
      setEmailVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 실패");
    } finally {
      setVerifyingCode(false);
    }
  }

  function onNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailVerified) {
      setError("이메일 인증을 완료해 주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setStep(2);
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("이미지는 5MB 이하만 가능합니다.");
      return;
    }
    setError(null);
    setProfileFile(file);
    const reader = new FileReader();
    reader.onload = () => setProfilePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let img: string | undefined;
      if (profileFile) {
        img = await uploadImageToCloudinary(profileFile);
      }
      const tokens = await signup(email, password, name, img);
      saveTokens(tokens);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-8 sm:px-6">
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100 sm:p-9">
        <div className="flex justify-center">
          <Image src="/logo.png" alt="안자봐" width={150} height={60} priority />
        </div>

        {step === 1 ? (
          <form className="mt-8 space-y-6" onSubmit={onNext}>
            {/* 이메일 + 코드 발송 */}
            <div className="block">
              <span className="text-[13px] font-semibold text-zinc-800">이메일</span>
              <div className="mt-2 flex items-end gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCodeSent(false);
                    setEmailVerified(false);
                    setCode("");
                  }}
                  required
                  disabled={emailVerified}
                  className="flex-1 border-0 border-b border-zinc-300 bg-transparent pb-2 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-0 disabled:text-zinc-400"
                />
                {!emailVerified && (
                  <button
                    type="button"
                    onClick={onSendCode}
                    disabled={sendingCode || !email}
                    className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {sendingCode ? "발송 중..." : codeSent ? "재발송" : "코드 발송"}
                  </button>
                )}
                {emailVerified && (
                  <span className="shrink-0 text-[11px] font-semibold text-emerald-500">✓ 인증 완료</span>
                )}
              </div>
            </div>

            {/* 인증 코드 입력 */}
            {codeSent && !emailVerified && (
              <div className="block">
                <span className="text-[13px] font-semibold text-zinc-800">인증 코드</span>
                <div className="mt-2 flex items-end gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6자리 코드 입력"
                    maxLength={6}
                    className="flex-1 border-0 border-b border-zinc-300 bg-transparent pb-2 text-sm tracking-widest focus:border-[#2563EB] focus:outline-none focus:ring-0"
                  />
                  <button
                    type="button"
                    onClick={onVerifyCode}
                    disabled={verifyingCode || code.length === 0}
                    className="shrink-0 rounded-lg bg-[#2563EB] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {verifyingCode ? "확인 중..." : "확인"}
                  </button>
                </div>
              </div>
            )}

            <PasswordField label="비밀번호" value={password} onChange={setPassword} />
            <PasswordField label="비밀번호 확인" value={passwordConfirm} onChange={setPasswordConfirm} />

            {error && <p className="text-xs text-rose-500">{error}</p>}
            <button
              type="submit"
              className="mt-2 h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition hover:opacity-90"
            >
              다음
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={onSubmit}>
            <div className="flex flex-col items-center gap-2">
              <label className="cursor-pointer">
                {profilePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profilePreview}
                    alt="프로필 미리보기"
                    className="h-20 w-20 rounded-full object-cover ring-2 ring-zinc-200"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 ring-2 ring-dashed ring-zinc-300 hover:bg-zinc-200">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-zinc-400">
                      <circle cx="12" cy="8" r="4" strokeWidth="1.8" />
                      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" strokeWidth="1.8" />
                    </svg>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={onPickImage} className="hidden" />
              </label>
              <span className="text-[11px] text-zinc-500">프로필 사진 (선택)</span>
            </div>
            <Field label="이름" type="text" value={name} onChange={setName} />
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "가입 중..." : "가입하기"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-zinc-400">
          이미 회원이신가요?
          <br />
          <Link href="/login" className="mt-1 inline-block font-semibold text-[#2563EB] underline">
            CS 로그인
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
