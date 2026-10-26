/**
 * Minimal iCalendar reader: VEVENT with DTSTART/DTEND/SUMMARY/LOCATION and
 * the recurrences people actually use (DAILY / WEEKLY with INTERVAL, COUNT,
 * UNTIL, BYDAY; EXDATE). Pure — no I/O — so it is unit-tested.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function parseDate(value: string, params: string): { d: Date; allDay: boolean } {
  const v = value.trim();
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(v)) {
    return { d: new Date(Number(v.slice(0, 4)), Number(v.slice(4, 6)) - 1, Number(v.slice(6, 8))), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return { d: new Date(NaN), allDay: false };
  const [, y, mo, da, h, mi, s, z] = m;
  const args = [Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s)] as const;
  // Floating and TZID times are read as local wall time on this machine.
  return { d: z ? new Date(Date.UTC(...args)) : new Date(...args), allDay: false };
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function parseIcs(text: string, from: Date, to: Date): IcsEvent[] {
  const out: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: string }[]> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      expand(cur, from, to, out);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const head = line.slice(0, idx);
      const [name, ...params] = head.split(';');
      (cur[name] ??= []).push({ value: line.slice(idx + 1), params: params.join(';') });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function unescape(s: string) {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

function expand(ev: Record<string, { value: string; params: string }[]>, from: Date, to: Date, out: IcsEvent[]) {
  const ds = ev.DTSTART?.[0];
  if (!ds) return;
  const { d: start, allDay } = parseDate(ds.value, ds.params);
  if (Number.isNaN(start.getTime())) return;
  const de = ev.DTEND?.[0];
  const end = de ? parseDate(de.value, de.params).d : new Date(start.getTime() + (allDay ? 86400000 : 3600000));
  const dur = Math.max(0, end.getTime() - start.getTime());
  const base = {
    uid: ev.UID?.[0]?.value ?? `${start.getTime()}`,
    title: unescape(ev.SUMMARY?.[0]?.value ?? '(untitled)'),
    allDay,
    location: ev.LOCATION?.[0] ? unescape(ev.LOCATION[0].value) : undefined,
  };
  const exdates = new Set((ev.EXDATE ?? []).flatMap((x) => x.value.split(',').map((v) => parseDate(v, x.params).d.getTime())));
  const push = (s: Date) => {
    if (exdates.has(s.getTime())) return;
    const e = new Date(s.getTime() + dur);
    if (e >= from && s <= to) out.push({ ...base, uid: `${base.uid}@${s.getTime()}`, start: s, end: e });
  };
  const rr = ev.RRULE?.[0]?.value;
  if (!rr) return push(start);
  const rule = Object.fromEntries(rr.split(';').map((kv) => kv.split('='))) as Record<string, string>;
  const freq = rule.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return push(start); // other rules: first instance only
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? parseDate(rule.UNTIL, '').d : to;
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))) : [start.getDay()];
  let n = 0;
  const cursor = new Date(start);
  for (let guard = 0; guard < 2000 && n < count; guard++) {
    if (cursor > until || cursor > to) break;
    if (freq === 'DAILY') {
      push(new Date(cursor));
      n++;
      cursor.setDate(cursor.getDate() + interval);
    } else {
      // walk one week at a time, emitting each BYDAY in order
      const weekStart = new Date(cursor);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      for (const wd of [...byday].sort()) {
        const inst = new Date(weekStart);
        inst.setDate(weekStart.getDate() + wd);
        inst.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
        if (inst < start || inst > until || n >= count) continue;
        push(inst);
        n++;
      }
      cursor.setDate(weekStart.getDate() + 7 * interval);
      cursor.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
    }
  }
}
