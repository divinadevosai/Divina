import type { NextConfig } from 'next';
import { csp, SECURITY_HEADERS } from './csp.mjs';

const dev = process.env.NODE_ENV !== 'production';
// The free browser edition: a static site with no server (scripts/build-web.mjs).
const web = process.env.DIVINA_EDITION === 'web';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_DIVINA_EDITION: web ? 'web' : 'app', NEXT_PUBLIC_DIVINA_SITE: process.env.DIVINA_SITE ?? '', NEXT_PUBLIC_BASE_PATH: web ? (process.env.DIVINA_BASE_PATH ?? '') : '', NEXT_PUBLIC_DIVINA_PLATFORM: web ? (process.env.DIVINA_PLATFORM ?? '') : '', DIVINA_REQUIRE_LICENCE: web ? '' : (process.env.DIVINA_REQUIRE_LICENCE ?? ''), DIVINA_LS_STORE_ID: web ? '' : (process.env.DIVINA_LS_STORE_ID ?? ''), DIVINA_LS_PRODUCT_IDS: web ? '' : (process.env.DIVINA_LS_PRODUCT_IDS ?? '') },
  // The Windows installer ships a self-contained server (scripts/build-windows.mjs).
  ...(process.env.DIVINA_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  ...(web
    ? {
        output: 'export' as const,
        basePath: process.env.DIVINA_BASE_PATH || undefined,
        distDir: 'out',
        // Only .tsx pages: the .ts API routes and middleware belong to the app's server.
        pageExtensions: ['tsx', 'js'],
        images: { unoptimized: true },
      }
    : {
        // The desktop bridge shells out with execFile; keep it server-only.
        // imapflow loads encodings dynamically: require it at run time rather than bundle it.
        serverExternalPackages: ['imapflow'],
        async headers() {
          return [
            {
              source: '/(.*)',
              headers: [...Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })), { key: 'Content-Security-Policy', value: csp({ dev }) }],
            },
          ];
        },
      }),
};

export default config;
