/**
 * The interaction controller: intents in, state changes out.
 * Every input source — hands, mouse, keys, voice, ⌘K, the model — lands here.
 */
import { bus, type Intent } from '@/core/bus';
import { clock } from '@/core/clock/masterClock';
import { useRing } from '@/stores/ring';
import { useWorld } from '@/stores/world';
import { useEmbody } from '@/stores/embody';
import { log } from '@/stores/system';
import { audio } from '@/audio/engine';
import { MODULE_BY_ID } from '@/modules/meta';
import type { ModuleId } from '@/modules/ids';
import { replayDrawOn } from '@/render/cards/faces';
import { ensureLocation, refresh } from '@/modules/feeds';
import type { WorldId } from '@/render/world/worlds';
import { WORLDS } from '@/render/world/worlds';
import { transformTo } from '@/embodiment/control';

/** Intents that act on the ring; ignored while there is no ring. */
const RING_INTENTS = new Set<Intent['type']>(['rotate', 'rotate-continuous', 'grab', 'release', 'freeze', 'zoom', 'spread', 'multi-select', 'collapse']);

let userWorld: WorldId = 'studio';
let refusedAt = 0;
type Refusal = (text: string) => void;
let refuse: Refusal = () => {};
export function setRefusalVoice(fn: Refusal) {
  refuse = fn;
}

function reactWorld(m: ModuleId | null) {
  const w = useWorld.getState();
  // Projects transforms the room; Stocks turns the floor into a market;
  // Weather lets the room reflect the sky.
  if (m === 'projects') {
    if (w.world !== 'observatory') userWorld = w.world;
    w.setWorld('observatory');
  } else if (w.world === 'observatory' && userWorld !== 'observatory') {
    w.setWorld(userWorld);
  }
  w.setMarketFloor(m === 'stocks');
  w.setWeatherActive(m === 'weather');
  if (m === 'weather') void ensureLocation();
}

export function openModule(m: ModuleId, source: Intent['source']) {
  if (clock.embodied) return presentModule(m);
  const ring = useRing.getState();
  if (ring.expanded === m) return;
  if (ring.expanded) ring.expand(null);
  ring.setFront(m);
  ring.select(m);
  clock.pulseSelect();
  audio.play('select');
  reactWorld(m);
  void refresh(m);
  log('info', `open ${MODULE_BY_ID[m].title} · ${source}`);
  clock.startPresentation(m, (id) => {
    useRing.getState().expand(id);
    replayDrawOn(id);
    audio.play('open');
  });
}

export function collapse() {
  const ring = useRing.getState();
  if (clock.presentationActive) clock.cancelPresentation();
  if (!ring.expanded) return;
  ring.expand(null);
  ring.clearSelection();
  reactWorld(null);
  audio.play('close');
}

function presentModule(m: ModuleId) {
  if (clock.embodyPhase !== 'HUMANOID_ACTIVE') return;
  useEmbody.getState().present(m);
  void refresh(m);
  audio.play('open');
  log('info', `present ${MODULE_BY_ID[m].title}`);
}

export function installController() {
  return bus.on((i) => {
    if (i.type === 'deliberate') {
      // A deliberate gesture stops the film but keeps the outcome.
      if (clock.presentationActive) clock.cancelPresentation();
      return;
    }
    if (clock.embodied && RING_INTENTS.has(i.type)) {
      if (i.source === 'voice' || i.source === 'palette' || i.source === 'keyboard') {
        if (i.type === 'rotate' && performance.now() - refusedAt > 1500) {
          refusedAt = performance.now();
          refuse('There is no ring to rotate while I’m in this form.');
          audio.play('error');
        }
      }
      return;
    }
    const ring = useRing.getState();
    switch (i.type) {
      case 'rotate':
        if (ring.expanded) collapse();
        ring.rotate(i.steps);
        audio.play('swipe');
        return;
      case 'rotate-continuous':
        return;
      case 'open':
        return openModule(i.module, i.source);
      case 'present':
        return presentModule(i.module);
      case 'collapse':
        return collapse();
      case 'grab':
        ring.drag(i.module);
        ring.select(i.module);
        clock.pulseSelect();
        audio.play('grab');
        return;
      case 'release':
        if (ring.dragging) audio.play('drop');
        ring.drag(null);
        return;
      case 'freeze':
        if (ring.frozen !== i.on) {
          ring.setFrozen(i.on);
          audio.play('freeze');
          log('info', i.on ? 'palm held — ring frozen' : 'ring released');
        }
        return;
      case 'wake':
        return; // handled by the assistant
      case 'zoom':
        ring.setZoom(ring.zoom * i.factor);
        return;
      case 'spread':
        ring.setSpread(ring.spread + i.amount);
        return;
      case 'multi-select':
        ring.select(i.module, true);
        clock.pulseSelect();
        audio.play('tick');
        return;
      case 'world':
        if (useWorld.getState().world === i.world) return;
        userWorld = i.world;
        useWorld.getState().setWorld(i.world);
        audio.play('world');
        log('info', `world → ${WORLDS[i.world].name}`);
        return;
      case 'transform':
        transformTo(i.to, i.source);
        return;
    }
  });
}
