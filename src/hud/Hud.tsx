'use client';
import { useCompact } from './useCompact';
/**
 * Minimal HUD, four corners:
 *   top-left     system status · FPS · tracking · GPU · motion lock
 *   top-right    clock · date · world
 *   bottom-left  system log
 *   bottom-right gesture · confidence · voice status
 * It dissolves with everything else when DIVINA takes human form.
 * As a new tab (the extension) it's calmer: the clock, a search box and the
 * dock, with the gesture readout only while hand tracking is on.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSystem } from '@/stores/system';
import { useGesture } from '@/stores/gesture';
import { useAI } from '@/stores/ai';
import { useWorld } from '@/stores/world';
import { useEmbody } from '@/stores/embody';
import { bus } from '@/core/bus';
import { useRing } from '@/stores/ring';
import { WORLDS } from '@/render/world/worlds';
import { tracker } from '@/gesture/tracker';
import { listener, speechSupported } from '@/ai/listen';
import { interrupt } from '@/ai/assistant';
import { useTimers } from '@/ai/headsup';
import { useT } from '@/lib/i18n';
import { audio } from '@/audio/engine';
import { openLauncher } from '@/launcher/state';
import { openSettings } from '@/lib/client/settings';
import { prefStorage } from '@/lib/consent';
import { EXTENSION } from '@/lib/edition';
import { SearchBar } from './SearchBar';

const ease = [0.22, 1, 0.36, 1] as const;

function Label({ children }: { children: React.ReactNode }) {
  return <span className="hud-label">{children}</span>;
}

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'ok' | 'warn' | 'lo' }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <Label>{k}</Label>
      <span className={`font-mono text-[11px] tabular ${tone === 'warn' ? 'text-warn' : tone === 'lo' ? 'text-ink-lo' : 'text-ink'}`}>{v}</span>
    </div>
  );
}

function SystemBlock() {
  const fps = useSystem((s) => s.fps);
  const tier = useSystem((s) => s.tier);
  const gpu = useSystem((s) => s.gpu);
  const tracking = useSystem((s) => s.tracking);
  const pending = useSystem((s) => s.pendingTier);
  const degraded = fps > 0 && fps < 40;
  return (
    <div className="w-[248px] space-y-1.5">
      <div className="flex items-center gap-2 pb-1">
        <span className={`h-1.5 w-1.5 rounded-full ${degraded ? 'bg-warn' : 'bg-holo'} shadow-[0_0_10px_currentColor]`} />
        <span className="font-mono text-[11px] tracking-[0.3em] text-ink">DIVINA</span>
        <span className="hud-label">{degraded ? 'degraded' : 'nominal'}</span>
      </div>
      <Row k="fps" v={fps ? Math.round(fps) : '—'} tone={degraded ? 'warn' : undefined} />
      <Row k="quality" v={`T${tier}${pending !== null ? ` → T${pending}` : ''}`} tone="lo" />
      <Row k="tracking" v={tracking} tone={tracking === 'denied' || tracking === 'error' ? 'warn' : tracking === 'off' ? 'lo' : undefined} />
      <Row k="gpu" v={<span className="block max-w-[150px] truncate">{gpu}</span>} tone="lo" />
      <MotionLock />
    </div>
  );
}

/** LOCKED / DRIFT — a control that states its own consequence. */
function MotionLock() {
  const on = useWorld((s) => s.motionOn);
  return (
    <button
      onClick={() => {
        audio.unlock();
        audio.play('tick');
        useWorld.getState().setMotion(!on);
      }}
      className="group mt-2 flex w-full items-center justify-between border-t border-ink-faint pt-2 text-left"
      aria-pressed={on}
      title="Toggle ambient motion (M)"
    >
      <span className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 border ${on ? 'border-holo bg-holo/40' : 'border-ink-mid bg-transparent'}`} />
        <span className="font-mono text-[11px] tracking-[0.2em] text-ink">{on ? 'DRIFT' : 'LOCKED'}</span>
      </span>
      <span className="text-[10px] text-ink-lo group-hover:text-ink-mid">{on ? 'room floats gently' : 'room holds still'}</span>
    </button>
  );
}

function ClockBlock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const world = useWorld((s) => s.world);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return null;
  const running = <Timers now={now.getTime()} />;
  if (compact)
    return (
      <div className="text-right">
        <div className="font-mono text-[18px] font-light leading-none text-ink tabular">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="mt-1 hud-label">{now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        {running}
      </div>
    );
  return (
    <div className="text-right">
      <div className="font-mono text-[28px] font-light leading-none tracking-tight text-ink tabular">
        {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        <span className="text-[14px] text-ink-lo">:{String(now.getSeconds()).padStart(2, '0')}</span>
      </div>
      <div className="mt-1.5 hud-label">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="mt-1 hud-label !text-ink-mid">{WORLDS[world].name}</div>
      {running}
    </div>
  );
}

/** Running timers and reminders, counting down under the clock. */
function Timers({ now }: { now: number }) {
  const timers = useTimers((s) => s.timers);
  if (!timers.length) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {timers.slice(0, 3).map((t) => {
        const s = Math.max(0, Math.round((t.endsAt - now) / 1000));
        const clock = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        return (
          <div key={t.id} className="font-mono text-[11px] tabular text-holo-hi">
            ⏱ {clock} <span className="text-ink-mid">{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function LogBlock() {
  const logs = useSystem((s) => s.logs);
  const lines = logs.slice(-6);
  return (
    <div className="w-[360px] space-y-0.5" aria-live="polite">
      <Label>system log</Label>
      <div className="mt-1 space-y-0.5">
        <AnimatePresence initial={false}>
          {lines.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 0.35 + (0.65 * (i + 1)) / lines.length, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
              className="flex gap-2 font-mono text-[10.5px] leading-[1.45]"
            >
              <span className="text-ink-lo tabular">{new Date(l.t).toLocaleTimeString(undefined, { hour12: false })}</span>
              <span className={l.level === 'warn' || l.level === 'error' ? 'text-warn' : l.level === 'ok' ? 'text-holo-hi' : 'text-ink-mid'}>{l.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function GestureBlock() {
  const g = useGesture((s) => s.gesture);
  const c = useGesture((s) => s.confidence);
  const hands = useGesture((s) => s.hands);
  const status = useAI((s) => s.status);
  const frozen = useRing((s) => s.frozen);
  return (
    <div className="w-[220px] space-y-1.5 text-right">
      <Label>gesture</Label>
      <div className="font-mono text-[15px] tracking-wide text-ink">{g === 'none' ? '—' : g.replace(/-/g, ' ')}</div>
      <div className="flex items-center justify-end gap-2">
        <div className="h-[3px] w-28 bg-ink-faint">
          <motion.div className="h-full bg-holo" animate={{ width: `${Math.round(c * 100)}%` }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} />
        </div>
        <span className="font-mono text-[10px] text-ink-lo tabular">{Math.round(c * 100)}%</span>
      </div>
      <div className="hud-label">
        {hands} hand{hands === 1 ? '' : 's'}
        {frozen ? ' · frozen' : ''}
      </div>
      <div className="pt-2">
        <Label>voice</Label>
        <div className={`font-mono text-[12px] uppercase tracking-[0.2em] ${status === 'offline' ? 'text-ink-lo' : status === 'interrupted' ? 'text-warn' : 'text-holo-hi'}`}>
          {status}
        </div>
      </div>
    </div>
  );
}

function Dock({ compact = false }: { compact?: boolean }) {
  const tr = useT();
  const tracking = useSystem((s) => s.tracking);
  const mic = useAI((s) => s.micOn);
  const handsOn = tracking !== 'off' && tracking !== 'denied' && tracking !== 'error';
  const btn = compact
    ? 'glass rounded-full px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-mid transition active:text-ink'
    : 'glass rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mid transition hover:text-ink';
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      {/* hand tracking is for a webcam facing you across a desk, not a phone in your hand */}
      {!compact && (
      <button
        className={`${btn} ${handsOn ? '!text-holo-hi' : ''}`}
        onClick={() => {
          audio.unlock();
          if (tracker.active) tracker.stop();
          else void tracker.start();
          try {
            prefStorage.set('divina.hands', tracker.active ? '0' : '1');
          } catch {
            /* storage unavailable */
          }
        }}
        aria-pressed={handsOn}
      >
        {handsOn ? `● ${tr('hands')}` : `○ ${tr('hands')}`}
      </button>
      )}
      {speechSupported() && (
        <button
          className={`${btn} ${mic ? '!text-holo-hi' : ''}`}
          onClick={() => {
            audio.unlock();
            if (listener.active) listener.stop();
            else {
              if (listener.tapToTalk) interrupt(); // tapping "talk" while she speaks means: stop and listen
              listener.start();
            }
          }}
          aria-pressed={mic}
        >
          {compact ? (mic ? `● ${tr('listening')}` : `○ ${tr('talk')}`) : mic ? `● ${tr('voice')}` : `○ ${tr('voice')}`}
        </button>
      )}
      <button className={btn} onClick={() => openLauncher()} aria-label="Type a command">
        {compact ? `⌨ ${tr('type')}` : '⌘K'}
      </button>
      <button className={btn} onClick={() => openSettings()} aria-label="Settings">
        {compact ? '⚙' : `⚙ ${tr('settings')}`}
      </button>
    </div>
  );
}

/**
 * In human form the HUD steps away, so this is the one way back that's
 * always on screen (voice and ⌘K "spatial" still work too).
 */
function ReturnButton() {
  const tr = useT();
  const phase = useEmbody((s) => s.phase);
  const show = phase === 'HUMANOID_FORMING' || phase === 'HUMANOID_ACTIVE';
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="return"
          className="pointer-events-none fixed inset-x-0 bottom-7 z-20 flex justify-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.8, ease }}
        >
          <button
            className="glass pointer-events-auto rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink transition hover:text-holo-hi"
            onClick={() => {
              audio.unlock();
              bus.emit({ type: 'transform', to: 'spatial', source: 'mouse' });
            }}
          >
            ◁ {tr('returnSpatial')}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Mark() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-holo shadow-[0_0_10px_currentColor]" />
      <span className="font-mono text-[11px] tracking-[0.3em] text-ink">DIVINA</span>
    </div>
  );
}

/** The new tab: search front and centre, the clock, the dock; nothing to read that isn't for you. */
function NewTabHud({ compact }: { compact: boolean }) {
  const tracking = useSystem((s) => s.tracking);
  const handsOn = tracking !== 'off' && tracking !== 'denied' && tracking !== 'error';
  const edge = compact ? 'left-4 right-4 top-[max(16px,env(safe-area-inset-top))]' : 'left-7 right-7 top-7';
  return (
    <>
      <div className={`absolute flex items-start justify-between ${edge}`}>
        <Mark />
        <ClockBlock compact={compact} />
      </div>
      <div className={`absolute inset-x-0 flex justify-center ${compact ? 'top-20' : 'top-[9vh]'}`}>
        <SearchBar />
      </div>
      {handsOn && !compact && (
        <div className="absolute bottom-7 right-7">
          <GestureBlock />
        </div>
      )}
      <div className={`absolute inset-x-0 flex justify-center ${compact ? 'bottom-[max(16px,env(safe-area-inset-bottom))]' : 'bottom-7'}`}>
        <Dock compact={compact} />
      </div>
    </>
  );
}

export function Hud() {
  const visible = useSystem((s) => s.hudVisible);
  const booted = useSystem((s) => s.booted);
  const phase = useEmbody((s) => s.phase);
  const embodied = phase !== 'NORMAL';
  const show = visible && booted && !embodied;
  const compact = useCompact();
  return (
    <>
      <ReturnButton />
      <AnimatePresence>
        {show && (
          <motion.div
            key="hud"
            className={`pointer-events-none fixed inset-0 z-20 select-none ${compact ? '' : 'p-7'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: embodied ? 0.9 : 0.8, ease }}
          >
            {EXTENSION ? (
              <NewTabHud compact={compact} />
            ) : compact ? (
              <>
                {/* a phone: just the essentials, clear of the notch and the home bar */}
                <div className="absolute left-4 top-[max(16px,env(safe-area-inset-top))]">
                  <Mark />
                </div>
                <div className="absolute right-4 top-[max(16px,env(safe-area-inset-top))]">
                  <ClockBlock compact />
                </div>
                <div className="absolute inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] flex justify-center">
                  <Dock compact />
                </div>
              </>
            ) : (
              <>
                <div className="absolute left-7 top-7 pointer-events-auto">
                  <SystemBlock />
                </div>
                <div className="absolute right-7 top-7">
                  <ClockBlock />
                </div>
                <div className="absolute bottom-7 left-7">
                  <LogBlock />
                </div>
                <div className="absolute bottom-7 right-7">
                  <GestureBlock />
                </div>
                <div className="absolute bottom-7 left-1/2 -translate-x-1/2">
                  <Dock />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
