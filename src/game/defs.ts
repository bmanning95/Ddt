// Core enums & static definitions shared by simulation and renderer.

export enum Tile {
  Rock = 0, // impenetrable bedrock
  Earth = 1, // diggable soil
  Gold = 2, // diggable gold seam
  Gems = 3, // inexhaustible gem seam
  Wall = 4, // fortified wall (owned)
  Path = 5, // dug, unclaimed floor
  Floor = 6, // claimed floor (owned) — rooms live on these
  Water = 7,
  Lava = 8,
}

export enum Room {
  None = 0,
  Heart,
  Portal,
  Treasury,
  Lair,
  Hatchery,
  Training,
  Library,
  Workshop,
  Prison,
  Torture,
  Graveyard,
  Temple,
  GuardPost,
  Bridge,
  HeroGate,
  HeroKeep,
}

export const NEUTRAL = 0;
export const PLAYER = 1;
export const HEROES = 2;

export const WALL_H = 1.35;

export function isSolid(t: Tile): boolean {
  return t <= Tile.Wall;
}
export function isDiggable(t: Tile): boolean {
  return t === Tile.Earth || t === Tile.Gold || t === Tile.Gems;
}
export function isLiquid(t: Tile): boolean {
  return t === Tile.Water || t === Tile.Lava;
}

export interface RoomDef {
  type: Room;
  name: string;
  cost: number; // gold per tile
  desc: string;
  buildable: boolean;
  color: string; // UI accent
  research: number; // research points to unlock (0 = available)
}

export const ROOMS: Record<number, RoomDef> = {
  [Room.Treasury]: { type: Room.Treasury, name: 'Treasury', cost: 50, buildable: true, color: '#d8a93a', research: 0, desc: 'Stores your gold. Each tile holds 1000.' },
  [Room.Lair]: { type: Room.Lair, name: 'Lair', cost: 60, buildable: true, color: '#8a6a4a', research: 0, desc: 'Creatures sleep and heal here. One bed per tile.' },
  [Room.Hatchery]: { type: Room.Hatchery, name: 'Hatchery', cost: 70, buildable: true, color: '#b0503a', research: 0, desc: 'Breeds chickens to feed hungry minions.' },
  [Room.Training]: { type: Room.Training, name: 'Training Pit', cost: 120, buildable: true, color: '#c07a30', research: 0, desc: 'Creatures gain experience here, at a cost.' },
  [Room.Library]: { type: Room.Library, name: 'Library', cost: 150, buildable: true, color: '#6a4ab0', research: 0, desc: 'Warlocks and scholars research dark secrets.' },
  [Room.Workshop]: { type: Room.Workshop, name: 'Workshop', cost: 160, buildable: true, color: '#707a80', research: 500, desc: 'Trolls forge doors and traps.' },
  [Room.Prison]: { type: Room.Prison, name: 'Prison', cost: 180, buildable: true, color: '#506070', research: 900, desc: 'Knocked-out heroes are dragged here.' },
  [Room.Torture]: { type: Room.Torture, name: 'Torture Chamber', cost: 250, buildable: true, color: '#8a1a1a', research: 1500, desc: 'Break captive heroes and turn them to your cause.' },
  [Room.Graveyard]: { type: Room.Graveyard, name: 'Graveyard', cost: 220, buildable: true, color: '#4a5a4a', research: 1300, desc: 'Corpses rot here and rise as vampires.' },
  [Room.Temple]: { type: Room.Temple, name: 'Temple', cost: 300, buildable: true, color: '#9a3ab0', research: 2200, desc: 'Worship soothes creatures. Sacrifice for favours.' },
  [Room.GuardPost]: { type: Room.GuardPost, name: 'Guard Post', cost: 40, buildable: true, color: '#9a8a60', research: 300, desc: 'Creatures stand watch here.' },
  [Room.Bridge]: { type: Room.Bridge, name: 'Bridge', cost: 30, buildable: true, color: '#7a5a3a', research: 700, desc: 'Span water and lava.' },
  [Room.Heart]: { type: Room.Heart, name: 'Dungeon Heart', cost: 0, buildable: false, color: '#c01818', research: 0, desc: 'Your life. If it falls, all is lost.' },
  [Room.Portal]: { type: Room.Portal, name: 'Portal', cost: 0, buildable: false, color: '#7a3ac0', research: 0, desc: 'Creatures of the underworld arrive here.' },
  [Room.HeroGate]: { type: Room.HeroGate, name: 'Hero Gate', cost: 0, buildable: false, color: '#4a7ac0', research: 0, desc: 'Do-gooders march forth from here.' },
  [Room.HeroKeep]: { type: Room.HeroKeep, name: 'Hero Keep', cost: 0, buildable: false, color: '#c0c0d8', research: 0, desc: 'The seat of the local lord.' },
};

export const BUILD_ORDER: Room[] = [
  Room.Treasury,
  Room.Lair,
  Room.Hatchery,
  Room.Training,
  Room.Library,
  Room.GuardPost,
  Room.Workshop,
  Room.Bridge,
  Room.Prison,
  Room.Graveyard,
  Room.Torture,
  Room.Temple,
];
