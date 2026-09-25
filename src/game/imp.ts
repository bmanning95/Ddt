import type { Game } from './game';
import type { Creature, ImpJob } from './entity';
import { Tile, Room, PLAYER, NEUTRAL, HEROES, isSolid, isDiggable } from './defs';
import { followPath, faceTowards, ARRIVED, BLOCKED } from './movement';
import { levelMult } from './creatures';
import { findEnemy, meleeTick } from './combat';

export const IMP_CAP = 300;
const SWING = 0.55;
const CLAIM_TIME = 1.9;
const FORTIFY_TIME = 2.6;

const R_STAND = 0,
  R_PICK = 1,
  R_CLAIM = 2,
  R_FORT = 3;

function workRate(c: Creature) {
  let r = 1 + (c.level - 1) * 0.1;
  if (c.slapT > 0) r *= 1.5;
  if (c.speedT > 0) r *= 1.6;
  return r;
}

export function isClaimable(g: Game, i: number): boolean {
  const m = g.map;
  const t = m.tile[i];
  if (t !== Tile.Path && t !== Tile.Floor) return false;
  if (t === Tile.Floor && m.owner[i] === PLAYER) return false;
  const r = m.room[i];
  if (r === Room.HeroGate || r === Room.HeroKeep || r === Room.Heart) return false;
  const x = i % m.w,
    z = (i / m.w) | 0;
  let adj = false;
  m.forNeighbors4(x, z, (nx, nz) => {
    const ni = nz * m.w + nx;
    if (m.owner[ni] === PLAYER && (m.tile[ni] === Tile.Floor || m.tile[ni] === Tile.Wall)) adj = true;
  });
  return adj;
}

function fortifyTarget(g: Game, stand: number, c: Creature): number {
  const m = g.map;
  if (m.tile[stand] !== Tile.Floor || m.owner[stand] !== PLAYER) return -1;
  const x = stand % m.w,
    z = (stand / m.w) | 0;
  let found = -1;
  m.forNeighbors4(x, z, (nx, nz) => {
    if (found >= 0) return;
    const ni = nz * m.w + nx;
    if (m.tile[ni] === Tile.Earth && m.revealed[ni] && !m.tagged[ni] && !g.isReserved(g.reserveKey(ni, R_FORT), c)) found = ni;
  });
  return found;
}

function digTargetFrom(g: Game, stand: number, c: Creature): number {
  const m = g.map;
  const x = stand % m.w,
    z = (stand / m.w) | 0;
  let found = -1;
  m.forNeighbors4(x, z, (nx, nz) => {
    if (found >= 0) return;
    const ni = nz * m.w + nx;
    if (!m.tagged[ni]) return;
    const t = m.tile[ni];
    if (!(isDiggable(t) || t === Tile.Wall)) return;
    if ((g.digCount.get(ni) ?? 0) >= 3) return;
    found = ni;
  });
  if (found >= 0 && g.isReserved(g.reserveKey(stand, R_STAND), c)) return -1;
  return found;
}

function assign(g: Game, c: Creature, job: ImpJob, path: number[] | null) {
  g.releaseJob(c);
  c.job = job;
  c.workT = 0;
  c.path = path;
  c.pathI = 0;
  if (job.type === 'dig') {
    g.reserve(g.reserveKey(job.stand, R_STAND), c);
    g.digCount.set(job.target, (g.digCount.get(job.target) ?? 0) + 1);
  } else if (job.type === 'pickup') g.reserve(g.reserveKey(job.target, R_PICK), c);
  else if (job.type === 'claim' || job.type === 'unclaim') g.reserve(g.reserveKey(job.target, R_CLAIM), c);
  else if (job.type === 'fortify') g.reserve(g.reserveKey(job.target, R_FORT), c);
}

