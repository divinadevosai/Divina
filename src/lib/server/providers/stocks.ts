import 'server-only';
import { UNOFFICIAL_OFF, unofficialFeedsOn } from '../unofficial';
import { readFile } from 'node:fs/promises';
import { dataFile } from '@/lib/server/paths';
import { cached, fetchJson, describeError, type ProviderResult } from '../http';
import type { Holding, StocksData } from '@/modules/types';
import { askDataServer, useDataServer } from '../dataServer';

interface PortfolioFile {
  holdings: { symbol: string; shares: number; cost: number; sector?: string; name?: string }[];
}

interface YahooChart {
  chart: {
    result?: {
      meta: { regularMarketPrice: number; chartPreviousClose: number; previousClose?: number; currency: string; longName?: string; shortName?: string; marketState?: string };
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
    error?: { description: string } | null;
  };
}

async function loadPortfolio(): Promise<{ file: PortfolioFile; example: boolean }> {
  try {
    return { file: JSON.parse(await readFile(dataFile('portfolio.json'), 'utf8')), example: false };
  } catch {
    return { file: JSON.parse(await readFile(dataFile('portfolio.example.json'), 'utf8')), example: true };
  }
}

type Q = { price: number; prevClose: number; currency: string; name: string; history: number[]; marketState: string };

const lastQuotes = new Map<string, Record<string, Q>>();

/** Paid apps: licensed prices from Divina's data server, all symbols in one request. */
async function quotesFromDataServer(symbols: string[]): Promise<Record<string, Q>> {
  const list = [...new Set(symbols.map((s) => s.toUpperCase()))].sort();
  // every 2 minutes while a market is open, every 10 when they're all closed
  const id = `ds:q:${list.join(',')}`;
  const last = lastQuotes.get(id);
  const open = !last || Object.values(last).some((q) => q.marketState !== 'CLOSED');
  const r = await cached(`${id}:${open ? 'open' : 'closed'}`, open ? 120_000 : 600_000, () => askDataServer<{ quotes: Record<string, Q> }>(`quotes?symbols=${encodeURIComponent(list.join(','))}`));
  lastQuotes.set(id, r.quotes ?? {});
  return r.quotes ?? {};
}

async function quote(symbol: string): Promise<Q> {
  if (useDataServer()) {
    const q = (await quotesFromDataServer([symbol]))[symbol.toUpperCase()];
    if (!q) throw new Error(`no price for ${symbol}`);
    return q;
  }
  return cached(`q:${symbol}`, 55_000, async () => {
    const r = await fetchJson<YahooChart>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
    );
    const res = r.chart.result?.[0];
    if (!res) throw new Error(r.chart.error?.description ?? `no quote for ${symbol}`);
    const closes = (res.indicators.quote[0]?.close ?? []).filter((c): c is number => typeof c === 'number');
    return {
      price: res.meta.regularMarketPrice,
      prevClose: closes.length > 1 ? closes[closes.length - 2] : (res.meta.previousClose ?? res.meta.chartPreviousClose),
      currency: res.meta.currency,
      name: res.meta.shortName ?? res.meta.longName ?? symbol,
      history: closes,
      marketState: res.meta.marketState ?? 'UNKNOWN',
    };
  });
}

export async function getStocks(): Promise<ProviderResult<StocksData>> {
  const licensed = useDataServer();
  if (!licensed && !unofficialFeedsOn()) return { status: 'unconfigured', message: UNOFFICIAL_OFF('Live stock prices (Yahoo)') };
  const { file, example } = await loadPortfolio();
  if (!file.holdings?.length) return { status: 'unconfigured', message: 'Add holdings to data/portfolio.json.' };
  // paid apps ask for every symbol at once (only the symbols go: never how many shares you hold)
  let batch: Record<string, Q> | null = null;
  if (licensed) {
    try {
      batch = await quotesFromDataServer(file.holdings.map((h) => h.symbol));
    } catch (e) {
      return { status: 'error', message: `Stock prices aren’t available right now: ${describeError(e)}` };
    }
  }
  const settled = await Promise.allSettled(
    file.holdings.map((h) => (batch ? (batch[h.symbol.toUpperCase()] ? Promise.resolve(batch[h.symbol.toUpperCase()]) : Promise.reject(new Error(`no price for ${h.symbol}`))) : quote(h.symbol))),
  );
  const failures = settled.filter((s) => s.status === 'rejected');
  if (failures.length === settled.length) {
    return { status: 'error', message: `Quotes unavailable: ${describeError((failures[0] as PromiseRejectedResult).reason)}` };
  }
  const holdings: Holding[] = [];
  let marketState = 'UNKNOWN';
  file.holdings.forEach((h, i) => {
    const s = settled[i];
    if (s.status !== 'fulfilled') return;
    const q = s.value;
    marketState = q.marketState;
    const value = q.price * h.shares;
    const costBasis = h.cost * h.shares;
    holdings.push({
      symbol: h.symbol,
      name: h.name ?? q.name,
      shares: h.shares,
      cost: h.cost,
      sector: h.sector ?? 'Other',
      price: q.price,
      prevClose: q.prevClose,
      currency: q.currency,
      history: q.history,
      changePct: ((q.price - q.prevClose) / q.prevClose) * 100,
      value,
      pnl: value - costBasis,
      pnlPct: costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : 0,
    });
  });
  const totalValue = holdings.reduce((a, h) => a + h.value, 0);
  const totalCost = holdings.reduce((a, h) => a + h.cost * h.shares, 0);
  const prevValue = holdings.reduce((a, h) => a + h.prevClose * h.shares, 0);
  const sectorMap = new Map<string, number>();
  for (const h of holdings) sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.value);
  const len = Math.min(...holdings.map((h) => h.history.length));
  const history = Array.from({ length: len }, (_, i) =>
    holdings.reduce((a, h) => a + h.history[h.history.length - len + i] * h.shares, 0),
  );
  return {
    status: 'ok',
    data: {
      example,
      holdings,
      totalValue,
      totalCost,
      dayChange: totalValue - prevValue,
      dayChangePct: prevValue ? ((totalValue - prevValue) / prevValue) * 100 : 0,
      pnl: totalValue - totalCost,
      pnlPct: totalCost ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      allocation: holdings.map((h) => ({ symbol: h.symbol, weight: h.value / totalValue })).sort((a, b) => b.weight - a.weight),
      sectors: [...sectorMap].map(([sector, v]) => ({ sector, weight: v / totalValue })).sort((a, b) => b.weight - a.weight),
      history,
      marketState,
      source: `${licensed ? 'Twelve Data' : 'Yahoo Finance'}${example ? ' · example holdings (data/portfolio.json)' : ''}`,
      fetchedAt: Date.now(),
    },
  };
}

/** Single-symbol lookup for questions like "how is Nvidia today". */
export async function getQuote(symbol: string) {
  if (!useDataServer() && !unofficialFeedsOn()) throw new Error(UNOFFICIAL_OFF('Stock prices (Yahoo)'));
  return quote(symbol.toUpperCase());
}
