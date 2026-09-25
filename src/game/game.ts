import { GameMap } from './map';
import { Tile, Room, PLAYER, HEROES, NEUTRAL, isSolid, isDiggable, ROOMS } from './defs';
import { RealmLayout } from './mapgen';
import { RNG } from './rng';
import { Pathfinder, CostFn } from './pathfind';
import { Creature } from './entity';
import { CREATURES } from './creatures';
import { updateImp, IMP_CAP } from './imp';
import { updateMinion, updateHero, updateChicken, heartRing } from './ai';
import { Director, openCrate } from './director';
import { separate } from './movement';
import { updateProjectiles, Projectile } from './combat';
import { Keeper } from './keeper';
import { RealmRules } from './realm';

export interface GameEvent {
  type: 'msg' | 'sfx' | 'fx' | 'shake' | 'end';
  text?: string;
  color?: string;
  sfx?: string;
  fx?: string;
  x?: number;
  z?: number;
  y?: number;
  n?: number;
  win?: boolean;
  important?: boolean;
}

export interface RoomInst {
  id: number;
  type: Room;
  owner: number;
  tiles: number[];
  cx: number;
  cz: number;
}

export interface Corpse {
  x: number;
  z: number;
  kind: string;
  owner: number;
  t: number;
  angle: number;
  id: number;
}

export interface Crate {
  id: number;
  tile: number;
  x: number;
  z: number;
  opened: boolean;
}

export class Game {
  map: GameMap;
  layout: RealmLayout;
  rng: RNG;
  time = 0;
  pf: Pathfinder;
  creatures: Creature[] = [];
  byId = new Map<number, Creature>();
  projectiles: Projectile[] = [];
  corpses: Corpse[] = [];
  crates: Crate[] = [];
  keeper: Keeper;
  rules: RealmRules;
  rooms: RoomInst[] = [];
  roomsDirty = true;
  roomsVersion = 0;
  reservations = new Map<number, number>(); // key -> creature id
  digCount = new Map<number, number>(); // tile -> imps assigned
  events: GameEvent[] = [];
  revealT = 0;
  portalT = 20;
  over = false;
  won = false;
  heartTiles: number[] = [];
  heartHit = 0;
  bedOwner = new Map<number, number>(); // lair tile -> creature id
  stats = { dug: 0, claimed: 0, heroesSlain: 0, minionsLost: 0, goldMined: 0, souls: 0 };
  rally: { x: number; z: number } | null = null;
  possessRequest: Creature | null = null;
  heartRing: number[] = [];
  director: Director;
  endT = 0;
  private tmpArr: number[] = [];

  constructor(layout: RealmLayout, rules: RealmRules, keeper: Keeper, seed: number) {
    this.layout = layout;
    this.map = layout.map;
    this.rules = rules;
    this.keeper = keeper;
    this.rng = new RNG(seed ^ 0x5bd1e995);
    this.pf = new Pathfinder(this.map.w, this.map.h);
    for (let i = 0; i < this.map.tile.length; i++) if (this.map.room[i] === Room.Heart && this.map.owner[i] === PLAYER) this.heartTiles.push(i);
    this.map.onChange(() => {
      this.roomsDirty = true;
    });
    this.recomputeRooms();
    this.heartRing = heartRing(this);
    this.keeper.heartMax = rules.heartHp;
    this.keeper.heartHp = rules.heartHp;
    this.director = new Director(this);
    this.crates = layout.crates.map((p, k) => ({ id: k + 1, tile: this.map.idx(p.x, p.z), x: p.x + 0.5, z: p.z + 0.5, opened: false }));
  }

  // ------------------------------------------------------------------ events
  msg(text: string, color = '#e8d8b0', important = false) {
    this.events.push({ type: 'msg', text, color, important });
  }
  sfx(name: string, x?: number, z?: number) {
    this.events.push({ type: 'sfx', sfx: name, x, z });
  }
  fx(name: string, x: number, z: number, y = 0.5, n = 1) {
    this.events.push({ type: 'fx', fx: name, x, z, y, n });
  }

