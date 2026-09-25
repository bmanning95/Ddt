import type { Game } from './game';
import { Tile, PLAYER, isSolid, Room } from './defs';
import { hostile } from './combat';

export interface TrapDef {
  key: string;
  name: string;
  icon: string;
  cost: number; // manufacture points
  door: boolean;
  desc: string;
  hp?: number;
  charges?: number;
  dmg?: number;
  radius?: number;
  unlockAt: number; // items manufactured before this becomes available
}

export const TRAPS: Record<string, TrapDef> = {
  spike: { key: 'spike', name: 'Spike Trap', icon: '▲', cost: 110, door: false, charges: 4, dmg: 75, radius: 0.55, unlockAt: 0, desc: 'Iron spikes erupt beneath intruders. 4 uses.' },
  wooddoor: { key: 'wooddoor', name: 'Wooden Door', icon: '▯', cost: 130, door: true, hp: 700, unlockAt: 0, desc: 'Blocks heroes until hacked apart. Your minions pass freely.' },
  fire: { key: 'fire', name: 'Fire Trap', icon: '♨', cost: 190, door: false, charges: 3, dmg: 90, radius: 1.4, unlockAt: 2, desc: 'A gout of flame scorches all nearby. 3 uses.' },
  irondoor: { key: 'irondoor', name: 'Iron Door', icon: '▮', cost: 260, door: true, hp: 1900, unlockAt: 3, desc: 'A formidable barrier of black iron.' },
  lightning: { key: 'lightning', name: 'Lightning Trap', icon: 'ϟ', cost: 250, door: false, charges: 3, dmg: 140, radius: 1.8, unlockAt: 5, desc: 'Calls down a bolt on those who pass. 3 uses.' },
  alarm: { key: 'alarm', name: 'Alarm Trap', icon: '♫', cost: 70, door: false, charges: 1, radius: 0.6, unlockAt: 1, desc: 'Summons your fighters to the intruders.' },
};

export const TRAP_ORDER = ['spike', 'wooddoor', 'alarm', 'fire', 'irondoor', 'lightning'];

export interface TrapInst {
  key: string;
  owner: number;
  charges: number;
  cd: number;
}

export interface DoorInst {
  key: string;
  owner: number;
  hp: number;
  maxHp: number;
  open: number; // 0..1 animation
  axis: 0 | 1; // 0 = passage runs north-south, 1 = east-west
}

export function canPlace(g: Game, key: string, x: number, z: number): string | null {
  const d = TRAPS[key];
  const m = g.map;
  if (!m.inBounds(x, z)) return 'Out of bounds';
  const i = m.idx(x, z);
  if ((g.keeper.inventory[key] ?? 0) <= 0) return 'None manufactured yet';
  if (m.tile[i] !== Tile.Floor || m.owner[i] !== PLAYER) return 'Place on your claimed floor';
  if (m.room[i] !== Room.None) return 'Not inside a room';
  if (g.traps.has(i) || g.doors.has(i)) return 'Something is already here';
  if (d.door) {
    const ns = isSolid(m.get(x, z - 1)) && isSolid(m.get(x, z + 1));
    const ew = isSolid(m.get(x - 1, z)) && isSolid(m.get(x + 1, z));
    if (!ns && !ew) return 'Doors need walls on both sides';
  }
  return null;
}

export function place(g: Game, key: string, x: number, z: number): boolean {
  if (canPlace(g, key, x, z)) return false;
  const d = TRAPS[key];
  const m = g.map;
  const i = m.idx(x, z);
  g.keeper.inventory[key]--;
  if (d.door) {
    const ew = isSolid(m.get(x - 1, z)) && isSolid(m.get(x + 1, z));
    g.doors.set(i, { key, owner: PLAYER, hp: d.hp!, maxHp: d.hp!, open: 0, axis: ew ? 1 : 0 });
  } else g.traps.set(i, { key, owner: PLAYER, charges: d.charges!, cd: 0 });
  g.trapsVersion++;
  g.fx('build', x + 0.5, z + 0.5, 0.2, 8);
  g.sfx('build', x + 0.5, z + 0.5);
  return true;
}

