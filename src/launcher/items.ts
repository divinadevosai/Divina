/**
 * Launcher entries. Apps and websites share ONE list with modules, worlds
 * and commands; every entry carries a source tag.
 */
import { bus } from '@/core/bus';
import { MODULES } from '@/modules/meta';
import { WORLDS, WORLD_IDS } from '@/render/world/worlds';
import { useWorld } from '@/stores/world';
import { useSystem } from '@/stores/system';
import { useRing } from '@/stores/ring';
import { useData } from '@/stores/data';
import { tracker } from '@/gesture/tracker';
import { listener } from '@/ai/listen';
import { handle } from '@/ai/assistant';
import type { InstagramData } from '@/modules/types';
import { openSettings } from '@/lib/client/settings';
import { openMind } from '@/stores/mind';

export type Source = 'module' | 'app' | 'web' | 'world' | 'command' | 'mac' | 'ask';

export interface Item {
  id: string;
  title: string;
  source: Source;
  hint?: string;
  keywords?: string[];
  run(): void;
}

const SITES: [string, string][] = [
  ['GitHub', 'github.com'],
  ['YouTube', 'youtube.com'],
  ['Gmail', 'mail.google.com'],
  ['Google Calendar', 'calendar.google.com'],
  ['Hacker News', 'news.ycombinator.com'],
  ['X', 'x.com'],
  ['Linear', 'linear.app'],
  ['Figma', 'figma.com'],
  ['Notion', 'notion.so'],
  ['Instagram', 'instagram.com'],
  ['Wikipedia', 'wikipedia.org'],
  ['Google Drive', 'drive.google.com'],
];

const say = (t: string) => void handle(t, 'palette');

export function staticItems(): Item[] {
  const items: Item[] = [];
  for (const m of MODULES) {
    items.push({ id: `m:${m.id}`, title: m.title, source: 'module', hint: m.code, keywords: m.aliases, run: () => bus.emit({ type: 'open', module: m.id, source: 'palette' }) });
  }
  WORLD_IDS.forEach((w, i) => items.push({ id: `w:${w}`, title: WORLDS[w].name, source: 'world', hint: String(i + 1), run: () => bus.emit({ type: 'world', world: w, source: 'palette' }) }));
  const cmd = (id: string, title: string, run: () => void, hint?: string, keywords?: string[]): Item => ({ id: `c:${id}`, title, source: 'command', hint, keywords, run });
  items.push(
    cmd('human', 'Transform into human shape', () => bus.emit({ type: 'transform', to: 'human', source: 'palette' }), undefined, ['divina', 'body', 'figure']),
    cmd('spatial', 'Return to spatial mode', () => bus.emit({ type: 'transform', to: 'spatial', source: 'palette' }), undefined, ['ring', 'cards']),
    cmd('motion', 'Toggle motion (locked / drift)', () => useWorld.getState().setMotion(!useWorld.getState().motionOn), 'M', ['still', 'drift', 'lock']),
    cmd('settings', 'Settings', () => openSettings(), undefined, ['preferences', 'options', 'api key', 'voice', 'leagues', 'city', 'model']),
    cmd('mind', 'Open Divina’s mind', () => openMind(), undefined, ['brain', 'memory', 'knowledge', 'what she knows', 'skills']),
    cmd('hud', 'Toggle HUD', () => useSystem.getState().toggleHud(), 'H'),
    cmd('freeze', 'Freeze ring', () => bus.emit({ type: 'freeze', on: !useRing.getState().frozen, source: 'palette' }), 'F'),
    cmd('left', 'Rotate left', () => bus.emit({ type: 'rotate', steps: 1, source: 'palette' })),
    cmd('right', 'Rotate right', () => bus.emit({ type: 'rotate', steps: -1, source: 'palette' })),
    cmd('hands', 'Hand tracking on / off', () => (tracker.active ? tracker.stop() : void tracker.start()), undefined, ['camera', 'gesture', 'mediapipe']),
    cmd('voice', 'Voice on / off', () => (listener.active ? listener.stop() : listener.start()), 'Space', ['microphone', 'mic', 'speech']),
  );
  const mac = (id: string, title: string, phrase: string, keywords?: string[]): Item => ({ id: `x:${id}`, title, source: 'mac', keywords, run: () => say(phrase) });
  items.push(
    mac('shot', 'Take a screenshot', 'take a screenshot', ['capture', 'screen']),
    mac('hide', 'Hide other apps', 'hide others'),
    mac('lock', 'Lock screen', 'lock the screen'),
    mac('sleep', 'Sleep display', 'sleep the display'),
    mac('dndon', 'Do Not Disturb on', 'turn on do not disturb', ['focus']),
    mac('dndoff', 'Do Not Disturb off', 'turn off do not disturb', ['focus']),
    mac('play', 'Play / resume', 'play'),
    mac('pause', 'Pause', 'pause'),
    mac('next', 'Next track', 'next track'),
    mac('prev', 'Previous track', 'previous track'),
    mac('vup', 'Volume up', 'volume up'),
    mac('vdown', 'Volume down', 'volume down'),
    mac('mute', 'Mute', 'mute'),
    mac('clip', 'Read clipboard', 'what is on my clipboard'),
  );
  for (const [name, domain] of SITES) items.push({ id: `web:${domain}`, title: name, source: 'web', hint: domain, keywords: [domain], run: () => say(`open ${domain}`) });
  // personal destinations come from the live feed, never hardcoded
  const ig = useData.getState().modules.instagram;
  if (ig?.status === 'ok') {
    const d = (ig.data as InstagramData).destinations;
    items.push({ id: 'web:me', title: 'My Instagram profile', source: 'web', hint: new URL(d.profile).pathname, run: () => say('open my profile') });
    items.push({ id: 'web:reels', title: 'My reels', source: 'web', hint: new URL(d.reels).pathname, run: () => say('open my reels') });
    if (d.latest) items.push({ id: 'web:latest', title: 'My latest post', source: 'web', run: () => say('open my latest post') });
  }
  return items;
}

export function appItems(apps: string[]): Item[] {
  return apps.map((name) => ({ id: `app:${name}`, title: name, source: 'app' as const, run: () => say(`open ${name}`) }));
}

export function dynamicItems(query: string): Item[] {
  const q = query.trim();
  if (!q) return [];
  const out: Item[] = [];
  const bare = q.replace(/\s+/g, '');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(bare) || /^https?:\/\//i.test(q)) out.push({ id: `url:${bare}`, title: `Open ${bare}`, source: 'web', run: () => say(`open ${bare}`) });
  out.push({ id: 'ask', title: `Ask DIVINA: “${q}”`, source: 'ask', run: () => say(q) });
  return out;
}
