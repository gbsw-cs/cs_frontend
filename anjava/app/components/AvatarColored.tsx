"use client";

import { useEffect, useRef } from "react";

// 각 색상 ID → RGB 타겟값
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

// 회색 픽셀(후드 영역)만 선택적으로 색 변환, 흰색(얼굴/손/발)과 어두운 픽셀(눈)은 그대로
function applyHoodColor(src: ImageData, rgb: [number, number, number]): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const [tr, tg, tb] = rgb;
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const r = out.data[i], g = out.data[i + 1], b = out.data[i + 2];
    const avg = (r + g + b) / 3;
    const chroma = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    // 회색: 채도 낮음 + 밝기 중간대(80~215) → 후드/옷 영역
    if (chroma < 20 && avg > 80 && avg < 215) {
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const rgb = HOOD_RGB[hoodColorId] ?? HOOD_RGB.zinc;

    if (srcRef.current) {
      ctx.putImageData(applyHoodColor(srcRef.current, rgb), 0, 0);
      return;
    }

    const img = new Image();
    img.src = "/avatar.png";
    img.onload = () => {
      if (!canvas || !ctx) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      srcRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.putImageData(applyHoodColor(srcRef.current, rgb), 0, 0);
    };
  }, [hoodColorId]);

  return <canvas ref={canvasRef} className={className} style={style} />;
}
