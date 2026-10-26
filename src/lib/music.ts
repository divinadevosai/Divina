/**
 * "Play X on Spotify / Apple Music / YouTube Music…": Divina opens that
 * service already searching for X, so it's one click to play. No accounts or
 * keys: these are the services' own public search pages (and, on Windows,
 * the Spotify app's own search link when Spotify is installed).
 *
 * Shared by the app's server (desktop bridge) and the page (browser edition).
 */
export const MUSIC_SERVICES = ['spotify', 'apple_music', 'youtube_music', 'youtube', 'soundcloud', 'deezer', 'tidal', 'amazon_music'] as const;
export type MusicService = (typeof MUSIC_SERVICES)[number];

export const SERVICE_NAMES: Record<MusicService, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  deezer: 'Deezer',
  tidal: 'Tidal',
  amazon_music: 'Amazon Music',
};

/** What people call each service out loud, including common mishearings. */
export function serviceFrom(spoken: string): MusicService | null {
  const t = spoken.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (/^(spotify|spot ?ify|spottify|spot a fly)$/.test(t)) return 'spotify';
  if (/^(apple music|apple|itunes|i tunes|apple musics)$/.test(t)) return 'apple_music';
  if (/^(youtube music|you tube music|yt music)$/.test(t)) return 'youtube_music';
  if (/^(youtube|you tube)$/.test(t)) return 'youtube';
  if (/^(soundcloud|sound cloud)$/.test(t)) return 'soundcloud';
  if (/^(deezer|deezer music|dieser|teaser)$/.test(t)) return 'deezer';
  if (/^(tidal|title)$/.test(t)) return 'tidal';
  if (/^(amazon music|amazon)$/.test(t)) return 'amazon_music';
  return null;
}

/** The service's own search page for a query. Fixed hosts; the query is only ever encoded data. */
export function musicSearchUrl(service: MusicService, query: string): string {
  const q = encodeURIComponent(query.trim());
  switch (service) {
    case 'spotify':
      return `https://open.spotify.com/search/${q}`;
    case 'apple_music':
      return `https://music.apple.com/search?term=${q}`;
    case 'youtube_music':
      return `https://music.youtube.com/search?q=${q}`;
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${q}`;
    case 'soundcloud':
      return `https://soundcloud.com/search?q=${q}`;
    case 'deezer':
      return `https://www.deezer.com/search/${q}`;
    case 'tidal':
      return `https://listen.tidal.com/search?q=${q}`;
    case 'amazon_music':
      return `https://music.amazon.com/search/${q}`;
  }
}

/** A search query as it may be sent: one line of plain text, not too long. */
export function cleanQuery(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** A friendly name for the app Windows says is playing (from its app id). */
export function playerName(appId: string): string {
  const id = appId.toLowerCase();
  const known: [RegExp, string][] = [
    [/spotify/, 'Spotify'],
    [/applemusic/, 'Apple Music'],
    [/itunes/, 'iTunes'],
    [/amazonmusic|amazon\.music/, 'Amazon Music'],
    [/deezer/, 'Deezer'],
    [/tidal/, 'Tidal'],
    [/soundcloud/, 'SoundCloud'],
    [/youtube ?music|ytmusic/, 'YouTube Music'],
    [/zunemusic|mediaplayer/, 'Media Player'],
    [/vlc/, 'VLC'],
    [/foobar/, 'foobar2000'],
    [/musicbee/, 'MusicBee'],
    [/winamp/, 'Winamp'],
    [/msedge|microsoftedge/, 'Edge'],
    [/chrome/, 'Chrome'],
    [/firefox/, 'Firefox'],
    [/brave/, 'Brave'],
    [/opera/, 'Opera'],
    [/vivaldi/, 'Vivaldi'],
  ];
  for (const [re, name] of known) if (re.test(id)) return name;
  const base = appId.split('!')[0].split('_')[0].replace(/\.exe$/i, '');
  const last = base.split(/[.\\/]/).pop() ?? base;
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : 'Unknown player';
}
