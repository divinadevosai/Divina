/**
 * The instant of the command: rasterise every card face exactly as it is
 * drawn — live data included — and sample it into the journey buffer.
 *   type          → small hot fragments
 *   charts/glyphs → accent-coloured streams
 *   the pane      → dim glass
 * The dust, the light and the HUD contribute the rest; they leave after the
 * cards. Each particle is then paired with a figure point so that what
 * leaves first lands first (crown), what leaves last lands last (chest).
 */
import * as THREE from 'three';
import { MODULE_IDS } from '@/modules/ids';
import { getFace } from '@/render/cards/faces';
import { live } from '@/render/live';
import { SLOT, CORE, FIGURE_ORIGIN } from '@/render/layout';
import { EMBODY, edgeFactor, cardDissolveStart, CARD_ERODE_SPAN } from '@/core/clock/timeline';
import { BUST } from './sdf';
import type { FigureBake } from './figureBake';

const SW = 160;
const SH = 200;

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

interface Candidate {
  u: number;
  v: number;
  kind: number;
  r: number;
  g: number;
  b: number;
  w: number;
}

function sampleCard(i: number): Candidate[] {
  const face = getFace(MODULE_IDS[i]);
  const small = document.createElement('canvas');
  small.width = SW;
  small.height = SH;
  const ctx = small.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(face.canvas, 0, 0, face.canvas.width, face.canvas.height, 0, 0, SW, SH);
  const img = ctx.getImageData(0, 0, SW, SH).data;
  const out: Candidate[] = [];
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      const o = (y * SW + x) * 4;
      const a = img[o + 3] / 255;
      const r = img[o] / 255;
      const g = img[o + 1] / 255;
      const b = img[o + 2] / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let kind = 2;
      let w = 0.35;
      if (a > 0.35 && sat > 0.28) {
        kind = 1;
        w = 2.6 * a;
      } else if (a > 0.35 && luma > 0.5) {
        kind = 0;
        w = 3.2 * a;
      }
      // pane only inside the rounded silhouette
      const u = (x + 0.5) / SW;
      const v = 1 - (y + 0.5) / SH;
      if (kind === 2 && (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98)) continue;
      out.push({ u, v, kind, r: srgbToLinear(r), g: srgbToLinear(g), b: srgbToLinear(b), w });
    }
  return out;
}

function weightedPick(c: Candidate[], n: number, rnd: () => number): Candidate[] {
  const cum = new Float64Array(c.length);
  let s = 0;
  for (let i = 0; i < c.length; i++) cum[i] = s += c[i].w;
  const out: Candidate[] = [];
  for (let k = 0; k < n; k++) {
    const t = rnd() * s;
    let lo = 0;
    let hi = c.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] < t) lo = m + 1;
      else hi = m;
    }
    out.push(c[lo]);
  }
  return out;
}

