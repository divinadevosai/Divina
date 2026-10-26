import 'server-only';
import { LEAGUE_BY_CODE } from '@/modules/leagues';
import { UNOFFICIAL_OFF, unofficialFeedsOn } from '../unofficial';
import { setting } from '@/lib/server/settings';
import { cached, describeError, fetchJson, type ProviderResult } from '../http';
import type { LeagueBoard, SportsData, SportsEvent, StandingRow } from '@/modules/types';
import { LEAGUES } from '@/modules/leagues';
import { askDataServer, useDataServer } from '../dataServer';

interface ESPNScoreboard {
  leagues?: { name: string; abbreviation?: string }[];
  events?: {
    id: string;
    name: string;
    date: string;
    status: { type: { state: 'pre' | 'in' | 'post'; shortDetail: string } };
    competitions: { competitors: { homeAway: 'home' | 'away'; score?: string; team: { displayName: string; abbreviation: string } }[] }[];
  }[];
}
interface ESPNStandings {
  children?: { standings: { entries: { team: { displayName: string; abbreviation: string }; stats: { name: string; value: number }[] }[] } }[];
  standings?: { entries: { team: { displayName: string; abbreviation: string }; stats: { name: string; value: number }[] }[] };
}

const SHORT: Record<string, string> = Object.fromEntries(LEAGUES.map((l) => [l.code, l.short]));

const VALID = /^[a-z-]+\/[a-z0-9.-]+$/i;
const MAX_LEAGUES = 6;

/** DIVINA_LEAGUE (or DIVINA_LEAGUES): one code, or several separated by commas. */
export function parseLeagues(raw: string | undefined): { ok: string[]; bad: string[] } {
  const list = (raw ?? 'soccer/eng.1').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const ok: string[] = [];
  const bad: string[] = [];
  for (const l of list) {
    if (!VALID.test(l)) bad.push(l);
    else if (!ok.includes(l)) ok.push(l);
  }
  return { ok: ok.slice(0, MAX_LEAGUES), bad };
}

/** Live first, then the soonest upcoming, then the most recent results. */
export function orderEvents(events: SportsEvent[]): SportsEvent[] {
  const rank = { in: 0, pre: 1, post: 2 } as const;
  return [...events].sort((a, b) => {
    if (a.state !== b.state) return rank[a.state] - rank[b.state];
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    return a.state === 'post' ? tb - ta : ta - tb;
  });
}

async function board(id: string): Promise<LeagueBoard> {
  return cached(`sports:${id}`, 90_000, async () => {
    const [sb, st] = await Promise.all([
      fetchJson<ESPNScoreboard>(`https://site.api.espn.com/apis/site/v2/sports/${id}/scoreboard`),
      fetchJson<ESPNStandings>(`https://site.api.espn.com/apis/v2/sports/${id}/standings`).catch(() => ({}) as ESPNStandings),
    ]);
    const name = sb.leagues?.[0]?.name ?? id;
    const short = SHORT[id] ?? sb.leagues?.[0]?.abbreviation ?? name;
    const events: SportsEvent[] = (sb.events ?? []).slice(0, 12).map((e) => {
      const c = e.competitions[0]?.competitors ?? [];
      const home = c.find((x) => x.homeAway === 'home');
      const away = c.find((x) => x.homeAway === 'away');
      const side = (x?: (typeof c)[number]) => ({ name: x?.team.displayName ?? '—', abbr: x?.team.abbreviation ?? '—', score: x?.score ?? '' });
      return { id: `${id}:${e.id}`, name: e.name, home: side(home), away: side(away), state: e.status.type.state, detail: e.status.type.shortDetail, date: e.date, league: short };
    });
    const entries = st.children?.[0]?.standings.entries ?? st.standings?.entries ?? [];
    const stat = (s: { name: string; value: number }[], n: string) => s.find((x) => x.name === n)?.value ?? 0;
    const standings: StandingRow[] = entries
      .map((e) => ({
        rank: stat(e.stats, 'rank'),
        team: e.team.displayName,
        abbr: e.team.abbreviation,
        played: stat(e.stats, 'gamesPlayed'),
        points: stat(e.stats, 'points') || stat(e.stats, 'wins'),
        goalDiff: stat(e.stats, 'pointDifferential'),
      }))
      .sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.points - a.points)
      .slice(0, 20);
    return { id, name, short, events: orderEvents(events), standings };
  });
}

