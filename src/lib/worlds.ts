/**
 * Custom worlds: the person's own room — sky, glow and floor colours, and a
 * planet (with rings and moons) hanging in the sky. Data only: checked here,
 * drawn by the renderer. Shared by both editions.
 */
import { isId, newId, type Result } from './personal';

export type PlanetType = 'none' | 'rocky' | 'gas' | 'ice' | 'lava' | 'earth';
export type FloorStyle = 'lattice' | 'plate' | 'glass' | 'grate' | 'water' | 'none';

export interface CustomWorld {
  id: string;
  name: string;
  /** background / fog colour */
  sky: string;
  /** light, beams and dust */
  glow: string;
  floor: FloorStyle;
  floorColor: string;
  /** 0 (clear) … 1 (thick haze) */
  haze: number;
  /** 0 … 1 */
  stars: number;
  planet: {
    type: PlanetType;
    color: string;
    /** bands, clouds or oceans */
    color2: string;
    /** 0.5 … 2 */
    size: number;
    rings: boolean;
    ringColor: string;
    /** where it hangs: -1 left … 1 right */
    x: number;
    moons: number;
  };
  at: number;
}

export const MAX_WORLDS = 12;
const HEX = /^#[0-9a-f]{6}$/i;
const PLANETS: PlanetType[] = ['none', 'rocky', 'gas', 'ice', 'lava', 'earth'];
const FLOORS: FloorStyle[] = ['lattice', 'plate', 'glass', 'grate', 'water', 'none'];
const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);

type Preset = Omit<CustomWorld, 'id' | 'at'>;
const p = (name: string, sky: string, glow: string, floor: FloorStyle, floorColor: string, haze: number, stars: number, planet: Partial<CustomWorld['planet']>): Preset => ({
  name,
  sky,
  glow,
  floor,
  floorColor,
  haze,
  stars,
  planet: { type: 'rocky', color: '#c1440e', color2: '#7a2a0a', size: 1, rings: false, ringColor: '#d8c7a0', x: 0.55, moons: 0, ...planet },
});

/** Ready-made worlds to start from (and say by name: "take me to Mars"). */
export const WORLD_PRESETS: Preset[] = [
  p('Mars', '#140806', '#ff9a6a', 'grate', '#7a3a22', 0.35, 0.5, { type: 'rocky', color: '#c1440e', color2: '#7a2a0a', size: 1.2, x: 0.55, moons: 2 }),
  p('Saturn', '#0a0904', '#ffe2a8', 'glass', '#8a7448', 0.25, 0.8, { type: 'gas', color: '#e3c58a', color2: '#b08a4f', size: 1.4, rings: true, ringColor: '#d8c7a0', x: -0.5 }),
  p('Neptune', '#030818', '#7fb6ff', 'water', '#1d4c9a', 0.3, 0.9, { type: 'ice', color: '#3f6fe0', color2: '#86b3ff', size: 1.1, x: 0.6, moons: 1 }),
  p('Jupiter', '#0b0805', '#ffd2a0', 'plate', '#6a4a2a', 0.3, 0.6, { type: 'gas', color: '#d9a066', color2: '#9a5a33', size: 1.8, x: 0.45, moons: 3 }),
  p('Earthrise', '#02060f', '#bcd8ff', 'lattice', '#2a4a8a', 0.15, 1, { type: 'earth', color: '#2a6ad1', color2: '#3f9a4a', size: 1, x: -0.4, moons: 0 }),
  p('Lava world', '#120402', '#ff6a3a', 'grate', '#5a1a0a', 0.5, 0.3, { type: 'lava', color: '#3a1208', color2: '#ff5a1a', size: 1.3, x: 0.5 }),
  p('Ice moon', '#06101a', '#d8f0ff', 'glass', '#6aa8d8', 0.4, 0.7, { type: 'ice', color: '#d8ecff', color2: '#8ab8e0', size: 0.9, x: -0.55, moons: 0 }),
  p('Nebula', '#0d0418', '#d29bff', 'none', '#5a2a8a', 0.6, 1, { type: 'none' }),
];

