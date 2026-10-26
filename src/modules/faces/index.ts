/**
 * Card faces. One function per module, sharing a common frame:
 *   header: code · index · live dot · title
 *   body:   module-specific figures and charts
 *   footer: provenance · age
 */
import type { ModuleId } from '../ids';
import { MODULE_BY_ID, moduleIndex } from '../meta';
import type { ModuleData } from '@/stores/data';
import type {
  AIData, CalendarData, CryptoData, EmailData, InstagramData, MusicData, NewsData, ProjectsData, SportsData, StocksData, SystemData, WeatherData,
} from '../types';
import type { AgentsData, NotesData } from '../types';
import { fmt } from '../format';
import { FACE_H, FACE_W, INK, PAD, bar, dot, rule, segments, sparkline, text, ticks, wrap } from './draw';
import { hueCss } from '../meta';

export interface FaceContext {
  now: number;
  warning: string | null;
  /** 0..1 chart draw-on progress */
  progress: number;
  /** extra client-side facts (e.g. fps, gpu) */
  client?: { agent?: string; fps?: number; gpu?: string; battery?: number | null; net?: string; aiTurns?: number; aiStatus?: string; ambient?: boolean };
}

export function drawCardFace(ctx: CanvasRenderingContext2D, id: ModuleId, d: ModuleData | undefined, fc: FaceContext) {
  const meta = MODULE_BY_ID[id];
  const hue = meta.hue;
  ctx.clearRect(0, 0, FACE_W, FACE_H);

  // header
  const idx = String(moduleIndex(id) + 1).padStart(2, '0');
  text(ctx, `${meta.code} · ${idx}`, PAD, 64, 18, INK.lo, { mono: true, tracking: 3 });
  const live = d?.status === 'ok';
  const statusLabel = fc.warning ? 'WARN' : live ? 'LIVE' : d?.status === 'loading' || !d ? 'SYNC' : d.status === 'unconfigured' ? 'LINK' : 'ERR';
  text(ctx, statusLabel, FACE_W - PAD - 22, 64, 18, fc.warning ? INK.warn : INK.mid, { mono: true, align: 'right', tracking: 3 });
  dot(ctx, FACE_W - PAD - 6, 58, 6, fc.warning ? INK.warn : live ? hueCss(hue, 95, 70) : INK.lo);
  text(ctx, meta.title, PAD, 122, 46, INK.hi, { weight: 600 });
  ticks(ctx, 146, 30);

  // body
  if (!d || d.status === 'loading' || d.status === 'idle') {
    text(ctx, 'SYNCING', PAD, 360, 22, INK.lo, { mono: true, tracking: 6 });
    segments(ctx, PAD, 380, FACE_W - PAD * 2, 8, ((fc.now / 900) % 1), 24, hue);
  } else if (d.status === 'unconfigured' || d.status === 'error') {
    text(ctx, d.status === 'error' ? 'SOURCE UNAVAILABLE' : 'NOT CONNECTED', PAD, 230, 20, d.status === 'error' ? INK.warn : INK.mid, { mono: true, tracking: 4 });
    wrap(ctx, d.message ?? '', PAD, 280, 25, INK.mid, FACE_W - PAD * 2, 36, 8);
    if (id === 'music') drawAmbient(ctx, hue, fc);
  } else {
    BODY[id](ctx, d.data as never, hue, fc);
  }

  // footer
  rule(ctx, FACE_H - 86);
  const src = d?.source ?? (d?.data as { source?: string } | undefined)?.source ?? '—';
  text(ctx, src.toUpperCase(), PAD, FACE_H - 50, 15, INK.lo, { mono: true, tracking: 2, max: FACE_W - PAD * 2 - 120 });
  text(ctx, fmt.ageCoarse(d?.fetchedAt, fc.now), FACE_W - PAD, FACE_H - 50, 15, INK.lo, { mono: true, align: 'right' });
  if (fc.warning) text(ctx, `⚠ ${fc.warning}`.toUpperCase(), PAD, FACE_H - 108, 17, INK.warn, { mono: true, tracking: 2, max: FACE_W - PAD * 2 });
}

type Body<T> = (ctx: CanvasRenderingContext2D, d: T, hue: number, fc: FaceContext) => void;

function big(ctx: CanvasRenderingContext2D, value: string, unit: string, y = 262) {
  text(ctx, value, PAD - 4, y, 100, INK.hi, { weight: 300, tracking: -2 });
  if (unit) text(ctx, unit, FACE_W - PAD, y - 60, 22, INK.mid, { mono: true, align: 'right', tracking: 2 });
}

