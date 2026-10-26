/**
 * Which AI answers and which voice speaks, shared by the app's server and the
 * browser edition. The person picks each in Settings; if the picked one has
 * no key, the first one that does is used instead.
 */
import { checkSetting, type SettingKey } from '@/lib/settingsSchema';
import type { Agent } from '@/lib/personal';
import { makeGemini } from './gemini';
import { makeClaude } from './claude';
import { makeOpenAI } from './openai';
import { makeElevenLabs, type Voice } from './elevenlabs';
import { chatRequest, divinaStream, translateStream, type ChatBody, type Send } from './chat';

export type AIProvider = 'gemini' | 'claude' | 'openai';
export type VoiceProvider = 'gemini' | 'openai' | 'elevenlabs';

export const AI_NAMES: Record<AIProvider, string> = { gemini: 'Google Gemini', claude: 'Anthropic Claude', openai: 'OpenAI' };
export const VOICE_NAMES: Record<VoiceProvider, string> = { gemini: 'Google Gemini', openai: 'OpenAI', elevenlabs: 'ElevenLabs' };

/**
 * Settings as an agent sees them: its own AI, model and voice where it has
 * one, Divina's for the rest. Keys always stay the person's own.
 */
export function agentSettings(setting: (key: SettingKey) => string | undefined, agent: Pick<Agent, 'provider' | 'model' | 'voice'>) {
  const over: Partial<Record<SettingKey, string>> = {};
  if (agent.provider) over.DIVINA_AI_PROVIDER = agent.provider;
  const provider = agent.provider || setting('DIVINA_AI_PROVIDER') || 'gemini';
  if (agent.model) over[provider === 'claude' ? 'ANTHROPIC_MODEL' : provider === 'openai' ? 'OPENAI_MODEL' : 'GEMINI_MODEL'] = agent.model;
  if (agent.voice) {
    const tts = setting('DIVINA_TTS_PROVIDER') || 'gemini';
    const key: SettingKey = tts === 'openai' ? 'OPENAI_TTS_VOICE' : tts === 'elevenlabs' ? 'ELEVENLABS_VOICE' : 'GEMINI_VOICE';
    if (checkSetting(key, agent.voice) === null) over[key] = agent.voice; // a voice from another service is ignored
  }
  return (key: SettingKey) => (key in over ? over[key] : setting(key));
}

export function makeAI(setting: (key: SettingKey) => string | undefined, opts: { browser?: boolean; fetcher?: typeof fetch } = {}) {
  const gemini = makeGemini(setting);
  const claude = makeClaude(setting, opts);
  const openai = makeOpenAI(setting, opts.fetcher);
  const eleven = makeElevenLabs(setting, opts.fetcher);

  const has: Record<AIProvider, () => boolean> = { gemini: gemini.geminiConfigured, claude: claude.configured, openai: openai.configured };
  const voiceHas: Record<VoiceProvider, () => boolean> = { gemini: gemini.geminiConfigured, openai: openai.configured, elevenlabs: eleven.configured };

  function provider(): AIProvider | null {
    const picked = setting('DIVINA_AI_PROVIDER') as AIProvider | undefined;
    if (picked && has[picked]?.()) return picked;
    return (['gemini', 'claude', 'openai'] as const).find((p) => has[p]()) ?? null;
  }
  function voiceProvider(): VoiceProvider | null {
    const picked = setting('DIVINA_TTS_PROVIDER') as VoiceProvider | undefined;
    if (picked && voiceHas[picked]?.()) return picked;
    // the same company as the AI, if it has voices; else whoever has a key
    const ai = provider();
    if (ai && ai !== 'claude' && voiceHas[ai]()) return ai;
    return (['gemini', 'openai', 'elevenlabs'] as const).find((p) => voiceHas[p]()) ?? null;
  }

  const configured = () => provider() !== null;
  const model = (): string | null => {
    const p = provider();
    return p === 'gemini' ? gemini.GEMINI_MODEL() : p === 'claude' ? claude.model() : p === 'openai' ? openai.model() : null;
  };
  const voiceModel = (): string | null => {
    const v = voiceProvider();
    return v === 'gemini' ? gemini.GEMINI_TTS_MODEL() : v === 'openai' ? 'gpt-4o-mini-tts' : v === 'elevenlabs' ? eleven.model() : null;
  };
  /** "Anthropic Claude · claude-opus-5-5", for the AI card. */
  const label = () => {
    const p = provider();
    return p ? `${AI_NAMES[p]} · ${model()}` : null;
  };

  /** One turn as Divina's SSE stream. */
  async function chat(body: ChatBody, edition: 'app' | 'browser', signal: AbortSignal, redact?: (s: string) => string): Promise<ReadableStream<Uint8Array>> {
    const p = provider();
    if (p === 'gemini') {
      try {
        return translateStream(await gemini.geminiStream(chatRequest(body, edition), signal), signal, redact);
      } catch (err) {
        if (signal.aborted) throw err;
        return divinaStream(async (send) => send('error', { message: `I couldn’t reach Google Gemini. Check your internet connection.` }), signal);
      }
    }
    const run = p === 'claude' ? claude.chat : openai.chat;
    return divinaStream((send: Send) => run(body, edition, signal, send), signal, redact);
  }

  /** A short plain answer (the news digest). */
  function text(prompt: string): Promise<string> {
    const p = provider();
    if (p === 'claude') return claude.text(prompt);
    if (p === 'openai') return openai.text(prompt);
    return gemini.geminiText(prompt);
  }

  const speechConfigured = () => voiceProvider() !== null;
  function speech(t: string): Promise<{ pcm: Uint8Array; sampleRate: number }> {
    const v = voiceProvider();
    if (v === 'elevenlabs') return eleven.speech(t);
    if (v === 'openai') return openai.speech(t);
    return gemini.geminiSpeech(t);
  }

  const voices = (): Promise<Voice[]> => eleven.voices();

  return { provider, voiceProvider, configured, model, voiceModel, label, chat, text, speechConfigured, speech, voices, elevenConfigured: eleven.configured };
}

/** Where to get a key, for the "not connected" messages. */
export const ADD_KEY = 'Add your own API key for Gemini, Claude or OpenAI in ⚙ Settings → AI';
