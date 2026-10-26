/**
 * Cinematic colour grade.
 *
 *  - halation: highlights bleed a warm red-orange fringe, like film
 *  - filmic contrast pivoting at 18% grey (log space), then ACES-fit tonemap
 *  - luminance split: violet pushed into the shadows, warm white into the
 *    highlights; mid-tones untouched
 *  - white balance (world warmth), saturation, vignette, grain
 *  - the wake wave: a ring of light rolling out from the centre of frame
 *  - world cuts spike the split and the halation so a change reads as an edit
 *
 * Every pow of a (1 − x) term is clamped, and the output is NaN-guarded:
 * one NaN pixel spreads through the bloom pyramid across the whole frame.
 */
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import * as THREE from 'three';

const fragment = /* glsl */ `
uniform vec3 uShadow;
uniform vec3 uHighlight;
uniform float uSplit;
uniform float uContrast;
uniform float uHalation;
uniform float uBleed;
uniform float uWarmth;
uniform float uSat;
uniform float uCut;
uniform float uWake;
uniform float uAwake;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform float uExposure;
uniform float uTaps;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 acesFit(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 finite(vec3 c) {
  // NaN compares false with everything; Inf is caught by the upper bound.
  c.r = (c.r >= 0.0 && c.r < 65000.0) ? c.r : 0.0;
  c.g = (c.g >= 0.0 && c.g < 65000.0) ? c.g : 0.0;
  c.b = (c.b >= 0.0 && c.b < 65000.0) ? c.b : 0.0;
  return c;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = finite(inputColor.rgb) * uExposure;

  // Halation
  float cut = clamp(uCut, 0.0, 1.0);
  if (uHalation > 0.0 && uTaps > 0.5) {
    vec3 hal = vec3(0.0);
    vec2 px = texelSize * uBleed * (1.0 + cut * 1.5);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 o = vec2(cos(a), sin(a));
      hal += max(finite(texture2D(inputBuffer, uv + o * px).rgb) - 0.65, 0.0);
      hal += max(finite(texture2D(inputBuffer, uv + o * px * 2.3).rgb) - 0.65, 0.0) * 0.6;
    }
    hal /= 12.8;
    c += hal * vec3(1.0, 0.42, 0.22) * uHalation * (1.0 + cut * 2.0);
  }

  // Filmic contrast around 18% grey
  vec3 lc = log2(max(c, vec3(1e-5)) / 0.18) * uContrast;
  c = 0.18 * exp2(lc);

  c = acesFit(c);

  // Luminance split tone
  float L = dot(c, LUMA);
  float split = uSplit * (1.0 + cut * 1.6);
  float sh = (1.0 - smoothstep(0.0, 0.32, L)) * split;
  float hi = smoothstep(0.58, 1.0, L) * split;
  vec3 tS = uShadow / max(dot(uShadow, LUMA), 1e-3);
  vec3 tH = uHighlight / max(dot(uHighlight, LUMA), 1e-3);
  c *= mix(vec3(1.0), tS, sh);
  c *= mix(vec3(1.0), tH, hi * 0.7);

  // White balance
  c *= vec3(1.0 + uWarmth * 0.45, 1.0 + uWarmth * 0.05, 1.0 - uWarmth * 0.55);

  // Saturation
  L = dot(c, LUMA);
  c = mix(vec3(L), c, uSat);

  // Wake wave + awake glow
  vec2 q = uv - 0.5;
  q.x *= resolution.x / max(resolution.y, 1.0);
  float r = length(q);
  if (uWake >= 0.0) {
    float front = uWake * 1.25;
    float life = 1.0 - clamp(uWake / 1.8, 0.0, 1.0);
    float ring = exp(-pow((r - front) * 10.0, 2.0)) * life;
    c += vec3(0.55, 0.75, 1.0) * ring * 0.45;
    c += vec3(0.25, 0.4, 0.8) * exp(-r * 3.0) * life * 0.18;
  }
  float edge = clamp(r * 1.25, 0.0, 1.0);
  c += vec3(0.35, 0.55, 1.0) * uAwake * pow(edge, 3.0) * 0.12;

  // Vignette
  c *= 1.0 - uVignette * smoothstep(0.35, 0.95, r);

  // Grain
  c += (h12(uv * resolution + uSeed) - 0.5) * uGrain;

  outputColor = vec4(finite(c), inputColor.a);
}
`;

export class ColorGradeEffect extends Effect {
  constructor() {
    super('ColorGradeEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['uShadow', new THREE.Uniform(new THREE.Vector3(0.46, 0.36, 0.98))],
        ['uHighlight', new THREE.Uniform(new THREE.Vector3(1, 0.95, 0.86))],
        ['uSplit', new THREE.Uniform(0.35)],
        ['uContrast', new THREE.Uniform(1.08)],
        ['uHalation', new THREE.Uniform(0.18)],
        ['uBleed', new THREE.Uniform(6)],
        ['uWarmth', new THREE.Uniform(0)],
        ['uSat', new THREE.Uniform(1)],
        ['uCut', new THREE.Uniform(0)],
        ['uWake', new THREE.Uniform(-1)],
        ['uAwake', new THREE.Uniform(0)],
        ['uVignette', new THREE.Uniform(0.55)],
        ['uGrain', new THREE.Uniform(0.004)],
        ['uSeed', new THREE.Uniform(0)],
        ['uExposure', new THREE.Uniform(1)],
        ['uTaps', new THREE.Uniform(1)],
      ]),
    });
  }
  u(name: string) {
    return this.uniforms.get(name)!;
  }
}
