# Privacy — what leaves your computer

Divina runs on your own computer. There is no Divina server, account or
analytics. What does go out, and to whom:

| What | Goes to | When |
|---|---|---|
| Camera video | **Nowhere.** Hand tracking runs inside the browser. | Only while "Hands" is on |
| Your voice | Your browser's speech service (Google for Chrome, Microsoft for Edge) | Only while "Voice" is on |
| What you say to Divina, plus a short summary of your cards (weather, schedule, portfolio…) | The AI you picked — Google Gemini, Anthropic Claude or OpenAI — with your own API key | When you ask something the local commands can't answer |
| Divina's replies (for the natural voice) | The voice you picked — Google Gemini, OpenAI or ElevenLabs | When the voice is set to Natural |
| Your location (rounded to ~1 km) | MET Norway (weather); the app also asks OpenStreetMap for the place name | If you allow location and no city is set |
| Your email (app only) | Read from your provider over IMAP/TLS on this computer, read-only; only the unread count and latest sender's name go into the AI summary | When the Email card refreshes |
| Your coin list (+ your own CoinGecko key) | CoinGecko | When the Crypto card refreshes |
| A short message read out on a phone call (app only), and your own phone number | Twilio, with your own Twilio account | Only if you set up Phone calls: for a routine's "Phone me" step, or heads-up calls you switch on. Divina only ever rings the one number you saved |
| Things you asked Divina to remember | The AI you picked, with each question | Stored encrypted on this computer (`memory.local.json`); "forget everything" clears it |
| A picture of your screen ("what's on my screen?") | The AI you picked, for that one question | Only after you press Allow, every time; not stored |
| Lines you speak to the live translator | The AI you picked, to translate | While the translator is on; nothing else (no cards, no memory) goes with them |
| A backup | Only where you save it | Sealed with your passphrase (PBKDF2 + AES-256-GCM); keys included only if you tick the box |
| Your routines and custom worlds | Nowhere | Stored encrypted on this computer (`routines.local.json`, `worlds.local.json`) |
| A shared card picture | Only where you choose to share or save it | Made on your device; you see it before anything happens |
| Your notes | **Nowhere**, except open to-dos in the AI's summary of your cards | Stored encrypted on this computer (`notes.local.json`) |
| A custom agent's name and instructions | The AI you picked, with each question to that agent | Only while you're talking to that agent; stored encrypted (`agents.local.json`) |
| Calendar address, Instagram / GitHub tokens | Only to Google Calendar, Meta and GitHub respectively | When those cards refresh |
| Your followed leagues, portfolio **ticker symbols** (never share counts) | ESPN's and Yahoo Finance's free public feeds, straight from this computer | When the Sports or Stocks card refreshes |

Stored on this computer only: `.env.local` and `settings.local.json` (your
settings; every key in it encrypted with a key Windows locks to your
account, or the Mac keeps in your login Keychain, see SECURITY.md), the browser's own storage (display preferences).
Neither file is included in any download or update of Divina, and both are
excluded from git.

The Divina page never receives your keys back from its server: Settings only
shows whether a key is saved and its last four characters.

## The free browser edition

The browser edition (the `/app` part of the Divina website) has no account
and no server behind it. Settings, the visitor's own API keys (stored only
encrypted, with a non-extractable browser key) and any calendar file they
add are stored only in their browser. The browser sends: questions (with the
key) straight to the AI they picked (Google, Anthropic or OpenAI) and reply
text to the voice they picked (Google, OpenAI or ElevenLabs);
rounded coordinates to MET Norway for the forecast, and only a typed city name
to OpenStreetMap Nominatim; the news topic to Algolia (Hacker News).
Camera frames never leave the browser. Whoever hosts the website keeps
standard access logs.

The licence-key code (Lemon Squeezy) is only switched on in a build made for
sale (`DIVINA_REQUIRE_LICENCE=1`). The normal free build never contacts it.


## The new-tab extension

The extension (Chrome and Edge) is the browser edition as every new tab, and
sends the same things to the same places, with two differences: what you type
in its search box goes to the browser's own search engine through
`chrome.search` (the same as the address bar; Divina doesn't keep it), and it
never asks for location, so weather uses the city you type. Its only
permission is `search`. That you've seen the tour is kept as essential storage
there, because every new tab is a fresh visit. Removing the extension removes
everything it stored.

## Cookies and device storage

Divina sets no cookies and has no analytics, ads or trackers, in any edition or
on the website. On first use it asks whether it may remember preferences
(language, the tour, hand tracking, a city's map position) between visits;
"Essential only" keeps them just for the visit. Essential storage (settings,
encrypted keys and personal items, the choice itself) is what the person asked
for. Everything is listed in Settings → Privacy & cookies, which also has
**Delete everything**: it clears the browser's storage and, in the Windows app,
deletes the data folder's personal files and the vault key (`/api/erase`, page
only, explicit confirm). Full detail: `landing/cookies.html`.
