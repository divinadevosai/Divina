/**
 * Poisson-disk selection with an EXACT output count: weighted sample
 * elimination (Yuksel 2015). From M candidate surface points keep exactly N,
 * removing at each step the point most crowded by its neighbours. The result
 * is blue noise: uniform density, no clumps, no holes.
 *
 * Async and chunked: yields to the browser every few thousand operations.
 */

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/** Surface area estimate from occupied voxels (~1.5 voxels per h² of area). */
export function estimateArea(pos: Float32Array, count: number, h = 0.008): number {
  const cells = new Set<string>();
  for (let i = 0; i < count; i++) {
    cells.add(`${Math.floor(pos[i * 3] / h)},${Math.floor(pos[i * 3 + 1] / h)},${Math.floor(pos[i * 3 + 2] / h)}`);
  }
  return (cells.size * h * h) / 1.5;
}

export async function sampleEliminate(pos: Float32Array, count: number, target: number, area?: number): Promise<{ indices: Uint32Array; spacing: number }> {
  const N = Math.min(target, count);
  const A = area ?? estimateArea(pos, count);
  const rmax = Math.sqrt(A / (2 * Math.sqrt(3) * N));
  const r2 = 2 * rmax;
  const alpha = 8;

  // spatial hash
  const cell = r2;
  const key = (x: number, y: number, z: number) => ((Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663) ^ (Math.floor(z / cell) * 83492791)) >>> 0;
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = []));
    b.push(i);
  }
  const neighbours = (i: number, fn: (j: number, w: number) => void) => {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const b = buckets.get(key(x + dx * cell, y + dy * cell, z + dz * cell));
          if (!b) continue;
          for (const j of b) {
            if (j === i) continue;
            const d = Math.hypot(pos[j * 3] - x, pos[j * 3 + 1] - y, pos[j * 3 + 2] - z);
            if (d < r2) fn(j, Math.pow(1 - d / r2, alpha));
          }
        }
  };

  const w = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    neighbours(i, (_, wt) => (w[i] += wt));
    if ((i & 4095) === 4095) await yieldFrame();
  }

  // indexed max-heap
  const heap = new Int32Array(count);
  const where = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    heap[i] = i;
    where[i] = i;
  }
  let size = count;
  const swap = (a: number, b: number) => {
    const t = heap[a];
    heap[a] = heap[b];
    heap[b] = t;
    where[heap[a]] = a;
    where[heap[b]] = b;
  };
  const up = (k: number) => {
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (w[heap[p]] >= w[heap[k]]) break;
      swap(p, k);
      k = p;
    }
  };
  const down = (k: number) => {
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < size && w[heap[l]] > w[heap[m]]) m = l;
      if (r < size && w[heap[r]] > w[heap[m]]) m = r;
      if (m === k) break;
      swap(m, k);
      k = m;
    }
  };
  for (let k = (size >> 1) - 1; k >= 0; k--) down(k);

  const removed = new Uint8Array(count);
  let ops = 0;
  while (size > N) {
    const top = heap[0];
    removed[top] = 1;
    swap(0, size - 1);
    size--;
    down(0);
    neighbours(top, (j, wt) => {
      if (removed[j]) return;
      w[j] -= wt;
      down(where[j]);
    });
    if ((++ops & 2047) === 0) await yieldFrame();
  }
  const indices = new Uint32Array(N);
  let n = 0;
  for (let i = 0; i < count; i++) if (!removed[i]) indices[n++] = i;

  // measured spacing: mean nearest-neighbour distance over a sample
  let sum = 0;
  let samples = 0;
  for (let s = 0; s < Math.min(400, N); s++) {
    const i = indices[Math.floor((s / 400) * N)];
    let best = Infinity;
    neighbours(i, (j) => {
      if (removed[j]) return;
      const d = Math.hypot(pos[j * 3] - pos[i * 3], pos[j * 3 + 1] - pos[i * 3 + 1], pos[j * 3 + 2] - pos[i * 3 + 2]);
      if (d < best) best = d;
    });
    if (Number.isFinite(best)) {
      sum += best;
      samples++;
    }
  }
  return { indices, spacing: samples ? sum / samples : rmax };
}
