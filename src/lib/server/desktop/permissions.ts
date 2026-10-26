/**
 * Translate macOS failures into the exact setting to change. The process
 * that needs the grant is the TERMINAL running the dev server, not the
 * browser — so every message names that terminal.
 */

export function terminalName(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WT_SESSION && env.TERM_PROGRAM !== 'vscode') return 'Windows Terminal';
  switch (env.TERM_PROGRAM) {
    case 'Apple_Terminal':
      return 'Terminal';
    case 'iTerm.app':
      return 'iTerm';
    case 'vscode':
      return env.CURSOR_TRACE_ID ? 'Cursor' : 'Visual Studio Code';
    case 'WarpTerminal':
      return 'Warp';
    case 'ghostty':
      return 'Ghostty';
    default:
      return env.TERM_PROGRAM || 'the terminal running the dev server';
  }
}

export interface Translated {
  status: number;
  message: string;
  setting?: string;
}

export function translateMacError(stderr: string, ctx: { app?: string; verb: string }, env = process.env): Translated {
  const term = terminalName(env);
  const s = stderr || '';
  const restart = `then quit and reopen ${term} and restart the dev server.`;
  if (/could not create image from display/i.test(s)) {
    return {
      status: 403,
      setting: 'Privacy & Security → Screen Recording',
      message: `Screen capture needs the Screen Recording permission for ${term}. Open System Settings → Privacy & Security → Screen Recording, turn on ${term}, ${restart}`,
    };
  }
  if (/-1743|not authori[sz]ed to send apple events/i.test(s)) {
    const target = ctx.app ?? (/application "([^"]+)"/.exec(s)?.[1] ?? 'the target app');
    return {
      status: 403,
      setting: 'Privacy & Security → Automation',
      message: `macOS refused automation (-1743). Open System Settings → Privacy & Security → Automation, expand ${term}, and enable ${target}.`,
    };
  }
  if (/-1719|-25211|assistive access|not allowed assistive|osascript is not allowed to send keystrokes/i.test(s)) {
    return {
      status: 403,
      setting: 'Privacy & Security → Accessibility',
      message: `This needs Accessibility access. Open System Settings → Privacy & Security → Accessibility, turn on ${term}, ${restart}`,
    };
  }
  if (/-600\b|isn.t running|is not running/i.test(s)) {
    return { status: 409, message: `${ctx.app ?? 'That app'} isn’t running.` };
  }
  if (/couldn.t find shortcut|shortcut .* not found|no shortcut named/i.test(s)) {
    return {
      status: 424,
      setting: 'Shortcuts app',
      message: 'macOS has no public switch for Focus. In the Shortcuts app create two shortcuts named “Divina Focus On” and “Divina Focus Off” using the “Set Focus” action; Divina will run them.',
    };
  }
  if (/unable to find application named|can.t get application/i.test(s)) {
    return { status: 404, message: 'No such application.' };
  }
  if (/-1728/.test(s)) {
    return { status: 409, message: `${ctx.app ?? 'The app'} has nothing to act on right now.` };
  }
  if (/ENOENT/.test(s)) {
    return { status: 500, message: 'A macOS command-line tool is missing from PATH (osascript / open / screencapture).' };
  }
  return { status: 500, message: `${ctx.verb} failed: ${s.split('\n').find(Boolean)?.slice(0, 200) ?? 'unknown error'}` };
}

/**
 * Windows failures → what to do. Windows has no per-app privacy grants for
 * most of this; what does block it is policy (Constrained Language Mode,
 * AppLocker/WDAC), elevation boundaries (UIPI) and the secure desktop.
 */
export function translateWinError(stderr: string, ctx: { app?: string; verb: string }, env = process.env): Translated {
  const term = terminalName(env);
  const s = stderr || '';
  if (/language mode|Cannot add type|not allowed in restricted language/i.test(s)) {
    return {
      status: 403,
      setting: 'PowerShell language mode (organisation policy)',
      message: 'PowerShell on this PC runs in Constrained Language Mode (set by AppLocker, WDAC or your organisation), which blocks desktop control. Ask IT to allow it, or run Divina on a personal machine.',
    };
  }
  if (/execution of scripts is disabled|ExecutionPolicy/i.test(s)) {
    return { status: 403, setting: 'PowerShell execution policy (Group Policy)', message: 'A Group Policy forces a PowerShell execution policy that blocks Divina’s scripts. Ask IT to allow Bypass for the current process, or run on a personal machine.' };
  }
  if (/Get-StartApps.*not recognized|not recognized.*Get-StartApps/i.test(s)) {
    return { status: 501, message: 'Listing installed apps needs Windows 10 or later (Get-StartApps is missing).' };
  }
  if (/ENOENT/.test(s) && /powershell/i.test(s)) {
    return { status: 500, message: 'powershell.exe is not on PATH. Windows PowerShell 5.1 ships with Windows; check that %SystemRoot%\\System32\\WindowsPowerShell\\v1.0 is on PATH.' };
  }
  if (/Access is denied|UnauthorizedAccess|0x80070005/i.test(s)) {
    return {
      status: 403,
      setting: 'Run as administrator',
      message: `Windows refused access${ctx.app ? ` to ${ctx.app}` : ''}. If that app runs as administrator, Windows won’t let a normal-privilege ${term} control it — start ${term} as administrator too, or run the app normally.`,
    };
  }
  if (/Requested Clipboard operation did not succeed|OpenClipboard/i.test(s)) {
    return { status: 409, message: 'Another app is holding the clipboard. Try again in a moment.' };
  }
  if (/handle is invalid|CopyFromScreen|secure desktop/i.test(s) && ctx.verb === 'screenshot') {
    return { status: 409, message: 'Windows can’t capture the screen while it is locked or showing a secure prompt (UAC). Unlock and try again.' };
  }
  if (/WindowsRuntime|GlobalSystemMediaTransportControls/i.test(s)) {
    return { status: 501, message: 'Now-playing needs Windows 10 (1809) or later and Windows PowerShell 5.1.' };
  }
  if (/timed out|SIGTERM|ETIMEDOUT/i.test(s)) {
    return { status: 504, message: `${ctx.verb} took too long; Windows may be busy. Try again.` };
  }
  return { status: 500, message: `${ctx.verb} failed: ${s.split('\n').find((l) => l.trim())?.slice(0, 200) ?? 'unknown error'}` };
}
