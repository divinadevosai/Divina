/**
 * Bead impostors: OPAQUE spheres that write a curved depth — not additive
 * glowing discs. Neighbours meet along curved seams and may overlap enough
 * to leave no gap while each still reads as its own dot.
 *
 * Lighting: blue in shadow, lighter blue where the key lands, a glow only
 * where the surface faces the viewer squarely. NO rim term: a bright
 * silhouette is what made the first version read as an outline.
 */

export const BEAD_VERTEX_TAIL = /* glsl */ `
  // expects: vec3 worldPos, vec3 worldN, float radius, float visible, float maxPx
  vec4 mv = viewMatrix * vec4(worldPos, 1.0);
  vViewPos = mv.xyz;
  vNView = normalize(mat3(viewMatrix) * worldN);
  vR = radius;
  gl_Position = visible > 0.5 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = visible > 0.5 ? clamp(2.0 * radius * uPx / max(-mv.z, 0.05), 1.0, maxPx) : 0.0;
`;

export const BEAD_VARYINGS = /* glsl */ `
  varying vec3 vViewPos;
  varying vec3 vNView;
  varying float vR;
`;

export const BEAD_FRAGMENT_HEAD = /* glsl */ `
  uniform mat4 projectionMatrix;
  uniform vec3 uKeyView;
  vec3 beadShade(vec3 sn, vec3 bn, float nz) {
    vec3 N = normalize(sn + bn * 0.22);
    float diff = clamp(dot(N, normalize(uKeyView)), 0.0, 1.0);
    vec3 shadow = vec3(0.028, 0.068, 0.2);
    vec3 lit = vec3(0.36, 0.58, 1.0);
    vec3 col = mix(shadow, lit, pow(diff, 1.6) * 0.95 + 0.02);
    // glow only where the surface squarely faces the viewer (not a rim)
    float facing = clamp(sn.z, 0.0, 1.0);
    col += vec3(0.28, 0.48, 1.0) * pow(facing, 12.0) * 0.22;
    // each bead reads as its own dot
    col *= 0.74 + 0.26 * nz;
    return col;
  }
`;

/** Sphere surface + curved depth. Declares q, r2, nz, bn and writes depth. */
export const BEAD_FRAGMENT_SPHERE = /* glsl */ `
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  q.y = -q.y;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float nz = sqrt(1.0 - r2);
  vec3 bn = vec3(q, nz);
  vec3 surf = vViewPos + bn * vR;
  vec4 clip = projectionMatrix * vec4(surf, 1.0);
  gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
`;
