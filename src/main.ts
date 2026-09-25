import '@fontsource/vt323';
import '@fontsource/unifrakturcook/700.css';
import './style.css';
import { App } from './app';
import { Game } from './game/game';
import { generateRealm } from './game/mapgen';
import { defaultRules } from './game/realm';
import { Keeper } from './game/keeper';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e6));
const rules = defaultRules(0);
const layout = generateRealm({ seed, w: 64, h: 64, depth: 0, goldMul: 1, water: 1, lava: 1, rockiness: 0.5, caves: 10, portals: 1, heroBase: true });
const keeper = new Keeper();
keeper.gold = rules.startGold;
const game = new Game(layout, rules, keeper, seed);
game.director.populate([]);
app.loadRealm(game, 'The Mire of Woe');

(window as any).__app = app;
(window as any).__game = game;

// ---- debug helpers (used for automated screenshots) ----
(window as any).__dbg = {
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
  revealAll() {
    const m = app.game!.map;
    for (let i = 0; i < m.revealed.length; i++) { m.revealed[i] = 1; }
    app.terrain!.markAll();
  },
};
(window as any).__dbg.tunnel = (x0: number, z0: number, x1: number, z1: number, w = 1) => {
  const g = app.game!;
  let x = x0, z = z0;
  const tag = (cx: number, cz: number) => { for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) g.tagDig(cx + a, cz + b, true); };
  while (x !== x1) { x += Math.sign(x1 - x); tag(x, z); }
  while (z !== z1) { z += Math.sign(z1 - z); tag(x, z); }
};
(window as any).__dbg.scenario = (minutes = 4) => {
  const g = app.game!;
  const d = (window as any).__dbg;
  const [hx, hz] = g.heartCenter();
  const x = Math.floor(hx), z = Math.floor(hz);
  const p = g.layout.portals[0];
  d.tunnel(x, z, p.x, p.z, 2);
  // carve room space around the heart
  d.tagRect(x - 8, z - 3, x - 4, z + 3);
  d.tagRect(x + 4, z - 3, x + 8, z + 3);
  d.tagRect(x - 3, z - 8, x + 3, z - 4);
  d.tagRect(x - 3, z + 4, x + 3, z + 8);
  const steps = minutes * 4;
  for (let k = 0; k < steps; k++) {
    d.run(15);
    g.keeper.gold = Math.max(g.keeper.gold, 4000);
    d.build(3, x - 8, z - 3, x - 5, z + 3);
    d.build(4, x + 4, z - 3, x + 8, z + 3);
    d.build(5, x - 3, z - 8, x + 3, z - 5);
    d.build(6, x - 3, z + 5, x + 3, z + 8);
  }
  return { dug: g.stats.dug, claimed: g.stats.claimed, creatures: g.creatures.filter((c) => c.alive).map((c) => c.kind + ':' + c.state).join(' ') };
};
