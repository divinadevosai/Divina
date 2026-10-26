'use client';
/**
 * The custom world's sky: a planet (rocky, gas giant, ice, lava or
 * earth-like), optional rings and moons, and a starfield. All procedural —
 * no textures to download. It turns only while the room's motion is on,
 * so a still room stays perfectly still.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from '@/stores/world';
import { useSystem } from '@/stores/system';
import { clock } from '@/core/clock/masterClock';
import type { CustomWorld } from '@/lib/worlds';

const TYPE = { none: 0, rocky: 1, gas: 2, ice: 3, lava: 4, earth: 5 } as const;

const NOISE = /* glsl */ `
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

const planetMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uType: { value: 1 },
      uA: { value: new THREE.Color('#c1440e') },
      uB: { value: new THREE.Color('#7a2a0a') },
      uGlow: { value: new THREE.Color('#9cc4ff') },
      uLight: { value: new THREE.Vector3(-0.6, 0.45, 0.65).normalize() },
      uSpin: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP; varying vec3 vView;
      void main(){
        vN = normalize(normalMatrix * normal);
        vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform int uType; uniform vec3 uA; uniform vec3 uB; uniform vec3 uGlow; uniform vec3 uLight; uniform float uSpin; uniform float uOpacity;
      varying vec3 vN; varying vec3 vP; varying vec3 vView;
      ${NOISE}
      void main(){
        vec3 p = normalize(vP);
        float c = cos(uSpin), s = sin(uSpin);
        vec3 q = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
        vec3 col; float emissive = 0.0;
        if (uType == 2) {            // gas giant: bands, gently warped
          float w = fbm(q * 3.0) * 0.35;
          float band = sin((q.y + w) * 18.0) * 0.5 + 0.5;
          col = mix(uA, uB, band * 0.8 + fbm(q * 9.0) * 0.2);
        } else if (uType == 3) {     // ice: pale, streaked
          float n = fbm(q * vec3(2.0, 9.0, 2.0));
          col = mix(uA, uB, smoothstep(0.35, 0.75, n));
        } else if (uType == 4) {     // lava: dark crust, glowing cracks
          float n = fbm(q * 4.0);
          float crack = 1.0 - smoothstep(0.02, 0.08, abs(n - 0.5));
          col = mix(uA, uA * 1.4, fbm(q * 12.0));
          col = mix(col, uB, crack);
          emissive = crack;
        } else if (uType == 5) {     // earth-like: oceans, land, clouds
          float land = smoothstep(0.48, 0.55, fbm(q * 2.5));
          col = mix(uA, uB, land);
          float cloud = smoothstep(0.55, 0.75, fbm(q * 4.0 + vec3(uSpin * 0.5, 0.0, 0.0)));
          col = mix(col, vec3(0.95), cloud * 0.85);
        } else {                     // rocky: mottled, cratered
          float n = fbm(q * 3.5);
          float crater = smoothstep(0.62, 0.66, noise(q * 14.0));
          col = mix(uA, uB, n) * (1.0 - crater * 0.25);
        }
        float lit = clamp(dot(normalize(vN), uLight), 0.0, 1.0);
        float shade = 0.08 + 0.92 * smoothstep(-0.05, 0.6, lit);
        vec3 outCol = col * shade + uB * emissive * 0.9;
        float rim = pow(1.0 - clamp(dot(normalize(vN), vView), 0.0, 1.0), 3.0);
        outCol += uGlow * rim * (0.35 + 0.65 * lit);   // a thin atmosphere on the lit side
        gl_FragColor = vec4(outCol, uOpacity);
      }`,
  });

const ringMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uColor: { value: new THREE.Color('#d8c7a0') }, uOpacity: { value: 0 }, uInner: { value: 1.35 }, uOuter: { value: 2.3 } },
    vertexShader: /* glsl */ `varying vec2 vXY; void main(){ vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uInner; uniform float uOuter; varying vec2 vXY;
      ${NOISE}
      void main(){
        float r = (length(vXY) - uInner) / (uOuter - uInner);
        if (r < 0.0 || r > 1.0) discard;
        float bands = 0.55 + 0.45 * sin(r * 70.0) * noise(vec3(r * 40.0, 0.0, 0.0));
        float edge = smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.9, 1.0, r));
        gl_FragColor = vec4(uColor * (0.7 + 0.3 * bands), uOpacity * edge * (0.35 + 0.5 * bands));
      }`,
  });

/** True while a planet is rising, sinking or handing over: the room draws every frame until it settles. */
export let planetMoving = false;

/** Where the planet hangs: far beyond the ring, up in the sky. */
const DISTANCE = 26;

