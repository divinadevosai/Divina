import 'server-only';
import { setting } from '@/lib/server/settings';
import { cached, fetchJson, type ProviderResult } from '../http';
import type { NewsArticle, NewsData } from '@/modules/types';
import { ai } from '../ai';
import { AI_NAMES } from '@/lib/ai/providers';
import { allow } from '../ratelimit';

interface HNHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  num_comments: number;
  created_at_i: number;
}

export async function getNews(q: URLSearchParams): Promise<ProviderResult<NewsData>> {
  const topic = (q.get('topic') ?? setting('DIVINA_NEWS_TOPIC') ?? 'AI').slice(0, 60);
  const data = await cached(`news:${topic}`, 10 * 60_000, async () => {
    const since = Math.floor(Date.now() / 1000) - 3 * 86400;
    const r = await fetchJson<{ hits: HNHit[] }>(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&numericFilters=created_at_i>${since},points>15&hitsPerPage=24`,
    );
    const articles: NewsArticle[] = r.hits
      .filter((h) => h.title)
      .sort((a, b) => b.points - a.points)
      .slice(0, 12)
      .map((h) => {
        const url = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
        return {
          id: h.objectID,
          title: h.title,
          url,
          site: new URL(url).hostname.replace(/^www\./, ''),
          points: h.points,
          comments: h.num_comments,
          at: h.created_at_i * 1000,
        };
      });
    let digest: string | undefined;
    if (ai.configured() && articles.length && allow('summary').ok) {
      try {
        digest = await ai.text(
          `Summarise today's ${topic} news in three short spoken sentences, most important first. Headlines:\n` +
            articles.map((a, i) => `${i + 1}. ${a.title} (${a.site}, ${a.points} points)`).join('\n'),
        );
      } catch {
        digest = undefined;
      }
    }
    const out: NewsData = { topic, articles, digest, source: `Hacker News (Algolia)${digest ? ` · summary: ${AI_NAMES[ai.provider() ?? 'gemini']}` : ''}`, fetchedAt: Date.now() };
    return out;
  });
  return { status: 'ok', data };
}
