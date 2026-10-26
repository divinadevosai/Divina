# Third-party notices

Divina ships with, or downloads at install time, the following software. All
licences permit commercial use; keep this file with any copy you distribute.

| Component | Licence | Notes |
|---|---|---|
| Next.js, React, React DOM | MIT | |
| three.js | MIT | |
| @react-three/fiber | MIT | |
| postprocessing | Zlib | |
| Framer Motion | MIT | |
| Zustand | MIT | |
| MediaPipe Tasks Vision (+ wasm runtime) | Apache-2.0 | Hand tracking runs entirely in the browser |
| MediaPipe hand landmarker model (`hand_landmarker.task`) | Apache-2.0 | Downloaded from Google at install time |
| Inter, JetBrains Mono (fonts) | SIL Open Font Licence 1.1 | Served via next/font |
| caniuse-lite (browser data, build tooling) | CC-BY-4.0 | © Alexis Deveria, caniuse.com |
| sharp / libvips (optional, installed by Next.js) | Apache-2.0 / LGPL-3.0-or-later | Unmodified, dynamically loaded; not used by Divina |

Everything else in `node_modules` is MIT, ISC, BSD or Apache-2.0
(check with `npm ls --omit=dev --all`).

## Data and services

Divina calls these services at run time. **Personal, non-commercial use is
what the free ones are for.** Before selling Divina or running it for other
people, replace or license the ones marked ⚠.

| Service | Used for | Terms |
|---|---|---|
| Google Gemini API | AI replies, natural voice | Each person's own key under Google's Gemini API terms: users must be 18+, and apps offered in the UK, EU and Switzerland must use Google's paid tier. Divina asks for that confirmation before a key is saved. |
| Anthropic Claude API | AI replies | Each person's own key under Anthropic's Commercial Terms and Usage Policy (18+). Divina asks for that confirmation before a key is saved. Opus/Sonnet 5.5 requests use Anthropic's server-side fallback, so a request declined by Claude's safety checks may be answered by another Claude model. Uses the official `@anthropic-ai/sdk` (MIT). |
| OpenAI API | AI replies, natural voice | Each person's own key under OpenAI's Services Agreement and usage policies (18+). Requests are sent with `store: false`. OpenAI requires telling people its voices are AI-generated: Settings, Terms and Privacy say so. |
| ElevenLabs API | Natural voice | Each person's own key under ElevenLabs' terms. The free plan is non-commercial and requires attribution when content is published; commercial use needs a paid plan. Voice list comes from the person's own account. |
| Chrome / Edge speech recognition | Hearing you | Built into the browser; audio is processed by the browser vendor (Google / Microsoft). |
| ⚠ ESPN public scoreboard | Sports | Unofficial, undocumented; no licence for apps. **Off by default** — only used after the person switches it on for their own personal use. Not in the browser edition. |
| ⚠ Yahoo Finance chart API | Stocks | Unofficial; no licence for apps. **Off by default**, same switch as ESPN. Not in the browser edition. |
| MET Norway (api.met.no) | Weather | Open data (CC BY 4.0 / NLOD), commercial use allowed with credit (“MET Norway” on the card). The app identifies itself by User-Agent; the browser edition by its Origin, as MET allows for low-volume sites. |
| OpenStreetMap Nominatim | Finding a typed city (and, in the app, naming your location) | Usage policy: light use, identified, cached; attribution © OpenStreetMap contributors (ODbL). |
| CoinGecko API | Crypto | Each person's own free Demo key, for their own personal use under CoinGecko's API terms; the card and panel credit “Data provided by CoinGecko” with a link, as required. A commercial CoinGecko plan is needed before Divina itself supplies crypto data. |
| Your email provider (IMAP) | Email | Standard IMAP over TLS with the person's own app password, read-only. Gmail's REST API is deliberately not used (it requires Google's paid CASA security assessment). |
| Hacker News search (Algolia) | News | Public API. Headlines link to their original publishers. |
| Instagram Graph API | Instagram | Meta platform terms; your own token. Serving other people's accounts requires Meta app review. |
| GitHub API | Projects | GitHub terms. |
