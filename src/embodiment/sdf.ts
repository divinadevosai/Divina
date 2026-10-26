/**
 * Signed-distance fields for the figure. Human scale, metres, figure-local
 * (origin on the floor under the figure, facing +Z toward the viewer).
 *
 * The bust is broad and heavily blended: head, neck, shoulders, upper chest.
 * No ears, no carved lip line, no brow primitive — every crease collects
 * surface points and reads as a bright arc or bulge. A synthetic
 * intelligence, not a likeness.
 */

export const SDF_COMMON = /* glsl */ `
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
// tapered capsule (iq)
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
`;

export const BUST_SDF = /* glsl */ `
float map(vec3 p) {
  // head: skull, cranium, jaw — one smooth mass
  float head = sdEllipsoid(p - vec3(0.0, 1.645, 0.0), vec3(0.077, 0.104, 0.093));
  head = smin(head, sdEllipsoid(p - vec3(0.0, 1.674, -0.02), vec3(0.08, 0.088, 0.088)), 0.04);
  head = smin(head, sdEllipsoid(p - vec3(0.0, 1.58, 0.026), vec3(0.055, 0.047, 0.062)), 0.045);
  // the nose is only a broad swelling, fully blended
  head = smin(head, sdEllipsoid(p - vec3(0.0, 1.627, 0.086), vec3(0.014, 0.027, 0.02)), 0.03);
  // neck
  float d = smin(head, sdRoundCone(p, vec3(0.0, 1.40, -0.012), vec3(0.0, 1.575, -0.01), 0.058, 0.047), 0.035);
  // shoulders and upper chest
  float torso = sdEllipsoid(p - vec3(0.0, 1.2, -0.005), vec3(0.178, 0.25, 0.108));
  torso = smin(torso, sdCapsule(p, vec3(-0.16, 1.372, -0.02), vec3(0.16, 1.372, -0.02), 0.058), 0.09);
  float delts = min(sdEllipsoid(p - vec3(0.192, 1.33, -0.02), vec3(0.064, 0.074, 0.06)),
                    sdEllipsoid(p - vec3(-0.192, 1.33, -0.02), vec3(0.064, 0.074, 0.06)));
  torso = smin(torso, delts, 0.06);
  torso = smin(torso, sdCapsule(p, vec3(-0.085, 1.43, -0.035), vec3(0.085, 1.43, -0.035), 0.034), 0.07);
  d = smin(d, torso, 0.06);
  // cut the bust
  d = smax(d, 1.04 - p.y, 0.03);
  d = smax(d, abs(p.x) - 0.25, 0.03);
  return d;
}
`;

export const BUST_BOUNDS = { min: [-0.27, 1.02, -0.14] as const, max: [0.27, 1.8, 0.13] as const };

/** Key anatomical anchors (figure-local), shared by the rig and the regions. */
export const BUST = {
  neckPivot: [0, 1.5, -0.01] as const,
  jawHinge: [0, 1.622, -0.012] as const, // a line through where ears would be (x axis)
  mouthY: 1.594,
  eyeL: [-0.031, 1.655, 0.083] as const,
  eyeR: [0.031, 1.655, 0.083] as const,
  crownY: 1.78,
  chestY: 1.06,
};

/** Rig weights for a figure point: head turn, jaw, breath, lip seam. */
export function bustRegion(x: number, y: number, z: number): [number, number, number, number] {
  const ss = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // head turns rigidly above the jaw line; the neck blends so it twists
  const head = ss(1.47, 1.56, y);
  // jaw: the chin mass below the lip line, in front of the hinge
  const underChin = y > 1.525 && z > 0.02;
  const inJaw = y < BUST.mouthY && (y > 1.548 || underChin);
  const jaw = inJaw ? ss(-0.03, 0.035, z) * (underChin && y < 1.548 ? ss(1.525, 1.545, y) : 1) : 0;
  // breath lives in the chest, fading out toward the neck
  const chest = 1 - ss(1.3, 1.44, y);
  // lip seam: a thin band along the lip line at the front of the face
  const seam = Math.exp(-(((y - BUST.mouthY) / 0.004) ** 2)) * ss(0.045, 0.075, z) * (1 - ss(0.022, 0.034, Math.abs(x)));
  return [head, jaw, chest, seam];
}
