'use client';
/**
 * Atmospheric depth: a large inverted sphere with layered fbm fog, plus the
 * background colour. No stars, no galaxies — just air with light in it.
 */
import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { live } from '../live';

export function FogVolume() {
  const scene = useThree((s) => s.scene);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uFog: { value: new THREE.Color() }, uKey: { value: new THREE.Color() }, uT: { value: 0 }, uDim: { value: 0 }, uDensity: { value: 0.05 } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uFog, uKey; uniform float uT, uDim, uDensity;
          varying vec3 vDir;
          float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float noise(vec3 x) {
            vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
          }
          float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            float n = fbm(d * 3.0 + vec3(uT * 0.015, 0.0, uT * 0.01));
            float band = exp(-pow((h - 0.05) * 3.2, 2.0));
            vec3 col = uFog;
            col += uKey * 0.035 * band * (0.6 + 0.8 * n) * (0.6 + uDensity * 6.0);
            col += uKey * 0.02 * smoothstep(0.2, 1.0, h) * n;
            col *= 1.0 - uDim * 0.55;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [],
  );

  useFrame(() => {
    const u = mat.uniforms;
    (u.uFog.value as THREE.Color).copy(live.fog);
    (u.uKey.value as THREE.Color).copy(live.key);
    u.uT.value = clock.motionTime;
    u.uDim.value = clock.embody.dim;
    u.uDensity.value = live.fogDensity;
    if (scene.background instanceof THREE.Color) scene.background.copy(live.fog);
    else scene.background = live.fog.clone();
  });

  return (
    <mesh renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[60, 32, 16]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
