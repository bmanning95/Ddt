import { Room } from './defs';

export type Job = 'train' | 'research' | 'manufacture' | 'guard';
export type RangedKind = 'fireball' | 'arrow' | 'bolt' | 'breath' | 'drain' | 'heal' | 'gas' | 'web';

export interface RangedDef {
  kind: RangedKind;
  dmg: number;
  range: number;
  rate: number; // seconds between shots
  speed: number; // projectile speed tiles/sec
  splash?: number;
}

export interface CreatureDef {
  key: string;
  name: string;
  hero: boolean;
  hp: number;
  speed: number; // tiles / second
  dmg: number;
  armor: number;
  attackRate: number;
  ranged?: RangedDef;
  wage: number;
  hungerTime: number; // seconds until hungry
  awakeTime: number; // seconds until sleepy
  jobs: Job[];
  research: number;
  manufacture: number;
  scale: number;
  attract?: { rooms: [Room, number][]; weight: number };
  flying?: boolean;
  fireImmune?: boolean;
  digger?: number; // dig power multiplier
  healer?: boolean;
  boss?: boolean;
  desc: string;
  souls: number; // meta-currency when slain (heroes)
  bounty: number; // gold dropped (heroes)
}

const K = (d: Partial<CreatureDef> & Pick<CreatureDef, 'key' | 'name' | 'hp' | 'dmg' | 'desc'>): CreatureDef => ({
  hero: false,
  speed: 2,
  armor: 0,
  attackRate: 1.1,
  wage: 50,
  hungerTime: 150,
  awakeTime: 220,
  jobs: ['train'],
  research: 0,
  manufacture: 0,
  scale: 1,
  souls: 0,
  bounty: 0,
  ...d,
});

