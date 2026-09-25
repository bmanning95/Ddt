import type { Game } from './game';
import type { Creature } from './entity';
import { Tile, Room, PLAYER, HEROES, NEUTRAL, isSolid } from './defs';
import { followPath, stepTowards, faceTowards, ARRIVED, BLOCKED } from './movement';
import { findEnemy, findAlly, meleeTick, rangedTick, fire, targetable } from './combat';
import { xpForLevel, levelMult } from './creatures';

const SIGHT = 5.5;

// ---------------------------------------------------------------- shared
function engage(g: Game, c: Creature, e: Creature, dt: number): boolean {
  if (rangedTick(g, c, e, dt)) return true;
  return meleeTick(g, c, e, dt);
}

function levelCheck(g: Game, c: Creature) {
  if (c.level >= 10) return;
  if (c.xp >= xpForLevel(c.level)) {
    c.xp -= xpForLevel(c.level);
    c.setLevel(c.level + 1);
    g.fx('levelup', c.x, c.z, 1, 16);
    g.sfx('levelup', c.x, c.z);
    if (c.owner === PLAYER && c.level >= 5) g.msg(`Your ${c.def.name} has reached level ${c.level}.`, '#a0ffa0');
  }
}

function goTo(g: Game, c: Creature, tile: number, state: string): boolean {
  const w = g.map.w;
  if (!g.pathTo(c, tile % w, (tile / w) | 0)) return false;
  c.state = state;
  c.stateT = 0;
  c.goal = tile;
  return true;
}

function nearestTile(g: Game, c: Creature, pred: (i: number) => boolean, maxDist = 120): { goal: number; path: number[] } | null {
  return g.pf.nearest(c.tx, c.tz, g.passFn(c), (i) => pred(i), maxDist);
}

function occupied(g: Game, tile: number, except: Creature): boolean {
  const w = g.map.w;
  for (const o of g.creatures) {
    if (o === except || !o.alive || o.owner !== except.owner) continue;
    if (o.goal === tile && (o.state === 'train' || o.state === 'research' || o.state === 'manufacture' || o.state === 'guard' || o.state === 'pray')) return true;
    if (o.tx + o.tz * w === tile && o.stateT > 0 && (o.state === 'train' || o.state === 'research' || o.state === 'manufacture' || o.state === 'pray')) return true;
  }
  return false;
}

