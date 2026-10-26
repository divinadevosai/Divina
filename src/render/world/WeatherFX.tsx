'use client';
/** The room reflects the sky while Weather is open: rain, snow, fog, sun. */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from '@/stores/world';
import { clock } from '@/core/clock/masterClock';
import { approach } from '@/core/spring';

const N = 2600;

export function WeatherFX() {
  const { lines, mat } = useMemo(() => {
    const pos = new Float32Array(N * 2 * 3);
    const seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() * 2 - 1) * 9;
      const y = Math.random() * 8;
      const z = -Math.random() * 12 + 3;
      const s = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      seed[i * 2] = s;
      seed[i * 2 + 1] = s;
    }
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) end[i * 2 + 1] = 1;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uI: { value: 0 }, uSnow: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; attribute float aEnd;
        uniform float uT, uSnow;
        varying float vA;
        void main() {
          vec3 p = position;
          float speed = mix(7.0 + aSeed * 3.0, 0.6 + aSeed * 0.4, uSnow);
          p.y = mod(p.y - uT * speed, 8.0);
          p.x += uSnow * sin(uT * 0.8 + aSeed * 30.0) * 0.3;
          p.y -= aEnd * mix(0.22, 0.02, uSnow);
          vA = mix(0.35 + 0.65 * aEnd, 1.0, uSnow);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uI; varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.55, 0.7, 1.0) * uI * vA * 0.35, 1.0); }
      `,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    return { lines, mat };
  }, []);

  useFrame(() => {
    const w = useWorld.getState();
    const precip = w.weatherActive && (w.weather === 'rain' || w.weather === 'storm' || w.weather === 'snow');
    mat.uniforms.uI.value = approach(mat.uniforms.uI.value as number, precip ? 1 : 0, 1.2, clock.dt);
    mat.uniforms.uSnow.value = w.weather === 'snow' ? 1 : 0;
    // precipitation is presented data the user asked for, so it falls on wall time
    mat.uniforms.uT.value = clock.time;
    lines.visible = (mat.uniforms.uI.value as number) > 0.001 && !clock.embodied;
  });

  return <primitive object={lines} />;
}
