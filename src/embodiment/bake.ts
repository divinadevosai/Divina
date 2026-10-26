/**
 * GPU surface bake.
 *
 * A fragment shader seeds one point per texel inside the field's bounds and
 * walks it onto the zero set with Newton steps. Results are packed into
 * 16-bit fixed point across two RGBA8 passes (portable readback on every
 * WebGL2 device):
 *   pass 0: x16 | y16
 *   pass 1: z16 | octahedral normal 8+8   (z16 = 0 marks a failed seed)
 * One pass per frame, so the bake never stalls a frame.
 */
import * as THREE from 'three';
import { SDF_COMMON } from './sdf';

export interface BakeInput {
  sdf: string; // must define float map(vec3 p)
  /** bounds the surface lies in (points outside are rejected) */
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  /** seeds are spread over the bounds grown by this margin (m), so every
   *  face — including broad flat fronts — receives exterior seeds */
  margin?: number;
  size: number; // seeds per side (size² seeds)
  seed: number;
}

export interface BakeOutput {
  positions: Float32Array; // valid points only
  normals: Float32Array;
  count: number;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function material(inp: BakeInput, pass: number) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uMin: { value: new THREE.Vector3(...inp.min) },
      uMax: { value: new THREE.Vector3(...inp.max) },
      uMargin: { value: inp.margin ?? 0.12 },
      uSeed: { value: inp.seed },
    },
    vertexShader: /* glsl */ `
      out vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uMin, uMax;
      uniform float uSeed;
      uniform float uMargin;
      in vec2 vUv;
      out vec4 outColor;
      ${SDF_COMMON}
      ${inp.sdf}
      uvec3 pcg3d(uvec3 v) {
        v = v * 1664525u + 1013904223u;
        v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
        v ^= v >> 16u;
        v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
        return v;
      }
      vec3 grad(vec3 p) {
        const vec2 e = vec2(0.0004, 0.0);
        return vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)) / (2.0 * e.x);
      }
      vec2 pack16(float v) {
        float q = floor(clamp(v, 0.0, 1.0) * 65534.0 + 0.5) + 1.0; // 1..65535, 0 reserved
        float hi = floor(q / 256.0);
        return vec2(hi, q - hi * 256.0) / 255.0;
      }
      vec2 octEncode(vec3 n) {
        n /= (abs(n.x) + abs(n.y) + abs(n.z));
        vec2 o = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
        return o * 0.5 + 0.5;
      }
      void main() {
        uvec3 h = pcg3d(uvec3(uint(gl_FragCoord.x), uint(gl_FragCoord.y), uint(uSeed)));
        vec3 r = vec3(h) / 4294967295.0;
        vec3 p = mix(uMin - uMargin, uMax + uMargin, r);
        for (int i = 0; i < 28; i++) {
          float d = map(p);
          vec3 g = grad(p);
          p -= d * g / max(dot(g, g), 1e-6);
        }
        float d = map(p);
        vec3 n = normalize(grad(p));
        bool inside = all(greaterThanEqual(p, uMin)) && all(lessThanEqual(p, uMax));
        bool ok = abs(d) < 3e-4 && inside && !any(isnan(n));
        vec3 q = (p - uMin) / (uMax - uMin);
        ${pass === 0 ? 'outColor = vec4(pack16(q.x), pack16(q.y));' : 'outColor = ok ? vec4(pack16(q.z), octEncode(n)) : vec4(0.0);'}
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

export async function bakeSurface(gl: THREE.WebGLRenderer, inp: BakeInput): Promise<BakeOutput> {
  const n = inp.size;
  const rt = new THREE.WebGLRenderTarget(n, n, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bufs = [new Uint8Array(n * n * 4), new Uint8Array(n * n * 4)];
  const prevTarget = gl.getRenderTarget();
  for (let pass = 0; pass < 2; pass++) {
    await nextFrame();
    const mat = material(inp, pass);
    quad.material = mat;
    gl.setRenderTarget(rt);
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, n, n, bufs[pass]);
    gl.setRenderTarget(prevTarget);
    mat.dispose();
  }
  rt.dispose();
  quad.geometry.dispose();

  const [a, b] = bufs;
  const pos = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  const span = [inp.max[0] - inp.min[0], inp.max[1] - inp.min[1], inp.max[2] - inp.min[2]];
  const dec = (hi: number, lo: number) => (hi * 256 + lo - 1) / 65534;
  let count = 0;
  for (let i = 0; i < n * n; i++) {
    const o = i * 4;
    if (b[o] === 0 && b[o + 1] === 0) continue;
    pos[count * 3] = inp.min[0] + dec(a[o], a[o + 1]) * span[0];
    pos[count * 3 + 1] = inp.min[1] + dec(a[o + 2], a[o + 3]) * span[1];
    pos[count * 3 + 2] = inp.min[2] + dec(b[o], b[o + 1]) * span[2];
    // octahedral decode
    let ex = (b[o + 2] / 255) * 2 - 1;
    let ey = (b[o + 3] / 255) * 2 - 1;
    const ez = 1 - Math.abs(ex) - Math.abs(ey);
    if (ez < 0) {
      const tx = (1 - Math.abs(ey)) * Math.sign(ex || 1);
      const ty = (1 - Math.abs(ex)) * Math.sign(ey || 1);
      ex = tx;
      ey = ty;
    }
    const l = Math.hypot(ex, ey, ez) || 1;
    nrm[count * 3] = ex / l;
    nrm[count * 3 + 1] = ey / l;
    nrm[count * 3 + 2] = ez / l;
    count++;
  }
  return { positions: pos.subarray(0, count * 3), normals: nrm.subarray(0, count * 3), count };
}
