/**
 * The hand, authored as DATA. Both the signed-distance field (for the bake)
 * and the pose code (for the vertex shader) are emitted from this table, so
 * every knuckle the field has is a hinge the shader can rotate about.
 *
 * Hand-local frame: origin at the wrist, +Y along the fingers, +Z out of the
 * palm, +X toward the thumb. Metres.
 */

type V3 = [number, number, number];

export interface Finger {
  name: string;
  base: V3;
  dir: V3;
  lengths: [number, number, number];
  radii: [number, number, number, number];
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const fan = (a: number): V3 => norm([Math.sin(a), Math.cos(a), 0]);

export const FINGERS: Finger[] = [
  { name: 'index', base: [0.027, 0.096, 0.0], dir: fan(0.07), lengths: [0.043, 0.026, 0.021], radii: [0.0098, 0.0088, 0.0079, 0.0071] },
  { name: 'middle', base: [0.008, 0.099, 0.0], dir: fan(0.0), lengths: [0.047, 0.029, 0.023], radii: [0.0102, 0.0091, 0.0081, 0.0073] },
  { name: 'ring', base: [-0.011, 0.096, 0.0], dir: fan(-0.07), lengths: [0.044, 0.027, 0.022], radii: [0.0096, 0.0087, 0.0078, 0.007] },
  { name: 'pinky', base: [-0.028, 0.089, 0.0], dir: fan(-0.16), lengths: [0.034, 0.021, 0.019], radii: [0.0086, 0.0078, 0.007, 0.0063] },
  { name: 'thumb', base: [0.033, 0.02, 0.006], dir: norm([0.72, 0.62, 0.3]), lengths: [0.036, 0.03, 0.026], radii: [0.0135, 0.0114, 0.0099, 0.0088] },
];

/** Curl gain per joint (proximal, middle, distal) at curl = 1. */
export const CURL_GAIN: [number, number, number] = [0.95, 1.15, 0.8];
export const THUMB_GAIN: [number, number, number] = [0.35, 0.6, 0.6];

export interface Joint {
  pos: V3;
  axis: V3;
}

/** Rest-pose joints: 5 fingers × 3 hinges = 15. */
export function joints(): Joint[] {
  const out: Joint[] = [];
  for (const f of FINGERS) {
    const palmN: V3 = [0, 0, 1];
    const axis = norm(cross(f.dir, palmN));
    let p = f.base;
    for (let s = 0; s < 3; s++) {
      out.push({ pos: p, axis });
      p = add(p, f.dir, f.lengths[s]);
    }
  }
  return out;
}

export interface Segment {
  a: V3;
  b: V3;
  r1: number;
  r2: number;
  bone: number; // finger*3+segment, or -1 for rigid palm / forearm
}

export function segments(): Segment[] {
  const out: Segment[] = [];
  FINGERS.forEach((f, fi) => {
    let p = f.base;
    for (let s = 0; s < 3; s++) {
      const q = add(p, f.dir, f.lengths[s]);
      out.push({ a: p, b: q, r1: f.radii[s], r2: f.radii[s + 1], bone: fi * 3 + s });
      p = q;
    }
  });
  return out;
}

const g = (n: number) => n.toFixed(5);
const gv = (v: V3) => `vec3(${g(v[0])}, ${g(v[1])}, ${g(v[2])})`;

/** Field emitted from the data. */
export function handSdfGLSL(): string {
  const segs = segments();
  const fingerLines = FINGERS.map((_, fi) => {
    const s = segs.filter((x) => Math.floor(x.bone / 3) === fi);
    return `  { float f = sdRoundCone(p, ${gv(s[0].a)}, ${gv(s[0].b)}, ${g(s[0].r1)}, ${g(s[0].r2)});
    f = smin(f, sdRoundCone(p, ${gv(s[1].a)}, ${gv(s[1].b)}, ${g(s[1].r1)}, ${g(s[1].r2)}), 0.004);
    f = smin(f, sdRoundCone(p, ${gv(s[2].a)}, ${gv(s[2].b)}, ${g(s[2].r1)}, ${g(s[2].r2)}), 0.004);
    d = smin(d, f, ${fi === 4 ? '0.016' : '0.011'}); }`;
  });
  return /* glsl */ `
float map(vec3 p) {
  // palm and heel
  float d = sdRoundBox(p - vec3(0.0, 0.052, 0.0), vec3(0.036, 0.043, 0.0095), 0.0085);
  d = smin(d, sdEllipsoid(p - vec3(0.0, 0.022, 0.006), vec3(0.035, 0.028, 0.014)), 0.012);
  // thenar pad
  d = smin(d, sdEllipsoid(p - vec3(0.024, 0.03, 0.008), vec3(0.021, 0.03, 0.014)), 0.012);
  // forearm runs off the bottom of the frame
  d = smin(d, sdRoundCone(p, vec3(0.0, 0.005, -0.002), vec3(0.0, -0.46, -0.01), 0.026, 0.038), 0.02);
${fingerLines.join('\n')}
  return d;
}
`;
}

/** Pose code emitted from the same data: hinge about every knuckle. */
export function handPoseGLSL(): string {
  const js = joints();
  return /* glsl */ `
const vec3 H_JOINT[15] = vec3[15](${js.map((j) => gv(j.pos)).join(', ')});
const vec3 H_AXIS[15] = vec3[15](${js.map((j) => gv(j.axis)).join(', ')});
const vec3 H_GAIN = vec3(${g(CURL_GAIN[0])}, ${g(CURL_GAIN[1])}, ${g(CURL_GAIN[2])});
const vec3 H_THUMB = vec3(${g(THUMB_GAIN[0])}, ${g(THUMB_GAIN[1])}, ${g(THUMB_GAIN[2])});
vec3 hRot(vec3 v, vec3 a, float t) {
  float c = cos(t), s = sin(t);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}
// Distal joint first, each about its REST position: composes the chain.
void poseHand(inout vec3 p, inout vec3 n, float bone, float curl) {
  if (bone < 0.0) return;
  int b = int(bone + 0.5);
  int finger = b / 3;
  int seg = b - finger * 3;
  vec3 gain = finger == 4 ? H_THUMB : H_GAIN;
  for (int k = 2; k >= 0; k--) {
    if (k > seg) continue;
    int j = finger * 3 + k;
    float ang = curl * (k == 0 ? gain.x : k == 1 ? gain.y : gain.z);
    p = H_JOINT[j] + hRot(p - H_JOINT[j], H_AXIS[j], ang);
    n = hRot(n, H_AXIS[j], ang);
  }
}
`;
}

/** Nearest segment → bone id for a baked point (-1 = rigid). */
export function boneOf(p: V3, segs = segments()): number {
  let best = -1;
  let bestD = Infinity;
  const distTo = (s: Segment) => {
    const ba: V3 = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]];
    const pa: V3 = [p[0] - s.a[0], p[1] - s.a[1], p[2] - s.a[2]];
    const h = Math.min(1, Math.max(0, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2)));
    const r = s.r1 + (s.r2 - s.r1) * h;
    return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - r;
  };
  for (const s of segs) {
    const d = distTo(s);
    if (d < bestD) {
      bestD = d;
      best = s.bone;
    }
  }
  // points closer to the palm than to any finger stay rigid
  const palmD = Math.max(Math.abs(p[0]) - 0.044, Math.abs(p[1] - 0.052) - 0.051, Math.abs(p[2]) - 0.018);
  return palmD < bestD - 0.002 ? -1 : best;
}

export const HAND_BOUNDS = { min: [-0.06, -0.3, -0.05] as const, max: [0.1, 0.2, 0.05] as const };
