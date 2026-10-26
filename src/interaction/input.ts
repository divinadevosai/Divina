/**
 * Mouse and keyboard — the fallback when hands are not tracked.
 *   drag horizontally → rotate · click a card → open · click empty → close
 *   hold on a card → grab (release returns it to its slot)
 *   wheel → rotate · ←/→ rotate · Enter open · Esc close
 *   Space (hold) talk · M motion · H HUD · F freeze · 1–6 worlds
 */
import { bus } from '@/core/bus';
import { pointer } from '@/render/pointer';
import { useRing, frontModule } from '@/stores/ring';
import { useWorld } from '@/stores/world';
import { useSystem } from '@/stores/system';
import { audio } from '@/audio/engine';
import { clock } from '@/core/clock/masterClock';
import { WORLD_IDS } from '@/render/world/worlds';
import { wake } from '@/ai/assistant';
import { listener } from '@/ai/listen';

const STEP_PX = 120;
const HOLD_MS = 380;

export function installInput(el: HTMLElement) {
  let down: { x: number; y: number; t: number; moved: boolean; acc: number; hold?: number; grabbed: boolean; touch: boolean } | null = null;
  let lastWheel = 0;

  const toNdc = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    pointer.inside = true;
    pointer.lastMove = performance.now();
  };

  /**
   * Over a panel (Settings, ⌘K, an opened card's details, a toast…) rather
   * than the room itself. Those sit inside `el` too, so without this their
   * scrolling turned the ring and their clicks opened the card behind them.
   */
  const overUi = (e: Event) => !(e.target instanceof HTMLCanvasElement);

  const onMove = (e: PointerEvent) => {
    if (!down && overUi(e)) {
      pointer.inside = false; // no card is hovered through a panel
      return;
    }
    toNdc(e);
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 8 || Math.abs(e.clientY - down.y) > 8) {
      down.moved = true;
      if (down.hold && !down.grabbed) window.clearTimeout(down.hold);
    }
    if (down.grabbed) return;
    const steps = Math.trunc((dx - down.acc) / STEP_PX);
    if (steps !== 0) {
      down.acc += steps * STEP_PX;
      // drag left brings the right-hand card in
      bus.emit({ type: 'rotate', steps: -steps, source: 'mouse' });
    }
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || overUi(e)) return;
    audio.unlock();
    toNdc(e);
    const hovered = useRing.getState().hovered;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, acc: 0, grabbed: false, touch: e.pointerType !== 'mouse' };
    if (hovered && !clock.embodied) {
      const d = down;
      d.hold = window.setTimeout(() => {
        if (!d.moved && useRing.getState().hovered === hovered) {
          d.grabbed = true;
          bus.emit({ type: 'grab', module: hovered, source: 'mouse' });
        }
      }, HOLD_MS);
    }
  };

  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  const onUp = async () => {
    if (!down) return;
    const d = down;
    down = null;
    if (d.hold) window.clearTimeout(d.hold);
    if (d.grabbed) return bus.emit({ type: 'release', source: 'mouse' });
    if (d.moved) {
      if (d.touch) pointer.inside = false;
      return;
    }
    // A finger has no hover: the card under it is found on the next frames, from where it touched.
    if (d.touch && !useRing.getState().hovered) {
      await nextFrame();
      await nextFrame();
      await nextFrame();
    }
    const ring = useRing.getState();
    if (ring.hovered) bus.emit({ type: 'open', module: ring.hovered, source: 'mouse' });
    else if (ring.expanded) bus.emit({ type: 'collapse', source: 'mouse' });
    if (d.touch) pointer.inside = false; // and nothing stays "hovered" after the finger lifts
  };

  const onCancel = () => {
    if (down?.hold) window.clearTimeout(down.hold);
    if (down?.grabbed) bus.emit({ type: 'release', source: 'mouse' });
    down = null;
  };

  const onWheel = (e: WheelEvent) => {
    if (overUi(e)) return; // scrolling a panel scrolls the panel, not the ring
    const now = performance.now();
    if (now - lastWheel < 280 || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 12) return;
    lastWheel = now;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    bus.emit({ type: 'rotate', steps: d > 0 ? 1 : -1, source: 'mouse' });
  };

  const typing = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };

  const onKey = (e: KeyboardEvent) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    audio.unlock();
    const ring = useRing.getState();
    switch (e.key) {
      case 'ArrowRight':
        bus.emit({ type: 'rotate', steps: 1, source: 'keyboard' });
        break;
      case 'ArrowLeft':
        bus.emit({ type: 'rotate', steps: -1, source: 'keyboard' });
        break;
      case 'Enter':
        bus.emit({ type: 'open', module: ring.hovered ?? frontModule(ring.frontStep), source: 'keyboard' });
        break;
      case 'Escape':
        bus.emit({ type: 'collapse', source: 'keyboard' });
        break;
      case 'm':
      case 'M':
        useWorld.getState().setMotion(!useWorld.getState().motionOn);
        audio.play('tick');
        break;
      case 'h':
      case 'H':
        useSystem.getState().toggleHud();
        break;
      case 'f':
      case 'F':
        bus.emit({ type: 'freeze', on: !ring.frozen, source: 'keyboard' });
        break;
      case ' ':
        if (!e.repeat) {
          e.preventDefault();
          if (!listener.active) listener.start();
          wake('space');
        }
        break;
      default:
        if (/^[1-6]$/.test(e.key)) bus.emit({ type: 'world', world: WORLD_IDS[Number(e.key) - 1], source: 'keyboard' });
    }
  };

  const onLeave = (e: PointerEvent) => {
    // a lifting finger "leaves" at once; the tap is resolved in onUp, which clears it after
    if (e.pointerType !== 'mouse') return;
    pointer.inside = false;
  };

  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('keydown', onKey);
  return () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
  };
}