export const CREATURES: Record<string, CreatureDef> = {
  imp: K({ key: 'imp', name: 'Imp', hp: 80, dmg: 5, speed: 2.7, wage: 0, jobs: [], scale: 0.62, digger: 1, desc: 'Tireless diggers. They tunnel, claim and fortify.' }),
  beetle: K({ key: 'beetle', name: 'Beetle', hp: 190, dmg: 9, armor: 5, speed: 1.7, wage: 30, scale: 0.75, attract: { rooms: [[Room.Lair, 1]], weight: 3 }, desc: 'Cheap armoured vermin. Loyal fodder.' }),
  fly: K({ key: 'fly', name: 'Fly', hp: 70, dmg: 5, speed: 3.4, wage: 20, scale: 0.6, flying: true, attract: { rooms: [[Room.Lair, 1]], weight: 3 }, desc: 'Fast scouts that see much and fight little.' }),
  goblin: K({ key: 'goblin', name: 'Goblin', hp: 230, dmg: 14, armor: 2, speed: 2.1, wage: 60, scale: 0.85, attract: { rooms: [[Room.Lair, 4]], weight: 4 }, desc: 'Vicious little brawlers. Love to train.' }),
  warlock: K({
    key: 'warlock',
    name: 'Warlock',
    hp: 170,
    dmg: 6,
    speed: 1.8,
    wage: 110,
    jobs: ['research', 'train'],
    research: 1.2,
    scale: 0.95,
    ranged: { kind: 'fireball', dmg: 26, range: 5.5, rate: 2.2, speed: 7, splash: 0.9 },
    attract: { rooms: [[Room.Library, 6]], weight: 3 },
    desc: 'Scholars of forbidden lore. Hurl fire.',
  }),
  spider: K({ key: 'spider', name: 'Spider', hp: 240, dmg: 16, armor: 3, speed: 2.3, wage: 80, scale: 0.9, ranged: { kind: 'web', dmg: 6, range: 4, rate: 4, speed: 6 }, attract: { rooms: [[Room.Hatchery, 9]], weight: 2 }, desc: 'Weaves webs that slow the enemy.' }),
  troll: K({
    key: 'troll',
    name: 'Troll',
    hp: 360,
    dmg: 20,
    armor: 6,
    speed: 1.6,
    wage: 110,
    jobs: ['manufacture', 'train'],
    manufacture: 1.2,
    scale: 1.1,
    attract: { rooms: [[Room.Workshop, 6]], weight: 3 },
    desc: 'Hulking craftsmen of the forge.',
  }),
  bile: K({
    key: 'bile',
    name: 'Bile Demon',
    hp: 620,
    dmg: 24,
    armor: 9,
    speed: 1.2,
    wage: 170,
    hungerTime: 90,
    scale: 1.25,
    ranged: { kind: 'gas', dmg: 18, range: 3, rate: 3.5, speed: 3, splash: 1.2 },
    attract: { rooms: [
      [Room.Lair, 12],
      [Room.Hatchery, 9],
    ], weight: 2 },
    desc: 'Gluttonous brutes. Their flatulence is lethal.',
  }),
  mistress: K({ key: 'mistress', name: 'Dark Mistress', hp: 380, dmg: 28, armor: 4, speed: 2.5, wage: 180, scale: 1, attract: { rooms: [[Room.Torture, 4]], weight: 2 }, desc: 'Revels in pain, given and received.' }),
  skeleton: K({ key: 'skeleton', name: 'Skeleton', hp: 280, dmg: 20, armor: 5, speed: 1.9, wage: 40, hungerTime: 99999, awakeTime: 99999, scale: 0.95, desc: 'Risen from those who perished in your prison.' }),
  vampire: K({
    key: 'vampire',
    name: 'Vampire',
    hp: 520,
    dmg: 32,
    armor: 6,
    speed: 2.2,
    wage: 220,
    hungerTime: 99999,
    jobs: ['research', 'train'],
    research: 1,
    scale: 1.05,
    ranged: { kind: 'drain', dmg: 30, range: 4, rate: 3, speed: 8 },
    desc: 'Born of the graveyard. Drains the living.',
  }),
  hound: K({ key: 'hound', name: 'Hellhound', hp: 320, dmg: 22, armor: 3, speed: 3.1, wage: 120, scale: 0.9, fireImmune: true, ranged: { kind: 'breath', dmg: 14, range: 3, rate: 2.5, speed: 6 }, attract: { rooms: [
    [Room.Lair, 6],
    [Room.GuardPost, 4],
  ], weight: 2 }, desc: 'Fire-breathing hunters of the pit.' }),
  dragon: K({
    key: 'dragon',
    name: 'Dragon',
    hp: 820,
    dmg: 36,
    armor: 10,
    speed: 1.7,
    wage: 320,
    scale: 1.45,
    fireImmune: true,
    jobs: ['train', 'research'],
    research: 0.6,
    ranged: { kind: 'breath', dmg: 34, range: 4.5, rate: 2.6, speed: 7, splash: 1 },
    attract: { rooms: [
      [Room.Lair, 16],
      [Room.Treasury, 16],
    ], weight: 1 },
    desc: 'Ancient wyrms. Covet gold above all.',
  }),
  reaper: K({ key: 'reaper', name: 'Horned Reaper', hp: 1400, dmg: 70, armor: 14, speed: 2.4, wage: 500, scale: 1.4, fireImmune: true, attackRate: 0.8, desc: 'Death incarnate. Barely controllable.' }),

  // ---------------- heroes ----------------
  dwarf: K({ key: 'dwarf', name: 'Dwarf', hero: true, hp: 200, dmg: 14, armor: 5, speed: 1.8, digger: 2.2, scale: 0.8, souls: 2, bounty: 60, desc: 'Tunnellers who burrow toward your heart.' }),
  archer: K({ key: 'archer', name: 'Archer', hero: true, hp: 150, dmg: 8, speed: 2.1, scale: 0.95, ranged: { kind: 'arrow', dmg: 16, range: 6, rate: 1.6, speed: 12 }, souls: 2, bounty: 60, desc: 'Keeps its distance and shoots.' }),
  knight: K({ key: 'knight', name: 'Knight', hero: true, hp: 520, dmg: 32, armor: 14, speed: 1.6, scale: 1.05, souls: 5, bounty: 180, desc: 'Plate-clad champion of the realm.' }),
  wizard: K({ key: 'wizard', name: 'Wizard', hero: true, hp: 190, dmg: 6, speed: 1.8, scale: 0.95, ranged: { kind: 'fireball', dmg: 30, range: 6, rate: 2.4, speed: 7, splash: 1 }, souls: 4, bounty: 120, desc: 'Meddling spell-slinger.' }),
  monk: K({ key: 'monk', name: 'Monk', hero: true, hp: 280, dmg: 16, armor: 4, speed: 2, healer: true, scale: 0.95, ranged: { kind: 'heal', dmg: -40, range: 4, rate: 3, speed: 8 }, souls: 3, bounty: 90, desc: 'Heals its fellows. Kill it first.' }),
  barbarian: K({ key: 'barbarian', name: 'Barbarian', hero: true, hp: 420, dmg: 34, armor: 3, speed: 2.2, attackRate: 0.8, scale: 1.05, souls: 4, bounty: 140, desc: 'Frenzied axe-swinger.' }),
  samurai: K({ key: 'samurai', name: 'Samurai', hero: true, hp: 560, dmg: 42, armor: 10, speed: 2.1, scale: 1, souls: 6, bounty: 200, desc: 'A foreign blademaster of terrible skill.' }),
  giant: K({ key: 'giant', name: 'Giant', hero: true, hp: 1100, dmg: 50, armor: 8, speed: 1.3, attackRate: 1.6, scale: 1.6, souls: 8, bounty: 260, desc: 'A lumbering colossus.' }),
  lord: K({ key: 'lord', name: 'Lord of the Land', hero: true, hp: 2600, dmg: 60, armor: 18, speed: 1.7, scale: 1.25, boss: true, souls: 30, bounty: 1500, desc: 'The local tyrant of righteousness. Slay him.' }),
  avatar: K({ key: 'avatar', name: 'The Avatar', hero: true, hp: 7000, dmg: 90, armor: 24, speed: 1.9, scale: 1.6, boss: true, ranged: { kind: 'bolt', dmg: 60, range: 6, rate: 2.5, speed: 10, splash: 1 }, souls: 100, bounty: 5000, desc: 'The shining paragon of all that is good. Your final foe.' }),
  chicken: K({ key: 'chicken', name: 'Chicken', hp: 10, dmg: 0, speed: 1.1, wage: 0, jobs: [], scale: 0.85, desc: 'Food.' }),
};

export const KEEPER_ROSTER = ['beetle', 'fly', 'goblin', 'warlock', 'spider', 'troll', 'bile', 'mistress', 'hound', 'dragon'];
export const HERO_ROSTER = ['dwarf', 'archer', 'knight', 'wizard', 'monk', 'barbarian', 'samurai', 'giant'];

export function levelMult(level: number) {
  return { hp: 1 + 0.22 * (level - 1), dmg: 1 + 0.14 * (level - 1) };
}
export function xpForLevel(level: number) {
  return Math.round(120 * Math.pow(level, 1.45));
}
