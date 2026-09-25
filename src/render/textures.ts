import * as THREE from 'three';
import { hash2, vnoise, fbm } from '../game/rng';

export const TEX = 32;

export enum Tex {
  EarthSide,
  EarthTop,
  GoldTop,
  GemTop,
  GoldSide,
  GemSide,
  RockSide,
  RockTop,
  WallSide,
  WallSideB,
  WallTop,
  HeroWallSide,
  HeroWallTop,
  Path,
  FloorP,
  FloorH,
  Water,
  Lava,
  Treasury,
  Lair,
  Hatchery,
  Training,
  Library,
  Workshop,
  Prison,
  Torture,
  Graveyard,
  Temple,
  GuardPost,
  Bridge,
  HeartFloor,
  PortalFloor,
  HeroGateFloor,
  HeroKeepFloor,
  WallLibrary,
  WallTreasury,
  WallLair,
  WallHatchery,
  WallTraining,
  WallWorkshop,
  WallPrison,
  WallTorture,
  WallGraveyard,
  WallTemple,
  WallHeart,
  WallPortal,
  WallGuard,
  // generic detail textures for models (greyscale-ish, tinted by vertex colour)
  Plain,
  Skin,
  Cloth,
  Metal,
  Fur,
  Scale,
  Wood,
  Straw,
  Bone,
  GoldCoins,
  Flame,
  Book,
  Parchment,
  Face,
  COUNT,
}

type RGB = [number, number, number];

class Painter {
  data: Uint8Array;
  constructor(public layer: number, all: Uint8Array) {
    this.data = all.subarray(layer * TEX * TEX * 4, (layer + 1) * TEX * TEX * 4);
  }
  set(x: number, y: number, c: RGB, a = 255) {
    x = ((x % TEX) + TEX) % TEX;
    y = ((y % TEX) + TEX) % TEX;
    const i = (y * TEX + x) * 4;
    this.data[i] = clamp8(c[0]);
    this.data[i + 1] = clamp8(c[1]);
    this.data[i + 2] = clamp8(c[2]);
    this.data[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    x = ((x % TEX) + TEX) % TEX;
    y = ((y % TEX) + TEX) % TEX;
    const i = (y * TEX + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  fill(fn: (x: number, y: number) => RGB) {
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) this.set(x, y, fn(x, y));
  }
  mul(x: number, y: number, f: number) {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * f, c[1] * f, c[2] * f]);
  }
  blend(x: number, y: number, c: RGB, t: number) {
    const o = this.get(x, y);
    this.set(x, y, [o[0] + (c[0] - o[0]) * t, o[1] + (c[1] - o[1]) * t, o[2] + (c[2] - o[2]) * t]);
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  disc(cx: number, cy: number, r: number, c: RGB) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
    }
  }
}

