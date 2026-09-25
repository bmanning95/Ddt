import { CreatureDef, CREATURES, levelMult } from './creatures';

export type Anim = 'idle' | 'walk' | 'dig' | 'work' | 'attack' | 'cast' | 'sleep' | 'eat' | 'held' | 'fall' | 'dead' | 'train' | 'research' | 'carry' | 'cheer' | 'stunned' | 'pray';

export interface ImpJob {
  type: 'dig' | 'claim' | 'fortify' | 'pickup' | 'deposit' | 'unclaim' | 'wander' | 'carryCorpse' | 'carryCrate';
  target: number; // tile index acted upon
  stand: number; // tile index to stand on
}

let NEXT_ID = 1;

export class Creature {
  id = NEXT_ID++;
  def: CreatureDef;
  kind: string;
  owner: number;
  x: number;
  z: number;
  y = 0;
  vy = 0;
  angle = 0;
  hp: number;
  maxHp: number;
  level = 1;
  xp = 0;

  // needs (0..1+, above 1 means urgent)
  hunger = 0;
  tired = 0;
  anger = 0; // 0..1 ; at 1 they leave
  owed = 0; // unpaid wages
  lair = -1; // bed tile index

  // behaviour
  state = 'idle';
  stateT = 0;
  anim: Anim = 'idle';
  animT = 0;
  path: number[] | null = null;
  pathI = 0;
  goal = -1;
  job: ImpJob | null = null;
  workT = 0;
  carryGold = 0;
  target: Creature | null = null;
  attackCd = 0;
  rangedCd = 0;
  thinkCd = 0;
  slapT = 0;
  speedT = 0; // speed spell
  slowT = 0; // webbed
  stunT = 0;
  shieldT = 0;
  hitFlash = 0;
  alive = true;
  removed = false;
  moving = false;
  rally: { x: number; z: number } | null = null;
  guardTile = -1;
  lastHurtBy: Creature | null = null;
  leaving = false;
  kills = 0;
  campTile = -1; // heroes waiting in a camp
  asleepInCamp = false;
  deathT = 0;
  carriedBy: Creature | null = null;
  carrying: Creature | null = null;
  eatT = 0;
  retinue = false; // came with the keeper from a previous realm
  nameTag = '';
  flags = 0;

  constructor(kind: string, owner: number, x: number, z: number, level = 1) {
    this.kind = kind;
    this.def = CREATURES[kind];
    this.owner = owner;
    this.x = x;
    this.z = z;
    this.level = level;
    this.maxHp = Math.round(this.def.hp * levelMult(level).hp);
    this.hp = this.maxHp;
    this.angle = Math.random() * Math.PI * 2;
    this.hunger = Math.random() * 0.3;
    this.tired = Math.random() * 0.3;
    this.thinkCd = Math.random() * 0.5;
  }

  get tx() {
    return Math.floor(this.x);
  }
  get tz() {
    return Math.floor(this.z);
  }
  get isImp() {
    return this.kind === 'imp';
  }
  get dmg() {
    return this.def.dmg * levelMult(this.level).dmg;
  }
  get speed() {
    let s = this.def.speed;
    if (this.slapT > 0) s *= 1.45;
    if (this.speedT > 0) s *= 1.6;
    if (this.slowT > 0) s *= 0.5;
    return s;
  }

  setLevel(l: number) {
    const frac = this.hp / this.maxHp;
    this.level = Math.min(10, l);
    this.maxHp = Math.round(this.def.hp * levelMult(this.level).hp);
    this.hp = Math.max(1, Math.round(this.maxHp * frac));
  }
}
