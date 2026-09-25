import type { Game, Crate } from './game';
import type { Creature } from './entity';
import { Room, PLAYER, HEROES, NEUTRAL, Tile } from './defs';
import { CREATURES, KEEPER_ROSTER } from './creatures';

export interface WaveInfo {
  spawned: number;
  nextT: number;
  lordAlive: boolean;
  lord: Creature | null;
}

const HERO_TIERS: string[][] = [
  ['dwarf', 'archer', 'dwarf', 'monk'],
  ['dwarf', 'archer', 'knight', 'wizard', 'monk', 'barbarian'],
  ['knight', 'wizard', 'barbarian', 'monk', 'samurai', 'archer', 'dwarf'],
  ['knight', 'samurai', 'wizard', 'giant', 'barbarian', 'monk'],
];

export class Director {
  wave: WaveInfo = { spawned: 0, nextT: 0, lordAlive: false, lord: null };
  portalT = 12;
  hatchT = 3;
  warned = false;

  constructor(public g: Game) {
    this.wave.nextT = g.rules.firstWave;
  }

  populate(retinue: { kind: string; level: number }[]) {
    const g = this.g;
    const L = g.layout;
    const [hx, hz] = g.heartCenter();
    // starting imps around the heart
    for (let k = 0; k < g.rules.startImps; k++) {
      const a = (k / g.rules.startImps) * Math.PI * 2;
      const c = g.spawn('imp', PLAYER, hx + Math.cos(a) * 2.2, hz + Math.sin(a) * 2.2);
      c.angle = a;
    }
    // retinue from previous realms
    retinue.forEach((r, k) => {
      const a = (k / Math.max(1, retinue.length)) * Math.PI * 2 + 0.4;
      const c = g.spawn(r.kind, PLAYER, hx + Math.cos(a) * 2.6, hz + Math.sin(a) * 2.6, r.level);
      c.retinue = true;
    });
    // neutrals
    const depth = g.rules.depth;
    const pool = KEEPER_ROSTER.filter((k) => ['beetle', 'fly', 'goblin', 'warlock', 'spider', 'troll', 'hound'].includes(k));
    for (const cave of L.neutralCaves) {
      for (let k = 0; k < cave.count; k++) {
        const kind = g.rng.pick(pool);
        const c = g.spawn(kind, NEUTRAL, cave.x + 0.5 + g.rng.range(-0.8, 0.8), cave.z + 0.5 + g.rng.range(-0.8, 0.8), 1 + g.rng.int(0, 1 + depth));
        c.state = 'idle';
      }
    }
    // sleeping hero camps
    const tier = HERO_TIERS[Math.min(HERO_TIERS.length - 1, Math.floor(depth / 2))];
    for (const camp of L.heroCamps) {
      for (let k = 0; k < camp.count; k++) {
        const kind = g.rng.pick(tier);
        const c = g.spawn(kind, HEROES, camp.x + 0.5 + g.rng.range(-0.9, 0.9), camp.z + 0.5 + g.rng.range(-0.9, 0.9), this.heroLevel());
        this.scaleHero(c);
        c.asleepInCamp = true;
        c.campTile = g.map.idx(camp.x, camp.z);
      }
    }
    // the lord and his guard
    if (L.heroKeep) {
      const k = L.heroKeep;
      const lordKind = g.rules.depth >= 7 ? 'avatar' : 'lord';
      const lord = g.spawn(lordKind, HEROES, k.x + 0.5, k.z + 0.5, Math.min(10, 1 + depth));
      this.scaleHero(lord);
      lord.campTile = g.map.idx(k.x, k.z);
      this.wave.lord = lord;
      this.wave.lordAlive = true;
      const guards = 2 + Math.floor(depth * 0.8);
      for (let n = 0; n < guards; n++) {
        const kind = g.rng.pick(tier);
        const c = g.spawn(kind, HEROES, k.x + 0.5 + g.rng.range(-3, 3), k.z + 0.5 + g.rng.range(-2, 2), this.heroLevel());
        this.scaleHero(c);
        const ft = g.freeTileNear(Math.floor(c.x), Math.floor(c.z), c);
        if (ft) {
          c.x = ft[0] + 0.5;
          c.z = ft[1] + 0.5;
        }
        c.campTile = g.map.idx(Math.floor(c.x), Math.floor(c.z));
      }
    }
  }

