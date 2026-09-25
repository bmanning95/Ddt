import { Run, RunNode, RELICS, OMENS, TYPE_INFO, RelicDef, RetinueEntry, COLS } from '../run/run';
import { CREATURES } from '../game/creatures';
import type { Sfx } from '../audio/sfx';

export interface Options {
  volume: number;
  music: boolean;
  edgeScroll: boolean;
  resolution: number;
  dither: boolean;
  affine: number;
}

export const OPTIONS_KEY = 'underkeep.options';
export const SAVE_KEY = 'underkeep.run';
export const BEST_KEY = 'underkeep.best';

export function loadOptions(): Options {
  const def: Options = { volume: 0.7, music: true, edgeScroll: true, resolution: 360, dither: true, affine: 0.55 };
  try {
    const s = localStorage.getItem(OPTIONS_KEY);
    if (s) return { ...def, ...JSON.parse(s) };
  } catch {
    /* storage unavailable */
  }
  return def;
}
export function saveOptions(o: Options) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

export class Screens {
  current: HTMLElement | null = null;
  constructor(
    private root: HTMLElement,
    private sfx: Sfx,
  ) {}

  close() {
    this.current?.remove();
    this.current = null;
  }

  private show(node: HTMLElement) {
    this.close();
    node.classList.add('fadeout');
    this.root.appendChild(node);
    this.current = node;
    node.querySelectorAll('button').forEach((b) => b.addEventListener('mouseenter', () => this.sfx.play('click', 0.5)));
    return node;
  }

