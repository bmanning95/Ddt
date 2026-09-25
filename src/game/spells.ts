import type { Game } from './game';
import type { Creature } from './entity';
import { Tile, PLAYER, HEROES, NEUTRAL, isSolid, Room } from './defs';

export type SpellTarget = 'floor' | 'creature' | 'enemy' | 'area' | 'none';

export interface SpellDef {
  key: string;
  name: string;
  cost: number;
  target: SpellTarget;
  desc: string;
  icon: string; // glyph for UI
  cooldown: number;
}

export const SPELLS: Record<string, SpellDef> = {
  imp: { key: 'imp', name: 'Create Imp', cost: 150, target: 'floor', desc: 'Summon an imp onto your claimed ground. Cost rises with each imp.', icon: '☥', cooldown: 0 },
  sight: { key: 'sight', name: 'Sight of Evil', cost: 200, target: 'area', desc: 'Reveal a region of the realm.', icon: '◉', cooldown: 2 },
  cta: { key: 'cta', name: 'Call to Arms', cost: 100, target: 'area', desc: 'Rally all fighters to a point. Cast again to dismiss.', icon: '⚑', cooldown: 0 },
  possess: { key: 'possess', name: 'Possess', cost: 50, target: 'creature', desc: 'Take direct control of a minion. Right-click to release.', icon: '◈', cooldown: 1 },
  speed: { key: 'speed', name: 'Speed Monster', cost: 250, target: 'creature', desc: 'A minion moves and fights with unholy haste.', icon: '»', cooldown: 1 },
  heal: { key: 'heal', name: 'Heal', cost: 300, target: 'creature', desc: 'Restore a minion to vigour.', icon: '✚', cooldown: 1 },
  lightning: { key: 'lightning', name: 'Lightning Strike', cost: 350, target: 'area', desc: 'Smite intruders in your revealed territory.', icon: 'ϟ', cooldown: 1.5 },
  protect: { key: 'protect', name: 'Protect Monster', cost: 300, target: 'creature', desc: 'Shield a minion from harm.', icon: '⛨', cooldown: 1 },
  cavein: { key: 'cavein', name: 'Cave-In', cost: 450, target: 'area', desc: 'Bring the ceiling down, sealing a passage.', icon: '▼', cooldown: 3 },
  chicken: { key: 'chicken', name: 'Chicken', cost: 600, target: 'enemy', desc: 'Transform an intruder into poultry.', icon: '♨', cooldown: 3 },
  hellfire: { key: 'hellfire', name: 'Hellfire', cost: 1500, target: 'area', desc: 'Rain the fires of the pit upon a wide area.', icon: '☄', cooldown: 8 },
};

export const SPELL_ORDER = ['imp', 'sight', 'cta', 'possess', 'speed', 'heal', 'lightning', 'protect', 'cavein', 'chicken', 'hellfire'];

export function spellCost(g: Game, key: string): number {
  const d = SPELLS[key];
  if (key === 'imp') {
    const imps = g.countOwned(PLAYER, 'imp');
    return Math.round((d.cost + Math.max(0, imps - 4) * 60) * g.rules.impCostMul);
  }
  return d.cost;
}

