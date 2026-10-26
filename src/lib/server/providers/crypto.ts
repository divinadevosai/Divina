import 'server-only';
import { setting } from '@/lib/server/settings';
import { cached, fetchJson, type ProviderResult } from '../http';
import type { CryptoData } from '@/modules/types';
import { CRYPTO_UNCONFIGURED, DEFAULT_CURRENCY, coinIds, marketsUrl, toCryptoData, unknownCoins } from '@/lib/crypto/coingecko';

export async function getCrypto(): Promise<ProviderResult<CryptoData>> {
  const key = setting('DIVINA_COINGECKO_KEY');
  if (!key) return { status: 'unconfigured', message: CRYPTO_UNCONFIGURED };
  const ids = coinIds(setting('DIVINA_CRYPTO'));
  const currency = setting('DIVINA_CRYPTO_CURRENCY') ?? DEFAULT_CURRENCY;
  // the free plan allows 10,000 calls a month: five minutes between refreshes stays well inside it
  const data = await cached(`crypto:${ids.join(',')}:${currency}`, 5 * 60_000, async () => toCryptoData(await fetchJson(marketsUrl(ids, currency, key)), ids, currency));
  if (!data.coins.length) return { status: 'unconfigured', message: `CoinGecko didn’t recognise ${ids.join(', ')}. Use CoinGecko’s coin names, like bitcoin, ethereum, solana.` };
  const missing = unknownCoins(ids, data);
  return { status: 'ok', data: missing.length ? { ...data, source: `${data.source} · not found: ${missing.join(', ')}` } : data };
}
