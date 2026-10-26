/**
 * Holographic glass card.
 *
 * Gold and warning colours obey two rules:
 *  1. Gold (≈36°) must never read as warning orange (≈18°). The gold term
 *     is multiplied by (1 − warn) with warn a hard 0/1 flag: a warned card
 *     can never go gold.
 *  2. Gold is drawn DIMMER than blue. No border multiplier above 1.0 — that
 *     clips red and green to white. Gold earns prominence from hue and a
 *     wider outer bloom (the halo), not from brightness.
 */
import * as THREE from 'three';
import { EDGE_FACTOR_GLSL } from '@/core/clock/timeline';
import { CARD_H, CARD_W } from '../layout';

export const GOLD = new THREE.Color(0.78, 0.56, 0.24); // hue ≈ 35.6°, luma ≈ 0.58
export const WARN = new THREE.Color(0.95, 0.355, 0.12); // hue ≈ 17°
export const BLUE = new THREE.Color(0.55, 0.75, 1.0); // luma ≈ 0.73
/** light thrown behind a gold card: paler so the bloom stays gold, not amber */
export const GOLD_THROW = new THREE.Color(0.86, 0.72, 0.46);

export function createCardMaterial(face: THREE.Texture, accent: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    // Cards write depth so depth of field knows where they are: without it the
    // blur saw the background behind a card and softened the card's own text.
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uFace: { value: face },
      uAccent: { value: accent.clone() },
      uBlue: { value: BLUE },
      uGoldColor: { value: GOLD },
      uWarnColor: { value: WARN },
      uSize: { value: new THREE.Vector2(CARD_W, CARD_H) },
      uHover: { value: 0 },
      uSelect: { value: 0 },
      uGold: { value: 0 },
      uWarn: { value: 0 },
      uDim: { value: 0 },
      uOpacity: { value: 1 },
      uScan: { value: -1 },
      uPulse: { value: -1 },
      uTime: { value: 0 },
      uErodeStart: { value: 999 },
      uErodeSpan: { value: 1 },
      uEmbodyT: { value: 0 },
      uDrag: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uFace;
      uniform vec3 uAccent, uBlue, uGoldColor, uWarnColor;
      uniform vec2 uSize;
      uniform float uHover, uSelect, uGold, uWarn, uDim, uOpacity, uScan, uPulse, uTime;
      uniform float uErodeStart, uErodeSpan, uEmbodyT, uDrag;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vN;
      ${EDGE_FACTOR_GLSL}
      float sdRoundRect(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }
      void main() {
        // Edge-first erosion on exactly the curve the particles leave on.
        float leave = uErodeStart + divinaEdgeFactor(vUv) * uErodeSpan;
        if (uEmbodyT > leave) discard;

        vec2 p = (vUv - 0.5) * uSize;
        float d = sdRoundRect(p, uSize * 0.5, 0.07);
        if (d > 0.0) discard;
        float aa = 1.0 - smoothstep(-0.003, 0.0, d);

        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        // Fake curvature: the pane bows slightly so fresnel varies across it.
        vec2 bow = (vUv - 0.5) * 2.0;
        float facing = clamp(dot(V, normalize(N + vec3(bow.x, bow.y, 0.0) * 0.18)), 0.0, 1.0);
        float fres = pow(clamp(1.0 - facing, 0.0, 1.0), 3.0);

        float warn = step(0.5, uWarn);
        float gold = uGold * (1.0 - warn);

        // Glass body
        vec3 glass = vec3(0.018, 0.03, 0.065) + uAccent * 0.035 + uGoldColor * gold * 0.05;
        glass += uBlue * fres * 0.22;
        // Reflection streak that slides with the viewing angle
        float streak = dot(vWorld.xy, vec2(0.62, 0.78)) * 1.6 + dot(V, vec3(1.0, 0.25, 0.0)) * 3.2;
        glass += vec3(0.75, 0.85, 1.0) * pow(clamp(sin(streak) * 0.5 + 0.5, 0.0, 1.0), 26.0) * 0.07;

        // Face
        vec4 face = texture2D(uFace, vUv);
        vec3 col = mix(glass, face.rgb * 0.9, face.a);

        // Border: thin rim + inner edge glow + a slow travelling highlight
        float rim = smoothstep(-0.011, -0.004, d) * (1.0 - smoothstep(-0.003, -0.0005, d));
        float inner = exp(d * 34.0);
        float a = atan(p.y, p.x);
        float travel = pow(clamp(0.5 + 0.5 * cos(a - uTime * 0.7), 0.0, 1.0), 18.0);
        vec3 bc = mix(uBlue, uAccent, 0.4);
        bc = mix(bc, uGoldColor, gold);
        bc = mix(bc, uWarnColor, warn);
        float blueI = 0.62 + 0.28 * uHover + 0.35 * uSelect + 0.25 * travel + 0.2 * uDrag;
        // gold never above 0.85; never brighter than the blue it replaces
        float bi = mix(min(blueI, 1.0), min(blueI, 0.85), gold);
        col += bc * rim * bi;
        col += bc * inner * (0.10 + 0.12 * uHover + 0.2 * uSelect) * (1.0 - 0.3 * gold);

        // Energy pulse on selection: a ring racing out from the centre
        if (uPulse >= 0.0) {
          float r = length(p / (uSize * 0.5));
          float ring = exp(-pow((r - uPulse * 1.5) * 7.0, 2.0)) * (1.0 - uPulse);
          col += mix(uBlue, uAccent, 0.5) * ring * 0.55;
        }

        // Hard-edged scan line sweeping top → bottom
        if (uScan >= 0.0) {
          float y = 1.0 - vUv.y;
          float line = step(abs(y - uScan), 0.0035);
          float wake = step(y, uScan) * exp(-(uScan - y) * 18.0);
          col += vec3(0.8, 0.9, 1.0) * (line * 0.9 + wake * 0.12);
        }

        float alpha = (0.58 + face.a * 0.42 + rim * 0.4) * aa * uOpacity;
        col *= 1.0 - uDim * 0.72;
        if (alpha < 0.02) discard; // a faded-out card must not hide what's behind it
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/** Soft light thrown behind a card; wider when gold. */
export function createHaloMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: BLUE.clone() }, uStrength: { value: 0.2 }, uSpread: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength, uSpread;
      varying vec2 vUv;
      void main() {
        vec2 q = (vUv - 0.5) * 2.0;
        q.y *= 0.82;
        float r = length(q) / max(uSpread, 0.001);
        float g = exp(-r * r * 3.2) * (1.0 - smoothstep(0.55, 1.0, length(q)));
        gl_FragColor = vec4(uColor * g * uStrength, 1.0);
      }
    `,
  });
}
