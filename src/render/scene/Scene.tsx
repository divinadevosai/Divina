'use client';
import { Planet, Stars } from '../world/Planet';
import { isPhone, rememberFlat } from '@/lib/device';
import { useToasts } from '@/stores/toasts';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, lazy } from 'react';
import { ClockDriver } from './ClockDriver';
import { FrameGovernor } from './FrameGovernor';
import { CameraRig } from './CameraRig';
import { PerfMonitor, setMaxTier } from './PerfMonitor';
import { WorldController } from '../world/WorldController';
import { FogVolume } from '../atmosphere/FogVolume';
import { Floor } from '../atmosphere/Floor';
import { Beams } from '../atmosphere/Beams';
import { Dust } from '../atmosphere/Dust';
import { CardRing } from '../cards/CardRing';
import { PostFX } from '../post/PostFX';
import { EYE, FOV } from '../layout';
import { useSystem, type Tier } from '@/stores/system';
import { log } from '@/stores/system';

const MarketFloor = lazy(() => import('../world/MarketFloor').then((m) => ({ default: m.MarketFloor })));
const WeatherFX = lazy(() => import('../world/WeatherFX').then((m) => ({ default: m.WeatherFX })));
const HoloText = lazy(() => import('../fx/HoloText').then((m) => ({ default: m.HoloText })));
const Embodiment = lazy(() => import('@/embodiment/Embodiment').then((m) => ({ default: m.Embodiment })));

// Card text is drawn at 2x, so the top tier doesn't need to render the whole scene at 1.75x.
const DPR: Record<Tier, number> = { 0: 0.75, 1: 1, 2: 1.35, 3: 1.5 };
// Phones: 2x keeps card text sharp on their dense screens. What overwhelmed iPhones before was
// full-size card images and depth of field, not this (a 390 px wide screen at 2x is small).
const PHONE_DPR: Record<Tier, number> = { 0: 2, 1: 2, 2: 2, 3: 2 };

function guessTier(gpu: string): Tier {
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 0;
  if (/mali|adreno|powervr|intel\(r\) (hd|uhd)/.test(g)) return 1;
  if (/apple m\d|rtx|radeon rx|geforce|apple gpu/.test(g)) return 3;
  return 2;
}

export default function Scene() {
  const tier = useSystem((s) => s.tier);
  const phone = isPhone();
  return (
    <Canvas
      className="!fixed inset-0"
      flat
      frameloop="demand"
      dpr={[0.5, Math.min((phone ? PHONE_DPR : DPR)[tier], typeof window !== 'undefined' ? window.devicePixelRatio : 1)]}
      camera={{ fov: FOV, near: 0.05, far: 200, position: [EYE.x, EYE.y, EYE.z] }}
      gl={{ antialias: false, alpha: false, powerPreference: phone ? 'default' : 'high-performance', stencil: false, depth: true, preserveDrawingBuffer: false }}
      onCreated={({ gl, scene, camera }) => {
        (window as unknown as { __three: unknown }).__three = { gl, scene, camera };
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.NoToneMapping;
        const ctx = gl.getContext();
        const ext = ctx.getExtension('WEBGL_debug_renderer_info');
        const gpu = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
        // phones start at the lightest tier and may only step up one
        const t = phone ? 0 : guessTier(gpu);
        const forced = new URLSearchParams(location.search).get('tier');
        const tierStart = (forced !== null ? Math.min(3, Math.max(0, Number(forced))) : t) as Tier;
        setMaxTier(forced !== null ? tierStart : phone ? 1 : (Math.max(t, 1) as Tier));
        // If the browser takes the 3D view away (a phone short of graphics memory), carry on in the
        // simple view rather than crashing, and start there next time in this tab.
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          rememberFlat(true);
          log('warn', 'the browser stopped the 3D view (low graphics memory) · switched to the simple view');
          useSystem.getState().setWebgl('none');
          useToasts.setState({ toasts: [] }); // the new view explains itself; nothing should cover it
          useToasts.getState().push({ kind: 'info', text: 'Switched to the simple view', detail: 'This device ran low on graphics memory, so Divina is showing your cards without the 3D room. Everything else still works.', ms: 5000 });
        });
        useSystem.setState({ tier: tierStart });
        useSystem.getState().setWebgl('ok', gpu.replace(/ANGLE \((.*)\)/, '$1').slice(0, 64));
        log('ok', `WebGL2 · ${gpu.slice(0, 48)}`);
        log('info', `quality tier ${tierStart}`);
      }}
    >
      <ClockDriver />
      <FrameGovernor />
      <WorldController />
      <CameraRig />
      <FogVolume />
      <Floor />
      <Beams />
      <Dust />
      <Stars />
      <Planet />
      <CardRing />
      <Suspense fallback={null}>
        <MarketFloor />
        <WeatherFX />
        <HoloText />
        <Embodiment />
      </Suspense>
      <PerfMonitor />
      {/* at a phone's resolution the passes are cheap; depth of field stays off below tier 2 */}
      <PostFX />
    </Canvas>
  );
}
