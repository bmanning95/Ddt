import type { Game } from './game';
import type { Creature } from './entity';
import { Tile } from './defs';

export const MOVING = 0;
export const ARRIVED = 1;
export const BLOCKED = -1;

export function faceTowards(c: Creature, dx: number, dz: number, dt: number, rate = 10) {
  if (Math.abs(dx) + Math.abs(dz) < 1e-5) return;
  const target = Math.atan2(dx, dz);
  let d = target - c.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  c.angle += d * Math.min(1, dt * rate);
}

// Advance along c.path. Returns MOVING / ARRIVED / BLOCKED.
export function followPath(g: Game, c: Creature, dt: number): number {
  if (!c.path || c.pathI >= c.path.length) {
    c.moving = false;
    return ARRIVED;
  }
  const m = g.map;
  let budget = c.speed * dt;
  const here = m.tile[m.idx(c.tx, c.tz)];
  if (here === Tile.Water && !c.def.flying) budget *= 0.6;
  while (budget > 0 && c.pathI < c.path.length) {
    const next = c.path[c.pathI];
    const nx = next % m.w,
      nz = (next / m.w) | 0;
    if (!g.walkableFor(c, nx, nz)) {
      c.path = null;
      c.moving = false;
      return BLOCKED;
    }
    const tx = nx + 0.5,
      tz = nz + 0.5;
    const dx = tx - c.x,
      dz = tz - c.z;
    const d = Math.hypot(dx, dz);
    faceTowards(c, dx, dz, dt);
    if (d <= budget) {
      c.x = tx;
      c.z = tz;
      budget -= d;
      c.pathI++;
    } else {
      c.x += (dx / d) * budget;
      c.z += (dz / d) * budget;
      budget = 0;
    }
  }
  c.moving = true;
  c.anim = c.carryGold > 0 || c.carrying ? 'carry' : 'walk';
  if (c.pathI >= c.path.length) {
    c.moving = false;
    return ARRIVED;
  }
  return MOVING;
}

// Walk directly toward a point (for chasing within open ground). Returns distance left.
export function stepTowards(g: Game, c: Creature, x: number, z: number, dt: number, stopAt = 0): number {
  const dx = x - c.x,
    dz = z - c.z;
  const d = Math.hypot(dx, dz);
  faceTowards(c, dx, dz, dt);
  if (d <= stopAt) {
    c.moving = false;
    return d;
  }
  const step = Math.min(d - stopAt, c.speed * dt);
  const nx = c.x + (dx / d) * step,
    nz = c.z + (dz / d) * step;
  if (g.walkableFor(c, Math.floor(nx), Math.floor(nz))) {
    c.x = nx;
    c.z = nz;
    c.moving = true;
    c.anim = 'walk';
  } else c.moving = false;
  return d - step;
}

// Gentle separation so crowds don't stack into one blob.
export function separate(g: Game, dt: number) {
  const list = g.creatures;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    if (!a.alive || a.state === 'held' || a.state === 'sleep' || a.carriedBy) continue;
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      if (!b.alive || b.state === 'held' || b.state === 'sleep' || b.carriedBy) continue;
      const dx = b.x - a.x,
        dz = b.z - a.z;
      if (Math.abs(dx) > 0.6 || Math.abs(dz) > 0.6) continue;
      const d = Math.hypot(dx, dz);
      const minD = 0.28 * (a.def.scale + b.def.scale);
      if (d >= minD || d < 1e-4) continue;
      const push = ((minD - d) / d) * 0.5 * Math.min(1, dt * 6);
      const px = dx * push,
        pz = dz * push;
      if (!a.moving || b.moving) tryNudge(g, a, -px, -pz);
      if (!b.moving || a.moving) tryNudge(g, b, px, pz);
    }
  }
}

function tryNudge(g: Game, c: Creature, dx: number, dz: number) {
  const nx = c.x + dx,
    nz = c.z + dz;
  if (Math.floor(nx) === c.tx && Math.floor(nz) === c.tz) {
    // stay within tile margins
    const fx = nx - c.tx,
      fz = nz - c.tz;
    if (fx < 0.12 || fx > 0.88 || fz < 0.12 || fz > 0.88) return;
    c.x = nx;
    c.z = nz;
  } else if (g.walkableFor(c, Math.floor(nx), Math.floor(nz)) && !c.path) {
    c.x = nx;
    c.z = nz;
  }
}