  title(hasSave: boolean, best: string): Promise<'new' | 'continue' | 'howto' | 'options'> {
    return new Promise((res) => {
      const n = this.show(
        el(`<div class="screen">
          <div class="title">Underkeep</div>
          <div class="subtitle">A Dungeon-Keeping Roguelike</div>
          <div class="menu">
            ${hasSave ? '<button data-a="continue">Continue Run</button>' : ''}
            <button data-a="new">New Run</button>
            <button data-a="howto">How to Play</button>
            <button data-a="options">Options</button>
          </div>
          <div class="hint">${best ? best + '<br>' : ''}Carve your dungeon. Enslave the underworld. Crush every do-gooder between here and Shiningspire.</div>
        </div>`),
      );
      n.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => res((b as HTMLElement).dataset.a as any)));
    });
  }

  howto(): Promise<void> {
    return new Promise((res) => {
      const n = this.show(
        el(`<div class="screen"><div class="panelbox carved" style="max-width:820px">
          <h2>The Keeper's Primer</h2>
          <div style="font-size:19px;line-height:1.25;columns:2;column-gap:30px">
          <b style="color:#ffd070">The Hand of Evil</b><br>
          <b>Left-click earth</b> (drag) to mark it for digging. Imps dig it, carry gold home, claim floor and fortify walls.<br>
          <b>Left-click a minion</b> to pick it up (up to 8). <b>Right-click</b> your territory to drop it — drop fighters onto intruders!<br>
          <b>Right-click a minion</b> to slap it: it works faster, but grows resentful.<br>
          <b>Left-click loose gold</b> to scoop it up.<br><br>
          <b style="color:#ffd070">Building</b><br>
          Pick a room in the <b>Rooms</b> tab and paint it over claimed floor. A <b>Treasury</b> stores gold, a <b>Lair</b> gives beds, a <b>Hatchery</b> feeds, a <b>Training Pit</b> levels up, a <b>Library</b> researches new rooms and spells.<br>
          Claim a <b>Portal</b> to attract creatures. Better rooms attract better creatures.<br><br>
          <b style="color:#ffd070">Minions</b><br>
          Minions need beds, food and pay. Payday comes regularly — an empty treasury breeds mutiny.<br><br>
          <b style="color:#ffd070">The Run</b><br>
          Conquer realms across the map toward Shiningspire. After each victory, claim a <b>relic</b> and choose a <b>retinue</b> of minions to follow you. Rooms and spells you research stay known. If your <b>Dungeon Heart</b> falls, the run ends.<br><br>
          <b style="color:#ffd070">Keys</b><br>
          WASD / arrows / screen edge: pan · Q/E or middle-drag: rotate · Wheel: zoom · Space: pause · 1-3: speed · H: heart · Tab: panel tab · M: music · Esc: menu
          </div>
          <div style="text-align:center;margin-top:14px"><button class="bigbtn">Back</button></div>
        </div></div>`),
      );
      n.querySelector('button')!.addEventListener('click', () => res());
    });
  }

  options(o: Options, apply: (o: Options) => void): Promise<void> {
    return new Promise((res) => {
      const n = this.show(
        el(`<div class="screen"><div class="panelbox carved" style="min-width:460px">
          <h2>Options</h2>
          <div class="opts" style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;font-size:20px;align-items:center">
            <label>Volume</label><input type="range" min="0" max="1" step="0.05" data-k="volume">
            <label>Music</label><input type="checkbox" data-k="music">
            <label>Edge scrolling</label><input type="checkbox" data-k="edgeScroll">
            <label>Dithering</label><input type="checkbox" data-k="dither">
            <label>Resolution</label><select data-k="resolution"><option value="240">240p (raw PS1)</option><option value="360">360p (clean)</option><option value="480">480p (sharp)</option></select>
            <label>Texture warp</label><input type="range" min="0" max="1" step="0.05" data-k="affine">
          </div>
          <div style="text-align:center;margin-top:18px"><button class="bigbtn">Done</button></div>
        </div></div>`),
      );
      n.querySelectorAll('[data-k]').forEach((inp) => {
        const k = (inp as HTMLElement).dataset.k as keyof Options;
        const i = inp as HTMLInputElement;
        if (i.type === 'checkbox') i.checked = !!o[k];
        else i.value = String(o[k]);
        i.addEventListener('input', () => {
          (o as any)[k] = i.type === 'checkbox' ? i.checked : Number(i.value);
          apply(o);
          saveOptions(o);
        });
      });
      n.querySelector('.bigbtn')!.addEventListener('click', () => res());
    });
  }

  // ------------------------------------------------------------------ run map
  map(run: Run): Promise<RunNode | 'abandon' | 'menu'> {
    return new Promise((res) => {
      const W = 860,
        H = 360;
      const pos = (n: RunNode) => {
        const colNodes = run.nodes.filter((m) => m.col === n.col);
        const x = 50 + (n.col / (COLS - 1)) * (W - 100);
        const y = colNodes.length === 1 ? H / 2 : 45 + (n.row / (colNodes.length - 1)) * (H - 90);
        return [x, y];
      };
      const avail = new Set(run.available().map((n) => n.id));
      let lines = '';
      for (const n of run.nodes)
        for (const l of n.links) {
          const [x1, y1] = pos(n);
          const [x2, y2] = pos(run.nodes[l]);
          const lit = (n.id === run.current && avail.has(l)) || (n.done && run.nodes[l].done);
          lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lit ? '#c07030' : '#3a2a1a'}" stroke-width="${lit ? 4 : 3}" stroke-dasharray="${lit ? '' : '6 6'}"/>`;
        }
      const nodes = run.nodes
        .map((n) => {
          const [x, y] = pos(n);
          const cls = ['node', n.type === 'boss' ? 'boss' : '', n.done ? 'done' : '', n.id === run.current ? 'current' : '', avail.has(n.id) ? 'avail' : ''].join(' ');
          return `<div class="${cls}" data-id="${n.id}" style="left:${x}px;top:${y}px">${TYPE_INFO[n.type].icon}</div>`;
        })
        .join('');
      const relics = run.relics.map((r) => `<span class="relic" title="${RELICS[r].name}: ${RELICS[r].desc}${RELICS[r].curse ? ' ' + RELICS[r].curse : ''}">${RELICS[r].icon}</span>`).join('');
      const ret = run.retinue.length ? run.retinue.map((r) => `${CREATURES[r.kind].name} <span class="dim">Lv${r.level}</span>`).join(' · ') : '<span class="dim">none</span>';
      const n = this.show(
        el(`<div class="screen" style="background:radial-gradient(ellipse at center,#0006,#000d)">
          <div class="panelbox carved" style="max-width:940px">
            <h2>The Descent</h2>
            <div class="statline"><span>Realms conquered <b>${run.stats.realms}</b></span><span>Souls <b>${run.souls}</b></span><span>Heroes slain <b>${run.stats.heroesSlain}</b></span></div>
            <div class="statline" style="margin-top:6px">${relics || '<span class="dim">No relics yet</span>'}</div>
            <div class="runmap"><svg width="${W}" height="${H}">${lines}</svg>${nodes}</div>
            <div class="nodeinfo" id="ninfo"><span class="dim">Choose your next realm to despoil.</span></div>
            <div class="statline" style="font-size:18px"><span class="dim">Retinue (${run.retinue.length}/${run.retinueSize()}):</span> ${ret}</div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:12px">
              <button class="bigbtn" data-a="menu" style="font-size:20px">Main Menu</button>
              <button class="bigbtn" data-a="abandon" style="font-size:20px">Abandon Run</button>
            </div>
          </div></div>`),
      );
      const info = n.querySelector('#ninfo') as HTMLElement;
      n.querySelectorAll('.node').forEach((d) => {
        const node = run.nodes[Number((d as HTMLElement).dataset.id)];
        d.addEventListener('mouseenter', () => {
          const t = TYPE_INFO[node.type];
          const omens = node.omens.map((o) => `<span style="color:${OMENS[o].good ? '#9fe080' : '#ff8a6a'}" title="${OMENS[o].desc}">${OMENS[o].name}</span>`).join(' · ');
          info.innerHTML = `<b style="color:#ffd890;font-size:24px">${node.type === 'shrine' || node.type === 'market' ? t.name : node.name}</b> <span class="dim">— ${t.name}</span><br>${t.desc}${omens ? '<br>' + omens : ''}`;
        });
        if (avail.has(node.id)) d.addEventListener('click', () => res(node));
      });
      const ab = n.querySelector('[data-a="abandon"]') as HTMLButtonElement;
      armConfirm(ab, 'Click again to abandon', () => res('abandon'));
      n.querySelector('[data-a="menu"]')!.addEventListener('click', () => res('menu'));
    });
  }

  realmIntro(node: RunNode, objective: string): Promise<void> {
    return new Promise((res) => {
      const t = TYPE_INFO[node.type];
      const omens = node.omens.map((o) => `<div style="color:${OMENS[o].good ? '#9fe080' : '#ff8a6a'}"><b>${OMENS[o].name}</b> <span class="dim">— ${OMENS[o].desc}</span></div>`).join('');
      const n = this.show(
        el(`<div class="screen"><div class="panelbox carved" style="text-align:center;min-width:520px">
          <div class="dim" style="letter-spacing:4px;text-transform:uppercase">${t.name}</div>
          <h2 style="font-size:54px">${node.name}</h2>
          <div style="font-size:22px;color:#ffd070">${objective}</div>
          <div style="margin:12px 0;font-size:19px">${omens || '<span class="dim">The omens are quiet.</span>'}</div>
          <button class="bigbtn">Descend</button>
        </div></div>`),
      );
      n.querySelector('button')!.addEventListener('click', () => {
        this.close();
        res();
      });
    });
  }

  relicChoice(title: string, sub: string, offers: RelicDef[], allowSkip = true): Promise<string | null> {
    return new Promise((res) => {
      const cards = offers
        .map(
          (r) => `<div class="card ${r.curse ? 'curse' : ''}" data-k="${r.key}">
          <div class="cicon">${r.icon}</div>
          <div class="cname">${r.name}</div>
          <div class="ctype">${['', 'Common', 'Rare', 'Accursed'][r.rarity]} relic</div>
          <div class="cdesc">${r.desc}${r.curse ? `<br><span class="warn">${r.curse}</span>` : ''}</div>
        </div>`,
        )
        .join('');
      const n = this.show(
        el(`<div class="screen"><div class="panelbox carved">
          <h2>${title}</h2>
          <div style="text-align:center;font-size:20px" class="dim">${sub}</div>
          <div class="cards">${cards}</div>
          ${allowSkip ? '<div style="text-align:center"><button class="bigbtn" data-a="skip" style="font-size:20px">Take nothing</button></div>' : ''}
        </div></div>`),
      );
      n.querySelectorAll('.card').forEach((c) =>
        c.addEventListener('click', () => {
          this.sfx.play('crate');
          res((c as HTMLElement).dataset.k!);
        }),
      );
      n.querySelector('[data-a="skip"]')?.addEventListener('click', () => res(null));
    });
  }

  realmVictory(run: Run, name: string, stats: { heroes: number; gold: number; souls: number; time: number; lost: number }): Promise<void> {
    return new Promise((res) => {
      const n = this.show(
        el(`<div class="screen"><div class="panelbox carved" style="text-align:center;min-width:560px">
          <h2 style="font-size:54px;color:#ffcc55">${name} Has Fallen</h2>
          <div style="font-size:20px" class="dim">Another cheerful little realm crushed beneath your heel.</div>
          <div class="statline" style="margin:14px 0">
            <span>Heroes slain <b>${stats.heroes}</b></span>
            <span>Gold mined <b>${stats.gold}</b></span>
            <span>Minions lost <b>${stats.lost}</b></span>
            <span>Time <b>${Math.floor(stats.time / 60)}:${String(Math.floor(stats.time % 60)).padStart(2, '0')}</b></span>
          </div>
          <div style="font-size:24px;color:#d0a0ff">+${stats.souls} souls harvested</div>
          <div style="margin-top:16px"><button class="bigbtn">Claim your spoils</button></div>
        </div></div>`),
      );
      void run;
      n.querySelector('button')!.addEventListener('click', () => res());
    });
  }

  retinue(size: number, candidates: RetinueEntry[]): Promise<RetinueEntry[]> {
    return new Promise((res) => {
      const sorted = [...candidates].sort((a, b) => b.level - a.level);
      const chosen = new Set<number>(sorted.slice(0, size).map((_, i) => i));
      const n = this.show(
        el(`<div class="screen"><div class="panelbox carved" style="text-align:center;min-width:560px">
          <h2>Choose Your Retinue</h2>
          <div style="font-size:20px" class="dim">Up to ${size} minions will follow you into the next realm, keeping their experience.</div>
          <div class="retinue-list"></div>
          <div id="rcount" style="font-size:20px"></div>
          <div style="margin-top:12px"><button class="bigbtn">Onward</button></div>
        </div></div>`),
      );
      const list = n.querySelector('.retinue-list') as HTMLElement;
      const count = n.querySelector('#rcount') as HTMLElement;
      const render = () => {
        list.innerHTML = '';
        sorted.forEach((c, i) => {
          const chip = el(`<div class="rchip ${chosen.has(i) ? 'on' : ''}">${CREATURES[c.kind].name} <span class="dim">Lv${c.level}</span></div>`);
          chip.addEventListener('click', () => {
            if (chosen.has(i)) chosen.delete(i);
            else if (chosen.size < size) chosen.add(i);
            this.sfx.play('click');
            render();
          });
          list.appendChild(chip);
        });
        if (!sorted.length) list.innerHTML = '<span class="dim">None of your minions survived to follow you.</span>';
        count.textContent = `${chosen.size} / ${size} chosen`;
      };
      render();
      n.querySelector('.bigbtn')!.addEventListener('click', () => res([...chosen].map((i) => sorted[i])));
    });
  }

  market(run: Run, offers: { relics: RelicDef[]; creatures: RetinueEntry[] }): Promise<void> {
    return new Promise((res) => {
      const price = (r: RelicDef) => [0, 14, 24, 34][r.rarity];
      const cprice = (c: RetinueEntry) => Math.round(6 + c.level * 3 + CREATURES[c.kind].hp / 90);
      const n = this.show(el(`<div class="screen"><div class="panelbox carved" style="max-width:980px"></div></div>`));
      const box = n.querySelector('.panelbox') as HTMLElement;
      const render = () => {
        box.innerHTML = `<h2>The Black Market</h2>
          <div style="text-align:center;font-size:20px">A hooded thing rattles its wares. You have <b style="color:#d0a0ff">${run.souls} souls</b>.</div>
          <div class="cards" id="mrel"></div>
          <div class="cards" id="mcre"></div>
          <div style="text-align:center;display:flex;gap:12px;justify-content:center">
            <button class="bigbtn" data-a="temper" style="font-size:20px">Temper retinue (+1 level) — 15 souls</button>
            <button class="bigbtn" data-a="leave">Leave</button>
          </div>`;
        const rel = box.querySelector('#mrel') as HTMLElement;
        for (const r of offers.relics) {
          const p = price(r);
          const c = el(`<div class="card ${r.curse ? 'curse' : ''} ${run.souls < p ? 'disabled' : ''}"><div class="cicon">${r.icon}</div><div class="cname">${r.name}</div><div class="ctype">${p} souls</div><div class="cdesc">${r.desc}${r.curse ? `<br><span class="warn">${r.curse}</span>` : ''}</div></div>`);
          c.addEventListener('click', () => {
            run.souls -= p;
            run.relics.push(r.key);
            offers.relics = offers.relics.filter((x) => x !== r);
            this.sfx.play('crate');
            render();
          });
          rel.appendChild(c);
        }
        const cre = box.querySelector('#mcre') as HTMLElement;
        for (const cr of offers.creatures) {
          const p = cprice(cr);
          const full = run.retinue.length >= run.retinueSize();
          const c = el(`<div class="card ${run.souls < p || full ? 'disabled' : ''}" style="min-height:120px"><div class="cname">${CREATURES[cr.kind].name}</div><div class="ctype">Level ${cr.level} · ${p} souls</div><div class="cdesc">${CREATURES[cr.kind].desc}${full ? '<br><span class="warn">Retinue full</span>' : ''}</div></div>`);
          c.addEventListener('click', () => {
            run.souls -= p;
            run.retinue.push(cr);
            offers.creatures = offers.creatures.filter((x) => x !== cr);
            this.sfx.play('join');
            render();
          });
          cre.appendChild(c);
        }
        const temper = box.querySelector('[data-a="temper"]') as HTMLButtonElement;
        temper.disabled = run.souls < 15 || !run.retinue.length;
        temper.addEventListener('click', () => {
          run.souls -= 15;
          for (const r of run.retinue) r.level = Math.min(10, r.level + 1);
          this.sfx.play('levelup');
          render();
        });
        box.querySelector('[data-a="leave"]')!.addEventListener('click', () => res());
      };
      render();
    });
  }

  gameOver(run: Run, victory: boolean): Promise<'new' | 'title'> {
    return new Promise((res) => {
      const n = this.show(
        el(`<div class="screen"><div class="panelbox carved" style="text-align:center;min-width:600px">
          <h2 style="font-size:64px;color:${victory ? '#ffcc55' : '#c82818'}">${victory ? 'Evil Triumphant' : 'Your Heart Is Broken'}</h2>
          <div style="font-size:21px" class="dim">${victory ? 'The Avatar is dead. Shiningspire burns. The land is yours, forever and ever.' : 'The heroes dance on the ruins of your dungeon. How dreadfully wholesome.'}</div>
          <div class="statline" style="margin:16px 0">
            <span>Realms conquered <b>${run.stats.realms}</b></span>
            <span>Heroes slain <b>${run.stats.heroesSlain}</b></span>
            <span>Gold mined <b>${run.stats.goldMined}</b></span>
            <span>Relics <b>${run.relics.length}</b></span>
          </div>
          <div class="statline">${run.relics.map((r) => `<span class="relic" title="${RELICS[r].name}">${RELICS[r].icon}</span>`).join('')}</div>
          <div class="menu" style="flex-direction:row;justify-content:center">
            <button data-a="new">New Run</button><button data-a="title">Title</button>
          </div>
        </div></div>`),
      );
      n.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => res((b as HTMLElement).dataset.a as any)));
    });
  }

  pause(): Promise<'resume' | 'options' | 'abandon' | 'title' | 'howto'> {
    return new Promise((res) => {
      const n = this.show(
        el(`<div class="screen" style="background:#000a">
          <div class="title" style="font-size:64px">Paused</div>
          <div class="menu">
            <button data-a="resume">Resume</button>
            <button data-a="howto">How to Play</button>
            <button data-a="options">Options</button>
            <button data-a="title">Retreat to Title <span class="dim">(realm lost)</span></button>
            <button data-a="abandon">Abandon Run</button>
          </div></div>`),
      );
      n.querySelectorAll('button').forEach((b) => {
        const a = (b as HTMLElement).dataset.a as any;
        if (a === 'abandon') armConfirm(b as HTMLButtonElement, 'Click again to forsake the run', () => res(a));
        else b.addEventListener('click', () => res(a));
      });
    });
  }
}

// Two-step confirmation inside the page (native confirm dialogs are not always available).
function armConfirm(btn: HTMLButtonElement, prompt: string, onConfirm: () => void) {
  const label = btn.innerHTML;
  let armed = false;
  let t = 0;
  btn.addEventListener('click', () => {
    if (armed) {
      clearTimeout(t);
      onConfirm();
      return;
    }
    armed = true;
    btn.innerHTML = `<span class="warn">${prompt}</span>`;
    t = window.setTimeout(() => {
      armed = false;
      btn.innerHTML = label;
    }, 3000);
  });
}
