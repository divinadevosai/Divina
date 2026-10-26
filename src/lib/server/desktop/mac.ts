/**
 * macOS implementations: `open`, `osascript` (constant scripts, data in
 * argv), `screencapture`, `pbcopy`/`pbpaste`, `pmset`, `shortcuts`.
 */
import { SERVICE_NAMES, musicSearchUrl } from '@/lib/music';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { osascript, RunError } from './exec';
import { resolveApp } from './apps';
import { DISPLAYS_JXA, parseDisplays, pickTarget, spokenDisplay, windowBoundsOn, type Display } from './displays';
import { translateMacError } from './permissions';
import { fail, hostOf, ok, PLAYERS, type BridgeDeps, type MediaAction, type Player, type PlatformTable, type Verb, type VerbResult } from './common';

async function macFail(err: unknown, verb: Verb, app?: string): Promise<VerbResult> {
  const stderr = err instanceof RunError ? `${err.stderr}\n${err.message}\n${err.code ?? ''}` : String(err);
  const t = translateMacError(stderr, { app, verb });
  return fail(t.status, t.message, t.setting);
}

async function isRunning(deps: BridgeDeps, app: string): Promise<boolean> {
  const r = await osascript(deps.run, 'on run argv\nreturn application (item 1 of argv) is running\nend run', [app]);
  return r.stdout.trim() === 'true';
}

async function listDisplays(deps: BridgeDeps): Promise<Display[]> {
  const r = await osascript(deps.run, DISPLAYS_JXA, [], 'JavaScript');
  return parseDisplays(r.stdout.trim());
}

// ── constant scripts ───────────────────────────────────────────────
const MEDIA_CMD: Record<MediaAction, string> = {
  play: 'play',
  pause: 'pause',
  playpause: 'playpause',
  next: 'next track',
  previous: 'previous track',
};
/** Built from two closed enums only; never from caller text. */
function mediaScript(player: Player, action: MediaAction) {
  return `tell application "${player}" to ${MEDIA_CMD[action]}`;
}
const NOW_PLAYING: Record<Player, string> = {
  Spotify:
    'tell application "Spotify"\nset s to player state as string\nif s is "stopped" then return s\nreturn s & tab & (name of current track) & tab & (artist of current track) & tab & (album of current track) & tab & (player position as integer) & tab & ((duration of current track) / 1000 as integer)\nend tell',
  Music:
    'tell application "Music"\nset s to player state as string\nif s is "stopped" then return s\nreturn s & tab & (name of current track) & tab & (artist of current track) & tab & (album of current track) & tab & (player position as integer) & tab & (duration of current track as integer)\nend tell',
};
const CHROME_WINDOW_IDS =
  'if application "Google Chrome" is running then\ntell application "Google Chrome"\nset AppleScript\'s text item delimiters to ","\nreturn (id of every window) as text\nend tell\nend if\nreturn ""';
const CHROME_SET_BOUNDS =
  'on run argv\ntell application "Google Chrome"\nset w to (first window whose id is ((item 1 of argv) as integer))\nset bounds of w to {(item 2 of argv) as integer, (item 3 of argv) as integer, (item 4 of argv) as integer, (item 5 of argv) as integer}\nset index of w to 1\nactivate\nend tell\nend run';
const SAFARI_OPEN =
  'on run argv\ntell application "Safari"\nmake new document with properties {URL:(item 1 of argv)}\nif (count of argv) > 1 then set bounds of front window to {(item 2 of argv) as integer, (item 3 of argv) as integer, (item 4 of argv) as integer, (item 5 of argv) as integer}\nactivate\nend tell\nend run';

async function openInChrome(url: string, bounds: [number, number, number, number] | null, deps: BridgeDeps): Promise<boolean> {
  const before = new Set((await osascript(deps.run, CHROME_WINDOW_IDS)).stdout.trim().split(',').filter(Boolean));
  // Chrome ignores AppleScript URL assignment on freshly made windows; the CLI flag is reliable.
  await deps.run('open', ['-na', 'Google Chrome', '--args', '--new-window', url]);
  if (!bounds) return true;
  // Diff window ids so we move OUR window, not whichever happens to be frontmost.
  for (let i = 0; i < 24; i++) {
    await deps.sleep(125);
    const after = (await osascript(deps.run, CHROME_WINDOW_IDS)).stdout.trim().split(',').filter(Boolean);
    const fresh = after.find((id) => !before.has(id));
    if (fresh) {
      await osascript(deps.run, CHROME_SET_BOUNDS, [fresh, ...bounds.map(String)]);
      return true;
    }
  }
  return false;
}

