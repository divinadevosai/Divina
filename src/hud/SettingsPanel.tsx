'use client';
/**
 * Settings, inside Divina. Everything here applies immediately — no files
 * to edit, no restart. Secrets are write-only: the page only ever learns
 * that a key is set and its last four characters.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { loadSettings, saveSettings, useSettings, type SettingKey } from '@/lib/client/settings';
import { usePrefs, type InterruptMode, type ReplyDisplay } from '@/stores/prefs';
import { LEAGUES, MAX_LEAGUES, parseLeagueList } from '@/modules/leagues';
import { voice } from '@/ai/tts';
import { audio } from '@/audio/engine';
import { WEB, IOS, APP_SITE, BASE_PATH } from '@/lib/edition';
import { LicenceSettings } from './settings/Licence';
import { useLicence } from '@/lib/client/licence';
import { hasCalendarFile, setCalendarFile } from '@/web/backend';
import { refresh } from '@/modules/feeds';
import { useCompact } from './useCompact';
import { useSectionTitle, useT } from '@/lib/i18n';
import { LanguageSettings } from './settings/Language';
import { WorldSettings } from './settings/Worlds';
import { startTour } from './Tour';
import { BackupSettings, HeadsUpSettings, MemorySettings, RoutineSettings } from './settings/Personal';
import { OPENAI_VOICES, ELEVENLABS_MODELS } from '@/lib/settingsSchema';
import { PrivacySettings } from './settings/Privacy';
import { callMe } from '@/lib/client/phone';

export const VOICES = [
  'Charon', 'Kore', 'Puck', 'Zephyr', 'Aoede', 'Sulafat', 'Achernar', 'Gacrux', 'Vindemiatrix', 'Fenrir',
  'Leda', 'Orus', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome',
  'Algenib', 'Rasalgethi', 'Laomedeia', 'Alnilam', 'Schedar', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Sadachbia', 'Sadaltager',
];

const MODELS = [
  { id: '', label: 'Automatic (newest Flash, falls back when busy)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — fastest' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash — quick, less busy' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — newest' },
];

const CLAUDE_MODELS = [
  { id: '', label: 'Claude Opus 5.5 — most capable (default)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — quicker, costs less' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest, cheapest' },
];
const OPENAI_MODELS = [
  { id: '', label: 'GPT-6.1 Sol (default)' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra — most capable' },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
];
const ELEVEN_MODEL_LABELS: Record<(typeof ELEVENLABS_MODELS)[number], string> = {
  eleven_flash_v2_5: 'Flash v2.5 — starts talking fastest (default)',
  eleven_multilingual_v2: 'Multilingual v2 — richest, steady',
  eleven_v3: 'Eleven v3 — most expressive, slower',
};

function Select({ k, options, fallback }: { k: SettingKey; options: { id: string; label: string }[]; fallback?: string }) {
  const value = useSettings((st) => st.data?.settings[k]?.value) ?? fallback ?? '';
  return (
    <select className={input} value={value} onChange={(e) => void saveSettings({ [k]: e.target.value })}>
      {!options.some((o) => o.id === value) && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  const heading = useSectionTitle();
  return (
    <section className="border-t border-ink-faint px-5 py-5 sm:px-6" data-section={title}>
      <h3 className="hud-label mb-3 !text-ink-mid">{heading(title)}</h3>
      <div className="space-y-4">{children}</div>
      {note && <p className="mt-3 text-[12px] leading-relaxed text-ink-lo">{note}</p>}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const compact = useCompact();
  return (
    <div className={compact ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-[180px_1fr] items-start gap-4'}>
      <div>
        <div className="text-[14px] text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-lo">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full border px-3.5 py-1.5 text-[13px] transition ${value === o.id ? 'border-holo/70 bg-holo/15 text-ink' : 'border-ink-faint text-ink-mid hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const input = 'w-full rounded-lg border border-ink-faint bg-black/20 px-3 py-2 text-[14px] text-ink placeholder:text-ink-lo focus:border-holo/60 focus:outline-none';
const button = 'rounded-lg border border-holo/50 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-holo-hi hover:bg-holo/10 disabled:opacity-40';

/** Browser edition: the calendar is an .ics file kept in this browser. */
function CalendarFile() {
  const [has, setHas] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setHas(hasCalendarFile()), []);
  const done = (r: { ok: boolean; message?: string }, ok: string) => {
    setMsg(r.ok ? ok : (r.message ?? 'Couldn’t save it.'));
    setHas(hasCalendarFile());
    if (r.ok) void refresh('calendar');
  };
  return (
    <div className="space-y-2">
      <input
        type="file"
        accept=".ics,text/calendar"
        className="block w-full text-[13px] text-ink-mid file:mr-3 file:rounded-lg file:border file:border-holo/50 file:bg-transparent file:px-3 file:py-2 file:font-mono file:text-[11px] file:uppercase file:tracking-[0.12em] file:text-holo-hi"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) done(setCalendarFile(await f.text()), `Loaded ${f.name}.`);
          e.target.value = '';
        }}
      />
      {has && (
        <button className={`${button} !border-ink-faint !text-ink-lo`} onClick={() => done(setCalendarFile(null), 'Calendar removed.')}>
          remove calendar
        </button>
      )}
      {msg && <p className="text-[12px] text-ink-lo">{msg}</p>}
    </div>
  );
}