// ---------------------------------------------------------------- minions
export function updateMinion(g: Game, c: Creature, dt: number) {
  const m = g.map;
  if (c.owner === NEUTRAL) return updateNeutral(g, c, dt);

  // needs tick
  const hm = g.rules.hungerMul;
  c.hunger += (dt / c.def.hungerTime) * hm;
  if (c.state !== 'sleep') c.tired += dt / c.def.awakeTime;
  if (c.lair < 0 && c.def.awakeTime < 9999) c.anger += dt * 0.0009;
  if (c.hunger > 1.6) c.anger += dt * 0.002;
  if (c.anger >= 1 && !c.leaving && !c.retinue) {
    c.leaving = true;
    g.msg(`A ${c.def.name} has lost patience with you and is leaving!`, '#ff7050', true);
  }
  levelCheck(g, c);

  // claim a bed
  if (c.lair < 0 && c.def.awakeTime < 9999 && Math.floor(g.time * 2) % 3 === c.id % 3) assignBed(g, c);

  // opportunistic crate opening
  checkCrate(g, c);

  // combat first
  c.thinkCd -= dt;
  if (c.target && (!targetable(c.target) || Math.hypot(c.target.x - c.x, c.target.z - c.z) > SIGHT * 1.6)) c.target = null;
  if (!c.target && c.thinkCd <= 0 && c.state !== 'sleep') {
    const guardBonus = c.state === 'guard' ? 2.5 : 0;
    c.target = findEnemy(g, c, SIGHT + guardBonus);
  }
  if (c.target && c.state !== 'leave') {
    if (c.state !== 'fight') {
      c.state = 'fight';
      c.stateT = 0;
      c.path = null;
    }
    if (!engage(g, c, c.target, dt)) c.target = null;
    return;
  }
  if (c.state === 'fight') {
    c.state = 'idle';
    c.path = null;
  }

  // leaving
  if (c.leaving) {
    if (c.state !== 'leave') {
      const portal = nearestTile(g, c, (i) => m.room[i] === Room.Portal);
      if (portal) {
        c.path = portal.path;
        c.pathI = 0;
        c.state = 'leave';
      } else {
        g.msg(`The ${c.def.name} vanished in a sulphurous huff.`, '#ff7050');
        g.fx('summon', c.x, c.z, 0.5, 20);
        g.remove(c);
        return;
      }
    }
    const r = followPath(g, c, dt);
    if (r !== 0) {
      g.fx('summon', c.x, c.z, 0.5, 20);
      g.remove(c);
    }
    return;
  }

  // rally
  if (c.rally) {
    const d = Math.hypot(c.rally.x - c.x, c.rally.z - c.z);
    if (d > 1.8) {
      if (c.state !== 'rally' || !c.path) {
        c.state = 'rally';
        if (!g.pathTo(c, Math.floor(c.rally.x), Math.floor(c.rally.z))) c.rally = null;
      }
      if (followPath(g, c, dt) === BLOCKED) c.path = null;
    } else {
      c.state = 'rally';
      c.anim = 'idle';
    }
    return;
  }

  switch (c.state) {
    case 'sleep': {
      c.anim = 'sleep';
      c.tired = Math.max(0, c.tired - dt / 18);
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.04 * dt);
      c.anger = Math.max(0, c.anger - dt * 0.004);
      if (c.tired <= 0 && c.hp >= c.maxHp * 0.95) {
        c.state = 'idle';
        c.thinkCd = 0;
      }
      return;
    }
    case 'eat': {
      c.anim = 'eat';
      c.eatT -= dt;
      if (c.eatT <= 0) {
        c.hunger = Math.max(0, c.hunger - 0.55);
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.08);
        c.anger = Math.max(0, c.anger - 0.02);
        c.state = 'idle';
        c.thinkCd = 0;
      }
      return;
    }
    case 'train':
    case 'research':
    case 'manufacture':
    case 'pray':
    case 'guard':
      return workAt(g, c, dt);
  }

  // walking somewhere
  if (c.path && c.state !== 'idle') {
    const r = followPath(g, c, dt);
    if (r === BLOCKED) {
      c.state = 'idle';
      c.path = null;
      return;
    }
    if (r === ARRIVED) arrive(g, c);
    return;
  }
  if (c.state === 'gotoChicken') {
    const ch = g.byId.get(c.goal);
    if (!ch || !ch.alive) {
      c.state = 'idle';
      return;
    }
    const left = stepTowards(g, c, ch.x, ch.z, dt, 0.35);
    if (left <= 0.4 || c.stateT > 8) {
      if (left <= 0.4) {
        g.kill(ch, null);
        ch.removed = true;
        g.fx('blood', ch.x, ch.z, 0.2, 6);
        g.sfx('chomp', c.x, c.z);
        c.state = 'eat';
        c.eatT = 1.6;
      } else c.state = 'idle';
    }
    return;
  }

  c.anim = 'idle';
  if (c.thinkCd > 0) return;
  c.thinkCd = 0.5 + g.rng.next() * 0.5;
  decide(g, c);
}

function assignBed(g: Game, c: Creature) {
  const m = g.map;
  for (const r of g.roomsOf(Room.Lair)) {
    for (const t of r.tiles) {
      if (!g.bedOwner.has(t) && m.room[t] === Room.Lair) {
        g.bedOwner.set(t, c.id);
        c.lair = t;
        return;
      }
    }
  }
}

function decide(g: Game, c: Creature) {
  const m = g.map;
  // wounded -> rest
  if ((c.tired > 1 || c.hp < c.maxHp * 0.4) && c.lair >= 0) {
    if (goTo(g, c, c.lair, 'toBed')) return;
  }
  if (c.hunger > 1) {
    const r = nearestTile(g, c, (i) => m.room[i] === Room.Hatchery && m.owner[i] === PLAYER);
    if (r) {
      c.path = r.path;
      c.pathI = 0;
      c.state = 'toHatchery';
      c.goal = r.goal;
      return;
    }
  }
  if (c.owed > 0 && g.keeper.gold > 0) {
    const r = nearestTile(g, c, (i) => m.room[i] === Room.Treasury && m.owner[i] === PLAYER);
    if (r) {
      c.path = r.path;
      c.pathI = 0;
      c.state = 'toPay';
      c.goal = r.goal;
      return;
    }
    // nowhere to collect from: take it straight from the heart
    payWages(g, c);
  }
  // jobs
  for (const job of c.def.jobs) {
    const room = job === 'train' ? Room.Training : job === 'research' ? Room.Library : job === 'manufacture' ? Room.Workshop : Room.GuardPost;
    if (job === 'train' && (c.level >= 10 || g.keeper.gold < 20)) continue;
    const r = nearestTile(g, c, (i) => m.room[i] === room && m.owner[i] === PLAYER && !occupied(g, i, c));
    if (r) {
      c.path = r.path;
      c.pathI = 0;
      c.state = 'to_' + job;
      c.goal = r.goal;
      return;
    }
  }
  // guard posts for everyone as a fallback
  const gp = g.roomTiles(Room.GuardPost) > 0 && g.rng.chance(0.3) ? nearestTile(g, c, (i) => m.room[i] === Room.GuardPost && m.owner[i] === PLAYER && !occupied(g, i, c)) : null;
  if (gp) {
    c.path = gp.path;
    c.pathI = 0;
    c.state = 'to_guard';
    c.goal = gp.goal;
    return;
  }
  // temple soothes
  if (c.anger > 0.3) {
    const t = nearestTile(g, c, (i) => m.room[i] === Room.Temple && m.owner[i] === PLAYER && !occupied(g, i, c));
    if (t) {
      c.path = t.path;
      c.pathI = 0;
      c.state = 'to_pray';
      c.goal = t.goal;
      return;
    }
  }
  // wander
  const t = g.randomReachable(c, 6, (i) => m.owner[i] === PLAYER && m.tile[i] === Tile.Floor && m.room[i] !== Room.Heart);
  if (t >= 0 && g.pathTo(c, t % m.w, (t / m.w) | 0)) {
    c.state = 'wander';
    c.goal = t;
  } else c.thinkCd = 2;
}

