/**
 * Settings from the in-app panel (and from voice). Saving applies at once:
 * the affected cards refetch and the voice picks up its new mode.
 */
import { create } from 'zustand';
import { refresh } from '@/modules/feeds';
import type { ModuleId } from '@/modules/ids';
import { useAI } from '@/stores/ai';
import { voice } from '@/ai/tts';
import { log } from '@/stores/system';

export type { SettingKey, PublicSetting } from '@/lib/settingsSchema';
import type { SettingKey, PublicSetting } from '@/lib/settingsSchema';

export interface SettingsState {
  settings: Record<SettingKey, PublicSetting>;
  bridge: { enabled: boolean; platform: string; supported: boolean };
}

interface Store {
  open: boolean;
  data: SettingsState | null;
  error: string | null;
  setOpen(v: boolean): void;
}

export const useSettings = create<Store>((set) => ({ open: false, data: null, error: null, setOpen: (open) => set({ open }) }));
export const openSettings = () => useSettings.getState().setOpen(true);

const HEADERS = { 'content-type': 'application/json', 'x-divina-bridge': '1' };

export async function loadSettings(): Promise<SettingsState | null> {
  try {
    const r = await fetch('/api/settings', { headers: HEADERS, cache: 'no-store' });
    const j = (await r.json()) as { ok: boolean; message?: string } & SettingsState;
    if (!j.ok) throw new Error(j.message ?? `HTTP ${r.status}`);
    useSettings.setState({ data: { settings: j.settings, bridge: j.bridge }, error: null });
    return j;
  } catch (err) {
    useSettings.setState({ error: (err as Error).message });
    return null;
  }
}

/** Which cards to refetch when a setting changes. */
const AFFECTS: Partial<Record<SettingKey, ModuleId[]>> = {
  DIVINA_LEAGUE: ['sports'],
  DIVINA_UNOFFICIAL_FEEDS: ['sports', 'stocks'],
  DIVINA_EMAIL_ADDRESS: ['email'],
  DIVINA_EMAIL_PASSWORD: ['email'],
  DIVINA_EMAIL_HOST: ['email'],
  DIVINA_COINGECKO_KEY: ['crypto'],
  DIVINA_CRYPTO: ['crypto'],
  DIVINA_CRYPTO_CURRENCY: ['crypto'],
  DIVINA_CITY: ['weather'],
  DIVINA_NEWS_TOPIC: ['news'],
  DIVINA_CALENDAR_ICS: ['calendar'],
  INSTAGRAM_TOKEN: ['instagram'],
  IG_BUSINESS_ACCOUNT_ID: ['instagram'],
  GITHUB_TOKEN: ['projects'],
  GEMINI_API_KEY: ['ai', 'news'],
  GEMINI_MODEL: ['ai'],
  DIVINA_AI_PROVIDER: ['ai', 'news'],
  ANTHROPIC_API_KEY: ['ai', 'news'],
  ANTHROPIC_MODEL: ['ai'],
  OPENAI_API_KEY: ['ai', 'news'],
  OPENAI_MODEL: ['ai'],
  DIVINA_TTS_PROVIDER: ['ai'],
  ELEVENLABS_API_KEY: ['ai'],
  ELEVENLABS_MODEL: ['ai'],
};

/** Ask the server what the voice and model are now, and follow it. */
export async function syncAIStatus() {
  try {
    const j = (await (await fetch('/api/ai', { cache: 'no-store' })).json()) as { online: boolean; model: string; studioVoice?: boolean; provider?: string | null };
    const ai = useAI.getState();
    ai.setOnline(j.online);
    useAI.setState({ provider: j.provider ?? null });
    voice.studio = j.studioVoice ?? j.online;
    if (!j.online) ai.setStatus('offline');
    else if (ai.status === 'offline') ai.setStatus('idle');
  } catch {
    /* server unreachable; the next request will say so */
  }
}

export async function saveSettings(patch: Partial<Record<SettingKey, string>>): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await fetch('/api/settings', { method: 'POST', headers: HEADERS, body: JSON.stringify(patch) });
    const j = (await r.json()) as { ok: boolean; message?: string } & SettingsState;
    if (!j.ok) return { ok: false, message: j.message ?? `HTTP ${r.status}` };
    useSettings.setState({ data: { settings: j.settings, bridge: j.bridge }, error: null });
    const cards = new Set<ModuleId>();
    for (const k of Object.keys(patch) as SettingKey[]) for (const m of AFFECTS[k] ?? []) cards.add(m);
    for (const m of cards) void refresh(m);
    await syncAIStatus();
    log('ok', `settings saved · ${Object.keys(patch).map((k) => k.replace(/^(DIVINA_|GEMINI_|ANTHROPIC_|OPENAI_|ELEVENLABS_)/, '').toLowerCase()).join(', ')}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
