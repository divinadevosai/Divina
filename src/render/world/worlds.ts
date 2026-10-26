/**
 * The six worlds. A world is data only: atmosphere, light and its film grade.
 * Renderers interpolate between the current and next world; a world change
 * also fires a clock "cut" that spikes the split-tone and halation so the
 * switch reads as an edit, not a crossfade.
 */
import type { CustomWorld } from '@/lib/worlds';

export type WorldId = 'studio' | 'lab' | 'observatory' | 'industrial' | 'water' | 'fog' | 'custom';

export interface Grade {
  /** violet push into the shadows */
  shadowTint: [number, number, number];
  /** warm white into the highlights */
  highlightTint: [number, number, number];
  /** strength of the luminance split 0..1 */
  split: number;
  /** filmic contrast around 18% grey; <1 flattens */
  contrast: number;
  /** halation strength */
  halation: number;
  /** halation spread in px (bleed) */
  bleed: number;
  /** global white balance, + warm / − cool */
  warmth: number;
  saturation: number;
}

export interface World {
  id: WorldId;
  name: string;
  fog: string; // hex
  fogDensity: number;
  ambient: string;
  key: string;
  keyIntensity: number;
  beam: string;
  beamIntensity: number;
  dust: string;
  dustDensity: number; // 0..1 of tier budget
  floor: 'lattice' | 'plate' | 'glass' | 'grate' | 'water' | 'none';
  floorColor: string;
  grade: Grade;
}

const BASE_GRADE: Grade = {
  shadowTint: [0.46, 0.36, 0.98],
  highlightTint: [1.0, 0.95, 0.86],
  split: 0.35,
  contrast: 1.08,
  halation: 0.18,
  bleed: 6,
  warmth: 0,
  saturation: 1.0,
};

export const WORLDS: Record<WorldId, World> = {
  studio: {
    id: 'studio',
    name: 'Minimal Studio',
    fog: '#05070d',
    fogDensity: 0.055,
    ambient: '#1a2a4a',
    key: '#bcd4ff',
    keyIntensity: 1.1,
    beam: '#7fb2ff',
    beamIntensity: 0.55,
    dust: '#9cc4ff',
    dustDensity: 0.7,
    floor: 'lattice',
    floorColor: '#2a4a8a',
    grade: { ...BASE_GRADE },
  },
  lab: {
    id: 'lab',
    name: 'Dark Lab',
    fog: '#030409',
    fogDensity: 0.075,
    ambient: '#101a36',
    key: '#9fbfff',
    keyIntensity: 0.9,
    beam: '#5d8cff',
    beamIntensity: 0.8,
    dust: '#7fa6ff',
    dustDensity: 0.55,
    floor: 'plate',
    floorColor: '#1c2f66',
    grade: { ...BASE_GRADE, split: 0.45, contrast: 1.18, halation: 0.12, bleed: 5, saturation: 0.95 },
  },
  observatory: {
    id: 'observatory',
    name: 'Glass Observatory',
    fog: '#071021',
    fogDensity: 0.04,
    ambient: '#23386a',
    key: '#dce8ff',
    keyIntensity: 1.3,
    beam: '#a8ccff',
    beamIntensity: 0.9,
    dust: '#cfe2ff',
    dustDensity: 0.9,
    floor: 'glass',
    floorColor: '#5b86d6',
    grade: { ...BASE_GRADE, split: 0.3, contrast: 1.02, halation: 0.26, bleed: 9, warmth: 0.02, saturation: 1.05 },
  },
  industrial: {
    id: 'industrial',
    name: 'Industrial Deck',
    fog: '#0b0806',
    fogDensity: 0.065,
    ambient: '#2a2018',
    key: '#ffd9a8',
    keyIntensity: 1.2,
    beam: '#ffc27a',
    beamIntensity: 0.7,
    dust: '#ffd7a6',
    dustDensity: 0.6,
    floor: 'grate',
    floorColor: '#6a4a2a',
    // Sodium-warm and hard.
    grade: {
      shadowTint: [0.4, 0.34, 0.7],
      highlightTint: [1.0, 0.82, 0.58],
      split: 0.5,
      contrast: 1.3,
      halation: 0.16,
      bleed: 4,
      warmth: 0.16,
      saturation: 0.9,
    },
  },
  water: {
    id: 'water',
    name: 'Open Water',
    fog: '#040c18',
    fogDensity: 0.045,
    ambient: '#18345c',
    key: '#a9d2ff',
    keyIntensity: 1.0,
    beam: '#6fc3ff',
    beamIntensity: 0.6,
    dust: '#a0dcff',
    dustDensity: 0.8,
    floor: 'water',
    floorColor: '#2a6aa8',
    // Negative warmth: blue hour.
    grade: { ...BASE_GRADE, shadowTint: [0.36, 0.4, 1.0], highlightTint: [0.9, 0.96, 1.0], split: 0.4, contrast: 1.05, halation: 0.2, bleed: 8, warmth: -0.14, saturation: 1.05 },
  },
  // the person's own world; filled by applyCustomWorld
  custom: {
    id: 'custom',
    name: 'My world',
    fog: '#05070d',
    fogDensity: 0.05,
    ambient: '#1a2a4a',
    key: '#bcd4ff',
    keyIntensity: 1.1,
    beam: '#7fb2ff',
    beamIntensity: 0.55,
    dust: '#9cc4ff',
    dustDensity: 0.7,
    floor: 'lattice',
    floorColor: '#2a4a8a',
    grade: { ...BASE_GRADE },
  },
  fog: {
    id: 'fog',
    name: 'Fog Chamber',
    fog: '#0c1220',
    fogDensity: 0.12,
    ambient: '#2b3a5a',
    key: '#cfe0ff',
    keyIntensity: 0.8,
    beam: '#9cc0ff',
    beamIntensity: 1.1,
    dust: '#d8e6ff',
    dustDensity: 1.0,
    floor: 'none',
    floorColor: '#34507e',
    // Maximum bleed, sub-1.0 contrast.
    grade: { ...BASE_GRADE, split: 0.28, contrast: 0.86, halation: 0.34, bleed: 14, warmth: 0.0, saturation: 0.85 },
  },
};