export function Planet() {
  const group = useRef<THREE.Group>(null);
  const moons = useRef<THREE.Group>(null);
  const planet = useMemo(planetMaterial, []);
  const ring = useMemo(ringMaterial, []);
  const moonMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#cfd6e6', transparent: true, opacity: 0, fog: false, depthWrite: false }), []);
  const tier = useSystem((s) => s.tier);
  const seg = tier >= 2 ? 96 : 56;
  /** the planet being drawn, and how far it has risen into view (0 hidden … 1 in place) */
  const spec = useRef<CustomWorld | null>(null);
  const fade = useRef(0);
  const home = useRef({ x: 0, y: 0, r: 1 });

  const apply = (w: CustomWorld) => {
    spec.current = w;
    const pl = w.planet;
    planet.uniforms.uType.value = TYPE[pl.type];
    (planet.uniforms.uA.value as THREE.Color).set(pl.color);
    (planet.uniforms.uB.value as THREE.Color).set(pl.color2);
    (planet.uniforms.uGlow.value as THREE.Color).set(w.glow);
    (ring.uniforms.uColor.value as THREE.Color).set(pl.ringColor);
    home.current = { x: pl.x * 12, y: 5.2 + pl.size * 0.9, r: 2.6 * pl.size }; // high over the ring, fully in view
  };

  useFrame(() => {
    const ws = useWorld.getState();
    const target = ws.world === 'custom' && ws.custom && ws.custom.planet.type !== 'none' ? ws.custom : null;
    // One planet hands over to the next: the old one sinks away first, then
    // the new one rises into place, so a change of world reads as a move.
    const changing = !!spec.current && !!target && target !== spec.current && fade.current > 0.001;
    if (target && target !== spec.current && fade.current <= 0.001) apply(target);
    const want = target && !changing ? 1 : 0;
    const dt = Math.min(clock.dt, 0.05);
    fade.current = want > fade.current ? Math.min(1, fade.current + dt / 1.6) : Math.max(0, fade.current - dt / 0.6);
    const o = fade.current;
    const rise = o * o * (3 - 2 * o); // smoothstep
    const g = group.current;
    if (g) {
      const h = home.current;
      g.position.set(h.x, h.y - (1 - rise) * (3 + h.r * 0.8), -DISTANCE);
      g.scale.setScalar(h.r * (0.86 + 0.14 * rise));
      g.rotation.z = (1 - rise) * 0.12;
    }
    const haze = ws.custom ? 1 - ws.custom.haze * 0.45 : 1;
    planet.uniforms.uOpacity.value = rise * haze;
    ring.uniforms.uOpacity.value = spec.current?.planet.rings ? rise * haze : 0;
    moonMat.opacity = rise * haze * 0.95;
    if (g) g.visible = o > 0.003;
    planetMoving = changing || (o > 0 && o < 1) || (!!target && target !== spec.current);
    // turning only while the room is allowed to move
    if (clock.motion > 0) {
      planet.uniforms.uSpin.value += clock.dt * 0.03 * clock.motion;
      if (moons.current) moons.current.rotation.y += clock.dt * 0.05 * clock.motion;
    }
    if (moons.current) moons.current.children.forEach((m, i) => (m.visible = i < (spec.current?.planet.moons ?? 0)));
  });

  return (
    <group ref={group} visible={false} renderOrder={-10}>
      <mesh material={planet}>
        <sphereGeometry args={[1, seg, seg / 2]} />
      </mesh>
      <mesh material={ring} rotation={[-Math.PI / 2 + 0.38, 0.15, 0]}>
        <ringGeometry args={[1.35, 2.3, 128, 1]} />
      </mesh>
      <group ref={moons}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} material={moonMat} position={[Math.cos(i * 2.1 + 0.6) * (2.0 + i * 0.6), 0.25 - i * 0.2, Math.sin(i * 2.1 + 0.6) * (2.0 + i * 0.6)]}>
            <sphereGeometry args={[0.12 + i * 0.04, 24, 12]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A still field of stars on a far sphere, shown in the custom world. */
export function Stars() {
  const tier = useSystem((s) => s.tier);
  const count = [700, 1200, 1800, 2400][tier] ?? 1200;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      // the upper part of a big sphere: stars above the horizon
      const u = rnd() * Math.PI * 2;
      const v = 0.04 + rnd() * 0.96;
      const r = 60;
      pos.set([Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r * 0.8 + 2, Math.sin(u) * Math.sqrt(1 - v * v) * r], i * 3);
      size[i] = rnd() < 0.08 ? 2.4 : 1 + rnd();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#dbe6ff') } },
        vertexShader: /* glsl */ `attribute float aSize; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * 1.6; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform float uOpacity; uniform vec3 uColor; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(uColor, a * uOpacity); }`,
      }),
    [],
  );
  const pts = useRef<THREE.Points>(null);
  const fade = useRef(0);
  useFrame(() => {
    const ws = useWorld.getState();
    const want = ws.world === 'custom' && ws.custom ? ws.custom.stars : 0;
    fade.current += (want - fade.current) * (1 - Math.exp(-clock.dt * 1.6));
    mat.uniforms.uOpacity.value = fade.current * (ws.custom ? 1 - ws.custom.haze * 0.6 : 1);
    if (ws.custom) (mat.uniforms.uColor.value as THREE.Color).set('#dbe6ff').lerp(new THREE.Color(ws.custom.glow), 0.25);
    if (pts.current) pts.current.visible = fade.current > 0.003;
  });
  return <points ref={pts} geometry={geo} material={mat} visible={false} renderOrder={-20} />;
}