/** A text setting with its own Save button. */
function TextSetting({ k, placeholder, secret, confirm }: { k: SettingKey; placeholder: string; secret?: boolean; confirm?: React.ReactNode }) {
  const s = useSettings((st) => st.data?.settings[k]);
  const [v, setV] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setV(secret ? '' : (s?.value ?? '')), [s?.value, secret]);
  const save = async (value: string) => {
    if (value && confirm && !agreed) {
      setMsg('Tick the box below first.');
      window.setTimeout(() => setMsg(null), 2500);
      return;
    }
    const r = await saveSettings({ [k]: value });
    setMsg(r.ok ? (value ? 'Saved' : 'Cleared') : r.message ?? 'Could not save');
    if (r.ok && secret) setV('');
    window.setTimeout(() => setMsg(null), 2500);
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          className={input}
          type={secret ? 'password' : 'text'}
          value={v}
          placeholder={secret && s?.set ? `saved ${s.hint ?? ''} — type to replace` : placeholder}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save(v)}
          autoComplete="off"
          spellCheck={false}
        />
        <button className={button} onClick={() => void save(v)} disabled={(secret ? !v : v === (s?.value ?? '')) || (!!confirm && !!v && !agreed)}>
          save
        </button>
        {s?.from === 'panel' && (
          <button className={`${button} !border-ink-faint !text-ink-lo`} onClick={() => void save('')} title="Go back to .env.local / the default">
            reset
          </button>
        )}
      </div>
      {confirm && v && (
        <label className="mt-2 flex items-start gap-2 text-[12px] leading-snug text-ink-mid">
          <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>{confirm}</span>
        </label>
      )}
      {msg && <div className="mt-1 text-[11.5px] text-holo-hi">{msg}</div>}
    </div>
  );
}

function PhoneSettings() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = useSettings((st) => !!(st.data?.settings.TWILIO_ACCOUNT_SID?.set && st.data.settings.TWILIO_AUTH_TOKEN?.set && st.data.settings.TWILIO_FROM?.set && st.data.settings.DIVINA_CALL_ME?.set));
  const test = async () => {
    setBusy(true);
    const r = await callMe('This is a test call. If you can hear this, phone calls are working.');
    setBusy(false);
    setMsg(r.ok ? 'Calling you now…' : r.message ?? 'The call didn’t go through.');
    window.setTimeout(() => setMsg(null), 6000);
  };
  return (
    <>
      <Row label="Account SID" hint="twilio.com/console → Account Info. Starts with AC.">
        <TextSetting k="TWILIO_ACCOUNT_SID" placeholder="AC…" />
      </Row>
      <Row label="Auth Token" hint="Under the Account SID. Stays encrypted on this computer.">
        <TextSetting k="TWILIO_AUTH_TOKEN" placeholder="32 letters and numbers" secret />
      </Row>
      <Row label="Twilio number" hint="The number you bought in Twilio. Calls come from here.">
        <TextSetting k="TWILIO_FROM" placeholder="+447700900123" />
      </Row>
      <Row label="Your number" hint="The only number Divina will ever ring.">
        <TextSetting k="DIVINA_CALL_ME" placeholder="+447700900123" secret />
      </Row>
      <div className="flex flex-wrap items-center gap-3">
        <button className={button} disabled={!ready || busy} onClick={() => void test()}>
          test call
        </button>
        {msg && <span className="text-[12px] text-holo-hi">{msg}</span>}
      </div>
    </>
  );
}

