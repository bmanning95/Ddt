import type { Game } from './game';
import type { Creature } from './entity';
import { RangedKind } from './creatures';
import { NEUTRAL, PLAYER, isSolid } from './defs';
import { followPath, stepTowards, faceTowards } from './movement';

export interface Projectile {
  kind: RangedKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  owner: number;
  src: Creature | null;
  target: Creature | null;
  dmg: number;
  splash: number;
  t: number;
  alive: boolean;
  id: number;
}

let PID = 1;

const CAPTIVE = new Set(['ko', 'prisoner', 'tortured', 'carried']);
export function isCaptive(c: Creature) {
  return CAPTIVE.has(c.state);
}

export function hostile(a: Creature, b: Creature): boolean {
  if (a.owner === b.owner) return false;
  if (CAPTIVE.has(a.state) || CAPTIVE.has(b.state)) return false;
  if (a.owner === NEUTRAL || b.owner === NEUTRAL) return false;
  if (a.kind === 'chicken' || b.kind === 'chicken') return false;
  return true;
}

export function targetable(c: Creature): boolean {
  return c.alive && !c.removed && c.state !== 'held' && !c.carriedBy && c.y < 1 && !CAPTIVE.has(c.state);
}

export function findEnemy(g: Game, c: Creature, radius: number): Creature | null {
  let best: Creature | null = null;
  let bd = radius;
  for (const e of g.creatures) {
    if (!targetable(e) || !hostile(c, e)) continue;
    const d = Math.hypot(e.x - c.x, e.z - c.z);
    if (d > bd) continue;
    // player-side creatures only see enemies on revealed ground; everyone needs line of sight
    if (!g.losTiles(c.x, c.z, e.x, e.z)) continue;
    if (e.asleepInCamp && d > 2.5) continue;
    best = e;
    bd = d;
  }
  return best;
}

export function findAlly(g: Game, c: Creature, radius: number, pred: (o: Creature) => boolean): Creature | null {
  let best: Creature | null = null;
  let bd = radius;
  for (const e of g.creatures) {
    if (e === c || !targetable(e) || e.owner !== c.owner) continue;
    const d = Math.hypot(e.x - c.x, e.z - c.z);
    if (d > bd || !pred(e)) continue;
    best = e;
    bd = d;
  }
  return best;
}

function reachOf(a: Creature, b: Creature) {
  return 0.5 + 0.22 * (a.def.scale + b.def.scale);
}

export function dmgMul(g: Game, c: Creature) {
  let m = c.owner === PLAYER ? g.rules.minionDmgMul : g.rules.heroDmgMul;
  if (c.speedT > 0) m *= 1.15;
  return m;
}

// Close to melee range with e and swing. Returns true while engaged.
export function meleeTick(g: Game, c: Creature, e: Creature, dt: number): boolean {
  const d = Math.hypot(e.x - c.x, e.z - c.z);
  const reach = reachOf(c, e);
  if (d > reach) {
    if (d < 2.5 && g.losTiles(c.x, c.z, e.x, e.z)) {
      c.path = null;
      stepTowards(g, c, e.x, e.z, dt, reach * 0.9);
    } else {
      if (!c.path || c.stateT > 0.7) {
        c.stateT = 0;
        if (!g.pathTo(c, e.tx, e.tz, false, 2500)) {
          c.target = null;
          return false;
        }
      }
      followPath(g, c, dt);
    }
    return true;
  }
  c.path = null;
  c.moving = false;
  faceTowards(c, e.x - c.x, e.z - c.z, dt, 14);
  if (c.attackCd <= 0) {
    c.attackCd = c.def.attackRate * (c.speedT > 0 ? 0.7 : 1) * (c.slapT > 0 ? 0.85 : 1);
    c.anim = 'attack';
    c.animT = 0;
    const dmg = c.dmg * dmgMul(g, c) * (0.85 + g.rng.next() * 0.3);
    g.damage(e, dmg, c);
    g.fx('hit', (c.x + e.x) / 2, (c.z + e.z) / 2, 0.6 * e.def.scale, 4);
    g.sfx(c.def.hero ? 'clang' : 'hit', e.x, e.z);
  } else if (c.anim !== 'attack' || c.animT > 0.45) c.anim = 'idle';
  return true;
}