  heroLevel() {
    const g = this.g;
    return Math.min(10, 1 + g.rules.heroLevelBonus + g.rng.int(0, 1) + Math.floor(this.wave.spawned / 3));
  }

  scaleHero(c: Creature) {
    const g = this.g;
    c.maxHp = Math.round(c.maxHp * g.rules.heroHpMul);
    c.hp = c.maxHp;
  }

  update(dt: number) {
    const g = this.g;
    const m = g.map;

    // portal attraction
    this.portalT -= dt;
    if (this.portalT <= 0) {
      this.portalT = g.rules.portalInterval * (0.8 + g.rng.next() * 0.4);
      this.attract();
    }

    // hatchery breeding
    this.hatchT -= dt;
    if (this.hatchT <= 0) {
      this.hatchT = 4;
      for (const r of g.roomsOf(Room.Hatchery)) {
        const max = Math.ceil(r.tiles.length / 2);
        let n = 0;
        for (const c of g.creatures) if (c.alive && c.kind === 'chicken' && c.owner === PLAYER && m.roomId[m.idx(c.tx, c.tz)] === r.id) n++;
        if (n < max) {
          const t = g.rng.pick(r.tiles);
          const ch = g.spawn('chicken', PLAYER, (t % m.w) + 0.5, ((t / m.w) | 0) + 0.5);
          ch.thinkCd = 0.5;
          g.fx('feather', ch.x, ch.z, 0.3, 4);
        }
      }
    }

    // hero invasions
    this.wave.nextT -= dt;
    if (!this.warned && this.wave.nextT < 20) {
      this.warned = true;
      g.msg('The land trembles. Heroes gather at their gate...', '#9fc0ff');
    }
    if (this.wave.nextT <= 0) {
      this.spawnWave();
      this.wave.nextT = g.rules.waveInterval;
      this.warned = false;
    }

    if (this.wave.lord && !this.wave.lord.alive && this.wave.lordAlive) this.wave.lordAlive = false;
    this.checkObjective();
  }

  spawnWave() {
    const g = this.g;
    const gates = g.layout.heroGates;
    if (!gates.length) return;
    this.wave.spawned++;
    const gate = gates[(this.wave.spawned - 1) % gates.length];
    const depth = g.rules.depth;
    const tier = HERO_TIERS[Math.min(HERO_TIERS.length - 1, Math.floor((depth + this.wave.spawned / 3) / 2))];
    const n = g.rules.waveSize + Math.floor(this.wave.spawned * 0.6);
    // every party has a tunneller
    const kinds = ['dwarf'];
    for (let k = 1; k < n; k++) kinds.push(g.rng.pick(tier));
    if (this.wave.spawned % 4 === 0 && depth >= 2) kinds.push('giant');
    for (const kind of kinds) {
      const c = g.spawn(kind, HEROES, gate.x + 0.5 + g.rng.range(-0.3, 0.3), gate.z + 0.5 + g.rng.range(-0.3, 0.3), this.heroLevel());
      this.scaleHero(c);
      c.state = 'march';
      c.thinkCd = g.rng.next() * 2;
    }
    g.fx('herogate', gate.x + 0.5, gate.z + 0.5, 0.5, 30);
    g.msg(`A party of ${kinds.length} heroes has entered the realm!`, '#9fc0ff', true);
    g.sfx('horn_hero');
  }

