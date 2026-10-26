'use client';
/**
 * Infinite floor. One shader, five surface styles (lattice, plate, glass,
 * grate, water) cross-faded when the world changes. Also carries the wake
 * wave's ground ring.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { live } from '../live';
import { useWorld } from '@/stores/world';
import { WORLDS } from '../world/worlds';
import { approach } from '@/core/spring';

const STYLE = { lattice: 0, plate: 1, glass: 2, grate: 3, water: 4, none: 5 } as const;

export function Floor() {
  const from = useRef<number>(0);
  const to = useRef<number>(0);
  const mix = useRef(1);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uFog: { value: new THREE.Color() },
          uFogDensity: { value: 0.05 },
          uA: { value: 0 },
          uB: { value: 0 },
          uMix: { value: 1 },
          uT: { value: 0 },
          uWake: { value: -1 },
          uDim: { value: 0 },
          uMarket: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor, uFog;
          uniform float uFogDensity, uA, uB, uMix, uT, uWake, uDim, uMarket;
          varying vec3 vW;
          float gridLine(vec2 p, float s, float w) {
            vec2 g = abs(fract(p / s - 0.5) - 0.5) * s;
            vec2 fw = fwidth(p) * 1.2;
            vec2 l = 1.0 - smoothstep(vec2(w) - fw, vec2(w) + fw, g);
            return max(l.x, l.y);
          }
          float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
          float style(float s, vec2 p) {
            if (s < 0.5) return gridLine(p, 1.0, 0.008) * 0.7 + gridLine(p, 0.25, 0.004) * 0.22;
            if (s < 1.5) { float g = gridLine(p, 1.6, 0.012); float cell = hash(floor(p / 1.6)); return g * 0.6 + step(0.93, cell) * 0.12; }
            if (s < 2.5) return gridLine(p, 2.0, 0.006) * 0.35 + 0.08 * (0.5 + 0.5 * sin(p.x * 0.35 + p.y * 0.2));
            if (s < 3.5) return gridLine(vec2(p.x, 0.0), 0.12, 0.012) * 0.45 + gridLine(p, 1.2, 0.02) * 0.4;
            if (s < 4.5) {
              float w = sin(p.x * 1.7 + uT * 0.8) * sin(p.y * 1.3 - uT * 0.6) + sin((p.x + p.y) * 0.9 + uT * 0.5);
              return 0.12 + 0.18 * pow(clamp(w * 0.5 + 0.5, 0.0, 1.0), 6.0);
            }
            return 0.0;
          }
          void main() {
            vec2 p = vW.xz;
            float v = mix(style(uA, p), style(uB, p), uMix);
            float dist = length(vW.xz - cameraPosition.xz);
            float fog = exp(-pow(uFogDensity * dist * 1.1, 2.0));
            float horizon = smoothstep(26.0, 3.0, dist);
            // wake wave: a ring rolling out across the floor
            float wake = 0.0;
            if (uWake >= 0.0) {
              float r = length(vW.xz - vec2(0.0, 0.0));
              float front = uWake * 7.0;
              wake = exp(-pow((r - front) * 1.6, 2.0)) * (1.0 - clamp(uWake / 2.2, 0.0, 1.0));
            }
            vec3 col = uColor * v * (1.0 - uMarket * 0.6) + vec3(0.6, 0.8, 1.0) * wake * 0.8;
            float a = (v * 0.9 + wake) * fog * horizon * (1.0 - uDim);
            gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
          }
        `,
      }),
    [],
  );

  useFrame(() => {
    const target = STYLE[WORLDS[useWorld.getState().world].floor];
    if (target !== to.current) {
      from.current = mix.current < 0.5 ? from.current : to.current;
      to.current = target;
      mix.current = 0;
    }
    mix.current = approach(mix.current, 1, 1.2, clock.dt);
    const u = mat.uniforms;
    u.uA.value = from.current;
    u.uB.value = to.current;
    u.uMix.value = mix.current;
    u.uT.value = clock.motionTime;
    (u.uColor.value as THREE.Color).copy(live.floorColor);
    (u.uFog.value as THREE.Color).copy(live.fog);
    u.uFogDensity.value = live.fogDensity;
    u.uWake.value = clock.wakeT;
    u.uDim.value = clock.embody.collapse;
    u.uMarket.value = useWorld.getState().marketFloor ? 1 : 0;
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} renderOrder={0}>
      <planeGeometry args={[80, 80]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
