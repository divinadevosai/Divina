'use client';
import type { StocksData } from '../types';
import { fmt } from '../format';
import { Donut, Pct, Section, Spark, Stat } from './kit';

export function StocksPanel({ d, hue }: { d: StocksData; hue: number }) {
  const cur = d.holdings[0]?.currency ?? 'USD';
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="portfolio" value={fmt.money(d.totalValue, cur, true)} sub={d.example ? 'example holdings' : `${d.holdings.length} holdings`} />
        <Stat label="today" value={<Pct v={d.dayChangePct} />} sub={fmt.money(d.dayChange, cur)} tone={d.dayChangePct <= -3 ? 'warn' : undefined} />
        <Stat label="profit / loss" value={<Pct v={d.pnlPct} digits={1} />} sub={fmt.money(d.pnl, cur, true)} />
      </div>
      <Spark values={d.history} hue={hue} height={84} baseline={d.history[0]} />
      <Section title="holdings" right={<span className="font-mono text-[10px] text-ink-lo">{d.marketState.toLowerCase()}</span>}>
        <table className="w-full text-[13px] tabular">
          <thead>
            <tr className="hud-label text-left">
              <th className="pb-2 font-normal">symbol</th>
              <th className="pb-2 text-right font-normal">price</th>
              <th className="pb-2 text-right font-normal">day</th>
              <th className="pb-2 text-right font-normal">value</th>
              <th className="pb-2 text-right font-normal">p/l</th>
            </tr>
          </thead>
          <tbody>
            {[...d.holdings].sort((a, b) => b.value - a.value).map((h) => (
              <tr key={h.symbol} className="border-t border-ink-faint/60">
                <td className="py-1.5">
                  <span className="text-ink">{h.symbol}</span>
                  <span className="ml-2 text-[11px] text-ink-lo">{h.sector}</span>
                </td>
                <td className="py-1.5 text-right font-mono">{h.price.toFixed(2)}</td>
                <td className="py-1.5 text-right font-mono"><Pct v={h.changePct} /></td>
                <td className="py-1.5 text-right font-mono text-ink-mid">{fmt.money(h.value, h.currency, true)}</td>
                <td className="py-1.5 text-right font-mono"><Pct v={h.pnlPct} digits={1} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <div className="grid grid-cols-2 gap-5">
        <Section title="allocation">
          <div className="flex items-center gap-4">
            <Donut parts={d.allocation.map((a) => ({ label: a.symbol, weight: a.weight }))} hue={hue} size={104} />
            <ul className="space-y-0.5 font-mono text-[11px]">
              {d.allocation.slice(0, 6).map((a) => (
                <li key={a.symbol} className="flex justify-between gap-4 text-ink-mid">
                  <span>{a.symbol}</span>
                  <span className="text-ink">{Math.round(a.weight * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
        <Section title="sector exposure">
          <ul className="space-y-2">
            {d.sectors.map((s) => (
              <li key={s.sector}>
                <div className="flex justify-between text-[12px]">
                  <span className="text-ink-mid">{s.sector}</span>
                  <span className="font-mono text-ink">{Math.round(s.weight * 100)}%</span>
                </div>
                <div className="mt-1 h-[3px] bg-ink-faint">
                  <div className="h-full" style={{ width: `${s.weight * 100}%`, background: `hsl(${hue} 90% 70%)` }} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
