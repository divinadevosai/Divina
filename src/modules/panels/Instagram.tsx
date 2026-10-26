'use client';
import type { InstagramData } from '../types';
import { fmt } from '../format';
import { LinkButton, Section, Spark, Stat } from './kit';
import { openLink } from '@/lib/client/desktop';
import { handle } from '@/ai/assistant';

export function InstagramPanel({ d, hue }: { d: InstagramData; hue: number }) {
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] text-ink">@{d.username}</div>
        <div className="flex gap-2">
          <LinkButton href={d.destinations.profile} onOpen={openLink}>profile</LinkButton>
          <LinkButton href={d.destinations.reels} onOpen={openLink}>reels</LinkButton>
          {d.destinations.latest && <LinkButton href={d.destinations.latest} onOpen={openLink}>latest</LinkButton>}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Stat label="followers" value={fmt.num(d.followers, true)} sub={`${d.growth7d >= 0 ? '+' : ''}${fmt.num(d.growth7d)} / 7d`} tone={d.growth7d >= 0 ? 'up' : undefined} />
        <Stat label="reach · 30d" value={fmt.num(d.reachTotal, true)} />
        <Stat label="engagement" value={`${(d.engagementRate * 100).toFixed(2)}%`} />
        <Stat label="reels" value={d.reels.length} sub={`${d.mediaCount} posts`} />
      </div>
      <Section title="followers · reconstructed from daily deltas">
        <Spark values={d.followerHistory.map((p) => p.total)} hue={hue} height={80} />
      </Section>
      {d.reach.length > 1 && (
        <Section title="daily reach">
          <div className="flex h-16 items-end gap-[2px]">
            {d.reach.map((r) => {
              const max = Math.max(...d.reach.map((x) => x.value)) || 1;
              return <div key={r.date} className="flex-1" style={{ height: `${(r.value / max) * 100}%`, background: `hsl(${hue} 90% 70% / .7)` }} title={`${r.date}: ${r.value}`} />;
            })}
          </div>
        </Section>
      )}
      <Section title="top content" right={<button className="font-mono text-[10px] uppercase tracking-[0.15em] text-holo-hi" onClick={() => void handle('Explain my Instagram trends', 'palette')}>explain trends</button>}>
        <ul className="grid grid-cols-5 gap-2">
          {d.top.map((m) => (
            <li key={m.id}>
              <button onClick={() => openLink(m.permalink)} className="group block w-full text-left">
                <div className="aspect-square overflow-hidden rounded-md border border-ink-faint bg-ink-faint/20">
                  {m.thumbnail ? <img src={m.thumbnail} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" /> : <div className="grid h-full place-items-center font-mono text-[9px] text-ink-lo">{m.product}</div>}
                </div>
                <div className="mt-1 font-mono text-[10px] tabular text-ink-mid">♥ {fmt.num(m.likes, true)}</div>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
