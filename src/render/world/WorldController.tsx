'use client';
/** Interpolates the live world look toward the selected world and weather. */
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WORLDS } from './worlds';
import { useWorld } from '@/stores/world';
import { live } from '../live';
import { clock } from '@/core/clock/masterClock';

const tmp = new THREE.Color();

function lerpColor(target: THREE.Color, hex: string, k: number) {
  target.lerp(tmp.set(hex), k);
}

export function WorldController() {
  useFrame(() => {
    const ws = useWorld.getState();
    const w = WORLDS[ws.world];
    const k = 1 - Math.exp(-clock.dt * 2.2);
    let fogDensity = w.fogDensity;
    let dust = w.dustDensity;
    let beams = w.beamIntensity;
    let fogHex = w.fog;
    if (ws.weatherActive) {
      switch (ws.weather) {
        case 'fog':
          fogDensity *= 2.1;
          fogHex = '#141a26';
          break;
        case 'clouds':
          fogDensity *= 1.4;
          beams *= 0.5;
          break;
        case 'rain':
        case 'storm':
          fogDensity *= 1.5;
          beams *= 0.35;
          fogHex = '#060a12';
          break;
        case 'snow':
          dust = 1;
          fogDensity *= 1.3;
          break;
        case 'clear':
          beams *= 1.8;
          break;
      }
    }
    lerpColor(live.fog, fogHex, k);
    lerpColor(live.key, w.key, k);
    lerpColor(live.beam, ws.weatherActive && ws.weather === 'clear' ? '#ffe9c4' : w.beam, k);
    lerpColor(live.dust, w.dust, k);
    lerpColor(live.floorColor, w.floorColor, k);
    live.fogDensity += (fogDensity - live.fogDensity) * k;
    live.beamIntensity += (beams - live.beamIntensity) * k;
    live.dustDensity += (dust - live.dustDensity) * k;
  }, -50);
  return null;
}
