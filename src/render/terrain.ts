import * as THREE from 'three';
import { GameMap, LightSource } from '../game/map';
import { Tile, Room, WALL_H, isSolid, PLAYER, HEROES, isLiquid } from '../game/defs';
import { Tex } from './textures';
import { createTerrainMaterial, createModelMaterial, shared } from './ps1';
import { GeoBuilder, M } from './builder';

const CHUNK = 8;
// base (unlit) brightness per surface kind, so the dungeon reads even far from torches
const TOP_BASE = 0.5;
const SIDE_BASE = 0.3;
const FLOOR_BASE = 0.27;
const LIQUID_Y = -0.16;

const ROOM_FLOOR: Partial<Record<Room, Tex>> = {
  [Room.Heart]: Tex.HeartFloor,
  [Room.Portal]: Tex.PortalFloor,
  [Room.Treasury]: Tex.Treasury,
  [Room.Lair]: Tex.Lair,
  [Room.Hatchery]: Tex.Hatchery,
  [Room.Training]: Tex.Training,
  [Room.Library]: Tex.Library,
  [Room.Workshop]: Tex.Workshop,
  [Room.Prison]: Tex.Prison,
  [Room.Torture]: Tex.Torture,
  [Room.Graveyard]: Tex.Graveyard,
  [Room.Temple]: Tex.Temple,
  [Room.GuardPost]: Tex.GuardPost,
  [Room.Bridge]: Tex.Bridge,
  [Room.HeroGate]: Tex.HeroGateFloor,
  [Room.HeroKeep]: Tex.HeroKeepFloor,
};
const ROOM_WALL: Partial<Record<Room, Tex>> = {
  [Room.Heart]: Tex.WallHeart,
  [Room.Portal]: Tex.WallPortal,
  [Room.Treasury]: Tex.WallTreasury,
  [Room.Lair]: Tex.WallLair,
  [Room.Hatchery]: Tex.WallHatchery,
  [Room.Training]: Tex.WallTraining,
  [Room.Library]: Tex.WallLibrary,
  [Room.Workshop]: Tex.WallWorkshop,
  [Room.Prison]: Tex.WallPrison,
  [Room.Torture]: Tex.WallTorture,
  [Room.Graveyard]: Tex.WallGraveyard,
  [Room.Temple]: Tex.WallTemple,
  [Room.GuardPost]: Tex.WallGuard,
};

const ROOM_LIGHT: Partial<Record<Room, [number, number, number]>> = {
  [Room.Treasury]: [0.75, 0.6, 0.25],
  [Room.Lair]: [0.45, 0.32, 0.22],
  [Room.Hatchery]: [0.62, 0.42, 0.22],
  [Room.Training]: [0.7, 0.45, 0.22],
  [Room.Library]: [0.5, 0.35, 0.6],
  [Room.Workshop]: [0.75, 0.42, 0.2],
  [Room.Prison]: [0.3, 0.38, 0.5],
  [Room.Torture]: [0.7, 0.2, 0.15],
  [Room.Graveyard]: [0.3, 0.45, 0.35],
  [Room.Temple]: [0.55, 0.3, 0.7],
  [Room.GuardPost]: [0.6, 0.5, 0.3],
  [Room.HeroKeep]: [0.6, 0.6, 0.55],
};

export const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// Which faces of a wall tile carry a torch (bitmask N=1,E=2,S=4,W=8).
export function torchMask(map: GameMap, x: number, z: number): number {
  const t = map.get(x, z);
  if (t !== Tile.Wall) return 0;
  let m = 0;
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = DIRS[d];
    const nx = x + dx,
      nz = z + dz;
    if (isSolid(map.get(nx, nz)) || isLiquid(map.get(nx, nz))) continue;
    if (!map.revealed[map.idx(nx, nz)]) continue;
    const along = d === 0 || d === 2 ? x : z;
    if (along % 3 === 1) m |= 1 << d;
  }
  return m;
}

// Treat unrevealed open ground as solid earth so hidden caves stay hidden.
function renderTile(map: GameMap, x: number, z: number): Tile {
  if (!map.inBounds(x, z)) return Tile.Rock;
  const i = map.idx(x, z);
  const t = map.tile[i];
  if (!map.revealed[i]) {
    if (!isSolid(t)) return Tile.Earth;
    if (t === Tile.Wall) return Tile.Earth;
  }
  return t;
}

