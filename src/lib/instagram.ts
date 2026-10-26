/**
 * Instagram Graph helpers — pure, unit-tested.
 */

export type IgApi =
  | { kind: 'instagram-login'; base: 'https://graph.instagram.com'; account: 'me' }
  | { kind: 'facebook-login'; base: 'https://graph.facebook.com'; account: string };

/**
 * The token's prefix says which login flow minted it, and therefore which
 * host serves it and how the account is addressed.
 *   IGAA… → Instagram Login → graph.instagram.com, addressed as "me"
 *   EAA…  → Facebook Login  → graph.facebook.com, explicit business account id
 */
export function detectIgApi(token: string, businessAccountId?: string): IgApi | { kind: 'invalid'; reason: string } {
  const t = token.trim();
  if (t.startsWith('IGAA')) return { kind: 'instagram-login', base: 'https://graph.instagram.com', account: 'me' };
  if (t.startsWith('EAA')) {
    if (!businessAccountId) return { kind: 'invalid', reason: 'This is a Facebook-login token (EAA…). Also set IG_BUSINESS_ACCOUNT_ID to the Instagram business account id.' };
    if (!/^\d+$/.test(businessAccountId)) return { kind: 'invalid', reason: 'IG_BUSINESS_ACCOUNT_ID must be numeric.' };
    return { kind: 'facebook-login', base: 'https://graph.facebook.com', account: businessAccountId };
  }
  return { kind: 'invalid', reason: 'INSTAGRAM_TOKEN should start with IGAA (Instagram Login) or EAA (Facebook Login).' };
}

/**
 * The follower_count insight returns DAILY DELTAS, not running totals.
 * Reconstruct the true curve by walking back from today's known total:
 *   total[last] = current;  total[i-1] = total[i] - delta[i]
 */
export function backAccumulate(current: number, deltas: { date: string; value: number }[]): { date: string; total: number }[] {
  const sorted = [...deltas].sort((a, b) => a.date.localeCompare(b.date));
  const out: { date: string; total: number }[] = new Array(sorted.length);
  let total = current;
  for (let i = sorted.length - 1; i >= 0; i--) {
    out[i] = { date: sorted[i].date, total };
    total -= sorted[i].value;
  }
  return out;
}

/** Personal destinations come FROM the feed — never hardcoded. */
export function destinationsFrom(username: string, latestPermalink?: string) {
  const u = encodeURIComponent(username);
  return {
    profile: `https://www.instagram.com/${u}/`,
    reels: `https://www.instagram.com/${u}/reels/`,
    latest: latestPermalink,
  };
}