// Fire at e if in range. Returns true if in range (and so shouldn't close in).
export function rangedTick(g: Game, c: Creature, e: Creature, dt: number): boolean {
  const r = c.def.ranged;
  if (!r) return false;
  const d = Math.hypot(e.x - c.x, e.z - c.z);
  if (d > r.range || !g.losTiles(c.x, c.z, e.x, e.z)) return false;
  // prefer melee when right on top of the target, except dedicated casters
  if (d < reachOf(c, e) && c.def.dmg > r.dmg * 0.5) return false;
  c.path = null;
  c.moving = false;
  faceTowards(c, e.x - c.x, e.z - c.z, dt, 12);
  if (c.rangedCd <= 0) {
    c.rangedCd = r.rate * (c.speedT > 0 ? 0.7 : 1);
    c.anim = 'cast';
    c.animT = 0;
    fire(g, c, e, r.kind, r.dmg * (1 + (c.level - 1) * 0.12) * dmgMul(g, c), r.speed, r.splash ?? 0);
  } else if (c.animT > 0.5) c.anim = 'idle';
  return true;
}

export function fire(g: Game, c: Creature, e: Creature, kind: RangedKind, dmg: number, speed: number, splash: number) {
  const dx = e.x - c.x,
    dz = e.z - c.z;
  const d = Math.hypot(dx, dz) || 1;
  const p: Projectile = {
    kind,
    x: c.x + (dx / d) * 0.3,
    y: 0.55 * c.def.scale + 0.2,
    z: c.z + (dz / d) * 0.3,
    vx: (dx / d) * speed,
    vz: (dz / d) * speed,
    owner: c.owner,
    src: c,
    target: e,
    dmg,
    splash,
    t: 0,
    alive: true,
    id: PID++,
  };
  g.projectiles.push(p);
  g.sfx(kind === 'arrow' ? 'bow' : kind === 'heal' ? 'heal' : 'cast', c.x, c.z);
}

export function updateProjectiles(g: Game, dt: number) {
  const m = g.map;
  for (const p of g.projectiles) {
    if (!p.alive) continue;
    p.t += dt;
    // gentle homing
    const tg = p.target;
    if (tg && targetable(tg)) {
      const dx = tg.x - p.x,
        dz = tg.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const sp = Math.hypot(p.vx, p.vz);
      const k = Math.min(1, dt * 4);
      p.vx += ((dx / d) * sp - p.vx) * k;
      p.vz += ((dz / d) * sp - p.vz) * k;
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const tx = Math.floor(p.x),
      tz = Math.floor(p.z);
    if (!m.inBounds(tx, tz) || isSolid(m.tile[m.idx(tx, tz)]) || p.t > 3) {
      explode(g, p, null);
      continue;
    }
    for (const c of g.creatures) {
      if (!targetable(c)) continue;
      const friendly = c.owner === p.owner;
      if (p.kind === 'heal' ? !(friendly && c === p.target) : friendly || c.owner === NEUTRAL) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) < 0.3 + c.def.scale * 0.2) {
        explode(g, p, c);
        break;
      }
    }
  }
  if (g.projectiles.length > 64 || g.projectiles.some((p) => !p.alive)) g.projectiles = g.projectiles.filter((p) => p.alive);
}

function explode(g: Game, p: Projectile, hit: Creature | null) {
  p.alive = false;
  const fxName = p.kind === 'arrow' ? 'hit' : p.kind === 'heal' ? 'heal' : p.kind === 'web' ? 'web' : p.kind === 'drain' ? 'drain' : p.kind === 'gas' ? 'gas' : 'fire';
  g.fx(fxName, p.x, p.z, p.y, p.kind === 'fireball' || p.kind === 'bolt' ? 14 : 6);
  if (p.kind === 'heal') {
    if (hit) hit.hp = Math.min(hit.maxHp, hit.hp - p.dmg);
    return;
  }
  if (p.kind === 'fireball' || p.kind === 'bolt') g.sfx('explode_small', p.x, p.z);
  if (hit) {
    g.damage(hit, p.dmg, p.src);
    if (p.kind === 'web') hit.slowT = 5;
    if (p.kind === 'drain' && p.src && p.src.alive) p.src.hp = Math.min(p.src.maxHp, p.src.hp + p.dmg * 0.5);
  }
  if (p.splash > 0) {
    for (const c of g.creatures) {
      if (c === hit || !targetable(c) || c.owner === p.owner || c.owner === NEUTRAL) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < p.splash) g.damage(c, p.dmg * 0.5 * (1 - d / p.splash), p.src);
    }
  }
}

// Heroes trespassing on the keeper's claimed ground are sensed by nearby minions, walls or no.
export function findIntruder(g: Game, c: Creature, radius: number): Creature | null {
  const m = g.map;
  let best: Creature | null = null;
  let bd = radius;
  for (const e of g.creatures) {
    if (!targetable(e) || !hostile(c, e) || e.asleepInCamp) continue;
    const i = m.idx(e.tx, e.tz);
    if (m.owner[i] !== c.owner) continue;
    const d = Math.hypot(e.x - c.x, e.z - c.z);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}
