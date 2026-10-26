/**
 * Languages Divina can hear, speak and translate. Speech recognition and the
 * browser voice use the BCP-47 tag; the AI uses the English name.
 */
export interface Language {
  code: string; // our id
  tag: string; // BCP-47, for speech recognition and the browser voice
  name: string; // in English, for the AI
  native: string; // as its speakers write it
  /** what people say: "spanish", "español" */
  spoken: string[];
}

export const LANGUAGES: Language[] = [
  { code: 'en', tag: 'en-GB', name: 'English', native: 'English', spoken: ['english', 'british', 'american'] },
  { code: 'es', tag: 'es-ES', name: 'Spanish', native: 'Español', spoken: ['spanish', 'español', 'espanol', 'castilian'] },
  { code: 'fr', tag: 'fr-FR', name: 'French', native: 'Français', spoken: ['french', 'français', 'francais'] },
  { code: 'de', tag: 'de-DE', name: 'German', native: 'Deutsch', spoken: ['german', 'deutsch'] },
  { code: 'it', tag: 'it-IT', name: 'Italian', native: 'Italiano', spoken: ['italian', 'italiano'] },
  { code: 'pt', tag: 'pt-PT', name: 'Portuguese', native: 'Português', spoken: ['portuguese', 'português', 'portugues'] },
  { code: 'pt-br', tag: 'pt-BR', name: 'Brazilian Portuguese', native: 'Português (Brasil)', spoken: ['brazilian', 'brazilian portuguese'] },
  { code: 'nl', tag: 'nl-NL', name: 'Dutch', native: 'Nederlands', spoken: ['dutch', 'nederlands'] },
  { code: 'pl', tag: 'pl-PL', name: 'Polish', native: 'Polski', spoken: ['polish', 'polski'] },
  { code: 'ro', tag: 'ro-RO', name: 'Romanian', native: 'Română', spoken: ['romanian'] },
  { code: 'sv', tag: 'sv-SE', name: 'Swedish', native: 'Svenska', spoken: ['swedish', 'svenska'] },
  { code: 'tr', tag: 'tr-TR', name: 'Turkish', native: 'Türkçe', spoken: ['turkish', 'türkçe'] },
  { code: 'el', tag: 'el-GR', name: 'Greek', native: 'Ελληνικά', spoken: ['greek'] },
  { code: 'ru', tag: 'ru-RU', name: 'Russian', native: 'Русский', spoken: ['russian'] },
  { code: 'uk', tag: 'uk-UA', name: 'Ukrainian', native: 'Українська', spoken: ['ukrainian'] },
  { code: 'ar', tag: 'ar-SA', name: 'Arabic', native: 'العربية', spoken: ['arabic'] },
  { code: 'hi', tag: 'hi-IN', name: 'Hindi', native: 'हिन्दी', spoken: ['hindi'] },
  { code: 'ur', tag: 'ur-PK', name: 'Urdu', native: 'اردو', spoken: ['urdu'] },
  { code: 'bn', tag: 'bn-BD', name: 'Bengali', native: 'বাংলা', spoken: ['bengali', 'bangla'] },
  { code: 'pa', tag: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', spoken: ['punjabi'] },
  { code: 'zh', tag: 'zh-CN', name: 'Chinese (Mandarin)', native: '中文', spoken: ['chinese', 'mandarin'] },
  { code: 'ja', tag: 'ja-JP', name: 'Japanese', native: '日本語', spoken: ['japanese'] },
  { code: 'ko', tag: 'ko-KR', name: 'Korean', native: '한국어', spoken: ['korean'] },
  { code: 'vi', tag: 'vi-VN', name: 'Vietnamese', native: 'Tiếng Việt', spoken: ['vietnamese'] },
  { code: 'th', tag: 'th-TH', name: 'Thai', native: 'ไทย', spoken: ['thai'] },
  { code: 'id', tag: 'id-ID', name: 'Indonesian', native: 'Bahasa Indonesia', spoken: ['indonesian'] },
  { code: 'tl', tag: 'fil-PH', name: 'Filipino', native: 'Filipino', spoken: ['filipino', 'tagalog'] },
  { code: 'sw', tag: 'sw-KE', name: 'Swahili', native: 'Kiswahili', spoken: ['swahili'] },
  { code: 'cy', tag: 'cy-GB', name: 'Welsh', native: 'Cymraeg', spoken: ['welsh', 'cymraeg'] },
  { code: 'ga', tag: 'ga-IE', name: 'Irish', native: 'Gaeilge', spoken: ['irish', 'gaelic', 'irish gaelic'] },
];

export const LANG_BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l])) as Record<string, Language>;
export const isLangCode = (v: unknown): v is string => typeof v === 'string' && Object.hasOwn(LANG_BY_CODE, v);

/** "spanish", "into español" → the language, or null. */
export function languageFrom(spoken: string): Language | null {
  const t = spoken.toLowerCase().trim().replace(/^(?:in|into|to)\s+/, '').replace(/\s+(?:please|language)$/, '');
  return LANGUAGES.find((l) => l.spoken.includes(t) || l.name.toLowerCase() === t || l.native.toLowerCase() === t) ?? null;
}

/** The person's browser language as one of ours (default English). */
export function browserLanguage(): string {
  if (typeof navigator === 'undefined') return 'en';
  const tag = (navigator.language || 'en').toLowerCase();
  if (tag === 'pt-br') return 'pt-br';
  const base = tag.split('-')[0];
  return isLangCode(base) ? base : 'en';
}