function arrive(g: Game, c: Creature) {
  const m = g.map;
  switch (c.state) {
    case 'toBed':
      if (c.lair >= 0 && m.room[c.lair] === Room.Lair) {
        c.state = 'sleep';
        c.stateT = 0;
        c.x = (c.lair % m.w) + 0.5;
        c.z = ((c.lair / m.w) | 0) + 0.5;
      } else c.state = 'idle';
      return;
    case 'toHatchery': {
      // find a chicken in this hatchery
      let best: Creature | null = null;
      let bd = 99;
      for (const ch of g.creatures) {
        if (ch.kind !== 'chicken' || !ch.alive || ch.owner !== PLAYER || ch.carriedBy) continue;
        const d = Math.hypot(ch.x - c.x, ch.z - c.z);
        if (d < bd) {
          bd = d;
          best = ch;
        }
      }
      if (best && bd < 12) {
        c.state = 'gotoChicken';
        c.goal = best.id;
        c.stateT = 0;
      } else {
        c.state = 'idle';
        c.thinkCd = 2.5;
      }
      return;
    }
    case 'toPay':
      payWages(g, c);
      c.state = 'idle';
      return;
    case 'to_train':
    case 'to_research':
    case 'to_manufacture':
    case 'to_guard':
    case 'to_pray': {
      const s = c.state.slice(3);
      const room = m.room[c.goal];
      const want = s === 'train' ? Room.Training : s === 'research' ? Room.Library : s === 'manufacture' ? Room.Workshop : s === 'guard' ? Room.GuardPost : Room.Temple;
      if (room !== want) {
        c.state = 'idle';
        return;
      }
      c.state = s;
      c.stateT = 0;
      c.workT = 0;
      return;
    }
    default:
      c.state = 'idle';
      c.thinkCd = 1 + g.rng.next() * 2.5;
  }
}

function payWages(g: Game, c: Creature) {
  const k = g.keeper;
  const pay = Math.min(c.owed, k.gold);
  k.gold -= pay;
  c.owed -= pay;
  if (pay > 0) {
    g.fx('coins', c.x, c.z, 0.8, 5);
    g.sfx('coins', c.x, c.z);
  }
  if (c.owed > 0) {
    c.anger += 0.3;
    c.owed = 0;
    g.msg(`Your ${c.def.name} went unpaid and seethes with anger.`, '#ff9050');
  } else c.anger = Math.max(0, c.anger - 0.1);
}

