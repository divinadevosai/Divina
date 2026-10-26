/**
 * Windows implementations.
 *
 * The same rules as macOS, in Windows terms:
 *  - Programs start through execFile/spawn with an argv array, never a shell
 *    (no cmd.exe, no `start`).
 *  - PowerShell only ever runs CONSTANT scripts from this file, sent with
 *    -EncodedCommand (so no command-line quoting can alter them). Caller
 *    data reaches a script only through DIVINA_* environment variables,
 *    which PowerShell reads as plain strings and never evaluates.
 *  - Apps resolve against a live scan of the Start menu (Get-StartApps);
 *    quitting resolves against the live list of running windowed apps.
 *  - Quit is CloseMainWindow — the same as clicking ✕, so apps can ask
 *    about unsaved work. Never Stop-Process.
 */
import { SERVICE_NAMES, musicSearchUrl, playerName } from '@/lib/music';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunError } from './exec';
import { resolveApp, type InstalledApp } from './apps';
import { pickTarget, spokenDisplay, type Display } from './displays';
import { translateWinError } from './permissions';
import { fail, hostOf, ok, type BridgeDeps, type MediaAction, type PlatformTable, type Verb, type VerbResult } from './common';

// ── PowerShell plumbing ────────────────────────────────────────────
const PRELUDE = "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.Encoding]::UTF8;\n";

/** UTF-16LE base64, as -EncodedCommand expects. */
export function encodePs(script: string): string {
  return Buffer.from(PRELUDE + script, 'utf16le').toString('base64');
}

/** Run a constant script; `data` becomes $env:DIVINA_<KEY>. */
export function ps(deps: BridgeDeps, script: string, data: Record<string, string> = {}, timeoutMs = 15_000) {
  const env: NodeJS.ProcessEnv = { ...deps.env };
  for (const [k, v] of Object.entries(data)) env[`DIVINA_${k}`] = v;
  return deps.run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(script)], { env, timeoutMs });
}

function jsonArray<T>(stdout: string): T[] {
  const t = stdout.trim();
  if (!t) return [];
  const v = JSON.parse(t) as T | T[];
  return Array.isArray(v) ? v : [v];
}

async function winFail(err: unknown, verb: Verb, app?: string): Promise<VerbResult> {
  const stderr = err instanceof RunError ? `${err.stderr}\n${err.message}\n${err.code ?? ''}` : String(err);
  const t = translateWinError(stderr, { app, verb });
  return fail(t.status, t.message, t.setting);
}

/** Win32 helpers, compiled in-process by each script that needs them. */
const WIN32 = `
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class DivinaWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  static bool IsAppWindow(IntPtr h) {
    return IsWindowVisible(h) && GetWindowTextLength(h) > 0 && GetWindow(h, 4) == IntPtr.Zero;
  }
  static string ProcName(IntPtr h) {
    uint pid; GetWindowThreadProcessId(h, out pid);
    try { return Process.GetProcessById((int)pid).ProcessName; } catch { return ""; }
  }
  public static long[] Windows(string proc) {
    var list = new List<long>();
    EnumWindows((h, l) => { if (IsAppWindow(h) && string.Equals(ProcName(h), proc, StringComparison.OrdinalIgnoreCase)) list.Add(h.ToInt64()); return true; }, IntPtr.Zero);
    return list.ToArray();
  }
  public static int MinimizeOthers() {
    var fg = GetForegroundWindow(); int n = 0;
    EnumWindows((h, l) => { if (h != fg && IsAppWindow(h)) { ShowWindow(h, 6); n++; } return true; }, IntPtr.Zero);
    return n;
  }
  public static void Key(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
}
'@
`;

/** Core Audio endpoint volume (the default output device). */
const AUDIO = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class DivinaAudio {
  static IAudioEndpointVolume Vol() {
    var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume v = null; var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out v)); return v;
  }
  public static float Get() { float v; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void Set(float v) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(v, Guid.Empty)); }
  public static void Mute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }
}
'@
`;

// ── constant scripts ───────────────────────────────────────────────
export const PS = {
  apps: `
try {
  @(Get-StartApps | ForEach-Object { @{ name = $_.Name; id = $_.AppID } }) | ConvertTo-Json -Compress
} catch {
  $roots = @("$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs", "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs")
  @(Get-ChildItem -Path $roots -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object { @{ name = $_.BaseName; id = $_.FullName } }) | ConvertTo-Json -Compress
}`,
  windows: `${WIN32}
