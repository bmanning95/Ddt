import { GameMap } from './map';
import { Tile, Room, PLAYER, HEROES, NEUTRAL, isSolid } from './defs';
import { RNG, fbm } from './rng';

export interface GenOptions {
  seed: number;
  w: number;
  h: number;
  depth: number; // 0-based realm depth in the run
  goldMul: number; // 1 = normal
  water: number; // number of water rivers
  lava: number; // number of lava rivers
  rockiness: number; // 0..1
  caves: number; // extra caves
  portals: number;
  heroBase: boolean;
}

export interface Pt {
  x: number;
  z: number;
}

export interface RealmLayout {
  map: GameMap;
  heart: Pt;
  portals: Pt[];
  heroGates: Pt[];
  heroKeep: Pt | null;
  neutralCaves: { x: number; z: number; count: number }[];
  heroCamps: { x: number; z: number; count: number }[];
  crates: Pt[];
}

export function generateRealm(o: GenOptions): RealmLayout {
  const rng = new RNG(o.seed);
  const { w, h } = o;
  const map = new GameMap(w, h);
  const seedN = rng.int(0, 99999);

  // 1. Earth everywhere, rock blobs by noise, bedrock border.
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = map.idx(x, z);
      map.variant[i] = rng.int(0, 255);
      const border = x < 2 || z < 2 || x >= w - 2 || z >= h - 2;
      const n = fbm(x * 0.09, z * 0.09, seedN, 4);
      const rockT = 0.66 - o.rockiness * 0.12;
      if (border || n > rockT) map.tile[i] = Tile.Rock;
      else map.tile[i] = Tile.Earth;
    }
  }

  // 2. Choose corners for the keeper and the heroes.
  const corner = rng.int(0, 3);
  const cx = (c: number) => (c === 0 || c === 3 ? 0 : 1);
  const cz = (c: number) => (c < 2 ? 0 : 1);
  const margin = 10;
  const heart: Pt = {
    x: cx(corner) ? w - margin - rng.int(0, 4) : margin + rng.int(0, 4),
    z: cz(corner) ? h - margin - rng.int(0, 4) : margin + rng.int(0, 4),
  };
  const heroCorner = (corner + 2) % 4;
  const heroKeep: Pt = {
    x: cx(heroCorner) ? w - 11 - rng.int(0, 3) : 11 + rng.int(0, 3),
    z: cz(heroCorner) ? h - 11 - rng.int(0, 3) : 11 + rng.int(0, 3),
  };

  // 3. Rivers.
  const carveRiver = (kind: Tile) => {
    const horizontal = rng.chance(0.5);
    let px = horizontal ? 2 : rng.int(12, w - 12);
    let pz = horizontal ? rng.int(12, h - 12) : 2;
    let width = rng.chance(0.5) ? 2 : 1;
    for (let step = 0; step < w * 3; step++) {
      for (let a = 0; a < width; a++) {
        const tx = horizontal ? px : px + a;
        const tz = horizontal ? pz + a : pz;
        if (tx > 1 && tz > 1 && tx < w - 2 && tz < h - 2) map.tile[map.idx(tx, tz)] = kind;
      }
      if (horizontal) {
        px++;
        if (rng.chance(0.35)) pz += rng.chance(0.5) ? 1 : -1;
        if (px >= w - 2) break;
      } else {
        pz++;
        if (rng.chance(0.35)) px += rng.chance(0.5) ? 1 : -1;
        if (pz >= h - 2) break;
      }
      if (rng.chance(0.05)) width = rng.chance(0.5) ? 2 : 1;
    }
  };
  for (let i = 0; i < o.water; i++) carveRiver(Tile.Water);
  for (let i = 0; i < o.lava; i++) carveRiver(Tile.Lava);

  // 4. Gold veins and gem seams.
  const goldSeed = rng.int(0, 99999);
  for (let z = 2; z < h - 2; z++) {
    for (let x = 2; x < w - 2; x++) {
      const i = map.idx(x, z);
      if (map.tile[i] !== Tile.Earth) continue;
      const n = fbm(x * 0.16, z * 0.16, goldSeed, 3);
      const vein = Math.abs(n - 0.5) < 0.022 * o.goldMul;
      if (vein || rng.chance(0.012 * o.goldMul)) {
        map.tile[i] = Tile.Gold;
      }
    }
  }
  // clusters of gold
  const clusters = Math.round(6 * o.goldMul) + rng.int(0, 3);
  for (let c = 0; c < clusters; c++) {
    const gx = rng.int(4, w - 5);
    const gz = rng.int(4, h - 5);
    const r = rng.range(1.2, 2.6);
    blob(map, gx, gz, r, (i) => {
      if (map.tile[i] === Tile.Earth || map.tile[i] === Tile.Rock) map.tile[i] = Tile.Gold;
    });
  }
  for (let i = 0; i < map.tile.length; i++) if (map.tile[i] === Tile.Gold) map.gold[i] = 400 + rng.int(0, 200);

  const gemsCount = rng.int(1, 2);
  for (let g = 0; g < gemsCount; g++) {
    const gx = rng.int(8, w - 9);
    const gz = rng.int(8, h - 9);
    if (dist(gx, gz, heart.x, heart.z) < 10) continue;
    const n = rng.int(2, 4);
    let px = gx,
      pz = gz;
    for (let k = 0; k < n; k++) {
      map.tile[map.idx(px, pz)] = Tile.Gems;
      if (rng.chance(0.5)) px += rng.chance(0.5) ? 1 : -1;
      else pz += rng.chance(0.5) ? 1 : -1;
    }
  }

  // 5. Keeper start: 7x7 claimed floor with the 3x3 heart at centre.
  clearArea(map, heart.x, heart.z, 6, Tile.Earth);
  for (let dz = -3; dz <= 3; dz++)
    for (let dx = -3; dx <= 3; dx++) {
      const x = heart.x + dx,
        z = heart.z + dz;
      const i = map.idx(x, z);
      map.tile[i] = Tile.Floor;
      map.owner[i] = PLAYER;
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) map.room[i] = Room.Heart;
    }
  // a couple of gold tiles near the start so the keeper can get going
  for (let k = 0; k < 4; k++) {
    const ang = rng.range(0, Math.PI * 2);
    const d = rng.range(5, 7);
    const gx = Math.round(heart.x + Math.cos(ang) * d);
    const gz = Math.round(heart.z + Math.sin(ang) * d);
    blob(map, gx, gz, 1.2, (i) => {
      if (map.tile[i] === Tile.Earth) {
        map.tile[i] = Tile.Gold;
        map.gold[i] = 450;
      }
    });
  }

  // 6. Portals: in a small cave some distance from the heart, towards the map centre.
  const portals: Pt[] = [];
  const toCenter = Math.atan2(h / 2 - heart.z, w / 2 - heart.x);
  for (let p = 0; p < o.portals; p++) {
    const ang = toCenter + rng.range(-0.9, 0.9) + (p === 0 ? 0 : rng.chance(0.5) ? 1.2 : -1.2);
    const d = p === 0 ? rng.range(10, 13) : rng.range(18, 24);
    const px = clamp(Math.round(heart.x + Math.cos(ang) * d), 6, w - 7);
    const pz = clamp(Math.round(heart.z + Math.sin(ang) * d), 6, h - 7);
    caveBlob(map, rng, px, pz, 3.2, true);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = map.idx(px + dx, pz + dz);
        map.tile[i] = Tile.Floor;
        map.owner[i] = NEUTRAL;
        map.room[i] = Room.Portal;
      }
    portals.push({ x: px, z: pz });
  }

  // 7. Hero stronghold: walled keep with a gate.
  const heroGates: Pt[] = [];
  let keep: Pt | null = null;
  if (o.heroBase) {
    keep = heroKeep;
    const hw = 6,
      hh = 5;
    clearArea(map, keep.x, keep.z, 9, Tile.Earth);
    for (let dz = -hh - 1; dz <= hh + 1; dz++)
      for (let dx = -hw - 1; dx <= hw + 1; dx++) {
        const x = keep.x + dx,
          z = keep.z + dz;
        if (!map.inBounds(x, z)) continue;
        const i = map.idx(x, z);
        const edge = Math.abs(dx) === hw + 1 || Math.abs(dz) === hh + 1;
        if (edge) {
          map.tile[i] = Tile.Wall;
          map.owner[i] = HEROES;
        } else {
          map.tile[i] = Tile.Floor;
          map.owner[i] = HEROES;
          if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) map.room[i] = Room.HeroKeep;
        }
      }
    // gate opening facing the keeper's side, plus a hero gate room nearby inside
    const gdx = Math.sign(heart.x - keep.x);
    const gdz = Math.sign(heart.z - keep.z);
    const openX = gdx !== 0 && rng.chance(0.5);
    if (openX) {
      const x = keep.x + gdx * (hw + 1);
      for (let a = -1; a <= 1; a++) {
        const i = map.idx(x, keep.z + a);
        map.tile[i] = Tile.Floor;
        map.owner[i] = HEROES;
      }
    } else {
      const z = keep.z + gdz * (hh + 1);
      for (let a = -1; a <= 1; a++) {
        const i = map.idx(keep.x + a, z);
        map.tile[i] = Tile.Floor;
        map.owner[i] = HEROES;
      }
    }
    // hero gate: 1 tile room in a corner of the keep
    const gx = gdx !== 0 ? keep.x - gdx * (hw - 1) : keep.x + hw - 1;
    const gz = gdz !== 0 ? keep.z - gdz * (hh - 1) : keep.z + hh - 1;
    map.room[map.idx(gx, gz)] = Room.HeroGate;
    heroGates.push({ x: gx, z: gz });
    // a second outer gate on deeper realms
    if (o.depth >= 3) {
      const ox = clamp(Math.round((heart.x + keep.x) / 2 + rng.int(-6, 6)), 5, w - 6);
      const oz = clamp(Math.round((heart.z + keep.z) / 2 + rng.int(-6, 6)), 5, h - 6);
      if (dist(ox, oz, heart.x, heart.z) > 14) {
        caveBlob(map, rng, ox, oz, 2.2, false);
        const i = map.idx(ox, oz);
        map.tile[i] = Tile.Floor;
        map.owner[i] = HEROES;
        map.room[i] = Room.HeroGate;
        heroGates.push({ x: ox, z: oz });
      }
    }
  }

  // 8. Random caves: neutral creatures, hero camps, treasure crates.
  const neutralCaves: RealmLayout['neutralCaves'] = [];
  const heroCamps: RealmLayout['heroCamps'] = [];
  const crates: Pt[] = [];
  let attempts = 0;
  let made = 0;
  while (made < o.caves && attempts++ < 400) {
    const x = rng.int(5, w - 6);
    const z = rng.int(5, h - 6);
    if (dist(x, z, heart.x, heart.z) < 11) continue;
    if (keep && dist(x, z, keep.x, keep.z) < 11) continue;
    if (portals.some((p) => dist(x, z, p.x, p.z) < 7)) continue;
    const r = rng.range(1.6, 3.2);
    caveBlob(map, rng, x, z, r, false);
    made++;
    const roll = rng.next();
    if (roll < 0.34) neutralCaves.push({ x, z, count: rng.int(1, 2 + Math.floor(o.depth / 2)) });
    else if (roll < 0.62) heroCamps.push({ x, z, count: rng.int(1, 2 + Math.floor(o.depth / 2)) });
    else crates.push({ x, z });
  }
  // a few crates sealed in pockets of earth
  for (let k = 0; k < 3; k++) {
    const x = rng.int(5, w - 6);
    const z = rng.int(5, h - 6);
    if (dist(x, z, heart.x, heart.z) < 8) continue;
    const i = map.idx(x, z);
    if (map.tile[i] === Tile.Earth || map.tile[i] === Tile.Rock) {
      map.tile[i] = Tile.Path;
      crates.push({ x, z });
    }
  }

  // 9. Guarantee connectivity through diggable ground.
  const targets: Pt[] = [...portals, ...heroGates, ...neutralCaves, ...heroCamps, ...crates];
  if (keep) targets.push(keep);
  for (const t of targets) ensureReachable(map, rng, heart, t);

  // 10. Reveal the starting area.
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      if (dist(x, z, heart.x, heart.z) <= 5.5) map.revealed[map.idx(x, z)] = 1;
    }

  return { map, heart, portals, heroGates, heroKeep: keep, neutralCaves, heroCamps, crates };
}

