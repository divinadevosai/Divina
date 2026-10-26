/**
 * The command. Matched locally, acted on immediately: the beat between the
 * words and the room beginning to dim is a breath, not a network round-trip.
 * Both sides are recorded into the model's history so a later "why did you
 * do that" has something to refer to.
 */
import { clock } from '@/core/clock/masterClock';
import { audio } from '@/audio/engine';
import { log } from '@/stores/system';
import type { InputSource } from '@/core/bus';

type Speak = (text: string) => void;
type Record = (user: string | null, model: string) => void;

let speak: Speak = () => {};
let record: Record = () => {};
const captureHooks = new Set<() => boolean>();

export function setEmbodimentVoice(s: Speak, r: Record) {
  speak = s;
  record = r;
}

/** Registered by the embodiment renderer; returns false if not ready yet. */
export function onCapture(fn: () => boolean) {
  captureHooks.add(fn);
  return () => void captureHooks.delete(fn);
}

const HUMAN = /\b(transform|turn|change|become|switch)\b.*\b(human|humanoid|person|body|figure)\b(\s+(shape|form|mode))?/i;
const SPATIAL = /\b(return|go back|back|switch|revert|transform)\b.*\b(spatial|ring|cards|normal)\b(\s+mode)?/i;

/** Local phrase matcher. The model keeps transform_form for misses. */
export function matchTransform(text: string): 'human' | 'spatial' | null {
  if (HUMAN.test(text)) return 'human';
  if (SPATIAL.test(text)) return 'spatial';
  return null;
}

export const LINES = {
  command: 'Understood. Give me a moment.',
  arrived: ['I’m here.', 'How can I help?'] as const,
  returning: 'Returning to spatial mode.',
};

let pendingUtterance: string | null = null;

export function transformTo(to: 'human' | 'spatial', source: InputSource, utterance?: string) {
  if (to === 'human') {
    if (clock.embodyPhase === 'HUMANOID_ACTIVE' || (clock.embodied && clock.embodyPhase !== 'RETURNING')) return false;
    // A reversal mid-return keeps the particles already in flight.
    if (clock.embodyT === 0) {
      for (const h of captureHooks) {
        if (!h()) {
          log('info', 'figure not baked yet — baking now, the transformation follows');
          speak('One moment — getting ready.');
          return false;
        }
      }
    }
    clock.transform('human');
    audio.play('transform');
    speak(LINES.command);
    record(utterance ?? (source === 'voice' ? null : '[transform requested]'), LINES.command);
    pendingUtterance = utterance ?? null;
    log('info', `transform → human · ${source}`);
    return true;
  }
  if (!clock.embodied || clock.embodyPhase === 'RETURNING') return false;
  clock.transform('spatial');
  audio.play('transform');
  speak(LINES.returning);
  record(utterance ?? null, LINES.returning);
  log('info', `transform → spatial · ${source}`);
  return true;
}

let arrivedTimer: number | undefined;
if (typeof window !== 'undefined') {
  clock.onPhase(() => {
    if (clock.embodyPhase === 'HUMANOID_ACTIVE') {
      speak(LINES.arrived[0]);
      window.clearTimeout(arrivedTimer);
      arrivedTimer = window.setTimeout(() => {
        if (clock.embodyPhase === 'HUMANOID_ACTIVE') speak(LINES.arrived[1]);
      }, 1400);
      pendingUtterance = null;
    }
  });
}
export { pendingUtterance };
