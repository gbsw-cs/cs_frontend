"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

export const HOOD_COLOR_HEX: Record<string, string> = {
  red:    "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green:  "#22c55e",
  blue:   "#3b82f6",
  navy:   "#1e40af",
  purple: "#a855f7",
  gray:   "#9ca3af",
  default: "#22c55e",
};

// CSS filter 방식: sepia → saturate → hue-rotate 로 회색 후드를 원하는 색으로 변환
export const HOOD_CSS_FILTER: Record<string, string> = {
  red:    "sepia(1) saturate(5) hue-rotate(300deg)",
  orange: "sepia(1) saturate(5) hue-rotate(0deg)",
  yellow: "sepia(1) saturate(5) hue-rotate(25deg)",
  green:  "sepia(1) saturate(3) hue-rotate(100deg)",
  blue:   "sepia(1) saturate(3) hue-rotate(185deg)",
  navy:   "sepia(1) saturate(6) hue-rotate(200deg) brightness(0.45)",
  purple: "sepia(1) saturate(3) hue-rotate(240deg)",
  gray:   "saturate(0)",
  default: "sepia(1) saturate(3) hue-rotate(100deg)",
};

function HoodieSprite({ hoodHex }: { hoodHex: string }) {
  const texture = useTexture("/avatar.png");
  const groupRef = useRef<THREE.Group>(null);

  // material.color acts as a multiplier on the texture — blends hoodie toward the chosen color
  const tintColor = useMemo(() => {
    const base = new THREE.Color(1, 1, 1);
    const target = new THREE.Color(hoodHex);
    return "#" + base.lerp(target, 0.5).getHexString();
  }, [hoodHex]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.18;
    groupRef.current.position.y = Math.sin(t * 1.2) * 0.05;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <planeGeometry args={[2.2, 2.8]} />
        <meshBasicMaterial map={texture} color={tintColor} />
      </mesh>
    </group>
  );
}

export default function Avatar3D({ hoodColorId = "default" }: { hoodColorId?: string }) {
  const hex = HOOD_COLOR_HEX[hoodColorId] ?? HOOD_COLOR_HEX.default;
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 38 }}
      dpr={[1, 2]}
      style={{ background: "white" }}
    >
      <ambientLight intensity={1.5} />
      <Suspense fallback={null}>
        <HoodieSprite hoodHex={hex} />
      </Suspense>
    </Canvas>
  );
}
