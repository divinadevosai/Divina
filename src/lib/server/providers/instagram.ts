import 'server-only';
import { redactSecrets, setting } from '@/lib/server/settings';
import { cached, fetchJson, HttpError, type ProviderResult } from '../http';
import { backAccumulate, destinationsFrom, detectIgApi } from '@/lib/instagram';
import type { InstagramData, InstagramMedia } from '@/modules/types';

interface IgProfile {
  username: string;
  name?: string;
  followers_count: number;
  follows_count?: number;
  media_count: number;
}
interface IgMediaRaw {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  permalink: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}
interface IgInsights {
  data: { name: string; values?: { value: number; end_time: string }[]; total_value?: { value: number } }[];
}

export async function getInstagram(): Promise<ProviderResult<InstagramData>> {
  const token = setting('INSTAGRAM_TOKEN');
  if (!token) {
    return {
      status: 'unconfigured',
      message: 'Add your Instagram token in ⚙ Settings → Accounts (an IGAA… Instagram-login token, or an EAA… Facebook token plus your business account ID).',
    };
  }
  const api = detectIgApi(token, setting('IG_BUSINESS_ACCOUNT_ID'));
  if (api.kind === 'invalid') return { status: 'unconfigured', message: api.reason };
  const v = setting('INSTAGRAM_API_VERSION') ?? 'v23.0';
  const root = `${api.base}/${v}/${api.account}`;
  const auth = `access_token=${encodeURIComponent(token)}`;

  try {
    const data = await cached('ig', 10 * 60_000, async () => {
      const profile = await fetchJson<IgProfile>(`${root}?fields=username,name,followers_count,follows_count,media_count&${auth}`);
      const media = await fetchJson<{ data: IgMediaRaw[] }>(
        `${root}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=30&${auth}`,
      );
      const until = Math.floor(Date.now() / 1000);
      const since = until - 29 * 86400;
      // follower_count: DAILY DELTAS. reach: daily values.
      const [followerIns, reachIns] = await Promise.all([
        fetchJson<IgInsights>(`${root}/insights?metric=follower_count&period=day&since=${since}&until=${until}&${auth}`).catch(() => ({ data: [] }) as IgInsights),
        fetchJson<IgInsights>(`${root}/insights?metric=reach&period=day&since=${since}&until=${until}&${auth}`).catch(() => ({ data: [] }) as IgInsights),
      ]);
      const deltas = (followerIns.data[0]?.values ?? []).map((x) => ({ date: x.end_time.slice(0, 10), value: x.value }));
      const followerHistory = backAccumulate(profile.followers_count, deltas);
      const reach = (reachIns.data[0]?.values ?? []).map((x) => ({ date: x.end_time.slice(0, 10), value: x.value }));
      const toMedia = (m: IgMediaRaw): InstagramMedia => {
        const likes = m.like_count ?? 0;
        const comments = m.comments_count ?? 0;
        return {
          id: m.id,
          caption: (m.caption ?? '').slice(0, 140),
          type: m.media_type,
          product: m.media_product_type ?? 'FEED',
          permalink: m.permalink,
          thumbnail: m.thumbnail_url ?? (m.media_type === 'IMAGE' ? m.media_url : undefined),
          at: m.timestamp,
          likes,
          comments,
          engagement: profile.followers_count ? (likes + comments) / profile.followers_count : 0,
        };
      };
      const all = media.data.map(toMedia);
      const engagementRate = all.length ? all.reduce((a, m) => a + m.engagement, 0) / all.length : 0;
      const weekAgo = followerHistory.length > 7 ? followerHistory[followerHistory.length - 8].total : followerHistory[0]?.total ?? profile.followers_count;
      const out: InstagramData = {
        api: api.kind,
        username: profile.username,
        name: profile.name,
        followers: profile.followers_count,
        follows: profile.follows_count,
        mediaCount: profile.media_count,
        followerHistory,
        reach,
        reachTotal: reach.reduce((a, r) => a + r.value, 0),
        engagementRate,
        growth7d: profile.followers_count - weekAgo,
        media: all,
        reels: all.filter((m) => m.product === 'REELS'),
        top: [...all].sort((a, b) => b.likes + b.comments - (a.likes + a.comments)).slice(0, 5),
        destinations: destinationsFrom(profile.username, all[0]?.permalink),
        source: api.kind === 'instagram-login' ? 'graph.instagram.com' : 'graph.facebook.com',
        fetchedAt: Date.now(),
      };
      return out;
    });
    return { status: 'ok', data };
  } catch (err) {
    if (err instanceof HttpError) {
      const code = /"code":\s*(\d+)/.exec(err.body ?? '')?.[1];
      if (code === '190') return { status: 'error', message: 'Instagram rejected the token (expired or revoked). Generate a new long-lived token.' };
      if (code === '10' || code === '200') return { status: 'error', message: 'Token lacks permission. Needs instagram_business_basic + instagram_business_manage_insights.' };
      return { status: 'error', message: redactSecrets(`${err.message}: ${(err.body ?? '').slice(0, 160)}`) };
    }
    throw err;
  }
}