export class LightGrid {
  data: Float32Array;
  prev: Float32Array;
  tex: THREE.DataTexture;
  bytes: Uint8Array;
  lights: LightSource[] = [];
  constructor(public map: GameMap) {
    const n = map.w * map.h;
    this.data = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.bytes = new Uint8Array(n * 4);
    this.tex = new THREE.DataTexture(this.bytes, map.w, map.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
  }

  collectLights(extra: LightSource[]) {
    const map = this.map;
    const L: LightSource[] = [];
    for (let z = 0; z < map.h; z++)
      for (let x = 0; x < map.w; x++) {
        const i = map.idx(x, z);
        const tm = torchMask(map, x, z);
        if (tm) {
          const hero = map.owner[i] === HEROES;
          for (let d = 0; d < 4; d++)
            if (tm & (1 << d)) {
              const [dx, dz] = DIRS[d];
              L.push({
                x: x + 0.5 + dx * 0.62,
                z: z + 0.5 + dz * 0.62,
                y: 1,
                r: hero ? 0.95 : 1.05,
                g: hero ? 0.85 : 0.62,
                b: hero ? 0.7 : 0.32,
                radius: 5.2,
                flicker: 1,
              });
            }
        }
        const t = map.tile[i];
        if (t === Tile.Floor && map.revealed[i]) {
          const room = map.room[i] as Room;
          const rl = ROOM_LIGHT[room];
          if (rl && x % 3 === 1 && z % 3 === 1) L.push({ x: x + 0.5, z: z + 0.5, y: 1.2, r: rl[0], g: rl[1], b: rl[2], radius: 4.2, flicker: 0.5 });
          else if (room === Room.None && map.owner[i] === PLAYER && x % 4 === 2 && z % 4 === 2) L.push({ x: x + 0.5, z: z + 0.5, y: 1.2, r: 0.3, g: 0.2, b: 0.18, radius: 4.5, flicker: 0 });
        }
        if (t === Tile.Lava && map.revealed[i] && (x + z) % 2 === 0) L.push({ x: x + 0.5, z: z + 0.5, y: 0.3, r: 0.8, g: 0.3, b: 0.05, radius: 2.6, flicker: 0.5 });
        if (t === Tile.Gems && (x * 7 + z) % 2 === 0) L.push({ x: x + 0.5, z: z + 0.5, y: 0.5, r: 0.25, g: 0.2, b: 0.4, radius: 2.2, flicker: 0 });
      }
    this.lights = L.concat(extra);
  }

  // Line of sight from tile a to tile b through open tiles (end tiles may be solid).
  los(ax: number, az: number, bx: number, bz: number): boolean {
    const map = this.map;
    const dx = bx - ax,
      dz = bz - az;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) * 3);
    const sx = Math.floor(ax),
      sz = Math.floor(az);
    const ex = Math.floor(bx),
      ez = Math.floor(bz);
    for (let s = 1; s < steps; s++) {
      const x = Math.floor(ax + (dx * s) / steps);
      const z = Math.floor(az + (dz * s) / steps);
      if ((x === sx && z === sz) || (x === ex && z === ez)) continue;
      if (isSolid(renderTile(map, x, z))) return false;
    }
    return true;
  }

  compute(): Set<number> {
    const map = this.map;
    this.prev.set(this.data);
    this.data.fill(0);
    for (const l of this.lights) {
      const R = Math.ceil(l.radius);
      const lx = Math.floor(l.x),
        lz = Math.floor(l.z);
      for (let z = lz - R; z <= lz + R; z++)
        for (let x = lx - R; x <= lx + R; x++) {
          if (!map.inBounds(x, z)) continue;
          const d = Math.hypot(x + 0.5 - l.x, z + 0.5 - l.z, 0.6 - l.y);
          if (d >= l.radius) continue;
          if (!this.los(l.x, l.z, x + 0.5, z + 0.5)) continue;
          let a = 1 - d / l.radius;
          a = a * a * 1.2;
          const i = (z * map.w + x) * 3;
          this.data[i] += l.r * a;
          this.data[i + 1] += l.g * a;
          this.data[i + 2] += l.b * a;
        }
    }
    const changed = new Set<number>();
    for (let i = 0; i < map.w * map.h; i++) {
      const j = i * 3;
      const dr = Math.abs(this.data[j] - this.prev[j]) + Math.abs(this.data[j + 1] - this.prev[j + 1]) + Math.abs(this.data[j + 2] - this.prev[j + 2]);
      if (dr > 0.01) changed.add(i);
      const k = i * 4;
      this.bytes[k] = Math.min(255, this.data[j] * 127.5);
      this.bytes[k + 1] = Math.min(255, this.data[j + 1] * 127.5);
      this.bytes[k + 2] = Math.min(255, this.data[j + 2] * 127.5);
      this.bytes[k + 3] = map.revealed[i] ? 255 : 0;
    }
    this.tex.needsUpdate = true;
    return changed;
  }

  at(x: number, z: number, out: number[]) {
    const map = this.map;
    if (!map.inBounds(x, z)) {
      out[0] = out[1] = out[2] = 0;
      return out;
    }
    const i = (z * map.w + x) * 3;
    out[0] = this.data[i];
    out[1] = this.data[i + 1];
    out[2] = this.data[i + 2];
    return out;
  }

  // Smooth light at a world position (bilinear), for CPU-side queries.
  sample(wx: number, wz: number): [number, number, number] {
    const x = Math.floor(wx - 0.5),
      z = Math.floor(wz - 0.5);
    const fx = wx - 0.5 - x,
      fz = wz - 0.5 - z;
    const a = this.at(x, z, [0, 0, 0]),
      b = this.at(x + 1, z, [0, 0, 0]),
      c = this.at(x, z + 1, [0, 0, 0]),
      d = this.at(x + 1, z + 1, [0, 0, 0]);
    const r: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++) r[k] = a[k] * (1 - fx) * (1 - fz) + b[k] * fx * (1 - fz) + c[k] * (1 - fx) * fz + d[k] * fx * fz;
    return r;
  }
}

