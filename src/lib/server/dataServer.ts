import 'server-only';
/**
 * Dormant: only a build made for sale (DIVINA_REQUIRE_LICENCE=1) asks a
 * licensed data server for sports and stock prices, proving it's a bought copy
 * with its licence. The normal free build never does: it uses the free public
 * feeds in providers/sports.ts and providers/stocks.ts.
 */
import { HttpError, fetchJson } from './http';
import { licenceConfig, licenceCredentials } from './licence';

export const dataUrl = () => (process.env.DIVINA_DATA_URL || 'https://divinaos.site/api/v1').replace(/\/$/, '');

/** Paid builds get their sports and stocks from the data server. */
export const useDataServer = () => licenceConfig().required;

export async function askDataServer<T>(path: string): Promise<T> {
  const c = licenceCredentials();
  if (!c) throw new HttpError(401, 'Activate Divina (Settings → Licence) to get live data.');
  try {
    return await fetchJson<T>(`${dataUrl()}/${path}`, { headers: { authorization: `Licence ${c.key}`, 'x-divina-instance': c.instanceId }, timeoutMs: 15_000 });
  } catch (e) {
    if (e instanceof HttpError) {
      let message = e.message;
      try {
        message = (JSON.parse(e.body ?? '') as { message?: string }).message ?? message;
      } catch {
        /* not JSON */
      }
      throw new HttpError(e.status, message, e.body);
    }
    throw e;
  }
}