function dist(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}
function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function blob(map: GameMap, cx: number, cz: number, r: number, fn: (i: number) => void) {
  const R = Math.ceil(r);
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx,
        z = cz + dz;
      if (x < 2 || z < 2 || x >= map.w - 2 || z >= map.h - 2) continue;
      if (dx * dx + dz * dz <= r * r) fn(map.idx(x, z));
    }
}

function clearArea(map: GameMap, cx: number, cz: number, r: number, to: Tile) {
  blob(map, cx, cz, r, (i) => {
    const t = map.tile[i];
    if (t === Tile.Rock || t === Tile.Water || t === Tile.Lava || t === Tile.Gems) map.tile[i] = to;
  });
}

function caveBlob(map: GameMap, rng: RNG, cx: number, cz: number, r: number, round: boolean) {
  const n = round ? 1 : rng.int(2, 4);
  for (let k = 0; k < n; k++) {
    const ox = k === 0 ? 0 : rng.int(-2, 2);
    const oz = k === 0 ? 0 : rng.int(-2, 2);
    blob(map, cx + ox, cz + oz, r * (k === 0 ? 1 : 0.7), (i) => {
      map.tile[i] = Tile.Path;
      map.owner[i] = NEUTRAL;
      map.room[i] = Room.None;
    });
  }
}