  // ------------------------------------------------------------------ creatures
  spawn(kind: string, owner: number, x: number, z: number, level = 1): Creature {
    const c = new Creature(kind, owner, x, z, level);
    this.creatures.push(c);
    this.byId.set(c.id, c);
    return c;
  }

  remove(c: Creature) {
    c.removed = true;
    c.alive = false;
    this.releaseJob(c);
    if (c.lair >= 0) {
      this.bedOwner.delete(c.lair);
      c.lair = -1;
    }
    this.byId.delete(c.id);
  }

  countOwned(owner: number, kind?: string) {
    let n = 0;
    for (const c of this.creatures) if (c.alive && c.owner === owner && (!kind || c.kind === kind) && c.kind !== 'chicken') n++;
    return n;
  }

  // ------------------------------------------------------------------ passability
  isHeartTile(i: number) {
    return this.map.room[i] === Room.Heart;
  }

  walkableFor(c: Creature | null, x: number, z: number): boolean {
    const m = this.map;
    if (!m.inBounds(x, z)) return false;
    const i = z * m.w + x;
    const t = m.tile[i];
    if (isSolid(t)) return false;
    if (t === Tile.Lava && !(c && (c.def.fireImmune || c.def.flying))) return false;
    if (m.room[i] === Room.Heart) return false;
    return true;
  }

  passFn(c: Creature | null) {
    return (x: number, z: number) => this.walkableFor(c, x, z);
  }

  costFn(c: Creature | null): CostFn {
    const m = this.map;
    return (x, z) => {
      if (!this.walkableFor(c, x, z)) return Infinity;
      const t = m.tile[z * m.w + x];
      if (t === Tile.Water && !(c && c.def.flying)) return 2.2;
      return 1;
    };
  }

  // Heroes can bore through soil to reach you.
  digCostFn(c: Creature): CostFn {
    const m = this.map;
    const digger = c.def.digger ?? 0.25;
    return (x, z) => {
      if (!m.inBounds(x, z)) return Infinity;
      const i = z * m.w + x;
      const t = m.tile[i];
      if (t === Tile.Rock || t === Tile.Gems) return Infinity;
      if (t === Tile.Earth) return 3 + 5 / digger;
      if (t === Tile.Gold) return 4 + 7 / digger;
      if (t === Tile.Wall) return m.owner[i] === c.owner ? Infinity : 6 + 14 / digger;
      if (t === Tile.Lava && !(c.def.fireImmune || c.def.flying)) return Infinity;
      if (m.room[i] === Room.Heart) return Infinity;
      if (t === Tile.Water) return 2.2;
      return 1;
    };
  }

  pathTo(c: Creature, tx: number, tz: number, adjacentOk = false, maxNodes = 5000): boolean {
    const p = this.pf.find(c.tx, c.tz, tx, tz, this.costFn(c), maxNodes, adjacentOk);
    if (!p) return false;
    c.path = p;
    c.pathI = 0;
    return true;
  }

  // ------------------------------------------------------------------ rooms
  recomputeRooms() {
    const m = this.map;
    m.roomId.fill(-1);
    this.rooms = [];
    const q: number[] = [];
    for (let i = 0; i < m.tile.length; i++) {
      if (m.room[i] === Room.None || m.roomId[i] !== -1 || m.tile[i] !== Tile.Floor) continue;
      const type = m.room[i];
      const owner = m.owner[i];
      const id = this.rooms.length;
      const inst: RoomInst = { id, type, owner, tiles: [], cx: 0, cz: 0 };
      q.length = 0;
      q.push(i);
      m.roomId[i] = id;
      while (q.length) {
        const cur = q.pop()!;
        inst.tiles.push(cur);
        const x = cur % m.w,
          z = (cur / m.w) | 0;
        inst.cx += x + 0.5;
        inst.cz += z + 0.5;
        m.forNeighbors4(x, z, (nx, nz) => {
          const ni = nz * m.w + nx;
          if (m.roomId[ni] === -1 && m.room[ni] === type && m.owner[ni] === owner && m.tile[ni] === Tile.Floor) {
            m.roomId[ni] = id;
            q.push(ni);
          }
        });
      }
      inst.cx /= inst.tiles.length;
      inst.cz /= inst.tiles.length;
      this.rooms.push(inst);
    }
    // drop beds on tiles that are no longer lair
    for (const [tile, cid] of this.bedOwner) {
      if (m.room[tile] !== Room.Lair || m.owner[tile] !== PLAYER) {
        this.bedOwner.delete(tile);
        const c = this.byId.get(cid);
        if (c) c.lair = -1;
      }
    }
    this.roomsDirty = false;
    this.roomsVersion++;
    this.keeper.goldCap = this.goldCapacity();
  }

