'use client';
/** Soft volumetric light shafts from above. Sweep only while motion is on. */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { live } from '../live';

const BEAMS = [
  { x: -4.2, z: -6.5, r: 1.3, tilt: 0.16, phase: 0 },
  { x: 3.6, z: -7.5, r: 1.6, tilt: -0.14, phase: 1.7 },
  { x: 0.4, z: -9.5, r: 2.1, tilt: 0.05, phase: 3.1 },
  { x: -7.5, z: -2.5, r: 1.2, tilt: 0.2, phase: 4.4 },
  { x: 7.8, z: -3.2, r: 1.4, tilt: -0.22, phase: 5.2 },
];

export function Beams() {
  const { group, mats } = useMemo(() => {
    const group = new THREE.Group();
    const mats: THREE.ShaderMaterial[] = [];
    for (const b of BEAMS) {
      const geo = new THREE.CylinderGeometry(b.r * 0.12, b.r, 11, 32, 1, true);
      geo.translate(0, -5.5, 0);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color() }, uI: { value: 0.5 }, uT: { value: 0 }, uPhase: { value: b.phase } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - w.xyz);
            vY = uv.y;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uI, uT, uPhase;
          varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
          void main() {
            float facing = abs(dot(normalize(vN), normalize(vV)));
            float core = pow(clamp(facing, 0.0, 1.0), 2.2);
            float fall = smoothstep(0.0, 0.55, vY) * (0.35 + 0.65 * vY);
            float motes = 0.85 + 0.15 * sin(vW.y * 3.0 + uT * 0.6 + uPhase);
            float a = core * fall * motes * uI * 0.11;
            gl_FragColor = vec4(uColor * a, 1.0);
          }
        `,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, 10.5, b.z);
      mesh.rotation.z = b.tilt;
      mesh.userData.b = b;
      group.add(mesh);
      mats.push(mat);
    }
    return { group, mats };
  }, []);

  useFrame(() => {
    const mt = clock.motionTime;
    const m = clock.motion;
    group.children.forEach((mesh, i) => {
      const b = mesh.userData.b as (typeof BEAMS)[number];
      mesh.rotation.z = b.tilt + m * 0.06 * Math.sin(mt * 0.12 + b.phase);
      mesh.rotation.x = m * 0.05 * Math.cos(mt * 0.09 + b.phase);
      const u = mats[i].uniforms;
      (u.uColor.value as THREE.Color).copy(live.beam);
      u.uI.value = live.beamIntensity * (1 - clock.embody.collapse * 0.85);
      u.uT.value = mt;
    });
  });

  return <primitive object={group} />;
}
