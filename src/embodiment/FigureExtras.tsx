'use client';
/**
 * Eyes, the lip seam and the core's glow.
 *  - Two faint points of light settle into the eyes last.
 *  - The seam light sits just behind the lips, so it is only visible through
 *    the opening the jaw makes: a thin line that widens with the level. A bar
 *    across the mouth reads as tape.
 */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { BUST } from './sdf';
import { rig, headPoint } from './rig';
import { CORE } from '@/render/layout';

const glowMat = (color: THREE.Color) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color }, uI: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uI; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; float g = exp(-r * r * 6.0) * (1.0 - smoothstep(0.7, 1.0, r)); gl_FragColor = vec4(uColor * g * uI, 1.0); }
    `,
  });

const tmp = new THREE.Vector3();

export function FigureExtras() {
  const { eyes, seam, seamMat, core, coreMat, eyeMat, group } = useMemo(() => {
    const group = new THREE.Group();
    const eyeMat = glowMat(new THREE.Color(0.75, 0.88, 1.0));
    const eyes = [new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.018), eyeMat), new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.018), eyeMat)];
    eyes.forEach((e) => (e.renderOrder = 30));
    const seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.8, 1.4), toneMapped: false });
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), seamMat);
    const coreMat = glowMat(new THREE.Color(0.6, 0.8, 1.2));
    const core = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), coreMat);
    core.renderOrder = 25;
    group.add(...eyes, seam, core);
    return { eyes, seam, seamMat, core, coreMat, eyeMat, group };
  }, []);

  useFrame(({ camera }) => {
    const emb = clock.embody;
    group.visible = clock.embodied;
    if (!group.visible) return;
    // eyes ride the head, facing the viewer
    headPoint([BUST.eyeL[0], BUST.eyeL[1], BUST.eyeL[2] + 0.006], eyes[0].position);
    headPoint([BUST.eyeR[0], BUST.eyeR[1], BUST.eyeR[2] + 0.006], eyes[1].position);
    for (const e of eyes) e.quaternion.copy(camera.quaternion);
    eyeMat.uniforms.uI.value = emb.eyes * 0.55;
    // seam: inset behind the lips, oriented with the head
    headPoint([0, BUST.mouthY - rig.jaw * 0.05, 0.064], seam.position);
    seam.quaternion.copy(rig.headQ);
    seam.scale.set(0.042, 0.0015 + rig.mouth * 0.012, 1);
    seam.visible = rig.mouth > 0 && emb.body > 0.95;
    seamMat.color.setRGB(0.5 + rig.mouth * 0.3, 0.75 + rig.mouth * 0.2, 1.3);
    // core glow
    core.position.copy(CORE);
    core.quaternion.copy(camera.quaternion);
    coreMat.uniforms.uI.value = emb.core * 1.1;
    void tmp;
  }, -1);

  return <primitive object={group} />;
}
