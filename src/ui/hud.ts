import type { Game } from '../game/game';
import { ROOMS, BUILD_ORDER, Room, PLAYER, HEROES, Tile, isSolid, NEUTRAL } from '../game/defs';
import { SPELLS, SPELL_ORDER, spellCost } from '../game/spells';
import { CREATURES, KEEPER_ROSTER } from '../game/creatures';
import { layerToCanvas, Tex } from '../render/textures';
import type { Creature } from '../game/entity';
import { TRAPS, unlockedTraps } from '../game/traps';

export interface HudCallbacks {
  onRoom(type: Room): void;
  onSpell(key: string): void;
  onSell(): void;
  onTrap(key: string): void;
  onCraft(key: string): void;
  onPickKind(kind: string): void;
  onJumpKind(kind: string): void;
  onMinimap(x: number, z: number): void;
  onMenu(): void;
  onSpeed(s: number): void;
}

const ROOM_TEX: Partial<Record<Room, Tex>> = {
  [Room.Treasury]: Tex.Treasury,
  [Room.Lair]: Tex.Lair,
  [Room.Hatchery]: Tex.Hatchery,
  [Room.Training]: Tex.Training,
  [Room.Library]: Tex.Library,
  [Room.Workshop]: Tex.Workshop,
  [Room.Prison]: Tex.Prison,
  [Room.Torture]: Tex.Torture,
  [Room.Graveyard]: Tex.Graveyard,
  [Room.Temple]: Tex.Temple,
  [Room.GuardPost]: Tex.GuardPost,
  [Room.Bridge]: Tex.Bridge,
};

const ROOM_GLYPH: Partial<Record<Room, string>> = {
  [Room.Treasury]: '$',
  [Room.Lair]: 'Z',
  [Room.Hatchery]: '♨',
  [Room.Training]: '⚔',
  [Room.Library]: '✎',
  [Room.Workshop]: '⚒',
  [Room.Prison]: '#',
  [Room.Torture]: '✠',
  [Room.Graveyard]: '†',
  [Room.Temple]: '☩',
  [Room.GuardPost]: '⚑',
  [Room.Bridge]: '═',
};

export const OWNER_CSS = ['#aaa', '#e03020', '#5090ff'];

export class Hud {
  el: HTMLElement;
  private goldEl!: HTMLElement;
  private capEl!: HTMLElement;
  private tabBody!: HTMLElement;
  private infoEl!: HTMLElement;
  private msgEl!: HTMLElement;
  private heartBar!: HTMLElement;
  private heartTxt!: HTMLElement;
  private waveEl!: HTMLElement;
  private objEl!: HTMLElement;
  private realmEl!: HTMLElement;
  private tipEl!: HTMLElement;
  private handEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private researchEl!: HTMLElement;
  minimap!: HTMLCanvasElement;
  private mmCtx!: CanvasRenderingContext2D;
  private mmImg!: ImageData;
  tab: 'rooms' | 'spells' | 'forge' | 'minions' = 'rooms';
  private buttons: { el: HTMLElement; kind: 'room' | 'spell' | 'sell' | 'trap'; id: number | string }[] = [];
  private minionRows = new Map<string, HTMLElement>();
  private lastTabSig = '';
  selected: { kind: 'room' | 'spell' | 'sell' | 'trap'; id: number | string } | null = null;

