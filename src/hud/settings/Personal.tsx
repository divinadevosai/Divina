'use client';
/** Settings for what's personal: memory, heads-ups, routines. */
import { useState } from 'react';
import { personalOp, usePersonal } from '@/lib/client/personal';
import { usePrefs } from '@/stores/prefs';
import { MODULES } from '@/modules/meta';
import { WORLDS, WORLD_IDS } from '@/render/world/worlds';
import { MAX_STEPS, type Routine, type RoutineStep } from '@/lib/personal';
import { runRoutine } from '@/ai/assistant';
import { WEB } from '@/lib/edition';
import { openMind } from '@/stores/mind';
import { useSettings } from '@/lib/client/settings';

const closeSettings = () => useSettings.getState().setOpen(false);

const input = 'w-full rounded-lg border border-ink-faint bg-black/20 px-3 py-2 text-[14px] text-ink placeholder:text-ink-lo focus:border-holo/60 focus:outline-none';
const button = 'rounded-lg border border-holo/50 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-holo-hi hover:bg-holo/10 disabled:opacity-40';
const quiet = `${button} !border-ink-faint !text-ink-mid`;

export function MemorySettings() {
  const memory = usePersonal((s) => s.memory);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (op: Record<string, unknown>) => setMsg((await personalOp('memory', op)).message ?? null);
  return (
    <div className="space-y-3">
      <button className={button} onClick={() => { closeSettings(); openMind(); }}>
        open divina’s mind
      </button>
      <div className="flex gap-2">
        <input className={input} value={text} maxLength={300} placeholder="e.g. My sister is called Amy" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && void run({ op: 'add', text }).then(() => setText(''))} />
        <button className={button} disabled={!text.trim()} onClick={() => void run({ op: 'add', text }).then(() => setText(''))}>
          add
        </button>
      </div>
      {memory.length ? (
        <ul className="space-y-1">
          {memory.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg px-1 py-1 text-[14px] text-ink hover:bg-white/[0.03]">
              <span className="break-words">{m.text}</span>
              <button className="px-1 text-[13px] text-ink-lo hover:text-ink" aria-label={`Forget “${m.text}”`} onClick={() => void run({ op: 'remove', id: m.id })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-lo">Nothing yet. Say “remember that I’m vegetarian”, or add it above.</p>
      )}
      {memory.length > 0 && (
        <button className={`${quiet} !text-ink-lo`} onClick={() => window.confirm('Forget everything Divina remembers about you?') && void run({ op: 'clear' })}>
          forget everything
        </button>
      )}
      {msg && <p className="text-[12px] text-holo-hi">{msg}</p>}
    </div>
  );
}

export function HeadsUpSettings() {
  const p = usePrefs();
  const toggle = (on: boolean, label: string, set: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-[14px] text-ink">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );
  return (
    <div className="space-y-3">
      {toggle(p.headsMeetings, 'Tell me 10 minutes before a meeting', (v) => p.set({ headsMeetings: v }))}
      {toggle(p.headsRain, 'Tell me when rain is on the way', (v) => p.set({ headsRain: v }))}
      {!WEB && toggle(p.phoneHeadsUps, 'Also phone me for timers, reminders and meetings (set up in Phone calls)', (v) => p.set({ phoneHeadsUps: v }))}
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-ink">
        <span>Quiet hours</span>
        <input type="time" className={`${input} !w-auto`} value={p.quietFrom} onChange={(e) => p.set({ quietFrom: e.target.value })} aria-label="Quiet from" />
        <span className="text-ink-lo">to</span>
        <input type="time" className={`${input} !w-auto`} value={p.quietTo} onChange={(e) => p.set({ quietTo: e.target.value })} aria-label="Quiet until" />
      </div>
      <p className="text-[12px] text-ink-lo">During quiet hours heads-ups appear on screen without speaking, and routines don’t start by themselves. Timers: say “set a timer for 10 minutes” or “remind me in 20 minutes to check the oven”.</p>
    </div>
  );
}

const STEP_TYPES: { id: RoutineStep['type']; label: string; app?: boolean }[] = [
  { id: 'say', label: 'Say something' },
  { id: 'brief', label: 'Read out a card' },
  { id: 'open', label: 'Open a card' },
  { id: 'world', label: 'Change the room' },
  { id: 'ask', label: 'Ask the AI' },
  { id: 'timer', label: 'Start a timer' },
  { id: 'media', label: 'Music: play / pause / next', app: true },
  { id: 'volume', label: 'Set the volume', app: true },
  { id: 'call', label: 'Phone me', app: true },
];
const blank = (type: RoutineStep['type']): RoutineStep =>
  type === 'brief' || type === 'open'
    ? { type, module: 'weather' }
    : type === 'world'
      ? { type, world: 'studio' }
      : type === 'timer'
        ? { type, minutes: 25, label: 'Focus' }
        : type === 'media'
          ? { type, action: 'play' }
          : type === 'volume'
            ? { type, level: 30 }
            : { type, text: '' };

function describe(s: RoutineStep): string {
  switch (s.type) {
    case 'say':
      return `say “${s.text}”`;
    case 'ask':
      return `ask “${s.text}”`;
    case 'brief':
      return `read ${s.module}`;
    case 'open':
      return `open ${s.module}`;
    case 'world':
      return `go to ${s.world}`;
    case 'timer':
      return `${s.minutes}-min ${s.label.toLowerCase()} timer`;
    case 'media':
      return `music ${s.action}`;
    case 'volume':
      return `volume ${s.level}`;
    case 'call':
      return s.text ? `phone me “${s.text}”` : 'phone me what it said';
  }
}

export function RoutineSettings() {
  const routines = usePersonal((s) => s.routines);
  const [edit, setEdit] = useState<Partial<Routine> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (edit) return <RoutineEditor routine={edit} onDone={(m) => (setEdit(null), setMsg(m))} />;
  return (
    <div className="space-y-3">
      {routines.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-ink-faint p-3">
          <div className="min-w-0">
            <div className="text-[15px] text-ink">“{r.name}”</div>
            <div className="mt-0.5 text-[12px] leading-snug text-ink-lo">
              {r.steps.map(describe).join(' → ')}
              {r.time ? ` · every ${r.days === 'daily' ? 'day' : r.days === 'weekdays' ? 'weekday' : 'weekend day'} at ${r.time}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button className={button} onClick={() => void runRoutine(r)}>
              run
            </button>
            <button className={quiet} onClick={() => setEdit(r)}>
              edit
            </button>
          </div>
        </div>
      ))}
      <button className={button} onClick={() => setEdit({ name: '', steps: [{ type: 'say', text: '' }], time: '', days: 'daily' })}>
        + new routine
      </button>
      {msg && <p className="text-[12px] text-holo-hi">{msg}</p>}
      <p className="text-[12px] text-ink-lo">Say a routine’s name to run it (“good morning”), or give it a time to run by itself while Divina is open.</p>
    </div>
  );
}

function RoutineEditor({ routine, onDone }: { routine: Partial<Routine>; onDone: (msg: string | null) => void }) {
  const worlds = usePersonal((s) => s.worlds);
  const [r, setR] = useState<Partial<Routine>>(routine);
  const [err, setErr] = useState<string | null>(null);
  const steps = r.steps ?? [];
  const setStep = (i: number, s: RoutineStep) => setR({ ...r, steps: steps.map((x, j) => (j === i ? s : x)) });
  const save = async () => {
    const res = await personalOp('routines', { op: 'save', routine: r });
    if (!res.ok) return setErr(res.message ?? 'Couldn’t save it.');
    onDone(res.message ?? null);
  };
  const remove = async () => {
    if (!r.id || !window.confirm(`Delete the “${r.name}” routine?`)) return;
    const res = await personalOp('routines', { op: 'remove', id: r.id });
    onDone(res.message ?? null);
  };
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="hud-label">what you say to start it</span>
        <input className={input} value={r.name ?? ''} maxLength={40} placeholder="e.g. work mode" onChange={(e) => setR({ ...r, name: e.target.value })} />
      </label>
      <div className="space-y-2">
        <span className="hud-label">steps</span>
        {steps.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-faint p-2">
            <select className={`${input} !w-auto`} value={s.type} onChange={(e) => setStep(i, blank(e.target.value as RoutineStep['type']))}>
              {STEP_TYPES.filter((t) => !t.app || !WEB || t.id === s.type).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {s.type === 'call' && <input className={`${input} !w-auto flex-1`} value={s.text} maxLength={300} placeholder="Empty: phone me everything above" onChange={(e) => setStep(i, { ...s, text: e.target.value })} />}
            {(s.type === 'say' || s.type === 'ask') && <input className={`${input} !w-auto flex-1`} value={s.text} maxLength={300} placeholder={s.type === 'say' ? 'Good morning!' : 'Give me a motivational quote'} onChange={(e) => setStep(i, { ...s, text: e.target.value })} />}
            {(s.type === 'brief' || s.type === 'open') && (
              <select className={`${input} !w-auto`} value={s.module} onChange={(e) => setStep(i, { ...s, module: e.target.value })}>
                {MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            )}
            {s.type === 'world' && (
              <select className={`${input} !w-auto`} value={s.world} onChange={(e) => setStep(i, { ...s, world: e.target.value })}>
                {WORLD_IDS.map((w) => (
                  <option key={w} value={w}>
                    {WORLDS[w].name}
                  </option>
                ))}
                {worlds.map((w) => (
                  <option key={w.id} value={w.name.toLowerCase()}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            {s.type === 'timer' && (
              <>
                <input type="number" min={1} max={600} className={`${input} !w-20`} value={s.minutes} onChange={(e) => setStep(i, { ...s, minutes: Number(e.target.value) })} />
                <span className="text-[13px] text-ink-mid">min, called</span>
                <input className={`${input} !w-32`} value={s.label} maxLength={60} onChange={(e) => setStep(i, { ...s, label: e.target.value })} />
              </>
            )}
            {s.type === 'media' && (
              <select className={`${input} !w-auto`} value={s.action} onChange={(e) => setStep(i, { ...s, action: e.target.value as 'play' })}>
                <option value="play">play</option>
                <option value="pause">pause</option>
                <option value="next">next song</option>
              </select>
            )}
            {s.type === 'volume' && <input type="number" min={0} max={100} className={`${input} !w-20`} value={s.level} onChange={(e) => setStep(i, { ...s, level: Number(e.target.value) })} />}
            <button className="ml-auto px-1 text-[13px] text-ink-lo hover:text-ink" aria-label="Remove step" onClick={() => setR({ ...r, steps: steps.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        {steps.length < MAX_STEPS && (
          <button className={quiet} onClick={() => setR({ ...r, steps: [...steps, blank('brief')] })}>
            + add step
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-ink">
        <span>Also run by itself at</span>
        <input type="time" className={`${input} !w-auto`} value={r.time ?? ''} onChange={(e) => setR({ ...r, time: e.target.value })} />
        <select className={`${input} !w-auto`} value={r.days ?? 'daily'} onChange={(e) => setR({ ...r, days: e.target.value as Routine['days'] })}>
          <option value="daily">every day</option>
          <option value="weekdays">weekdays</option>
          <option value="weekends">weekends</option>
        </select>
        {r.time && (
          <button className="text-[12px] text-ink-lo underline" onClick={() => setR({ ...r, time: '' })}>
            no set time
          </button>
        )}
      </div>
      {err && <p className="text-[12px] text-warn">{err}</p>}
      <div className="flex gap-2">
        <button className={button} onClick={() => void save()}>
          save
        </button>
        <button className={quiet} onClick={() => onDone(null)}>
          cancel
        </button>
        {r.id && (
          <button className={`${quiet} ml-auto !text-ink-lo`} onClick={() => void remove()}>
            delete
          </button>
        )}
      </div>
    </div>
  );
}

/** Backup to a passphrase-sealed file; restore from one (here or in the other edition). */
export function BackupSettings() {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [keys, setKeys] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rpass, setRpass] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/backup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-divina-bridge': '1' }, body: JSON.stringify(body) });
    return (await r.json()) as { ok: boolean; message?: string; file?: string; prefs?: Record<string, unknown> };
  };
  const exportIt = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { set: _s, agent: _a, ...prefs } = usePrefs.getState();
      void _s;
      void _a;
      const j = await post({ op: 'export', passphrase: pass, includeKeys: keys, prefs });
      if (!j.ok || !j.file) return setMsg({ ok: false, text: j.message ?? 'Couldn’t make the backup.' });
      const url = URL.createObjectURL(new Blob([j.file], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `divina-backup-${new Date().toISOString().slice(0, 10)}.divina`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setPass('');
      setPass2('');
      setMsg({ ok: true, text: 'Backup saved to your downloads. Keep the passphrase somewhere safe: without it the file can’t be opened, by anyone.' });
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!file) return;
    if (!window.confirm('Restoring replaces your notes, agents, memory, routines and worlds with the ones in the backup. Continue?')) return;
    setBusy(true);
    setMsg(null);
    try {
      const j = await post({ op: 'import', file: await file.text(), passphrase: rpass });
      if (!j.ok) return setMsg({ ok: false, text: j.message ?? 'Couldn’t restore it.' });
      if (j.prefs) usePrefs.getState().set(j.prefs as never);
      const { loadPersonal } = await import('@/lib/client/personal');
      const { loadSettings } = await import('@/lib/client/settings');
      const { refresh } = await import('@/modules/feeds');
      await Promise.all([loadPersonal(), loadSettings()]);
      for (const m of MODULES) void refresh(m.id);
      setRpass('');
      setMsg({ ok: true, text: j.message ?? 'Restored.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-[14px] text-ink">Make a backup</div>
        <input className={input} type="password" autoComplete="new-password" value={pass} placeholder="Choose a passphrase (8+ characters)" onChange={(e) => setPass(e.target.value)} />
        <input className={input} type="password" autoComplete="new-password" value={pass2} placeholder="Type it again" onChange={(e) => setPass2(e.target.value)} />
        <label className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-mid">
          <input type="checkbox" className="mt-0.5" checked={keys} onChange={(e) => setKeys(e.target.checked)} />
          <span>Include my API keys and passwords (sealed with the passphrase). Leave this off if you’ll store the file somewhere shared.</span>
        </label>
        <button className={button} disabled={busy || pass.length < 8 || pass !== pass2} onClick={() => void exportIt()}>
          {busy ? 'working…' : 'download backup'}
        </button>
        {pass && pass2 && pass !== pass2 && <p className="text-[12px] text-warn">The passphrases don’t match.</p>}
      </div>
      <div className="space-y-2 border-t border-ink-faint pt-4">
        <div className="text-[14px] text-ink">Restore a backup</div>
        <p className="text-[12px] leading-snug text-ink-lo">Only restore backups you made yourself. A file from someone else can carry their keys, agents and settings, so what you say could go to their accounts.</p>
        <input type="file" accept=".divina,application/json" className="block w-full text-[13px] text-ink-mid file:mr-3 file:rounded-lg file:border file:border-holo/50 file:bg-transparent file:px-3 file:py-2 file:font-mono file:text-[11px] file:uppercase file:tracking-[0.12em] file:text-holo-hi" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input className={input} type="password" autoComplete="off" value={rpass} placeholder="Its passphrase" onChange={(e) => setRpass(e.target.value)} />
        <button className={button} disabled={busy || !file || !rpass} onClick={() => void restore()}>
          {busy ? 'working…' : 'restore'}
        </button>
      </div>
      {msg && <p className={`text-[12.5px] ${msg.ok ? 'text-holo-hi' : 'text-warn'}`}>{msg.text}</p>}
    </div>
  );
}
