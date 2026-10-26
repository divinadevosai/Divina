'use client';
import type { CalendarData } from '../types';
import { fmt } from '../format';

export function CalendarPanel({ d, hue }: { d: CalendarData; hue: number }) {
  const now = Date.now();
  const days = new Map<string, typeof d.events>();
  for (const e of d.events.filter((x) => new Date(x.end).getTime() > now)) {
    const k = new Date(e.start).toDateString();
    days.set(k, [...(days.get(k) ?? []), e]);
  }
  return (
    <div className="space-y-5">
      <div className="hud-label">{d.calendarName}</div>
      {[...days].map(([day, evs]) => (
        <section key={day} className="border-t border-ink-faint pt-3">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid">
            {new Date(day).toDateString() === new Date().toDateString() ? 'Today' : new Date(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
          </div>
          <ul className="space-y-2">
            {evs.map((e) => {
              const soon = new Date(e.start).getTime() - now < 3600_000 && new Date(e.start).getTime() > now;
              return (
                <li key={e.id} className="grid grid-cols-[88px_1fr] gap-3 text-[14px]">
                  <span className="font-mono text-[12px] tabular text-ink-mid">{e.allDay ? 'all day' : `${fmt.time(e.start)}–${fmt.time(e.end)}`}</span>
                  <span className="border-l-2 pl-3 text-ink" style={{ borderColor: `hsl(${hue} 90% 70% / ${soon ? 1 : 0.35})` }}>
                    {e.title}
                    {e.location && <span className="block text-[11px] text-ink-lo">{e.location}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!days.size && <p className="text-[14px] text-ink-mid">Nothing scheduled in the next week.</p>}
    </div>
  );
}