interface Chunk {
  cx: number;
  cz: number;
  mesh: THREE.Mesh | null;
  props: THREE.Mesh | null;
  dirty: boolean;
}

export class TerrainRenderer {
  group = new THREE.Group();
  material: THREE.ShaderMaterial;
  propMaterial: THREE.ShaderMaterial;
  chunks: Chunk[] = [];
  ncx: number;
  ncz: number;
  light: LightGrid;
  lightsDirty = true;
  extraLights: LightSource[] = [];
  // hover/selection highlight
  tagMesh: THREE.Mesh;
  ceiling: THREE.Mesh;
  wallScale = 1;
  private tmp = [0, 0, 0];

  constructor(public map: GameMap) {
    this.material = createTerrainMaterial();
    this.propMaterial = createModelMaterial();
    this.ncx = Math.ceil(map.w / CHUNK);
    this.ncz = Math.ceil(map.h / CHUNK);
    for (let cz = 0; cz < this.ncz; cz++)
      for (let cx = 0; cx < this.ncx; cx++) this.chunks.push({ cx, cz, mesh: null, props: null, dirty: true });
    this.light = new LightGrid(map);
    shared.uLightGrid.value = this.light.tex;
    shared.uGridSize.value.set(map.w, map.h);
    map.onChange((x, z) => this.markTile(x, z));
    this.tagMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    // a low stone ceiling, only shown when seeing the world through a minion's eyes
    const cg = new THREE.BufferGeometry();
    const cp: number[] = [],
      cu: number[] = [],
      cc: number[] = [],
      cl: number[] = [],
      ci: number[] = [];
    const k = 0.7;
    for (let z = 0; z < map.h; z += 2)
      for (let x = 0; x < map.w; x += 2) {
        const b = cp.length / 3;
        cp.push(x, 0, z, x + 2, 0, z, x + 2, 0, z + 2, x, 0, z + 2);
        cu.push(0, 0, 2, 0, 2, 2, 0, 2);
        for (let q = 0; q < 4; q++) {
          cc.push(k, k * 0.95, k * 0.9);
          cl.push(Tex.RockTop);
        }
        ci.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    cg.setAttribute('layer', new THREE.Float32BufferAttribute(cl, 1));
    cg.setIndex(ci);
    this.ceiling = new THREE.Mesh(cg, this.material);
    this.ceiling.visible = false;
    this.ceiling.frustumCulled = false;
    this.group.add(this.ceiling);
  }

  setWallScale(s: number) {
    this.wallScale = s;
    for (const c of this.chunks) if (c.mesh) c.mesh.scale.y = s;
    this.ceiling.visible = s > 1.01;
    this.ceiling.position.y = WALL_H * s - 0.02;
  }

  markTile(x: number, z: number) {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) this.markChunkAt(x + dx, z + dz);
    this.lightsDirty = true;
  }
  private markChunkAt(x: number, z: number) {
    if (!this.map.inBounds(x, z)) return;
    const c = this.chunks[Math.floor(z / CHUNK) * this.ncx + Math.floor(x / CHUNK)];
    c.dirty = true;
  }
  markAll() {
    for (const c of this.chunks) c.dirty = true;
    this.lightsDirty = true;
  }

