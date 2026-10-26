/**
 * Displays, in two coordinate systems:
 *   NSScreen (Cocoa):  origin bottom-left of the primary screen, Y up.
 *   AppleScript bounds (Carbon): origin top-left of the primary, Y down,
 *   given as {left, top, right, bottom}.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Display {
  name: string;
  frame: Rect;
  visible: Rect;
  main: boolean;
  builtIn: boolean;
}

export function cocoaToCarbon(r: Rect, primaryHeight: number): [number, number, number, number] {
  const top = primaryHeight - (r.y + r.h);
  return [Math.round(r.x), Math.round(top), Math.round(r.x + r.w), Math.round(top + r.h)];
}

/** Inset carbon bounds so a new window sits comfortably inside a display. */
export function windowBoundsOn(d: Display, primaryHeight: number): [number, number, number, number] {
  const [l, t, r, b] = cocoaToCarbon(d.visible, primaryHeight);
  const mx = Math.round((r - l) * 0.06);
  const my = Math.round((b - t) * 0.05);
  return [l + mx, t + my, r - mx, b - my];
}

/** "on your LG ULTRAWIDE", "on your laptop". */
export function spokenDisplay(d: Display): string {
  if (d.builtIn) return 'on your laptop';
  // Windows without a monitor name reports \\.\DISPLAY2
  const n = /DISPLAY(\d+)$/i.exec(d.name);
  if (n) return d.main ? 'on your main display' : `on display ${n[1]}`;
  return `on your ${d.name}`;
}

export function pickTarget(displays: Display[], want: 'secondary' | 'primary' | string | undefined): Display | undefined {
  if (!displays.length) return undefined;
  if (want === 'primary') return displays.find((d) => d.main) ?? displays[0];
  if (want && want !== 'secondary') {
    const w = want.toLowerCase();
    const named = displays.find((d) => d.name.toLowerCase().includes(w) || (d.builtIn && /laptop|built.?in|macbook/.test(w)));
    if (named) return named;
  }
  return displays.find((d) => !d.main) ?? displays[0];
}

/** JXA: enumerate NSScreen with real names. Constant script, no inputs. */
export const DISPLAYS_JXA = `
ObjC.import('AppKit');
var s = $.NSScreen.screens, out = [];
for (var i = 0; i < s.count; i++) {
  var sc = s.objectAtIndex(i), f = sc.frame, v = sc.visibleFrame, n = '';
  try { n = ObjC.unwrap(sc.localizedName); } catch (e) { n = 'Display ' + (i + 1); }
  out.push({ name: n, main: i === 0,
    frame: { x: f.origin.x, y: f.origin.y, w: f.size.width, h: f.size.height },
    visible: { x: v.origin.x, y: v.origin.y, w: v.size.width, h: v.size.height } });
}
JSON.stringify(out);
`;

export function parseDisplays(json: string): Display[] {
  const raw = JSON.parse(json) as Omit<Display, 'builtIn'>[];
  return raw.map((d) => ({ ...d, builtIn: /built.?in|color lcd|retina display/i.test(d.name) }));
}
