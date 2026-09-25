import { RNG } from '../game/rng';
import { RealmRules, defaultRules, Objective } from '../game/realm';
import { GenOptions } from '../game/mapgen';
import { Keeper } from '../game/keeper';
import { Room } from '../game/defs';

export type NodeType = 'conquest' | 'siege' | 'plunder' | 'elite' | 'shrine' | 'market' | 'boss';

export interface RunNode {
  id: number;
  col: number;
  row: number;
  type: NodeType;
  omens: string[];
  seed: number;
  links: number[];
  name: string;
  done: boolean;
}

export interface RetinueEntry {
  kind: string;
  level: number;
}

export interface RelicDef {
  key: string;
  name: string;
  icon: string;
  desc: string;
  rarity: 1 | 2 | 3;
  curse?: string;
}

export const RELICS: Record<string, RelicDef> = {
  gildedpick: { key: 'gildedpick', name: 'Gilded Pickaxes', icon: '⛏', desc: 'Imps chip 50% more gold with every swing.', rarity: 1 },
  warbanner: { key: 'warbanner', name: 'Banner of Carnage', icon: '⚑', desc: 'Minions train 50% faster.', rarity: 1 },
  grimoire: { key: 'grimoire', name: 'Black Grimoire', icon: '✎', desc: 'Research proceeds 50% faster.', rarity: 1 },
  obsidian: { key: 'obsidian', name: 'Obsidian Heart', icon: '♥', desc: 'Your Dungeon Heart has 50% more vigour.', rarity: 1 },
  impling: { key: 'impling', name: 'Imp Covenant', icon: '☥', desc: 'Begin each realm with 2 extra imps. Imps cost 30% less.', rarity: 1 },
  miser: { key: 'miser', name: "Miser's Ledger", icon: '$', desc: 'Wages cost 30% less. Nobody notices.', rarity: 1 },
  vault: { key: 'vault', name: 'Bottomless Vault', icon: '▣', desc: 'The heart vault holds 3000 more gold; treasuries hold 50% more.', rarity: 1 },
  chalice: { key: 'chalice', name: 'Blood Chalice', icon: '♨', desc: 'Minions hunger 40% more slowly.', rarity: 1 },
  warhorn: { key: 'warhorn', name: 'War Horn of Gorm', icon: '⚔', desc: 'Minions deal 20% more damage.', rarity: 2 },
  ironhide: { key: 'ironhide', name: 'Iron Hide Charm', icon: '⛨', desc: 'Minions have 20% more health.', rarity: 2 },
  tithe: { key: 'tithe', name: 'Tithe of the Fallen', icon: '✠', desc: 'Slain heroes drop 75% more gold.', rarity: 1 },
  mason: { key: 'mason', name: 'Master Mason', icon: '▦', desc: 'Rooms cost 25% less to build.', rarity: 1 },
  lure: { key: 'lure', name: 'Infernal Lure', icon: '☊', desc: 'The portal calls 35% faster. +4 minion capacity.', rarity: 2 },
  hourglass: { key: 'hourglass', name: 'Hourglass of Dread', icon: '⧗', desc: 'Invasions arrive 25% less often.', rarity: 2 },
  crown: { key: 'crown', name: 'Crown of Thorns', icon: '♛', desc: 'Two more minions may follow you between realms.', rarity: 2 },
  plague: { key: 'plague', name: 'Plague Idol', icon: '☣', desc: 'Heroes arrive with 15% less health.', rarity: 2 },
  seer: { key: 'seer', name: 'Scrying Orb', icon: '◉', desc: 'Each realm begins fully mapped.', rarity: 2 },
  scythe: { key: 'scythe', name: 'Shard of the Reaper', icon: '☠', desc: 'A Horned Reaper answers your call in each realm.', rarity: 3 },
  pact: { key: 'pact', name: 'Blood Pact', icon: '⛧', desc: '+2500 gold at the start of every realm.', rarity: 2, curse: 'Your heart has 25% less vigour.' },
  gluttony: { key: 'gluttony', name: 'Feast of Gluttony', icon: '⚱', desc: 'Minions have 35% more health.', rarity: 3, curse: 'They hunger twice as fast.' },
  frenzy: { key: 'frenzy', name: 'Frenzy Totem', icon: '⚡', desc: 'Minions deal 35% more damage.', rarity: 3, curse: 'Invasions arrive 20% more often.' },
  greed: { key: 'greed', name: 'Idol of Greed', icon: '⛁', desc: 'Imps mine double gold.', rarity: 3, curse: 'Minions demand 40% higher wages.' },
};

