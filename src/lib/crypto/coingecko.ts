/**
 * Crypto prices from CoinGecko, shared by the app's server and the browser
 * edition. Each person uses their own free CoinGecko "Demo" key — their own
 * personal use under CoinGecko's terms — and the card credits CoinGecko, as
 * those terms require ("Data provided by CoinGecko", linked).
 */
import type { Coin, CryptoData } from '@/modules/types';

export const DEFAULT_COINS = 'bitcoin, ethereum, solana';
export const DEFAULT_CURRENCY = 'usd';
export const COINGECKO_CREDIT = 'Data provided by CoinGecko';

export const coinIds = (list: string | undefined) =>
  (list || DEFAULT_COINS)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]+$/.test(s))
    .slice(0, 10);

/** The markets request. The key goes in the query so a browser can make it without a preflight. */
export function marketsUrl(ids: string[], currency: string, key: string): string {
  const q = new URLSearchParams({ vs_currency: currency, ids: ids.join(','), sparkline: 'true', price_change_percentage: '24h', x_cg_demo_api_key: key });
  return `https://api.coingecko.com/api/v3/coins/markets?${q}`;
}

interface Market {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  price_change_percentage_24h: number | null;
  sparkline_in_7d?: { price?: number[] };
}

export function toCryptoData(rows: Market[], ids: string[], currency: string): CryptoData {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const coins: Coin[] = ids
    .map((id) => byId.get(id))
    .filter((r): r is Market => !!r && typeof r.current_price === 'number')
    .map((r) => ({
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      price: r.current_price as number,
      change24h: r.price_change_percentage_24h ?? 0,
      marketCap: r.market_cap ?? 0,
      // hourly for a week; every 4th point is plenty for a card
      spark: (r.sparkline_in_7d?.price ?? []).filter((_, i) => i % 4 === 0),
    }));
  return { currency, coins, source: COINGECKO_CREDIT, fetchedAt: Date.now() };
}

export const CRYPTO_UNCONFIGURED =
  'Add your free CoinGecko API key in ⚙ Settings → Crypto (coingecko.com/en/api → create a free Demo account → copy your key). It’s your own personal-use key.';

export function unknownCoins(ids: string[], data: CryptoData): string[] {
  const got = new Set(data.coins.map((c) => c.id));
  return ids.filter((id) => !got.has(id));
}