  roomTiles(type: Room, owner = PLAYER): number {
    let n = 0;
    for (const r of this.rooms) if (r.type === type && r.owner === owner) n += r.tiles.length;
    return n;
  }

  roomsOf(type: Room, owner = PLAYER): RoomInst[] {
    return this.rooms.filter((r) => r.type === type && r.owner === owner);
  }

  goldCapacity() {
    return this.rules.heartVault + this.roomTiles(Room.Treasury) * 1000 * this.rules.treasuryMul;
  }

  canBuild(x: number, z: number, type: Room): string | null {
    const m = this.map;
    if (!m.inBounds(x, z)) return 'Out of bounds';
    const i = m.idx(x, z);
    const def = ROOMS[type];
    if (!def) return 'Unknown room';
    if (!this.keeper.rooms.has(type)) return 'Not yet researched';
    if (type === Room.Bridge) {
      if (m.tile[i] !== Tile.Water && m.tile[i] !== Tile.Lava) return 'Bridges span water or lava';
      let adj = false;
      m.forNeighbors4(x, z, (nx, nz) => {
        const ni = nz * m.w + nx;
        if ((m.tile[ni] === Tile.Floor && m.owner[ni] === PLAYER) || m.room[ni] === Room.Bridge) adj = true;
      });
      if (!adj) return 'Must connect to your territory';
    } else {
      if (m.tile[i] !== Tile.Floor || m.owner[i] !== PLAYER) return 'Build on claimed floor';
      if (m.room[i] !== Room.None) return 'Already built';
    }
    if (this.keeper.gold < this.roomCost(type)) return 'Not enough gold';
    return null;
  }

  roomCost(type: Room) {
    return Math.round(ROOMS[type].cost * this.rules.roomCostMul);
  }

  build(x: number, z: number, type: Room): boolean {
    if (this.canBuild(x, z, type)) return false;
    this.keeper.spend(this.roomCost(type));
    const m = this.map;
    m.setRoom(x, z, type, PLAYER);
    if (type === Room.Bridge) m.variant[m.idx(x, z)] = m.tile[m.idx(x, z)];
    this.fx('build', x + 0.5, z + 0.5, 0.1, 6);
    this.sfx('build', x + 0.5, z + 0.5);
    return true;
  }

  sell(x: number, z: number): boolean {
    const m = this.map;
    if (!m.inBounds(x, z)) return false;
    const i = m.idx(x, z);
    const r = m.room[i] as Room;
    if (m.owner[i] !== PLAYER || r === Room.None || !ROOMS[r]?.buildable) return false;
    this.keeper.addGold(Math.floor(this.roomCost(r) / 2), true);
    if (r === Room.Bridge) {
      m.room[i] = Room.None;
      m.set(x, z, Tile.Water, NEUTRAL);
    } else m.setRoom(x, z, Room.None, PLAYER);
    this.sfx('sell', x + 0.5, z + 0.5);
    return true;
  }

