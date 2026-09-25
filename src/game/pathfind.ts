// Grid pathfinding: A* (octile, no corner cutting) and BFS "nearest goal" search.

export type CostFn = (x: number, z: number) => number; // Infinity = blocked

const SQRT2 = Math.SQRT2;
const NX = [0, 1, 0, -1, 1, 1, -1, -1];
const NZ = [-1, 0, 1, 0, -1, 1, 1, -1];

export class Pathfinder {
  private g: Float32Array;
  private parent: Int32Array;
  private mark: Uint32Array;
  private closed: Uint32Array;
  private heap: Int32Array;
  private heapF: Float32Array;
  private heapN = 0;
  private gen = 1;
  private queue: Int32Array;
  lastExpanded = 0;

  constructor(public w: number, public h: number) {
    const n = w * h;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.mark = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(n * 8);
    this.heapF = new Float32Array(n * 8);
    this.queue = new Int32Array(n);
  }

  private push(i: number, f: number) {
    let k = this.heapN++;
    const H = this.heap,
      F = this.heapF;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (F[p] <= f) break;
      H[k] = H[p];
      F[k] = F[p];
      k = p;
    }
    H[k] = i;
    F[k] = f;
  }
  private pop(): number {
    const H = this.heap,
      F = this.heapF;
    const top = H[0];
    const n = --this.heapN;
    const li = H[n],
      lf = F[n];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && F[c + 1] < F[c]) c++;
      if (F[c] >= lf) break;
      H[k] = H[c];
      F[k] = F[c];
      k = c;
    }
    H[k] = li;
    F[k] = lf;
    return top;
  }

  // Returns list of tile indices from start (exclusive) to goal (inclusive), or null.
  // If `adjacentOk`, reaching any tile 8-adjacent to the goal counts (for goals that are solid).
  find(sx: number, sz: number, tx: number, tz: number, cost: CostFn, maxNodes = 6000, adjacentOk = false, blockCorner?: (x: number, z: number) => boolean): number[] | null {
    const w = this.w,
      h = this.h;
    if (sx < 0 || sz < 0 || sx >= w || sz >= h) return null;
    const gen = ++this.gen;
    this.heapN = 0;
    const start = sz * w + sx;
    const goal = tz * w + tx;
    this.g[start] = 0;
    this.mark[start] = gen;
    this.parent[start] = -1;
    const hfn = (x: number, z: number) => {
      const dx = Math.abs(x - tx),
        dz = Math.abs(z - tz);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    this.push(start, hfn(sx, sz));
    let expanded = 0;
    while (this.heapN > 0) {
      const cur = this.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      const cx = cur % w,
        cz = (cur / w) | 0;
      if (cur === goal || (adjacentOk && Math.abs(cx - tx) <= 1 && Math.abs(cz - tz) <= 1 && !(cx === tx && cz === tz) && (cx === tx || cz === tz))) {
        this.lastExpanded = expanded;
        return this.reconstruct(cur);
      }
      if (++expanded > maxNodes) break;
      const gc = this.g[cur];
      for (let d = 0; d < 8; d++) {
        const nx = cx + NX[d],
          nz = cz + NZ[d];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx;
        if (this.closed[ni] === gen) continue;
        let c = cost(nx, nz);
        if (c === Infinity) continue;
        if (d >= 4) {
          // no corner cutting
          if (blockCorner) {
            if (blockCorner(cx + NX[d], cz) || blockCorner(cx, cz + NZ[d])) continue;
          } else if (cost(cx + NX[d], cz) === Infinity || cost(cx, cz + NZ[d]) === Infinity) continue;
          c *= SQRT2;
        }
        const ng = gc + c;
        if (this.mark[ni] !== gen || ng < this.g[ni]) {
          this.mark[ni] = gen;
          this.g[ni] = ng;
          this.parent[ni] = cur;
          this.push(ni, ng + hfn(nx, nz) * 1.001);
        }
      }
    }
    this.lastExpanded = expanded;
    return null;
  }

  private reconstruct(end: number): number[] {
    const out: number[] = [];
    let c = end;
    while (c !== -1 && this.parent[c] !== -1) {
      out.push(c);
      c = this.parent[c];
    }
    out.reverse();
    return out;
  }

  // Breadth-first flood from start; returns the first tile satisfying `isGoal`
  // (tiles are visited in order of path length). Path excludes start.
  nearest(sx: number, sz: number, passable: (x: number, z: number) => boolean, isGoal: (i: number, x: number, z: number) => boolean, maxDist = 200): { goal: number; path: number[] } | null {
    const w = this.w,
      h = this.h;
    const gen = ++this.gen;
    const start = sz * w + sx;
    if (sx < 0 || sz < 0 || sx >= w || sz >= h) return null;
    let head = 0,
      tail = 0;
    this.queue[tail++] = start;
    this.mark[start] = gen;
    this.parent[start] = -1;
    this.g[start] = 0;
    while (head < tail) {
      const cur = this.queue[head++];
      const cx = cur % w,
        cz = (cur / w) | 0;
      if (isGoal(cur, cx, cz)) return { goal: cur, path: this.reconstruct(cur) };
      if (this.g[cur] >= maxDist) continue;
      for (let d = 0; d < 8; d++) {
        const nx = cx + NX[d],
          nz = cz + NZ[d];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx;
        if (this.mark[ni] === gen) continue;
        if (!passable(nx, nz)) continue;
        if (d >= 4 && (!passable(cx + NX[d], cz) || !passable(cx, cz + NZ[d]))) continue;
        this.mark[ni] = gen;
        this.parent[ni] = cur;
        this.g[ni] = this.g[cur] + 1;
        this.queue[tail++] = ni;
      }
    }
    return null;
  }

  // Flood returning the set of reachable tiles within maxDist (for random wandering etc).
  reachable(sx: number, sz: number, passable: (x: number, z: number) => boolean, maxDist: number, out: number[]) {
    out.length = 0;
    const w = this.w,
      h = this.h;
    const gen = ++this.gen;
    const start = sz * w + sx;
    let head = 0,
      tail = 0;
    this.queue[tail++] = start;
    this.mark[start] = gen;
    this.g[start] = 0;
    while (head < tail) {
      const cur = this.queue[head++];
      out.push(cur);
      if (this.g[cur] >= maxDist) continue;
      const cx = cur % w,
        cz = (cur / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + NX[d],
          nz = cz + NZ[d];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx;
        if (this.mark[ni] === gen) continue;
        if (!passable(nx, nz)) continue;
        this.mark[ni] = gen;
        this.g[ni] = this.g[cur] + 1;
        this.queue[tail++] = ni;
      }
    }
    return out;
  }
}