function row(ctx: CanvasRenderingContext2D, y: number, left: string, right: string, rightColor = INK.hi, sub?: string) {
  text(ctx, left, PAD, y, 25, INK.hi, { max: FACE_W - PAD * 2 - 170 });
  text(ctx, right, FACE_W - PAD, y, 25, rightColor, { mono: true, align: 'right' });
  if (sub) text(ctx, sub, PAD, y + 26, 16, INK.lo, { mono: true, max: FACE_W - PAD * 2 });
}

const stocks: Body<StocksData> = (ctx, d, hue, fc) => {
  const cur = d.holdings[0]?.currency ?? 'USD';
  big(ctx, fmt.money(d.totalValue, cur, true), 'PORTFOLIO');
  const up = d.dayChangePct >= 0;
  text(ctx, `${fmt.pct(d.dayChangePct)} today`, PAD, 306, 26, up ? hueCss(185, 90, 70) : INK.mid, { mono: true });
  text(ctx, `P/L ${fmt.pct(d.pnlPct, 1)}`, FACE_W - PAD, 306, 22, INK.mid, { mono: true, align: 'right' });
  sparkline(ctx, d.history, PAD, 334, FACE_W - PAD * 2, 130, hue, { fill: true, progress: fc.progress, baseline: d.history[0] });
  let y = 520;
  for (const h of [...d.holdings].sort((a, b) => b.value - a.value).slice(0, 4)) {
    row(ctx, y, h.symbol, fmt.pct(h.changePct), h.changePct >= 0 ? hueCss(185, 90, 72) : INK.mid);
    y += 44;
  }
  if (d.example) text(ctx, 'EXAMPLE HOLDINGS', FACE_W - PAD, 64 + 40, 14, INK.lo, { mono: true, align: 'right', tracking: 2 });
};

const crypto: Body<CryptoData> = (ctx, d, hue, fc) => {
  const lead = d.coins[0];
  if (!lead) {
    text(ctx, 'No coins chosen', PAD, 246, 24, INK.mid);
    return;
  }
  big(ctx, fmt.money(lead.price, d.currency.toUpperCase(), lead.price >= 1000), lead.symbol.toUpperCase());
  const up = lead.change24h >= 0;
  text(ctx, `${fmt.pct(lead.change24h)} 24h`, PAD, 306, 26, up ? hueCss(185, 90, 70) : INK.mid, { mono: true });
  text(ctx, '7 DAYS', FACE_W - PAD, 306, 16, INK.lo, { mono: true, align: 'right', tracking: 2 });
  sparkline(ctx, lead.spark, PAD, 334, FACE_W - PAD * 2, 120, hue, { fill: true, progress: fc.progress, baseline: lead.spark[0] });
  let y = 510;
  for (const c of d.coins.slice(1, 5)) {
    row(ctx, y, c.symbol.toUpperCase(), fmt.pct(c.change24h), c.change24h >= 0 ? hueCss(185, 90, 72) : INK.mid);
    y += 44;
  }
};

const email: Body<EmailData> = (ctx, d, hue) => {
  big(ctx, String(d.unread), 'UNREAD');
  text(ctx, d.address, PAD, 306, 20, INK.mid, { max: FACE_W - PAD * 2 });
  let y = 372;
  for (const m of d.messages.slice(0, 5)) {
    if (m.unread) dot(ctx, PAD + 5, y - 8, 5, hueCss(hue, 90, 72));
    text(ctx, m.from, PAD + (m.unread ? 20 : 0), y, 21, m.unread ? INK.hi : INK.mid, { max: FACE_W - PAD * 2 - 130 });
    text(ctx, fmt.ageCoarse(m.at, Date.now()).replace(' ago', ''), FACE_W - PAD, y, 15, INK.lo, { mono: true, align: 'right' });
    text(ctx, m.subject || '(no subject)', PAD + (m.unread ? 20 : 0), y + 26, 17, INK.lo, { max: FACE_W - PAD * 2 - 20 });
    y += 68;
    if (y > FACE_H - 120) break;
  }
  if (!d.messages.length) text(ctx, 'Inbox is empty', PAD, y, 24, INK.mid);
};

