'use client';
/**
 * AI responses as holographic text in space. Sentences assemble from
 * particles: every glyph pixel is a point that flies in from the air and
 * lands on its place; the crisp text resolves once the words stop arriving.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAI } from '@/stores/ai';
import { clock } from '@/core/clock/masterClock';
import { faceFonts } from '@/modules/faces/draw';
import { usePrefs } from '@/stores/prefs';

const CW = 1024;
const CH = 224;
const MAX = 5200;
const WORLD_W = 1.15;
const WORLD_H = (WORLD_W * CH) / CW;

function layout(ctx: CanvasRenderingContext2D, text: string): string[] {
  ctx.font = `300 46px ${faceFonts().sans}`;
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > CW - 40 && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines.slice(-3);
}

export function HoloText() {
  const text = useAI((s) => s.response);
  const status = useAI((s) => s.status);
  const lastChange = useRef(0);
  const births = useRef(new Map<number, number>());

  const { canvas, ctx, tex, points, geo, mat, plane, planeMat, group } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geo.setAttribute('aSpawn', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uFade: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aSpawn; attribute float aBirth;
        uniform float uT;
        varying float vA;
        void main() {
          float s = clamp((uT - aBirth) / 0.75, 0.0, 1.0);
          float e = 1.0 - pow(1.0 - s, 3.0);
          vec3 p = mix(aSpawn, position, e);
          vA = s;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = mix(3.2, 1.8, e) * (3.0 / max(-mv.z, 0.2));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uFade; varying float vA;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float a = exp(-dot(q, q) * 2.5) * (0.35 + 0.65 * vA) * uFade;
          gl_FragColor = vec4(vec3(0.62, 0.8, 1.0) * a, 1.0);
        }
      `,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    const planeMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), planeMat);
    const group = new THREE.Group();
    group.add(points, plane);
    group.renderOrder = 40;
    return { canvas, ctx, tex, points, geo, mat, plane, planeMat, group };
  }, []);

  useEffect(() => {
    lastChange.current = clock.time;
    ctx.clearRect(0, 0, CW, CH);
    const lines = layout(ctx, text);
    ctx.fillStyle = '#e6f0ff';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, 20, 16 + i * 64));
    tex.needsUpdate = true;
    // sample glyph pixels
    const img = ctx.getImageData(0, 0, CW, CH).data;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const spawn = geo.attributes.aSpawn as THREE.BufferAttribute;
    const birth = geo.attributes.aBirth as THREE.BufferAttribute;
    const next = new Map<number, number>();
    let n = 0;
    const step = 3;
    for (let y = 0; y < CH && n < MAX; y += step)
      for (let x = 0; x < CW && n < MAX; x += step) {
        if (img[(y * CW + x) * 4 + 3] < 110) continue;
        const key = y * CW + x;
        const b = births.current.get(key) ?? clock.time + Math.random() * 0.25;
        next.set(key, b);
        const wx = (x / CW - 0.5) * WORLD_W;
        const wy = (0.5 - y / CH) * WORLD_H;
        pos.setXYZ(n, wx, wy, 0);
        const r = 0.5 + Math.random() * 0.9;
        const a = Math.random() * Math.PI * 2;
        spawn.setXYZ(n, wx + Math.cos(a) * r, wy + Math.sin(a) * r * 0.6, (Math.random() - 0.5) * 1.2);
        birth.setX(n, b);
        n++;
      }
    births.current = next;
    pos.needsUpdate = true;
    spawn.needsUpdate = true;
    birth.needsUpdate = true;
    geo.setDrawRange(0, n);
  }, [text, ctx, tex, geo]);

  useFrame(({ camera }) => {
    const t = clock.time;
    mat.uniforms.uT.value = t;
    const settled = t - lastChange.current;
    const idle = status !== 'streaming' && status !== 'thinking';
    // crisp text resolves once the words stop arriving; everything fades later
    const crisp = THREE.MathUtils.clamp((settled - 0.8) / 0.6, 0, 1);
    const life = idle ? 1 - THREE.MathUtils.clamp((settled - 9) / 2, 0, 1) : 1;
    planeMat.opacity = crisp * life * 0.95;
    mat.uniforms.uFade.value = (1 - crisp * 0.75) * life;
    // shown only when the person chose the hologram (captions are the default)
    group.visible = !!text && life > 0 && usePrefs.getState().replyDisplay !== 'captions';
    // below the ring in spatial form; beside the head when embodied
    const e = clock.embody.presence;
    group.position.set(THREE.MathUtils.lerp(0, -0.52, e), THREE.MathUtils.lerp(0.62, 1.63, e), THREE.MathUtils.lerp(-2.25, -1.62, e));
    group.scale.setScalar(THREE.MathUtils.lerp(1, 0.4, e));
    group.quaternion.copy(camera.quaternion);
    void canvas;
    void points;
    void plane;
  });

  return <primitive object={group} />;
}
