'use client';
/**
 * Phone-sized screens (or a very short window): the HUD simplifies, panels
 * become bottom sheets and Settings stacks its rows.
 */
import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 700px), (max-height: 500px)';

function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export const isCompact = () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches;

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompact, () => false);
}
