'use client';
import { useState } from 'react';
import type { LeagueBoard, SportsData, SportsEvent, StandingRow } from '../types';
import { fmt } from '../format';
import { Section } from './kit';

function Games({ events, hue, showLeague }: { events: SportsEvent[]; hue: number; showLeague: boolean }) {
  if (!events.length) return <p className="text-[13px] text-ink-lo">No fixtures on the board.</p>;
  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="grid grid-cols-[1fr_auto_1fr_110px] items-center gap-3 text-[14px]">
          <span className="truncate text-right text-ink">{e.home.name}</span>
          <span className="min-w-[64px] rounded-md border border-ink-faint px-2 py-1 text-center font-mono tabular" style={e.state === 'in' ? { borderColor: `hsl(${hue} 90% 70% / .6)`, color: `hsl(${hue} 95% 80%)` } : undefined}>
            {e.state === 'pre' ? fmt.time(e.date) : `${e.home.score} – ${e.away.score}`}
          </span>
          <span className="truncate text-ink">{e.away.name}</span>
          <span className="text-right font-mono text-[10px] uppercase leading-tight text-ink-lo">
            {e.state === 'in' ? `● ${e.detail}` : e.detail}
            {showLeague && e.league && <span className="block text-ink-mid">{e.league}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Table({ rows }: { rows: StandingRow[] }) {
  if (!rows.length) return null;
  return (
    <table className="w-full text-[13px] tabular">
      <thead>
        <tr className="hud-label text-left">
          <th className="pb-2 font-normal">#</th>
          <th className="pb-2 font-normal">team</th>
          <th className="pb-2 text-right font-normal">p</th>
          <th className="pb-2 text-right font-normal">gd</th>
          <th className="pb-2 text-right font-normal">pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 10).map((s) => (
          <tr key={s.team} className="border-t border-ink-faint/60">
            <td className="py-1 font-mono text-ink-lo">{s.rank}</td>
            <td className="py-1 text-ink">{s.team}</td>
            <td className="py-1 text-right font-mono text-ink-mid">{s.played}</td>
            <td className="py-1 text-right font-mono text-ink-mid">{s.goalDiff > 0 ? `+${s.goalDiff}` : s.goalDiff}</td>
            <td className="py-1 text-right font-mono text-ink">{s.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SportsPanel({ d, hue }: { d: SportsData; hue: number }) {
  const boards: LeagueBoard[] = d.leagues ?? [{ id: 'single', name: d.league, short: d.league, events: d.events, standings: d.standings }];
  const multi = boards.length > 1;
  const [tab, setTab] = useState<string>('all');
  const current = boards.find((b) => b.id === tab);
  return (
    <div className="space-y-5">
      {multi ? (
        <div className="flex flex-wrap gap-2" role="tablist">
          {[{ id: 'all', short: 'All' }, ...boards].map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={tab === b.id}
              onClick={() => setTab(b.id)}
              className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${tab === b.id ? 'border-holo/60 text-ink' : 'border-ink-faint text-ink-mid hover:text-ink'}`}
            >
              {b.short}
            </button>
          ))}
        </div>
      ) : (
        <div className="hud-label">{boards[0].name}</div>
      )}

      {!current ? (
        <>
          <Section title={multi ? 'all games · live first' : 'scores & fixtures'}>
            <Games events={d.events} hue={hue} showLeague={multi} />
          </Section>
          {multi ? (
            <Section title="leaders">
              <ul className="space-y-1.5 text-[13px]">
                {boards.map((b) => (
                  <li key={b.id} className="flex justify-between">
                    <span className="text-ink-mid">{b.name}</span>
                    <span className="text-ink">
                      {b.standings[0]?.team ?? '—'} <span className="font-mono text-ink-lo">{b.standings[0] ? `${b.standings[0].points} pts` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : (
            boards[0].standings.length > 0 && (
              <Section title="standings">
                <Table rows={boards[0].standings} />
              </Section>
            )
          )}
        </>
      ) : (
        <>
          <div className="text-[15px] text-ink">{current.name}</div>
          <Section title="scores & fixtures">
            <Games events={current.events} hue={hue} showLeague={false} />
          </Section>
          {current.standings.length > 0 && (
            <Section title="standings">
              <Table rows={current.standings} />
            </Section>
          )}
        </>
      )}
      {d.failed?.length ? <p className="font-mono text-[11px] text-warn">Couldn’t load: {d.failed.map((f) => `${f.id} (${f.reason})`).join(', ')}</p> : null}
    </div>
  );
}