// ── implementations ────────────────────────────────────────────────
export const MAC: PlatformTable = {
  launch_app: async ({ name }, deps) => {
    const app = resolveApp(name, await deps.scanApps());
    if (!app) return fail(404, `No such application: “${name}”.`);
    try {
      await deps.run('open', ['-a', app.path]);
      return ok(`Opening ${app.name}.`, { app: app.name });
    } catch (e) {
      return macFail(e, 'launch_app', app.name);
    }
  },
  open_url: async ({ url, target, browser }, deps) => {
    try {
      const apps = await deps.scanApps();
      const hasChrome = apps.some((a) => a.name === 'Google Chrome');
      const which = browser === 'default' ? (hasChrome ? 'chrome' : 'safari') : browser;
      let displays: Display[] = [];
      try {
        displays = await listDisplays(deps);
      } catch {
        displays = [];
      }
      const d = pickTarget(displays, target);
      const primaryH = displays.find((x) => x.main)?.frame.h ?? 0;
      const bounds = d && primaryH ? windowBoundsOn(d, primaryH) : null;
      const where = d && displays.length > 1 ? ` ${spokenDisplay(d)}` : '';
      if (which === 'chrome' && hasChrome) {
        const placed = await openInChrome(url, bounds, deps);
        return ok(`Opened ${hostOf(url)} in a new Chrome window${placed ? where : ''}.`, { display: d?.name });
      }
      await osascript(deps.run, SAFARI_OPEN, bounds ? [url, ...bounds.map(String)] : [url]);
      return ok(`Opened ${hostOf(url)} in a new Safari window${where}.`, { display: d?.name });
    } catch (e) {
      return macFail(e, 'open_url', browser === 'safari' ? 'Safari' : 'Google Chrome');
    }
  },
  media: async ({ action, player }, deps) => {
    try {
      let p = player;
      if (!p) {
        for (const cand of PLAYERS) if (await isRunning(deps, cand)) (p = cand);
        if (!p) p = (await deps.scanApps()).some((a) => a.name === 'Spotify') ? 'Spotify' : 'Music';
      }
      await osascript(deps.run, mediaScript(p, action));
      const words: Record<MediaAction, string> = { play: 'Playing', pause: 'Paused', playpause: 'Toggled playback', next: 'Next track', previous: 'Previous track' };
      return ok(`${words[action]} — ${p}.`);
    } catch (e) {
      return macFail(e, 'media', player ?? 'Spotify');
    }
  },
  volume: async ({ level, delta, mute }, deps) => {
    try {
      if (mute !== undefined) {
        await osascript(deps.run, 'on run argv\nset volume output muted ((item 1 of argv) is "true")\nend run', [String(mute)]);
        return ok(mute ? 'Muted.' : 'Unmuted.');
      }
      let target = level;
      if (target === undefined) {
        const cur = Number((await osascript(deps.run, 'output volume of (get volume settings)')).stdout.trim()) || 0;
        target = Math.min(100, Math.max(0, cur + (delta ?? 0)));
      }
      await osascript(deps.run, 'on run argv\nset volume output volume ((item 1 of argv) as integer)\nend run', [String(target)]);
      return ok(`Volume ${target}%.`, { level: target });
    } catch (e) {
      return macFail(e, 'volume');
    }
  },
  screenshot: async (_a, deps) => {
    const path = join(tmpdir(), `divina-capture-${process.pid}-${Date.now()}.png`);
    try {
      await deps.run('screencapture', ['-x', '-t', 'png', path]);
      const png = await readFile(path);
      return ok('Screen captured.', { dataUrl: `data:image/png;base64,${png.toString('base64')}` });
    } catch (e) {
      return macFail(e, 'screenshot');
    } finally {
      // Our own temp file only.
      unlink(path).catch(() => {});
    }
  },
  clipboard_read: async (_a, deps) => {
    try {
      const r = await deps.run('pbpaste', []);
      const text = r.stdout.slice(0, 20_000);
      return ok(text ? 'Clipboard read.' : 'The clipboard is empty.', { text });
    } catch (e) {
      return macFail(e, 'clipboard_read');
    }
  },
  clipboard_write: async ({ text }, deps) => {
    try {
      await deps.run('pbcopy', [], { input: text });
      return ok('Copied to the clipboard.');
    } catch (e) {
      return macFail(e, 'clipboard_write');
    }
  },
  hide_others: async (_a, deps) => {
    try {
      await osascript(deps.run, 'tell application "System Events" to set visible of (every process whose visible is true and frontmost is false) to false');
      return ok('Other apps hidden.');
    } catch (e) {
      return macFail(e, 'hide_others', 'System Events');
    }
  },
  quit_app: async ({ name }, deps) => {
    const app = resolveApp(name, await deps.scanApps());
    if (!app) return fail(404, `No such application: “${name}”.`);
    if (app.name === 'Finder') return fail(422, 'Finder is not quit from Divina.');
    try {
      if (!(await isRunning(deps, app.name))) return fail(409, `${app.name} isn’t running.`);
      // Graceful quit: the app gets to ask about unsaved work. Never kill.
      await osascript(deps.run, 'on run argv\ntell application (item 1 of argv) to quit\nend run', [app.name]);
      return ok(`Asked ${app.name} to quit.`);
    } catch (e) {
      return macFail(e, 'quit_app', app.name);
    }
  },
  lock_screen: async (_a, deps) => {
    try {
      await osascript(deps.run, 'tell application "System Events" to keystroke "q" using {control down, command down}');
      return ok('Locking the screen.');
    } catch (e) {
      return macFail(e, 'lock_screen', 'System Events');
    }
  },
  sleep_display: async (_a, deps) => {
    try {
      await deps.run('pmset', ['displaysleepnow']);
      return ok('Display sleeping.');
    } catch (e) {
      return macFail(e, 'sleep_display');
    }
  },
  dnd: async ({ on }, deps) => {
    try {
      await deps.run('shortcuts', ['run', on ? 'Divina Focus On' : 'Divina Focus Off']);
      return ok(on ? 'Do Not Disturb on.' : 'Do Not Disturb off.');
    } catch (e) {
      const res = await macFail(e, 'dnd');
      if (res.status === 500) {
        const t = translateMacError("couldn't find shortcut", { verb: 'dnd' });
        return fail(t.status, t.message, t.setting);
      }
      return res;
    }
  },
  create_note: async ({ title, body }, deps) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<h1>${esc(title)}</h1>${esc(body).replace(/\n/g, '<br>')}`;
    try {
      await osascript(deps.run, 'on run argv\ntell application "Notes" to make new note with properties {name:(item 1 of argv), body:(item 2 of argv)}\nend run', [title, html]);
      return ok(`Note “${title}” created.`);
    } catch (e) {
      return macFail(e, 'create_note', 'Notes');
    }
  },
  create_reminder: async ({ title, inMinutes }, deps) => {
    try {
      if (inMinutes) {
        await osascript(
          deps.run,
          'on run argv\nset d to (current date) + ((item 2 of argv) as integer) * 60\ntell application "Reminders" to make new reminder with properties {name:(item 1 of argv), remind me date:d}\nend run',
          [title, String(inMinutes)],
        );
      } else {
        await osascript(deps.run, 'on run argv\ntell application "Reminders" to make new reminder with properties {name:(item 1 of argv)}\nend run', [title]);
      }
      return ok(`Reminder “${title}”${inMinutes ? ` in ${inMinutes} min` : ''} added.`);
    } catch (e) {
      return macFail(e, 'create_reminder', 'Reminders');
    }
  },
  list_apps: async (_a, deps) => {
    const apps = await deps.scanApps();
    return ok(`${apps.length} applications.`, { apps: apps.map((a) => a.name) });
  },
  list_displays: async (_a, deps) => {
    try {
      const ds = await listDisplays(deps);
      return ok(`${ds.length} display${ds.length === 1 ? '' : 's'}.`, { displays: ds.map((d) => ({ name: d.name, main: d.main, spoken: spokenDisplay(d) })) });
    } catch (e) {
      return macFail(e, 'list_displays');
    }
  },
  play_search: async ({ service, query }, deps) => {
    if (service === 'spotify') {
      try {
        if ((await deps.scanApps()).some((a) => a.name === 'Spotify')) {
          await deps.run('open', [`spotify:search:${encodeURIComponent(query)}`]);
          return ok(`Searching Spotify for ${query}. Pick a result to play.`, { service, app: true });
        }
      } catch {
        /* fall through to the website */
      }
    }
    const r = await MAC.open_url({ url: musicSearchUrl(service, query), target: 'secondary', browser: 'default' }, deps);
    return r.ok ? ok(`Searching ${SERVICE_NAMES[service]} for ${query}. Pick a result to play.`, { service, app: false }) : r;
  },
  now_playing: async (_a, deps) => {
    try {
      for (const p of PLAYERS) {
        if (!(await isRunning(deps, p))) continue;
        const [state, track, artist, album, pos, dur] = (await osascript(deps.run, NOW_PLAYING[p])).stdout.trim().split('\t');
        return ok(state === 'stopped' ? `${p} is stopped.` : `${track} — ${artist}`, {
          player: p,
          state: state === 'playing' ? 'playing' : state === 'paused' ? 'paused' : 'stopped',
          track,
          artist,
          album,
          positionS: Number(pos) || 0,
          durationS: Number(dur) || 0,
        });
      }
      return ok('Nothing is playing.', { player: 'none', state: 'stopped' });
    } catch (e) {
      return macFail(e, 'now_playing', 'Spotify');
    }
  },
};
