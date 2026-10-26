import { NextResponse, type NextRequest } from 'next/server';
import { getQuote } from '@/lib/server/providers/stocks';
import { describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,12}$/.test(symbol)) return NextResponse.json({ error: 'bad symbol' }, { status: 400 });
  try {
    const q = await getQuote(symbol);
    return NextResponse.json({ symbol, ...q, changePct: ((q.price - q.prevClose) / q.prevClose) * 100 });
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  }
}
