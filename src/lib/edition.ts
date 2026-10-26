/**
 * Which Divina this build is. `app`: the Windows/Mac app with its local
 * server. `web`: the free browser edition, a static site with no server —
 * see src/web/backend.ts. Set at build time (scripts/build-web.mjs).
 */
export const WEB = process.env.NEXT_PUBLIC_DIVINA_EDITION === 'web';

/** The iPhone app: the browser edition inside an App Store app (scripts/build-ios.mjs). */
export const IOS = process.env.NEXT_PUBLIC_DIVINA_PLATFORM === 'ios';

/** The browser extension: the browser edition as every new tab (scripts/build-extension.mjs). */
export const EXTENSION = process.env.NEXT_PUBLIC_DIVINA_PLATFORM === 'extension';

/** Where the site is served from: '' for the app, '/app' when the browser edition sits inside the landing site. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Where people get the desktop app (the download page), if configured. */
export const APP_SITE = process.env.NEXT_PUBLIC_DIVINA_SITE ?? '';

const host = APP_SITE.replace(/^https?:\/\//, '').replace(/[#?].*$/, '').replace(/\/$/, '');
const where = APP_SITE ? `Free to download at ${host}.` : 'Free to download for Windows.';

/** Card text for something only the app does: "<what> with Divina for Windows. Free to download at …" */
export const inFullApp = (what: string) => (IOS ? `${what} with Divina for Windows.` : `${what} with Divina for Windows (Mac and Linux coming soon). ${where}`);

export const FULL_APP_NOTE = IOS
  ? 'That isn’t something the iPhone app can do.'
  : `That’s part of Divina for Windows, free${APP_SITE ? ` at ${host}` : ''} (Mac and Linux coming soon).`;
