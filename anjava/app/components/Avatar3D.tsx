"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

export const HOOD_COLOR_HEX: Record<string, string> = {
  default: "#6ee7b7",
  sky:     "#7dd3fc",
  violet:  "#c4b5fd",
  rose:    "#fda4af",
  amber:   "#fcd34d",
  orange:  "#fdba74",
  pink:    "#f9a8d4",
  zinc:    "#d4d4d8",
};

// CSS filter 방식: sepia → saturate → hue-rotate 로 회색 후드를 원하는 색으로 변환
export const HOOD_CSS_FILTER: Record<string, string> = {
  default: "sepia(1) saturate(2) hue-rotate(100deg)",
  sky:     "sepia(1) saturate(2) hue-rotate(185deg)",
  violet:  "sepia(1) saturate(2) hue-rotate(240deg)",
  rose:    "sepia(1) saturate(3) hue-rotate(310deg)",
  amber:   "sepia(1) saturate(3) hue-rotate(10deg)",
  orange:  "sepia(1) saturate(4) hue-rotate(0deg)",
  pink:    "sepia(1) saturate(4) hue-rotate(300deg)",
  zinc:    "none",
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
