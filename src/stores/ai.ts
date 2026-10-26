import { create } from 'zustand';

export type AIStatus = 'idle' | 'listening' | 'thinking' | 'streaming' | 'speaking' | 'interrupted' | 'offline';

export interface Turn {
  role: 'user' | 'model';
  text: string;
  at: number;
  /** tool calls the model made in this turn, recorded for context */
  calls?: { name: string; args: Record<string, unknown> }[];
}

interface AIState {
  status: AIStatus;
  online: boolean;
  /** which AI company answers (gemini | claude | openai), when one is connected */
  provider: string | null;
  awake: boolean;
  micOn: boolean;
  /** live partial transcript */
  hearing: string;
  /** response text currently streaming / last response */
  response: string;
  history: Turn[];
  setStatus(s: AIStatus): void;
  setOnline(v: boolean): void;
  setAwake(v: boolean): void;
  setMic(v: boolean): void;
  setHearing(t: string): void;
  setResponse(t: string): void;
  push(t: Turn): void;
}

export const useAI = create<AIState>((set, get) => ({
  status: 'idle',
  online: false,
  provider: null,
  awake: false,
  micOn: false,
  hearing: '',
  response: '',
  history: [],
  setStatus: (status) => get().status !== status && set({ status }),
  setOnline: (online) => set({ online }),
  setAwake: (awake) => set({ awake }),
  setMic: (micOn) => set({ micOn }),
  setHearing: (hearing) => set({ hearing }),
  setResponse: (response) => set({ response }),
  push: (t) => set((s) => ({ history: [...s.history.slice(-40), t] })),
}));
