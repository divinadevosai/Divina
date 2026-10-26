'use client';
/**
 * Divina's mind: what she knows and can do, as a living constellation.
 * Her core in the middle; a glowing hub for each branch (About you, People,
 * Plans, Agents, Skills…); every item a node branching off it, and faint
 * threads between things that share a name or a place. Tap a branch to look
 * closer, tap a node to see it and act on it (forget, tick off, visit, try).
 * Drawn on a 2D canvas: crisp on every screen and light enough for phones.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { buildMind, type Branch, type MindNode } from '@/lib/mind';
import { closeMind, useMind } from '@/stores/mind';
import { personalOp, usePersonal, loadPersonal, notesOp } from '@/lib/client/personal';
import { useData } from '@/stores/data';
import { refresh } from '@/modules/feeds';
import { IOS } from '@/lib/edition';
import { asWorld } from '@/lib/worlds';
import { useWorld } from '@/stores/world';
import { useT } from '@/lib/i18n';
import { useCompact } from './useCompact';
import type { Agent, Note } from '@/lib/personal';

interface Placed extends MindNode {
  x: number;
  y: number;
  r: number;
  hue: number;
  delay: number;
}
interface Hub {
  b: Branch;
  x: number;
  y: number;
  angle: number;
  delay: number;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

/** Lay the mind out around the core: hubs on a circle, each branch's nodes fanned outward. */
function layout(branches: Branch[], scale: number): { hubs: Hub[]; nodes: Placed[] } {
  const hubs: Hub[] = [];
  const nodes: Placed[] = [];
  const n = branches.length;
  branches.forEach((b, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const hr = 0.3 * scale;
    const hub = { b, x: Math.cos(angle) * hr, y: Math.sin(angle) * hr, angle, delay: 0.25 + i * 0.07 };
    hubs.push(hub);
    const count = b.nodes.length;
    const fan = Math.min(Math.PI * 0.95, (Math.PI * 2) / n + count * 0.035);
    b.nodes.forEach((node, k) => {
      // rings outward as the branch fills up, the way a tree grows twigs
      const ring = Math.floor(k / 9);
      const inRing = Math.min(9, count - ring * 9);
      const slot = k % 9;
      const a = angle + (inRing > 1 ? (slot / (inRing - 1) - 0.5) * fan * (1 - ring * 0.12) : 0) + (hash(node.id) - 0.5) * 0.12;
      const d = (0.14 + ring * 0.075 + hash(node.id + 'd') * 0.035) * scale;
      nodes.push({ ...node, x: hub.x + Math.cos(a) * d, y: hub.y + Math.sin(a) * d, r: node.kind === 'skill' ? 2.6 : 3.4, hue: b.hue, delay: hub.delay + 0.35 + Math.min(k, 30) * 0.035 });
    });
  });
  return { hubs, nodes };
}

const noun: Record<string, [string, string]> = {
  you: ['thing', 'things'],
  people: ['person', 'people'],
  health: ['thing', 'things'],
  work: ['thing', 'things'],
  places: ['place', 'places'],
  plans: ['to-do', 'to-dos'],
  routines: ['routine', 'routines'],
  agents: ['agent', 'agents'],
  worlds: ['world', 'worlds'],
  skills: ['skill', 'skills'],
};
const countText = (b: Branch) => `${b.nodes.length} ${noun[b.id][b.nodes.length === 1 ? 0 : 1]}`;

export function Mind() {
  const open = useMind((s) => s.open);
  return <AnimatePresence>{open && <MindView key="mind" />}</AnimatePresence>;
}

