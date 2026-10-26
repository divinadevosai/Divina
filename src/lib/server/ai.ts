import 'server-only';
import { setting } from './settings';
import { makeAI } from '@/lib/ai/providers';

/** The AI and voice the person picked in Settings, with their own keys. */
export const ai = makeAI(setting);