  // ------------------------------------------------------------------ jobs
  reserveKey(tile: number, kind: number) {
    return tile * 8 + kind;
  }
  reserve(key: number, c: Creature) {
    this.reservations.set(key, c.id);
  }
  isReserved(key: number, c: Creature) {
    const r = this.reservations.get(key);
    return r !== undefined && r !== c.id && this.byId.has(r);
  }
  releaseJob(c: Creature) {
    const j = c.job;
    if (!j) return;
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const key = this.reserveKey(j.target, k);
      if (this.reservations.get(key) === c.id) this.reservations.delete(key);
      const key2 = this.reserveKey(j.stand, k);
      if (this.reservations.get(key2) === c.id) this.reservations.delete(key2);
    }
    if (j.type === 'dig') {
      const n = (this.digCount.get(j.target) ?? 1) - 1;
      if (n <= 0) this.digCount.delete(j.target);
      else this.digCount.set(j.target, n);
    }
    c.job = null;
  }

  tagDig(x: number, z: number, on: boolean) {
    const m = this.map;
    if (!m.inBounds(x, z)) return false;
    const i = m.idx(x, z);
    const t = m.tile[i];
    const diggable = isDiggable(t) || (t === Tile.Wall && m.owner[i] !== PLAYER && m.revealed[i]);
    if (!diggable) return false;
    const v = on ? 1 : 0;
    if (m.tagged[i] === v) return false;
    m.tagged[i] = v;
    m.touch(x, z);
    return true;
  }

  digStrength(t: Tile, owner: number) {
    if (t === Tile.Earth) return 5;
    if (t === Tile.Gold) return 9;
    if (t === Tile.Wall) return owner === HEROES ? 26 : 18;
    return 9999;
  }

  // Remove a solid tile (dug out).
  digOut(x: number, z: number) {
    const m = this.map;
    const i = m.idx(x, z);
    const t = m.tile[i];
    if (t === Tile.Gems) return;
    const leftover = t === Tile.Gold ? m.gold[i] : 0;
    m.tagged[i] = 0;
    m.hp[i] = 0;
    m.gold[i] = 0;
    m.set(x, z, Tile.Path, NEUTRAL);
    if (leftover > 0) m.gold[i] = leftover;
    this.stats.dug++;
    this.revealAround(x, z, 4.5);
    this.fx('dust', x + 0.5, z + 0.5, 0.6, 10);
    this.sfx('rubble', x + 0.5, z + 0.5);
  }

  // ------------------------------------------------------------------ vision
  revealAround(cx: number, cz: number, r: number) {
    const m = this.map;
    const R = Math.ceil(r);
    const x0 = cx + 0.5,
      z0 = cz + 0.5;
    for (let z = cz - R; z <= cz + R; z++)
      for (let x = cx - R; x <= cx + R; x++) {
        if (!m.inBounds(x, z)) continue;
        const i = m.idx(x, z);
        if (m.revealed[i]) continue;
        if ((x - cx) ** 2 + (z - cz) ** 2 > r * r) continue;
        if (!this.losTiles(x0, z0, x + 0.5, z + 0.5)) continue;
        m.revealed[i] = 1;
        m.touch(x, z);
        this.onRevealed(i);
      }
  }

  losTiles(ax: number, az: number, bx: number, bz: number) {
    const m = this.map;
    const dx = bx - ax,
      dz = bz - az;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) * 3);
    const sx = Math.floor(ax),
      sz = Math.floor(az),
      ex = Math.floor(bx),
      ez = Math.floor(bz);
    for (let s = 1; s < steps; s++) {
      const x = Math.floor(ax + (dx * s) / steps);
      const z = Math.floor(az + (dz * s) / steps);
      if ((x === sx && z === sz) || (x === ex && z === ez)) continue;
      if (isSolid(m.tile[z * m.w + x])) return false;
    }
    return true;
  }

  onRevealed(i: number) {
    for (const c of this.creatures) {
      if (!c.alive || c.campTile < 0) continue;
      if (c.tx + c.tz * this.map.w === i && c.owner === HEROES && c.asleepInCamp) {
        c.asleepInCamp = false;
        this.msg('Heroes lurk in the dark... they have spotted your minions!', '#9fc0ff');
      }
    }
  }

  isVisible(x: number, z: number) {
    const m = this.map;
    const tx = Math.floor(x),
      tz = Math.floor(z);
    if (!m.inBounds(tx, tz)) return false;
    return m.revealed[m.idx(tx, tz)] === 1;
  }

  // ------------------------------------------------------------------ gold on the floor
  dropGold(x: number, z: number, amount: number) {
    const m = this.map;
    const tx = Math.floor(x),
      tz = Math.floor(z);
    if (!m.inBounds(tx, tz)) return;
    const i = m.idx(tx, tz);
    if (isSolid(m.tile[i])) return;
    m.gold[i] += Math.round(amount);
    this.events.push({ type: 'fx', fx: 'goldpile', x: tx + 0.5, z: tz + 0.5 });
  }

  // ------------------------------------------------------------------ main update
  update(dt: number) {
    if (this.over) return;
    this.time += dt;
    if (this.roomsDirty) this.recomputeRooms();

    this.keeper.update(this, dt);

    const list = this.creatures;
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (c.removed) continue;
      if (!c.alive) {
        c.deathT += dt;
        continue;
      }
      c.stateT += dt;
      c.animT += dt;
      if (c.hitFlash > 0) c.hitFlash -= dt;
      if (c.slapT > 0) c.slapT -= dt;
      if (c.speedT > 0) c.speedT -= dt;
      if (c.slowT > 0) c.slowT -= dt;
      if (c.shieldT > 0) c.shieldT -= dt;
      if (c.attackCd > 0) c.attackCd -= dt;
      if (c.rangedCd > 0) c.rangedCd -= dt;
      if (c.state === 'held' || c.state === 'possessed') continue;
      if (c.state === 'fall') {
        c.vy -= 22 * dt;
        c.y += c.vy * dt;
        if (c.y <= 0) {
          c.y = 0;
          c.vy = 0;
          c.state = 'idle';
          c.stunT = 0.5;
          this.fx('dust', c.x, c.z, 0.1, 5);
          this.sfx('land', c.x, c.z);
        }
        continue;
      }
      if (c.stunT > 0) {
        c.stunT -= dt;
        c.anim = 'stunned';
        continue;
      }
      if (c.kind === 'imp' && c.owner === PLAYER) updateImp(this, c, dt);
      else if (c.kind === 'chicken') updateChicken(this, c, dt);
      else if (c.owner === HEROES) updateHero(this, c, dt);
      else updateMinion(this, c, dt);
    }

    updateProjectiles(this, dt);
    separate(this, dt);
    this.director.update(dt);

    // lava burns the unwary
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) {
      for (const c of list) {
        if (!c.alive || c.state === 'held' || c.def.fireImmune || c.def.flying) continue;
        const i = this.map.idx(c.tx, c.tz);
        if (this.map.tile[i] === Tile.Lava) this.damage(c, 25, null);
      }
    }

    // periodic vision from player units
    this.revealT -= dt;
    if (this.revealT <= 0) {
      this.revealT = 0.5;
      for (const c of list) {
        if (!c.alive || c.owner !== PLAYER || c.state === 'held') continue;
        this.revealAround(c.tx, c.tz, c.def.flying ? 6 : 4.5);
      }
    }

    // corpses decay
    for (const c of this.corpses) c.t += dt;
    if (this.corpses.length && this.corpses[0].t > 40) this.corpses.shift();

    // compact
    if (list.length > 0 && Math.floor(this.time) % 5 === 0) {
      this.creatures = list.filter((c) => !c.removed && !(c.deathT > 2.5 && !c.alive));
    }

    if (this.heartHit > 0) this.heartHit -= dt;
  }

  damage(target: Creature, amount: number, src: Creature | null) {
    if (!target.alive) return;
    let a = amount;
    if (target.shieldT > 0) a *= 0.4;
    a = Math.max(1, a - target.def.armor * 0.6);
    target.hp -= a;
    target.hitFlash = 0.15;
    target.lastHurtBy = src;
    if (target.state === 'sleep' || target.asleepInCamp) {
      target.asleepInCamp = false;
      target.state = 'idle';
    }
    if (target.hp <= 0) this.kill(target, src);
  }

  kill(c: Creature, src: Creature | null) {
    if (!c.alive) return;
    c.alive = false;
    c.hp = 0;
    c.anim = 'dead';
    c.deathT = 0;
    this.releaseJob(c);
    if (c.lair >= 0) {
      this.bedOwner.delete(c.lair);
      c.lair = -1;
    }
    if (c.carryGold > 0) this.dropGold(c.x, c.z, c.carryGold);
    if (c.carrying) {
      c.carrying.carriedBy = null;
      c.carrying = null;
    }
    this.byId.delete(c.id);
    if (c.kind !== 'chicken') this.corpses.push({ x: c.x, z: c.z, kind: c.kind, owner: c.owner, t: 0, angle: c.angle, id: c.id });
    this.fx('blood', c.x, c.z, 0.6, 14);
    this.sfx(c.def.hero ? 'herodie' : 'die', c.x, c.z);
    if (src) {
      src.kills++;
      src.xp += 40 + c.level * 25;
    }
    if (c.owner === HEROES) {
      this.stats.heroesSlain++;
      this.stats.souls += c.def.souls;
      if (c.def.bounty) this.dropGold(c.x, c.z, c.def.bounty * this.rules.bountyMul);
      if (c.def.boss) this.events.push({ type: 'msg', text: `${c.def.name} has fallen!`, color: '#ffcc55', important: true });
    } else if (c.owner === PLAYER && c.kind !== 'chicken') {
      this.stats.minionsLost++;
      if (c.kind !== 'imp') this.msg(`Your ${c.def.name} has been slain.`, '#ff8866');
    }
  }

  // tiles near (x,z) that are walkable, nearest first
  freeTileNear(tx: number, tz: number, c: Creature | null = null): [number, number] | null {
    if (this.walkableFor(c, tx, tz)) return [tx, tz];
    const r = this.pf.nearest(tx, tz, () => true, (_i, x, z) => this.walkableFor(c, x, z), 12);
    if (!r) return null;
    return [r.goal % this.map.w, (r.goal / this.map.w) | 0];
  }

  randomReachable(c: Creature, radius: number, filter?: (i: number) => boolean): number {
    const arr = this.pf.reachable(c.tx, c.tz, this.passFn(c), radius, this.tmpArr);
    const pool = filter ? arr.filter(filter) : arr;
    if (!pool.length) return -1;
    return pool[Math.floor(this.rng.next() * pool.length)];
  }

  damageHeart(dmg: number, src: Creature | null) {
    const k = this.keeper;
    if (this.over) return;
    k.heartHp -= dmg;
    this.heartHit = 0.25;
    const [hx, hz] = this.heartCenter();
    this.fx('heartHit', hx, hz, 1.2, 6);
    this.sfx('heartHit', hx, hz);
    if (Math.floor((k.heartHp + dmg) / 500) !== Math.floor(k.heartHp / 500)) this.msg('Your Dungeon Heart is under attack!', '#ff4040', true);
    if (k.heartHp <= 0) {
      k.heartHp = 0;
      this.events.push({ type: 'shake', n: 2 });
      this.fx('heartDie', hx, hz, 1.2, 80);
      this.endRealm(false);
    }
    void src;
  }

  openCrate(cr: Crate, c: Creature) {
    openCrate(this, cr, c);
  }

  endRealm(win: boolean) {
    if (this.over) return;
    this.over = true;
    this.won = win;
    this.events.push({ type: 'end', win });
  }

  heartCenter(): [number, number] {
    return [this.layout.heart.x + 0.5, this.layout.heart.z + 0.5];
  }

  impCap() {
    return IMP_CAP;
  }

  creatureDefs() {
    return CREATURES;
  }
}