const weather: Body<WeatherData> = (ctx, d, hue, fc) => {
  big(ctx, `${Math.round(d.tempC)}°`, d.label.toUpperCase());
  text(ctx, d.place, PAD, 306, 24, INK.mid, { max: FACE_W - PAD * 2 });
  text(ctx, `FEELS ${Math.round(d.feelsC)}°  ·  HUM ${d.humidity}%  ·  WIND ${Math.round(d.windKph)} KM/H`, PAD, 346, 16, INK.lo, { mono: true, tracking: 1 });
  sparkline(ctx, d.hourly.map((h) => h.tempC), PAD, 372, FACE_W - PAD * 2, 70, hue, { progress: fc.progress });
  const all = d.daily.flatMap((x) => [x.minC, x.maxC]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  let y = 500;
  for (const day of d.daily.slice(0, 5)) {
    text(ctx, fmt.day(day.date).toUpperCase(), PAD, y, 19, INK.mid, { mono: true });
    const x0 = PAD + 90;
    const w = FACE_W - PAD * 2 - 90 - 130;
    ctx.fillStyle = INK.faint;
    ctx.fillRect(x0, y - 8, w, 4);
    ctx.fillStyle = hueCss(hue, 95, 70);
    ctx.fillRect(x0 + ((day.minC - lo) / (hi - lo || 1)) * w, y - 10, Math.max(6, ((day.maxC - day.minC) / (hi - lo || 1)) * w), 8);
    text(ctx, `${Math.round(day.minC)}° / ${Math.round(day.maxC)}°`, FACE_W - PAD, y, 19, INK.hi, { mono: true, align: 'right' });
    y += 38;
  }
};

const news: Body<NewsData> = (ctx, d) => {
  text(ctx, `${d.topic.toUpperCase()} · ${d.articles.length} STORIES`, PAD, 196, 17, INK.lo, { mono: true, tracking: 3 });
  let y = 244;
  for (const a of d.articles.slice(0, 5)) {
    const lines = wrap(ctx, a.title, PAD, y, 25, INK.hi, FACE_W - PAD * 2, 31, 2);
    text(ctx, `${a.site}  ·  ${a.points} PTS`, PAD, y + lines * 31 - 4, 15, INK.lo, { mono: true });
    y += lines * 31 + 30;
    if (y > FACE_H - 150) break;
  }
};

const sports: Body<SportsData> = (ctx, d, hue) => {
  const multi = (d.leagues?.length ?? 1) > 1;
  text(ctx, d.league.toUpperCase(), PAD, 196, 17, INK.lo, { mono: true, tracking: 3, max: FACE_W - PAD * 2 });
  let y = 246;
  // events arrive ordered: live, then soonest, then latest results
  const evs = d.events.slice(0, 4);
  for (const e of evs) {
    const score = e.state === 'pre' ? fmt.time(e.date) : `${e.home.score} – ${e.away.score}`;
    const sub = `${multi && e.league ? `${e.league}  ·  ` : ''}${e.detail}`.toUpperCase();
    row(ctx, y, `${e.home.abbr}  v  ${e.away.abbr}`, score, e.state === 'in' ? hueCss(hue, 95, 72) : INK.hi, sub);
    y += 64;
  }
  if (!evs.length) text(ctx, 'No fixtures on the board', PAD, y, 24, INK.mid);
  y = Math.max(y + 10, 540);
  rule(ctx, y - 28);
  if (multi) {
    // one leader per league
    for (const l of (d.leagues ?? []).slice(0, 3)) {
      const top = l.standings[0];
      row(ctx, y, `${l.short}  ${top?.team ?? '—'}`, top ? `${top.points}` : '');
      y += 38;
    }
  } else {
    for (const s of d.standings.slice(0, 3)) {
      row(ctx, y, `${s.rank}  ${s.team}`, `${s.points}`);
      y += 38;
    }
  }
};

const calendar: Body<CalendarData> = (ctx, d, hue, fc) => {
  const now = fc.now;
  const upcoming = d.events.filter((e) => new Date(e.end).getTime() > now);
  const today = upcoming.filter((e) => new Date(e.start).toDateString() === new Date(now).toDateString());
  big(ctx, String(today.length), today.length === 1 ? 'EVENT TODAY' : 'EVENTS TODAY');
  let y = 330;
  for (const e of upcoming.slice(0, 6)) {
    const start = new Date(e.start);
    const when = e.allDay ? 'ALL DAY' : start.toDateString() === new Date(now).toDateString() ? fmt.time(e.start) : `${fmt.day(e.start).toUpperCase()} ${fmt.time(e.start)}`;
    ctx.fillStyle = hueCss(hue, 95, 70, start.getTime() - now < 3600_000 ? 1 : 0.4);
    ctx.fillRect(PAD, y - 22, 4, 28);
    text(ctx, e.title, PAD + 20, y, 24, INK.hi, { max: FACE_W - PAD * 2 - 190 });
    text(ctx, when, FACE_W - PAD, y, 18, INK.mid, { mono: true, align: 'right' });
    y += 50;
  }
  if (!upcoming.length) text(ctx, 'Nothing scheduled this week.', PAD, y, 24, INK.mid);
};

const instagram: Body<InstagramData> = (ctx, d, hue, fc) => {
  big(ctx, fmt.num(d.followers, true), 'FOLLOWERS');
  text(ctx, `@${d.username}`, PAD, 306, 24, INK.mid);
  text(ctx, `${d.growth7d >= 0 ? '+' : ''}${fmt.num(d.growth7d)} / 7D`, FACE_W - PAD, 306, 22, hueCss(hue, 90, 72), { mono: true, align: 'right' });
  sparkline(ctx, d.followerHistory.map((p) => p.total), PAD, 334, FACE_W - PAD * 2, 120, hue, { fill: true, progress: fc.progress });
  row(ctx, 510, 'Engagement', fmt.pct(d.engagementRate * 100, 2, false));
  row(ctx, 554, 'Reach · 30d', fmt.num(d.reachTotal, true));
  row(ctx, 598, 'Reels', String(d.reels.length));
};

const projects: Body<ProjectsData> = (ctx, d, hue) => {
  big(ctx, String(d.projects.length), d.projects.length === 1 ? 'PROJECT' : 'PROJECTS');
  let y = 330;
  for (const p of d.projects.slice(0, 4)) {
    text(ctx, p.name, PAD, y, 30, INK.hi, { weight: 500 });
    text(ctx, p.status.toUpperCase(), PAD, y + 28, 15, hueCss(hue, 90, 72), { mono: true, tracking: 2, max: FACE_W - PAD * 2 });
    const right = p.repo ? `★ ${p.repo.stars}` : `${p.prompts.length} PROMPTS`;
    text(ctx, right, FACE_W - PAD, y, 20, INK.mid, { mono: true, align: 'right' });
    y += 76;
  }
};

function drawAmbient(ctx: CanvasRenderingContext2D, hue: number, fc: FaceContext) {
  const y = 560;
  text(ctx, 'DIVINA AMBIENT ENGINE', PAD, y, 17, INK.mid, { mono: true, tracking: 3 });
  text(ctx, fc.client?.ambient ? 'ON' : 'OFF', FACE_W - PAD, y, 17, INK.hi, { mono: true, align: 'right' });
  segments(ctx, PAD, y + 24, FACE_W - PAD * 2, 18, fc.client?.ambient ? 0.55 : 0, 20, hue);
}

const music: Body<MusicData> = (ctx, d, hue, fc) => {
  text(ctx, `${d.player.toUpperCase()} · ${d.state.toUpperCase()}`, PAD, 196, 17, INK.lo, { mono: true, tracking: 3 });
  if (d.track) {
    wrap(ctx, d.track, PAD, 262, 44, INK.hi, FACE_W - PAD * 2, 52, 2);
    text(ctx, d.artist ?? '', PAD, 380, 26, INK.mid, { max: FACE_W - PAD * 2 });
    text(ctx, d.album ?? '', PAD, 416, 20, INK.lo, { max: FACE_W - PAD * 2 });
    if (d.durationS) {
      bar(ctx, PAD, 452, FACE_W - PAD * 2, 6, (d.positionS ?? 0) / d.durationS, hue);
      text(ctx, `${fmt.duration(d.positionS ?? 0)}`, PAD, 490, 16, INK.lo, { mono: true });
    }
  } else text(ctx, 'Nothing playing', PAD, 262, 36, INK.mid);
  drawAmbient(ctx, hue, fc);
};

const system: Body<SystemData> = (ctx, d, hue, fc) => {
  big(ctx, `${Math.round(d.cpuLoad * 100)}%`, 'CPU LOAD');
  text(ctx, `${d.cores} × ${d.cpuModel}`, PAD, 306, 18, INK.mid, { mono: true, max: FACE_W - PAD * 2 });
  sparkline(ctx, d.loadHistory.length > 1 ? d.loadHistory : [0, d.cpuLoad], PAD, 330, FACE_W - PAD * 2, 80, hue, { fill: true });
  let y = 460;
  const meter = (label: string, frac: number, right: string, warn = false) => {
    text(ctx, label, PAD, y, 18, INK.mid, { mono: true, tracking: 2 });
    text(ctx, right, FACE_W - PAD, y, 18, INK.hi, { mono: true, align: 'right' });
    segments(ctx, PAD, y + 12, FACE_W - PAD * 2, 12, frac, 28, hue, warn);
    y += 58;
  };
  meter('MEM', d.memUsed / d.memTotal, `${fmt.bytes(d.memUsed)} / ${fmt.bytes(d.memTotal)}`, d.memUsed / d.memTotal > 0.94);
  if (d.disk) meter('DISK', d.disk.used / d.disk.total, `${fmt.bytes(d.disk.used)} / ${fmt.bytes(d.disk.total)}`);
  const c = fc.client;
  if (c) {
    const bits = [c.fps ? `${Math.round(c.fps)} FPS` : null, c.battery != null ? `BAT ${Math.round(c.battery * 100)}%` : null, c.net ? `NET ${c.net}` : null].filter(Boolean);
    text(ctx, bits.join('  ·  '), PAD, y + 4, 16, INK.lo, { mono: true, max: FACE_W - PAD * 2 });
  }
};

const ai: Body<AIData> = (ctx, d, hue, fc) => {
  text(ctx, d.online ? 'ONLINE' : 'LOCAL', PAD, 262, 88, INK.hi, { weight: 300, tracking: -1 });
  text(ctx, d.online ? d.model : 'command engine', PAD, 306, 22, INK.mid, { mono: true });
  const status = (fc.client?.aiStatus ?? 'idle').toUpperCase();
  row(ctx, 380, 'Status', status, hueCss(hue, 90, 75));
  row(ctx, 424, 'Turns', String(fc.client?.aiTurns ?? 0));
  row(ctx, 468, 'Voice', d.online ? 'studio' : 'local');
  wrap(ctx, 'Say “Divina”, draw a circle in the air, or press Space to talk.', PAD, 548, 22, INK.lo, FACE_W - PAD * 2, 30, 3);
};

const notes: Body<NotesData> = (ctx, d, hue) => {
  const open = d.notes.filter((n) => !n.done);
  big(ctx, String(open.length), 'TO DO');
  let y = 340;
  for (const n of [...open, ...d.notes.filter((x) => x.done)].slice(0, 7)) {
    // a box, ticked or not
    ctx.strokeStyle = n.done ? INK.lo : hueCss(hue, 90, 72);
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, y - 18, 20, 20);
    if (n.done) text(ctx, '✓', PAD + 3, y, 20, INK.lo);
    text(ctx, n.text, PAD + 36, y, 22, n.done ? INK.lo : INK.hi, { max: FACE_W - PAD * 2 - 40 });
    y += 48;
  }
  if (!d.notes.length) wrap(ctx, 'Say “add milk to my list”, or tap to write a note.', PAD, y, 22, INK.mid, FACE_W - PAD * 2, 30, 3);
};

