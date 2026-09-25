import { generateRealm } from '../game/mapgen';
import { Game } from '../game/game';
import { defaultRules } from '../game/realm';
import { Keeper } from '../game/keeper';
import { Tile, Room, PLAYER, isSolid } from '../game/defs';

// A small, already-thriving dungeon that plays itself behind the menus.
export function makeDemo(seed: number): Game {
  const layout = generateRealm({ seed, w: 48, h: 48, depth: 2, goldMul: 1.3, water: 0, lava: 1, rockiness: 0.3, caves: 4, portals: 1, heroBase: false });
  const m = layout.map;
  const hx = layout.heart.x,
    hz = layout.heart.z;
  const R = 8;
  for (let z = hz - R - 1; z <= hz + R + 1; z++)
    for (let x = hx - R - 1; x <= hx + R + 1; x++) {
      if (!m.inBounds(x, z) || x < 2 || z < 2 || x >= m.w - 2 || z >= m.h - 2) continue;
      const i = m.idx(x, z);
      const d = Math.max(Math.abs(x - hx), Math.abs(z - hz));
      if (m.room[i] === Room.Heart) continue;
      if (d <= R) {
        m.tile[i] = Tile.Floor;
        m.owner[i] = PLAYER;
        m.room[i] = Room.None;
        m.gold[i] = 0;
      } else if (m.tile[i] === Tile.Path) {
        m.tile[i] = Tile.Earth;
      }
    }
  const room = (r: Room, x0: number, z0: number, w: number, h: number) => {
    for (let z = z0; z < z0 + h; z++)
      for (let x = x0; x < x0 + w; x++) {
        const i = m.idx(hx + x, hz + z);
        if (m.tile[i] === Tile.Floor && m.room[i] === Room.None) m.room[i] = r;
      }
  };
  room(Room.Treasury, -8, -8, 4, 3);
  room(Room.Lair, 3, -8, 6, 3);
  room(Room.Hatchery, -8, 5, 4, 4);
  room(Room.Library, 4, 4, 5, 5);
  room(Room.Training, -3, 4, 5, 5);
  room(Room.Portal, -8, -3, 3, 3);
  m.revealed.fill(1);
  for (let i = 0; i < m.tile.length; i++) if (isSolid(m.tile[i]) && m.tile[i] !== Tile.Rock) m.revealed[i] = 1;

  const rules = defaultRules(0);
  rules.firstWave = 1e9;
  rules.waveInterval = 1e9;
  rules.portalInterval = 1e9;
  rules.heartVault = 99999;
  const keeper = new Keeper();
  keeper.gold = 9000;
  const g = new Game(layout, rules, keeper, seed);
  const spawn = (kind: string, n: number, lvl = 3) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 4;
      const x = Math.floor(hx + Math.cos(a) * r),
        z = Math.floor(hz + Math.sin(a) * r);
      if (!g.walkableFor(null, x, z)) continue;
      const c = g.spawn(kind, PLAYER, x + 0.5, z + 0.5, lvl + Math.floor(Math.random() * 3));
      c.hunger = 0;
      c.tired = Math.random() * 0.4;
    }
  };
  spawn('imp', 6, 1);
  spawn('goblin', 3);
  spawn('warlock', 3);
  spawn('troll', 1);
  spawn('bile', 1);
  spawn('dragon', 1);
  spawn('mistress', 1);
  spawn('beetle', 2);
  spawn('skeleton', 1);
  // give the imps something to do
  for (let z = hz - 14; z <= hz + 14; z++)
    for (let x = hx - 14; x <= hx + 14; x++) {
      if (!m.inBounds(x, z)) continue;
      const d = Math.max(Math.abs(x - hx), Math.abs(z - hz));
      if ((d === 9 || d === 10) && (x - hx > 3 || z - hz < -3)) g.tagDig(x, z, true);
    }
  return g;
}
