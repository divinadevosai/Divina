import { NextResponse, type NextRequest } from 'next/server';
import { describeError, type ProviderResult } from '@/lib/server/http';
import { getWeather } from '@/lib/server/providers/weather';
import { getStocks } from '@/lib/server/providers/stocks';
import { getNews } from '@/lib/server/providers/news';
import { getSports } from '@/lib/server/providers/sports';
import { getCalendar } from '@/lib/server/providers/calendar';
import { getInstagram } from '@/lib/server/providers/instagram';
import { getProjects } from '@/lib/server/providers/projects';
import { getSystem } from '@/lib/server/providers/system';
import { getMusic } from '@/lib/server/providers/music';
import { getCrypto } from '@/lib/server/providers/crypto';
import { getEmail } from '@/lib/server/providers/email';
import { ai } from '@/lib/server/ai';
import { loadAgents, loadNotes } from '@/lib/server/personal';
import { isModuleId, type ModuleId } from '@/modules/ids';

export const dynamic = 'force-dynamic';

const PROVIDERS: Record<ModuleId, (q: URLSearchParams) => Promise<ProviderResult<unknown>>> = {
  weather: getWeather,
  stocks: getStocks,
  crypto: getCrypto,
  email: getEmail,
  news: getNews,
  sports: getSports,
  calendar: getCalendar,
  instagram: getInstagram,
  projects: getProjects,
  system: getSystem,
  music: getMusic,
  notes: async () => ({ status: 'ok', data: { notes: loadNotes(), source: 'this computer (encrypted)', fetchedAt: Date.now() } }),
  agents: async () => ({ status: 'ok', data: { agents: loadAgents(), source: 'this computer (encrypted)', fetchedAt: Date.now() } }),
  ai: async () => ({
    status: 'ok',
    data: {
      online: ai.configured(),
      model: ai.label() ?? 'none',
      ttsModel: ai.voiceModel() ?? 'browser voice',
      turns: 0,
      source: ai.configured() ? 'your own API key' : 'local command engine (add an AI key in Settings)',
      fetchedAt: Date.now(),
    },
  }),
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isModuleId(id)) return NextResponse.json({ status: 'error', message: 'unknown module' }, { status: 404 });
  try {
    const result = await PROVIDERS[id](req.nextUrl.searchParams);
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: `${id} source unavailable: ${describeError(err)}` });
  }
}