function MindView() {
  const tr = useT();
  const compact = useCompact();
  const personal = usePersonal();
  const notesMd = useData((s) => s.modules.notes);
  const agentsMd = useData((s) => s.modules.agents);
  const city = useData((s) => (s.modules.weather?.status === 'ok' && !/near you/i.test((s.modules.weather.data as { place?: string }).place ?? '') ? (s.modules.weather.data as { place?: string }).place : undefined));
  const notes = notesMd?.status === 'ok' ? ((notesMd.data as { notes: Note[] }).notes ?? []) : [];
  const agents = agentsMd?.status === 'ok' ? ((agentsMd.data as { agents: Agent[] }).agents ?? []) : [];
  const mind = useMemo(
    () => buildMind({ memory: personal.memory, notes, agents, routines: personal.routines, worlds: personal.worlds, city, ios: IOS }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal.memory, personal.routines, personal.worlds, notesMd, agentsMd, city],
  );
  const [selected, setSelected] = useState<MindNode | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ rot: 0, zoom: 1, cx: 0, cy: 0, tx: 0, ty: 0, tzoom: 1, drag: null as null | { x: number; y: number; rot: number; moved: boolean } });
  const hover = useRef<string | null>(null);
  const placed = useRef<{ hubs: Hub[]; nodes: Placed[]; scale: number }>({ hubs: [], nodes: [], scale: 1 });
  const born = useRef(performance.now());
  const seen = useRef(new Map<string, number>());

  // fresh from storage each time she opens her mind
  useEffect(() => {
    void loadPersonal();
    void refresh('notes');
    void refresh('agents');
  }, []);

  // anything learned while the mind is open sparks onto its branch
  useEffect(() => {
    const now = performance.now();
    for (const b of mind.branches) for (const n of b.nodes) if (!seen.current.has(n.id)) seen.current.set(n.id, seen.current.size === 0 && now - born.current < 500 ? 0 : now);
  }, [mind]);

  // the draw loop
  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const stars = Array.from({ length: 160 }, (_, i) => ({ x: hash(`sx${i}`), y: hash(`sy${i}`), r: 0.4 + hash(`sr${i}`) * 1.1, p: hash(`sp${i}`) * 6.28 }));
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const t = (now - born.current) / 1000;
      const v = view.current;
      // ease the camera toward its target
      v.cx += (v.tx - v.cx) * 0.12;
      v.cy += (v.ty - v.cy) * 0.12;
      v.zoom += (v.tzoom - v.zoom) * 0.12;
      if (!v.drag) v.rot += 0.0006 * (focus ? 0 : 1);
      const scale = compact ? Math.min(w * 0.95, h * 0.62) : Math.min(w * 0.9, h * 0.86);
      if (placed.current.scale !== scale || placed.current.nodes.length !== mind.total) placed.current = { ...layout(mind.branches, scale), scale };
      const { hubs, nodes } = placed.current;
      g.clearRect(0, 0, w, h);
      for (const s of stars) {
        g.fillStyle = `rgba(200,215,255,${(0.15 + 0.25 * Math.sin(t * 0.8 + s.p) ** 2) * ease(t / 1.2)})`;
        g.beginPath();
        g.arc(s.x * w, s.y * h, s.r, 0, 6.283);
        g.fill();
      }
      const ox = w / 2 - v.cx * v.zoom;
      const oy = h / 2 + (compact ? -h * 0.02 : 0) - v.cy * v.zoom;
      const cos = Math.cos(v.rot);
      const sin = Math.sin(v.rot);
      const P = (x: number, y: number) => [ox + (x * cos - y * sin) * v.zoom, oy + (x * sin + y * cos) * v.zoom] as const;
      const grow = (d: number, len = 0.6) => ease((t - d) / len);
      const focusHub = focus ? hubs.find((hb) => hb.b.id === focus) : null;
      const dim = (branch: string) => (focus && branch !== focus ? 0.22 : 1);
      g.globalCompositeOperation = 'lighter';
      // threads between related things
      const byId = new Map(nodes.map((n) => [n.id, n]));
      for (const [a, b] of mind.links) {
        const na = byId.get(a);
        const nb = byId.get(b);
        if (!na || !nb) continue;
        const k = Math.min(grow(na.delay + 0.4), grow(nb.delay + 0.4)) * (focus ? (na.branch === focus || nb.branch === focus ? 1 : 0.15) : 1);
        if (k <= 0) continue;
        const [x1, y1] = P(na.x, na.y);
        const [x2, y2] = P(nb.x, nb.y);
        const [mx, my] = P((na.x + nb.x) * 0.25, (na.y + nb.y) * 0.25);
        g.strokeStyle = `rgba(190,205,255,${0.16 * k})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x1, y1);
        g.quadraticCurveTo(mx, my, x2, y2);
        g.stroke();
      }
      // core → hubs
      const [cx0, cy0] = P(0, 0);
      for (const hb of hubs) {
        const k = grow(hb.delay - 0.1, 0.7) * dim(hb.b.id);
        const [hx, hy] = P(hb.x, hb.y);
        const grad = g.createLinearGradient(cx0, cy0, hx, hy);
        grad.addColorStop(0, `rgba(235,242,255,${0.5 * k})`);
        grad.addColorStop(1, hsl(hb.b.hue, 85, 70, 0.75 * k));
        g.strokeStyle = grad;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx0, cy0);
        g.lineTo(cx0 + (hx - cx0) * grow(hb.delay - 0.1, 0.7), cy0 + (hy - cy0) * grow(hb.delay - 0.1, 0.7));
        g.stroke();
      }
      // hubs → nodes, and the nodes
      for (const n of nodes) {
        const hb = hubs.find((x) => x.b.id === n.branch)!;
        const k = grow(n.delay, 0.5) * dim(n.branch);
        if (k <= 0) continue;
        const [hx, hy] = P(hb.x, hb.y);
        const [nx, ny] = P(n.x, n.y);
        const px = hx + (nx - hx) * grow(n.delay, 0.5);
        const py = hy + (ny - hy) * grow(n.delay, 0.5);
        g.strokeStyle = hsl(n.hue, 80, 68, 0.55 * k);
        g.lineWidth = 1.1;
        g.beginPath();
        g.moveTo(hx, hy);
        g.lineTo(px, py);
        g.stroke();
        const learned = seen.current.get(n.id) ?? 0;
        const fresh = learned ? Math.max(0, 1 - (now - learned) / 4000) : 0;
        const hot = hover.current === n.id || selected?.id === n.id;
        const tw = 0.75 + 0.25 * Math.sin(t * 2 + hash(n.id) * 6.28);
        const r = n.r * (hot ? 1.8 : 1) * (1 + fresh * 1.5) * Math.min(v.zoom, 1.6);
        const glow = g.createRadialGradient(px, py, 0, px, py, r * 5);
        glow.addColorStop(0, hsl(n.hue, 90, 75, 0.55 * k * tw));
        glow.addColorStop(1, hsl(n.hue, 90, 60, 0));
        g.fillStyle = glow;
        g.beginPath();
        g.arc(px, py, r * 5, 0, 6.283);
        g.fill();
        g.fillStyle = hsl(n.hue, 70, 88, k);
        g.beginPath();
        g.arc(px, py, r, 0, 6.283);
        g.fill();
        if (fresh > 0) {
          g.strokeStyle = hsl(n.hue, 90, 80, fresh);
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(px, py, r + (1 - fresh) * 30, 0, 6.283);
          g.stroke();
        }
      }
      // hub orbs
      for (const hb of hubs) {
        const k = grow(hb.delay + 0.2, 0.5) * dim(hb.b.id);
        const [hx, hy] = P(hb.x, hb.y);
        const pulse = 1 + 0.08 * Math.sin(t * 1.6 + hb.angle * 3);
        const R = 26 * pulse * Math.min(v.zoom, 1.4) * (compact ? 0.8 : 1);
        const glow = g.createRadialGradient(hx, hy, 0, hx, hy, R * 2.2);
        glow.addColorStop(0, hsl(hb.b.hue, 90, 70, 0.5 * k));
        glow.addColorStop(1, hsl(hb.b.hue, 90, 55, 0));
        g.fillStyle = glow;
        g.beginPath();
        g.arc(hx, hy, R * 2.2, 0, 6.283);
        g.fill();
        g.strokeStyle = hsl(hb.b.hue, 85, 78, 0.95 * k);
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(hx, hy, R * 0.32, 0, 6.283);
        g.stroke();
        g.fillStyle = `rgba(6,9,20,${0.9 * k})`;
        g.beginPath();
        g.arc(hx, hy, R * 0.22, 0, 6.283);
        g.fill();
      }
      // her core
      const ck = ease(t / 0.5);
      const cr = (compact ? 34 : 44) * (1 + 0.05 * Math.sin(t * 2.1)) * Math.min(v.zoom, 1.4);
      const cg = g.createRadialGradient(cx0, cy0, 0, cx0, cy0, cr * 2.4);
      cg.addColorStop(0, `rgba(255,255,255,${ck})`);
      cg.addColorStop(0.18, `rgba(234,242,255,${0.95 * ck})`);
      cg.addColorStop(0.45, `rgba(143,184,255,${0.45 * ck})`);
      cg.addColorStop(1, 'rgba(143,184,255,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(cx0, cy0, cr * 2.4, 0, 6.283);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      // words: her name, the branch names and counts, and node names up close
      g.textAlign = 'center';
      g.fillStyle = `rgba(240,245,255,${0.9 * ck})`;
      g.font = `600 ${compact ? 10 : 12}px ui-monospace, "JetBrains Mono", monospace`;
      g.fillText('D I V I N A', cx0, cy0 + cr * 0.9 + 14);
      for (const hb of hubs) {
        if (focusHub && hb !== focusHub) continue;
        const k = grow(hb.delay + 0.5, 0.5) * dim(hb.b.id);
        if (focusHub) {
          // up close: the branch's name under its own light
          const [hx, hy] = P(hb.x, hb.y);
          g.fillStyle = 'rgba(240,245,255,0.95)';
          g.font = `600 ${compact ? 13 : 18}px Inter, system-ui, sans-serif`;
          g.fillText(tr(`mind.${hb.b.id}` as never).toUpperCase(), hx, hy + 52);
          g.fillStyle = hsl(hb.b.hue, 85, 72, 0.95);
          g.font = `500 ${compact ? 10 : 12}px ui-monospace, "JetBrains Mono", monospace`;
          g.fillText(countText(hb.b), hx, hy + (compact ? 68 : 72));
          continue;
        }
        const far = 0.3 * scale + 0.14 * scale + Math.min(2, Math.floor(hb.b.nodes.length / 9)) * 0.075 * scale + 0.06 * scale;
        const [lx, ly] = P(Math.cos(hb.angle) * far, Math.sin(hb.angle) * far);
        const x = Math.min(w - (compact ? 52 : 90), Math.max(compact ? 52 : 90, lx));
        const y = Math.min(h - (compact ? 70 : 76), Math.max(compact ? 96 : 100, ly));
        g.fillStyle = `rgba(240,245,255,${0.95 * k})`;
        g.font = `600 ${compact ? 12 : 17}px Inter, system-ui, sans-serif`;
        g.fillText(tr(`mind.${hb.b.id}` as never).toUpperCase(), x, y);
        g.fillStyle = hsl(hb.b.hue, 85, 72, 0.95 * k);
        g.font = `500 ${compact ? 10 : 12}px ui-monospace, "JetBrains Mono", monospace`;
        g.fillText(countText(hb.b), x, y + (compact ? 15 : 19));
      }
      if (focusHub || v.zoom > 1.25) {
        // labels beside their lights, on the side away from the hub, nudged apart so none overlap
        g.font = `500 ${compact ? 11 : 12.5}px Inter, system-ui, sans-serif`;
        const lh = compact ? 15 : 17;
        const shown = nodes
          .filter((n) => !focusHub || n.branch === focusHub.b.id)
          .map((n) => {
            const hb = hubs.find((x) => x.b.id === n.branch)!;
            const [nx, ny] = P(n.x, n.y);
            const [hx] = P(hb.x, hb.y);
            const right = nx >= hx;
            return { n, nx, ny, y: ny, right, wd: g.measureText(n.label).width };
          })
          .sort((a, b) => a.ny - b.ny);
        for (const side of [true, false]) {
          let last = -Infinity;
          for (const l of shown.filter((x) => x.right === side)) {
            l.y = Math.max(l.ny, last + lh);
            last = l.y;
          }
        }
        for (const l of shown) {
          const x = l.right ? Math.min(l.nx + 10, w - l.wd - 8) : Math.max(l.nx - 10, l.wd + 8);
          g.textAlign = l.right ? 'left' : 'right';
          if (Math.abs(l.y - l.ny) > 2) {
            g.strokeStyle = 'rgba(200,215,255,0.25)';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(l.nx, l.ny);
            g.lineTo(x + (l.right ? -3 : 3), l.y - 4);
            g.stroke();
          }
          g.fillStyle = `rgba(225,233,255,${0.9 * grow(l.n.delay + 0.3, 0.4)})`;
          g.fillText(l.n.label, x, l.y);
        }
        g.textAlign = 'center';
      } else if (hover.current) {
        const n = nodes.find((x) => x.id === hover.current);
        if (n) {
          const [nx, ny] = P(n.x, n.y);
          g.font = `500 13px Inter, system-ui, sans-serif`;
          const tw = g.measureText(n.label).width + 20;
          g.fillStyle = 'rgba(8,11,24,0.85)';
          g.beginPath();
          g.roundRect(nx - tw / 2, ny - 38, tw, 24, 8);
          g.fill();
          g.fillStyle = 'rgba(235,242,255,0.95)';
          g.fillText(n.label, nx, ny - 21);
        }
      }
      (window as unknown as { __mind?: unknown }).__mind = { hubs: hubs.map((hb) => ({ id: hb.b.id, at: P(hb.x, hb.y), count: hb.b.nodes.length })), nodes: nodes.map((n) => ({ id: n.id, at: P(n.x, n.y) })) };
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [mind, focus, selected, compact, tr]);

  // pointer: hover, tap, drag to turn, wheel to zoom
  const hit = (x: number, y: number) => {
    const m = (window as unknown as { __mind?: { hubs: { id: string; at: readonly [number, number] }[]; nodes: { id: string; at: readonly [number, number] }[] } }).__mind;
    if (!m) return null;
    let best: { kind: 'node' | 'hub'; id: string; d: number } | null = null;
    for (const n of m.nodes) {
      const d = Math.hypot(n.at[0] - x, n.at[1] - y);
      if (d < 16 && (!best || d < best.d)) best = { kind: 'node', id: n.id, d };
    }
    for (const hb of m.hubs) {
      const d = Math.hypot(hb.at[0] - x, hb.at[1] - y);
      if (d < 30 && (!best || d < best.d - 4)) best = { kind: 'hub', id: hb.id, d };
    }
    return best;
  };
  const nodeById = (id: string) => mind.branches.flatMap((b) => b.nodes).find((n) => n.id === id) ?? null;
  const focusOn = (id: string | null) => {
    const v = view.current;
    setFocus(id);
    const hb = id ? placed.current.hubs.find((x) => x.b.id === id) : null;
    if (hb) {
      const cos = Math.cos(v.rot);
      const sin = Math.sin(v.rot);
      v.tzoom = compact ? 1.5 : 1.7;
      v.tx = (hb.x * cos - hb.y * sin) * 1.15;
      v.ty = (hb.x * sin + hb.y * cos) * 1.15;
    } else {
      v.tzoom = 1;
      v.tx = v.ty = 0;
    }
  };
  const onDown = (e: React.PointerEvent) => {
    view.current.drag = { x: e.clientX, y: e.clientY, rot: view.current.rot, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const v = view.current;
    if (v.drag) {
      const dx = e.clientX - v.drag.x;
      if (Math.abs(dx) > 4) v.drag.moved = true;
      if (v.drag.moved && !focus) v.rot = v.drag.rot + dx * 0.005;
    }
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const hHit = hit(e.clientX - r.left, e.clientY - r.top);
    hover.current = hHit?.kind === 'node' ? hHit.id : null;
    (e.target as HTMLElement).style.cursor = hHit ? 'pointer' : v.drag?.moved ? 'grabbing' : 'grab';
  };
  const onUp = (e: React.PointerEvent) => {
    const v = view.current;
    const moved = v.drag?.moved;
    v.drag = null;
    if (moved) return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const hHit = hit(e.clientX - r.left, e.clientY - r.top);
    if (hHit?.kind === 'node') setSelected(nodeById(hHit.id));
    else if (hHit?.kind === 'hub') focusOn(focus === hHit.id ? null : hHit.id);
    else if (selected) setSelected(null);
    else if (focus) focusOn(null);
  };
  const onWheel = (e: React.WheelEvent) => {
    const v = view.current;
    v.tzoom = Math.min(2.4, Math.max(0.7, v.tzoom * (e.deltaY > 0 ? 0.92 : 1.08)));
  };

  // keys: Esc steps back out, then closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (selected) setSelected(null);
      else if (focus) focusOn(null);
      else closeMind();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const act = async (n: MindNode, what: string) => {
    setMsg(null);
    if (what === 'forget' && n.ref) {
      const r = await personalOp('memory', { op: 'remove', id: n.ref });
      setMsg(r.message ?? null);
      setSelected(null);
    } else if (what === 'done' && n.ref) {
      const r = await notesOp({ op: 'done', id: n.ref });
      setMsg(r.message ?? null);
      setSelected(null);
    } else if (what === 'visit' && n.ref) {
      const w = personal.worlds.find((x) => x.id === n.ref);
      if (w) useWorld.getState().setCustom(asWorld(w));
      closeMind();
    } else {
      // talk to an agent, run a routine, try a skill: say it to Divina
      const phrase = what === 'talk' ? `talk to ${n.label}` : what === 'run' ? n.label.replace(/[“”]/g, '') : n.example ?? '';
      closeMind();
      const { handle } = await import('@/ai/assistant');
      if (phrase && !/^tap /.test(phrase)) void handle(phrase, 'palette');
    }
  };
  const actions = (n: MindNode): [string, string][] =>
    n.kind === 'memory' ? [['forget', 'Forget this']] : n.kind === 'note' ? [['done', 'Tick it off']] : n.kind === 'agent' ? [['talk', `Talk to ${n.label}`]] : n.kind === 'routine' ? [['run', 'Run it']] : n.kind === 'world' ? [['visit', 'Go there']] : n.kind === 'skill' && n.example && !/^tap /.test(n.example) ? [['try', `Try “${n.example}”`]] : [];
  const branchOf = (n: MindNode) => mind.branches.find((b) => b.id === n.branch)!;
  const empty = mind.branches.every((b) => b.id === 'skills' || b.nodes.length === 0);

  return (
    <motion.div className="fixed inset-0 z-[62] select-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} role="dialog" aria-label="Divina’s mind">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(20,29,72,0.975), rgba(5,7,16,0.99) 70%)' }} />
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => (hover.current = null)} onWheel={onWheel} />
      <div className={`pointer-events-none absolute left-0 right-0 flex items-start justify-between ${compact ? 'top-[max(16px,env(safe-area-inset-top))] px-4' : 'top-7 px-8'}`}>
        <div>
          <div className="font-mono text-[11px] tracking-[0.3em] text-holo-hi">DIVINA · {tr('mind.title').toUpperCase()}</div>
          <div className="mt-1 text-[13px] text-ink-mid">{tr('mind.sub', { n: String(mind.total) })}</div>
        </div>
        <button className="pointer-events-auto rounded-full border border-ink-faint bg-black/30 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-mid hover:text-ink" onClick={closeMind}>
          {compact ? tr('mind.close').split(' · ')[0] : tr('mind.close')}
        </button>
      </div>
      {!selected && (
        <div className={`pointer-events-none absolute inset-x-0 text-center text-[12.5px] text-ink-lo ${compact ? 'bottom-[max(18px,env(safe-area-inset-bottom))]' : 'bottom-7'}`}>
          {empty ? tr('mind.empty') : focus ? tr('mind.hintFocus') : tr('mind.hint')}
        </div>
      )}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            className={`glass absolute rounded-2xl p-4 ${compact ? 'inset-x-3 bottom-[max(14px,env(safe-area-inset-bottom))]' : 'bottom-8 right-8 w-[380px]'}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.2em]" style={{ color: hsl(branchOf(selected).hue, 85, 75) }}>
                {tr(`mind.${selected.branch}` as never)}
              </span>
              <button className="text-[12px] text-ink-lo hover:text-ink" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <div className="mt-1.5 text-[16px] leading-snug text-ink">{selected.kind === 'memory' || selected.kind === 'note' ? selected.detail : selected.label}</div>
            {selected.kind !== 'memory' && selected.kind !== 'note' && <p className="mt-1 text-[13px] leading-snug text-ink-mid">{selected.detail}</p>}
            {selected.at > 0 && <p className="mt-1 text-[11.5px] text-ink-lo">{tr('mind.learned', { when: new Date(selected.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {actions(selected).map(([what, label]) => (
                <button key={what} className={`rounded-lg border px-3 py-1.5 text-[13px] ${what === 'forget' ? 'border-warn/60 text-warn hover:bg-warn/10' : 'border-holo/60 bg-holo/10 text-ink hover:bg-holo/20'}`} onClick={() => void act(selected, what)}>
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {msg && <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-[13px] text-holo-hi">{msg}</div>}
      {/* the same, for screen readers */}
      <ul className="sr-only">
        {mind.branches.map((b) => (
          <li key={b.id}>
            {b.label}: {b.nodes.map((n) => n.label).join(', ')}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

