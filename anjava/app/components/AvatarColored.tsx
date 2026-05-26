"use client";

type Props = {
  hoodColorId?: string;
  className?: string;
  style?: React.CSSProperties;
};

const AVATAR_IMAGE_BY_COLOR: Record<string, string> = {
  default: "/avatar.png",
  gray: "/avatar.png",
  red: "/red.png",
  orange: "/orange.png",
  yellow: "/yellow.png",
  green: "/green.png",
  blue: "/blue.png",
  darkblue: "/darkblue.png",
  navy: "/darkblue.png",
  purple: "/purple.png",
};

export default function AvatarColored({
  hoodColorId = "default",
  className = "",
  style,
}: Props) {
  const src = AVATAR_IMAGE_BY_COLOR[hoodColorId] ?? AVATAR_IMAGE_BY_COLOR.default;

  return (
    <div
      className={`relative ${className}`}
      style={{ aspectRatio: "1023 / 1537", ...style }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="아바타" className="block h-full w-full object-contain" />
    </div>
  );
}
