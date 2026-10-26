'use client';
import type { WeatherData } from '../types';
import { fmt } from '../format';
import { Section, Spark, Stat } from './kit';

export function WeatherPanel({ d, hue }: { d: WeatherData; hue: number }) {
  const lo = Math.min(...d.daily.map((x) => x.minC));
  const hi = Math.max(...d.daily.map((x) => x.maxC));
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[64px] font-extralight leading-none tabular">{Math.round(d.tempC)}°</div>
          <div className="mt-2 text-[15px] text-ink-mid">{d.label} · {d.place}</div>
        </div>
        <div className="grid grid-cols-3 gap-5">
          <Stat label="feels" value={`${Math.round(d.feelsC)}°`} />
          <Stat label="humidity" value={`${d.humidity}%`} />
          <Stat label="wind" value={Math.round(d.windKph)} sub="km/h" />
        </div>
      </div>
      <Section title="next 24 hours">
        <Spark values={d.hourly.map((h) => h.tempC)} hue={hue} height={70} />
        <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-lo">
          {d.hourly.filter((_, i) => i % 4 === 0).map((h) => (
            <span key={h.t}>
              {new Date(h.t).getHours().toString().padStart(2, '0')}h · {h.precip !== undefined ? `${h.precip}%` : `${h.mm ?? 0} mm`}
            </span>
          ))}
        </div>
      </Section>
      <Section title="five days">
        <ul className="space-y-2.5">
          {d.daily.map((day) => (
            <li key={day.date} className="grid grid-cols-[52px_1fr_110px_80px] items-center gap-3 text-[13px]">
              <span className="font-mono text-ink-mid">{fmt.day(day.date)}</span>
              <div className="relative h-[4px] bg-ink-faint">
                <div className="absolute h-full" style={{ left: `${((day.minC - lo) / (hi - lo || 1)) * 100}%`, width: `${Math.max(4, ((day.maxC - day.minC) / (hi - lo || 1)) * 100)}%`, background: `hsl(${hue} 90% 70%)` }} />
              </div>
              <span className="text-ink-mid">{day.label}</span>
              <span className="text-right font-mono tabular">{Math.round(day.minC)}° / {Math.round(day.maxC)}°</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
