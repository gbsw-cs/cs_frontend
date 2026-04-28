"use client";

import { useEffect, useRef } from "react";

const HOOD_RGB: Record<string, [number, number, number]> = {
  default: [110, 231, 183],
  sky:     [125, 211, 252],
  violet:  [196, 181, 253],
  rose:    [253, 164, 175],
  amber:   [252, 211, 77],
  orange:  [253, 186, 116],
  pink:    [249, 168, 212],
  zinc:    [180, 180, 185],
};

function applyHoodColor(src: ImageData, rgb: [number, number, number]): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const [tr, tg, tb] = rgb;
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const r = out.data[i], g = out.data[i + 1], b = out.data[i + 2];
    const avg = (r + g + b) / 3;
    const chroma = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    // 흰색(얼굴/손/발/배경: avg≥224)과 검정(눈: avg≤55)은 제외
    // 중간 밝기 + 낮은 채도 = 후드/옷 영역
    if (chroma < 22 && avg > 55 && avg < 224) {
      const t = avg / 190;
      out.data[i]     = Math.min(255, Math.round(tr * t));
      out.data[i + 1] = Math.min(255, Math.round(tg * t));
      out.data[i + 2] = Math.min(255, Math.round(tb * t));
    }
  }
  return out;
}

type Props = {
  hoodColorId?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function AvatarColored({ hoodColorId = "default", className = "", style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const srcRef = useRef<ImageData | null>(null);
  // ref로 최신 colorId를 유지해 onload 클로저의 stale 값 방지
  const colorIdRef = useRef(hoodColorId);
  useEffect(() => { colorIdRef.current = hoodColorId; });

  // 이미지 최초 1회 로드
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let cancelled = false;
    const img = new Image();
    img.src = "/avatar.png";
    img.onload = () => {
      if (cancelled) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      srcRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rgb = HOOD_RGB[colorIdRef.current] ?? HOOD_RGB.zinc;
      ctx.putImageData(applyHoodColor(srcRef.current, rgb), 0, 0);
    };
    return () => { cancelled = true; };
  }, []);

  // hoodColorId 변경 시 재드로우
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !srcRef.current || canvas.width === 0) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const rgb = HOOD_RGB[hoodColorId] ?? HOOD_RGB.zinc;
    ctx.putImageData(applyHoodColor(srcRef.current, rgb), 0, 0);
  }, [hoodColorId]);

  return <canvas ref={canvasRef} className={className} style={style} />;
}
