/**
 * Bakes the bust and the hand once per quality tier and caches the result.
 * From then on the figure is a static set of positions and normals that
 * costs nothing to hold and is perfectly still.
 */
import * as THREE from 'three';
import { bakeSurface } from './bake';
import { sampleEliminate, estimateArea } from './poisson';
import { BUST_BOUNDS, BUST_SDF, bustRegion } from './sdf';
import { HAND_BOUNDS, handSdfGLSL, boneOf, segments } from './handData';
import type { Tier } from '@/stores/system';
import { log } from '@/stores/system';

export interface FigureBake {
  tier: Tier;
  count: number;
  positions: Float32Array;
  normals: Float32Array;
  /** head, jaw, chest, seam */
  regions: Float32Array;
  /** mean nearest-neighbour distance (blue noise ≈ 0.8 × lattice) */
  spacing: number;
  /** equivalent hexagonal lattice spacing: what bead coverage depends on */
  lattice: number;
  area: number;
}

export interface HandBake {
  tier: Tier;
  count: number;
  positions: Float32Array;
  normals: Float32Array;
  bones: Float32Array;
  spacing: number;
  lattice: number;
}

/** Fewer, larger beads on lower tiers — never gaps. Spacing in metres. */
const BUST_SPACING: Record<Tier, number> = { 0: 0.0105, 1: 0.0088, 2: 0.0076, 3: 0.0066 };
const HAND_SPACING: Record<Tier, number> = { 0: 0.0062, 1: 0.0054, 2: 0.0048, 3: 0.0043 };
const SEEDS: Record<Tier, number> = { 0: 320, 1: 352, 2: 416, 3: 480 };

const bustCache = new Map<Tier, Promise<FigureBake>>();
const handCache = new Map<Tier, Promise<HandBake>>();
const done = new Map<string, unknown>();
if (typeof window !== 'undefined') (window as unknown as { __divinaBakes: typeof done }).__divinaBakes = done;

function pick(src: Float32Array, idx: Uint32Array, stride = 3) {
  const out = new Float32Array(idx.length * stride);
  for (let i = 0; i < idx.length; i++) for (let k = 0; k < stride; k++) out[i * stride + k] = src[idx[i] * stride + k];
  return out;
}

export function bakeBust(gl: THREE.WebGLRenderer, tier: Tier): Promise<FigureBake> {
  let p = bustCache.get(tier);
  if (!p) {
    p = (async () => {
      const t0 = performance.now();
      const raw = await bakeSurface(gl, { sdf: BUST_SDF, min: BUST_BOUNDS.min, max: BUST_BOUNDS.max, size: SEEDS[tier], seed: 7, margin: 0.14 });
      const area = estimateArea(raw.positions, raw.count);
      const target = Math.round(area / (0.866 * BUST_SPACING[tier] ** 2));
      const { indices, spacing } = await sampleEliminate(raw.positions, raw.count, target, area);
      const positions = pick(raw.positions, indices);
      const normals = pick(raw.normals, indices);
      const regions = new Float32Array(indices.length * 4);
      for (let i = 0; i < indices.length; i++) {
        const r = bustRegion(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        regions.set(r, i * 4);
      }
      const lattice = Math.sqrt(area / (indices.length * 0.866));
      const out: FigureBake = { tier, count: indices.length, positions, normals, regions, spacing, lattice, area };
      done.set(`bust${tier}`, out);
      log('ok', `figure baked · ${indices.length} beads from ${raw.count} seeds · ${(lattice * 1000).toFixed(1)} mm · ${Math.round(performance.now() - t0)} ms`);
      return out;
    })();
    bustCache.set(tier, p);
  }
  return p;
}

export function bakeHand(gl: THREE.WebGLRenderer, tier: Tier): Promise<HandBake> {
  let p = handCache.get(tier);
  if (!p) {
    p = (async () => {
      const raw = await bakeSurface(gl, { sdf: handSdfGLSL(), min: HAND_BOUNDS.min, max: HAND_BOUNDS.max, size: Math.round(SEEDS[tier] * 0.6), seed: 11, margin: 0.05 });
      const area = estimateArea(raw.positions, raw.count, 0.005);
      const target = Math.round(area / (0.866 * HAND_SPACING[tier] ** 2));
      const { indices, spacing } = await sampleEliminate(raw.positions, raw.count, target, area);
      const positions = pick(raw.positions, indices);
      const normals = pick(raw.normals, indices);
      const segs = segments();
      const bones = new Float32Array(indices.length);
      for (let i = 0; i < indices.length; i++) bones[i] = boneOf([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], segs);
      const out: HandBake = { tier, count: indices.length, positions, normals, bones, spacing, lattice: Math.sqrt(area / (indices.length * 0.866)) };
      done.set(`hand${tier}`, out);
      log('ok', `hand baked · ${indices.length} beads`);
      return out;
    })();
    handCache.set(tier, p);
  }
  return p;
}

/** Nearest tier that has been baked, preferring the one asked for (the figure is baked once, not per tier change). */
function nearest<T>(kind: 'bust' | 'hand', tier: Tier): T | undefined {
  for (const d of [0, -1, 1, -2, 2, -3, 3]) {
    const v = done.get(`${kind}${tier + d}`);
    if (v) return v as T;
  }
  return undefined;
}
export function bakedBust(tier: Tier): FigureBake | undefined {
  return nearest<FigureBake>('bust', tier);
}
export function bakedHand(tier: Tier): HandBake | undefined {
  return nearest<HandBake>('hand', tier);
}
