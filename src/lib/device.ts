/**
 * Phones and tablets: a touch screen as the main pointer. Their browsers
 * give a web page far less graphics memory than a computer's, even when the
 * chip is fast (an iPhone reports "Apple GPU", like a Mac), so Divina draws
 * the room lighter there.
 */
export function isPhone(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod|Android.*Mobile|Mobile Safari/i.test(ua)) return true;
  // iPads (and big Android tablets) say they're desktops; a coarse pointer and no hover gives them away
  const coarse = window.matchMedia?.('(pointer: coarse) and (hover: none)').matches ?? false;
  return coarse && (/iPad|Macintosh|Android/i.test(ua) || Math.min(screen.width, screen.height) < 900);
}

export const isIOS = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

/** Set when a phone's browser took the 3D view away; the page then starts in the simple view. */
const FLAT_KEY = 'divina.flat';
export function preferFlat(): boolean {
  try {
    return sessionStorage.getItem(FLAT_KEY) === '1' || new URLSearchParams(location.search).get('view') === 'simple';
  } catch {
    return false;
  }
}
export function rememberFlat(on: boolean) {
  try {
    if (on) sessionStorage.setItem(FLAT_KEY, '1');
    else sessionStorage.removeItem(FLAT_KEY);
  } catch {
    /* storage unavailable */
  }
}
