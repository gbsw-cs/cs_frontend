"use client";

import AvatarColored from "./AvatarColored";

type AppToastProps = {
  message: string;
  avatarColorId?: string;
};

export default function AppToast({ message, avatarColorId = "blue" }: AppToastProps) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] w-[min(360px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_50px_rgba(37,99,235,0.18)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2563EB]/10 text-sm font-black text-[#2563EB]">
          !
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2563EB]">
            Anjava
          </div>
          <div className="mt-0.5 break-keep text-sm font-semibold leading-snug text-zinc-800">
            {message}
          </div>
        </div>
        <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-full bg-gradient-to-b from-blue-50 to-white ring-1 ring-blue-100">
          <AvatarColored
            hoodColorId={avatarColorId}
            className="absolute -bottom-2 left-1/2 h-14 w-10 -translate-x-1/2"
          />
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-[#2563EB] via-sky-400 to-emerald-400" />
    </div>
  );
}