const agents: Body<AgentsData> = (ctx, d, hue, fc) => {
  const active = fc.client?.agent;
  text(ctx, active ?? 'Divina', PAD, 262, 64, INK.hi, { weight: 300, max: FACE_W - PAD * 2 });
  text(ctx, active ? 'TALKING NOW · say “back to Divina”' : 'TALKING NOW', PAD, 300, 16, INK.lo, { mono: true, tracking: 2, max: FACE_W - PAD * 2 });
  let y = 372;
  for (const a of d.agents.slice(0, 6)) {
    const on = a.name === active;
    dot(ctx, PAD + 6, y - 8, 6, on ? hueCss(hue, 95, 70) : INK.faint);
    text(ctx, a.name, PAD + 24, y, 24, on ? INK.hi : INK.mid, { max: FACE_W - PAD * 2 - 30 });
    text(ctx, a.provider ? a.provider.toUpperCase() : '', FACE_W - PAD, y, 14, INK.lo, { mono: true, align: 'right', tracking: 2 });
    y += 46;
  }
  if (!d.agents.length) wrap(ctx, 'Make your own assistants: a coach, a chef, a tutor… Tap to create one.', PAD, y, 22, INK.mid, FACE_W - PAD * 2, 30, 3);
};

const BODY: { [K in ModuleId]: Body<never> } = {
  notes: notes as Body<never>,
  agents: agents as Body<never>,
  stocks: stocks as Body<never>,
  crypto: crypto as Body<never>,
  email: email as Body<never>,
  weather: weather as Body<never>,
  news: news as Body<never>,
  sports: sports as Body<never>,
  calendar: calendar as Body<never>,
  instagram: instagram as Body<never>,
  projects: projects as Body<never>,
  music: music as Body<never>,
  system: system as Body<never>,
  ai: ai as Body<never>,
};