  constructor(parent: HTMLElement, private texData: Uint8Array, private cb: HudCallbacks) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div id="panel" class="ui-block">
        <div class="brand">Underkeep</div>
        <div class="mm-frame"><canvas id="minimap" width="128" height="128"></canvas></div>
        <div class="goldrow"><span class="coin"></span><span id="gold">0</span><span class="cap" id="goldcap"></span></div>
        <div class="research" id="research"></div>
        <div class="tabs">
          <button data-tab="rooms" class="tab on">Rooms</button>
          <button data-tab="spells" class="tab">Spells</button>
          <button data-tab="forge" class="tab">Forge</button>
          <button data-tab="minions" class="tab">Minions</button>
        </div>
        <div id="tabbody"></div>
        <div id="info"></div>
        <div class="panel-foot">
          <button id="btn-menu" class="small">☰ Menu</button>
          <span id="speed"></span>
        </div>
      </div>
      <div id="topbar" class="ui-block">
        <div id="realm"></div>
        <div id="objective"></div>
        <div class="heart"><span class="hlabel">Heart</span><div class="hbar"><div id="heartbar"></div></div><span id="hearttxt"></span></div>
        <div id="wave"></div>
      </div>
      <div id="messages"></div>
      <div id="handbar" class="ui-block"></div>
      <div id="tooltip"></div>
    `;
    parent.appendChild(this.el);
    const $ = (id: string) => this.el.querySelector('#' + id) as HTMLElement;
    this.goldEl = $('gold');
    this.capEl = $('goldcap');
    this.tabBody = $('tabbody');
    this.infoEl = $('info');
    this.msgEl = $('messages');
    this.heartBar = $('heartbar');
    this.heartTxt = $('hearttxt');
    this.waveEl = $('wave');
    this.objEl = $('objective');
    this.realmEl = $('realm');
    this.tipEl = $('tooltip');
    this.handEl = $('handbar');
    this.speedEl = $('speed');
    this.researchEl = $('research');
    this.minimap = $('minimap') as HTMLCanvasElement;
    this.mmCtx = this.minimap.getContext('2d')!;
    this.el.querySelectorAll('.tab').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = (b as HTMLElement).dataset.tab as Hud['tab'];
        this.el.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
        this.lastTabSig = '';
      }),
    );
    $('btn-menu').addEventListener('click', () => cb.onMenu());
    this.speedEl.addEventListener('click', () => cb.onSpeed(-1));
    const mmClick = (e: MouseEvent) => {
      const r = this.minimap.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fz = (e.clientY - r.top) / r.height;
      cb.onMinimap(fx, fz);
    };
    this.minimap.addEventListener('mousedown', (e) => {
      mmClick(e);
      const mv = (ev: MouseEvent) => mmClick(ev);
      const up = () => {
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });
  }

  show(v: boolean) {
    this.el.style.display = v ? '' : 'none';
  }

  private icon(layer: Tex, glyph: string): HTMLElement {
    const d = document.createElement('div');
    d.className = 'icon';
    const c = layerToCanvas(this.texData, layer, 2);
    d.appendChild(c);
    const s = document.createElement('span');
    s.className = 'glyph';
    s.textContent = glyph;
    d.appendChild(s);
    return d;
  }

  private buildTab(g: Game) {
    this.tabBody.innerHTML = '';
    this.buttons = [];
    this.minionRows.clear();
    if (this.tab === 'rooms') {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const r of BUILD_ORDER) {
        const def = ROOMS[r];
        const b = document.createElement('button');
        b.className = 'slot';
        b.appendChild(this.icon(ROOM_TEX[r] ?? Tex.FloorP, ROOM_GLYPH[r] ?? '?'));
        const cost = document.createElement('div');
        cost.className = 'cost';
        cost.textContent = String(g.roomCost(r));
        b.appendChild(cost);
        b.addEventListener('click', () => this.cb.onRoom(r));
        b.addEventListener('mouseenter', () => this.setInfo(`<b style="color:${def.color}">${def.name}</b> <span class="dim">${g.roomCost(r)}g / tile</span><br>${def.desc}${g.keeper.rooms.has(r) ? '' : '<br><i class="dim">Unlocked by research.</i>'}`));
        grid.appendChild(b);
        this.buttons.push({ el: b, kind: 'room', id: r });
      }
      const sell = document.createElement('button');
      sell.className = 'slot sell';
      sell.innerHTML = '<div class="icon sellicon">✖</div><div class="cost">Sell</div>';
      sell.addEventListener('click', () => this.cb.onSell());
      sell.addEventListener('mouseenter', () => this.setInfo('<b>Sell Room</b><br>Destroy room tiles for half their cost.'));
      grid.appendChild(sell);
      this.buttons.push({ el: sell, kind: 'sell', id: 0 });
      this.tabBody.appendChild(grid);
    } else if (this.tab === 'spells') {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const key of SPELL_ORDER) {
        const def = SPELLS[key];
        const b = document.createElement('button');
        b.className = 'slot spell';
        b.innerHTML = `<div class="icon spellicon">${def.icon}</div><div class="cost"></div>`;
        b.addEventListener('click', () => this.cb.onSpell(key));
        b.addEventListener('mouseenter', () => this.setInfo(`<b style="color:#c8a0ff">${def.name}</b> <span class="dim">${spellCost(g, key)}g</span><br>${def.desc}${g.keeper.spells.has(key) ? '' : '<br><i class="dim">Unlocked by research.</i>'}`));
        grid.appendChild(b);
        this.buttons.push({ el: b, kind: 'spell', id: key });
      }
      this.tabBody.appendChild(grid);
    } else if (this.tab === 'forge') {
      const grid = document.createElement('div');
      grid.className = 'grid';
      const unlocked = new Set(unlockedTraps(g));
      for (const key of Object.keys(TRAPS)) {
        const d = TRAPS[key];
        const b = document.createElement('button');
        b.className = 'slot';
        b.innerHTML = `<div class="icon spellicon" style="background:radial-gradient(circle,#3a2a14,#0a0602);color:#ffc080;text-shadow:0 0 8px #ff8020">${d.icon}</div><div class="cost">×0</div>`;
        if (!unlocked.has(key)) b.classList.add('locked');
        b.addEventListener('click', () => this.cb.onTrap(key));
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.cb.onCraft(key);
        });
        b.addEventListener('mouseenter', () => this.setInfo(`<b style="color:#ffc080">${d.name}</b> <span class="dim">${d.cost} forge pts</span><br>${d.desc}<br><span class="dim">Left-click to place. Right-click to prioritise forging.</span>`));
        grid.appendChild(b);
        this.buttons.push({ el: b, kind: 'trap', id: key });
      }
      this.tabBody.appendChild(grid);
      const note = document.createElement('div');
      note.className = 'forgenote';
      note.style.cssText = 'font-size:16px;margin-top:6px;line-height:1.1';
      this.tabBody.appendChild(note);
    } else {
      const list = document.createElement('div');
      list.className = 'minions';
      for (const kind of ['imp', ...KEEPER_ROSTER, 'skeleton', 'vampire', 'reaper']) {
        const row = document.createElement('div');
        row.className = 'mrow';
        row.innerHTML = `<span class="mname">${CREATURES[kind].name}</span><span class="mcount"></span><span class="mstate"></span>`;
        row.addEventListener('mousedown', (e) => {
          if (e.button === 0) this.cb.onPickKind(kind);
          else this.cb.onJumpKind(kind);
        });
        row.addEventListener('contextmenu', (e) => e.preventDefault());
        row.addEventListener('mouseenter', () => this.setInfo(`<b>${CREATURES[kind].name}</b><br>${CREATURES[kind].desc}<br><span class="dim">Left-click: pick one up. Right-click: find one.</span>`));
        list.appendChild(row);
        this.minionRows.set(kind, row);
      }
      this.tabBody.appendChild(list);
    }
  }

  setInfo(html: string) {
    this.infoEl.innerHTML = html;
  }

  tooltip(html: string | null, x = 0, y = 0) {
    if (!html) {
      this.tipEl.style.display = 'none';
      return;
    }
    this.tipEl.style.display = 'block';
    this.tipEl.innerHTML = html;
    const w = this.tipEl.offsetWidth;
    this.tipEl.style.left = Math.min(window.innerWidth - w - 8, x + 18) + 'px';
    this.tipEl.style.top = y + 16 + 'px';
  }

  message(text: string, color = '#e8d8b0', important = false) {
    const d = document.createElement('div');
    d.className = 'msg' + (important ? ' important' : '');
    d.style.color = color;
    d.textContent = text;
    this.msgEl.appendChild(d);
    while (this.msgEl.children.length > 6) this.msgEl.firstChild?.remove();
    setTimeout(() => d.classList.add('fade'), important ? 9000 : 6000);
    setTimeout(() => d.remove(), important ? 10500 : 7500);
  }

  setHeld(list: Creature[]) {
    if (!list.length) {
      this.handEl.style.display = 'none';
      return;
    }
    this.handEl.style.display = '';
    const counts = new Map<string, number>();
    for (const c of list) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    this.handEl.innerHTML = '<span class="dim">In hand:</span> ' + [...counts].map(([k, n]) => `<span class="held">${CREATURES[k].name}${n > 1 ? ' ×' + n : ''}</span>`).join(' ') + ' <span class="dim">(right-click to drop)</span>';
  }

  update(g: Game, opts: { realmName: string; paused: boolean; speed: number }) {
    const k = g.keeper;
    this.goldEl.textContent = Math.floor(k.gold).toLocaleString();
    this.capEl.textContent = '/ ' + Math.floor(k.goldCap).toLocaleString();
    this.goldEl.classList.toggle('full', k.gold >= k.goldCap);
    const nr = k.nextResearch();
    if (nr) {
      const name = nr.kind === 'room' ? ROOMS[nr.id as number].name : SPELLS[nr.id as string].name;
      const pct = Math.min(100, (k.research / nr.cost) * 100);
      this.researchEl.innerHTML = `<span class="dim">Research:</span> ${name} <div class="rbar"><div style="width:${pct.toFixed(0)}%"></div></div>`;
    } else this.researchEl.innerHTML = '<span class="dim">All secrets known.</span>';

    // tabs: rebuild when unlocks change
    const sig = this.tab + '|' + [...k.rooms].join(',') + '|' + [...k.spells].join(',') + '|' + k.crafted;
    if (sig !== this.lastTabSig) {
      this.lastTabSig = sig;
      this.buildTab(g);
    }
    for (const b of this.buttons) {
      let locked = false,
        afford = true,
        cost = 0;
      if (b.kind === 'room') {
        locked = !k.rooms.has(b.id as Room);
        cost = g.roomCost(b.id as Room);
        afford = k.gold >= cost;
      } else if (b.kind === 'spell') {
        locked = !k.spells.has(b.id as string);
        cost = spellCost(g, b.id as string);
        afford = k.gold >= cost;
        (b.el.querySelector('.cost') as HTMLElement).textContent = locked ? '???' : String(cost);
      }
      if (b.kind === 'trap') {
        const n = k.inventory[b.id as string] ?? 0;
        (b.el.querySelector('.cost') as HTMLElement).textContent = (k.craft === b.id ? '⚒' : '') + '×' + n;
        afford = n > 0;
        locked = !unlockedTraps(g).includes(b.id as string);
      }
      b.el.classList.toggle('locked', locked);
      b.el.classList.toggle('poor', !afford && !locked);
      b.el.classList.toggle('sel', !!this.selected && this.selected.kind === b.kind && this.selected.id === b.id);
    }
    if (this.tab === 'forge') {
      const note = this.tabBody.querySelector('.forgenote') as HTMLElement | null;
      if (note) {
        const ws = g.roomTiles(Room.Workshop);
        note.innerHTML = ws ? `<span class="dim">Forge points:</span> ${Math.floor(k.manufacture)} <span class="dim">· items forged ${k.crafted}</span>` : '<span class="dim">Build a Workshop and attract Trolls to forge doors and traps.</span>';
      }
    }
    if (this.tab === 'minions') {
      const stats = new Map<string, { n: number; fight: number; work: number; idle: number }>();
      for (const c of g.creatures) {
        if (!c.alive || c.owner !== PLAYER || c.kind === 'chicken') continue;
        const s = stats.get(c.kind) ?? { n: 0, fight: 0, work: 0, idle: 0 };
        s.n++;
        if (c.state === 'fight') s.fight++;
        else if (c.job || ['train', 'research', 'manufacture', 'guard', 'sleep', 'eat'].includes(c.state)) s.work++;
        else s.idle++;
        stats.set(c.kind, s);
      }
      for (const [kind, row] of this.minionRows) {
        const s = stats.get(kind);
        row.style.display = s ? '' : 'none';
        if (!s) continue;
        (row.querySelector('.mcount') as HTMLElement).textContent = String(s.n);
        (row.querySelector('.mstate') as HTMLElement).innerHTML = `<span title="busy" class="st-w">${s.work}</span> <span title="idle" class="st-i">${s.idle}</span> <span title="fighting" class="st-f">${s.fight}</span>`;
      }
    }

    // top bar
    this.realmEl.textContent = opts.realmName;
    const hp = Math.max(0, k.heartHp / k.heartMax);
    this.heartBar.style.width = (hp * 100).toFixed(1) + '%';
    this.heartTxt.textContent = Math.ceil(k.heartHp) + '';
    const w = g.director.wave;
    const r = g.rules;
    let obj = '';
    if (r.objective === 'conquest') obj = w.lord ? `Slay the ${w.lord.def.name}` : 'Survive';
    else if (r.objective === 'siege') obj = `Survive ${r.objectiveTarget} invasions (${Math.min(w.spawned, r.objectiveTarget)}/${r.objectiveTarget})`;
    else obj = `Amass ${r.objectiveTarget.toLocaleString()} gold`;
    this.objEl.textContent = obj;
    const invaders = g.creatures.filter((c) => c.alive && c.owner === HEROES && c.campTile < 0).length;
    this.waveEl.innerHTML = (invaders ? `<span class="warn">${invaders} invaders!</span> · ` : '') + `Next invasion ${fmtTime(w.nextT)}`;
    this.speedEl.textContent = opts.paused ? '❚❚ Paused' : opts.speed > 1 ? `▶▶ ×${opts.speed}` : '▶ ×1';
  }

  drawMinimap(g: Game, cam: { x: number; z: number; yaw: number }) {
    const m = g.map;
    const cv = this.minimap;
    if (cv.width !== m.w * 2) {
      cv.width = m.w * 2;
      cv.height = m.h * 2;
      this.mmImg = this.mmCtx.createImageData(m.w, m.h);
    }
    if (!this.mmImg) this.mmImg = this.mmCtx.createImageData(m.w, m.h);
    const d = this.mmImg.data;
    for (let i = 0; i < m.w * m.h; i++) {
      const t = m.tile[i];
      let r = 0,
        gg = 0,
        b = 0;
      if (!m.revealed[i]) {
        if (t === Tile.Gold) [r, gg, b] = [70, 56, 20];
        else if (t === Tile.Rock) [r, gg, b] = [16, 16, 20];
        else [r, gg, b] = [34, 24, 18];
      } else if (t === Tile.Rock) [r, gg, b] = [30, 30, 36];
      else if (t === Tile.Earth) [r, gg, b] = [70, 48, 34];
      else if (t === Tile.Gold) [r, gg, b] = [200, 160, 40];
      else if (t === Tile.Gems) [r, gg, b] = [180, 80, 220];
      else if (t === Tile.Wall) [r, gg, b] = m.owner[i] === HEROES ? [150, 150, 170] : [110, 96, 110];
      else if (t === Tile.Water) [r, gg, b] = [30, 70, 120];
      else if (t === Tile.Lava) [r, gg, b] = [230, 90, 20];
      else if (t === Tile.Path) [r, gg, b] = [110, 86, 64];
      else {
        const o = m.owner[i];
        if (m.room[i] !== Room.None) {
          const col = ROOMS[m.room[i]]?.color ?? '#888';
          r = parseInt(col.slice(1, 3), 16);
          gg = parseInt(col.slice(3, 5), 16);
          b = parseInt(col.slice(5, 7), 16);
        } else if (o === PLAYER) [r, gg, b] = [120, 40, 40];
        else if (o === HEROES) [r, gg, b] = [70, 90, 150];
        else [r, gg, b] = [110, 86, 64];
      }
      if (m.tagged[i]) [r, gg, b] = [230, 190, 60];
      d[i * 4] = r;
      d[i * 4 + 1] = gg;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
    for (const c of g.creatures) {
      if (!c.alive || c.kind === 'chicken') continue;
      if (c.owner !== PLAYER && !g.isVisible(c.x, c.z)) continue;
      const i = c.tz * m.w + c.tx;
      if (i < 0 || i >= m.w * m.h) continue;
      const col = c.owner === PLAYER ? [255, 90, 60] : c.owner === HEROES ? [140, 200, 255] : [220, 220, 220];
      d[i * 4] = col[0];
      d[i * 4 + 1] = col[1];
      d[i * 4 + 2] = col[2];
    }
    const ctx = this.mmCtx;
    // draw at 2x
    const tmp = document.createElement('canvas');
    tmp.width = m.w;
    tmp.height = m.h;
    tmp.getContext('2d')!.putImageData(this.mmImg, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
    // camera marker
    ctx.strokeStyle = '#f0d890';
    ctx.lineWidth = 1;
    ctx.save();
    ctx.translate(cam.x * 2, cam.z * 2);
    ctx.rotate(-cam.yaw);
    ctx.strokeRect(-12, -9, 24, 18);
    ctx.restore();
    void isSolid;
    void NEUTRAL;
  }
}

export function fmtTime(s: number) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function creatureInfo(c: Creature): string {
  const d = c.def;
  const need = (v: number) => (v > 1 ? '<span class="warn">!</span>' : '');
  const stateName: Record<string, string> = {
    idle: 'Idle',
    wander: 'Wandering',
    fight: 'Fighting',
    sleep: 'Sleeping',
    eat: 'Eating',
    train: 'Training',
    research: 'Researching',
    manufacture: 'Forging',
    guard: 'Guarding',
    pray: 'Worshipping',
    leave: 'Leaving!',
    march: 'Marching',
    digging: 'Tunnelling',
    rally: 'Rallying',
    ko: 'Knocked out',
    prisoner: 'Imprisoned',
    tortured: 'Being tortured',
    carried: 'Being dragged off',
    possessed: 'Possessed',
  };
  let st = stateName[c.state] ?? (c.state.startsWith('to') ? 'Travelling' : c.state);
  if (c.isImp && c.job) st = { dig: 'Digging', claim: 'Claiming', fortify: 'Fortifying', pickup: 'Collecting gold', deposit: 'Hauling gold', wander: 'Idling', unclaim: 'Claiming', haulPrisoner: 'Dragging a prisoner', haulCorpse: 'Hauling a corpse' }[c.job.type];
  if (c.asleepInCamp) st = 'Slumbering';
  const owner = c.owner === PLAYER ? 'Your' : c.owner === HEROES ? 'Hero' : 'Neutral';
  let s = `<b style="color:${OWNER_CSS[c.owner]}">${owner} ${d.name}</b> <span class="dim">Lv ${c.level}</span><br>`;
  s += `HP ${Math.ceil(c.hp)}/${c.maxHp} · ${st}`;
  if (c.owner === PLAYER && !c.isImp && d.wage > 0) {
    s += `<br><span class="dim">Hunger</span> ${bar(c.hunger)}${need(c.hunger)} <span class="dim">Rest</span> ${bar(c.tired)}${need(c.tired)}`;
    s += `<br><span class="dim">Anger</span> ${bar(c.anger)} <span class="dim">Wage ${d.wage}g</span>${c.lair < 0 ? ' <span class="warn">No bed</span>' : ''}`;
  }
  if (c.carryGold) s += `<br><span class="dim">Carrying</span> ${c.carryGold}g`;
  return s;
}

function bar(v: number) {
  const n = Math.max(0, Math.min(5, Math.round(v * 5)));
  return `<span class="pips">${'■'.repeat(n)}<span class="dim">${'■'.repeat(5 - n)}</span></span>`;
}
