/**
 * Launcher ranking: prefix-first → initials → word boundary → substring.
 * Shared by the ⌘K palette and the app resolver so "open chrome" by voice
 * and typing "chr" rank identically.
 */

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\.app$/, '').trim();
}

function words(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/** 0 = no match. Higher is better. */
export function rankMatch(query: string, candidate: string): number {
  const q = norm(query);
  const c = norm(candidate);
  if (!q) return 1;
  if (q.length > c.length) return 0;
  if (c === q) return 1000;
  if (c.startsWith(q)) return 800 - (c.length - q.length);
  const w = words(candidate);
  const initials = w.map((x) => x[0]).join('');
  const qCompact = q.replace(/[^a-z0-9]/g, '');
  if (qCompact.length >= 2 && initials.startsWith(qCompact)) return 600 - (initials.length - qCompact.length);
  if (w.some((x) => x.startsWith(q))) return 400 - w.findIndex((x) => x.startsWith(q));
  const i = c.indexOf(q);
  if (i >= 0) return 200 - i;
  return 0;
}

export function rankAll<T>(query: string, items: T[], text: (t: T) => string[]): { item: T; score: number }[] {
  return items
    .map((item) => ({ item, score: Math.max(0, ...text(item).map((s) => rankMatch(query, s))) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}
