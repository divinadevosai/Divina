'use client';
/**
 * FUI targeting bracket: four L-corners built from eight quads. During
 * TARGETING they converge from outside the frame onto the card corners;
 * in SETTLE they lock (flash) and dissolve. Reads the master clock only.
 */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clock } from '@/core/clock/masterClock';
import { MODULE_IDS } from '@/modules/ids';
import { CARD_H, CARD_W } from '../layout';

const ARM = 0.17;
const THICK = 0.012;

export function Bracket({ cards }: { cards: THREE.Mesh[] }) {
  const { group, mat, quads } = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.9, 1.2), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const geo = new THREE.PlaneGeometry(1, 1);
    const group = new THREE.Group();
    group.renderOrder = 50;
    const quads: { mesh: THREE.Mesh; sx: number; sy: number; horizontal: boolean }[] = [];
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const horizontal of [true, false]) {
          const mesh = new THREE.Mesh(geo, mat);
          mesh.renderOrder = 50;
          group.add(mesh);
          quads.push({ mesh, sx, sy, horizontal });
        }
    group.visible = false;
    return { group, mat, quads };
  }, []);

  useFrame(() => {
    const p = clock.presentation;
    if (!p.module || p.bracketAlpha <= 0.001) {
      group.visible = false;
      return;
    }
    const card = cards[MODULE_IDS.indexOf(p.module)];
    if (!card) return;
    group.visible = true;
    group.matrixAutoUpdate = false;
    group.matrix.copy(card.matrixWorld);
    group.matrixWorldNeedsUpdate = true;
    const lock = p.bracketLock;
    const margin = 0.05 + lock * 0.015;
    const spread = p.bracketSpread * 2.4; // metres outside the frame at the start
    const thick = THICK * (1 + lock * 1.2);
    for (const q of quads) {
      const cx = q.sx * (CARD_W / 2 + margin + spread);
      const cy = q.sy * (CARD_H / 2 + margin + spread * 0.8);
      if (q.horizontal) {
        q.mesh.position.set(cx - q.sx * (ARM / 2), cy, 0.02);
        q.mesh.scale.set(ARM, thick, 1);
      } else {
        q.mesh.position.set(cx, cy - q.sy * (ARM / 2), 0.02);
        q.mesh.scale.set(thick, ARM, 1);
      }
    }
    mat.opacity = p.bracketAlpha * (0.75 + lock * 0.25);
  }, -5);

  return <primitive object={group} />;
}
