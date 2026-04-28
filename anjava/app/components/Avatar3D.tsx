"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Suspense, useRef } from "react";
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

function HoodieSprite({ hoodHex }: { hoodHex: string }) {
  const texture = useTexture("/avatar.png");
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.18;
    groupRef.current.position.y = Math.sin(t * 1.2) * 0.05;
  });

  return (
    <group ref={groupRef}>
      {/* avatar.png 스프라이트 */}
      <mesh>
        <planeGeometry args={[2.2, 2.8]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      {/* 후드 색상 오버레이 — multiply 블렌딩으로 회색 후드에 색상 적용 */}
      <mesh position={[0, -0.55, 0.01]}>
        <planeGeometry args={[2.2, 1.7]} />
        <meshBasicMaterial
          color={hoodHex}
          transparent
          opacity={0.5}
          blending={THREE.MultiplyBlending}
          depthWrite={false}
        />
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