@([DivinaWin]::Windows($env:DIVINA_PROC)) | ConvertTo-Json -Compress`,
  place: `${WIN32}
[void][DivinaWin]::SetProcessDPIAware()
$before = @($env:DIVINA_BEFORE -split ',' | Where-Object { $_ })
$deadline = (Get-Date).AddSeconds(6)
$fresh = $null
while (-not $fresh -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 150
  $fresh = [DivinaWin]::Windows($env:DIVINA_PROC) | Where-Object { $before -notcontains [string]$_ } | Select-Object -First 1
}
if ($fresh -and $env:DIVINA_W) {
  $h = [IntPtr][long]$fresh
  [void][DivinaWin]::ShowWindow($h, 9)
  [void][DivinaWin]::SetWindowPos($h, [IntPtr]::Zero, [int]$env:DIVINA_X, [int]$env:DIVINA_Y, [int]$env:DIVINA_W, [int]$env:DIVINA_H, 0x0040)
  [void][DivinaWin]::SetForegroundWindow($h)
}
if ($fresh) { [string]$fresh } else { '' }`,
  displays: `${WIN32}
[void][DivinaWin]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms
$names = @(); $internal = @()
try {
  $ids = @(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID -ErrorAction Stop)
  $conn = @(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorConnectionParams -ErrorAction SilentlyContinue)
  foreach ($m in $ids) {
    $names += (-join ($m.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })).Trim()
    $c = $conn | Where-Object { $_.InstanceName -eq $m.InstanceName } | Select-Object -First 1
    $internal += ($c -and ($c.VideoOutputTechnology -eq 0x80000000 -or $c.VideoOutputTechnology -eq 6 -or $c.VideoOutputTechnology -eq 11))
  }
} catch {}
$screens = [System.Windows.Forms.Screen]::AllScreens
$paired = $names.Count -eq $screens.Count
$out = for ($i = 0; $i -lt $screens.Count; $i++) {
  $s = $screens[$i]
  @{
    name = $(if ($paired -and $names[$i]) { $names[$i] } else { $s.DeviceName })
    main = $s.Primary
    builtIn = $(if ($paired) { [bool]$internal[$i] } else { $false })
    frame = @{ x = $s.Bounds.X; y = $s.Bounds.Y; w = $s.Bounds.Width; h = $s.Bounds.Height }
    visible = @{ x = $s.WorkingArea.X; y = $s.WorkingArea.Y; w = $s.WorkingArea.Width; h = $s.WorkingArea.Height }
  }
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 4`,
  key: `${WIN32}
[DivinaWin]::Key([byte][int]$env:DIVINA_VK)`,
  volume: `${AUDIO}
switch ($env:DIVINA_MODE) {
  'mute' { [DivinaAudio]::Mute($env:DIVINA_VALUE -eq 'true'); 'ok' }
  'level' { [DivinaAudio]::Set([float]([int]$env:DIVINA_VALUE / 100.0)); [int]([DivinaAudio]::Get() * 100) }
  'delta' { $v = [Math]::Min(1.0, [Math]::Max(0.0, [DivinaAudio]::Get() + [int]$env:DIVINA_VALUE / 100.0)); [DivinaAudio]::Mute($false); [DivinaAudio]::Set([float]$v); [int]($v * 100) }
}`,
  screenshot: `${WIN32}
[void][DivinaWin]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save($env:DIVINA_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); 'ok'`,
  clipRead: `$t = Get-Clipboard -Raw; if ($null -eq $t) { '' } else { $t }`,
  clipWrite: `Set-Clipboard -Value $env:DIVINA_TEXT; 'ok'`,
  hideOthers: `${WIN32}
[DivinaWin]::MinimizeOthers()`,
  running: `
@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
  $d = ''; try { $d = $_.Description } catch {}
  @{ pid = $_.Id; name = $_.ProcessName; desc = [string]$d; title = $_.MainWindowTitle }
}) | ConvertTo-Json -Compress`,
  quit: `$p = Get-Process -Id ([int]$env:DIVINA_PID); if ($p.CloseMainWindow()) { 'ok' } else { 'refused' }`,
  sleepDisplay: `${WIN32}
