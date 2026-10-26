'use client';
/** The language Divina listens for, speaks and answers in. */
import { usePrefs } from '@/stores/prefs';
import { LANGUAGES, browserLanguage, LANG_BY_CODE } from '@/lib/languages';
import { UI_LANGUAGES } from '@/lib/i18n';
import { applyLanguage } from '@/ai/assistant';

const input = 'w-full rounded-lg border border-ink-faint bg-black/20 px-3 py-2 text-[14px] text-ink focus:border-holo/60 focus:outline-none';

export function LanguageSettings() {
  const lang = usePrefs((s) => s.lang);
  const auto = browserLanguage();
  const now = lang || auto;
  return (
    <div className="space-y-2">
      <select
        className={input}
        value={lang}
        onChange={(e) => {
          usePrefs.getState().set({ lang: e.target.value });
          applyLanguage();
        }}
        aria-label="Language"
      >
        <option value="">Automatic ({LANG_BY_CODE[auto]?.native ?? 'English'})</option>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
            {l.native !== l.name ? ` — ${l.name}` : ''}
          </option>
        ))}
      </select>
      <p className="text-[12px] leading-relaxed text-ink-lo">
        Divina listens and answers in this language (answers need an AI key; quick commands like “open weather” are understood in English, and the AI handles the rest).
        {UI_LANGUAGES.includes(now) ? ' Main buttons and headings are translated too.' : ' Buttons and menus stay in English for this language, for now.'}
      </p>
    </div>
  );
}