  private lastLight = 0;

  update() {
    const now = performance.now();
    if (this.lightsDirty && now - this.lastLight > 120) {
      this.lightsDirty = false;
      this.lastLight = now;
      this.light.collectLights(this.extraLights);
      const changed = this.light.compute();
      for (const i of changed) {
        const x = i % this.map.w,
          z = (i / this.map.w) | 0;
        this.markChunkAt(x, z);
        this.markChunkAt(x + 1, z + 1);
        this.markChunkAt(x - 1, z - 1);
      }
    }
    let budget = 12;
    for (const c of this.chunks) {
      if (!c.dirty) continue;
      if (budget-- <= 0) break;
      this.rebuild(c);
    }
  }

  // average light of the non-solid tiles around a grid corner
  private cornerLight(cx: number, cz: number, out: number[], includeSolid: boolean): number {
    let r = 0,
      g = 0,
      b = 0,
      n = 0,
      solids = 0;
    for (let dz = -1; dz <= 0; dz++)
      for (let dx = -1; dx <= 0; dx++) {
        const x = cx + dx,
          z = cz + dz;
        const s = isSolid(renderTile(this.map, x, z));
        if (s) solids++;
        if (s && !includeSolid) continue;
        this.light.at(x, z, this.tmp);
        r += this.tmp[0];
        g += this.tmp[1];
        b += this.tmp[2];
        n++;
      }
    if (n) {
      out[0] = r / n;
      out[1] = g / n;
      out[2] = b / n;
    } else out[0] = out[1] = out[2] = 0;
    return solids;
  }

  private cornerReveal(cx: number, cz: number): number {
    let s = 0;
    for (let dz = -1; dz <= 0; dz++)
      for (let dx = -1; dx <= 0; dx++) {
        const x = cx + dx,
          z = cz + dz;
        if (this.map.inBounds(x, z) && this.map.revealed[this.map.idx(x, z)]) s++;
      }
    return 0.25 + (s / 4) * 0.75;
  }

