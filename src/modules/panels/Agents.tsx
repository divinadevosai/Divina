'use client';
/**
 * Your own agents: assistants with their own instructions, and optionally
 * their own AI and voice. They use your keys and Divina's safety rules.
 */
import { useEffect, useState } from 'react';
import type { AgentsData } from '../types';
import { Section } from './kit';
import { agentsOp } from '@/lib/client/personal';
import { AGENT_TEMPLATES, MAX_AGENTS, MAX_INSTRUCTIONS, type Agent, type AgentProvider } from '@/lib/personal';
import { usePrefs } from '@/stores/prefs';
import { switchAgent } from '@/ai/assistant';
import { loadSettings, useSettings } from '@/lib/client/settings';
import { OPENAI_VOICES } from '@/lib/settingsSchema';
import { VOICES } from '@/hud/SettingsPanel';

const input = 'w-full rounded-lg border border-ink-faint bg-black/20 px-3 py-2 text-[14px] text-ink placeholder:text-ink-lo focus:border-holo/60 focus:outline-none';
const button = 'rounded-lg border border-holo/50 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-holo-hi hover:bg-holo/10 disabled:opacity-40';
const quiet = `${button} !border-ink-faint !text-ink-mid`;

type Draft = Omit<Agent, 'id' | 'at'> & { id?: string };
const EMPTY: Draft = { name: '', instructions: '', provider: '', model: '', voice: '' };

const AI_LABEL: Record<string, string> = { '': 'Same as Divina', gemini: 'Google Gemini', claude: 'Anthropic Claude', openai: 'OpenAI (ChatGPT)' };
const KEY_FOR: Record<string, 'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY'> = { gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };
const MODEL_HINT: Record<string, string> = { '': 'Divina’s model', gemini: 'e.g. gemini-3.8-flash', claude: 'e.g. claude-sonnet-5-5', openai: 'e.g. gpt-6-luna' };

