import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-6 py-10 sm:py-16">
      <div className="flex flex-1 flex-col items-center justify-center">
        <Image
          src="/logo.png"
          alt="안자봐"
          width={220}
          height={90}
          priority
          className="h-auto w-40 sm:w-50 md:w-55"
        />
        <p className="mt-6 text-center text-sm text-zinc-800 sm:text-[15px]">
          <span className="font-semibold text-[#2563EB]">개발자</span>를 위한 무의식{" "}
          <span className="font-semibold text-[#2563EB]">자세 교정</span> 서비스
        </p>
      </div>
      <div className="mb-8 flex w-full max-w-80 flex-col gap-3 sm:mb-16 md:mb-24">
        <Link
          href="/login"
          className="flex h-11 items-center justify-center rounded-lg bg-[#2563EB] text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          로그인
        </Link>
        <Link
          href="/register"
          className="flex h-11 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
        >
          회원가입
        </Link>
      </div>
    </div>
  );
}