export interface OmenDef {
  key: string;
  name: string;
  desc: string;
  good: boolean;
}

export const OMENS: Record<string, OmenDef> = {
  rich: { key: 'rich', name: 'Rich Veins', desc: 'Gold runs thick in the rock.', good: true },
  caverns: { key: 'caverns', name: 'Hollow Earth', desc: 'Many caves, lairs and forgotten caches.', good: true },
  twinportal: { key: 'twinportal', name: 'Twin Portals', desc: 'A second portal lies deeper within.', good: true },
  haunted: { key: 'haunted', name: 'Haunted Ground', desc: 'Restless skeletons rise to serve you.', good: true },
  flooded: { key: 'flooded', name: 'Flooded Depths', desc: 'Underground rivers slow your minions.', good: false },
  volcanic: { key: 'volcanic', name: 'Volcanic', desc: 'Rivers of lava split the realm.', good: false },
  bloodmoon: { key: 'bloodmoon', name: 'Blood Moon', desc: 'Heroes strike 25% harder.', good: false },
  swarm: { key: 'swarm', name: 'Crusade', desc: 'Invasions are larger and more frequent.', good: false },
  famine: { key: 'famine', name: 'Famine', desc: 'Minions hunger 50% faster.', good: false },
  bedrock: { key: 'bedrock', name: 'Bedrock', desc: 'Impenetrable stone chokes the realm.', good: false },
  blessed: { key: 'blessed', name: 'Blessed Land', desc: 'Heroes have 20% more health.', good: false },
};

const NAME_A = ['Sunny', 'Honey', 'Merry', 'Bright', 'Golden', 'Dewy', 'Rosy', 'Gentle', 'Butter', 'Clover', 'Daisy', 'Lark', 'Apple', 'Sweet', 'Bramble', 'Kitten', 'Fair', 'Primrose', 'Candle', 'Dimple'];
const NAME_B = ['vale', 'dale', 'meadow', 'brook', 'glen', 'shire', 'wick', 'ford', 'haven', 'mere', 'hollow', 'bury', 'field', 'cott', 'ton', 'dell'];

export const TYPE_INFO: Record<NodeType, { icon: string; name: string; desc: string }> = {
  conquest: { icon: '⚔', name: 'Conquest', desc: 'Slay the local Lord in his keep.' },
  siege: { icon: '⛨', name: 'Siege', desc: 'Survive wave after wave of invaders.' },
  plunder: { icon: '$', name: 'Plunder', desc: 'Hoard a fortune in gold.' },
  elite: { icon: '☠', name: 'Elite Realm', desc: 'A mighty Lord, a cursed land. Rich rewards.' },
  shrine: { icon: '⛧', name: 'Dark Shrine', desc: 'Commune with the pit. Claim a relic.' },
  market: { icon: '⚖', name: 'Black Market', desc: 'Trade souls for relics and servants.' },
  boss: { icon: '♔', name: 'The Shining Realm', desc: 'The Avatar awaits. End this.' },
};

export const COLS = 8;