export interface JourneyAttributes {
  count: number;
  card: Float32Array; // idx, u, v, kind
  origin: Float32Array;
  color: Float32Array;
  fig: Float32Array;
  nrm: Float32Array;
  region: Float32Array;
  times: Float32Array; // leave, arrive, depart, land
  burst: Float32Array;
  rand: Float32Array;
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compute erosion starts (cards behind the viewer go first) and sample. */
export function captureJourney(fig: FigureBake, camera: THREE.PerspectiveCamera): JourneyAttributes {
  const rnd = mulberry(1234);
  const N = fig.count;
  const nCard = MODULE_IDS.length;
  for (let i = 0; i < nCard; i++) {
    const theta = i * SLOT - live.ringAngle;
    const behind = (1 - Math.cos(theta)) / 2;
    live.cardErodeStart[i] = cardDissolveStart(behind);
  }

  const nCards = Math.round(N * 0.76);
  const nHud = Math.round(N * 0.04);
  const nDust = N - nCards - nHud;

  const card = new Float32Array(N * 4);
  const origin = new Float32Array(N * 3);
  const color = new Float32Array(N * 3);
  const leave = new Float32Array(N);
  let k = 0;

  // cards
  const perCard = Math.floor(nCards / nCard);
  for (let i = 0; i < nCard; i++) {
    const quota = i === nCard - 1 ? nCards - perCard * (nCard - 1) : perCard;
    const picks = weightedPick(sampleCard(i), quota, rnd);
    for (const p of picks) {
      const u = Math.min(0.999, Math.max(0.001, p.u + (rnd() - 0.5) / SW));
      const v = Math.min(0.999, Math.max(0.001, p.v + (rnd() - 0.5) / SH));
      card.set([i, u, v, p.kind], k * 4);
      const c = p.kind === 0 ? [0.8, 0.9, 1.0].map((x) => x * 2.4) : p.kind === 1 ? [p.r * 2.2, p.g * 2.2, p.b * 2.2] : [0.05, 0.085, 0.17];
      color.set(c, k * 3);
      leave[k] = live.cardErodeStart[i] + edgeFactor(u, v) * CARD_ERODE_SPAN;
      k++;
    }
  }

  // dust and light: drawn in after the cards
  const dust = new THREE.Color().copy(live.dust);
  for (let j = 0; j < nDust; j++) {
    card.set([-1, 0, 0, 3], k * 4);
    if (rnd() < 0.7) origin.set([(rnd() * 2 - 1) * 4.5, 0.2 + rnd() * 3.2, -1 - rnd() * 5.5], k * 3);
    else {
      const bx = [-4.2, 3.6, 0.4][Math.floor(rnd() * 3)];
      const bz = [-6.5, -7.5, -9.5][Math.floor(rnd() * 3)];
      origin.set([bx + (rnd() - 0.5) * 1.2, 0.3 + rnd() * 5, bz + (rnd() - 0.5) * 1.2], k * 3);
    }
    color.set([dust.r * 1.4, dust.g * 1.4, dust.b * 1.4], k * 3);
    leave[k] = EMBODY.collapse + 1.25 + rnd() * 1.15;
    k++;
  }

  // HUD corners
  const v3 = new THREE.Vector3();
  for (let j = 0; j < nHud; j++) {
    const corner = j % 4;
    const sx = (corner % 2 === 0 ? -0.85 : 0.85) + (rnd() - 0.5) * 0.22;
    const sy = (corner < 2 ? 0.82 : -0.82) + (rnd() - 0.5) * 0.12;
    v3.set(sx, sy, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(1.6).add(camera.position);
    card.set([-1, 0, 0, 0], k * 4);
    origin.set([v3.x, v3.y, v3.z], k * 3);
    color.set([1.6, 1.9, 2.3], k * 3);
    leave[k] = EMBODY.collapse + 0.15 + rnd() * 0.7;
    k++;
  }

  // pair: order particles by leave time, figure points by departure key
  const pOrder = Array.from({ length: N }, (_, i) => i).sort((a, b) => leave[a] - leave[b]);
  const span = BUST.crownY - BUST.chestY;
  const key = new Float32Array(N);
  for (let i = 0; i < N; i++) key[i] = (BUST.crownY - fig.positions[i * 3 + 1]) / span + (rnd() - 0.5) * 0.06;
  const fOrder = Array.from({ length: N }, (_, i) => i).sort((a, b) => key[a] - key[b]);

  const out: JourneyAttributes = {
    count: N,
    card: new Float32Array(N * 4),
    origin: new Float32Array(N * 3),
    color: new Float32Array(N * 3),
    fig: new Float32Array(N * 3),
    nrm: new Float32Array(N * 3),
    region: new Float32Array(N * 4),
    times: new Float32Array(N * 4),
    burst: new Float32Array(N * 3),
    rand: new Float32Array(N * 2),
  };
  for (let s = 0; s < N; s++) {
    const pi = pOrder[s];
    const fi = fOrder[s];
    out.card.set(card.subarray(pi * 4, pi * 4 + 4), s * 4);
    out.origin.set(origin.subarray(pi * 3, pi * 3 + 3), s * 3);
    out.color.set(color.subarray(pi * 3, pi * 3 + 3), s * 3);
    out.fig.set(fig.positions.subarray(fi * 3, fi * 3 + 3), s * 3);
    out.nrm.set(fig.normals.subarray(fi * 3, fi * 3 + 3), s * 3);
    out.region.set(fig.regions.subarray(fi * 4, fi * 4 + 4), s * 4);
    const l = leave[pi];
    const arrive = Math.min(Math.max(l + 0.85, EMBODY.core - 0.9 + rnd() * 0.6), EMBODY.skeleton - 0.05);
    const kf = Math.min(1, Math.max(0, key[fi]));
    // one point in nine forms the skeleton: sparse, early, crown-first
    const skeleton = s % 9 === 0;
    const depart = skeleton ? EMBODY.skeleton + kf * 0.45 : EMBODY.body + kf * 2.55 + rnd() * 0.1;
    const land = depart + (skeleton ? 0.6 : EMBODY.flight) * (0.85 + rnd() * 0.3);
    out.times.set([l, Math.max(arrive, l + 0.3), Math.max(depart, arrive + 0.05), land], s * 4);
    // burst: out from the core in the direction of the landing point, plus spread
    const fx = fig.positions[fi * 3] + 0 - CORE.x;
    const fy = fig.positions[fi * 3 + 1] - CORE.y;
    const fz = fig.positions[fi * 3 + 2] + FIGURE_ORIGIN.z - CORE.z;
    const rx = rnd() * 2 - 1;
    const ry = rnd() * 2 - 1;
    const rz = rnd() * 2 - 1;
    const bx = fx + rx * 0.7;
    const by = fy + ry * 0.7;
    const bz = fz + rz * 0.7 + 0.25;
    const bl = Math.hypot(bx, by, bz) || 1;
    const br = 0.45 + rnd() * 0.75;
    out.burst.set([(bx / bl) * br, (by / bl) * br, (bz / bl) * br], s * 3);
    out.rand.set([rnd(), rnd()], s * 2);
  }
  return out;
}
