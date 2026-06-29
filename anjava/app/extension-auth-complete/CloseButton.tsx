"use client";

export function CloseButton() {
  return (
    <button
      type="button"
      className="flex h-11 w-full items-center justify-center rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition hover:opacity-90"
      onClick={() => window.close()}
    >
      완료
    </button>
  );
}