export function updateTraps(g: Game, dt: number) {
  const m = g.map;
  // manufacturing: points turn into items, cheapest unlocked first that we have fewest of
  const k = g.keeper;
  if (g.roomTiles(Room.Workshop) > 0) {
    const want = k.craft && isUnlocked(g, k.craft) ? k.craft : autoPick(g);
    const def = TRAPS[want];
    if (def && k.manufacture >= def.cost) {
      k.manufacture -= def.cost;
      k.inventory[want] = (k.inventory[want] ?? 0) + 1;
      k.crafted++;
      g.msg(`Your workshop has forged a ${def.name}.`, '#d0c090');
      g.sfx('anvil');
    }
  }
  // triggers
  for (const [i, t] of g.traps) {
    if (t.cd > 0) {
      t.cd -= dt;
      continue;
    }
    const def = TRAPS[t.key];
    const x = (i % m.w) + 0.5,
      z = ((i / m.w) | 0) + 0.5;
    let victim = null;
    for (const c of g.creatures) {
      if (!c.alive || c.owner === t.owner || c.owner === 0 || c.state === 'held' || c.carriedBy || c.def.flying) continue;
      if (Math.abs(c.x - x) < def.radius! && Math.abs(c.z - z) < def.radius!) {
        victim = c;
        break;
      }
    }
    if (!victim) continue;
    t.charges--;
    t.cd = 1.2;
    switch (t.key) {
      case 'spike':
        g.damage(victim, def.dmg!, null);
        g.fx('blood', x, z, 0.3, 10);
        g.sfx('spike', x, z);
        break;
      case 'fire':
        g.fx('fire', x, z, 0.4, 20);
        g.fx('fire', x, z, 0.9, 12);
        g.sfx('explode_small', x, z);
        for (const c of g.creatures) if (c.alive && c.owner !== t.owner && c.owner !== 0 && Math.hypot(c.x - x, c.z - z) < def.radius!) g.damage(c, def.dmg!, null);
        break;
      case 'lightning':
        g.fx('lightning', x, z, 0, 1);
        g.sfx('thunder', x, z);
        for (const c of g.creatures) if (c.alive && c.owner !== t.owner && c.owner !== 0 && Math.hypot(c.x - x, c.z - z) < def.radius!) g.damage(c, def.dmg!, null);
        break;
      case 'alarm': {
        g.sfx('horn', x, z);
        g.msg('An alarm trap has been sprung!', '#ff9060', true);
        for (const c of g.creatures) {
          if (!c.alive || c.owner !== PLAYER || c.isImp || c.kind === 'chicken' || c.state === 'held') continue;
          if (!c.rally || c.rallyT > 0) {
            c.rally = { x, z };
            c.rallyT = 25;
            c.state = 'idle';
            c.path = null;
          }
        }
        break;
      }
    }
    if (t.charges <= 0) {
      g.traps.delete(i);
      g.trapsVersion++;
    }
  }
  // doors swing open for their owners
  for (const [i, d] of g.doors) {
    const x = i % m.w,
      z = (i / m.w) | 0;
    let friend = false;
    for (const c of g.creatures) if (c.alive && c.owner === d.owner && Math.abs(c.x - (x + 0.5)) < 0.9 && Math.abs(c.z - (z + 0.5)) < 0.9) friend = true;
    d.open += (friend ? 1 : -1) * dt * 3;
    d.open = Math.max(0, Math.min(1, d.open));
  }
  void hostile;
}

function isUnlocked(g: Game, key: string) {
  return g.keeper.crafted >= TRAPS[key].unlockAt;
}

function autoPick(g: Game): string {
  const k = g.keeper;
  let best = 'spike';
  let bn = Infinity;
  for (const key of TRAP_ORDER) {
    if (!isUnlocked(g, key)) continue;
    const n = (k.inventory[key] ?? 0) + (TRAPS[key].door ? 0.5 : 0);
    if (n < bn) {
      bn = n;
      best = key;
    }
  }
  return best;
}

export function unlockedTraps(g: Game): string[] {
  return TRAP_ORDER.filter((k) => isUnlocked(g, k));
}

export function damageDoor(g: Game, i: number, dmg: number) {
  const d = g.doors.get(i);
  if (!d) return;
  d.hp -= dmg;
  const m = g.map;
  const x = (i % m.w) + 0.5,
    z = ((i / m.w) | 0) + 0.5;
  g.fx('chip', x, z, 0.8, 3);
  g.sfx('thwack', x, z);
  if (d.hp <= 0) {
    g.doors.delete(i);
    g.trapsVersion++;
    g.fx('dust', x, z, 0.6, 12);
    g.sfx('rubble', x, z);
    g.msg('A door has been smashed down!', '#ff9060');
  }
}
