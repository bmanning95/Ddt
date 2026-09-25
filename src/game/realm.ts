// Per-realm rule knobs. The roguelike layer (omens, relics, depth) tweaks these.
export type Objective = 'conquest' | 'siege' | 'plunder';

export interface RealmRules {
  depth: number;
  objective: Objective;
  objectiveTarget: number; // waves to survive / gold to amass
  heartVault: number;
  heartHp: number;
  treasuryMul: number;
  roomCostMul: number;
  bountyMul: number;
  goldDigMul: number;
  wageMul: number;
  heroHpMul: number;
  heroDmgMul: number;
  heroLevelBonus: number;
  firstWave: number; // seconds
  waveInterval: number;
  waveSize: number;
  portalInterval: number;
  maxCreatures: number;
  impCostMul: number;
  minionDmgMul: number;
  minionHpMul: number;
  trainMul: number;
  researchMul: number;
  hungerMul: number;
  startGold: number;
  startImps: number;
}

export function defaultRules(depth: number): RealmRules {
  return {
    depth,
    objective: 'conquest',
    objectiveTarget: 0,
    heartVault: 3500,
    heartHp: 6000 + depth * 500,
    treasuryMul: 1,
    roomCostMul: 1,
    bountyMul: 1,
    goldDigMul: 1,
    wageMul: 1,
    heroHpMul: 1 + depth * 0.09,
    heroDmgMul: 1 + depth * 0.06,
    heroLevelBonus: Math.floor(depth / 2),
    firstWave: Math.max(230, 300 - depth * 10),
    waveInterval: Math.max(110, 190 - depth * 10),
    waveSize: 2 + Math.floor(depth * 0.5),
    portalInterval: 26,
    maxCreatures: 18 + depth * 2,
    impCostMul: 1,
    minionDmgMul: 1,
    minionHpMul: 1,
    trainMul: 1,
    researchMul: 1,
    hungerMul: 1,
    startGold: 2500,
    startImps: 4,
  };
}
