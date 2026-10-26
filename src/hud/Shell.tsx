'use client';
/**
 * The shell: one WebGL room plus a thin DOM layer. Installs every input
 * source and the assistant, then boots.
 */
// first: in the browser edition this answers /api/* before anything asks
import '@/web/install';
import dynamic from 'next/dynamic';
import { EXTENSION, IOS, WEB } from '@/lib/edition';
import { useToasts } from '@/stores/toasts';
import { Component, useEffect, useRef, useState } from 'react';
import { preferFlat, rememberFlat } from '@/lib/device';
import { activeAgent } from '@/lib/client/personal';
import { startFeeds } from '@/modules/feeds';
import { setFaceFonts } from '@/modules/faces/draw';
import { setClientFacts, updateFaces } from '@/render/cards/faces';
import { installDebug } from '@/lib/client/debug';
import { awakeReason } from '@/render/governor';
import { installController } from '@/interaction/controller';
import { installInput } from '@/interaction/input';
import { installGestures, tracker } from '@/gesture/engine';
import { installAssistant, handle } from '@/ai/assistant';
import { isCompact } from './useCompact';
import { useSystem, log } from '@/stores/system';
import { useAI } from '@/stores/ai';
import { boot } from '@/core/motion/vocabulary';
import { audio } from '@/audio/engine';
import { Hud } from './Hud';
import { Boot } from './Boot';
import { ModulePanel } from './ModulePanel';
import { EmbodiedPanels } from './EmbodiedPanels';
import { Toasts } from './Toasts';
import { HandLayer } from './HandLayer';
import { VoiceBar } from './VoiceBar';
import { Fallback } from './Fallback';
import { Launcher } from '@/launcher/Launcher';
import { SettingsPanel } from './SettingsPanel';
import { Captions } from './Captions';
import { TranslatorBar } from './TranslatorBar';
import { ShareCardDialog } from './ShareCard';
import { Tour, startTour, tourDone } from './Tour';
import { t as tr } from '@/lib/i18n';
import { ConfirmPrompt } from './ConfirmPrompt';
import { loadPrefs } from '@/stores/prefs';
import { loadConsent, prefStorage, useConsent } from '@/lib/consent';
import { CookieNotice } from './CookieNotice';
import { Mind } from './Mind';
import { LicenceGate } from './LicenceGate';

const Scene = dynamic(() => import('@/render/scene/Scene'), { ssr: false });

function hasWebGL2() {
  try {
    const ctx = document.createElement('canvas').getContext('webgl2');
    // give the test context straight back: phones allow only a few, and little memory
    ctx?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!ctx;
  } catch {
    return false;
  }
}

/** If the 3D room fails to start or crashes, show the simple view instead of an error page. */
class SceneGuard extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    rememberFlat(true);
    log('warn', `3D view failed (${err instanceof Error ? err.message : String(err)}) · switched to the simple view`);
    useSystem.getState().setWebgl('none');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Shell() {
  const [gl, setGl] = useState<'unknown' | 'ok' | 'none'>('unknown');
  const root = useRef<HTMLElement>(null);
  const response = useAI((s) => s.response);

  useEffect(() => {
    setGl(!preferFlat() && hasWebGL2() ? 'ok' : 'none');
    const offGl = useSystem.subscribe((s) => s.webgl === 'none' && setGl('none'));
    loadConsent();
    loadPrefs();
    const cs = getComputedStyle(document.documentElement);
    setFaceFonts({ sans: cs.getPropertyValue('--font-inter') || 'system-ui', mono: cs.getPropertyValue('--font-jetbrains') || 'monospace' });
    void document.fonts?.ready.then(() => updateFaces(performance.now(), true));
    startFeeds();
    // the verification hook is for local test runs, never the public site
    if (!WEB) installDebug({ awakeReason, handle });
    installGestures();
    const offs = [installController(), installAssistant(), installInput(root.current!)];
    const t = window.setTimeout(() => {
      useSystem.getState().setBooted();
      const welcome = () => {
        // first visit: the tour (it covers what the welcome note says)
        if (!tourDone()) startTour();
        // browser edition: say how to unlock the AI when there's no key yet (not on every new tab: the tour said it)
        else if (WEB && !EXTENSION && !useAI.getState().online) {
          useToasts.getState().push({
            kind: 'info',
            text: IOS ? tr('welcomeTitle').split(' — ')[0] : tr('welcomeTitle'), // the iPhone app isn't the free edition
            detail: `${isCompact() ? tr('welcomePhone') : tr('welcomeDesktop')} ${tr('welcomeKey')}`,
            ms: 15000,
          });
        }
      };
      // the cookie choice comes first; the welcome follows once it's made
      if (useConsent.getState().choice) welcome();
      else {
        const off = useConsent.subscribe((c) => {
          if (!c.choice) return;
          off();
          welcome();
        });
      }
    }, boot.done * 1000);
    // a new tab never switches the camera on by itself: hands start when you tap them
    try {
      if (!EXTENSION && prefStorage.get('divina.hands') === '1') void tracker.start();
    } catch {
      /* storage unavailable */
    }
    // audio ducking + facts shown on the cards
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      audio.update();
      if (now - last > 1000) {
        last = now;
        const s = useSystem.getState();
        const a = useAI.getState();
        setClientFacts({ agent: activeAgent()?.name, fps: s.fps, gpu: s.gpu, aiStatus: a.status, aiTurns: a.history.length, ambient: audio.ambient, net: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      offs.forEach((o) => o());
      offGl();
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <main ref={root} className="fixed inset-0 touch-none">
      {gl === 'ok' && (
        <SceneGuard>
          <Scene />
        </SceneGuard>
      )}
      {gl === 'none' && <Fallback />}
      <HandLayer />
      <Hud />
      <ModulePanel />
      <EmbodiedPanels />
      <VoiceBar />
      <Captions />
      <TranslatorBar />
      <ShareCardDialog />
      <Tour />
      <CookieNotice />
      <Mind />
      <Toasts />
      <Launcher />
      <SettingsPanel />
      <ConfirmPrompt />
      <Boot />
      <LicenceGate />
      <div className="sr-only" aria-live="polite">
        {response}
      </div>
    </main>
  );
}
