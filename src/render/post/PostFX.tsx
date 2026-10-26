'use client';
/**
 * Post chain, built by hand so every pass can be steered by the clock:
 *   Render → Depth of Field (tier ≥ 2) → Bloom → Grade
 * While embodied, depth of field and most of the vignette are released:
 * the ring's focus distance smears a face nearer than the ring, and the
 * vignette crops a bust that fills the frame into a black oval.
 */
import { isPhone } from '@/lib/device';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, KernelSize } from 'postprocessing';
import { ColorGradeEffect } from './ColorGradeEffect';
import { WORLDS, type Grade } from '../world/worlds';
import { useWorld } from '@/stores/world';
import { useSystem } from '@/stores/system';
import { useAI } from '@/stores/ai';
import { useRing } from '@/stores/ring';
import { clock } from '@/core/clock/masterClock';
import { approach } from '@/core/spring';
import { LOOK, READING_POS } from '../layout';

const cur: Grade = { ...WORLDS.studio.grade, shadowTint: [...WORLDS.studio.grade.shadowTint], highlightTint: [...WORLDS.studio.grade.highlightTint] };

export function PostFX() {
  const { gl, scene, camera, size } = useThree();
  const dpr = useThree((s) => s.viewport.dpr);
  const tier = useSystem((s) => s.tier);
  const phone = isPhone();

  const { composer, grade, bloom, dof, dofPass } = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    composer.addPass(new RenderPass(scene, camera));
    const dof = new DepthOfFieldEffect(camera, { focusDistance: 3.9, focusRange: 3.2, bokehScale: 2.2, resolutionScale: 0.5 });
    const dofPass = new EffectPass(camera, dof);
    composer.addPass(dofPass);
    const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.55, luminanceSmoothing: 0.3, intensity: 0.95, radius: 0.72, kernelSize: KernelSize.MEDIUM });
    composer.addPass(new EffectPass(camera, bloom));
    const grade = new ColorGradeEffect();
    composer.addPass(new EffectPass(camera, grade));
    return { composer, grade, bloom, dof, dofPass };
  }, [gl, scene, camera]);

  // Resize on CSS size AND pixel-ratio changes (tiers change the DPR).
  useEffect(() => {
    composer.setSize(size.width, size.height);
  }, [composer, size, dpr]);

  useEffect(() => {
    dofPass.enabled = tier >= 2;
    bloom.mipmapBlurPass.radius = tier >= 1 ? 0.72 : 0.6;
    // on a small screen the glow haloes the card text; keep it for the lights, not the words
    if (phone) {
      bloom.intensity = 0.5;
      bloom.luminanceMaterial.threshold = 0.8;
    }
    grade.u('uTaps').value = tier >= 1 ? 1 : 0;
  }, [tier, dofPass, bloom, grade, phone]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, rawDt) => {
    const dt = clock.dt || rawDt;
    const w = WORLDS[useWorld.getState().world].grade;
    const k = 1 - Math.exp(-dt * 2.4);
    for (let i = 0; i < 3; i++) {
      cur.shadowTint[i] += (w.shadowTint[i] - cur.shadowTint[i]) * k;
      cur.highlightTint[i] += (w.highlightTint[i] - cur.highlightTint[i]) * k;
    }
    cur.split += (w.split - cur.split) * k;
    cur.contrast += (w.contrast - cur.contrast) * k;
    cur.halation += (w.halation - cur.halation) * k;
    cur.bleed += (w.bleed - cur.bleed) * k;
    cur.warmth += (w.warmth - cur.warmth) * k;
    cur.saturation += (w.saturation - cur.saturation) * k;

    const emb = clock.embody;
    const cut = clock.cutT >= 0 ? Math.exp(-clock.cutT * 2.2) * (1 - Math.exp(-clock.cutT * 30)) : 0;
    (grade.u('uShadow').value as THREE.Vector3).set(...cur.shadowTint);
    (grade.u('uHighlight').value as THREE.Vector3).set(...cur.highlightTint);
    grade.u('uSplit').value = cur.split;
    grade.u('uContrast').value = cur.contrast;
    grade.u('uHalation').value = cur.halation;
    grade.u('uBleed').value = cur.bleed;
    grade.u('uWarmth').value = cur.warmth;
    grade.u('uSat').value = cur.saturation;
    grade.u('uCut').value = cut;
    grade.u('uWake').value = clock.wakeT;
    const awake = useAI.getState().awake ? 1 : 0;
    grade.u('uAwake').value = approach(grade.u('uAwake').value as number, awake, 0.6, dt);
    grade.u('uVignette').value = 0.55 * (1 - emb.body * 0.8);
    grade.u('uSeed').value = (clock.motionTime * 60) % 1000;
    grade.u('uExposure').value = 1 - emb.dim * 0.25 + emb.core * 0.25;

    // Focus exactly on what's being read: the front card of the ring (LOOK),
    // or the opened card. Any error here shows up as soft text.
    const reading = useRing.getState().expanded || clock.presentation.module ? 1 : 0;
    const focus = camera.position.distanceTo(reading ? READING_POS : LOOK);
    const coc = dof.cocMaterial;
    coc.focusDistance = approach(coc.focusDistance, focus, 0.5, dt);
    coc.focusRange = reading ? 1.6 : 4.4;
    dof.bokehScale = 2.2 * (1 - emb.dim);
    dofPass.enabled = tier >= 2 && emb.dim < 0.999;

    composer.render(dt);
  }, 1);

  return null;
}
