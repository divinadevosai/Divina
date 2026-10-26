'use client';
/**
 * The simple view: the same cards, data and voice, without the 3D room.
 * Used where WebGL is missing, or when a phone's browser takes the 3D view
 * away for lack of graphics memory.
 */
import { MODULES } from '@/modules/meta';
import { useData } from '@/stores/data';
import { summarize } from '@/modules/summary';
import { bus } from '@/core/bus';
import { useRing } from '@/stores/ring';
import { rememberFlat } from '@/lib/device';
import { useCompact } from './useCompact';

export function Fallback() {
  const data = useData((s) => s.modules);
  const compact = useCompact();
  return (
    <div
      className={`fixed inset-0 overflow-y-auto bg-void ${compact ? 'px-3 pb-[calc(max(16px,env(safe-area-inset-bottom))+72px)] pt-[calc(max(16px,env(safe-area-inset-top))+52px)]' : 'p-8 pb-28'}`}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="hud-label">simple view</p>
        <button
          className="rounded-full border border-ink-faint px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mid"
          onClick={() => {
            rememberFlat(false);
            location.reload();
          }}
        >
          try the 3D room
        </button>
      </div>
      <ul className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4'}`}>
        {MODULES.map((m) => {
          const s = summarize(m.id, data[m.id]);
          return (
            <li key={m.id}>
              <button
                className={`glass w-full rounded-2xl text-left ${compact ? 'p-4' : 'p-5'}`}
                onClick={() => {
                  useRing.getState().expand(m.id);
                  bus.emit({ type: 'open', module: m.id, source: 'mouse' });
                }}
              >
                <div className="hud-label">{m.code}</div>
                <div className={`mt-1 text-ink ${compact ? 'text-[17px]' : 'text-[20px]'}`}>{m.title}</div>
                <div className={`mt-2 font-light tabular text-ink ${compact ? 'text-[20px]' : 'text-[28px]'}`}>
                  {s.value} <span className="text-[12px] text-ink-mid">{s.unit}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[12px] text-ink-lo">{s.sub}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