export class Run {
  seed: number;
  rng: RNG;
  nodes: RunNode[] = [];
  current = -1;
  relics: string[] = [];
  retinue: RetinueEntry[] = [];
  souls = 0;
  unlockedRooms: number[] = [];
  unlockedSpells: string[] = [];
  researchIdx = 0;
  research = 0;
  stats = { realms: 0, heroesSlain: 0, goldMined: 0, minionsLost: 0, dug: 0, time: 0 };
  over = false;
  victory = false;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.generate();
  }

  static load(data: any): Run {
    const r = new Run(data.seed);
    Object.assign(r, data);
    r.rng = new RNG(data.seed + data.stats.realms * 7919 + r.nodes.filter((n) => n.done).length);
    return r;
  }

  toJSON() {
    const { rng, ...rest } = this;
    void rng;
    return rest;
  }

  realmName(): string {
    return this.rng.pick(NAME_A) + this.rng.pick(NAME_B);
  }

  generate() {
    const rng = this.rng;
    this.nodes = [];
    let id = 0;
    const cols: RunNode[][] = [];
    for (let c = 0; c < COLS; c++) {
      const n = c === 0 ? 2 : c === COLS - 1 ? 1 : rng.int(2, 4);
      const col: RunNode[] = [];
      for (let r = 0; r < n; r++) {
        let type: NodeType;
        if (c === COLS - 1) type = 'boss';
        else if (c === 0) type = 'conquest';
        else if (c === COLS - 2) type = rng.weighted([
            ['shrine', 2],
            ['market', 2],
            ['conquest', 1],
          ]);
        else
          type = rng.weighted([
            ['conquest', 5],
            ['siege', 3],
            ['plunder', 2],
            ['elite', c >= 2 ? 2 : 0],
            ['shrine', c >= 2 ? 1.5 : 0.5],
            ['market', c >= 2 ? 1.5 : 0],
          ]);
        const node: RunNode = { id: id++, col: c, row: r, type, omens: [], seed: rng.int(1, 1e9), links: [], name: this.realmName(), done: false };
        // omens
        if (type !== 'shrine' && type !== 'market') {
          const good = Object.values(OMENS).filter((o) => o.good);
          const bad = Object.values(OMENS).filter((o) => !o.good);
          if (c >= 1 && rng.chance(0.55)) node.omens.push(rng.pick(bad).key);
          if (rng.chance(0.45)) node.omens.push(rng.pick(good).key);
          if (type === 'elite' || type === 'boss') {
            node.omens.push('bloodmoon');
            if (type === 'boss') node.omens.push('blessed');
          }
          node.omens = [...new Set(node.omens)];
        }
        if (type === 'boss') node.name = 'Shiningspire';
        col.push(node);
        this.nodes.push(node);
      }
      cols.push(col);
    }
    // links: each node links to 1-2 nodes in the next column, keeping paths roughly lane-aligned
    for (let c = 0; c < COLS - 1; c++) {
      const a = cols[c],
        b = cols[c + 1];
      for (const n of a) {
        const pos = a.length === 1 ? 0.5 : n.row / (a.length - 1);
        const target = Math.round(pos * (b.length - 1));
        n.links.push(b[target].id);
        if (rng.chance(0.5)) {
          const alt = Math.max(0, Math.min(b.length - 1, target + (rng.chance(0.5) ? 1 : -1)));
          if (!n.links.includes(b[alt].id)) n.links.push(b[alt].id);
        }
      }
      // ensure every node in b is reachable
      for (const m of b) {
        if (!a.some((n) => n.links.includes(m.id))) {
          const pos = b.length === 1 ? 0.5 : m.row / (b.length - 1);
          const src = a[Math.round(pos * (a.length - 1))];
          src.links.push(m.id);
        }
      }
    }
  }

  available(): RunNode[] {
    if (this.current < 0) return this.nodes.filter((n) => n.col === 0);
    const cur = this.nodes[this.current];
    return cur.links.map((id) => this.nodes[id]);
  }

  retinueSize() {
    return 3 + (this.relics.includes('crown') ? 2 : 0) + Math.floor(this.stats.realms / 3);
  }

  offerRelics(n: number, maxRarity = 3): RelicDef[] {
    const pool = Object.values(RELICS).filter((r) => !this.relics.includes(r.key) && r.rarity <= maxRarity);
    this.rng.shuffle(pool);
    // weight towards common relics
    pool.sort((a, b) => a.rarity + this.rng.next() * 1.6 - (b.rarity + this.rng.next() * 1.6));
    return pool.slice(0, n);
  }
}

