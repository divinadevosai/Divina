/** Data contracts shared by server providers, card faces and panels. */

export interface Provenance {
  source: string;
  fetchedAt: number;
}

export interface WeatherData extends Provenance {
  place: string;
  tempC: number;
  feelsC: number;
  humidity: number;
  windKph: number;
  code: number;
  condition: 'clear' | 'clouds' | 'fog' | 'rain' | 'snow' | 'storm';
  label: string;
  isDay: boolean;
  /** precip: chance of rain in % where the forecast gives one; mm: expected amount */
  hourly: { t: string; tempC: number; precip?: number; mm?: number }[];
  daily: { date: string; maxC: number; minC: number; code: number; label: string }[];
}

export interface Holding {
  symbol: string;
  name: string;
  shares: number;
  cost: number; // average cost per share
  sector: string;
  price: number;
  prevClose: number;
  currency: string;
  history: number[]; // daily closes, oldest first
  changePct: number;
  value: number;
  pnl: number;
  pnlPct: number;
}

export interface StocksData extends Provenance {
  example: boolean;
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  dayChange: number;
  dayChangePct: number;
  pnl: number;
  pnlPct: number;
  allocation: { symbol: string; weight: number }[];
  sectors: { sector: string; weight: number }[];
  history: number[]; // portfolio value history
  marketState: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  site: string;
  points: number;
  comments: number;
  at: number;
  summary?: string;
}
export interface NewsData extends Provenance {
  topic: string;
  articles: NewsArticle[];
  digest?: string;
}

export interface SportsEvent {
  id: string;
  name: string;
  home: { name: string; abbr: string; score: string };
  away: { name: string; abbr: string; score: string };
  state: 'pre' | 'in' | 'post';
  detail: string;
  date: string;
  /** short label of the league this game belongs to, e.g. "EPL" */
  league?: string;
}
export interface StandingRow {
  rank: number;
  team: string;
  abbr: string;
  played: number;
  points: number;
  goalDiff: number;
}
export interface LeagueBoard {
  id: string; // ESPN path, e.g. soccer/eng.1
  name: string;
  short: string;
  events: SportsEvent[];
  standings: StandingRow[];
}

export interface SportsData extends Provenance {
  /** display name: the league, or "3 leagues" */
  league: string;
  /** every followed league's games, live first, then soonest, then latest results */
  events: SportsEvent[];
  /** standings of the first league (kept for single-league views) */
  standings: StandingRow[];
  /** one board per followed league; absent in older data */
  leagues?: LeagueBoard[];
  /** leagues that could not be loaded this time, with the reason */
  failed?: { id: string; reason: string }[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string;
  allDay: boolean;
  location?: string;
}
export interface CalendarData extends Provenance {
  events: CalendarEvent[];
  calendarName: string;
}

export interface InstagramMedia {
  id: string;
  caption: string;
  type: string;
  product: string; // FEED | REELS | STORY
  permalink: string;
  thumbnail?: string;
  at: string;
  likes: number;
  comments: number;
  engagement: number; // (likes + comments) / followers
}
export interface InstagramData extends Provenance {
  api: 'instagram-login' | 'facebook-login';
  username: string;
  name?: string;
  followers: number;
  follows?: number;
  mediaCount: number;
  followerHistory: { date: string; total: number }[];
  reach: { date: string; value: number }[];
  reachTotal: number;
  engagementRate: number;
  growth7d: number;
  media: InstagramMedia[];
  reels: InstagramMedia[];
  top: InstagramMedia[];
  destinations: { profile: string; reels: string; latest?: string };
}

export interface ProjectMedia {
  kind: 'image' | 'video';
  src: string;
  caption?: string;
}
export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: string;
  github?: string;
  links?: { label: string; url: string }[];
  media: ProjectMedia[];
  prompts: { at: string; text: string }[];
  repo?: { stars: number; forks: number; issues: number; pushedAt: string; language?: string };
}
export interface ProjectsData extends Provenance {
  projects: Project[];
}

export interface MusicData extends Provenance {
  player: string;
  state: 'playing' | 'paused' | 'stopped';
  track?: string;
  artist?: string;
  album?: string;
  positionS?: number;
  durationS?: number;
}

export interface SystemData extends Provenance {
  host: string;
  platform: string;
  cpuModel: string;
  cores: number;
  cpuLoad: number; // 0..1
  loadHistory: number[];
  memUsed: number;
  memTotal: number;
  uptimeS: number;
  disk?: { used: number; total: number };
  node: string;
  bridge: { enabled: boolean; platformSupported: boolean };
}

export interface AIData extends Provenance {
  online: boolean;
  model: string;
  ttsModel: string;
  turns: number;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  at: number;
  unread: boolean;
}

export interface EmailData extends Provenance {
  address: string;
  unread: number;
  total: number;
  messages: EmailMessage[];
  /** opens the mailbox in the browser, when the provider has a web inbox */
  webUrl?: string;
}

export interface Coin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  /** last 7 days of prices, oldest first */
  spark: number[];
}

export interface CryptoData extends Provenance {
  currency: string;
  coins: Coin[];
}

export interface NotesData extends Provenance {
  notes: import('@/lib/personal').Note[];
}

export interface AgentsData extends Provenance {
  agents: import('@/lib/personal').Agent[];
}
