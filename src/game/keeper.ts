import { Room, ROOMS, PLAYER } from './defs';
import type { Game } from './game';
import { SPELLS } from './spells';

export interface ResearchItem {
  kind: 'room' | 'spell';
  id: number | string;
  cost: number;
}

export const RESEARCH: ResearchItem[] = [
  { kind: 'room', id: Room.GuardPost, cost: 250 },
  { kind: 'spell', id: 'speed', cost: 350 },
  { kind: 'room', id: Room.Workshop, cost: 450 },
  { kind: 'spell', id: 'heal', cost: 550 },
  { kind: 'room', id: Room.Bridge, cost: 600 },
  { kind: 'spell', id: 'lightning', cost: 800 },
  { kind: 'room', id: Room.Prison, cost: 900 },
  { kind: 'spell', id: 'protect', cost: 1000 },
  { kind: 'room', id: Room.Graveyard, cost: 1200 },
  { kind: 'room', id: Room.Torture, cost: 1400 },
  { kind: 'spell', id: 'cavein', cost: 1500 },
  { kind: 'room', id: Room.Temple, cost: 1800 },
  { kind: 'spell', id: 'chicken', cost: 2000 },
  { kind: 'spell', id: 'hellfire', cost: 2600 },
];

export class Keeper {
  gold = 3000;
  goldCap = 2500;
  rooms = new Set<Room>([Room.Treasury, Room.Lair, Room.Hatchery, Room.Training, Room.Library]);
  spells = new Set<string>(['imp', 'sight', 'cta', 'possess']);
  research = 0;
  researchIdx = 0;
  manufacture = 0;
  paydayT = 200;
  paydayInterval = 200;
  heartHp = 4000;
  heartMax = 4000;
  impsCreated = 0;
  relics: string[] = [];
  owner = PLAYER;
  goldSpent = 0;

  spend(n: number): boolean {
    if (this.gold < n) return false;
    this.gold -= n;
    this.goldSpent += n;
    return true;
  }
  addGold(n: number, _overflow = false) {
    this.gold += Math.round(n);
  }

  hasRelic(k: string) {
    return this.relics.includes(k);
  }

  update(g: Game, dt: number) {
    this.paydayT -= dt;
    if (this.paydayT <= 0) {
      this.paydayT = this.paydayInterval;
      let n = 0;
      for (const c of g.creatures) {
        if (!c.alive || c.owner !== PLAYER || c.def.wage <= 0) continue;
        c.owed += Math.round(c.def.wage * g.rules.wageMul * (1 + (c.level - 1) * 0.15));
        n++;
      }
      if (n) {
        g.msg('Payday! Your minions demand their wages.', '#ffd060');
        g.sfx('payday');
      }
    }
    // research unlocks
    while (this.researchIdx < RESEARCH.length && this.research >= RESEARCH[this.researchIdx].cost) {
      const it = RESEARCH[this.researchIdx++];
      if (it.kind === 'room') {
        this.rooms.add(it.id as Room);
        g.msg(`Research complete: ${ROOMS[it.id as number].name} may now be built.`, '#c8a0ff', true);
      } else {
        this.spells.add(it.id as string);
        g.msg(`Research complete: the ${SPELLS[it.id as string].name} spell.`, '#c8a0ff', true);
      }
      g.sfx('research');
    }
  }

  nextResearch(): ResearchItem | null {
    return RESEARCH[this.researchIdx] ?? null;
  }
}