/** Paid apps: licensed scores from Divina's data server. */
async function fromDataServer(ok: string[], bad: string[]): Promise<ProviderResult<SportsData>> {
  let r: { leagues: LeagueBoard[]; failed: { id: string; reason: string }[] };
  try {
    r = await cached(`ds:sports:${ok.join(',')}`, 120_000, () => askDataServer<typeof r>(`sports?leagues=${encodeURIComponent(ok.join(','))}`));
  } catch (e) {
    return { status: 'error', message: `Live scores aren’t available right now: ${describeError(e)}` };
  }
  const failed = [...bad.map((id) => ({ id, reason: 'not a league code' })), ...(r.failed ?? [])];
  if (!r.leagues?.length) return { status: 'error', message: `No league could be loaded: ${failed.map((f) => `${LEAGUE_BY_CODE[f.id]?.name ?? f.id} (${f.reason})`).join('; ') || 'no data'}` };
  const leagues = r.leagues;
  return {
    status: 'ok',
    data: {
      league: leagues.length === 1 ? leagues[0].name : `${leagues.length} leagues · ${leagues.map((l) => l.short).join(' · ')}`,
      events: orderEvents(leagues.flatMap((l) => l.events)).slice(0, 24),
      standings: leagues[0].standings,
      leagues,
      failed: failed.length ? failed : undefined,
      source: 'API-SPORTS',
      fetchedAt: Date.now(),
    },
  };
}

export async function getSports(): Promise<ProviderResult<SportsData>> {
  const { ok, bad } = parseLeagues(setting('DIVINA_LEAGUES') ?? setting('DIVINA_LEAGUE'));
  if (useDataServer() && ok.length) return fromDataServer(ok, bad);
  if (!unofficialFeedsOn()) return { status: 'unconfigured', message: UNOFFICIAL_OFF('Live scores (ESPN)') };
  if (!ok.length) {
    return { status: 'unconfigured', message: `DIVINA_LEAGUE should list league codes like "soccer/eng.1, basketball/nba"${bad.length ? ` (couldn’t read: ${bad.join(', ')})` : ''}.` };
  }
  const settled = await Promise.allSettled(ok.map(board));
  const leagues: LeagueBoard[] = [];
  const failed: { id: string; reason: string }[] = bad.map((id) => ({ id, reason: 'not a league code' }));
  settled.forEach((s, i) => (s.status === 'fulfilled' ? leagues.push(s.value) : failed.push({ id: ok[i], reason: describeError(s.reason) })));
  if (!leagues.length) {
    const refused = failed.length && failed.every((f) => /HTTP 403/.test(f.reason));
    return {
      status: 'error',
      message: refused
        ? 'ESPN turned the request away (it’s a free, unofficial feed and sometimes blocks apps). Divina will keep trying; scores return when ESPN answers again.'
        : `No league could be loaded: ${failed.map((f) => `${LEAGUE_BY_CODE[f.id]?.name ?? f.id} (${f.reason})`).join('; ')}`,
    };
  }
  const data: SportsData = {
    league: leagues.length === 1 ? leagues[0].name : `${leagues.length} leagues · ${leagues.map((l) => l.short).join(' · ')}`,
    events: orderEvents(leagues.flatMap((l) => l.events)).slice(0, 24),
    standings: leagues[0].standings,
    leagues,
    failed: failed.length ? failed : undefined,
    source: 'ESPN',
    fetchedAt: Date.now(),
  };
  return { status: 'ok', data };
}
