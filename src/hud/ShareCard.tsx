'use client';
/**
 * Share a card: the card as a polished 1080×1350 image (the Instagram
 * portrait size) on the room's colours, with a small Divina mark. Shown
 * first so the person can check nothing private is on it; then the phone's
 * share sheet, or a download.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { getFace, updateFaces } from '@/render/cards/faces';
import { MODULE_BY_ID, hueCss } from '@/modules/meta';
import type { ModuleId } from '@/modules/ids';
import { useWorld } from '@/stores/world';
import { WORLDS } from '@/render/world/worlds';

export const useShare = create<{ id: ModuleId | null }>(() => ({ id: null }));
export const shareCard = (id: ModuleId) => useShare.setState({ id });

const W = 1080;
const H = 1350;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Draw the share image for a card. */
export function renderShare(id: ModuleId): HTMLCanvasElement {
  updateFaces(performance.now(), true);
  const face = getFace(id).canvas;
  const meta = MODULE_BY_ID[id];
  const ws = useWorld.getState();
  const sky = WORLDS[ws.world].fog;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // the room's sky, lit from below in the card's own colour
  const bg = g.createRadialGradient(W / 2, H * 0.95, 50, W / 2, H * 0.6, H * 0.9);
  bg.addColorStop(0, hueCss(meta.hue, 80, 45, 0.9));
  bg.addColorStop(0.45, sky);
  bg.addColorStop(1, '#03040a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // a few stars
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(220,232,255,${0.15 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H * 0.7, rnd() * 1.6 + 0.3, 0, Math.PI * 2);
    g.fill();
  }
  // the card: glass panel with a soft glow, the face on top
  const cw = 780;
  const ch = Math.round(cw * (face.height / face.width));
  const x = (W - cw) / 2;
  const y = 150;
  g.save();
  g.shadowColor = hueCss(meta.hue, 95, 65, 0.55);
  g.shadowBlur = 80;
  roundRect(g, x, y, cw, ch, 40);
  g.fillStyle = 'rgba(40,58,105,0.55)';
  g.fill();
  g.restore();
  g.save();
  roundRect(g, x, y, cw, ch, 40);
  g.clip();
  const glass = g.createLinearGradient(0, y, 0, y + ch);
  glass.addColorStop(0, 'rgba(120,150,220,0.35)');
  glass.addColorStop(1, 'rgba(40,60,120,0.25)');
  g.fillStyle = glass;
  g.fillRect(x, y, cw, ch);
  g.drawImage(face, x, y, cw, ch);
  g.restore();
  g.strokeStyle = hueCss(meta.hue, 90, 75, 0.7);
  g.lineWidth = 2.5;
  roundRect(g, x, y, cw, ch, 40);
  g.stroke();
  // the mark
  g.fillStyle = 'rgba(236,244,255,0.92)';
  g.font = '600 34px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '12px';
  g.fillText('DIVINA', W / 2 + 6, H - 92);
  if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2px';
  g.fillStyle = 'rgba(200,218,245,0.6)';
  g.font = '400 22px Inter, system-ui, sans-serif';
  g.fillText('your screen, turned into a room', W / 2, H - 56);
  return c;
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));

export function ShareCardDialog() {
  const id = useShare((s) => s.id);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const c = renderShare(id);
    setUrl(c.toDataURL('image/png'));
    void toBlob(c).then((b) => alive && setBlob(b));
    return () => {
      alive = false;
      setUrl(null);
      setBlob(null);
      setMsg(null);
    };
  }, [id]);
  const close = () => useShare.setState({ id: null });
  const name = id ? `divina-${id}-${new Date().toISOString().slice(0, 10)}.png` : 'divina.png';
  const file = blob ? new File([blob], name, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  const download = () => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(u), 5000);
    setMsg('Saved to your downloads.');
  };
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: `My ${id ? MODULE_BY_ID[id].title : ''} on Divina` });
      close();
    } catch {
      /* the person closed the share sheet */
    }
  };
  return (
    <AnimatePresence>
      {id && (
        <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="glass w-[min(420px,92vw)] space-y-3 rounded-2xl p-4" role="dialog" aria-label="Share card">
            {url && <img src={url} alt={`Your ${MODULE_BY_ID[id].title} card as an image`} className="w-full rounded-xl border border-ink-faint" />}
            <p className="text-[12.5px] leading-snug text-ink-mid">Check the picture first: anything on the card (names, numbers, emails) will be in it.</p>
            <div className="flex flex-wrap gap-2">
              {canShare && (
                <button className="rounded-lg border border-holo/60 bg-holo/15 px-4 py-2 text-[13px] text-ink" onClick={() => void share()}>
                  Share…
                </button>
              )}
              <button className="rounded-lg border border-holo/50 px-4 py-2 text-[13px] text-holo-hi" onClick={download} disabled={!blob}>
                Download
              </button>
              <button className="ml-auto rounded-lg border border-ink-faint px-4 py-2 text-[13px] text-ink-mid" onClick={close}>
                Cancel
              </button>
            </div>
            {msg && <p className="text-[12px] text-holo-hi">{msg}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
