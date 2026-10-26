'use client';
import { useState } from 'react';
import type { CryptoData } from '../types';
import { fmt } from '../format';
import { LinkButton, Pct, Section, Spark, Stat } from './kit';
import { openLink } from '@/lib/client/desktop';

/** One coin in focus with its week; the rest as a list to pick from. */
export function CryptoPanel({ d, hue }: { d: CryptoData; hue: number }) {
  const [i, setI] = useState(0);
  const c = d.coins[i] ?? d.coins[0];
  const cur = d.currency.toUpperCase();
  if (!c) return <p className="text-[15px] text-ink-mid">No coins chosen. Pick some in ⚙ Settings → Crypto.</p>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat label={c.name} value={fmt.money(c.price, cur)} />
        <Stat label="24 hours" value={<Pct v={c.change24h} />} tone={c.change24h >= 0 ? 'up' : 'down'} />
        <Stat label="market cap" value={fmt.money(c.marketCap, cur, true)} />
      </div>
      <Section title="last 7 days">
        <Spark values={c.spark} hue={hue} height={90} baseline={c.spark[0]} />
      </Section>
      <Section title="your coins">
        <ul className="space-y-1.5">
          {d.coins.map((x, k) => (
            <li key={x.id}>
              <button onClick={() => setI(k)} className={`flex w-full items-center justify-between text-left text-[14px] ${k === i ? 'text-ink' : 'text-ink-mid hover:text-ink'}`}>
                <span>
                  <span className="mr-2 font-mono text-[11px] uppercase text-ink-lo">{x.symbol}</span>
                  {x.name}
                </span>
                <span className="font-mono tabular">
                  {fmt.money(x.price, cur)} <Pct v={x.change24h} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <p className="text-[12px] leading-relaxed text-ink-lo">
        Prices are for information only, not financial advice.{' '}
        <LinkButton href="https://www.coingecko.com/en/api" onOpen={openLink}>
          data provided by CoinGecko
        </LinkButton>
      </p>
    </div>
  );
}