  attract() {
    const g = this.g;
    const m = g.map;
    const portals = g.roomsOf(Room.Portal);
    if (!portals.length) return;
    let minions = 0;
    for (const c of g.creatures) if (c.alive && c.owner === PLAYER && !c.isImp && c.kind !== 'chicken') minions++;
    if (minions >= g.rules.maxCreatures) return;
    if (g.roomTiles(Room.Lair) === 0 && minions >= 2) return;
    const options: [string, number][] = [];
    for (const key of KEEPER_ROSTER) {
      const d = CREATURES[key];
      if (!d.attract) continue;
      let ok = true;
      for (const [room, n] of d.attract.rooms) if (g.roomTiles(room) < n) ok = false;
      if (!ok) continue;
      let w = d.attract.weight;
      // richer rooms draw better creatures
      if (key === 'fly' || key === 'beetle') w *= Math.max(0.3, 1 - minions * 0.06);
      options.push([key, w]);
    }
    if (!options.length) return;
    const kind = g.rng.weighted(options);
    const portal = g.rng.pick(portals);
    const c = g.spawn(kind, PLAYER, portal.cx + g.rng.range(-0.4, 0.4), portal.cz + g.rng.range(-0.4, 0.4));
    c.y = 0;
    g.fx('portal', portal.cx, portal.cz, 0.5, 24);
    g.sfx('portal', portal.cx, portal.cz);
    g.msg(`A ${CREATURES[kind].name} has come through the portal.`, '#d0a0ff');
    void m;
  }

  checkObjective() {
    const g = this.g;
    if (g.over) return;
    const r = g.rules;
    if (r.objective === 'conquest') {
      if (this.wave.lord && !this.wave.lordAlive) g.endRealm(true);
    } else if (r.objective === 'siege') {
      if (this.wave.spawned >= r.objectiveTarget) {
        const invaders = g.creatures.some((c) => c.alive && c.owner === HEROES && c.campTile < 0);
        if (!invaders) g.endRealm(true);
      }
    } else if (r.objective === 'plunder') {
      if (g.keeper.gold >= r.objectiveTarget) g.endRealm(true);
    }
  }
}

export function openCrate(g: Game, cr: Crate, c: Creature) {
  const roll = g.rng.next();
  g.fx('crate', cr.x, cr.z, 0.4, 24);
  g.sfx('crate', cr.x, cr.z);
  if (roll < 0.3) {
    const amt = 600 + g.rng.int(0, 8) * 100;
    g.keeper.addGold(amt);
    g.msg(`A hidden hoard! +${amt} gold.`, '#ffd060', true);
  } else if (roll < 0.5) {
    let n = 0;
    for (const o of g.creatures) if (o.alive && o.owner === PLAYER && o.kind !== 'chicken') {
      o.setLevel(o.level + 1);
      n++;
    }
    g.msg(`Tome of Power! ${n} minions grow stronger.`, '#a0ffa0', true);
  } else if (roll < 0.65) {
    const m = g.map;
    for (let i = 0; i < m.revealed.length; i++)
      if (!m.revealed[i]) {
        m.revealed[i] = 1;
        m.touch(i % m.w, (i / m.w) | 0);
      }
    g.msg('A map of the realm! All is revealed.', '#c0e0ff', true);
  } else if (roll < 0.8) {
    for (let k = 0; k < 3; k++) {
      const s = g.spawn('imp', PLAYER, cr.x, cr.z);
      s.y = 1.5;
      s.state = 'fall';
    }
    g.msg('Three imps spill from the crate, cackling.', '#ffb070', true);
  } else if (roll < 0.9) {
    g.keeper.research += 400;
    g.msg('Forbidden scrolls! Research advances.', '#c8a0ff', true);
  } else {
    const kind = g.rng.pick(['warlock', 'troll', 'bile', 'mistress', 'hound']);
    const s = g.spawn(kind, PLAYER, cr.x, cr.z, 2 + g.rng.int(0, 2));
    s.y = 1.5;
    s.state = 'fall';
    g.msg(`A bound ${CREATURES[kind].name} is released from the crate and serves you!`, '#d0a0ff', true);
  }
  void c;
  void Tile;
}
