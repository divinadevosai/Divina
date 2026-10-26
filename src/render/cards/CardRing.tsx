'use client';
/**
 * The ring. Ten holographic cards on an orbit around the viewer.
 *
 * One useFrame drives all cards. Discrete state comes from the ring store,
 * sequence envelopes from the master clock; per-frame physical state lives
 * in springs owned here. Nothing is handed to a physics simulation: a
 * released card returns to its slot on the orbit spring.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MODULE_IDS, type ModuleId } from '@/modules/ids';
import { MODULES } from '@/modules/meta';
import { hueRgb } from '@/modules/meta';
import { useRing, cardStateOf } from '@/stores/ring';
import { clock } from '@/core/clock/masterClock';
import { springs, window01, arriving, boot } from '@/core/motion/vocabulary';
import { spring1, spring3, stepSpring1, stepSpring3, type Spring1, type Spring3 } from '@/core/spring';
import { CARD_H, CARD_W, CORE, READING_POS, RING_RADIUS, RING_Y, SLOT } from '../layout';
import { live } from '../live';
import { handCursor } from '@/stores/gesture';
import { pointer } from '../pointer';
import { createCardMaterial, createHaloMaterial, BLUE, GOLD_THROW } from './cardMaterial';
import { getFace, faceWarning, setMaxAnisotropy, updateFaces } from './faces';
import { CARD_ERODE_SPAN } from '@/core/clock/timeline';
import { Bracket } from './Bracket';

interface CardRuntime {
  id: ModuleId;
  group: THREE.Group;
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  haloMat: THREE.ShaderMaterial;
  lift: Spring1;
  scale: Spring1;
  push: Spring1;
  read: Spring1;
  hover: Spring1;
  select: Spring1;
  gold: Spring1;
  focus: Spring1;
  pos: Spring3;
  mode: 'ring' | 'drag' | 'returning';
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();

function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function lookQuat(from: THREE.Vector3, to: THREE.Vector3, out: THREE.Quaternion) {
  // plane faces +Z: build a rotation whose +Z points from `from` to `to`
  tmpM.lookAt(to, from, UP);
  return out.setFromRotationMatrix(tmpM);
}

export function CardRing() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  // crisp text on cards seen at an angle
  useEffect(() => setMaxAnisotropy(gl.capabilities.getMaxAnisotropy()), [gl]);
  const ringSpring = useRef(spring1(0));
  const spreadSpring = useRef(spring1(1));
  const bootStart = useRef<number | null>(null);
  const { cards, root } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
    const haloGeo = new THREE.PlaneGeometry(CARD_W * 2.6, CARD_H * 2.3);
    const cards: CardRuntime[] = MODULES.map((m) => {
      const face = getFace(m.id);
      const accent = new THREE.Color(...hueRgb(m.hue, 0.8, 0.62));
      const mat = createCardMaterial(face.texture, accent);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.module = m.id;
      mesh.renderOrder = 10;
      const haloMat = createHaloMaterial();
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.z = -0.06;
      halo.renderOrder = 1;
      const group = new THREE.Group();
      group.add(halo, mesh);
      return {
        id: m.id,
        group,
        mesh,
        halo,
        mat,
        haloMat,
        lift: spring1(0),
        scale: spring1(1),
        push: spring1(0),
        read: spring1(0),
        hover: spring1(0),
        select: spring1(0),
        gold: spring1(0),
        focus: spring1(0),
        pos: spring3(),
        mode: 'ring',
      } satisfies CardRuntime as CardRuntime;
    });
    const root = new THREE.Group();
    for (const c of cards) root.add(c.group);
    return { cards, root };
  }, []);

  useFrame((state, rawDt) => {
    const dt = clock.dt || rawDt;
    const ring = useRing.getState();
    const pres = clock.presentation;
    const emb = clock.embody;
    const embT = clock.embodyT;
    const motion = clock.motion;
    const mt = clock.motionTime;
    if (bootStart.current === null) bootStart.current = clock.time;
    const since = clock.time - bootStart.current;

    updateFaces();

    // ── ring ─────────────────────────────────────────────────────
    ringSpring.current.target = ring.frontStep * SLOT;
    if (!ring.frozen) stepSpring1(ringSpring.current, springs.orbit, dt);
    live.ringAngle = ringSpring.current.x;
    spreadSpring.current.target = ring.spread;
    stepSpring1(spreadSpring.current, springs.homecoming, dt);

    // ── hover (hand first, mouse fallback) ───────────────────────
    const interactive = !clock.embodied && !clock.presentationActive && since > boot.hudIn - boot.firstCard;
    if (interactive) {
      let has = false;
      if (handCursor.visible) {
        ndc.set(handCursor.x * 2 - 1, -(handCursor.y * 2 - 1));
        has = true;
      } else if (pointer.inside && performance.now() - pointer.lastMove < 4000) {
        ndc.set(pointer.x, pointer.y);
        has = true;
      }
      let hit: ModuleId | null = null;
      if (has && !ring.dragging) {
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObjects(cards.map((c) => c.mesh), false);
        hit = (hits[0]?.object.userData.module as ModuleId | undefined) ?? null;
      }
      if (!ring.dragging && hit !== ring.hovered) ring.hover(hit);
    } else if (ring.hovered && !ring.dragging) ring.hover(null);

    // hand → world point for dragging, at the ring's depth
    const dragPoint = tmpV2;
    if (ring.dragging) {
      ndc.set(handCursor.visible ? handCursor.x * 2 - 1 : pointer.x, handCursor.visible ? -(handCursor.y * 2 - 1) : pointer.y);
      ray.setFromCamera(ndc, camera);
      const depth = 2.6 / Math.max(0.6, Math.min(1.6, handCursor.depth));
      dragPoint.copy(ray.ray.origin).addScaledVector(ray.ray.direction, depth);
    }

    const time = clock.time;
    cards.forEach((c, i) => {
      const st = cardStateOf(c.id, ring);
      const presenting = pres.module === c.id;
      const isTarget = presenting || ring.expanded === c.id;
      const theta = i * SLOT - live.ringAngle;
      const off = wrapAngle(theta);

      // step-back of unrelated cards (presentation, or another card expanded)
      c.push.target = (!isTarget && pres.module ? 0.95 * pres.stepBack : 0) + (!isTarget && ring.expanded ? 0.95 : 0);
      stepSpring1(c.push, springs.homecoming, dt);
      c.lift.target = st === 'hovered' ? 0.07 : st === 'selected' ? 0.04 : 0;
      stepSpring1(c.lift, springs.lift, dt);
      c.scale.target = st === 'dragging' ? 1.07 : st === 'hovered' ? 1.045 : st === 'selected' ? 1.03 : 1;
      stepSpring1(c.scale, springs.lift, dt);
      c.hover.target = st === 'hovered' || st === 'dragging' ? 1 : 0;
      stepSpring1(c.hover, springs.lift, dt);
      c.select.target = ring.selected.includes(c.id) ? 1 : 0;
      stepSpring1(c.select, springs.lift, dt);

      // reading pose: driven by the clock during the sequence, spring after
      if (presenting) {
        c.read.x = pres.flight;
        c.read.v = 0;
        c.read.target = pres.flight;
      } else {
        c.read.target = ring.expanded === c.id ? 1 : 0;
        stepSpring1(c.read, springs.homecoming, dt);
      }

      // ring slot pose — the centred card leans in toward the viewer (Focused)
      const centred = Math.max(0, 1 - Math.abs(off) / (SLOT * 0.62));
      c.focus.target = st === 'dragging' ? 0 : Math.pow(centred, 1.5);
      stepSpring1(c.focus, springs.lift, dt);
      const r = RING_RADIUS * spreadSpring.current.x + c.push.x - c.focus.x * 0.7;
      const floatY = motion * 0.035 * Math.sin(mt * 0.55 + i * 1.7);
      const floatR = motion * 0.02 * Math.sin(mt * 0.4 + i * 2.3);
      tmpV.set(r * Math.sin(theta), RING_Y + floatY + c.lift.x, -r * Math.cos(theta));
      lookQuat(tmpV, new THREE.Vector3(0, RING_Y, 0.35), tmpQ);
      if (floatR) tmpQ.multiply(tmpQ2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), floatR));

      // drag / return — springs, never physics
      if (ring.dragging === c.id) {
        if (c.mode === 'ring') c.pos.x = [tmpV.x, tmpV.y, tmpV.z];
        c.mode = 'drag';
        c.pos.target = [dragPoint.x, dragPoint.y, dragPoint.z];
        stepSpring3(c.pos, springs.tether, dt);
      } else if (c.mode === 'drag' || c.mode === 'returning') {
        c.mode = 'returning';
        c.pos.target = [tmpV.x, tmpV.y, tmpV.z];
        if (!stepSpring3(c.pos, springs.orbit, dt)) c.mode = 'ring';
      }
      const g = c.group;
      if (c.mode !== 'ring') {
        g.position.set(c.pos.x[0], c.pos.x[1], c.pos.x[2]);
        // momentum tilt from the spring's velocity
        const tilt = THREE.MathUtils.clamp(-c.pos.v[0] * 0.12, -0.35, 0.35);
        lookQuat(g.position, camera.position, g.quaternion);
        g.quaternion.multiply(tmpQ2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
      } else {
        g.position.copy(tmpV);
        g.quaternion.copy(tmpQ);
      }

      // blend toward reading position
      if (c.read.x > 0) {
        const k = c.read.x;
        tmpV.copy(READING_POS);
        g.position.lerp(tmpV, k);
        lookQuat(READING_POS, camera.position, tmpQ2);
        g.quaternion.slerp(tmpQ2, k);
      }

      // embodiment: turn toward the core as the face erodes
      const erodeStart = live.cardErodeStart[i];
      if (clock.embodied && erodeStart < 900) {
        const k = window01(embT, erodeStart - 0.5, erodeStart + CARD_ERODE_SPAN);
        if (k > 0) {
          lookQuat(g.position, CORE, tmpQ2);
          g.quaternion.slerp(tmpQ2, arriving(k) * 0.85);
          g.position.lerp(CORE, k * 0.12);
        }
      }

      // boot arrival
      const arrive = arriving(window01(since, boot.firstCard + i * boot.cardEvery, boot.firstCard + i * boot.cardEvery + 1.2));
      const s = c.scale.x * (0.86 + 0.14 * arrive);
      g.scale.setScalar(s);
      g.position.y -= (1 - arrive) * 0.35;

      // earned gold: continuous with the ring's position
      const warned = faceWarning(c.id);
      c.gold.target = warned || clock.embodied ? 0 : Math.pow(centred, 2.4) * (1 - c.read.x * 0.5);
      stepSpring1(c.gold, springs.lift, dt);

      const u = c.mat.uniforms;
      u.uHover.value = c.hover.x;
      u.uSelect.value = c.select.x;
      u.uGold.value = warned ? 0 : c.gold.x;
      u.uWarn.value = warned ? 1 : 0;
      u.uDrag.value = ring.dragging === c.id ? 1 : 0;
      u.uTime.value = mt;
      u.uOpacity.value = arrive;
      u.uDim.value = Math.max(!isTarget && pres.module ? pres.stepBack * 0.55 : 0, !isTarget && ring.expanded ? 0.6 : 0, emb.dim * 0.5);
      u.uScan.value = presenting ? pres.scan : -1;
      u.uPulse.value = ring.selected.includes(c.id) && clock.selectT >= 0 ? Math.min(1, clock.selectT / 1.1) : -1;
      u.uErodeStart.value = erodeStart;
      u.uErodeSpan.value = CARD_ERODE_SPAN;
      u.uEmbodyT.value = embT;

      const h = c.haloMat.uniforms;
      const gold = u.uGold.value as number;
      (h.uColor.value as THREE.Color).copy(BLUE).lerp(GOLD_THROW, gold);
      h.uStrength.value = (0.04 + 0.08 * c.hover.x + 0.08 * c.select.x + 0.05 * gold) * arrive * (1 - emb.dissolve);
      h.uSpread.value = 0.62 + 0.38 * gold + 0.12 * c.hover.x;
      c.halo.visible = h.uStrength.value > 0.002;

      g.updateMatrixWorld(true);
      c.mesh.matrixWorld.toArray(live.cardMatrices, i * 16);
      tmpV.setFromMatrixPosition(c.mesh.matrixWorld).project(camera);
      live.cardScreen[i * 2] = tmpV.z < 1 ? (tmpV.x + 1) / 2 : -2;
      live.cardScreen[i * 2 + 1] = tmpV.z < 1 ? (1 - tmpV.y) / 2 : -2;
      g.visible = !(clock.embodied && embT > erodeStart + CARD_ERODE_SPAN + 0.05);
    });
    void time;
    void state;
  }, -10);

  return (
    <>
      <primitive object={root} />
      <Bracket cards={cards.map((c) => c.mesh)} />
    </>
  );
}

export { MODULE_IDS };