// Turn a run node into the knobs for a realm.
export function buildRealmConfig(run: Run, node: RunNode): { gen: GenOptions; rules: RealmRules; keeper: Keeper; objective: Objective } {
  const depth = node.col;
  const rules = defaultRules(depth);
  const gen: GenOptions = {
    seed: node.seed,
    w: 64,
    h: 64,
    depth,
    goldMul: 1,
    water: 1,
    lava: depth >= 3 ? 1 : 0,
    rockiness: 0.5,
    caves: 9 + Math.floor(depth / 2),
    portals: 1,
    heroBase: true,
  };
  let objective: Objective = 'conquest';
  if (node.type === 'siege') {
    objective = 'siege';
    rules.objectiveTarget = 4 + Math.floor(depth / 2);
    rules.firstWave *= 0.8;
    rules.waveInterval *= 0.8;
  } else if (node.type === 'plunder') {
    objective = 'plunder';
    rules.objectiveTarget = 8000 + depth * 3000;
    gen.goldMul = 1.4;
  } else if (node.type === 'elite') {
    rules.heroHpMul *= 1.25;
    rules.heroLevelBonus += 2;
  } else if (node.type === 'boss') {
    rules.heroHpMul *= 1.1;
    rules.heroLevelBonus += 2;
    rules.depth = 7;
    gen.depth = 7;
  }
  rules.objective = objective;

  for (const o of node.omens) {
    switch (o) {
      case 'rich':
        gen.goldMul *= 1.6;
        break;
      case 'caverns':
        gen.caves += 6;
        break;
      case 'twinportal':
        gen.portals = 2;
        break;
      case 'flooded':
        gen.water += 2;
        break;
      case 'volcanic':
        gen.lava += 2;
        break;
      case 'bloodmoon':
        rules.heroDmgMul *= 1.25;
        break;
      case 'swarm':
        rules.waveSize += 2;
        rules.waveInterval *= 0.8;
        break;
      case 'famine':
        rules.hungerMul *= 1.5;
        break;
      case 'bedrock':
        gen.rockiness = 1;
        break;
      case 'blessed':
        rules.heroHpMul *= 1.2;
        break;
    }
  }

  const has = (k: string) => run.relics.includes(k);
  if (has('obsidian')) rules.heartHp *= 1.5;
  if (has('pact')) {
    rules.startGold += 2500;
    rules.heartHp *= 0.75;
  }
  if (has('impling')) {
    rules.startImps += 2;
    rules.impCostMul *= 0.7;
  }
  if (has('miser')) rules.wageMul *= 0.7;
  if (has('greed')) {
    rules.goldDigMul *= 2;
    rules.wageMul *= 1.4;
  }
  if (has('vault')) {
    rules.heartVault += 3000;
    rules.treasuryMul *= 1.5;
  }
  if (has('chalice')) rules.hungerMul *= 0.6;
  if (has('gluttony')) {
    rules.minionHpMul *= 1.35;
    rules.hungerMul *= 2;
  }
  if (has('warhorn')) rules.minionDmgMul *= 1.2;
  if (has('frenzy')) {
    rules.minionDmgMul *= 1.35;
    rules.waveInterval *= 0.8;
  }
  if (has('ironhide')) rules.minionHpMul *= 1.2;
  if (has('tithe')) rules.bountyMul *= 1.75;
  if (has('mason')) rules.roomCostMul *= 0.75;
  if (has('lure')) {
    rules.portalInterval *= 0.65;
    rules.maxCreatures += 4;
  }
  if (has('hourglass')) rules.waveInterval *= 1.25;
  if (has('plague')) rules.heroHpMul *= 0.85;
  if (has('warbanner')) rules.trainMul *= 1.5;
  if (has('grimoire')) rules.researchMul *= 1.5;

  rules.heartHp = Math.round(rules.heartHp);
  const keeper = new Keeper();
  keeper.gold = rules.startGold;
  keeper.relics = [...run.relics];
  for (const r of run.unlockedRooms) keeper.rooms.add(r as Room);
  for (const s of run.unlockedSpells) keeper.spells.add(s);
  keeper.researchIdx = run.researchIdx;
  keeper.research = run.research;
  return { gen, rules, keeper, objective };
}