const CURRENCIES = ['usd', 'gbp', 'eur', 'jpy', 'aud', 'cad', 'chf', 'inr', 'sek', 'nok', 'dkk', 'nzd'];

function CryptoSettings() {
  const cur = useSettings((st) => st.data?.settings.DIVINA_CRYPTO_CURRENCY?.value) ?? 'usd';
  return (
    <>
      <Row label="CoinGecko API key" hint="Free: coingecko.com/en/api → create a Demo account → copy your key.">
        <TextSetting k="DIVINA_COINGECKO_KEY" placeholder="CG-…" secret confirm={COINGECKO_CONFIRM} />
      </Row>
      <Row label="Coins" hint="CoinGecko names, comma-separated (up to 10).">
        <TextSetting k="DIVINA_CRYPTO" placeholder="bitcoin, ethereum, solana" />
      </Row>
      <Row label="Currency">
        <select className={input} value={cur} onChange={(e) => void saveSettings({ DIVINA_CRYPTO_CURRENCY: e.target.value })}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c.toUpperCase()}
            </option>
          ))}
        </select>
      </Row>
    </>
  );
}

const COINGECKO_CONFIRM = (
  <>
    This is my own key, for my own personal use under{' '}
    <a className="underline" href="https://www.coingecko.com/en/api_terms" target="_blank" rel="noopener">
      CoinGecko’s API terms
    </a>
    . Prices are information, not financial advice.
  </>
);

/** What someone agrees to before saving a Gemini key (Google's Gemini API terms). */
const GEMINI_CONFIRM = (
  <>
    I’m 18 or over, and I’ll use this key under{' '}
    <a className="underline" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener">
      Google’s Gemini API terms
    </a>
    . In the UK, EU or Switzerland that means a key with billing turned on (Google’s paid tier). Replies are written by AI and can be wrong.
  </>
);

const CLAUDE_CONFIRM = (
  <>
    I’m 18 or over, and I’ll use this key under{' '}
    <a className="underline" href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener">
      Anthropic’s terms
    </a>{' '}
    and{' '}
    <a className="underline" href="https://www.anthropic.com/legal/aup" target="_blank" rel="noopener">
      Usage Policy
    </a>
    . Replies are written by AI and can be wrong.
  </>
);

const OPENAI_CONFIRM = (
  <>
    I’m 18 or over, and I’ll use this key under{' '}
    <a className="underline" href="https://openai.com/policies/services-agreement/" target="_blank" rel="noopener">
      OpenAI’s terms
    </a>{' '}
    and{' '}
    <a className="underline" href="https://openai.com/policies/usage-policies/" target="_blank" rel="noopener">
      usage policies
    </a>
    . Replies are written by AI and can be wrong, and OpenAI voices are AI-generated, not a real person.
  </>
);

const ELEVENLABS_CONFIRM = (
  <>
    I’m 18 or over, and I’ll use this key under{' '}
    <a className="underline" href="https://elevenlabs.io/terms-of-use" target="_blank" rel="noopener">
      ElevenLabs’ terms
    </a>
    . ElevenLabs’ free plan is for non-commercial use only. The voice is AI-generated, not a real person.
  </>
);

const KEY_NOTE = WEB
  ? (IOS ? 'Keys are encrypted before they’re saved, with a key this iPhone keeps locked away, and stay on this device. Each key goes only to its own company, with your requests. Divina has no server and never sees them. You pay that company directly for what you use.' : 'Keys are encrypted before they’re saved, with a key this browser keeps locked away (no script can read it out), and stay on this device. Each key goes only to its own company, with your requests. Divina has no server and never sees them. Anyone using this browser profile could still use them, so don’t save keys on a shared computer.')
  : 'Keys are encrypted before they’re saved, locked by Windows to your account on this PC, and are never shown again after saving. Each key goes only to its own company, with your requests. You pay that company directly for what you use.';

