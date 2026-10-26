'use client';
/**
 * Hand reticle and light trails. Every gesture leaves a trail; a 2D canvas
 * with a fading buffer, drawn in rAF (no React per frame).
 */
import { useEffect, useRef } from 'react';
import { handCursor } from '@/stores/gesture';
import { useRing } from '@/stores/ring';

export function HandLayer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reticle = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const resize = () => {
      c.width = window.innerWidth * Math.min(2, devicePixelRatio);
      c.height = window.innerHeight * Math.min(2, devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = c.width;
      const h = c.height;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const tr = handCursor.trail;
      if (handCursor.visible && tr.length > 1) {
        const now = performance.now();
        for (let i = 1; i < tr.length; i++) {
          const a = tr[i - 1];
          const b = tr[i];
          const age = (now - b.t) / 450;
          ctx.strokeStyle = handCursor.pinching ? `rgba(220,235,255,${0.5 * (1 - age)})` : `rgba(140,185,255,${0.42 * (1 - age)})`;
          ctx.lineWidth = (handCursor.pinching ? 3 : 2) * Math.min(2, devicePixelRatio);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(a.x * w, a.y * h);
          ctx.lineTo(b.x * w, b.y * h);
          ctx.stroke();
        }
      }
      const r = reticle.current!;
      if (handCursor.visible) {
        r.style.opacity = '1';
        const s = handCursor.pinching ? 0.7 : useRing.getState().hovered ? 1.25 : 1;
        r.style.transform = `translate3d(${handCursor.x * window.innerWidth - 18}px, ${handCursor.y * window.innerHeight - 18}px, 0) scale(${s})`;
      } else r.style.opacity = '0';
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-10 h-full w-full" aria-hidden />
      <div ref={reticle} className="pointer-events-none fixed left-0 top-0 z-10 h-9 w-9 rounded-full border border-holo-hi/70 opacity-0 shadow-[0_0_18px_rgba(140,185,255,0.45)] transition-[opacity] duration-300" style={{ transition: 'opacity .3s, transform .08s linear' }} aria-hidden>
        <div className="absolute inset-[13px] rounded-full bg-holo-hi/80" />
      </div>
    </>
  );
}
