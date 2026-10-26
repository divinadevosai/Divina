'use client';
/** Your own worlds: start from a planet preset or design one, with a live preview in the room behind. */
import { useEffect, useRef, useState } from 'react';
import { personalOp, usePersonal } from '@/lib/client/personal';
import { WORLD_PRESETS, asWorld, type CustomWorld, type FloorStyle, type PlanetType } from '@/lib/worlds';
import { useWorld } from '@/stores/world';
import type { WorldId } from '@/render/world/worlds';

const input = 'w-full rounded-lg border border-ink-faint bg-black/20 px-3 py-2 text-[14px] text-ink placeholder:text-ink-lo focus:border-holo/60 focus:outline-none';
const button = 'rounded-lg border border-holo/50 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-holo-hi hover:bg-holo/10 disabled:opacity-40';
const quiet = `${button} !border-ink-faint !text-ink-mid`;
const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] transition ${on ? 'border-holo/70 bg-holo/15 text-ink' : 'border-ink-faint text-ink-mid hover:text-ink'}`;

const PLANETS: { id: PlanetType; label: string }[] = [
  { id: 'rocky', label: 'Rocky' },
  { id: 'gas', label: 'Gas giant' },
  { id: 'ice', label: 'Ice' },
  { id: 'lava', label: 'Lava' },
  { id: 'earth', label: 'Earth-like' },
  { id: 'none', label: 'No planet' },
];
const FLOORS: { id: FloorStyle; label: string }[] = [
  { id: 'lattice', label: 'Grid' },
  { id: 'glass', label: 'Glass' },
  { id: 'water', label: 'Water' },
  { id: 'plate', label: 'Metal' },
  { id: 'grate', label: 'Grate' },
  { id: 'none', label: 'None' },
];

/** A little picture of the world: sky, glow and planet colours. */
function Swatch({ w }: { w: Pick<CustomWorld, 'sky' | 'glow' | 'planet'> }) {
  return (
    <span className="relative inline-block h-8 w-8 shrink-0 overflow-hidden rounded-full border border-ink-faint" style={{ background: `radial-gradient(circle at 70% 120%, ${w.glow}55, ${w.sky} 70%)` }}>
      {w.planet.type !== 'none' && <span className="absolute left-[18%] top-[18%] h-[45%] w-[45%] rounded-full" style={{ background: `radial-gradient(circle at 35% 35%, ${w.planet.color2}, ${w.planet.color})` }} />}
    </span>
  );
}

export function WorldSettings() {
  const worlds = usePersonal((s) => s.worlds);
  const current = useWorld((s) => (s.world === 'custom' ? s.custom?.id : null));
  const [edit, setEdit] = useState<CustomWorld | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (edit) return <WorldEditor start={edit} onDone={(m) => (setEdit(null), setMsg(m))} />;
  const visit = (w: CustomWorld) => useWorld.getState().setCustom(w);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="hud-label">planets to visit</div>
        <div className="flex flex-wrap gap-2">
          {WORLD_PRESETS.map((p) => {
            const w = asWorld(p);
            return (
              <button key={p.name} className={`${chip(current === w.id)} flex items-center gap-2 !py-1 !pl-1`} onClick={() => visit(w)}>
                <Swatch w={w} />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-2">
        <div className="hud-label">your worlds</div>
        {worlds.length ? (
          worlds.map((w) => (
            <div key={w.id} className="flex items-center gap-3 rounded-xl border border-ink-faint p-2">
              <Swatch w={w} />
              <span className="flex-1 text-[15px] text-ink">{w.name}</span>
              <button className={current === w.id ? `${quiet} !text-ink` : button} onClick={() => visit(w)}>
                {current === w.id ? 'here' : 'visit'}
              </button>
              <button className={quiet} onClick={() => setEdit(w)}>
                edit
              </button>
            </div>
          ))
        ) : (
          <p className="text-[13px] text-ink-lo">None yet. Design one, or start from a planet above and change its colours.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={() => setEdit({ ...asWorld(WORLD_PRESETS[0]), id: '', name: 'My world' })}>
          + design a world
        </button>
        {current && !worlds.some((w) => w.id === current) && (
          <button className={quiet} onClick={() => setEdit({ ...(useWorld.getState().custom as CustomWorld), id: '', name: `My ${useWorld.getState().custom?.name}` })}>
            make this one mine
          </button>
        )}
      </div>
      {msg && <p className="text-[12px] text-holo-hi">{msg}</p>}
      <p className="text-[12px] text-ink-lo">Say “take me to Mars”, or a world’s name. Worlds are saved on this device and included in backups.</p>
    </div>
  );
}

function WorldEditor({ start, onDone }: { start: CustomWorld; onDone: (msg: string | null) => void }) {
  const [w, setW] = useState<CustomWorld>(start);
  const [err, setErr] = useState<string | null>(null);
  const before = useRef<{ world: WorldId; custom: CustomWorld | null }>({ world: useWorld.getState().world, custom: useWorld.getState().custom });
  // live preview: the room behind the settings shows the world as you design it
  useEffect(() => {
    useWorld.getState().setCustom({ ...w, id: w.id || 'previewworld' });
  }, [w]);
  const set = (p: Partial<CustomWorld>) => setW((x) => ({ ...x, ...p }));
  const setPlanet = (p: Partial<CustomWorld['planet']>) => setW((x) => ({ ...x, planet: { ...x.planet, ...p } }));
  const cancel = () => {
    const b = before.current;
    if (b.world === 'custom' && b.custom) useWorld.getState().setCustom(b.custom);
    else useWorld.getState().setWorld(b.world === 'custom' ? 'studio' : b.world);
    onDone(null);
  };
  const save = async () => {
    const r = await personalOp('worlds', { op: 'save', world: { ...w, id: w.id || undefined } });
    if (!r.ok) return setErr(r.message ?? 'Couldn’t save the world.');
    const saved = usePersonal.getState().worlds.find((x) => x.name.toLowerCase() === w.name.toLowerCase());
    if (saved) useWorld.getState().setCustom(saved);
    onDone(r.message ?? null);
  };
  const remove = async () => {
    if (!w.id || !window.confirm(`Delete ${w.name}?`)) return;
    const r = await personalOp('worlds', { op: 'remove', id: w.id });
    useWorld.getState().setWorld('studio');
    onDone(r.message ?? null);
  };
  const color = (label: string, value: string, on: (v: string) => void) => (
    <label className="flex items-center gap-2 text-[13px] text-ink-mid">
      <input type="color" value={value} onChange={(e) => on(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-ink-faint bg-transparent" />
      {label}
    </label>
  );
  const slider = (label: string, value: number, min: number, max: number, step: number, on: (v: number) => void) => (
    <label className="block space-y-1 text-[13px] text-ink-mid">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => on(Number(e.target.value))} className="w-full accent-[#7fb2ff]" />
    </label>
  );
  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="hud-label">name</span>
        <input className={input} value={w.name} maxLength={30} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="space-y-2">
        <span className="hud-label">planet</span>
        <div className="flex flex-wrap gap-2">
          {PLANETS.map((p) => (
            <button key={p.id} className={chip(w.planet.type === p.id)} onClick={() => setPlanet({ type: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
        {w.planet.type !== 'none' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-wrap gap-4">
              {color('surface', w.planet.color, (v) => setPlanet({ color: v }))}
              {color(w.planet.type === 'lava' ? 'lava' : w.planet.type === 'earth' ? 'land' : 'bands', w.planet.color2, (v) => setPlanet({ color2: v }))}
            </div>
            {slider('size', w.planet.size, 0.5, 2, 0.05, (v) => setPlanet({ size: v }))}
            {slider('position (left ↔ right)', w.planet.x, -1, 1, 0.05, (v) => setPlanet({ x: v }))}
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-mid">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={w.planet.rings} onChange={(e) => setPlanet({ rings: e.target.checked })} /> rings
              </label>
              {w.planet.rings && color('ring colour', w.planet.ringColor, (v) => setPlanet({ ringColor: v }))}
              <label className="flex items-center gap-2">
                moons
                <select className={`${input} !w-auto !py-1`} value={w.planet.moons} onChange={(e) => setPlanet({ moons: Number(e.target.value) })}>
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <span className="hud-label">sky and light</span>
        <div className="flex flex-wrap gap-4">
          {color('sky', w.sky, (v) => set({ sky: v }))}
          {color('glow', w.glow, (v) => set({ glow: v }))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {slider('haze', w.haze, 0, 1, 0.05, (v) => set({ haze: v }))}
          {slider('stars', w.stars, 0, 1, 0.05, (v) => set({ stars: v }))}
        </div>
      </div>
      <div className="space-y-2">
        <span className="hud-label">floor</span>
        <div className="flex flex-wrap items-center gap-2">
          {FLOORS.map((f) => (
            <button key={f.id} className={chip(w.floor === f.id)} onClick={() => set({ floor: f.id })}>
              {f.label}
            </button>
          ))}
          {w.floor !== 'none' && color('colour', w.floorColor, (v) => set({ floorColor: v }))}
        </div>
      </div>
      {err && <p className="text-[12px] text-warn">{err}</p>}
      <div className="flex gap-2">
        <button className={button} onClick={() => void save()} disabled={!w.name.trim()}>
          save
        </button>
        <button className={quiet} onClick={cancel}>
          cancel
        </button>
        {w.id && (
          <button className={`${quiet} ml-auto !text-ink-lo`} onClick={() => void remove()}>
            delete
          </button>
        )}
      </div>
      <p className="text-[12px] text-ink-lo">The room behind updates as you design. Close Settings to see it full size.</p>
    </div>
  );
}