type AIProvider = 'gemini' | 'claude' | 'openai';
const AI_CHOICES: { id: AIProvider; label: string }[] = [
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'claude', label: 'Anthropic Claude' },
  { id: 'openai', label: 'OpenAI (ChatGPT)' },
];
const AI_KEY: Record<AIProvider, SettingKey> = { gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };

function AISettings() {
  const st = useSettings((x) => x.data?.settings);
  const saved = (AI_CHOICES.map((c) => c.id) as AIProvider[]).filter((p) => st?.[AI_KEY[p]]?.set);
  const picked = (st?.DIVINA_AI_PROVIDER?.value as AIProvider | undefined) ?? saved[0] ?? 'gemini';
  return (
    <>
      <Row label="Who answers" hint={saved.length ? `Keys saved: ${saved.map((p) => AI_CHOICES.find((c) => c.id === p)!.label).join(', ')}.` : 'Pick one, then add your own API key for it.'}>
        <Choice value={picked} options={AI_CHOICES} onChange={(v) => void saveSettings({ DIVINA_AI_PROVIDER: v })} />
      </Row>
      {picked === 'gemini' && (
        <>
          <Row label="Gemini API key" hint="From aistudio.google.com/apikey — sign in with Google, click “Create API key”, paste it here.">
            <TextSetting k="GEMINI_API_KEY" placeholder="AIza…" secret confirm={GEMINI_CONFIRM} />
          </Row>
          <Row label="Model">
            <Select k="GEMINI_MODEL" options={MODELS} />
          </Row>
        </>
      )}
      {picked === 'claude' && (
        <>
          <Row label="Anthropic API key" hint="From platform.claude.com → API keys → Create key. Add credit under Billing first.">
            <TextSetting k="ANTHROPIC_API_KEY" placeholder="sk-ant-…" secret confirm={CLAUDE_CONFIRM} />
          </Row>
          <Row label="Model" hint="If Claude’s safety checks turn a request down, Anthropic may answer it with another Claude model instead.">
            <Select k="ANTHROPIC_MODEL" options={CLAUDE_MODELS} />
          </Row>
        </>
      )}
      {picked === 'openai' && (
        <>
          <Row label="OpenAI API key" hint="From platform.openai.com/api-keys → Create new secret key. Add credit under Billing first.">
            <TextSetting k="OPENAI_API_KEY" placeholder="sk-…" secret confirm={OPENAI_CONFIRM} />
          </Row>
          <Row label="Model">
            <Select k="OPENAI_MODEL" options={OPENAI_MODELS} />
          </Row>
        </>
      )}
      {saved.length > 0 && !saved.includes(picked) && <p className="text-[12px] text-warn">No key for this one yet, so Divina keeps using {AI_CHOICES.find((c) => c.id === saved[0])!.label} until you add it.</p>}
    </>
  );
}

type VoiceProvider = 'gemini' | 'openai' | 'elevenlabs';
const VOICE_CHOICES: { id: VoiceProvider; label: string }[] = [
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
];
const VOICE_KEY: Record<VoiceProvider, SettingKey> = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY' };