function haulCandidate(g: Game, c: Creature, corpse: boolean): Creature | null {
  const m = g.map;
  const room = corpse ? Room.Graveyard : Room.Prison;
  if (g.roomTiles(room) === 0) return null;
  let best: Creature | null = null;
  let bd = 40;
  for (const e of g.creatures) {
    if (e.removed || e.carriedBy) continue;
    if (corpse ? e.alive || e.kind === 'chicken' || e.graveTile >= 0 || e.deathT < 1.5 : !(e.alive && e.state === 'ko')) continue;
    const h = g.hauls.get(e.id);
    if (h !== undefined && h !== c.id && g.byId.has(h)) continue;
    if (!m.revealed[m.idx(e.tx, e.tz)]) continue;
    const d = Math.abs(e.x - c.x) + Math.abs(e.z - c.z);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function tryHaul(g: Game, c: Creature, corpse: boolean): boolean {
  const e = haulCandidate(g, c, corpse);
  if (!e) return false;
  const w = g.map.w;
  const ft = g.freeTileNear(e.tx, e.tz, c);
  if (!ft || !g.pathTo(c, ft[0], ft[1])) return false;
  const p = c.path;
  assign(g, c, { type: corpse ? 'haulCorpse' : 'haulPrisoner', target: ft[1] * w + ft[0], stand: ft[1] * w + ft[0], entity: e.id, phase: 0 }, p);
  g.hauls.set(e.id, c.id);
  return true;
}

function findJob(g: Game, c: Creature) {
  const m = g.map;
  const w = m.w;
  const canStore = g.keeper.gold < g.keeper.goldCap;
  if (tryHaul(g, c, false)) return;
  if (c.carryGold >= IMP_CAP && canStore) {
    if (startDeposit(g, c)) return;
  }
  // keep a share of the imps free to claim and fortify
  let nImps = 0,
    digging = 0;
  for (const o of g.creatures) {
    if (!o.alive || o.kind !== 'imp' || o.owner !== PLAYER) continue;
    nImps++;
    if (o !== c && o.job?.type === 'dig') digging++;
  }
  const allowDig = digging < Math.max(2, Math.ceil(nImps * 0.6));
  let dig: ImpJob | null = null;
  let spareDig: ImpJob | null = null;
  let pick: ImpJob | null = null;
  let claim = -1;
  let fort: ImpJob | null = null;
  const canCarry = c.carryGold < IMP_CAP;
  const res = g.pf.nearest(
    c.tx,
    c.tz,
    g.passFn(c),
    (i) => {
      if (!dig && !spareDig) {
        const dt = digTargetFrom(g, i, c);
        if (dt >= 0) {
          if (allowDig) {
            dig = { type: 'dig', target: dt, stand: i };
            return true;
          }
          spareDig = { type: 'dig', target: dt, stand: i };
        }
      }
      if (!pick && canCarry && m.gold[i] > 0 && m.room[i] !== Room.Treasury && !isSolid(m.tile[i]) && !g.isReserved(g.reserveKey(i, R_PICK), c)) {
        pick = { type: 'pickup', target: i, stand: i };
      }
      if (claim < 0 && isClaimable(g, i) && !g.isReserved(g.reserveKey(i, R_CLAIM), c)) claim = i;
      if (!fort) {
        const f = fortifyTarget(g, i, c);
        if (f >= 0) fort = { type: 'fortify', target: f, stand: i };
      }
      return !!(pick && claim >= 0 && fort);
    },
    90,
  );
  if (dig && res) {
    assign(g, c, dig, res.path);
    return;
  }
  if (c.carryGold > IMP_CAP * 0.5 && canStore && startDeposit(g, c)) return;
  const tryJob = (job: ImpJob | null): boolean => {
    if (!job) return false;
    if (!g.pathTo(c, job.stand % w, (job.stand / w) | 0)) return false;
    assign(g, c, job, c.path);
    return true;
  };
  if (tryJob(pick)) return;
  if (claim >= 0 && tryJob({ type: 'claim', target: claim, stand: claim })) return;
  if (tryHaul(g, c, true)) return;
  if (tryJob(fort)) return;
  if (tryJob(spareDig)) return;
  if (c.carryGold > 0 && canStore && startDeposit(g, c)) return;
  // nothing to do: wander about the dungeon
  if (g.rng.chance(0.4)) {
    const t = g.randomReachable(c, 5, (i) => m.owner[i] === PLAYER && m.tile[i] === Tile.Floor);
    if (t >= 0 && g.pathTo(c, t % w, (t / w) | 0)) {
      c.job = { type: 'wander', target: t, stand: t };
    }
  }
}

function startDeposit(g: Game, c: Creature): boolean {
  const m = g.map;
  const res = g.pf.nearest(c.tx, c.tz, g.passFn(c), (i) => m.room[i] === Room.Treasury && m.owner[i] === PLAYER, 120);
  if (res) {
    assign(g, c, { type: 'deposit', target: res.goal, stand: res.goal }, res.path);
    return true;
  }
  // No treasury: the heart holds a small vault.
  const heart = g.pf.nearest(
    c.tx,
    c.tz,
    g.passFn(c),
    (_i, x, z) => {
      let adj = false;
      m.forNeighbors4(x, z, (nx, nz) => {
        if (m.room[m.idx(nx, nz)] === Room.Heart && m.owner[m.idx(nx, nz)] === PLAYER) adj = true;
      });
      return adj;
    },
    120,
  );
  if (heart && g.keeper.gold < g.rules.heartVault) {
    assign(g, c, { type: 'deposit', target: heart.goal, stand: heart.goal }, heart.path);
    return true;
  }
  return false;
}

export function updateImp(g: Game, c: Creature, dt: number) {
  const m = g.map;
  const w = m.w;

  // Self defence: brawl with adjacent intruders.
  if (c.thinkCd <= 0 || c.target) {
    const e = c.target && c.target.alive && Math.hypot(c.target.x - c.x, c.target.z - c.z) < 2.2 ? c.target : findEnemy(g, c, 1.6);
    c.target = e;
    if (e) {
      meleeTick(g, c, e, dt);
      return;
    }
  }

  if (!c.job) {
    c.anim = 'idle';
    c.thinkCd -= dt;
    if (c.thinkCd <= 0) {
      c.thinkCd = 0.35 + g.rng.next() * 0.35;
      findJob(g, c);
    }
    return;
  }

  const j = c.job;
  // validate job each tick
  if (!jobValid(g, c, j)) {
    g.releaseJob(c);
    c.path = null;
    c.thinkCd = 0.1;
    return;
  }

  if (j.type === 'haulPrisoner' || j.type === 'haulCorpse') {
    haul(g, c, j, dt);
    return;
  }

  const r = followPath(g, c, dt);
  if (r === BLOCKED) {
    g.releaseJob(c);
    c.thinkCd = 0.2;
    return;
  }
  if (r !== ARRIVED) return;

  const tx = j.target % w,
    tz = (j.target / w) | 0;
  switch (j.type) {
    case 'wander':
      c.job = null;
      c.thinkCd = 0.6 + g.rng.next() * 1.5;
      c.anim = 'idle';
      return;
    case 'dig': {
      faceTowards(c, tx + 0.5 - c.x, tz + 0.5 - c.z, dt, 12);
      c.anim = 'dig';
      c.workT += dt * workRate(c);
      if (c.workT >= SWING) {
        c.workT -= SWING;
        const t = m.tile[j.target] as Tile;
        const power = levelMult(c.level).dmg * (c.def.digger ?? 1);
        m.hp[j.target] += power;
        g.fx('chip', (c.x + tx + 0.5) / 2, (c.z + tz + 0.5) / 2, 0.7, 3);
        g.sfx(t === Tile.Gold || t === Tile.Gems ? 'dig_gold' : 'dig', tx + 0.5, tz + 0.5);
        if (t === Tile.Gold || t === Tile.Gems) {
          const amt = Math.round(32 * g.rules.goldDigMul * (g.keeper.hasRelic('gildedpick') ? 1.5 : 1));
          const take = t === Tile.Gems ? amt : Math.min(amt, m.gold[j.target]);
          if (t === Tile.Gold) m.gold[j.target] -= take;
          c.carryGold += take;
          g.stats.goldMined += take;
          if (c.carryGold >= IMP_CAP) {
            const over = c.carryGold - IMP_CAP;
            c.carryGold = IMP_CAP;
            if (over > 0) g.dropGold(c.x, c.z, over);
            if (t === Tile.Gold && m.gold[j.target] <= 0) g.digOut(tx, tz);
            g.releaseJob(c);
            c.thinkCd = 0;
            return;
          }
          if (t === Tile.Gold && m.gold[j.target] <= 0) {
            g.digOut(tx, tz);
            g.releaseJob(c);
            return;
          }
        }
        if (t !== Tile.Gems && m.hp[j.target] >= g.digStrength(t, m.owner[j.target])) {
          g.digOut(tx, tz);
          g.releaseJob(c);
        }
      }
      return;
    }
    case 'pickup': {
      const take = Math.min(IMP_CAP - c.carryGold, m.gold[j.target]);
      m.gold[j.target] -= take;
      c.carryGold += take;
      g.sfx('coins', c.x, c.z);
      g.releaseJob(c);
      c.thinkCd = 0;
      return;
    }
    case 'deposit': {
      const room = g.keeper.goldCap - g.keeper.gold;
      if (room <= 0) {
        g.releaseJob(c);
        c.thinkCd = 2;
        if (g.time - lastFullMsg > 20) {
          lastFullMsg = g.time;
          g.msg('Your treasury is full. Build a larger one.', '#ffcc66');
        }
        return;
      }
      const put = Math.min(room, c.carryGold);
      g.keeper.addGold(put);
      c.carryGold -= put;
      g.fx('coins', c.x, c.z, 0.6, 6);
      g.sfx('coins', c.x, c.z);
      g.releaseJob(c);
      return;
    }
    case 'claim':
    case 'unclaim': {
      c.anim = 'work';
      c.workT += dt * workRate(c);
      if (c.workT >= CLAIM_TIME) {
        const x = j.target % w,
          z = (j.target / w) | 0;
        if (m.tile[j.target] === Tile.Floor && m.owner[j.target] !== PLAYER && m.owner[j.target] !== NEUTRAL) {
          // neutralise enemy floor first
          m.room[j.target] = Room.None;
          m.set(x, z, Tile.Path, NEUTRAL);
          c.workT = 0;
          return;
        }
        if (m.room[j.target] === Room.Portal) claimPortal(g, x, z);
        else m.set(x, z, Tile.Floor, PLAYER);
        g.stats.claimed++;
        g.fx('claim', x + 0.5, z + 0.5, 0.05, 8);
        g.sfx('claim', x + 0.5, z + 0.5);
        g.releaseJob(c);
      }
      return;
    }
    case 'fortify': {
      faceTowards(c, tx + 0.5 - c.x, tz + 0.5 - c.z, dt, 12);
      c.anim = 'work';
      c.workT += dt * workRate(c);
      if (c.workT >= FORTIFY_TIME) {
        m.tagged[j.target] = 0;
        m.set(tx, tz, Tile.Wall, PLAYER);
        g.fx('claim', tx + 0.5, tz + 0.5, 0.8, 6);
        g.sfx('fortify', tx + 0.5, tz + 0.5);
        g.releaseJob(c);
      }
      return;
    }
  }
}

let lastFullMsg = -100;

function jobValid(g: Game, c: Creature, j: ImpJob): boolean {
  const m = g.map;
  const t = m.tile[j.target];
  switch (j.type) {
    case 'dig':
      return !!m.tagged[j.target] && isSolid(t) && t !== Tile.Rock;
    case 'pickup':
      return m.gold[j.target] > 0 && c.carryGold < IMP_CAP;
    case 'claim':
      return isClaimable(g, j.target);
    case 'fortify':
      return t === Tile.Earth && !m.tagged[j.target] && m.tile[j.stand] === Tile.Floor && m.owner[j.stand] === PLAYER;
    case 'deposit':
      return c.carryGold > 0;
    case 'haulPrisoner':
    case 'haulCorpse': {
      const e = g.creatures.find((o) => o.id === j.entity);
      if (!e || e.removed) return false;
      if (j.phase === 0) return j.type === 'haulPrisoner' ? e.alive && e.state === 'ko' : !e.alive && !e.carriedBy;
      return e.carriedBy === c;
    }
    default:
      return true;
  }
}

function claimPortal(g: Game, x: number, z: number) {
  const m = g.map;
  const q = [m.idx(x, z)];
  const seen = new Set(q);
  while (q.length) {
    const i = q.pop()!;
    m.owner[i] = PLAYER;
    m.touch(i % m.w, (i / m.w) | 0);
    m.forNeighbors4(i % m.w, (i / m.w) | 0, (nx, nz) => {
      const ni = m.idx(nx, nz);
      if (!seen.has(ni) && m.room[ni] === Room.Portal) {
        seen.add(ni);
        q.push(ni);
      }
    });
  }
  g.msg('You have claimed a Portal. Creatures will now be drawn to your dungeon.', '#d0a0ff', true);
  g.sfx('portal');
}

export { HEROES };

function haul(g: Game, c: Creature, j: ImpJob, dt: number) {
  const m = g.map;
  const e = g.creatures.find((o) => o.id === j.entity)!;
  const prisoner = j.type === 'haulPrisoner';
  const r = followPath(g, c, dt);
  if (r === BLOCKED) {
    g.releaseJob(c);
    c.thinkCd = 0.3;
    return;
  }
  if (r !== ARRIVED) return;
  if (j.phase === 0) {
    // pick it up and head for the room
    const room = prisoner ? Room.Prison : Room.Graveyard;
    const occupied = new Set<number>();
    for (const o of g.creatures) if (o !== e && (o.state === 'prisoner' || o.graveTile >= 0)) occupied.add(o.tx + o.tz * m.w);
    const dest =
      g.pf.nearest(c.tx, c.tz, g.passFn(c), (i) => m.room[i] === room && m.owner[i] === PLAYER && !occupied.has(i), 150) ??
      g.pf.nearest(c.tx, c.tz, g.passFn(c), (i) => m.room[i] === room && m.owner[i] === PLAYER, 150);
    if (!dest) {
      g.releaseJob(c);
      c.thinkCd = 2;
      return;
    }
    e.carriedBy = c;
    c.carrying = e;
    if (prisoner) e.state = 'carried';
    j.phase = 1;
    j.target = dest.goal;
    j.stand = dest.goal;
    c.path = dest.path;
    c.pathI = 0;
    g.sfx('pickup', c.x, c.z);
    return;
  }
  // drop it off
  e.carriedBy = null;
  c.carrying = null;
  e.x = (j.target % m.w) + 0.5;
  e.z = ((j.target / m.w) | 0) + 0.5;
  if (prisoner) {
    e.state = 'prisoner';
    e.hp = Math.max(e.hp, e.maxHp * 0.5);
    g.msg(`A captured ${e.def.name} has been thrown in your prison.`, '#c0c8d0');
  } else {
    e.graveTile = j.target;
    e.deathT = 0;
    e.decayAt = 35;
  }
  g.sfx('drop', c.x, c.z);
  g.hauls.delete(e.id);
  c.job = null;
  c.thinkCd = 0.2;
}
