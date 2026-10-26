'use client';
/**
 * The hand: a second signed-distance field baked and spread through the same
 * pipeline as the bust, drawn with the same beads under the same key. One
 * curl uniform cups and opens it about every knuckle hinge.
 */
import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { useSystem } from '@/stores/system';
import { useEmbody } from '@/stores/embody';
import { live } from '@/render/live';
import { bakedHand, type HandBake } from './figureBake';
import { handPoseGLSL } from './handData';
import { BEAD_FRAGMENT_HEAD, BEAD_FRAGMENT_SPHERE, BEAD_VARYINGS, BEAD_VERTEX_TAIL } from './beads';
import { handState, palmAnchor, startPresent, updateHand } from './handRig';

const keyWorld = new THREE.Vector3(-0.75, 0.65, 0.55).normalize();
const anchor = new THREE.Vector3();

function build(b: HandBake) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
  g.setAttribute('aNrm', new THREE.BufferAttribute(b.normals, 3));
  g.setAttribute('aBone', new THREE.BufferAttribute(b.bones, 1));
  const rnd = new Float32Array(b.count);
  for (let i = 0; i < b.count; i++) rnd[i] = Math.random();
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uHand: { value: new THREE.Matrix4() },
      uCurl: { value: 0.6 },
      uMaterialize: { value: 0 },
      uBeadR: { value: b.lattice * 0.8 },
      uPx: { value: 500 },
      uKeyView: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uHand;
      uniform float uCurl, uMaterialize, uBeadR, uPx;
      attribute vec3 aNrm;
      attribute float aBone;
      attribute float aRand;
      ${BEAD_VARYINGS}
      ${handPoseGLSL()}
      void main() {
        vec3 p = position;
        vec3 n = aNrm;
        poseHand(p, n, aBone, uCurl);
        vec3 worldPos = (uHand * vec4(p, 1.0)).xyz;
        vec3 worldN = normalize(mat3(uHand) * n);
        float radius = uBeadR;
        // stochastic materialisation, not a ghostly fade
        float visible = step(aRand, uMaterialize);
        float maxPx = 256.0;
        ${BEAD_VERTEX_TAIL}
      }
    `,
    fragmentShader: /* glsl */ `
      ${BEAD_VARYINGS}
      ${BEAD_FRAGMENT_HEAD}
      void main() {
        ${BEAD_FRAGMENT_SPHERE}
        gl_FragColor = vec4(beadShade(normalize(vNView), bn, nz), 1.0);
      }
    `,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 21;
  return { points, mat };
}

export function Hand() {
  const { camera, size, gl } = useThree();
  const tier = useSystem((s) => s.tier);
  const [bake, setBake] = useState<HandBake | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const b = bakedHand(tier);
      if (b) {
        setBake(b);
        window.clearInterval(id);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [tier]);

  const built = useMemo(() => (bake ? build(bake) : null), [bake]);
  useEffect(() => () => built?.points.geometry.dispose(), [built]);

  // A new presentation raises the hand; with no hand baked yet the panel
  // slides in from the edge instead.
  useEffect(
    () =>
      useEmbody.subscribe((s, prev) => {
        if (s.carrying && s.carrying !== prev.carrying && built) startPresent(s.carrying, clock.time);
        else if (s.carrying && !built) useEmbody.getState().setCarrying(null);
      }),
    [built],
  );

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const t = clock.embodyPhase === 'HUMANOID_ACTIVE' ? updateHand(clock.time, cam) : -1;
    if (!built) return;
    built.points.visible = t >= 0 && handState.visible;
    const u = built.mat.uniforms;
    (u.uHand.value as THREE.Matrix4).copy(handState.matrix);
    u.uCurl.value = handState.curl;
    u.uMaterialize.value = handState.materialize;
    u.uPx.value = (size.height * gl.getPixelRatio() * 0.5) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    (u.uKeyView.value as THREE.Vector3).copy(keyWorld).transformDirection(camera.matrixWorldInverse);

    // publish the held panel's anchor in screen space, every frame
    const carrying = useEmbody.getState().carrying;
    if (t >= 0 && carrying && !handState.released) {
      palmAnchor(anchor);
      live.panelGaze.copy(anchor);
      live.panelGazeUntil = performance.now() + 2500;
      anchor.project(camera);
      live.panelAnchor.x = ((anchor.x + 1) / 2) * size.width;
      live.panelAnchor.y = ((1 - anchor.y) / 2) * size.height;
      live.panelAnchor.visible = true;
    } else if (live.panelAnchor.visible) {
      live.panelAnchor.visible = false;
      if (carrying) useEmbody.getState().setCarrying(null);
    }
  }, -2);

  return built ? <primitive object={built.points} /> : null;
}

export function handReady(tier: number) {
  return !!bakedHand(tier as 0 | 1 | 2 | 3);
}