/** ElevenLabs voices come from the person's own account (their library, clones they own). */
function ElevenVoices() {
  const hasKey = useSettings((x) => x.data?.settings.ELEVENLABS_API_KEY?.set);
  const [list, setList] = useState<{ id: string; name: string; detail?: string }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = async () => {
    setMsg('Loading your voices…');
    try {
      const j = (await (await fetch('/api/voices', { cache: 'no-store' })).json()) as { ok: boolean; voices?: { id: string; name: string; detail?: string }[]; message?: string };
      if (!j.ok) throw new Error(j.message ?? 'Couldn’t load voices.');
      setList(j.voices ?? []);
      setMsg(null);
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  useEffect(() => {
    if (hasKey) void load();
  }, [hasKey]);
  if (!hasKey) return <p className="text-[12px] text-ink-lo">Save your ElevenLabs key first.</p>;
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Select k="ELEVENLABS_VOICE" options={[{ id: '', label: 'George (default)' }, ...(list ?? []).map((v) => ({ id: v.id, label: v.detail ? `${v.name} — ${v.detail}` : v.name }))]} />
        <button className={button} onClick={() => void load()}>
          reload
        </button>
      </div>
      {msg && <p className="text-[12px] text-ink-lo">{msg}</p>}
    </div>
  );
}

function UnofficialFeeds() {
  const s = useSettings((st) => st.data?.settings.DIVINA_UNOFFICIAL_FEEDS);
  const paid = useLicence((st) => st.status?.required);
  const on = s?.value === 'on';
  // bought copies get licensed scores and prices from Divina's data server
  if (paid)
    return (
      <Row label="Live scores & prices" hint="Included with your licence.">
        <p className="text-[13px] text-ink-mid">On. Scores from API-SPORTS and prices from Twelve Data, through Divina’s own server.</p>
      </Row>
    );
  return (
    <Row label="Live scores & prices" hint="Personal use only.">
      <Choice
        value={on ? 'on' : 'off'}
        options={[
          { id: 'off', label: 'Off' },
          { id: 'on', label: 'On — just for me' },
        ]}
        onChange={(v) => void saveSettings({ DIVINA_UNOFFICIAL_FEEDS: v })}
      />
    </Row>
  );
}

function Leagues() {
  const s = useSettings((st) => st.data?.settings.DIVINA_LEAGUE);
  const current = useMemo(() => parseLeagueList(s?.value), [s?.value]);
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = async (code: string) => {
    const on = current.includes(code);
    if (!on && current.length >= MAX_LEAGUES) {
      setMsg(`Up to ${MAX_LEAGUES} leagues — untick one first.`);
      return;
    }
    const next = on ? current.filter((c) => c !== code) : [...current, code];
    if (!next.length) {
      setMsg('Keep at least one league.');
      return;
    }
    const r = await saveSettings({ DIVINA_LEAGUE: next.join(', ') });
    setMsg(r.ok ? null : r.message ?? 'Could not save');
  };
  const sports = [...new Set(LEAGUES.map((l) => l.sport))];
  const custom = current.filter((c) => !LEAGUES.some((l) => l.code === c));
  return (
    <div className="space-y-3">
      {sports.map((sp) => (
        <div key={sp}>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-lo">{sp}</div>
          <div className="flex flex-wrap gap-2">
            {LEAGUES.filter((l) => l.sport === sp).map((l) => {
              const on = current.includes(l.code);
              return (
                <button
                  key={l.code}
                  onClick={() => void toggle(l.code)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-[13px] transition ${on ? 'border-holo/70 bg-holo/15 text-ink' : 'border-ink-faint text-ink-mid hover:text-ink'}`}
                >
                  {on ? '✓ ' : ''}
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {custom.length > 0 && <div className="text-[12px] text-ink-lo">Also following: {custom.join(', ')}</div>}
      <div className="text-[12px] text-ink-lo">
        {current.length} of {MAX_LEAGUES}. You can also say “Divina, follow the NBA” or “stop following the NFL”.
      </div>
      {msg && <div className="text-[12px] text-warn">{msg}</div>}
    </div>
  );
}

function VoiceSettings() {
  const st = useSettings((x) => x.data?.settings);
  const prefs = usePrefs();
  const mode = (st?.DIVINA_VOICE_MODE.value ?? 'studio') as 'studio' | 'fast';
  const thinking = (st?.DIVINA_THINKING.value ?? 'fast') as 'fast' | 'deep';
  const voiceSaved = (VOICE_CHOICES.map((c) => c.id) as VoiceProvider[]).filter((p) => st?.[VOICE_KEY[p]]?.set);
  const voiceFrom = (st?.DIVINA_TTS_PROVIDER?.value as VoiceProvider | undefined) ?? voiceSaved[0] ?? 'gemini';
  return (
    <>
      <Row label="Voice" hint="Natural sounds best; Fast starts talking instantly.">
        <Choice
          value={mode}
          options={[
            { id: 'studio', label: 'Natural (AI voice)' },
            { id: 'fast', label: 'Fast (browser voice)' },
          ]}
          onChange={(v) => void saveSettings({ DIVINA_VOICE_MODE: v })}
        />
      </Row>
      {mode === 'studio' && (
        <>
          <Row label="Natural voice from" hint={voiceSaved.length ? undefined : 'Uses the same key as the AI, or add an ElevenLabs key.'}>
            <Choice value={voiceFrom} options={VOICE_CHOICES} onChange={(v) => void saveSettings({ DIVINA_TTS_PROVIDER: v })} />
          </Row>
          {voiceFrom === 'gemini' && (
            <Row label="Gemini voice" hint={st?.GEMINI_API_KEY?.set ? undefined : 'Needs your Gemini key (Settings → AI).'}>
              <Select k="GEMINI_VOICE" options={VOICES.map((v) => ({ id: v, label: v }))} fallback="Charon" />
            </Row>
          )}
          {voiceFrom === 'openai' && (
            <>
              {!st?.OPENAI_API_KEY?.set && (
                <Row label="OpenAI API key" hint="The same key the AI uses. From platform.openai.com/api-keys.">
                  <TextSetting k="OPENAI_API_KEY" placeholder="sk-…" secret confirm={OPENAI_CONFIRM} />
                </Row>
              )}
              <Row label="OpenAI voice">
                <Select k="OPENAI_TTS_VOICE" options={OPENAI_VOICES.map((v) => ({ id: v, label: v[0].toUpperCase() + v.slice(1) }))} fallback="marin" />
              </Row>
            </>
          )}
          {voiceFrom === 'elevenlabs' && (
            <>
              <Row label="ElevenLabs API key" hint="From elevenlabs.io → Developers → API keys → Create key.">
                <TextSetting k="ELEVENLABS_API_KEY" placeholder="sk_…" secret confirm={ELEVENLABS_CONFIRM} />
              </Row>
              <Row label="ElevenLabs voice" hint="Voices in your ElevenLabs account. Only use voices you have the right to use.">
                <ElevenVoices />
              </Row>
              <Row label="ElevenLabs model">
                <Select k="ELEVENLABS_MODEL" options={ELEVENLABS_MODELS.map((m) => ({ id: m, label: ELEVEN_MODEL_LABELS[m] }))} fallback="eleven_flash_v2_5" />
              </Row>
            </>
          )}
          {voiceSaved.length > 0 && !voiceSaved.includes(voiceFrom) && (
            <p className="text-[12px] text-warn">No key for this voice yet, so Divina uses {VOICE_CHOICES.find((c) => c.id === voiceSaved[0])!.label} until you add one.</p>
          )}
        </>
      )}
      <Row label="Test the voice">
        <button
          className={button}
          onClick={() => {
            audio.unlock();
            voice.stop();
            voice.say(`Hello, I'm Divina. This is my ${mode === 'fast' ? 'fast' : 'natural'} voice.`);
          }}
        >
          test
        </button>
      </Row>
      <Row label="Reply speed" hint="Fast thinks briefly before answering. Deep takes longer on hard questions.">
        <Choice
          value={thinking}
          options={[
            { id: 'fast', label: 'Fast' },
            { id: 'deep', label: 'Deep' },
          ]}
          onChange={(v) => void saveSettings({ DIVINA_THINKING: v })}
        />
      </Row>
      <Row label="Show replies as">
        <Choice<ReplyDisplay>
          value={prefs.replyDisplay}
          options={[
            { id: 'captions', label: 'Captions' },
            { id: 'hologram', label: 'Hologram' },
            { id: 'both', label: 'Both' },
          ]}
          onChange={(v) => prefs.set({ replyDisplay: v })}
        />
      </Row>
      <Row label="Caption size">
        <Choice
          value={prefs.captionSize}
          options={[
            { id: 'normal', label: 'Normal' },
            { id: 'large', label: 'Large' },
          ]}
          onChange={(v) => prefs.set({ captionSize: v })}
        />
      </Row>
      <Row label="Interrupt Divina" hint="What stops her mid-sentence. Space always works.">
        <Choice<InterruptMode>
          value={prefs.interrupt}
          options={[
            { id: 'name', label: 'When I say “Divina” or “stop”' },
            { id: 'any', label: 'Any speech' },
            { id: 'off', label: 'Never' },
          ]}
          onChange={(v) => prefs.set({ interrupt: v })}
        />
      </Row>
    </>
  );
}

export function SettingsPanel() {
  const tr = useT();
  const open = useSettings((s) => s.open);
  const setOpen = useSettings((s) => s.setOpen);
  const data = useSettings((s) => s.data);
  const error = useSettings((s) => s.error);

  useEffect(() => {
    if (open) void loadSettings();
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useSettings.getState().open && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.aside
            role="dialog"
            aria-label="Settings"
            className="flex h-full w-[min(680px,100vw)] flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] border-l border-ink-faint bg-[#070b16]/[0.97] shadow-[-30px_0_80px_rgba(0,0,0,0.6)]"
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <header className="flex items-center justify-between px-6 py-5">
              <div>
                <div className="hud-label">divina</div>
                <h2 className="text-[24px] font-medium text-ink">{tr('settingsTitle')}</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setOpen(false);
                    startTour();
                  }}
                  className="rounded-full border border-ink-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mid hover:text-ink"
                >
                  tour
                </button>
                <button onClick={() => setOpen(false)} className="rounded-full border border-ink-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mid hover:text-ink">
                  {tr('close')}
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto pb-10">
              {error && <p className="px-6 pb-4 text-[13px] text-warn">Couldn’t load settings: {error}</p>}
              {!data && !error && <p className="px-6 text-[13px] text-ink-lo">Loading…</p>}
              {data && (
                <>
                  <Section title="Worlds">
                    <WorldSettings />
                  </Section>
                  <Section title="Language">
                    <LanguageSettings />
                  </Section>
                  <Section title="Voice & replies">
                    <VoiceSettings />
                  </Section>
                  <Section title="AI" note={KEY_NOTE}>
                    <AISettings />
                  </Section>
                  <Section title="Memory" note="What Divina remembers about you, used in her answers. Saved only on this device, encrypted, and sent to your AI with your questions.">
                    <MemorySettings />
                  </Section>
                  <Section title="Routines">
                    <RoutineSettings />
                  </Section>
                  <Section title="Heads-ups">
                    <HeadsUpSettings />
                  </Section>
                  <Section title="Backup & restore" note="Backups work across editions: one from the browser version restores into Divina for Windows or Mac, and back.">
                    <BackupSettings />
                  </Section>
                  <Section title="Privacy & cookies">
                    <PrivacySettings />
                  </Section>
                  {!WEB && (
                    <Section
                      title="Sports & stocks"
                      note="Live scores come from ESPN’s public scoreboard and stock prices from Yahoo Finance. Neither licenses these feeds for apps, so Divina leaves them off unless you switch them on for your own personal, non-commercial use."
                    >
                      <UnofficialFeeds />
                      <Leagues />
                    </Section>
                  )}
                  {!WEB && (
                    <Section
                      title="Email"
                      note="Divina reads your inbox on this computer only, read-only: it never marks mail as read, moves, deletes or sends anything. Works with Gmail, iCloud, Yahoo, AOL, Fastmail, Zoho, GMX and most other providers (not Outlook.com yet)."
                    >
                      <Row label="Email address">
                        <TextSetting k="DIVINA_EMAIL_ADDRESS" placeholder="you@gmail.com" />
                      </Row>
                      <Row label="App password" hint="Not your normal password. Gmail: Google Account → Security → 2-Step Verification → App passwords.">
                        <TextSetting k="DIVINA_EMAIL_PASSWORD" placeholder="xxxx xxxx xxxx xxxx" secret />
                      </Row>
                      <Row label="Mail server" hint="Only needed if your provider isn’t listed above.">
                        <TextSetting k="DIVINA_EMAIL_HOST" placeholder="imap.example.com" />
                      </Row>
                    </Section>
                  )}
                  {!WEB && (
                    <Section
                      title="Phone calls"
                      note="Divina can ring your own phone and read a message: add a “Phone me” step to a routine, or switch on calls for heads-ups. It uses your own Twilio account (about £1 a month for a number plus a few pence a call), so the message passes through Twilio. Divina will only ever call the number you save here, never anyone else, and at most 12 times a day."
                    >
                      <PhoneSettings />
                    </Section>
                  )}
                  <Section title="Crypto" note="Prices come from CoinGecko with your own free key (data provided by CoinGecko).">
                    <CryptoSettings />
                  </Section>
                  <Section title="Weather & news">
                    <Row label="City" hint="Leave empty to use your browser location.">
                      <TextSetting k="DIVINA_CITY" placeholder="e.g. Glasgow" />
                    </Row>
                    <Row label="News topic">
                      <TextSetting k="DIVINA_NEWS_TOPIC" placeholder="AI" />
                    </Row>
                  </Section>
                  {WEB ? (
                    <>
                      <Section title="Calendar" note={`The file stays on ${IOS ? 'this iPhone' : 'this browser'}. To update it, choose a newer export.`}>
                        <Row label="Calendar file" hint="Google Calendar: Settings → Import & export → Export. Outlook: File → Save calendar.">
                          <CalendarFile />
                        </Row>
                      </Section>
                      {IOS ? (
                        <Section title="About">
                          <p className="text-[13px] leading-relaxed text-ink-mid">Divina for iPhone. Your settings, keys and notes stay on this iPhone, encrypted. Divina is for adults (18+). Replies are generated by AI and can be wrong.</p>
                          <p className="text-[12px] text-ink-lo">
                            <a className="underline" href="/terms.html">Terms</a> · <a className="underline" href="/privacy.html">Privacy</a> · <a className="underline" href="/licenses.txt">Open-source licences</a>
                          </p>
                        </Section>
                      ) : (
                      <Section title="Divina for Windows">
                        <p className="text-[13px] leading-relaxed text-ink-mid">
                          This is the free browser edition. Live stocks and sports, email, Instagram, projects and controlling your computer (apps, music, volume) come with Divina for Windows, also free (Mac and Linux coming soon).{' '}
                          {APP_SITE ? (
                            <a className="text-holo-hi underline" href={APP_SITE} target="_blank" rel="noopener">
                              Download it here
                            </a>
                          ) : null}
                        </p>
                        <p className="text-[12px] text-ink-lo">
                          Divina is for adults (18+). Replies are generated by AI and can be wrong.{' '}
                          <a className="underline" href="/terms.html" target="_blank" rel="noopener">Terms</a> ·{' '}
                          <a className="underline" href="/privacy.html" target="_blank" rel="noopener">Privacy</a> ·{' '}
                          <a className="underline" href={`${BASE_PATH}/licenses.txt`} target="_blank" rel="noopener">Open-source licences</a>
                        </p>
                        <p className="text-[12px] text-ink-lo">
                          Divina is free software under the{' '}
                          <a className="underline" href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">GNU AGPL v3</a>.{' '}
                          <a className="underline" href="https://github.com/divinadevosai/divina" target="_blank" rel="noopener">Source code</a>
                        </p>
                      </Section>
                      )}
                    </>
                  ) : (
                  <>
                  <Section title="Licence">
                    <LicenceSettings />
                  </Section>
                  <Section title="Accounts">
                    <Row label="Calendar" hint="Your calendar’s secret iCal address (Google: Settings → Integrate calendar).">
                      <TextSetting k="DIVINA_CALENDAR_ICS" placeholder="https://calendar.google.com/…/basic.ics" secret />
                    </Row>
                    <Row label="Instagram token" hint="IGAA… or EAA…">
                      <TextSetting k="INSTAGRAM_TOKEN" placeholder="IGAA…" secret />
                    </Row>
                    <Row label="Instagram account id" hint="Only for EAA… tokens.">
                      <TextSetting k="IG_BUSINESS_ACCOUNT_ID" placeholder="1784…" />
                    </Row>
                    <Row label="GitHub token" hint="Optional, for Projects.">
                      <TextSetting k="GITHUB_TOKEN" placeholder="ghp_…" secret />
                    </Row>
                  </Section>
                  <Section
                    title="Computer control"
                    note="For safety this is the one setting Divina can’t switch on from inside the page: add DIVINA_DESKTOP_BRIDGE=1 to .env.local and restart."
                  >
                    <div className="text-[14px] text-ink">
                      {!data.bridge.supported ? `Not available on ${data.bridge.platform}.` : data.bridge.enabled ? '● On — Divina can open apps, change volume and more.' : '○ Off'}
                    </div>
                  </Section>
                  </>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