export function AgentsPanel({ d }: { d: AgentsData; hue: number }) {
  const active = usePrefs((s) => s.agent);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const remove = async (a: Agent) => {
    if (!window.confirm(`Delete ${a.name}? This can’t be undone.`)) return;
    const r = await agentsOp({ op: 'remove', id: a.id });
    if (r.ok && active === a.id) switchAgent(null);
    setMsg(r.message ?? null);
  };

  if (draft) return <Editor draft={draft} onDone={(m) => (setDraft(null), setMsg(m))} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-ink-mid">
          Talking to <span className="text-ink">{d.agents.find((a) => a.id === active)?.name ?? 'Divina'}</span>
        </p>
        {active && (
          <button className={quiet} onClick={() => switchAgent(null)}>
            back to divina
          </button>
        )}
      </div>
      {msg && <p className="text-[12px] text-holo-hi">{msg}</p>}
      <Section title={`your agents · ${d.agents.length} of ${MAX_AGENTS}`}>
        {d.agents.length ? (
          <ul className="space-y-2">
            {d.agents.map((a) => (
              <li key={a.id} className="rounded-xl border border-ink-faint p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16px] text-ink">{a.name}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-lo">{a.instructions}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">{AI_LABEL[a.provider]}{a.model ? ` · ${a.model}` : ''}</div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {active === a.id ? (
                      <span className="rounded-lg border border-holo/60 bg-holo/15 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink">talking</span>
                    ) : (
                      <button className={button} onClick={() => switchAgent(a.id)}>
                        talk
                      </button>
                    )}
                    <button className={quiet} onClick={() => setDraft({ ...a })}>
                      edit
                    </button>
                    <button className={`${quiet} !text-ink-lo`} onClick={() => void remove(a)}>
                      delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-ink-mid">No agents yet. Start from one below, or make your own.</p>
        )}
      </Section>
      {d.agents.length < MAX_AGENTS && (
        <Section title="new agent">
          <div className="flex flex-wrap gap-2">
            <button className={button} onClick={() => setDraft({ ...EMPTY })}>
              + make your own
            </button>
            {AGENT_TEMPLATES.filter((t) => !d.agents.some((a) => a.name === t.name)).map((t) => (
              <button key={t.name} className={quiet} onClick={() => setDraft({ ...t })}>
                {t.name}
              </button>
            ))}
          </div>
        </Section>
      )}
      <p className="text-[12px] leading-relaxed text-ink-lo">
        Say “talk to Coach”, “ask Chef what to cook tonight”, or “back to Divina”. Agents use your own AI keys and the same safety rules as Divina: anything on your computer still asks you first. Their replies are written by AI and can be wrong.
      </p>
    </div>
  );
}

function Editor({ draft, onDone }: { draft: Draft; onDone: (msg: string | null) => void }) {
  const [a, setA] = useState<Draft>(draft);
  const [err, setErr] = useState<string | null>(null);
  const st = useSettings((x) => x.data?.settings);
  useEffect(() => {
    if (!st) void loadSettings();
  }, [st]);
  const tts = (st?.DIVINA_TTS_PROVIDER?.value as string | undefined) ?? 'gemini';
  const needsKey = a.provider && st && !st[KEY_FOR[a.provider]]?.set;
  const voices: string[] = tts === 'openai' ? [...OPENAI_VOICES] : tts === 'gemini' ? VOICES : [];

  const save = async () => {
    const r = await agentsOp({ op: 'save', agent: a });
    if (!r.ok) return setErr(r.message ?? 'Couldn’t save the agent.');
    onDone(r.message ?? null);
  };
  const set = (p: Partial<Draft>) => setA((x) => ({ ...x, ...p }));

  return (
    <div className="space-y-4">
      <h3 className="text-[18px] text-ink">{a.id ? `Edit ${draft.name}` : 'New agent'}</h3>
      <label className="block space-y-1">
        <span className="hud-label">name</span>
        <input className={input} value={a.name} maxLength={24} placeholder="e.g. Coach" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className="hud-label">what it’s for and how it should talk</span>
        <textarea
          className={`${input} min-h-[140px] resize-y leading-relaxed`}
          value={a.instructions}
          maxLength={MAX_INSTRUCTIONS}
          placeholder="e.g. You are my fitness coach. Keep it short and motivating, and suggest 10-minute workouts."
          onChange={(e) => set({ instructions: e.target.value })}
        />
        <span className="block text-right font-mono text-[10px] text-ink-lo">
          {a.instructions.length} / {MAX_INSTRUCTIONS}
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="hud-label">ai</span>
          <select className={input} value={a.provider} onChange={(e) => set({ provider: e.target.value as AgentProvider, model: '' })}>
            {Object.entries(AI_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="hud-label">model (optional)</span>
          <input className={input} value={a.model} placeholder={MODEL_HINT[a.provider]} onChange={(e) => set({ model: e.target.value.trim() })} />
        </label>
      </div>
      {needsKey && <p className="text-[12px] text-warn">No {AI_LABEL[a.provider]} key saved yet: add it in ⚙ Settings → AI, or this agent will use Divina’s AI.</p>}
      <label className="block space-y-1">
        <span className="hud-label">voice (optional)</span>
        {voices.length ? (
          <select className={input} value={a.voice} onChange={(e) => set({ voice: e.target.value })}>
            <option value="">Same as Divina</option>
            {voices.map((v) => (
              <option key={v} value={v}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        ) : (
          <input className={input} value={a.voice} placeholder="ElevenLabs voice id (or leave empty)" onChange={(e) => set({ voice: e.target.value.trim() })} />
        )}
        <span className="block text-[11.5px] text-ink-lo">Voices from your natural-voice service in Settings. Only use voices you have the right to use.</span>
      </label>
      {err && <p className="text-[12px] text-warn">{err}</p>}
      <div className="flex gap-2">
        <button className={button} onClick={() => void save()} disabled={!a.name.trim() || !a.instructions.trim()}>
          save
        </button>
        <button className={quiet} onClick={() => onDone(null)}>
          cancel
        </button>
      </div>
    </div>
  );
}
