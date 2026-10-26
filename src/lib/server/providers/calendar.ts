import 'server-only';
import { setting } from '@/lib/server/settings';
import { readFile } from 'node:fs/promises';
import { dataFile } from '@/lib/server/paths';
import { cached, fetchText, type ProviderResult } from '../http';
import { parseIcs } from '@/lib/ics';
import type { CalendarData } from '@/modules/types';

export async function getCalendar(): Promise<ProviderResult<CalendarData>> {
  const url = setting('DIVINA_CALENDAR_ICS');
  let text: string | null = null;
  let source = '';
  if (url) {
    if (!/^https?:\/\//.test(url) && !url.startsWith('webcal://')) return { status: 'unconfigured', message: 'DIVINA_CALENDAR_ICS must be an http(s) or webcal URL.' };
    text = await cached(`ics:${url}`, 5 * 60_000, () => fetchText(url.replace(/^webcal:/, 'https:')));
    source = 'iCal feed';
  } else {
    try {
      text = await readFile(dataFile('calendar.ics'), 'utf8');
      source = 'data/calendar.ics';
    } catch {
      return {
        status: 'unconfigured',
        message: 'Connect a calendar: set DIVINA_CALENDAR_ICS to your calendar’s secret iCal address (Google: Settings → Integrate calendar), or drop a file at data/calendar.ics.',
      };
    }
  }
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 8 * 86400000);
  const name = /X-WR-CALNAME:(.*)/.exec(text)?.[1]?.trim() ?? 'Calendar';
  const events = parseIcs(text, from, to).slice(0, 40);
  return {
    status: 'ok',
    data: {
      calendarName: name,
      events: events.map((e) => ({ id: e.uid, title: e.title, start: e.start.toISOString(), end: e.end.toISOString(), allDay: e.allDay, location: e.location })),
      source,
      fetchedAt: Date.now(),
    },
  };
}