export function checkWorld(raw: Record<string, unknown>, existing?: CustomWorld): Result<CustomWorld> {
  const name = typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 30) : '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '.-]{0,29}$/u.test(name)) return { ok: false, message: 'Give your world a name of up to 30 letters or numbers.' };
  const pl = raw.planet && typeof raw.planet === 'object' ? (raw.planet as Record<string, unknown>) : {};
  const type = PLANETS.includes(pl.type as PlanetType) ? (pl.type as PlanetType) : 'none';
  return {
    ok: true,
    value: {
      id: existing?.id ?? newId(),
      name,
      sky: hex(raw.sky, '#05070d'),
      glow: hex(raw.glow, '#9cc4ff'),
      floor: FLOORS.includes(raw.floor as FloorStyle) ? (raw.floor as FloorStyle) : 'lattice',
      floorColor: hex(raw.floorColor, '#2a4a8a'),
      haze: clamp(raw.haze, 0, 1, 0.3),
      stars: clamp(raw.stars, 0, 1, 0.6),
      planet: {
        type,
        color: hex(pl.color, '#c1440e'),
        color2: hex(pl.color2, '#7a2a0a'),
        size: clamp(pl.size, 0.5, 2, 1),
        rings: pl.rings === true,
        ringColor: hex(pl.ringColor, '#d8c7a0'),
        x: clamp(pl.x, -1, 1, 0.5),
        moons: Math.round(clamp(pl.moons, 0, 3, 0)),
      },
      at: existing?.at ?? Date.now(),
    },
  };
}

export function readWorlds(raw: unknown): CustomWorld[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomWorld[] = [];
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue;
    const x = w as Record<string, unknown>;
    const r = checkWorld(x, { id: isId(x.id) ? x.id : newId(), at: Number(x.at) || Date.now() } as CustomWorld);
    if (r.ok) out.push(r.value);
  }
  return out.slice(0, MAX_WORLDS);
}

export function worldsOp(items: CustomWorld[], op: unknown): Result<CustomWorld[]> {
  if (!op || typeof op !== 'object') return { ok: false, message: 'Expected an action.' };
  const o = op as Record<string, unknown>;
  switch (o.op) {
    case 'save': {
      const raw = o.world && typeof o.world === 'object' ? (o.world as Record<string, unknown>) : null;
      if (!raw) return { ok: false, message: 'Expected a world.' };
      const existing = isId(raw.id) ? items.find((w) => w.id === raw.id) : undefined;
      if (!existing && items.length >= MAX_WORLDS) return { ok: false, message: `That’s the limit of ${MAX_WORLDS} worlds. Delete one first.` };
      const r = checkWorld(raw, existing);
      if (!r.ok) return r;
      if (items.some((w) => w.id !== r.value.id && w.name.toLowerCase() === r.value.name.toLowerCase())) return { ok: false, message: `You already have a world called ${r.value.name}.` };
      return { ok: true, value: existing ? items.map((w) => (w.id === existing.id ? r.value : w)) : [...items, r.value], message: `Saved ${r.value.name}.` };
    }
    case 'remove': {
      const w = isId(o.id) ? items.find((x) => x.id === o.id) : undefined;
      if (!w) return { ok: false, message: 'I couldn’t find that world.' };
      return { ok: true, value: items.filter((x) => x.id !== w.id), message: `Deleted ${w.name}.` };
    }
    default:
      return { ok: false, message: 'Unknown action.' };
  }
}

/** A saved world or preset a spoken name means ("mars", "my saturn world"). */
export function findWorld(items: CustomWorld[], spoken: string): CustomWorld | Preset | null {
  const full = spoken.toLowerCase().replace(/^(my|the)\s+/, '').trim();
  const short = full.replace(/\s+(world|planet|room|theme)$/, '').trim();
  if (!full) return null;
  const all = [...items, ...WORLD_PRESETS];
  // "lava world" is a name; "my saturn world" means Saturn
  return all.find((w) => w.name.toLowerCase() === full) ?? all.find((w) => w.name.toLowerCase() === short) ?? null;
}

/** A preset as a world that can be shown (it isn't saved until the person saves it). */
export function asWorld(w: CustomWorld | Preset): CustomWorld {
  return 'id' in w ? w : { ...w, id: `preset${w.name.toLowerCase().replace(/[^a-z]/g, '')}`, at: 0 };
}
