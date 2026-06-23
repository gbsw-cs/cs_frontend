"use client";

import AvatarColored from "./AvatarColored";

type AppToastProps = {
  message: string;
  avatarColorId?: string;
};

export default function AppToast({ message, avatarColorId = "blue" }: AppToastProps) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] w-[min(360px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.12)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50 ring-1 ring-emerald-100">
          <AvatarColored
            hoodColorId={avatarColorId}
            className="h-12 w-9 translate-y-1"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-600">
            Anjava
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold leading-snug text-zinc-800">
            {message}
          </div>
        </div>
      </div>
    </div>
  );
}
