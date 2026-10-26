'use client';
/**
 * Cookies and device storage (UK PECR / EU ePrivacy, UK and EU GDPR).
 *
 * Divina sets no cookies, has no analytics, ads or trackers, and loads
 * nothing from anyone else. It does keep things on the device:
 *   - essential: what you asked it to keep (settings, your keys, notes…),
 *     always encrypted where personal, and the record of your choice here
 *   - preferences: conveniences such as your language, that you've seen the
 *     tour, hand tracking left on, a city's map position. Kept on the device
 *     only if you allow it; otherwise only until you close the tab.
 * Everything is listed in Settings → Privacy & cookies, where it can also be
 * changed or deleted.
 *
 * The new-tab extension keeps one more thing as essential: that you've seen
 * the tour. Every new tab is a fresh visit, so without it the tour would open
 * on every tab, and the new tab you installed couldn't be used.
 */
import { create } from 'zustand';

export type Choice = 'all' | 'essential';
const KEY = 'divina.cookies';

/** The preference keys (and prefixes) that depend on the choice. */
const EXTENSION = process.env.NEXT_PUBLIC_DIVINA_PLATFORM === 'extension';
const OPTIONAL = ['divina.prefs', ...(EXTENSION ? [] : ['divina.tour.done']), 'divina.hands'];
const OPTIONAL_PREFIX = ['divina.geo.'];
const isOptional = (k: string) => OPTIONAL.includes(k) || OPTIONAL_PREFIX.some((p) => k.startsWith(p));

function readChoice(): Choice | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { choice?: unknown } | null;
    return v?.choice === 'all' || v?.choice === 'essential' ? v.choice : null;
  } catch {
    return null;
  }
}

export const useConsent = create<{ choice: Choice | null; manage: boolean }>(() => ({ choice: null, manage: false }));
export const loadConsent = () => useConsent.setState({ choice: readChoice() });
export const consentChoice = () => useConsent.getState().choice ?? readChoice();

const keys = (s: Storage) => Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => !!k);

/** Record the choice and move the preference items to match it. */
export function setConsent(choice: Choice) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ choice, at: new Date().toISOString(), v: 1 }));
    const [from, to] = choice === 'all' ? [sessionStorage, localStorage] : [localStorage, sessionStorage];
    for (const k of keys(from).filter(isOptional)) {
      const v = from.getItem(k);
      if (v !== null) to.setItem(k, v);
      from.removeItem(k);
    }
  } catch {
    /* storage unavailable: nothing is kept anyway */
  }
  useConsent.setState({ choice, manage: false });
}

/** Where an item may live right now: essential ones always on the device, preferences only if allowed. */
function prefArea(key: string): Storage {
  return !isOptional(key) || consentChoice() === 'all' ? localStorage : sessionStorage;
}

/** Storage for preference items: on the device if allowed, else for this visit only. */
export const prefStorage = {
  get(key: string): string | null {
    try {
      return prefArea(key).getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      prefArea(key).setItem(key, value);
    } catch {
      /* storage unavailable: lasts for this visit */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* nothing to remove */
    }
  },
};

/** What Divina keeps on this device, for the Privacy & cookies list. */
export const STORED: { what: string; why: string; kind: 'essential' | 'preference' }[] = [
  { what: 'Your settings and API keys', why: 'So Divina works the way you set it up. Keys are encrypted.', kind: 'essential' },
  { what: 'An encryption key, locked inside this device', why: 'Locks your keys and personal things. It can’t be read out or copied.', kind: 'essential' },
  { what: 'Notes, agents, memory, routines and worlds', why: 'The things you asked Divina to keep. Encrypted.', kind: 'essential' },
  { what: 'Your calendar file and timers', why: 'Only if you add them.', kind: 'essential' },
  { what: 'Your choice on this page', why: 'So Divina doesn’t ask again.', kind: 'essential' },
  { what: 'Language, voice and display preferences', why: 'Remembered between visits if you allow preferences.', kind: 'preference' },
  ...(EXTENSION
    ? [
        { what: 'That you’ve seen the tour', why: 'So the tour doesn’t open on every new tab.', kind: 'essential' as const },
        { what: 'Hand tracking left on', why: 'Remembered between visits if you allow preferences.', kind: 'preference' as const },
      ]
    : [{ what: 'That you’ve seen the tour, hand tracking left on', why: 'Remembered between visits if you allow preferences.', kind: 'preference' as const }]),
  { what: 'The map position of the city you typed', why: 'Saves looking it up again. Remembered if you allow preferences.', kind: 'preference' },
];

/** Forget everything Divina keeps in this browser (the page reloads after). */
export async function eraseBrowserData() {
  try {
    for (const s of [localStorage, sessionStorage]) for (const k of keys(s).filter((k) => k.startsWith('divina'))) s.removeItem(k);
  } catch {
    /* nothing stored */
  }
  await new Promise<void>((resolve) => {
    try {
      const r = indexedDB.deleteDatabase('divina-vault');
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