function workAt(g: Game, c: Creature, dt: number) {
  const m = g.map;
  const w = m.w;
  const want = c.state === 'train' ? Room.Training : c.state === 'research' ? Room.Library : c.state === 'manufacture' ? Room.Workshop : c.state === 'guard' ? Room.GuardPost : Room.Temple;
  if (m.room[c.goal] !== want || m.owner[c.goal] !== PLAYER) {
    c.state = 'idle';
    return;
  }
  // needs interrupt work
  if (c.hunger > 1.1 || c.tired > 1.1 || (c.owed > 0 && g.keeper.gold > 0) || c.hp < c.maxHp * 0.35) {
    c.state = 'idle';
    c.thinkCd = 0;
    return;
  }
  const lm = levelMult(c.level).dmg;
  c.workT += dt;
  switch (c.state) {
    case 'train': {
      c.anim = 'train';
      // face the training post in the room
      faceTowards(c, 0.3, 0.7, dt, 3);
      const cost = 2.2 * dt;
      if (g.keeper.gold < cost || c.level >= 10) {
        c.state = 'idle';
        return;
      }
      g.keeper.gold -= cost;
      c.xp += dt * 5.5 * g.rules.trainMul * (g.keeper.hasRelic('warbanner') ? 1.5 : 1);
      if (c.workT > 0.9) {
        c.workT = 0;
        c.animT = 0;
        g.sfx('thwack', c.x, c.z);
      }
      if (c.stateT > 45) c.state = 'idle';
      return;
    }
    case 'research':
      c.anim = 'research';
      g.keeper.research += dt * c.def.research * lm * g.rules.researchMul * (g.keeper.hasRelic('grimoire') ? 1.5 : 1);
      if (c.stateT > 60) c.state = 'idle';
      return;
    case 'manufacture':
      c.anim = 'work';
      g.keeper.manufacture += dt * c.def.manufacture * lm;
      if (c.workT > 0.7) {
        c.workT = 0;
        g.sfx('anvil', c.x, c.z);
      }
      if (c.stateT > 60) c.state = 'idle';
      return;
    case 'pray':
      c.anim = 'pray';
      c.anger = Math.max(0, c.anger - dt * 0.02);
      if (c.stateT > 20) c.state = 'idle';
      return;
    case 'guard':
      c.anim = 'idle';
      if (c.stateT > 40) c.state = 'idle';
      void w;
      return;
  }
}

// ---------------------------------------------------------------- neutrals
function updateNeutral(g: Game, c: Creature, dt: number) {
  c.anim = 'idle';
  c.thinkCd -= dt;
  if (c.thinkCd > 0) return;
  c.thinkCd = 0.5;
  // join the keeper once touched by their influence
  for (const o of g.creatures) {
    if (!o.alive || o.owner !== PLAYER || o.state === 'held') continue;
    if (Math.hypot(o.x - c.x, o.z - c.z) < 2.6) {
      c.owner = PLAYER;
      c.state = 'idle';
      g.msg(`A wandering ${c.def.name} has pledged itself to you.`, '#a0ff90', true);
      g.fx('summon', c.x, c.z, 0.6, 14);
      g.sfx('join', c.x, c.z);
      return;
    }
  }
}

// ---------------------------------------------------------------- chickens
export function updateChicken(g: Game, c: Creature, dt: number) {
  const m = g.map;
  if (c.carriedBy) return;
  if (c.path) {
    const r = followPath(g, c, dt);
    if (r !== 0) c.path = null;
    return;
  }
  c.anim = 'idle';
  c.thinkCd -= dt;
  if (c.thinkCd > 0) return;
  c.thinkCd = 1 + g.rng.next() * 3;
  const home = c.owner === PLAYER;
  const t = g.randomReachable(c, 3, (i) => !home || m.room[i] === Room.Hatchery);
  if (t >= 0) g.pathTo(c, t % m.w, (t / m.w) | 0);
}

// ---------------------------------------------------------------- crates
function checkCrate(g: Game, c: Creature) {
  for (const cr of g.crates) {
    if (cr.opened) continue;
    if (Math.abs(cr.x - c.x) < 0.6 && Math.abs(cr.z - c.z) < 0.6) {
      cr.opened = true;
      g.openCrate(cr, c);
    }
  }
}
export { checkCrate };

// ---------------------------------------------------------------- heroes
export function heartRing(g: Game): number[] {
  const m = g.map;
  const out: number[] = [];
  for (const t of g.heartTiles) {
    const x = t % m.w,
      z = (t / m.w) | 0;
    m.forNeighbors4(x, z, (nx, nz) => {
      const ni = m.idx(nx, nz);
      if (m.room[ni] !== Room.Heart && !isSolid(m.tile[ni]) && !out.includes(ni)) out.push(ni);
    });
  }
  return out;
}

