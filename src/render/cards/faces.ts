/**
 * Face canvases + textures, one per module. The ring samples these textures;
 * the dissolve reads the very same pixels.
 */
import { isPhone } from '@/lib/device';
import * as THREE from 'three';
import { MODULE_IDS, type ModuleId } from '@/modules/ids';
import { FACE_H, FACE_W } from '@/modules/faces/draw';
import { drawCardFace, type FaceContext } from '@/modules/faces';
import { useData } from '@/stores/data';
import { warningOf } from '@/modules/warnings';
import { reporting } from '@/core/motion/vocabulary';
import { fmt } from '@/modules/format';

/** Bumped whenever a face changes: the frame governor wakes on it. */
export let faceVersion = 0;

/**
 * Faces are drawn in FACE_W × FACE_H units but rasterised at this many
 * pixels per unit, so text stays crisp when a card fills a large or
 * high-DPI screen (a 640 px face would be stretched and look soft).
 * Faces are made before the quality tier is measured, so low-memory
 * devices (4 GB or less) get a little less.
 */
function faceScale(): number {
  if (isPhone()) return 1.5; // a card fills ~620 device pixels on a phone: 960 px keeps text crisp
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return mem <= 4 ? 1.5 : 2;
}

/** Largest anisotropic filtering the GPU supports (sharp text on angled cards); set by the ring. */
let maxAnisotropy = 8;
export function setMaxAnisotropy(n: number) {
  maxAnisotropy = Math.max(1, n);
  for (const f of faces.values()) {
    f.texture.anisotropy = maxAnisotropy;
    f.texture.needsUpdate = true;
  }
}

interface Face {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  drawnFor: unknown;
  drawnAt: number;
  /** the age label last drawn; the face is redrawn when it would read differently */
  ageLabel: string;
  progressStart: number;
  warning: string | null;
}

const faces = new Map<ModuleId, Face>();
let clientFacts: FaceContext['client'] = {};

export function setClientFacts(f: FaceContext['client']) {
  clientFacts = { ...clientFacts, ...f };
}

export function getFace(id: ModuleId): Face {
  let f = faces.get(id);
  if (!f) {
    const canvas = document.createElement('canvas');
    const s = faceScale();
    canvas.width = Math.round(FACE_W * s);
    canvas.height = Math.round(FACE_H * s);
    const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    // draw in face units; the canvas has s pixels per unit
    ctx.setTransform(canvas.width / FACE_W, 0, 0, canvas.height / FACE_H, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    f = { canvas, ctx, texture, drawnFor: undefined, drawnAt: 0, ageLabel: '', progressStart: performance.now(), warning: null };
    faces.set(id, f);
  }
  return f;
}

export function faceWarning(id: ModuleId): boolean {
  return !!faces.get(id)?.warning;
}

/** Replay the chart draw-on for a module (on open / focus). */
export function replayDrawOn(id: ModuleId) {
  getFace(id).progressStart = performance.now();
}

/** Faces redrawn in one call, at most: each redraw is a full texture upload, so spread them out. */
const MAX_REDRAWS = 2;

/**
 * Redraw faces whose data changed, whose chart is drawing on, or whose age
 * label would now read differently (once a minute at most). Nothing else:
 * every redraw re-uploads the whole face to the GPU.
 */
export function updateFaces(now = performance.now(), force = false) {
  const data = useData.getState().modules;
  const wall = Date.now();
  let redrawn = 0;
  for (const id of MODULE_IDS) {
    if (!force && redrawn >= MAX_REDRAWS) break;
    const f = getFace(id);
    const d = data[id];
    const pt = (now - f.progressStart) / 1400;
    const animating = pt < 1.05;
    const stale = fmt.ageCoarse(d?.fetchedAt, wall) !== f.ageLabel;
    const loading = !d || d.status === 'loading';
    if (!force && f.drawnFor === d && !animating && !stale && !(loading && now - f.drawnAt > 400)) continue;
    redrawn++;
    f.ageLabel = fmt.ageCoarse(d?.fetchedAt, wall);
    faceVersion++;
    if (f.drawnFor !== d && d?.status === 'ok' && (f.drawnFor as { status?: string } | undefined)?.status !== 'ok') f.progressStart = now;
    f.warning = warningOf(id, d);
    drawCardFace(f.ctx, id, d, { now: Date.now(), warning: f.warning, progress: reporting(Math.min(1, Math.max(0, (now - f.progressStart) / 1400))), client: clientFacts });
    f.texture.needsUpdate = true;
    f.drawnFor = d;
    f.drawnAt = now;
  }
}
