'use client';
/** Small, honest charts. SVG, tabular figures, lines that draw themselves. */
import { motion } from 'framer-motion';
import { useId } from 'react';
import { openLink } from '@/lib/client/desktop';
import { hueCss } from '../meta';
import { fmt } from '../format';

export function Spark({ values, hue, height = 64, fill = true, baseline }: { values: number[]; hue: number; height?: number; fill?: boolean; baseline?: number }) {
  const id = useId();
  if (values.length < 2) return <div style={{ height }} className="grid place-items-center text-[11px] text-ink-lo">not enough history</div>;
  const w = 100;
  const min = Math.min(...values, baseline ?? Infinity);
  const max = Math.max(...values, baseline ?? -Infinity);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - ((v - min) / span) * (height - 6) - 3] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="trend">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={hueCss(hue, 90, 65, 0.35)} />
          <stop offset="1" stopColor={hueCss(hue, 90, 65, 0)} />
        </linearGradient>
      </defs>
      {baseline !== undefined && <line x1="0" x2={w} y1={height - ((baseline - min) / span) * (height - 6) - 3} y2={height - ((baseline - min) / span) * (height - 6) - 3} stroke="rgba(160,190,255,0.25)" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />}
      {fill && <motion.path d={`${d} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }} />}
      <motion.path d={d} fill="none" stroke={hueCss(hue, 95, 72)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: [0.65, 0, 0.35, 1] }} />
    </svg>
  );
}

export function Meter({ frac, hue, warn, segments = 24 }: { frac: number; hue: number; warn?: boolean; segments?: number }) {
  const lit = Math.round(Math.min(1, Math.max(0, frac)) * segments);
  return (
    <div className="flex gap-[3px]" role="meter" aria-valuenow={Math.round(frac * 100)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: segments }, (_, i) => (
        <motion.span
          key={i}
          className="h-2.5 flex-1"
          initial={{ opacity: 0.15 }}
          animate={{ opacity: i < lit ? 1 : 0.18 }}
          transition={{ delay: i * 0.018, duration: 0.25 }}
          style={{ background: i < lit ? (warn && i >= segments * 0.8 ? '#ff8a40' : hueCss(hue, 95, 70)) : 'rgba(150,175,225,0.35)' }}
        />
      ))}
    </div>
  );
}

export function Donut({ parts, hue, size = 120 }: { parts: { label: string; weight: number }[]; hue: number; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="allocation">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(150,175,225,0.12)" strokeWidth="9" />
      {parts.map((p, i) => {
        const len = p.weight * c;
        const el = (
          <motion.circle
            key={p.label}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={hueCss(hue - i * 18, 85, 70 - i * 5)}
            strokeWidth="9"
            strokeDasharray={`${Math.max(0, len - 1.2)} ${c}`}
            strokeDashoffset={-acc}
            transform="rotate(-90 50 50)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 * i, duration: 0.5 }}
          />
        );
        acc += len;
        return el;
      })}
    </svg>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'up' | 'down' | 'warn' }) {
  return (
    <div>
      <div className="hud-label">{label}</div>
      <div className={`mt-1 font-light tabular text-[26px] leading-none ${tone === 'warn' ? 'text-warn' : tone === 'up' ? 'text-[hsl(185,90%,72%)]' : 'text-ink'}`}>{value}</div>
      {sub && <div className="mt-1 font-mono text-[11px] text-ink-lo">{sub}</div>}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border-t border-ink-faint pt-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="hud-label">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Provenance({ source, at }: { source?: string; at?: number }) {
  return (
    <div className="flex justify-between border-t border-ink-faint pt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-lo">
      <span>{source ?? '—'}</span>
      <span>{fmt.age(at)}</span>
    </div>
  );
}

export function Pct({ v, digits = 2 }: { v: number; digits?: number }) {
  return <span className={v >= 0 ? 'text-[hsl(185,90%,72%)]' : 'text-ink-mid'}>{fmt.pct(v, digits)}</span>;
}

export function LinkButton({ href, children, onOpen }: { href: string; children: React.ReactNode; onOpen?: (href: string) => void }) {
  return (
    <button
      onClick={() => (onOpen ? onOpen(href) : openLink(href))}
      className="rounded-full border border-ink-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mid transition hover:border-holo/60 hover:text-ink"
    >
      {children}
    </button>
  );
}
