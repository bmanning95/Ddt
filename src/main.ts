import '@fontsource/vt323';
import '@fontsource/unifrakturcook/700.css';
import './style.css';
import { App } from './app';
import { Game } from './game/game';
import { generateRealm } from './game/mapgen';
import { PLAYER } from './game/defs';
import { Run, RunNode, buildRealmConfig, RetinueEntry } from './run/run';
import { makeDemo } from './run/demo';
import { Screens, loadOptions, Options, SAVE_KEY, BEST_KEY } from './ui/screens';
import { shared } from './render/ps1';
import { KEEPER_ROSTER, CREATURES } from './game/creatures';
import { place as placeTrap, canPlace as canPlaceTrap } from './game/traps';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
const screens = new Screens(ui, app.sfx);
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ options
const options = loadOptions();
function applyOptions(o: Options) {
  app.sfx.setVolume(o.volume);
  if (app.sfx.musicOn !== o.music) app.sfx.toggleMusic();
  app.sfx.musicOn = o.music;
  app.edgeScroll = o.edgeScroll;
  app.pipe.targetHeight = o.resolution;
  app.pipe.postMat.uniforms.uDither.value = o.dither ? 1 : 0;
  shared.uAffine.value = o.affine;
  app.resize();
}
applyOptions(options);

