"use client";

export const HOOD_CSS_FILTER: Record<string, string> = {
  default: "sepia(1) saturate(3) hue-rotate(100deg)",
  sky:     "sepia(1) saturate(3) hue-rotate(185deg)",
  violet:  "sepia(1) saturate(3) hue-rotate(240deg)",
  rose:    "sepia(1) saturate(4) hue-rotate(310deg)",
  amber:   "sepia(1) saturate(4) hue-rotate(10deg)",
  orange:  "sepia(1) saturate(5) hue-rotate(0deg)",
  pink:    "sepia(1) saturate(5) hue-rotate(300deg)",
  zinc:    "saturate(0)",
};

type Props = {
  hoodColorId?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function AvatarColored({ hoodColorId = "default", className = "", style }: Props) {
  const filter = HOOD_CSS_FILTER[hoodColorId] ?? "none";
  return (
    <div className={`relative ${className}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/avatar.png" alt="아바타" className="h-full w-full object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/avatar-hood.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ filter, transition: "filter 0.4s ease" }}
      />
    </div>
  );
}