  private rebuild(c: Chunk) {
    c.dirty = false;
    const map = this.map;
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const lay: number[] = [];
    const idx: number[] = [];
    const L = [0, 0, 0];
    const props = new GeoBuilder();

    const quad = (p: number[], uvs: number[], cols: number[], layer: number) => {
      const b = pos.length / 3;
      for (let k = 0; k < 4; k++) {
        pos.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
        uv.push(uvs[k * 2], uvs[k * 2 + 1]);
        col.push(cols[k * 3], cols[k * 3 + 1], cols[k * 3 + 2]);
        lay.push(layer);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };

    const rotUV = (r: number): number[] => {
      const base = [0, 0, 1, 0, 1, 1, 0, 1];
      const out: number[] = [];
      for (let k = 0; k < 4; k++) {
        const j = (k + r) % 4;
        out.push(base[j * 2], base[j * 2 + 1]);
      }
      return out;
    };

    const x0 = c.cx * CHUNK,
      z0 = c.cz * CHUNK;
    for (let z = z0; z < Math.min(z0 + CHUNK, map.h); z++)
      for (let x = x0; x < Math.min(x0 + CHUNK, map.w); x++) {
        const i = map.idx(x, z);
        const t = renderTile(map, x, z);
        const variant = map.variant[i];
        const owner = map.owner[i];
        const revealed = map.revealed[i];
        if (isSolid(t)) {
          // top
          let topTex = Tex.EarthTop;
          if (t === Tile.Rock) topTex = Tex.RockTop;
          else if (t === Tile.Gold) topTex = Tex.GoldTop;
          else if (t === Tile.Gems) topTex = Tex.GemTop;
          else if (t === Tile.Wall) topTex = owner === HEROES ? Tex.HeroWallTop : Tex.WallTop;
          const tc: number[] = [];
          const corners = [
            [x, z + 1],
            [x + 1, z + 1],
            [x + 1, z],
            [x, z],
          ];
          for (const [ccx, ccz] of corners) {
            this.cornerLight(ccx, ccz, L, true);
            const rv = this.cornerReveal(ccx, ccz);
            const k = 0.5 * rv;
            const base = TOP_BASE * rv;
            tc.push(L[0] * k + base, L[1] * k + base * 0.92, L[2] * k + base * 0.9);
          }
          const tagged = map.tagged[i];
          quad([x, WALL_H, z + 1, x + 1, WALL_H, z + 1, x + 1, WALL_H, z, x, WALL_H, z], rotUV(t === Tile.Wall ? 0 : variant & 3), tc, topTex);
          if (tagged) {
            // tagged-for-digging marker: a slightly raised glowing overlay
            const g = [0.9, 0.7, 0.2];
            const y = WALL_H + 0.01;
            quad([x + 0.1, y, z + 0.9, x + 0.9, y, z + 0.9, x + 0.9, y, z + 0.1, x + 0.1, y, z + 0.1], [0, 0, 1, 0, 1, 1, 0, 1], [...g, ...g, ...g, ...g], Tex.GoldSide);
          }
          // sides
          for (let d = 0; d < 4; d++) {
            const [dx, dz] = DIRS[d];
            const nx = x + dx,
              nz = z + dz;
            const nt = renderTile(map, nx, nz);
            if (isSolid(nt)) continue;
            let sideTex = Tex.EarthSide;
            if (t === Tile.Gold) sideTex = Tex.GoldSide;
            else if (t === Tile.Gems) sideTex = Tex.GemSide;
            else if (t === Tile.Rock) sideTex = Tex.RockSide;
            else if (t === Tile.Wall) {
              if (owner === HEROES) sideTex = Tex.HeroWallSide;
              else {
                const nr = map.roomAt(nx, nz) as Room;
                const rw = ROOM_WALL[nr];
                if (rw !== undefined && map.ownerAt(nx, nz) === owner) sideTex = rw;
                else sideTex = (d === 0 || d === 2 ? x : z) % 4 === 2 ? Tex.WallSideB : Tex.WallSide;
              }
            }
            const [ax, az, bx, bz] = faceCorners(x, z, d);
            const la = this.faceLight(nx, nz, ax, az, dx, dz);
            const lb = this.faceLight(nx, nz, bx, bz, dx, dz);
            const rv = revealed || map.revealed[map.idx(nx, nz)] ? 1 : 0.3;
            const bot = 0.7 * rv,
              top = 1.0 * rv;
            const sb = SIDE_BASE * rv;
            const yb = -0.3;
            quad(
              [ax, yb, az, bx, yb, bz, bx, WALL_H, bz, ax, WALL_H, az],
              [0, 0, 1, 0, 1, 1, 0, 1],
              [
                la[0] * bot + sb * 0.6, la[1] * bot + sb * 0.6, la[2] * bot + sb * 0.6,
                lb[0] * bot + sb * 0.6, lb[1] * bot + sb * 0.6, lb[2] * bot + sb * 0.6,
                lb[0] * top + sb, lb[1] * top + sb, lb[2] * top + sb,
                la[0] * top + sb, la[1] * top + sb, la[2] * top + sb,
              ],
              sideTex,
            );
          }
          // torches
          const tm = torchMask(map, x, z);
          if (tm) {
            for (let d = 0; d < 4; d++)
              if (tm & (1 << d)) {
                const [dx, dz] = DIRS[d];
                const px = x + 0.5 + dx * 0.52,
                  pz = z + 0.5 + dz * 0.52;
                const ry = Math.atan2(dx, dz);
                props.box(M(px, 0.86, pz, 0, ry, 0), 0.06, 0.26, 0.06, { color: 0x5a3a22, layer: Tex.Wood });
                props.box(M(px - dx * 0.05, 0.78, pz - dz * 0.05, 0, ry, 0), 0.12, 0.05, 0.14, { color: 0x333338, layer: Tex.Metal });
                props.cross(M(px, 0.98, pz, 0, Math.PI / 4, 0), 0.16, 0.24, { color: 0xffffff, layer: Tex.Flame });
              }
          }
        } else {
          const liquid = t === Tile.Water || t === Tile.Lava;
          const y = liquid ? LIQUID_Y : 0;
          let tex = Tex.Path;
          const room = map.room[i] as Room;
          if (t === Tile.Water) tex = Tex.Water;
          else if (t === Tile.Lava) tex = Tex.Lava;
          else if (room !== Room.None && ROOM_FLOOR[room] !== undefined) tex = ROOM_FLOOR[room]!;
          else if (t === Tile.Floor) tex = owner === HEROES ? Tex.FloorH : owner === PLAYER ? Tex.FloorP : Tex.Path;
          const fc: number[] = [];
          const corners = [
            [x, z + 1],
            [x + 1, z + 1],
            [x + 1, z],
            [x, z],
          ];
          for (const [ccx, ccz] of corners) {
            const solids = this.cornerLight(ccx, ccz, L, false);
            const ao = 1 - solids * 0.14;
            const rv = this.cornerReveal(ccx, ccz);
            const fb = FLOOR_BASE;
            fc.push((L[0] + fb) * ao * rv, (L[1] + fb) * ao * rv, (L[2] + fb * 1.1) * ao * rv);
          }
          const rotatable = tex === Tex.Path || tex === Tex.Lair || tex === Tex.Hatchery || tex === Tex.Graveyard || tex === Tex.Lava || tex === Tex.Water;
          quad([x, y, z + 1, x + 1, y, z + 1, x + 1, y, z, x, y, z], rotatable && !liquid ? rotUV(variant & 3) : [0, 0, 1, 0, 1, 1, 0, 1], fc, tex);
          // skirts down to neighbouring liquid
          if (!liquid) {
            for (let d = 0; d < 4; d++) {
              const [dx, dz] = DIRS[d];
              const nt = renderTile(map, x + dx, z + dz);
              if (nt !== Tile.Water && nt !== Tile.Lava) continue;
              const [ax, az, bx, bz] = faceCorners(x, z, d);
              const k = 0.5;
              const cc = [fc[0] * k, fc[1] * k, fc[2] * k];
              quad([ax, LIQUID_Y - 0.05, az, bx, LIQUID_Y - 0.05, bz, bx, 0, bz, ax, 0, az], [0, 0, 1, 0, 1, 0.2, 0, 0.2], [...cc, ...cc, ...cc, ...cc], Tex.Path);
            }
          }
        }
      }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('layer', new THREE.Float32BufferAttribute(lay, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    if (c.mesh) {
      c.mesh.geometry.dispose();
      c.mesh.geometry = g;
    } else {
      c.mesh = new THREE.Mesh(g, this.material);
      c.mesh.scale.y = this.wallScale;
      this.group.add(c.mesh);
    }
    if (c.props) {
      this.group.remove(c.props);
      c.props.geometry.dispose();
      c.props = null;
    }
    if (!props.empty) {
      c.props = new THREE.Mesh(props.build(), this.propMaterial);
      this.group.add(c.props);
    }
  }

  // Light on a wall face corner: average of the open tile in front, and its neighbour along the edge.
  private faceLight(ox: number, oz: number, cx: number, cz: number, dx: number, dz: number): number[] {
    const out = [0, 0, 0];
    this.light.at(ox, oz, out);
    let sx = ox,
      sz = oz;
    if (dx === 0) sx = cx === ox ? ox - 1 : ox + 1;
    else sz = cz === oz ? oz - 1 : oz + 1;
    void dz;
    if (!isSolid(renderTile(this.map, sx, sz))) {
      const o2 = [0, 0, 0];
      this.light.at(sx, sz, o2);
      out[0] = (out[0] + o2[0]) / 2;
      out[1] = (out[1] + o2[1]) / 2;
      out[2] = (out[2] + o2[2]) / 2;
    }
    return out;
  }
}

// Corners (a, b) of the edge of tile (x,z) facing direction d, ordered so the
// quad (a-low, b-low, b-high, a-high) faces outward.
function faceCorners(x: number, z: number, d: number): [number, number, number, number] {
  if (d === 0) return [x + 1, z, x, z];
  if (d === 1) return [x + 1, z + 1, x + 1, z];
  if (d === 2) return [x, z + 1, x + 1, z + 1];
  return [x, z, x, z + 1];
}
