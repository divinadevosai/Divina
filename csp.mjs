// Content-Security-Policy for Divina, shared by next.config.ts (the app,
// served by its own server) and scripts/build-web.mjs (the browser edition,
// whose headers go in the `_headers` file a static host serves).
//
// Scripts only ever come from Divina itself: no CDN, no third party. The
// browser edition goes further and allows only the exact inline scripts it
// ships (by hash), because a visitor's own API key lives in that page.

/** @param {{ dev?: boolean, web?: boolean, scriptHashes?: string[] }} o */
export function csp({ dev = false, web = false, scriptHashes = [] } = {}) {
  const inline = web && scriptHashes.length ? scriptHashes.map((h) => `'${h}'`).join(' ') : "'unsafe-inline'";
  // the browser edition talks to its data sources, the AI and the voice directly
  const direct = web ? ' https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com https://api.elevenlabs.io https://api.met.no https://nominatim.openstreetmap.org https://hn.algolia.com https://api.coingecko.com' : '';
  return [
    "default-src 'self'",
    `script-src 'self' ${inline} 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // the app shows Instagram thumbnails and project media; the browser edition shows none
    web ? "img-src 'self' data: blob:" : "img-src 'self' data: blob: https:",
    web ? "media-src 'self' blob:" : "media-src 'self' blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${direct}${dev ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  // No other site may frame Divina (it could trick a click on "Allow").
  'X-Frame-Options': 'DENY',
};
