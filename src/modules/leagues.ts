/**
 * Leagues Divina knows by name. The code is ESPN's path; aliases are what a
 * person might say ("follow the Scottish Premiership"). Any other ESPN code
 * still works when typed into Settings.
 */
export interface League {
  code: string;
  name: string;
  short: string;
  sport: 'Football' | 'Basketball' | 'American football' | 'Baseball' | 'Ice hockey';
  aliases: string[];
}

export const LEAGUES: League[] = [
  { code: 'soccer/eng.1', name: 'Premier League', short: 'EPL', sport: 'Football', aliases: ['premier league', 'epl', 'english premier league', 'the prem'] },
  { code: 'soccer/eng.2', name: 'Championship', short: 'EFL', sport: 'Football', aliases: ['championship', 'efl championship', 'english championship'] },
  { code: 'soccer/sco.1', name: 'Scottish Premiership', short: 'SPFL', sport: 'Football', aliases: ['scottish premiership', 'spfl', 'scottish premier league', 'scottish league', 'scottish football'] },
  { code: 'soccer/esp.1', name: 'La Liga', short: 'LaLiga', sport: 'Football', aliases: ['la liga', 'laliga', 'spanish league'] },
  { code: 'soccer/ita.1', name: 'Serie A', short: 'Serie A', sport: 'Football', aliases: ['serie a', 'italian league'] },
  { code: 'soccer/ger.1', name: 'Bundesliga', short: 'Bundesliga', sport: 'Football', aliases: ['bundesliga', 'german league'] },
  { code: 'soccer/fra.1', name: 'Ligue 1', short: 'Ligue 1', sport: 'Football', aliases: ['ligue 1', 'ligue one', 'french league'] },
  { code: 'soccer/uefa.champions', name: 'Champions League', short: 'UCL', sport: 'Football', aliases: ['champions league', 'ucl'] },
  { code: 'soccer/uefa.europa', name: 'Europa League', short: 'UEL', sport: 'Football', aliases: ['europa league', 'uel'] },
  { code: 'soccer/usa.1', name: 'MLS', short: 'MLS', sport: 'Football', aliases: ['mls', 'major league soccer'] },
  { code: 'football/nfl', name: 'NFL', short: 'NFL', sport: 'American football', aliases: ['nfl', 'american football'] },
  { code: 'football/college-football', name: 'College football', short: 'NCAAF', sport: 'American football', aliases: ['college football', 'ncaaf'] },
  { code: 'basketball/nba', name: 'NBA', short: 'NBA', sport: 'Basketball', aliases: ['nba', 'basketball'] },
  { code: 'basketball/wnba', name: 'WNBA', short: 'WNBA', sport: 'Basketball', aliases: ['wnba'] },
  { code: 'baseball/mlb', name: 'MLB', short: 'MLB', sport: 'Baseball', aliases: ['mlb', 'baseball'] },
  { code: 'hockey/nhl', name: 'NHL', short: 'NHL', sport: 'Ice hockey', aliases: ['nhl', 'hockey', 'ice hockey'] },
];

export const LEAGUE_BY_CODE = Object.fromEntries(LEAGUES.map((l) => [l.code, l])) as Record<string, League>;

/** "the scottish premiership" → soccer/sco.1 */
export function leagueFromSpeech(s: string): League | null {
  const base = s.toLowerCase().replace(/[.!?]/g, '').replace(/^(the|my)\s+/, '').replace(/\s+(games|scores|results|fixtures)$/, '').trim();
  const match = (t: string) => LEAGUES.find((l) => l.aliases.includes(t) || l.name.toLowerCase() === t || l.short.toLowerCase() === t) ?? null;
  // "the NBA league" → "nba"; but "premier league" must keep its word
  return match(base) ?? match(base.replace(/\s+league$/, ''));
}

export const MAX_LEAGUES = 6;
export const DEFAULT_LEAGUES = ['soccer/eng.1'];

export function parseLeagueList(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const x of (raw ?? '').split(/[,;\s]+/)) {
    const c = x.trim().toLowerCase();
    if (/^[a-z-]+\/[a-z0-9.-]+$/.test(c) && !out.includes(c)) out.push(c);
  }
  return out.length ? out.slice(0, MAX_LEAGUES) : [...DEFAULT_LEAGUES];
}
