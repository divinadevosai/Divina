'use client';
/** Floating motes. Drift reads motionTime, so with motion locked they are exactly still. */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { live } from '../live';
import { useSystem } from '@/stores/system';

const COUNTS = [900, 1800, 3200, 5200];

export function Dust() {
  const tier = useSystem((s) => s.tier);
  const { points, mat } = useMemo(() => {
    const n = COUNTS[tier];
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 11;
      pos[i * 3 + 1] = Math.random() * 6.5 - 0.2;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * 11 - 1.5;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uT: { value: 0 },
        uColor: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uFogDensity: { value: 0.05 },
        uOpacity: { value: 1 },
        uPx: { value: 1 },
        uDensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uT, uPx, uDensity;
        varying float vA;
        varying float vDist;
        void main() {
          vec3 p = position;
          float s = aSeed * 6.2831;
          p.x += sin(uT * 0.11 + s) * 0.45;
          p.z += cos(uT * 0.09 + s * 1.3) * 0.45;
          p.y = mod(p.y + uT * (0.03 + aSeed * 0.05) + 0.2, 6.7) - 0.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDist = -mv.z;
          float keep = step(aSeed, uDensity);
          vA = keep * (0.35 + 0.65 * fract(aSeed * 91.7));
          gl_PointSize = keep * uPx * (1.4 + aSeed * 2.6) * (6.0 / max(vDist, 0.5));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uFog;
        uniform float uFogDensity, uOpacity;
        varying float vA;
        varying float vDist;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(q, q);
          if (r2 > 1.0) discard;
          float fog = exp(-pow(uFogDensity * vDist, 2.0));
          float a = exp(-r2 * 3.5) * vA * uOpacity * (0.25 + 0.75 * fog);
          gl_FragColor = vec4(uColor * a * 0.55, 1.0);
        }
      `,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, mat };
  }, [tier]);

  useFrame((state) => {
    const u = mat.uniforms;
    u.uT.value = clock.motionTime;
    (u.uColor.value as THREE.Color).copy(live.dust);
    (u.uFog.value as THREE.Color).copy(live.fog);
    u.uFogDensity.value = live.fogDensity;
    u.uDensity.value = live.dustDensity;
    u.uPx.value = state.gl.getPixelRatio() * (state.size.height / 900);
    // The dust is drawn into the core after the cards have gone.
    u.uOpacity.value = 1 - clock.embody.collapse;
  });

  return <primitive object={points} />;
}
