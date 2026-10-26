/**
 * Typed action bus. Input sources (hands, mouse, keyboard, voice, palette)
 * publish intents; the ring, the assistant and the bridge subscribe. No input
 * layer imports a renderer and no renderer imports an input layer.
 */
import type { ModuleId } from '@/modules/ids';
import type { WorldId } from '@/render/world/worlds';

export type Intent =
  | { type: 'rotate'; steps: number; source: InputSource }
  | { type: 'rotate-continuous'; delta: number; source: InputSource }
  | { type: 'open'; module: ModuleId; source: InputSource }
  | { type: 'collapse'; source: InputSource }
  | { type: 'grab'; module: ModuleId; source: InputSource }
  | { type: 'release'; source: InputSource }
  | { type: 'freeze'; on: boolean; source: InputSource }
  | { type: 'wake'; source: InputSource }
  | { type: 'zoom'; factor: number; source: InputSource }
  | { type: 'spread'; amount: number; source: InputSource }
  | { type: 'multi-select'; module: ModuleId; source: InputSource }
  | { type: 'world'; world: WorldId; source: InputSource }
  | { type: 'transform'; to: 'human' | 'spatial'; source: InputSource }
  | { type: 'present'; module: ModuleId; source: InputSource }
  | { type: 'deliberate'; source: InputSource };

export type InputSource = 'hand' | 'mouse' | 'keyboard' | 'voice' | 'palette' | 'ai' | 'system';

type Handler = (i: Intent) => void;
const handlers = new Set<Handler>();

export const bus = {
  emit(intent: Intent) {
    // A deliberate input always cancels an in-flight cinematic sequence.
    if (intent.type !== 'deliberate' && intent.source !== 'system' && intent.source !== 'ai') {
      for (const h of handlers) h({ type: 'deliberate', source: intent.source });
    }
    for (const h of handlers) h(intent);
  },
  on(h: Handler) {
    handlers.add(h);
    return () => {
      handlers.delete(h);
    };
  },
};