// ------------------------------------------------------------------ persistence
function saveRun(run: Run | null) {
  try {
    if (run && !run.over) localStorage.setItem(SAVE_KEY, JSON.stringify(run));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}
function loadRun(): Run | null {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? Run.load(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}
function bestText(): string {
  try {
    const b = localStorage.getItem(BEST_KEY);
    if (!b) return '';
    const o = JSON.parse(b);
    return o.victory ? `Best: conquered Shiningspire (${o.realms} realms)` : `Best run: ${o.realms} realms conquered, ${o.heroes} heroes slain`;
  } catch {
    return '';
  }
}
function recordBest(run: Run) {
  try {
    const b = localStorage.getItem(BEST_KEY);
    const o = b ? JSON.parse(b) : null;
    if (!o || run.victory || run.stats.realms > o.realms) localStorage.setItem(BEST_KEY, JSON.stringify({ realms: run.stats.realms, heroes: run.stats.heroesSlain, victory: run.victory }));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ flow
let run: Run | null = loadRun();

function showBackdrop() {
  if (app.demo && app.game) return;
  app.loadRealm(makeDemo(Math.floor(Math.random() * 1e6)), 'demo', true);
}

async function titleLoop() {
  for (;;) {
    showBackdrop();
    app.overlayOpen = true;
    const a = await screens.title(!!run, bestText());
    if (a === 'new') {
      run = new Run(Math.floor(Math.random() * 1e9));
      saveRun(run);
      await runLoop();
    } else if (a === 'continue') await runLoop();
    else if (a === 'howto') await screens.howto();
    else if (a === 'options') await screens.options(options, applyOptions);
  }
}

async function runLoop() {
  while (run && !run.over) {
    showBackdrop();
    app.overlayOpen = true;
    const choice = await screens.map(run);
    if (choice === 'menu') return;
    if (choice === 'abandon') {
      run.over = true;
      recordBest(run);
      saveRun(null);
      run = null;
      return;
    }
    const node = choice;
    if (node.type === 'shrine') {
      const offers = run.offerRelics(2, 2);
      const cursed = run.offerRelics(6, 3).find((r) => r.curse && !offers.includes(r));
      if (cursed) offers.push(cursed);
      const k = await screens.relicChoice('Dark Shrine', 'Blood drips upward from the altar. Take one gift.', offers);
      if (k) run.relics.push(k);
      completeNode(node);
      continue;
    }
    if (node.type === 'market') {
      const creatures: RetinueEntry[] = [];
      const pool = KEEPER_ROSTER.filter((k) => CREATURES[k].hp >= 150);
      for (let i = 0; i < 3; i++) creatures.push({ kind: run.rng.pick(pool), level: 2 + run.rng.int(0, 2) + Math.floor(node.col / 2) });
      await screens.market(run, { relics: run.offerRelics(3, 3), creatures });
      completeNode(node);
      continue;
    }
    const result = await playRealm(node);
    if (result === 'quit') return;
    if (result === 'abandon') {
      run.over = true;
      recordBest(run);
      saveRun(null);
      run = null;
      return;
    }
    const g = result.game;
    run.stats.heroesSlain += g.stats.heroesSlain;
    run.stats.goldMined += g.stats.goldMined;
    run.stats.minionsLost += g.stats.minionsLost;
    run.stats.dug += g.stats.dug;
    run.stats.time += g.time;
    // research carries over between realms
    run.unlockedRooms = [...g.keeper.rooms];
    run.unlockedSpells = [...g.keeper.spells];
    run.researchIdx = g.keeper.researchIdx;
    run.research = g.keeper.research;
    if (!result.win) {
      app.sfx.play('defeat');
      run.over = true;
      recordBest(run);
      saveRun(null);
      app.overlayOpen = true;
      const a = await screens.gameOver(run, false);
      run = a === 'new' ? new Run(Math.floor(Math.random() * 1e9)) : null;
      saveRun(run);
      if (!run) return;
      continue;
    }
    app.sfx.play('victory');
    run.stats.realms++;
    const souls = g.stats.souls + 8 + node.col * 2 + (node.type === 'elite' ? 12 : 0);
    run.souls += souls;
    app.overlayOpen = true;
    await screens.realmVictory(run, node.name, { heroes: g.stats.heroesSlain, gold: g.stats.goldMined, souls, time: g.time, lost: g.stats.minionsLost });
    if (node.type === 'boss') {
      run.victory = true;
      run.over = true;
      completeNode(node);
      recordBest(run);
      saveRun(null);
      const a = await screens.gameOver(run, true);
      run = a === 'new' ? new Run(Math.floor(Math.random() * 1e9)) : null;
      saveRun(run);
      if (!run) return;
      continue;
    }
    const offers = run.offerRelics(3, node.type === 'elite' ? 3 : 2);
    const k = await screens.relicChoice('Spoils of Conquest', 'Choose a relic from the fallen lord’s hoard.', offers);
    if (k) run.relics.push(k);
    const survivors: RetinueEntry[] = g.creatures.filter((c) => c.alive && c.owner === PLAYER && !c.isImp && c.kind !== 'chicken').map((c) => ({ kind: c.kind, level: c.level }));
    run.retinue = await screens.retinue(run.retinueSize(), survivors);
    completeNode(node);
  }
}

function completeNode(node: RunNode) {
  if (!run) return;
  node.done = true;
  run.current = node.id;
  saveRun(run);
}

function objectiveText(g: Game): string {
  const r = g.rules;
  if (r.objective === 'siege') return `Survive ${r.objectiveTarget} invasions.`;
  if (r.objective === 'plunder') return `Amass ${r.objectiveTarget.toLocaleString()} gold in your coffers.`;
  const n = g.director.wave.lord?.def.name ?? 'Lord';
  return `Slay ${n.startsWith('The') ? n : 'the ' + n} in his keep.`;
}

function startRealm(r: Run, node: RunNode): Game {
  const cfg = buildRealmConfig(r, node);
  const layout = generateRealm(cfg.gen);
  const g = new Game(layout, cfg.rules, cfg.keeper, node.seed);
  g.director.populate(r.retinue);
  const [hx, hz] = g.heartCenter();
  if (r.relics.includes('seer')) {
    g.map.revealed.fill(1);
  }
  if (r.relics.includes('scythe')) {
    const c = g.spawn('reaper', PLAYER, hx + 2.5, hz, 2);
    c.retinue = true;
  }
  if (node.omens.includes('haunted')) {
    for (let k = 0; k < 2; k++) g.spawn('skeleton', PLAYER, hx - 2.5, hz + (k ? 1 : -1), 2 + node.col / 2);
  }
  return g;
}

function playRealm(node: RunNode): Promise<'quit' | 'abandon' | { win: boolean; game: Game }> {
  return new Promise((resolve) => {
    const r = run!;
    const g = startRealm(r, node);
    app.loadRealm(g, node.name);
    app.overlayOpen = true;
    screens.realmIntro(node, objectiveText(g)).then(() => {
      app.overlayOpen = false;
      app.sfx.play('horn');
    });
    app.onRealmEnd = (win, game) => {
      app.onRealmEnd = null;
      app.onMenu = null;
      resolve({ win, game });
    };
    app.onMenu = async () => {
      if (app.overlayOpen) return;
      app.overlayOpen = true;
      for (;;) {
        const a = await screens.pause();
        if (a === 'resume') break;
        if (a === 'howto') {
          await screens.howto();
          continue;
        }
        if (a === 'options') {
          await screens.options(options, applyOptions);
          continue;
        }
        screens.close();
        app.onRealmEnd = null;
        app.onMenu = null;
        resolve(a === 'abandon' ? 'abandon' : 'quit');
        return;
      }
      screens.close();
      app.overlayOpen = false;
    };
  });
}

// ------------------------------------------------------------------ boot
if (params.has('play')) {
  // skip menus: straight into a realm (dev / screenshots)
  run = new Run(Number(params.get('seed') ?? 1234));
  const node = run.available()[0];
  const g = startRealm(run, node);
  app.loadRealm(g, node.name);
  (window as any).__game = g;
} else {
  titleLoop();
}

(window as any).__app = app;
(window as any).__screens = screens;
(window as any).__run = () => run;

// ---- debug helpers (used for automated screenshots) ----
const dbg = {
  get g() {
    return app.game!;
  },
  run(seconds: number) {
    const g = app.game!;
    const steps = Math.floor(seconds * 30);
    for (let i = 0; i < steps; i++) g.update(1 / 30);
  },
  tagRect(x0: number, z0: number, x1: number, z1: number) {
    const g = app.game!;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g.tagDig(x, z, true);
  },
  build(room: number, x0: number, z0: number, x1: number, z1: number) {
    const g = app.game!;
    let n = 0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (g.build(x, z, room)) n++;
    return n;
  },
  look(x: number, z: number, dist = 10, yaw = 0) {
    app.cam.jumpTo(x, z);
    app.cam.dist = app.cam.distGoal = dist;
    app.cam.yaw = app.cam.yawGoal = yaw;
  },
  heart() {
    return app.game!.heartCenter();
  },
  place(key: string, x: number, z: number) {
    const g = app.game!;
    g.keeper.inventory[key] = (g.keeper.inventory[key] ?? 0) + 1;
    return canPlaceTrap(g, key, x, z) ?? placeTrap(g, key, x, z);
  },
  revealAll() {
    const m = app.game!.map;
    m.revealed.fill(1);
    app.terrain!.markAll();
  },
  tunnel(x0: number, z0: number, x1: number, z1: number, w = 1) {
    const g = app.game!;
    let x = x0,
      z = z0;
    const tag = (cx: number, cz: number) => {
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) g.tagDig(cx + a, cz + b, true);
    };
    while (x !== x1) {
      x += Math.sign(x1 - x);
      tag(x, z);
    }
    while (z !== z1) {
      z += Math.sign(z1 - z);
      tag(x, z);
    }
  },
  scenario(minutes = 4) {
    const g = app.game!;
    const [hx, hz] = g.heartCenter();
    const x = Math.floor(hx),
      z = Math.floor(hz);
    const p = g.layout.portals[0];
    dbg.tunnel(x, z, p.x, p.z, 2);
    dbg.tagRect(x - 8, z - 3, x - 4, z + 3);
    dbg.tagRect(x + 4, z - 3, x + 8, z + 3);
    dbg.tagRect(x - 3, z - 8, x + 3, z - 4);
    dbg.tagRect(x - 3, z + 4, x + 3, z + 8);
    const steps = minutes * 4;
    for (let k = 0; k < steps; k++) {
      dbg.run(15);
      g.keeper.gold = Math.max(g.keeper.gold, 4000);
      dbg.build(3, x - 8, z - 3, x - 5, z + 3);
      dbg.build(4, x + 4, z - 3, x + 8, z + 3);
      dbg.build(5, x - 3, z - 8, x + 3, z - 5);
      dbg.build(6, x - 3, z + 5, x + 3, z + 8);
    }
    return { dug: g.stats.dug, claimed: g.stats.claimed, creatures: g.creatures.filter((c) => c.alive).map((c) => c.kind + ':' + c.state).join(' ') };
  },
};
(window as any).__dbg = dbg;