// BFS through non-bedrock tiles; if the target is sealed off, bore an earth tunnel.
function ensureReachable(map: GameMap, rng: RNG, from: Pt, to: Pt) {
  const { w, h } = map;
  const seen = new Uint8Array(w * h);
  const q: number[] = [map.idx(from.x, from.z)];
  seen[q[0]] = 1;
  const goal = map.idx(to.x, to.z);
  while (q.length) {
    const i = q.shift()!;
    if (i === goal) return;
    const x = i % w,
      z = (i / w) | 0;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= w - 1 || nz >= h - 1) continue;
      const ni = map.idx(nx, nz);
      if (seen[ni]) continue;
      const t = map.tile[ni];
      if (t === Tile.Rock || t === Tile.Lava || t === Tile.Gems) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  // carve an L-shaped earth tunnel through rock
  let x = from.x,
    z = from.z;
  while (x !== to.x || z !== to.z) {
    if (x !== to.x && (z === to.z || rng.chance(0.5))) x += Math.sign(to.x - x);
    else z += Math.sign(to.z - z);
    const i = map.idx(x, z);
    const t = map.tile[i];
    if (t === Tile.Rock || t === Tile.Gems) map.tile[i] = Tile.Earth;
    if (t === Tile.Lava) map.tile[i] = Tile.Path;
  }
}

export { isSolid };
