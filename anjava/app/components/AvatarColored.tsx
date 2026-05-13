"use client";

export const HOOD_COLOR_HEX: Record<string, string> = {
  default: "#6ee7b7",
  sky: "#7dd3fc",
  violet: "#c4b5fd",
  rose: "#fda4af",
  amber: "#fcd34d",
  orange: "#fdba74",
  pink: "#f9a8d4",
  zinc: "#d4d4d8",
};

type Props = {
  hoodColorId?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function AvatarColored({
  hoodColorId = "default",
  className = "",
  style,
}: Props) {
  const hoodHex = HOOD_COLOR_HEX[hoodColorId] ?? HOOD_COLOR_HEX.default;

  return (
    <div
      className={`relative ${className}`}
      style={{ aspectRatio: "1023 / 1537", ...style }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/avatar-base.png" alt="아바타" className="block h-full w-full" />
      <div
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{
          backgroundColor: hoodHex,
          maskImage: "url('/avatar-clothes-mask.png')",
          WebkitMaskImage: "url('/avatar-clothes-mask.png')",
          maskPosition: "0 0",
          WebkitMaskPosition: "0 0",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          transition: "background-color 0.25s ease",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/avatar-clothes-shading.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: "multiply" }}
      />
    </div>
  );
}