// Returns an error string or null on success.
export function castSpell(g: Game, key: string, x: number, z: number, target: Creature | null): string | null {
  const d = SPELLS[key];
  if (!d) return 'Unknown spell';
  if (!g.keeper.spells.has(key)) return 'Not yet researched';
  const cost = spellCost(g, key);
  if (g.keeper.gold < cost) return 'Not enough gold';
  const m = g.map;
  const tx = Math.floor(x),
    tz = Math.floor(z);
  const inb = m.inBounds(tx, tz);
  const ti = inb ? m.idx(tx, tz) : -1;

  switch (key) {
    case 'imp': {
      if (!inb || m.tile[ti] !== Tile.Floor || m.owner[ti] !== PLAYER || m.room[ti] === Room.Heart) return 'Summon onto your claimed floor';
      g.keeper.spend(cost);
      const c = g.spawn('imp', PLAYER, tx + 0.5, tz + 0.5);
      c.y = 2.2;
      c.state = 'fall';
      g.keeper.impsCreated++;
      g.fx('summon', tx + 0.5, tz + 0.5, 0.2, 18);
      g.sfx('summon', tx + 0.5, tz + 0.5);
      return null;
    }
    case 'sight': {
      if (!inb) return 'Invalid target';
      g.keeper.spend(cost);
      const R = 6;
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const xx = tx + dx,
            zz = tz + dz;
          if (!m.inBounds(xx, zz) || dx * dx + dz * dz > R * R) continue;
          const i = m.idx(xx, zz);
          if (!m.revealed[i]) {
            m.revealed[i] = 1;
            m.touch(xx, zz);
            g.onRevealed(i);
          }
        }
      g.fx('sight', tx + 0.5, tz + 0.5, 1, 30);
      g.sfx('magic', tx + 0.5, tz + 0.5);
      return null;
    }
    case 'cta': {
      if (!inb || isSolid(m.tile[ti])) return 'Choose open ground';
      const cur = g.rally;
      if (cur && Math.abs(cur.x - (tx + 0.5)) < 1 && Math.abs(cur.z - (tz + 0.5)) < 1) {
        g.rally = null;
        for (const c of g.creatures) c.rally = null;
        g.msg('Your minions are dismissed.', '#c0c0c0');
        return null;
      }
      g.keeper.spend(cost);
      g.rally = { x: tx + 0.5, z: tz + 0.5 };
      for (const c of g.creatures) if (c.alive && c.owner === PLAYER && !c.isImp && c.kind !== 'chicken') c.rally = g.rally;
      g.msg('To arms! Your minions rally to the banner.', '#ff9060');
      g.sfx('horn', tx + 0.5, tz + 0.5);
      return null;
    }
    case 'possess': {
      if (!target || target.owner !== PLAYER || !target.alive) return 'Choose one of your minions';
      g.keeper.spend(cost);
      g.possessRequest = target;
      return null;
    }
    case 'speed':
    case 'heal':
    case 'protect': {
      if (!target || target.owner !== PLAYER || !target.alive) return 'Choose one of your minions';
      g.keeper.spend(cost);
      if (key === 'speed') target.speedT = 30;
      if (key === 'heal') target.hp = Math.min(target.maxHp, target.hp + target.maxHp * 0.65);
      if (key === 'protect') target.shieldT = 30;
      g.fx(key, target.x, target.z, 1, 16);
      g.sfx('magic', target.x, target.z);
      return null;
    }
    case 'lightning': {
      if (!inb || !m.revealed[ti]) return 'Target revealed ground';
      g.keeper.spend(cost);
      g.fx('lightning', x, z, 0, 1);
      g.sfx('thunder', x, z);
      g.events.push({ type: 'shake', n: 0.5 });
      for (const c of g.creatures) {
        if (!c.alive || c.owner === PLAYER) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < 1.6) g.damage(c, 150 * (1 - d / 2.2), null);
      }
      return null;
    }
    case 'cavein': {
      if (!inb || !m.revealed[ti]) return 'Target revealed ground';
      g.keeper.spend(cost);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = tx + dx,
            zz = tz + dz;
          if (!m.inBounds(xx, zz)) continue;
          const i = m.idx(xx, zz);
          const t = m.tile[i];
          if (isSolid(t) || m.room[i] === Room.Heart || m.room[i] === Room.Portal || m.room[i] === Room.HeroGate) continue;
          const blocked = g.creatures.some((c) => c.alive && c.tx === xx && c.tz === zz && c.state !== 'held');
          for (const c of g.creatures) if (c.alive && c.tx === xx && c.tz === zz) g.damage(c, 90, null);
          if (blocked && dx === 0 && dz === 0) continue;
          m.room[i] = Room.None;
          m.gold[i] = 0;
          m.set(xx, zz, Tile.Earth, NEUTRAL);
        }
      // anyone caught inside is shoved to open ground
      for (const c of g.creatures) {
        if (!c.alive || c.state === 'held') continue;
        if (isSolid(m.get(c.tx, c.tz))) {
          const f = g.freeTileNear(c.tx, c.tz, c);
          if (f) {
            c.x = f[0] + 0.5;
            c.z = f[1] + 0.5;
          }
          c.path = null;
        }
      }
      g.fx('dust', x, z, 0.8, 40);
      g.sfx('rubble', x, z);
      g.events.push({ type: 'shake', n: 0.8 });
      return null;
    }
    case 'chicken': {
      if (!target || target.owner === PLAYER || !target.alive) return 'Choose an intruder';
      if (target.def.boss) return 'Too mighty to transform';
      g.keeper.spend(cost);
      const cx = target.x,
        cz = target.z;
      g.remove(target);
      target.removed = true;
      const ch = g.spawn('chicken', NEUTRAL, cx, cz);
      ch.flags = 1;
      g.fx('summon', cx, cz, 0.5, 20);
      g.sfx('cluck', cx, cz);
      return null;
    }
    case 'hellfire': {
      if (!inb || !m.revealed[ti]) return 'Target revealed ground';
      g.keeper.spend(cost);
      g.fx('hellfire', x, z, 0, 1);
      g.sfx('explode', x, z);
      g.events.push({ type: 'shake', n: 1.2 });
      for (const c of g.creatures) {
        if (!c.alive) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < 3.2) g.damage(c, (c.owner === PLAYER ? 60 : 320) * (1 - d / 4), null);
      }
      return null;
    }
  }
  return 'Unknown spell';
}

export { HEROES };
