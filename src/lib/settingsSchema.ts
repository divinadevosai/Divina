/**
 * The settings Divina knows, what each may look like, and what the page may
 * see of them. Shared by the server (app) and the browser edition.
 */
export const SETTING_KEYS = [
  'DIVINA_AI_PROVIDER', // gemini | claude | openai: who answers
  'DIVINA_TTS_PROVIDER', // gemini | openai | elevenlabs: whose studio voice speaks
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_TTS_MODEL',
  'GEMINI_VOICE',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_TTS_VOICE',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE', // a voice id from the person's ElevenLabs voice list
  'ELEVENLABS_MODEL',
  'DIVINA_VOICE_MODE', // studio | fast
  'DIVINA_THINKING', // fast | deep
  'DIVINA_LEAGUE',
  'DIVINA_CITY',
  'DIVINA_NEWS_TOPIC',
  'DIVINA_CALENDAR_ICS',
  'INSTAGRAM_TOKEN',
  'IG_BUSINESS_ACCOUNT_ID',
  'GITHUB_TOKEN',
  'DIVINA_UNOFFICIAL_FEEDS', // on | off: ESPN scores and Yahoo quotes, personal use only
  'DIVINA_EMAIL_ADDRESS',
  'DIVINA_EMAIL_PASSWORD', // an app password, never the account password
  'DIVINA_EMAIL_HOST', // IMAP server, only for providers Divina doesn't know
  'DIVINA_COINGECKO_KEY', // the person's own free CoinGecko Demo key
  'DIVINA_CRYPTO', // CoinGecko coin ids, comma-separated
  'DIVINA_CRYPTO_CURRENCY',
  'TWILIO_ACCOUNT_SID', // phone calls to your own number (Windows and Mac)
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM', // the Twilio number calls come from
  'DIVINA_CALL_ME', // the one number Divina will ever ring: yours
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SECRET = new Set<SettingKey>(['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'INSTAGRAM_TOKEN', 'GITHUB_TOKEN', 'DIVINA_CALENDAR_ICS', 'DIVINA_EMAIL_PASSWORD', 'DIVINA_COINGECKO_KEY', 'TWILIO_AUTH_TOKEN', 'DIVINA_CALL_ME']);
export const MAX_LEN = 2048;

/**
 * What each value may look like. Several end up inside URLs the server
 * fetches (the model name, leagues, the calendar address) or carry a key, so
 * anything outside these shapes is refused instead of stored.
 */
const TOKEN = /^[A-Za-z0-9._|:-]{8,1024}$/;
const MODEL = /^(models\/)?[a-z0-9][a-z0-9.-]{0,80}$/;
// Anthropic (sk-ant-…), OpenAI (sk-proj-…) and ElevenLabs (sk_…) keys use _ and - as well
const API_KEY = /^[A-Za-z0-9._-]{20,400}$/;
// a full international number, like +447700900123
const PHONE = /^\+[1-9]\d{7,14}$/;
export const AI_PROVIDERS = ['gemini', 'claude', 'openai'] as const;
export const TTS_PROVIDERS = ['gemini', 'openai', 'elevenlabs'] as const;
export const OPENAI_VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'] as const;
export const ELEVENLABS_MODELS = ['eleven_flash_v2_5', 'eleven_multilingual_v2', 'eleven_v3'] as const;
export const VALID: Record<SettingKey, (v: string) => boolean> = {
  DIVINA_AI_PROVIDER: (v) => (AI_PROVIDERS as readonly string[]).includes(v),
  DIVINA_TTS_PROVIDER: (v) => (TTS_PROVIDERS as readonly string[]).includes(v),
  GEMINI_API_KEY: (v) => TOKEN.test(v),
  ANTHROPIC_API_KEY: (v) => API_KEY.test(v),
  ANTHROPIC_MODEL: (v) => /^claude-[a-z0-9.-]{1,60}$/.test(v),
  OPENAI_API_KEY: (v) => API_KEY.test(v),
  OPENAI_MODEL: (v) => /^(gpt|o\d|chatgpt)[a-z0-9.-]{0,60}$/.test(v),
  OPENAI_TTS_VOICE: (v) => (OPENAI_VOICES as readonly string[]).includes(v),
  ELEVENLABS_API_KEY: (v) => API_KEY.test(v),
  ELEVENLABS_VOICE: (v) => /^[A-Za-z0-9]{8,40}$/.test(v),
  ELEVENLABS_MODEL: (v) => (ELEVENLABS_MODELS as readonly string[]).includes(v),
  GEMINI_MODEL: (v) => MODEL.test(v),
  GEMINI_TTS_MODEL: (v) => MODEL.test(v),
  GEMINI_VOICE: (v) => /^[A-Za-z]{2,32}$/.test(v),
  DIVINA_VOICE_MODE: (v) => v === 'studio' || v === 'fast',
  DIVINA_THINKING: (v) => v === 'fast' || v === 'deep',
  DIVINA_LEAGUE: (v) => /^[a-z0-9./_-]+(\s*,\s*[a-z0-9./_-]+)*$/.test(v) && !v.includes('..'),
  DIVINA_CITY: (v) => v.length <= 100 && !/[<>{}\\]/.test(v),
  DIVINA_NEWS_TOPIC: (v) => v.length <= 100 && !/[<>{}\\]/.test(v),
  DIVINA_CALENDAR_ICS: (v) => {
    try {
      const u = new URL(v);
      return ['https:', 'http:', 'webcal:'].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  },
  INSTAGRAM_TOKEN: (v) => TOKEN.test(v),
  IG_BUSINESS_ACCOUNT_ID: (v) => /^\d{5,32}$/.test(v),
  GITHUB_TOKEN: (v) => TOKEN.test(v),
  DIVINA_UNOFFICIAL_FEEDS: (v) => v === 'on' || v === 'off',
  DIVINA_EMAIL_ADDRESS: (v) => v.length <= 254 && /^[^\s@<>()]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v),
  DIVINA_EMAIL_PASSWORD: (v) => /^[\x20-\x7E]{4,200}$/.test(v),
  // a host name, not an address: Divina won't be pointed at machines on your network by number
  DIVINA_EMAIL_HOST: (v) => /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(v),
  DIVINA_COINGECKO_KEY: (v) => /^[A-Za-z0-9_-]{8,80}$/.test(v),
  DIVINA_CRYPTO: (v) => /^[a-z0-9-]+(\s*,\s*[a-z0-9-]+){0,9}$/.test(v),
  DIVINA_CRYPTO_CURRENCY: (v) => /^(usd|gbp|eur|jpy|aud|cad|chf|inr|sek|nok|dkk|nzd|btc|eth)$/.test(v),
  TWILIO_ACCOUNT_SID: (v) => /^AC[0-9a-f]{32}$/.test(v),
  TWILIO_AUTH_TOKEN: (v) => /^[A-Za-z0-9]{32}$/.test(v),
  TWILIO_FROM: (v) => PHONE.test(v),
  DIVINA_CALL_ME: (v) => PHONE.test(v),
};
export const HOW: Partial<Record<SettingKey, string>> = {
  GEMINI_API_KEY: 'That doesn’t look like an API key. Paste just the key, with no spaces.',
  ANTHROPIC_API_KEY: 'That doesn’t look like an Anthropic API key (it starts sk-ant-). Paste just the key, with no spaces.',
  OPENAI_API_KEY: 'That doesn’t look like an OpenAI API key (it starts sk-). Paste just the key, with no spaces.',
  ELEVENLABS_API_KEY: 'That doesn’t look like an ElevenLabs API key. Paste just the key, with no spaces.',
  ANTHROPIC_MODEL: 'A Claude model name looks like claude-opus-5-5.',
  OPENAI_MODEL: 'An OpenAI model name looks like gpt-6.1-sol.',
  ELEVENLABS_VOICE: 'Pick a voice from the list.',
  INSTAGRAM_TOKEN: 'That doesn’t look like an access token. Paste just the token, with no spaces.',
  GITHUB_TOKEN: 'That doesn’t look like a GitHub token.',
  GEMINI_MODEL: 'A model name looks like gemini-3.8-flash.',
  GEMINI_TTS_MODEL: 'A model name looks like gemini-3.8-flash-tts.',
  DIVINA_CALENDAR_ICS: 'The calendar address must start with https:// or webcal://.',
  IG_BUSINESS_ACCOUNT_ID: 'The business account ID is a number.',
  DIVINA_LEAGUE: 'Pick leagues from the list.',
  DIVINA_EMAIL_ADDRESS: 'That doesn’t look like an email address.',
  DIVINA_EMAIL_PASSWORD: 'Paste the app password exactly as your provider shows it.',
  DIVINA_EMAIL_HOST: 'The server looks like imap.example.com.',
  DIVINA_COINGECKO_KEY: 'That doesn’t look like a CoinGecko API key.',
  DIVINA_CRYPTO: 'List up to 10 CoinGecko coin names, like: bitcoin, ethereum, solana',
  DIVINA_CRYPTO_CURRENCY: 'Pick a currency from the list.',
  TWILIO_ACCOUNT_SID: 'The Account SID starts with AC and is on your Twilio console’s home page.',
  TWILIO_AUTH_TOKEN: 'The Auth Token is 32 letters and numbers, under the Account SID on your Twilio console.',
  TWILIO_FROM: 'Write the number with the country code, no spaces: +447700900123.',
  DIVINA_CALL_ME: 'Write your number with the country code, no spaces: +447700900123.',
};

export interface PublicSetting {
  value?: string; // plain settings only
  set: boolean;
  hint?: string; // secrets: last four characters
  from: 'panel' | 'env' | 'default';
}

/** What the page may see of a value: secrets only as set/unset and their last four characters. */
export function publicSetting(k: SettingKey, v: string | undefined, from: PublicSetting['from']): PublicSetting {
  return SECRET.has(k) ? { set: !!v, hint: v ? `…${v.slice(-4)}` : undefined, from } : { value: v || undefined, set: !!v, from };
}

/** Check one value from the page. Returns an error message, or null if it may be stored. */
export function checkSetting(k: string, v: unknown): string | null {
  if (!(SETTING_KEYS as readonly string[]).includes(k)) return `Unknown setting: ${k}`;
  if (typeof v !== 'string' || v.length > MAX_LEN || /[\r\n]/.test(v)) return `${k} must be a single line of text.`;
  const t = v.trim();
  if (t !== '' && !VALID[k as SettingKey](t)) return HOW[k as SettingKey] ?? `That value isn’t allowed for ${k}.`;
  return null;
}
