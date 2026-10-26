'use client';
/**
 * Opening Stocks turns the floor into an animated market grid: one row per
 * holding, one column per trading day, heights from the real closes.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from '@/stores/world';
import { useData } from '@/stores/data';
import { clock } from '@/core/clock/masterClock';
import { approach } from '@/core/spring';
import type { StocksData } from '@/modules/types';

const COLS = 24;
const ROWS = 8;
const CELL = 0.46;

export function MarketFloor() {
  const stocks = useData((s) => s.modules.stocks);
  const rise = useRef(0);
  const { mesh, heights, colors } = useMemo(() => {
    const geo = new THREE.BoxGeometry(CELL * 0.82, 1, CELL * 0.82);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, COLS * ROWS);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COLS * ROWS * 3), 3);
    mesh.frustumCulled = false;
    return { mesh, heights: new Float32Array(COLS * ROWS), colors: mesh.instanceColor };
  }, []);

  useEffect(() => {
    const d = stocks?.status === 'ok' ? (stocks.data as StocksData) : null;
    const c = new THREE.Color();
    for (let r = 0; r < ROWS; r++) {
      const h = d?.holdings[r % Math.max(1, d?.holdings.length ?? 1)];
      const hist = h?.history ?? [];
      for (let k = 0; k < COLS; k++) {
        const i = r * COLS + k;
        const v = hist[hist.length - COLS + k];
        const prev = hist[hist.length - COLS + k - 1];
        const ch = v && prev ? (v - prev) / prev : 0;
        heights[i] = h ? 0.015 + Math.min(0.32, Math.abs(ch) * 7) : 0.01;
        // gains cyan, losses violet — never orange (reserved for warnings)
        c.setHSL(ch >= 0 ? 0.52 : 0.73, 0.8, 0.32 + Math.min(0.14, Math.abs(ch) * 3));
        colors.setXYZ(i, c.r, c.g, c.b);
      }
    }
    colors.needsUpdate = true;
  }, [stocks, heights, colors]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const on = useWorld.getState().marketFloor && !clock.embodied;
    rise.current = approach(rise.current, on ? 1 : 0, 1.1, clock.dt);
    mesh.visible = rise.current > 0.001;
    if (!mesh.visible) return;
    for (let r = 0; r < ROWS; r++)
      for (let k = 0; k < COLS; k++) {
        const i = r * COLS + k;
        const wave = Math.min(1, Math.max(0, rise.current * 1.6 - (k / COLS) * 0.6));
        m.makeScale(1, Math.max(0.001, heights[i] * wave), 1);
        m.setPosition((k - COLS / 2 + 0.5) * CELL, 0, -4.3 - r * CELL);
        mesh.setMatrixAt(i, m);
      }
    mesh.instanceMatrix.needsUpdate = true;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 0.22 * rise.current;
  });

  return <primitive object={mesh} />;
}