function clamp8(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function sc(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}
// posterise to a small number of luminance steps, gives a CLUT feel
function post(v: number, steps = 6) {
  return Math.round(v * steps) / steps;
}

// ---- reusable generators ----

function dirt(p: Painter, base: RGB, seed: number, dark = 0.55, bright = 1.2) {
  p.fill((x, y) => {
    const n = post(tn(x, y, 8, seed, 3), 7);
    const n2 = hash2(x, y, seed + 3);
    let f = dark + (bright - dark) * n;
    if (n2 > 0.93) f *= 1.18;
    if (n2 < 0.05) f *= 0.75;
    return sc(base, f);
  });
}

// Tileable noise helper (period in pixels = 32)
function tn(x: number, y: number, scale: number, seed: number, oct = 3) {
  const period = 32 / scale;
  return fbm(x / scale, y / scale, seed, oct, period);
}

function earthBase(p: Painter, seed: number, base: RGB = [92, 60, 40]) {
  p.fill((x, y) => {
    const n = tn(x, y, 8, seed, 3);
    const d = tn(x, y, 4, seed + 9, 2);
    let f = 0.62 + post(n, 6) * 0.65;
    if (d > 0.68) f *= 0.8;
    const h = hash2(x, y, seed);
    if (h > 0.95) f *= 1.15;
    return sc(base, f);
  });
  // embedded stones
  for (let k = 0; k < 6; k++) {
    const cx = Math.floor(hash2(k, 1, seed) * 32);
    const cy = Math.floor(hash2(k, 2, seed) * 32);
    const r = 1.2 + hash2(k, 3, seed) * 1.8;
    const col: RGB = hash2(k, 4, seed) > 0.5 ? [96, 88, 82] : [78, 68, 60];
    for (let y = -3; y <= 3; y++)
      for (let x = -3; x <= 3; x++) {
        const d = (x * x) / (r * r * 1.4) + (y * y) / (r * r);
        if (d <= 1) {
          const shade = y < 0 && x < 1 ? 1.25 : y > 0 ? 0.75 : 1;
          p.set(cx + x, cy + y, sc(col, shade));
        }
      }
  }
  // roots
  for (let k = 0; k < 2; k++) {
    let x = hash2(k, 9, seed) * 32;
    let y = 0;
    const drift = (hash2(k, 10, seed) - 0.5) * 0.8;
    for (let s = 0; s < 14; s++) {
      p.set(Math.round(x), Math.round(y + hash2(k, 11, seed) * 20), [50, 34, 24]);
      x += drift + (hash2(s, k, seed) - 0.5);
      y += 1;
    }
  }
}

function bricks(
  p: Painter,
  seed: number,
  col: RGB,
  mortar: RGB,
  bw = 16,
  bh = 8,
  opts: { vary?: number; bevel?: number } = {},
) {
  const vary = opts.vary ?? 0.18;
  const bevel = opts.bevel ?? 1;
  for (let y = 0; y < TEX; y++) {
    const row = Math.floor(y / bh);
    const off = row % 2 ? bw / 2 : 0;
    for (let x = 0; x < TEX; x++) {
      const bx = Math.floor((x + off) / bw);
      const lx = (x + off) % bw;
      const ly = y % bh;
      if (lx === 0 || ly === 0) {
        p.set(x, y, mortar);
        continue;
      }
      const v = 1 - vary / 2 + hash2(bx, row, seed) * vary;
      const n = tn(x, y, 4, seed + 5, 2);
      let f = v * (0.82 + post(n, 5) * 0.3);
      if (bevel) {
        if (ly === 1 || lx === 1) f *= 1.22;
        if (ly === bh - 1 || lx === bw - 1) f *= 0.72;
      }
      if (hash2(x, y, seed + 77) > 0.96) f *= 0.8;
      p.set(x, y, sc(col, f));
    }
  }
}

function slabs(p: Painter, seed: number, col: RGB, edge: RGB, cells = 2) {
  const s = TEX / cells;
  p.fill((x, y) => {
    const lx = x % s;
    const ly = y % s;
    const cx = Math.floor(x / s);
    const cy = Math.floor(y / s);
    if (lx === 0 || ly === 0) return edge;
    const v = 0.9 + hash2(cx, cy, seed) * 0.2;
    const n = tn(x, y, 8, seed, 3);
    let f = v * (0.78 + post(n, 5) * 0.36);
    if (lx === 1 || ly === 1) f *= 1.2;
    if (lx === s - 1 || ly === s - 1) f *= 0.7;
    return sc(col, f);
  });
}

function planks(p: Painter, seed: number, col: RGB, horizontal = true, w = 8) {
  p.fill((x, y) => {
    const a = horizontal ? y : x;
    const b = horizontal ? x : y;
    const idx = Math.floor(a / w);
    const la = a % w;
    if (la === 0) return sc(col, 0.35);
    const v = 0.85 + hash2(idx, 0, seed) * 0.3;
    const grain = Math.sin((b + idx * 7) * 0.6 + tn(x, y, 8, seed, 2) * 8) * 0.5 + 0.5;
    let f = v * (0.75 + post(grain, 4) * 0.3);
    if (la === 1) f *= 1.15;
    if (la === w - 1) f *= 0.75;
    const nailA = (b + idx * 11) % 16;
    if ((la === 2 || la === w - 2) && nailA === 3) return [40, 36, 34];
    return sc(col, f);
  });
}

// ---- texture set ----

export function buildTextureData(): Uint8Array {
  const N = Tex.COUNT;
  const all = new Uint8Array(N * TEX * TEX * 4);
  const P = (l: Tex) => new Painter(l, all);

  // Earth
  earthBase(P(Tex.EarthSide), 11);
  {
    const p = P(Tex.EarthTop);
    p.fill((x, y) => {
      const n = tn(x, y, 8, 21, 3);
      const f = 0.55 + post(n, 5) * 0.5;
      // furrow pattern (the classic dark "tilled" top)
      const furrow = (x + y) % 8 === 0 ? 0.8 : 1;
      const h = hash2(x, y, 23);
      const bev = x === 0 || y === 0 ? 1.18 : x === 31 || y === 31 ? 0.7 : 1;
      return sc([118, 82, 60], f * furrow * bev * (h > 0.94 ? 1.2 : 1));
    });
  }
  {
    const src = P(Tex.EarthTop);
    const p = P(Tex.GoldTop);
    p.fill((x, y) => src.get(x, y));
    for (let k = 0; k < 14; k++) {
      const cx = Math.floor(hash2(k, 1, 25) * 28) + 2;
      const cy = Math.floor(hash2(k, 2, 25) * 28) + 2;
      const big = hash2(k, 3, 25) > 0.6;
      p.set(cx, cy, [240, 190, 50]);
      p.set(cx + 1, cy, [190, 130, 30]);
      p.set(cx, cy - 1, [255, 240, 150]);
      if (big) {
        p.set(cx - 1, cy, [230, 170, 40]);
        p.set(cx, cy + 1, [160, 100, 20]);
        p.set(cx + 1, cy + 1, [130, 84, 20]);
      }
    }
  }
  {
    const src = P(Tex.EarthTop);
    const p = P(Tex.GemTop);
    p.fill((x, y) => sc(src.get(x, y), 0.7));
    const cols: RGB[] = [
      [220, 70, 230],
      [70, 210, 240],
      [90, 240, 130],
    ];
    for (let k = 0; k < 9; k++) {
      const cx = Math.floor(hash2(k, 1, 27) * 26) + 3;
      const cy = Math.floor(hash2(k, 2, 27) * 26) + 3;
      const c = cols[k % 3];
      p.set(cx, cy, sc(c, 1.2));
      p.set(cx + 1, cy, c);
      p.set(cx, cy + 1, sc(c, 0.7));
      p.set(cx + 1, cy + 1, sc(c, 0.5));
    }
  }
  // Gold seam
  {
    const p = P(Tex.GoldSide);
    earthBase(p, 31, [88, 58, 38]);
    for (let k = 0; k < 9; k++) {
      const cx = Math.floor(hash2(k, 1, 33) * 30) + 1;
      const cy = Math.floor(hash2(k, 2, 33) * 30) + 1;
      const r = 1 + hash2(k, 3, 33) * 1.6;
      for (let y = -3; y <= 3; y++)
        for (let x = -3; x <= 3; x++) {
          const d = Math.hypot(x * 0.9, y);
          if (d <= r) {
            const shade = x + y < -1 ? [255, 236, 120] : x + y > 1 ? [150, 96, 20] : [230, 176, 40];
            p.set(cx + x, cy + y, shade as RGB);
          }
        }
      p.set(cx - 1, cy - 1, [255, 255, 210]);
    }
  }
  // Gems
  {
    const p = P(Tex.GemSide);
    p.fill((x, y) => sc([40, 36, 48], 0.7 + post(tn(x, y, 8, 41), 5) * 0.5));
    const cols: RGB[] = [
      [210, 60, 220],
      [60, 200, 230],
      [80, 230, 120],
      [230, 60, 90],
    ];
    for (let k = 0; k < 7; k++) {
      const cx = Math.floor(hash2(k, 1, 43) * 30) + 1;
      const cy = Math.floor(hash2(k, 2, 43) * 30) + 1;
      const c = cols[k % cols.length];
      const hgt = 3 + Math.floor(hash2(k, 5, 43) * 4);
      for (let y = 0; y < hgt; y++)
        for (let x = -1; x <= 1; x++) {
          if (Math.abs(x) + (y === 0 ? 1 : 0) > 1 && y === 0) continue;
          const shade = x < 0 ? 1.35 : x > 0 ? 0.7 : 1;
          p.set(cx + x, cy - y, sc(c, shade));
        }
      p.set(cx - 1, cy - hgt + 1, [255, 255, 255]);
    }
  }
  // Bedrock
  {
    const p = P(Tex.RockSide);
    p.fill((x, y) => {
      const n = tn(x, y, 8, 51, 4);
      const cells = tn(x, y, 16, 52, 1);
      let f = 0.6 + post(n, 5) * 0.55;
      if (Math.abs(cells - 0.5) < 0.03) f *= 0.45;
      return sc([62, 60, 70], f);
    });
    for (let k = 0; k < 4; k++) {
      let x = hash2(k, 1, 53) * 32,
        y = hash2(k, 2, 53) * 32;
      for (let s = 0; s < 10; s++) {
        p.set(Math.round(x), Math.round(y), [22, 20, 26]);
        p.set(Math.round(x) + 1, Math.round(y), [90, 88, 98]);
        x += hash2(s, k, 54) - 0.3;
        y += hash2(k, s, 55) * 1.5;
      }
    }
  }
  {
    const p = P(Tex.RockTop);
    p.fill((x, y) => {
      const bev = x === 0 || y === 0 ? 1.15 : x === 31 || y === 31 ? 0.72 : 1;
      return sc([70, 68, 80], (0.6 + post(tn(x, y, 8, 61, 3), 5) * 0.5) * bev);
    });
  }

  // Fortified walls (keeper)
  bricks(P(Tex.WallSide), 71, [74, 66, 72], [26, 22, 28]);
  {
    const p = P(Tex.WallSideB);
    bricks(p, 72, [74, 66, 72], [26, 22, 28]);
    // hanging red keeper banner with a horned sigil
    for (let y = 2; y < 26; y++)
      for (let x = 10; x < 22; x++) {
        const tail = y > 21 && Math.abs(x - 15.5) < (y - 21) * 1.2;
        if (tail) continue;
        const edge = x === 10 || x === 21;
        p.set(x, y, edge ? [70, 10, 12] : sc([150, 20, 24], 0.85 + hash2(x, y, 5) * 0.2));
      }
    p.rect(9, 1, 14, 2, [40, 34, 30]);
    // sigil
    p.disc(15.5, 11, 3, [30, 6, 8]);
    p.line(12, 7, 13, 9, [30, 6, 8]);
    p.line(19, 7, 18, 9, [30, 6, 8]);
    p.set(15, 11, [220, 160, 60]);
    p.set(16, 11, [220, 160, 60]);
  }
  slabs(P(Tex.WallTop), 81, [70, 64, 72], [30, 26, 32], 2);
  bricks(P(Tex.HeroWallSide), 91, [150, 140, 122], [70, 66, 60], 16, 8);
  {
    const p = P(Tex.HeroWallSide);
    for (let x = 0; x < 32; x++) {
      p.set(x, 30, [40, 70, 150]);
      p.set(x, 31, [30, 50, 110]);
    }
  }
  slabs(P(Tex.HeroWallTop), 95, [140, 132, 118], [80, 76, 70], 2);

  // Floors
  {
    const p = P(Tex.Path);
    p.fill((x, y) => {
      const n = tn(x, y, 8, 101, 3);
      const f = 0.6 + post(n, 6) * 0.55;
      const h = hash2(x, y, 102);
      return sc([84, 62, 46], f * (h > 0.92 ? 1.2 : h < 0.06 ? 0.7 : 1));
    });
    for (let k = 0; k < 10; k++) {
      const x = Math.floor(hash2(k, 1, 103) * 32);
      const y = Math.floor(hash2(k, 2, 103) * 32);
      p.set(x, y, [120, 104, 90]);
      p.set(x + 1, y, [70, 60, 52]);
      p.set(x, y + 1, [60, 48, 40]);
    }
  }
  {
    const p = P(Tex.FloorP);
    slabs(p, 111, [72, 64, 76], [24, 20, 28], 2);
    // red keeper diamond at the centre joint
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const d = Math.abs(x) + Math.abs(y);
        if (d <= 4) p.set(16 + x, 16 + y, d === 4 ? [60, 8, 10] : d <= 1 ? [230, 70, 50] : [160, 24, 24]);
      }
  }
  {
    const p = P(Tex.FloorH);
    slabs(p, 121, [150, 144, 132], [90, 86, 80], 2);
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const d = Math.abs(x) + Math.abs(y);
        if (d <= 4) p.set(16 + x, 16 + y, d === 4 ? [30, 40, 90] : d <= 1 ? [230, 230, 200] : [60, 90, 180]);
      }
  }
  {
    const p = P(Tex.Water);
    p.fill((x, y) => {
      const n = tn(x, y, 8, 131, 3);
      const wave = Math.sin((x + tn(x, y, 16, 132, 2) * 12) * (Math.PI / 8)) * 0.5 + 0.5;
      let c = mix([14, 40, 58], [34, 90, 110], post(n, 5));
      if (wave > 0.9 && (y % 8 < 2)) c = mix(c, [120, 180, 190], 0.7);
      return c;
    });
  }
  {
    const p = P(Tex.Lava);
    p.fill((x, y) => {
      const n = tn(x, y, 8, 141, 3);
      const cr = tn(x, y, 4, 142, 2);
      let c = mix([200, 40, 8], [255, 190, 40], post(n, 5));
      if (cr > 0.62) c = mix(c, [60, 14, 8], Math.min(1, (cr - 0.62) * 6));
      return c;
    });
  }

  // Room floors
  {
    const p = P(Tex.Treasury);
    slabs(p, 151, [66, 56, 44], [150, 110, 30], 2);
    for (let i = 0; i < 32; i++) {
      p.set(i, 0, [220, 170, 60]);
      p.set(0, i, [220, 170, 60]);
    }
    p.disc(16, 16, 4, [200, 150, 40]);
    p.disc(16, 16, 2.4, [120, 80, 20]);
    p.disc(15, 15, 1, [255, 230, 130]);
  }
  {
    const p = P(Tex.Lair);
    dirt(p, [70, 50, 38], 161);
    for (let k = 0; k < 40; k++) {
      const x = hash2(k, 1, 162) * 32,
        y = hash2(k, 2, 162) * 32;
      const a = hash2(k, 3, 162) * Math.PI;
      const len = 3 + hash2(k, 4, 162) * 4;
      const col: RGB = hash2(k, 5, 162) > 0.5 ? [180, 150, 80] : [140, 110, 60];
      p.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, col);
    }
  }
  {
    const p = P(Tex.Hatchery);
    dirt(p, [96, 76, 48], 171);
    for (let k = 0; k < 24; k++) {
      const x = hash2(k, 1, 172) * 32,
        y = hash2(k, 2, 172) * 32;
      const a = hash2(k, 3, 172) * Math.PI;
      p.line(x, y, x + Math.cos(a) * 4, y + Math.sin(a) * 4, [200, 170, 90]);
    }
    for (let k = 0; k < 4; k++) {
      const x = hash2(k, 7, 173) * 32,
        y = hash2(k, 8, 173) * 32;
      p.disc(x, y, 1.5, [110, 14, 14]);
    }
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(hash2(k, 9, 174) * 32),
        y = Math.floor(hash2(k, 10, 174) * 32);
      p.set(x, y, [240, 240, 230]);
      p.set(x + 1, y, [200, 200, 190]);
    }
  }
  {
    const p = P(Tex.Training);
    planks(p, 181, [120, 80, 48], true, 8);
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      p.set(Math.round(16 + Math.cos(t) * 11), Math.round(16 + Math.sin(t) * 11), [140, 30, 20]);
    }
  }
  {
    const p = P(Tex.Library);
    p.fill((x, y) => {
      const lx = x % 16,
        ly = y % 16;
      const border = lx < 2 || ly < 2 || lx > 13 || ly > 13;
      const diamond = Math.abs(lx - 7.5) + Math.abs(ly - 7.5) < 5;
      const n = 0.85 + hash2(x, y, 191) * 0.2;
      if (border) return sc([150, 110, 40], n);
      if (diamond) return sc([120, 30, 60], n);
      return sc([60, 24, 60], n);
    });
  }
  {
    const p = P(Tex.Workshop);
    slabs(p, 201, [80, 82, 88], [30, 30, 34], 2);
    for (const [x, y] of [
      [3, 3],
      [12, 3],
      [3, 12],
      [12, 12],
      [19, 19],
      [28, 19],
      [19, 28],
      [28, 28],
      [19, 3],
      [28, 3],
      [3, 19],
      [3, 28],
      [12, 19],
      [12, 28],
      [19, 12],
      [28, 12],
    ]) {
      p.set(x, y, [150, 150, 160]);
      p.set(x + 1, y + 1, [30, 30, 34]);
    }
    for (let k = 0; k < 5; k++) p.disc(hash2(k, 1, 202) * 32, hash2(k, 2, 202) * 32, 2, [40, 38, 36]);
  }
  {
    const p = P(Tex.Prison);
    p.fill((x, y) => {
      const bar = x % 8 < 2 || y % 8 < 2;
      if (bar) return x % 8 === 0 || y % 8 === 0 ? [110, 110, 120] : [70, 70, 80];
      return sc([20, 18, 22], 0.8 + hash2(x, y, 211) * 0.4);
    });
  }
  {
    const p = P(Tex.Torture);
    slabs(p, 221, [70, 50, 50], [30, 16, 16], 2);
    for (let k = 0; k < 6; k++) p.disc(hash2(k, 1, 222) * 32, hash2(k, 2, 222) * 32, 1 + hash2(k, 3, 222) * 2, [100, 10, 10]);
    p.disc(16, 16, 3, [20, 16, 16]);
    for (let a = -2; a <= 2; a++) p.set(16 + a, 16, [60, 56, 56]);
  }
  {
    const p = P(Tex.Graveyard);
    dirt(p, [52, 50, 44], 231);
    for (let k = 0; k < 5; k++) {
      const x = hash2(k, 1, 232) * 28 + 2,
        y = hash2(k, 2, 232) * 28 + 2;
      p.line(x - 2, y, x + 2, y, [200, 196, 180]);
      p.set(x - 2, y - 1, [220, 216, 200]);
      p.set(x + 2, y + 1, [220, 216, 200]);
    }
    p.disc(8, 22, 2, [210, 206, 190]);
    p.set(7, 22, [30, 30, 30]);
    p.set(9, 22, [30, 30, 30]);
  }
  {
    const p = P(Tex.Temple);
    p.fill((x, y) => {
      const n = tn(x, y, 8, 241, 4);
      const vein = Math.abs(tn(x, y, 16, 242, 2) - 0.5) < 0.025;
      let c = mix([28, 16, 36], [70, 40, 90], post(n, 5));
      if (vein) c = [180, 150, 200];
      if (x % 16 === 0 || y % 16 === 0) c = [170, 130, 50];
      return c;
    });
  }
  {
    const p = P(Tex.GuardPost);
    slabs(p, 251, [90, 84, 70], [40, 36, 30], 1);
    for (let i = 4; i < 28; i++) {
      p.set(i, i, [170, 140, 50]);
      p.set(31 - i, i, [170, 140, 50]);
    }
  }
  planks(P(Tex.Bridge), 261, [110, 76, 44], false, 8);
  {
    const p = P(Tex.HeartFloor);
    p.fill((x, y) => {
      const n = tn(x, y, 8, 271, 3);
      const v = Math.abs(tn(x, y, 8, 272, 2) - 0.5) < 0.04;
      const c = mix([70, 14, 18], [130, 30, 34], post(n, 5));
      return v ? [200, 50, 50] : c;
    });
  }
  {
    const p = P(Tex.PortalFloor);
    p.fill((x, y) => {
      const dx = x - 15.5,
        dy = y - 15.5;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const sw = Math.sin(a * 3 + r * 0.6) * 0.5 + 0.5;
      const c = mix([20, 8, 36], [110, 40, 170], post(sw * (1 - r / 24), 5));
      return c;
    });
  }
  {
    const p = P(Tex.HeroGateFloor);
    slabs(p, 291, [170, 170, 190], [90, 100, 140], 2);
    p.disc(16, 16, 5, [220, 230, 255]);
    p.disc(16, 16, 3, [120, 160, 240]);
  }
  {
    const p = P(Tex.HeroKeepFloor);
    p.fill((x, y) => {
      const ch = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
      const n = 0.9 + hash2(x, y, 301) * 0.15;
      return ch ? sc([200, 196, 184], n) : sc([60, 80, 130], n);
    });
  }

  // Room-specific wall faces
  const baseWall = (l: Tex, seed: number) => bricks(P(l), seed, [74, 66, 72], [26, 22, 28]);
  {
    const p = P(Tex.WallLibrary);
    p.fill((x, y) => {
      const shelf = y % 11 === 0 || y % 11 === 10;
      if (shelf || x < 2 || x > 29) return sc([90, 58, 30], 0.85 + hash2(x, y, 311) * 0.2);
      const book = Math.floor(x / 3) + Math.floor(y / 11) * 13;
      const hue = hash2(book, 0, 312);
      const cols: RGB[] = [
        [130, 30, 30],
        [40, 60, 120],
        [40, 90, 50],
        [120, 90, 40],
        [80, 40, 100],
        [60, 50, 40],
      ];
      const c = cols[Math.floor(hue * cols.length)];
      const top = y % 11 < 1 + Math.floor(hash2(book, 1, 313) * 3);
      if (top) return [26, 16, 10];
      const lx = x % 3;
      return sc(c, lx === 0 ? 1.25 : lx === 2 ? 0.7 : 1);
    });
  }
  {
    const p = P(Tex.WallTreasury);
    baseWall(Tex.WallTreasury, 321);
    for (let x = 0; x < 32; x++) {
      p.set(x, 3, [220, 170, 50]);
      p.set(x, 4, [150, 100, 30]);
    }
    for (let k = 0; k < 12; k++) {
      const x = 4 + (k % 6) * 4 + (k > 5 ? 2 : 0);
      const y = 26 - (k > 5 ? 3 : 0);
      p.disc(x, y, 2, [230, 180, 50]);
      p.set(x - 1, y - 1, [255, 240, 150]);
    }
  }
  {
    const p = P(Tex.WallLair);
    baseWall(Tex.WallLair, 331);
    for (let y = 4; y < 24; y++)
      for (let x = 6; x < 26; x++) {
        const ragged = y > 20 && hash2(x, 0, 332) > 0.5;
        if (ragged) continue;
        const n = tn(x, y, 4, 333, 2);
        p.set(x, y, mix([80, 58, 40], [140, 110, 76], post(n, 4)));
      }
    p.rect(5, 3, 22, 1, [40, 30, 22]);
  }
  {
    const p = P(Tex.WallHatchery);
    baseWall(Tex.WallHatchery, 341);
    for (let k = 0; k < 8; k++) {
      const x = hash2(k, 1, 342) * 32,
        y = 10 + hash2(k, 2, 342) * 20;
      p.disc(x, y, 1 + hash2(k, 3, 342) * 2.2, [110, 12, 12]);
      p.line(x, y, x, y + 4, [90, 10, 10]);
    }
  }
  {
    const p = P(Tex.WallTraining);
    baseWall(Tex.WallTraining, 351);
    p.rect(3, 8, 26, 2, [90, 60, 30]);
    for (let k = 0; k < 4; k++) {
      const x = 6 + k * 6;
      p.line(x, 4, x, 24, [170, 170, 180]);
      p.set(x, 4, [230, 230, 240]);
      p.rect(x - 1, 20, 3, 1, [110, 80, 30]);
    }
  }
  {
    const p = P(Tex.WallWorkshop);
    baseWall(Tex.WallWorkshop, 361);
    p.rect(4, 6, 24, 2, [80, 56, 30]);
    p.rect(7, 8, 2, 10, [100, 70, 40]);
    p.rect(5, 16, 6, 4, [110, 110, 120]);
    p.line(20, 8, 26, 20, [150, 150, 160]);
    p.line(21, 8, 27, 20, [100, 100, 110]);
  }
  {
    const p = P(Tex.WallPrison);
    baseWall(Tex.WallPrison, 371);
    for (let k = 0; k < 3; k++) {
      const x = 7 + k * 9;
      for (let y = 2; y < 22; y += 2) {
        p.set(x, y, [120, 120, 130]);
        p.set(x + 1, y + 1, [80, 80, 90]);
      }
      p.disc(x, 23, 2, [100, 100, 110]);
      p.disc(x, 23, 1, [30, 26, 30]);
    }
  }
  {
    const p = P(Tex.WallTorture);
    baseWall(Tex.WallTorture, 381);
    for (let k = 0; k < 10; k++) {
      const x = hash2(k, 1, 382) * 32,
        y = hash2(k, 2, 382) * 32;
      p.disc(x, y, 1 + hash2(k, 3, 382) * 2, [120, 14, 14]);
    }
    for (let k = 0; k < 3; k++) {
      const x = 6 + k * 10;
      p.line(x, 3, x, 10, [140, 140, 150]);
      p.line(x, 10, x + 2, 12, [140, 140, 150]);
    }
  }
  {
    const p = P(Tex.WallGraveyard);
    baseWall(Tex.WallGraveyard, 391);
    for (let k = 0; k < 2; k++) {
      const x0 = 3 + k * 16;
      p.rect(x0, 6, 11, 14, [20, 16, 18]);
      p.disc(x0 + 5, 12, 3.2, [210, 204, 186]);
      p.rect(x0 + 3, 14, 5, 3, [200, 194, 176]);
      p.set(x0 + 4, 12, [20, 16, 18]);
      p.set(x0 + 6, 12, [20, 16, 18]);
    }
  }
  {
    const p = P(Tex.WallTemple);
    p.fill((x, y) => {
      const fold = Math.sin(x * 0.8) * 0.5 + 0.5;
      const c = mix([50, 14, 60], [120, 40, 140], post(fold, 4));
      if (y < 3 || y > 28) return [170, 130, 50];
      return c;
    });
  }
  {
    const p = P(Tex.WallHeart);
    p.fill((x, y) => {
      const n = tn(x, y, 8, 411, 3);
      const v = Math.abs(tn(x, y, 8, 412, 2) - 0.5) < 0.05;
      return v ? [220, 60, 60] : mix([60, 10, 16], [120, 26, 30], post(n, 5));
    });
  }
  {
    const p = P(Tex.WallPortal);
    bricks(p, 421, [50, 36, 70], [16, 10, 24]);
    const rune = (cx: number, cy: number) => {
      p.line(cx, cy - 3, cx, cy + 3, [190, 110, 255]);
      p.line(cx - 2, cy - 1, cx + 2, cy + 1, [190, 110, 255]);
    };
    rune(8, 12);
    rune(24, 20);
    rune(16, 27);
  }
  {
    const p = P(Tex.WallGuard);
    baseWall(Tex.WallGuard, 431);
    p.disc(16, 14, 7, [100, 100, 110]);
    p.disc(16, 14, 5.5, [120, 20, 20]);
    p.line(12, 10, 20, 18, [200, 200, 210]);
    p.line(20, 10, 12, 18, [200, 200, 210]);
  }

  // Detail textures (near-white so vertex colour tints them)
  P(Tex.Plain).fill(() => [235, 235, 235]);
  P(Tex.Skin).fill((x, y) => {
    const n = tn(x, y, 8, 501, 3);
    const s = hash2(x, y, 502) > 0.9 ? 0.85 : 1;
    return sc([255, 255, 255], (0.72 + post(n, 5) * 0.34) * s);
  });
  P(Tex.Cloth).fill((x, y) => {
    const weave = (x + y) % 2 === 0 ? 1 : 0.9;
    const fold = 0.8 + post(Math.sin(x * 0.4 + tn(x, y, 16, 511) * 4) * 0.5 + 0.5, 3) * 0.25;
    return sc([240, 240, 240], weave * fold);
  });
  P(Tex.Metal).fill((x, y) => {
    const n = tn(x, y, 16, 521, 2);
    const scr = hash2(x, Math.floor(y / 2), 522) > 0.9 ? 1.15 : 1;
    const rivet = x % 16 === 3 && y % 16 === 3;
    return rivet ? [255, 255, 255] : sc([220, 220, 225], (0.75 + n * 0.3) * scr);
  });
  P(Tex.Fur).fill((x, y) => {
    const strand = hash2(x, Math.floor(y / 3) + (x % 2), 531);
    return sc([245, 245, 245], 0.65 + post(strand, 4) * 0.4);
  });
  P(Tex.Scale).fill((x, y) => {
    const row = Math.floor(y / 4);
    const lx = (x + (row % 2) * 2) % 4;
    const ly = y % 4;
    const edge = ly === 3 || (lx === 0 && ly > 1);
    return sc([245, 245, 245], edge ? 0.62 : 0.85 + (ly === 0 ? 0.15 : 0));
  });
  planks(P(Tex.Wood), 541, [150, 104, 64], false, 8);
  {
    const p = P(Tex.Straw);
    p.fill((x, y) => sc([190, 150, 80], 0.6 + hash2(x, Math.floor(y / 4), 551) * 0.5));
  }
  P(Tex.Bone).fill((x, y) => sc([226, 220, 200], 0.8 + post(tn(x, y, 8, 561), 4) * 0.25));
  {
    const p = P(Tex.GoldCoins);
    p.fill((x, y) => sc([200, 150, 40], 0.7 + hash2(x, y, 571) * 0.2));
    for (let k = 0; k < 22; k++) {
      const x = hash2(k, 1, 572) * 32,
        y = hash2(k, 2, 572) * 32;
      p.disc(x, y, 2.2, [240, 190, 60]);
      p.set(Math.round(x) - 1, Math.round(y) - 1, [255, 250, 190]);
      p.set(Math.round(x) + 1, Math.round(y) + 1, [140, 90, 20]);
    }
  }
  P(Tex.Flame).fill((x, y) => {
    const t = y / 31;
    const n = tn(x, y, 4, 581, 2);
    return mix([255, 240, 160], [230, 80, 10], Math.min(1, t * 0.8 + n * 0.4));
  });
  {
    const p = P(Tex.Book);
    p.fill((x, y) => (x < 3 ? [60, 20, 20] : x > 28 ? [220, 210, 180] : sc([140, 30, 30], 0.85 + hash2(x, y, 591) * 0.2)));
  }
  P(Tex.Parchment).fill((x, y) => sc([220, 200, 160], 0.8 + post(tn(x, y, 8, 601), 4) * 0.25));
  {
    // generic creature face: eyes + mouth on skin, tinted by vertex colour
    const p = P(Tex.Face);
    p.fill((x, y) => sc([255, 255, 255], 0.8 + post(tn(x, y, 8, 611), 4) * 0.2));
    for (const ex of [9, 21]) {
      p.rect(ex - 3, 11, 6, 4, [30, 10, 10]);
      p.rect(ex - 2, 12, 3, 2, [255, 210, 60]);
      p.set(ex, 12, [255, 255, 200]);
    }
    p.rect(8, 22, 16, 3, [40, 10, 10]);
    for (let x = 9; x < 24; x += 3) p.set(x, 22, [240, 240, 220]);
  }

  return all;
}

export function createTextureArray(): THREE.DataArrayTexture {
  const data = buildTextureData();
  const tex = new THREE.DataArrayTexture(data, TEX, TEX, Tex.COUNT);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Render one texture layer into a canvas (for UI icons).
export function layerToCanvas(data: Uint8Array, layer: number, scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TEX * scale;
  c.height = TEX * scale;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(TEX, TEX);
  img.data.set(data.subarray(layer * TEX * TEX * 4, (layer + 1) * TEX * TEX * 4));
  if (scale === 1) ctx.putImageData(img, 0, 0);
  else {
    const t = document.createElement('canvas');
    t.width = TEX;
    t.height = TEX;
    t.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t, 0, 0, TEX * scale, TEX * scale);
  }
  return c;
}

export { vnoise };
