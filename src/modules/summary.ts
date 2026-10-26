/**
 * One-line truths about each module: what a person across the room should be
 * able to quote. Used by embodied panels, the model's context and the
 * offline voice.
 */
import type { ModuleId } from './ids';
import type { ModuleData } from '@/stores/data';
import type { AgentsData, NotesData } from './types';
import type { AIData, CalendarData, CryptoData, EmailData, InstagramData, MusicData, NewsData, ProjectsData, SportsData, StocksData, SystemData, WeatherData } from './types';
import { fmt } from './format';

export interface Summary {
  value: string;
  unit: string;
  sub: string;
  series?: number[];
  status: 'live' | 'stale' | 'unconfigured' | 'error' | 'loading';
  sentence: string;
}

export function summarize(id: ModuleId, d: ModuleData | undefined, now = Date.now()): Summary {
  if (!d || d.status === 'loading' || d.status === 'idle') return { value: '—', unit: '', sub: 'syncing', status: 'loading', sentence: `${id} is still syncing.` };
  if (d.status === 'unconfigured') return { value: '—', unit: 'not connected', sub: d.message ?? '', status: 'unconfigured', sentence: d.message ?? `${id} is not connected.` };
  if (d.status === 'error' && !d.data) return { value: '—', unit: 'unavailable', sub: d.message ?? '', status: 'error', sentence: d.message ?? `${id} is unavailable.` };
  const stale = d.fetchedAt && now - d.fetchedAt > 15 * 60_000 ? 'stale' : 'live';
  const s = (x: Omit<Summary, 'status'>): Summary => ({ ...x, status: d.status === 'error' ? 'stale' : stale });
  switch (id) {
    case 'stocks': {
      const v = d.data as StocksData;
      const top = [...v.holdings].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
      return s({
        value: fmt.money(v.totalValue, v.holdings[0]?.currency ?? 'USD', true),
        unit: `${fmt.pct(v.dayChangePct)} today`,
        sub: `P/L ${fmt.pct(v.pnlPct, 1)} · biggest mover ${top?.symbol ?? '—'} ${top ? fmt.pct(top.changePct) : ''}`,
        series: v.history,
        sentence: `Portfolio ${fmt.money(v.totalValue, v.holdings[0]?.currency ?? 'USD')}, ${fmt.pct(v.dayChangePct)} today, ${fmt.pct(v.pnlPct, 1)} overall. Holdings: ${v.holdings.map((h) => `${h.symbol} ${fmt.pct(h.changePct)}`).join(', ')}. Largest sector ${v.sectors[0]?.sector} at ${Math.round((v.sectors[0]?.weight ?? 0) * 100)}%.${v.example ? ' These are example holdings.' : ''}`,
      });
    }
    case 'crypto': {
      const v = d.data as CryptoData;
      const c = v.coins[0];
      const cur = v.currency.toUpperCase();
      return s({
        value: c ? fmt.money(c.price, cur, c.price >= 1000) : '—',
        unit: c ? `${c.symbol.toUpperCase()} ${fmt.pct(c.change24h)} 24h` : 'no coins',
        sub: v.coins.slice(1, 4).map((x) => `${x.symbol.toUpperCase()} ${fmt.pct(x.change24h)}`).join(' · '),
        series: c?.spark,
        sentence: v.coins.length
          ? `Crypto in ${cur} (last 24 hours): ${v.coins.map((x) => `${x.name} ${fmt.money(x.price, cur)} (${fmt.pct(x.change24h)})`).join(', ')}.`
          : 'No coins chosen.',
      });
    }
    case 'email': {
      const v = d.data as EmailData;
      const latest = v.messages[0];
      // Only counts and a sender reach the model's context: subjects stay on screen.
      return s({
        value: String(v.unread),
        unit: 'unread',
        sub: latest ? `${latest.from} · ${latest.subject}` : 'Inbox empty',
        sentence: `${v.unread} unread email${v.unread === 1 ? '' : 's'} in ${v.address}.${latest ? ` Latest from ${latest.from}, ${fmt.age(latest.at, now)}.` : ''}`,
      });
    }
    case 'weather': {
      const v = d.data as WeatherData;
      return s({
        value: `${Math.round(v.tempC)}°`,
        unit: v.label,
        sub: `${v.place} · feels ${Math.round(v.feelsC)}° · ${Math.round(v.daily[0]?.minC ?? 0)}°/${Math.round(v.daily[0]?.maxC ?? 0)}°`,
        series: v.hourly.map((h) => h.tempC),
        sentence: `${v.place}: ${Math.round(v.tempC)} degrees and ${v.label.toLowerCase()}, feels like ${Math.round(v.feelsC)}. Today ${Math.round(v.daily[0]?.minC ?? 0)} to ${Math.round(v.daily[0]?.maxC ?? 0)}. Tomorrow ${v.daily[1]?.label.toLowerCase() ?? ''}.`,
      });
    }
    case 'news': {
      const v = d.data as NewsData;
      return s({
        value: String(v.articles.length),
        unit: `${v.topic} stories`,
        sub: v.articles[0]?.title ?? '',
        sentence: v.digest ?? `Top ${v.topic} stories: ${v.articles.slice(0, 3).map((a) => a.title).join('; ')}.`,
      });
    }
    case 'sports': {
      const v = d.data as SportsData;
      const e = v.events[0];
      const game = (x: SportsData['events'][number]) =>
        `${x.league ? `${x.league}: ` : ''}${x.state === 'pre' ? `${x.home.name} play ${x.away.name} ${x.detail}` : `${x.home.name} ${x.home.score}, ${x.away.name} ${x.away.score}, ${x.detail}`}`;
      const boards = v.leagues ?? [{ id: '', name: v.league, short: v.league, events: v.events, standings: v.standings }];
      const leaders = boards.filter((b) => b.standings[0]).map((b) => `${b.standings[0].team} lead ${boards.length > 1 ? b.short : 'the table'} on ${b.standings[0].points}`);
      const live = v.events.filter((x) => x.state === 'in').length;
      return s({
        value: e ? (e.state === 'pre' ? fmt.time(e.date) : `${e.home.score}–${e.away.score}`) : '—',
        unit: e ? `${e.home.abbr} v ${e.away.abbr}${boards.length > 1 && e.league ? ` · ${e.league}` : ''}` : v.league,
        sub: `${v.league}${live ? ` · ${live} live` : ''}${leaders[0] ? ` · ${leaders[0]}` : ''}`,
        sentence: `${v.league}. ${v.events.slice(0, boards.length > 1 ? 5 : 3).map(game).join('. ')}. ${leaders.join('; ')}.${v.failed?.length ? ` I couldn’t load ${v.failed.map((f) => f.id).join(', ')}.` : ''}`,
      });
    }
    case 'calendar': {
      const v = d.data as CalendarData;
      const upcoming = v.events.filter((e) => new Date(e.end).getTime() > now);
      const today = upcoming.filter((e) => new Date(e.start).toDateString() === new Date(now).toDateString());
      const next = upcoming[0];
      return s({
        value: String(today.length),
        unit: today.length === 1 ? 'event today' : 'events today',
        sub: next ? `next: ${next.title} · ${next.allDay ? 'all day' : fmt.time(next.start)}` : 'nothing scheduled',
        sentence: today.length
          ? `You have ${today.length} ${today.length === 1 ? 'event' : 'events'} today: ${today.map((e) => `${e.title}${e.allDay ? '' : ` at ${fmt.time(e.start)}`}`).join(', ')}.`
          : next
            ? `Nothing else today. Next is ${next.title} on ${new Date(next.start).toLocaleDateString(undefined, { weekday: 'long' })}.`
            : 'Your calendar is clear this week.',
      });
    }
    case 'instagram': {
      const v = d.data as InstagramData;
      return s({
        value: fmt.num(v.followers, true),
        unit: 'followers',
        sub: `${v.growth7d >= 0 ? '+' : ''}${fmt.num(v.growth7d)} this week · engagement ${(v.engagementRate * 100).toFixed(1)}%`,
        series: v.followerHistory.map((p) => p.total),
        sentence: `@${v.username} has ${fmt.num(v.followers)} followers, ${v.growth7d >= 0 ? 'up' : 'down'} ${fmt.num(Math.abs(v.growth7d))} this week. Engagement ${(v.engagementRate * 100).toFixed(2)} percent; reach ${fmt.num(v.reachTotal)} over 30 days; ${v.reels.length} reels in the recent feed. Top post: ${v.top[0]?.caption?.slice(0, 60) ?? 'n/a'} with ${v.top[0]?.likes ?? 0} likes.`,
      });
    }
    case 'projects': {
      const v = d.data as ProjectsData;
      return s({
        value: String(v.projects.length),
        unit: v.projects.length === 1 ? 'project' : 'projects',
        sub: v.projects.map((p) => p.name).join(' · '),
        sentence: v.projects.map((p) => `${p.name}: ${p.tagline}. Status ${p.status}.`).join(' '),
      });
    }
    case 'music': {
      const v = d.data as MusicData;
      return s({
        value: v.track ?? '—',
        unit: v.artist ?? v.state,
        sub: `${v.player} · ${v.state}`,
        sentence: v.track ? `${v.player} is ${v.state}: ${v.track} by ${v.artist}.` : `${v.player} is ${v.state}.`,
      });
    }
    case 'system': {
      const v = d.data as SystemData;
      return s({
        value: `${Math.round(v.cpuLoad * 100)}%`,
        unit: 'CPU',
        sub: `memory ${fmt.bytes(v.memUsed)} of ${fmt.bytes(v.memTotal)} · up ${fmt.duration(v.uptimeS)}`,
        series: v.loadHistory,
        sentence: `${v.host}: CPU at ${Math.round(v.cpuLoad * 100)} percent across ${v.cores} cores, memory ${fmt.bytes(v.memUsed)} of ${fmt.bytes(v.memTotal)}, up ${fmt.duration(v.uptimeS)}.${v.disk ? ` Disk ${Math.round((v.disk.used / v.disk.total) * 100)} percent full.` : ''}`,
      });
    }
    case 'notes': {
      const v = d.data as NotesData;
      const open = v.notes.filter((n) => !n.done);
      return s({
        value: String(open.length),
        unit: open.length === 1 ? 'to do' : 'to do',
        sub: open.slice(0, 3).map((n) => n.text).join(' · ') || 'Nothing on your list',
        sentence: open.length
          ? `You have ${open.length} thing${open.length === 1 ? '' : 's'} on your list: ${open.slice(0, 8).map((n) => n.text).join('; ')}${open.length > 8 ? `; and ${open.length - 8} more` : ''}.`
          : 'Your list is empty.',
      });
    }
    case 'agents': {
      const v = d.data as AgentsData;
      return s({
        value: String(v.agents.length),
        unit: v.agents.length === 1 ? 'agent' : 'agents',
        sub: v.agents.map((a) => a.name).join(' · ') || 'Create your first agent',
        sentence: v.agents.length
          ? `Your agents: ${v.agents.map((a) => a.name).join(', ')}. Say “talk to” and a name to switch.`
          : 'You have no agents yet. Open the Agents card to create one.',
      });
    }
    case 'ai': {
      const v = d.data as AIData;
      return s({ value: v.online ? 'online' : 'local', unit: v.model, sub: v.source, sentence: v.online ? `Connected to ${v.model}.` : 'Running on the local command engine; the model is not configured.' });
    }
  }
}
