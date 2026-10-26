'use client';
/**
 * ONE buffer, ONE clock. Every particle carries three keyframes — on its
 * card, in the core, on the figure — and the timeline float moves it through
 * them. The card keyframe is recomputed from the card's published world
 * matrix every frame, so a particle sits on its face pixel-for-pixel while
 * the card turns toward the core.
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { live } from '@/render/live';
import { CARD_H, CARD_W, CORE, FIGURE_ORIGIN } from '@/render/layout';
import { MODULE_IDS } from '@/modules/ids';
import { BEAD_FRAGMENT_HEAD, BEAD_FRAGMENT_SPHERE, BEAD_VARYINGS, BEAD_VERTEX_TAIL } from './beads';
import { BUST } from './sdf';
import { rig } from './rig';
import type { JourneyAttributes } from './capture';

const N_CARDS = MODULE_IDS.length;

/**
 * fill: the backing layer. The same particles, landed only, sunk just under
 * the skin as bigger, darker beads, so any patch the bake left thin reads as
 * more figure rather than a hole through it.
 */
export function makeJourneyMaterial(fill = false) {
  return new THREE.ShaderMaterial({
    defines: fill ? { FILL: '' } : {},
    uniforms: {
      uCardM: { value: Array.from({ length: N_CARDS }, () => new THREE.Matrix4()) },
      uCardSize: { value: new THREE.Vector2(CARD_W, CARD_H) },
      uT: { value: 0 },
      uCore: { value: CORE.clone() },
      uFigOrigin: { value: FIGURE_ORIGIN.clone() },
      uNeck: { value: new THREE.Vector3(...BUST.neckPivot) },
      uJawHinge: { value: new THREE.Vector3(...BUST.jawHinge) },
      uHeadR: { value: new THREE.Matrix3() },
      uJaw: { value: 0 },
      uBreath: { value: 0 },
      uMouth: { value: 0 },
      uCoreGlow: { value: 0 },
      uBeadR: { value: 0.004 },
      uPx: { value: 500 },
      uKeyView: { value: new THREE.Vector3(0.4, 0.6, 0.7) },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uCardM[${N_CARDS}];
      uniform vec2 uCardSize;
      uniform float uT, uJaw, uBreath, uBeadR, uPx, uCoreGlow;
      uniform vec3 uCore, uFigOrigin, uNeck, uJawHinge;
      uniform mat3 uHeadR;
      attribute vec4 aCard;
      attribute vec3 aOrigin;
      attribute vec3 aColor;
      attribute vec3 aFig;
      attribute vec3 aNrm;
      attribute vec4 aRegion;
      attribute vec4 aTimes;
      attribute vec3 aBurst;
      attribute vec2 aRand;
      varying vec3 vColor;
      varying float vLand;
      varying float vSeam;
      ${BEAD_VARYINGS}

      vec3 bez(vec3 a, vec3 b, vec3 c, float t) { float u = 1.0 - t; return u * u * a + 2.0 * u * t * b + t * t * c; }
      vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
      vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }

      void main() {
        float t = uT;
        vec3 start = aOrigin;
        vec3 cardN = vec3(0.0, 0.0, 1.0);
        if (aCard.x >= 0.0) {
          mat4 M = uCardM[int(aCard.x + 0.5)];
          start = (M * vec4((aCard.yz - 0.5) * uCardSize, 0.003, 1.0)).xyz;
          cardN = normalize(mat3(M) * vec3(0.0, 0.0, 1.0));
        }

        // figure keyframe, posed by the rig (rigid head, hinged jaw, breath)
        vec3 f = aFig;
        vec3 n = aNrm;
        if (aRegion.y > 0.0) {
          f = uJawHinge + rotX(f - uJawHinge, uJaw * aRegion.y);
          n = rotX(n, uJaw * aRegion.y);
        }
        f += vec3(0.0, 0.0032, 0.0024) * uBreath * aRegion.z;
        vec3 hf = uNeck + uHeadR * (f - uNeck);
        f = mix(f, hf, aRegion.x);
        n = normalize(mix(n, uHeadR * n, aRegion.x));
        vec3 fig = uFigOrigin + f;

        // core keyframe: a slow swirl inside a small bright point
        vec3 dir = normalize(aBurst + vec3(0.0001));
        vec3 corePos = uCore + rotY(dir, t * 2.4 + aRand.x * 6.2831) * (0.03 + 0.07 * aRand.y);

        float leave = aTimes.x, arrive = aTimes.y, depart = aTimes.z, land = aTimes.w;
        vec3 pos;
        float landed = 0.0;
        float visible = 1.0;
        if (t < leave) {
          pos = start;
          visible = 0.0;
        } else if (t < arrive) {
          float s = (t - leave) / (arrive - leave);
          s = s * s * (3.0 - 2.0 * s);
          vec3 ctrl = start + cardN * (0.3 + 0.25 * aRand.y) + dir * 0.35;
          pos = bez(start, ctrl, corePos, s);
        } else if (t < depart) {
          pos = corePos;
        } else if (t < land) {
          float s = (t - depart) / (land - depart);
          float e = 1.0 - pow(1.0 - s, 2.2);
          pos = bez(corePos, uCore + aBurst, fig, e);
          landed = smoothstep(0.75, 1.0, s);
        } else {
          pos = fig;
          landed = 1.0;
        }

        float hot = aCard.w < 0.5 ? 0.5 : aCard.w < 1.5 ? 0.62 : aCard.w < 2.5 ? 0.85 : 0.5;
        float radius = mix(uBeadR * hot, uBeadR, landed);
        vec3 inCore = step(arrive, t) * (1.0 - step(depart, t)) * vec3(1.0);
        vColor = aColor * (1.0 + inCore.x * uCoreGlow * 1.5);
        vLand = landed;
        vSeam = aRegion.w;
        // fragments in flight never bloat as they pass the viewer
        float maxPx = mix(9.0 * uPx / 800.0, 256.0, landed);
        vec3 worldPos = pos;
        vec3 worldN = mix(-normalize(start - uCore + vec3(0.0001)), n, landed);
        #ifdef FILL
        if (landed < 0.999) visible = 0.0;
        worldPos -= n * uBeadR * 0.9;
        radius *= 1.7;
        #endif
        ${BEAD_VERTEX_TAIL}
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uMouth;
      varying vec3 vColor;
      varying float vLand;
      varying float vSeam;
      ${BEAD_VARYINGS}
      ${BEAD_FRAGMENT_HEAD}
      void main() {
        ${BEAD_FRAGMENT_SPHERE}
        vec3 figure = beadShade(normalize(vNView), bn, nz);
        vec3 hot = vColor * (0.65 + 0.35 * nz);
        vec3 c = mix(hot, figure, vLand);
        // the seam between the lips lights with the voice
        c += vec3(0.45, 0.72, 1.0) * vSeam * uMouth * 1.4 * vLand;
        #ifdef FILL
        c *= 0.62;
        #endif
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

export function makeJourneyGeometry(a: JourneyAttributes) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.fig, 3));
  g.setAttribute('aCard', new THREE.BufferAttribute(a.card, 4));
  g.setAttribute('aOrigin', new THREE.BufferAttribute(a.origin, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(a.color, 3));
  g.setAttribute('aFig', new THREE.BufferAttribute(a.fig, 3));
  g.setAttribute('aNrm', new THREE.BufferAttribute(a.nrm, 3));
  g.setAttribute('aRegion', new THREE.BufferAttribute(a.region, 4));
  g.setAttribute('aTimes', new THREE.BufferAttribute(a.times, 4));
  g.setAttribute('aBurst', new THREE.BufferAttribute(a.burst, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(a.rand, 2));
  return g;
}

const keyWorld = new THREE.Vector3(-0.75, 0.65, 0.55).normalize();

export function Journey({ attrs, beadRadius }: { attrs: JourneyAttributes; beadRadius: number }) {
  const { camera, size, gl } = useThree();
  const { points, mat, fill, fillMat } = useMemo(() => {
    const mat = makeJourneyMaterial();
    const geo = makeJourneyGeometry(attrs);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 20;
    // shares the uniforms, so it poses and lights with the figure for free
    const fillMat = makeJourneyMaterial(true);
    fillMat.uniforms = mat.uniforms;
    const fill = new THREE.Points(geo, fillMat);
    fill.frustumCulled = false;
    fill.renderOrder = 19;
    return { points, mat, fill, fillMat };
  }, [attrs]);

  useEffect(
    () => () => {
      points.geometry.dispose();
      mat.dispose();
      fillMat.dispose();
    },
    [points, mat, fillMat],
  );

  useFrame(() => {
    const u = mat.uniforms;
    const Ms = u.uCardM.value as THREE.Matrix4[];
    // ten matrices copied per frame
    for (let i = 0; i < N_CARDS; i++) Ms[i].fromArray(live.cardMatrices, i * 16);
    u.uT.value = clock.embodyT;
    (u.uHeadR.value as THREE.Matrix3).copy(rig.headR);
    u.uJaw.value = rig.jaw;
    u.uBreath.value = rig.breath;
    u.uMouth.value = rig.seam;
    u.uCoreGlow.value = clock.embody.core;
    u.uBeadR.value = beadRadius;
    const cam = camera as THREE.PerspectiveCamera;
    u.uPx.value = (size.height * gl.getPixelRatio() * 0.5) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    (u.uKeyView.value as THREE.Vector3).copy(keyWorld).transformDirection(camera.matrixWorldInverse);
  }, -2);

  return (
    <>
      <primitive object={fill} />
      <primitive object={points} />
    </>
  );
}
