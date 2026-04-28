"use client";

const HOOD_COLOR: Record<string, string> = {
  default: "#34d399",
  sky:     "#38bdf8",
  violet:  "#a78bfa",
  rose:    "#fb7185",
  amber:   "#fbbf24",
  orange:  "#fb923c",
  pink:    "#f472b6",
  zinc:    "#a1a1aa",
};

type Props = {
  hoodColorId?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function AvatarColored({ hoodColorId = "default", className = "", style }: Props) {
  const color = HOOD_COLOR[hoodColorId] ?? HOOD_COLOR.default;
  return (
    <div className={`relative ${className}`} style={style}>
      {/* 베이스: 얼굴/손/발 원본 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/avatar.png"
        alt="아바타"
        className="h-full w-full object-contain"
      />
      {/* 후드 색상: avatar-hood.png를 마스크로 사용해 선택 색상만 채움 */}
      <div
        className="absolute inset-0 transition-colors duration-300"
        style={{
          backgroundColor: color,
          WebkitMaskImage: "url('/avatar-hood.png')",
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskImage: "url('/avatar-hood.png')",
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
      />
    </div>
  );
}
