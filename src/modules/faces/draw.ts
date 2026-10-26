/**
 * Canvas primitives for card faces. Faces are drawn at a fixed resolution
 * into the SAME canvases the card shader samples and the dissolve rasteriser
 * reads — so what dissolves is exactly what was on screen.
 */
import { hueCss } from '../meta';

export const FACE_W = 640;
export const FACE_H = 800;

export interface Fonts {
  sans: string;
  mono: string;
}

let fonts: Fonts = { sans: 'system-ui, -apple-system, Segoe UI, sans-serif', mono: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
export function setFaceFonts(f: Fonts) {
  fonts = f;
}
export function faceFonts() {
  return fonts;
}

export const INK = {
  hi: 'rgba(236, 244, 255, 0.98)',
  mid: 'rgba(200, 218, 245, 0.78)',
  lo: 'rgba(170, 192, 230, 0.5)',
  faint: 'rgba(150, 175, 225, 0.22)',
  warn: 'rgba(255, 138, 64, 0.95)',
};

export const PAD = 44;

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, opts: { mono?: boolean; weight?: number; align?: CanvasTextAlign; max?: number; tracking?: number } = {}) {
  ctx.font = `${opts.weight ?? 400} ${size}px ${opts.mono ? fonts.mono : fonts.sans}`;
  ctx.fillStyle = color;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${opts.tracking ?? 0}px`;
  let out = s;
  if (opts.max) {
    while (out.length > 1 && ctx.measureText(out).width > opts.max) out = out.slice(0, -2) + '…';
  }
  ctx.fillText(out, x, y);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
}

export function wrap(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, maxW: number, lineH: number, maxLines = 6, mono = false) {
  ctx.font = `400 ${size}px ${mono ? fonts.mono : fonts.sans}`;
  const words = s.split(/\s+/);
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      text(ctx, lines === maxLines - 1 ? `${line}…` : line, x, y + lines * lineH, size, color, { mono });
      lines++;
      line = words[i];
      if (lines >= maxLines) return lines;
    } else line = test;
  }
  if (line) text(ctx, line, x, y + lines * lineH, size, color, { mono });
  return lines + 1;
}

export function rule(ctx: CanvasRenderingContext2D, y: number, color = INK.faint, x0 = PAD, x1 = FACE_W - PAD) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, y, x1 - x0, 1.5);
}

export function ticks(ctx: CanvasRenderingContext2D, y: number, n: number, color = INK.faint) {
  const w = FACE_W - PAD * 2;
  ctx.fillStyle = color;
  for (let i = 0; i <= n; i++) ctx.fillRect(PAD + (w * i) / n, y, 1.5, i % 5 === 0 ? 10 : 5);
}

export function sparkline(ctx: CanvasRenderingContext2D, values: number[], x: number, y: number, w: number, h: number, hue: number, opts: { fill?: boolean; progress?: number; baseline?: number } = {}) {
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = Math.max(2, Math.floor(values.length * (opts.progress ?? 1)));
  const px = (i: number) => x + (w * i) / (values.length - 1);
  const py = (v: number) => y + h - ((v - min) / span) * h;
  if (opts.fill) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, hueCss(hue, 90, 65, 0.32));
    g.addColorStop(1, hueCss(hue, 90, 65, 0));
    ctx.beginPath();
    ctx.moveTo(px(0), y + h);
    for (let i = 0; i < n; i++) ctx.lineTo(px(i), py(values[i]));
    ctx.lineTo(px(n - 1), y + h);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(i), py(values[i]));
  ctx.strokeStyle = hueCss(hue, 95, 72, 1);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const lx = px(n - 1);
  const ly = py(values[n - 1]);
  ctx.fillStyle = INK.hi;
  ctx.beginPath();
  ctx.arc(lx, ly, 5, 0, Math.PI * 2);
  ctx.fill();
  if (opts.baseline !== undefined) {
    ctx.fillStyle = INK.faint;
    const by = py(opts.baseline);
    for (let xx = x; xx < x + w; xx += 10) ctx.fillRect(xx, by, 5, 1.5);
  }
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, hue: number, warn = false) {
  ctx.fillStyle = INK.faint;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = warn ? INK.warn : hueCss(hue, 95, 70, 0.95);
  ctx.fillRect(x, y, Math.max(2, w * Math.min(1, Math.max(0, frac))), h);
}

/** Segmented Teenage-Engineering-style meter. */
export function segments(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, n: number, hue: number, warn = false) {
  const gap = 4;
  const sw = (w - gap * (n - 1)) / n;
  const lit = Math.round(frac * n);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i < lit ? (warn && i >= n * 0.8 ? INK.warn : hueCss(hue, 95, 70, 0.95)) : INK.faint;
    ctx.fillRect(x + i * (sw + gap), y, sw, h);
  }
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
