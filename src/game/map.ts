import { Tile, Room, isSolid, NEUTRAL } from './defs';

export interface LightSource {
  x: number; // world coords (tile units)
  z: number;
  y: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  flicker: number; // 0..1 how much it flickers
}

// Tile grid for one realm. Pure data + change notifications.
export class GameMap {
  readonly w: number;
  readonly h: number;
  readonly tile: Uint8Array;
  readonly owner: Uint8Array;
  readonly room: Uint8Array;
  readonly roomId: Int32Array;
  readonly hp: Float32Array; // dig / claim / fortify progress
  readonly gold: Int32Array; // gold in seams, or loose gold on floors
  readonly revealed: Uint8Array;
  readonly tagged: Uint8Array; // dig designations by player
  readonly variant: Uint8Array; // random per-tile visual variant
  readonly torch: Uint8Array; // bitmask of wall faces with torches (N=1,E=2,S=4,W=8)

  private listeners: ((x: number, z: number) => void)[] = [];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.tile = new Uint8Array(n);
    this.owner = new Uint8Array(n);
    this.room = new Uint8Array(n);
    this.roomId = new Int32Array(n).fill(-1);
    this.hp = new Float32Array(n);
    this.gold = new Int32Array(n);
    this.revealed = new Uint8Array(n);
    this.tagged = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.torch = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.variant[i] = (Math.random() * 256) | 0;
  }

  idx(x: number, z: number): number {
    return z * this.w + x;
  }
  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.w && z < this.h;
  }
  get(x: number, z: number): Tile {
    if (!this.inBounds(x, z)) return Tile.Rock;
    return this.tile[z * this.w + x];
  }
  solid(x: number, z: number): boolean {
    return isSolid(this.get(x, z));
  }
  ownerAt(x: number, z: number): number {
    if (!this.inBounds(x, z)) return NEUTRAL;
    return this.owner[z * this.w + x];
  }
  roomAt(x: number, z: number): Room {
    if (!this.inBounds(x, z)) return Room.None;
    return this.room[z * this.w + x];
  }

  onChange(fn: (x: number, z: number) => void) {
    this.listeners.push(fn);
  }
  touch(x: number, z: number) {
    for (const l of this.listeners) l(x, z);
  }

  set(x: number, z: number, t: Tile, owner = this.ownerAt(x, z), notify = true) {
    if (!this.inBounds(x, z)) return;
    const i = this.idx(x, z);
    this.tile[i] = t;
    this.owner[i] = owner;
    if (isSolid(t)) {
      this.room[i] = Room.None;
      this.roomId[i] = -1;
    }
    if (notify) this.touch(x, z);
  }

  setRoom(x: number, z: number, r: Room, owner: number, notify = true) {
    const i = this.idx(x, z);
    this.tile[i] = Tile.Floor;
    this.owner[i] = owner;
    this.room[i] = r;
    if (notify) this.touch(x, z);
  }

  walkable(x: number, z: number): boolean {
    const t = this.get(x, z);
    return !isSolid(t);
  }

  forNeighbors4(x: number, z: number, fn: (nx: number, nz: number, dir: number) => void) {
    if (z > 0) fn(x, z - 1, 0);
    if (x < this.w - 1) fn(x + 1, z, 1);
    if (z < this.h - 1) fn(x, z + 1, 2);
    if (x > 0) fn(x - 1, z, 3);
  }
}

export const DIR4: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const DIR8: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];
