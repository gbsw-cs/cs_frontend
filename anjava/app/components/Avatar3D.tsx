"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function Robot({ color = "#ffffff" }: { color?: string }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = Math.sin(t * 0.5) * 0.25;
    group.current.position.y = Math.sin(t * 1.5) * 0.04 - 0.15;
  });

  return (
    <group ref={group} scale={0.7}>
      {/* 몸통 — 동그랗게 */}
      <mesh position={[0, -0.15, 0]} castShadow>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </mesh>

      {/* 머리 — 크고 동그랗게 (치비 스타일) */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.58, 32, 32]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.05} />
      </mesh>

      {/* 왼쪽 눈 — 크고 귀엽게 */}
      <mesh position={[-0.18, 0.58, 0.5]}>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial color="#1f2937" roughness={0.2} />
      </mesh>
      {/* 왼쪽 눈 반짝임 */}
      <mesh position={[-0.15, 0.62, 0.57]}>
        <sphereGeometry args={[0.028, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </mesh>

      {/* 오른쪽 눈 */}
      <mesh position={[0.18, 0.58, 0.5]}>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial color="#1f2937" roughness={0.2} />
      </mesh>
      {/* 오른쪽 눈 반짝임 */}
      <mesh position={[0.21, 0.62, 0.57]}>
        <sphereGeometry args={[0.028, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </mesh>

      {/* 왼쪽 볼터치 */}
      <mesh position={[-0.34, 0.42, 0.43]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#fca5a5" transparent opacity={0.55} />
      </mesh>
      {/* 오른쪽 볼터치 */}
      <mesh position={[0.34, 0.42, 0.43]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#fca5a5" transparent opacity={0.55} />
      </mesh>

      {/* 작은 입 */}
      <mesh position={[0, 0.42, 0.55]} rotation={[0, 0, 0]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>

      {/* 왼팔 — 짧고 둥글게 */}
      <mesh position={[-0.52, -0.15, 0]} castShadow>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </mesh>

      {/* 오른팔 */}
      <mesh position={[0.52, -0.15, 0]} castShadow>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </mesh>

      {/* 왼발 */}
      <mesh position={[-0.2, -0.55, 0.1]} castShadow>
        <sphereGeometry args={[0.14, 20, 20]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </mesh>

      {/* 오른발 */}
      <mesh position={[0.2, -0.55, 0.1]} castShadow>
        <sphereGeometry args={[0.14, 20, 20]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </mesh>

      {/* 안테나 공 */}
      <mesh position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#2563EB" emissive="#2563EB" emissiveIntensity={0.5} />
      </mesh>
      {/* 안테나 */}
      <mesh position={[0, 1.13, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.12]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

export default function Avatar3D({ color = "#ffffff" }: { color?: string }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 35 }}
      dpr={[1, 2]}
      shadows
    >
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[3, 5, 3]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3, 2, -3]} intensity={0.3} />
      <Robot color={color} />
    </Canvas>
  );
}