/** The six built-in worlds (the custom one is the person's, below). */
export const WORLD_IDS = (Object.keys(WORLDS) as WorldId[]).filter((w) => w !== 'custom');

const hexToRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a: string, b: string, k: number) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return `#${x.map((v, i) => Math.round((v + (y[i] - v) * k) * 255).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * The person's own world: one slot whose look is filled from their design
 * (src/lib/worlds.ts). Sky → fog, glow → light, beams and dust, haze → fog
 * density; the film grade picks up their colours too.
 */
export function applyCustomWorld(spec: CustomWorld) {
  const glow = spec.glow;
  WORLDS.custom = {
    id: 'custom',
    name: spec.name,
    fog: spec.sky,
    fogDensity: 0.02 + spec.haze * 0.09,
    ambient: mix(spec.sky, glow, 0.25),
    key: mix(glow, '#ffffff', 0.45),
    keyIntensity: 1.1,
    beam: glow,
    beamIntensity: 0.4 + spec.haze * 0.6,
    dust: mix(glow, '#ffffff', 0.3),
    dustDensity: 0.4 + spec.stars * 0.4,
    floor: spec.floor,
    floorColor: spec.floorColor,
    grade: { ...BASE_GRADE, shadowTint: hexToRgb(mix(spec.sky, glow, 0.5)).map((v) => Math.min(1, v * 1.6 + 0.2)) as [number, number, number], highlightTint: hexToRgb(mix(glow, '#ffffff', 0.7)), split: 0.32, contrast: 1.06, halation: 0.2, bleed: 7, saturation: 1.05 },
  };
}

export const WORLD_ALIASES: Record<WorldId, string[]> = {
  studio: ['studio', 'minimal', 'minimal studio', 'default'],
  lab: ['lab', 'dark lab', 'laboratory'],
  observatory: ['observatory', 'glass', 'glass observatory'],
  industrial: ['industrial', 'command center', 'command centre', 'deck', 'industrial deck'],
  water: ['water', 'ocean', 'ocean platform', 'open water', 'sea'],
  fog: ['fog', 'fog chamber', 'mist'],
  custom: ['my world', 'custom', 'custom world'],
};