[void][DivinaWin]::PostMessage([IntPtr]0xffff, 0x0112, [IntPtr]0xF170, [IntPtr]2); 'ok'`,
  nowPlaying: `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(5000); $t.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$s = $mgr.GetCurrentSession()
if (-not $s) { '{"state":"stopped"}'; exit }
$p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
@{ app = $s.SourceAppUserModelId; state = [string]$info.PlaybackStatus; track = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; positionS = [int]$tl.Position.TotalSeconds; durationS = [int]$tl.EndTime.TotalSeconds } | ConvertTo-Json -Compress`,
} as const;

// ── scans ──────────────────────────────────────────────────────────
let appCache: { at: number; apps: InstalledApp[] } | null = null;

/** Live Start-menu scan: every app a user could click, including Store apps. */
export async function scanWindowsApps(deps: Pick<BridgeDeps, 'run' | 'env'> & Partial<BridgeDeps>): Promise<InstalledApp[]> {
  if (appCache && Date.now() - appCache.at < 30_000) return appCache.apps;
  const r = await ps(deps as BridgeDeps, PS.apps, {}, 20_000);
  const seen = new Map<string, InstalledApp>();
  for (const a of jsonArray<{ name: string; id: string }>(r.stdout)) {
    if (a?.name && a.id && !seen.has(a.name.toLowerCase())) seen.set(a.name.toLowerCase(), { name: a.name, path: a.id });
  }
  const apps = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  appCache = { at: Date.now(), apps };
  return apps;
}

interface Running {
  pid: number;
  name: string;
  desc: string;
  title: string;
}

async function runningApps(deps: BridgeDeps): Promise<Running[]> {
  return jsonArray<Running>((await ps(deps, PS.running)).stdout).filter((p) => Number.isInteger(p.pid));
}

async function listDisplays(deps: BridgeDeps): Promise<Display[]> {
  return jsonArray<Display>((await ps(deps, PS.displays)).stdout);
}

/** Windows virtual-screen coordinates are already top-left, Y down. */
export function winBoundsOn(d: Display): [number, number, number, number] {
  const v = d.visible;
  const mx = Math.round(v.w * 0.06);
  const my = Math.round(v.h * 0.05);
  return [v.x + mx, v.y + my, v.w - 2 * mx, v.h - 2 * my];
}

// ── browsers ───────────────────────────────────────────────────────
const BROWSERS = {
  chrome: { proc: 'chrome', label: 'Chrome', paths: ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'].map((v) => [v, 'Google\\Chrome\\Application\\chrome.exe'] as const) },
  edge: { proc: 'msedge', label: 'Edge', paths: ['ProgramFiles(x86)', 'ProgramFiles'].map((v) => [v, 'Microsoft\\Edge\\Application\\msedge.exe'] as const) },
};

export function findBrowser(deps: BridgeDeps, want: 'chrome' | 'edge' | 'safari' | 'default' = 'default') {
  const order: (keyof typeof BROWSERS)[] = want === 'edge' ? ['edge', 'chrome'] : ['chrome', 'edge'];
  for (const k of order) {
    for (const [envVar, rel] of BROWSERS[k].paths) {
      const base = deps.env[envVar];
      if (!base) continue;
      const exe = `${base}\\${rel}`;
      if (deps.exists(exe)) return { ...BROWSERS[k], exe };
    }
  }
  return null;
}

// ── media ──────────────────────────────────────────────────────────
/** Virtual-key codes from a closed enum; Windows has one play/pause key. */
const MEDIA_VK: Record<MediaAction, number> = { play: 0xb3, pause: 0xb3, playpause: 0xb3, next: 0xb0, previous: 0xb1 };

const prettyApp = playerName;

// ── implementations ────────────────────────────────────────────────
export const WINDOWS: PlatformTable = {
  launch_app: async ({ name }, deps) => {
    let app: InstalledApp | null;
    try {
      app = resolveApp(name, await deps.scanApps());
    } catch (e) {
      return winFail(e, 'launch_app');
    }
    if (!app) return fail(404, `No such application: “${name}”.`);
    // The target comes from the scan, never from the caller.
    const target = /\.lnk$/i.test(app.path) ? app.path : `shell:AppsFolder\\${app.path}`;
    deps.launch('explorer.exe', [target]);
    return ok(`Opening ${app.name}.`, { app: app.name });
  },

  open_url: async ({ url, target, browser }, deps) => {
    const b = findBrowser(deps, browser);
    if (!b) return fail(424, 'Neither Chrome nor Edge was found in the usual install locations, so Divina can’t open a dedicated window.');
    try {
      let displays: Display[] = [];
      try {
        displays = await listDisplays(deps);
      } catch {
        displays = [];
      }
      const d = pickTarget(displays, target);
      const before = jsonArray<number>((await ps(deps, PS.windows, { PROC: b.proc })).stdout).map(String);
      // argv only: the URL is one normalised argument and cannot become a flag
      deps.launch(b.exe, ['--new-window', url]);
      const bounds = d && displays.length > 1 ? winBoundsOn(d) : null;
      const placed = (
        await ps(deps, PS.place, {
          PROC: b.proc,
          BEFORE: before.join(','),
          ...(bounds ? { X: String(bounds[0]), Y: String(bounds[1]), W: String(bounds[2]), H: String(bounds[3]) } : {}),
        })
      ).stdout.trim();
      const where = placed && bounds && d ? ` ${spokenDisplay(d)}` : '';
      return ok(`Opened ${hostOf(url)} in a new ${b.label} window${where}.`, { display: d?.name });
    } catch (e) {
      return winFail(e, 'open_url', b.label);
    }
  },

  media: async ({ action }, deps) => {
    try {
      await ps(deps, PS.key, { VK: String(MEDIA_VK[action]) });
      const words: Record<MediaAction, string> = { play: 'Toggled playback', pause: 'Toggled playback', playpause: 'Toggled playback', next: 'Next track', previous: 'Previous track' };
      return ok(`${words[action]}.`);
    } catch (e) {
      return winFail(e, 'media');
    }
  },

  volume: async ({ level, delta, mute }, deps) => {
    try {
      if (mute !== undefined) {
        await ps(deps, PS.volume, { MODE: 'mute', VALUE: String(mute) });
        return ok(mute ? 'Muted.' : 'Unmuted.');
      }
      const r = level !== undefined ? await ps(deps, PS.volume, { MODE: 'level', VALUE: String(level) }) : await ps(deps, PS.volume, { MODE: 'delta', VALUE: String(delta ?? 0) });
      const now = Number(r.stdout.trim());
      return ok(`Volume ${Number.isFinite(now) ? now : level}%.`, { level: now });
    } catch (e) {
      return winFail(e, 'volume');
    }
  },

  screenshot: async (_a, deps) => {
    const path = join(tmpdir(), `divina-capture-${process.pid}-${Date.now()}.png`);
    try {
      await ps(deps, PS.screenshot, { PATH: path });
      const png = await readFile(path);
      return ok('Screen captured.', { dataUrl: `data:image/png;base64,${png.toString('base64')}` });
    } catch (e) {
      return winFail(e, 'screenshot');
    } finally {
      unlink(path).catch(() => {});
    }
  },

  clipboard_read: async (_a, deps) => {
    try {
      const text = (await ps(deps, PS.clipRead)).stdout.replace(/\r?\n$/, '').slice(0, 20_000);
      return ok(text ? 'Clipboard read.' : 'The clipboard is empty.', { text });
    } catch (e) {
      return winFail(e, 'clipboard_read');
    }
  },

  clipboard_write: async ({ text }, deps) => {
    try {
      await ps(deps, PS.clipWrite, { TEXT: text });
      return ok('Copied to the clipboard.');
    } catch (e) {
      return winFail(e, 'clipboard_write');
    }
  },

  hide_others: async (_a, deps) => {
    try {
      const n = Number((await ps(deps, PS.hideOthers)).stdout.trim()) || 0;
      return ok(n ? `Minimised ${n} other window${n === 1 ? '' : 's'}.` : 'Nothing else to hide.');
    } catch (e) {
      return winFail(e, 'hide_others');
    }
  },

  quit_app: async ({ name }, deps) => {
    let running: Running[];
    try {
      running = await runningApps(deps);
    } catch (e) {
      return winFail(e, 'quit_app');
    }
    // Resolve against what is actually running with a window.
    const candidates: InstalledApp[] = running.map((p) => ({ name: p.desc || p.name, path: String(p.pid) }));
    const byProc: InstalledApp[] = running.map((p) => ({ name: p.name, path: String(p.pid) }));
    const hit = resolveApp(name, candidates) ?? resolveApp(name, byProc);
    if (!hit) return fail(404, `No running application called “${name}”.`);
    if (/^explorer$/i.test(running.find((p) => String(p.pid) === hit.path)?.name ?? '')) return fail(422, 'File Explorer is not closed from Divina.');
    try {
      const r = (await ps(deps, PS.quit, { PID: hit.path })).stdout.trim();
      return r === 'ok' ? ok(`Asked ${hit.name} to close.`) : fail(409, `${hit.name} didn’t accept the close request (it may be showing a dialog).`);
    } catch (e) {
      return winFail(e, 'quit_app', hit.name);
    }
  },

  lock_screen: async (_a, deps) => {
    try {
      await deps.run('rundll32.exe', ['user32.dll,LockWorkStation']);
      return ok('Locking the screen.');
    } catch (e) {
      return winFail(e, 'lock_screen');
    }
  },

  sleep_display: async (_a, deps) => {
    try {
      await ps(deps, PS.sleepDisplay);
      return ok('Display sleeping.');
    } catch (e) {
      return winFail(e, 'sleep_display');
    }
  },

  // Explained refusals: Windows offers no safe public interface for these.
  dnd: async () => fail(501, 'Windows has no public switch for Do Not Disturb. Press Win+N and toggle “Do not disturb” (or Focus in Settings → System).', 'Settings → System → Notifications'),
  create_note: async () => fail(501, 'Windows has no notes app Divina can write to. Say “copy …” and I’ll put the text on your clipboard instead.'),
  create_reminder: async () => fail(501, 'Windows has no reminders app Divina can write to. A calendar event in Outlook or Google Calendar is the closest thing.'),

  list_apps: async (_a, deps) => {
    try {
      const apps = await deps.scanApps();
      return ok(`${apps.length} applications.`, { apps: apps.map((a) => a.name) });
    } catch (e) {
      return winFail(e, 'list_apps');
    }
  },

  list_displays: async (_a, deps) => {
    try {
      const ds = await listDisplays(deps);
      return ok(`${ds.length} display${ds.length === 1 ? '' : 's'}.`, { displays: ds.map((d) => ({ name: d.name, main: d.main, spoken: spokenDisplay(d) })) });
    } catch (e) {
      return winFail(e, 'list_displays');
    }
  },

  play_search: async ({ service, query }, deps) => {
    // Spotify's own app, if it's installed, opens straight onto its search
    if (service === 'spotify') {
      try {
        if ((await deps.scanApps()).some((a) => /^spotify$/i.test(a.name))) {
          // a fixed scheme and prefix; the query is percent-encoded data, one argv entry
          deps.launch('explorer.exe', [`spotify:search:${encodeURIComponent(query)}`]);
          return ok(`Searching Spotify for ${query}. Pick a result to play.`, { service, app: true });
        }
      } catch {
        /* fall through to the website */
      }
    }
    const r = await WINDOWS.open_url({ url: musicSearchUrl(service, query), target: 'secondary', browser: 'default' }, deps);
    return r.ok ? ok(`Searching ${SERVICE_NAMES[service]} for ${query}. Pick a result to play.`, { service, app: false }) : r;
  },

  now_playing: async (_a, deps) => {
    try {
      const j = JSON.parse((await ps(deps, PS.nowPlaying)).stdout.trim() || '{"state":"stopped"}') as { app?: string; state: string; track?: string; artist?: string; album?: string; positionS?: number; durationS?: number };
      const state = /playing/i.test(j.state) ? 'playing' : /paused/i.test(j.state) ? 'paused' : 'stopped';
      const player = j.app ? prettyApp(j.app) : 'none';
      if (state === 'stopped' || !j.track) return ok('Nothing is playing.', { player, state: 'stopped' });
      return ok(`${j.track} — ${j.artist}`, { player, state, track: j.track, artist: j.artist, album: j.album, positionS: j.positionS ?? 0, durationS: j.durationS ?? 0 });
    } catch (e) {
      return winFail(e, 'now_playing');
    }
  },
};