export function updateHero(g: Game, c: Creature, dt: number) {
  const m = g.map;
  levelCheck(g, c);
  if (c.asleepInCamp) {
    c.anim = 'sleep';
    // wake if a keeper unit is close
    c.thinkCd -= dt;
    if (c.thinkCd <= 0) {
      c.thinkCd = 0.5;
      const e = findEnemy(g, c, 3.5);
      if (e) {
        c.asleepInCamp = false;
        g.sfx('alert', c.x, c.z);
      }
    }
    return;
  }

  // healers tend to the wounded
  if (c.def.healer && c.rangedCd <= 0) {
    const hurt = findAlly(g, c, c.def.ranged?.range ?? 4, (o) => o.hp < o.maxHp * 0.7);
    if (hurt && g.losTiles(c.x, c.z, hurt.x, hurt.z)) {
      c.rangedCd = c.def.ranged!.rate;
      c.anim = 'cast';
      c.animT = 0;
      fire(g, c, hurt, 'heal', c.def.ranged!.dmg * (1 + c.level * 0.1), c.def.ranged!.speed, 0);
      return;
    }
  }

  c.thinkCd -= dt;
  if (c.target && (!targetable(c.target) || Math.hypot(c.target.x - c.x, c.target.z - c.z) > SIGHT * 1.8)) c.target = null;
  if (!c.target && c.thinkCd <= 0) {
    c.thinkCd = 0.3 + g.rng.next() * 0.2;
    c.target = findEnemy(g, c, SIGHT);
  }
  if (c.target) {
    // guards don't stray far from their post
    if (c.campTile >= 0 && Math.hypot(c.x - ((c.campTile % m.w) + 0.5), c.z - (((c.campTile / m.w) | 0) + 0.5)) > 8) {
      c.target = null;
    } else {
      if (c.def.healer && !c.def.ranged) return;
      if (c.def.ranged?.kind === 'heal') {
        if (!meleeTick(g, c, c.target, dt)) c.target = null;
      } else if (!engage(g, c, c.target, dt)) c.target = null;
      return;
    }
  }

  // camp guards return to post and idle
  if (c.campTile >= 0) {
    const cx = (c.campTile % m.w) + 0.5,
      cz = ((c.campTile / m.w) | 0) + 0.5;
    if (Math.hypot(cx - c.x, cz - c.z) > 1.2) {
      if (!c.path) g.pathTo(c, Math.floor(cx), Math.floor(cz));
      if (followPath(g, c, dt) === BLOCKED) c.path = null;
    } else c.anim = 'idle';
    return;
  }

  // invaders march on the heart, tunnelling if needed
  if (c.state === 'digging') {
    const t = c.goal;
    const tx = t % m.w,
      tz = (t / m.w) | 0;
    if (!isSolid(m.tile[t])) {
      c.state = 'march';
      return;
    }
    faceTowards(c, tx + 0.5 - c.x, tz + 0.5 - c.z, dt);
    c.anim = 'dig';
    c.workT += dt;
    if (c.workT > 0.6) {
      c.workT = 0;
      m.hp[t] += (c.def.digger ?? 0.3) * levelMult(c.level).dmg;
      g.fx('chip', (c.x + tx + 0.5) / 2, (c.z + tz + 0.5) / 2, 0.7, 3);
      g.sfx('dig', tx + 0.5, tz + 0.5);
      if (m.hp[t] >= g.digStrength(m.tile[t], m.owner[t])) {
        if (m.tile[t] === Tile.Gold) m.gold[t] = Math.min(m.gold[t], 150);
        g.digOut(tx, tz);
        c.state = 'march';
      }
    }
    return;
  }

  const ring = g.heartRing;
  if (!ring.length) return;
  const onRing = ring.includes(c.tx + c.tz * m.w);
  if (onRing) {
    // smash the heart
    c.path = null;
    const [hx, hz] = g.heartCenter();
    faceTowards(c, hx - c.x, hz - c.z, dt);
    if (c.attackCd <= 0) {
      c.attackCd = c.def.attackRate;
      c.anim = 'attack';
      c.animT = 0;
      const dmg = (c.def.ranged && !c.def.healer ? Math.max(c.dmg, c.def.ranged.dmg) : c.dmg) * g.rules.heroDmgMul;
      g.damageHeart(dmg, c);
    }
    return;
  }

  if (!c.path || c.stateT > 6) {
    c.stateT = 0;
    // pick nearest ring tile
    let best = ring[0],
      bd = 1e9;
    for (const t of ring) {
      const d = Math.hypot((t % m.w) - c.tx, ((t / m.w) | 0) - c.tz);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    const p = g.pf.find(c.tx, c.tz, best % m.w, (best / m.w) | 0, g.digCostFn(c), 9000);
    if (!p) {
      c.anim = 'idle';
      return;
    }
    c.path = p;
    c.pathI = 0;
    c.state = 'march';
  }
  // dig through solid tiles along the path
  const next = c.path[c.pathI];
  if (next !== undefined && isSolid(m.tile[next])) {
    c.state = 'digging';
    c.goal = next;
    c.workT = 0;
    return;
  }
  const r = followPath(g, c, dt);
  if (r === BLOCKED) c.path = null;
  void HEROES;
}
