'use client';
import { useState } from 'react';
import type { MusicData } from '../types';
import type { ModuleData } from '@/stores/data';
import { audio } from '@/audio/engine';
import { desktop } from '@/lib/client/desktop';
import { refresh } from '../feeds';
import { Meter, Section } from './kit';

export function MusicPanel({ md, hue }: { md: ModuleData; hue: number }) {
  const d = md.status === 'ok' ? (md.data as MusicData) : null;
  const [ambient, setAmbient] = useState(audio.ambient);
  const [note, setNote] = useState<string | null>(null);
  const transport = async (action: string) => {
    const r = await desktop('media', { action });
    setNote(r.ok ? null : r.message);
    window.setTimeout(() => void refresh('music'), 600);
  };
  return (
    <div className="space-y-5">
      {d?.track ? (
        <div>
          <div className="hud-label">{d.player} · {d.state}</div>
          <div className="mt-2 text-[26px] font-light leading-tight text-ink">{d.track}</div>
          <div className="text-[15px] text-ink-mid">{d.artist}</div>
          <div className="text-[12px] text-ink-lo">{d.album}</div>
          {d.durationS ? <div className="mt-3 h-[3px] bg-ink-faint"><div className="h-full" style={{ width: `${((d.positionS ?? 0) / d.durationS) * 100}%`, background: `hsl(${hue} 90% 70%)` }} /></div> : null}
        </div>
      ) : (
        <p className="text-[14px] leading-relaxed text-ink-mid">{md.message ?? 'Nothing is playing.'}</p>
      )}
      <div className="flex gap-2">
        {(['previous', 'playpause', 'next'] as const).map((a) => (
          <button key={a} onClick={() => void transport(a)} className="glass rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-mid hover:text-ink">
            {a === 'previous' ? '⏮' : a === 'next' ? '⏭' : '⏯'} {a === 'playpause' ? 'play / pause' : a}
          </button>
        ))}
      </div>
      {note && <p className="text-[12px] text-warn">{note}</p>}
      <Section title="divina ambient engine">
        <div className="flex items-center justify-between">
          <p className="max-w-[70%] text-[13px] text-ink-mid">A very quiet synth pad and air. UI sounds duck under the voice.</p>
          <button
            onClick={() => {
              audio.unlock();
              audio.setAmbient(!ambient);
              setAmbient(!ambient);
            }}
            className="rounded-full border border-ink-faint px-3 py-1 font-mono text-[11px] uppercase text-ink"
            aria-pressed={ambient}
          >
            {ambient ? 'on' : 'off'}
          </button>
        </div>
        <div className="mt-3">
          <Meter frac={ambient ? 0.55 : 0} hue={hue} />
        </div>
      </Section>
    </div>
  );
}
