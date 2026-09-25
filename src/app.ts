import * as THREE from 'three';
import { PS1Pipeline, shared } from './render/ps1';
import { buildTextureData, createTextureArray, layerToCanvas, Tex, TEX } from './render/textures';
import { TerrainRenderer } from './render/terrain';
import { KeeperCamera, pickTile, rayFromScreen, TileHit } from './render/camera';
import { EntityRenderer, CreatureView } from './render/views';
import { RoomProps } from './render/props';
import { FxSystem } from './render/fx';
import { HandModel } from './render/hand';
import { Input } from './input';
import { Hud, creatureInfo, OWNER_CSS } from './ui/hud';
import { Game } from './game/game';
import { Creature } from './game/entity';
import { Room, ROOMS, PLAYER, Tile, isSolid, WALL_H, HEROES, isDiggable } from './game/defs';
import { SPELLS, castSpell } from './game/spells';
import { Sfx } from './audio/sfx';
import { Possession } from './possess';

export type Mode = { kind: 'hand' } | { kind: 'build'; room: Room } | { kind: 'spell'; key: string } | { kind: 'sell' };

const SIM_DT = 1 / 30;

export class App {
  renderer: THREE.WebGLRenderer;
  pipe: PS1Pipeline;
  scene = new THREE.Scene();
  cam: KeeperCamera;
  input: Input;
  hud: Hud;
  texData: Uint8Array;
  sfx = new Sfx();
  ui: HTMLElement;

  game: Game | null = null;
  terrain: TerrainRenderer | null = null;
  entities: EntityRenderer | null = null;
  props: RoomProps | null = null;
  fx = new FxSystem();
  hand = new HandModel();
  possession: Possession;
  cursor: THREE.Mesh;
  cursorMat: THREE.MeshBasicMaterial;

  mode: Mode = { kind: 'hand' };
  held: Creature[] = [];
  private heldView: CreatureView | null = null;
  paused = false;
  speed = 1;
  realmName = '';
  hoverTile: TileHit | null = null;
  hoverCreature: Creature | null = null;
  private dragTag = 0;
  private dragLast = -1;
  private acc = 0;
  private last = performance.now();
  private time = 0;
  private mmT = 0;
  simRunning = false;
  onRealmEnd: ((win: boolean, g: Game) => void) | null = null;
  onMenu: (() => void) | null = null;
  overlayOpen = false;
  edgeScroll = true;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.ui = ui;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x040204);
    this.renderer.autoClear = true;
    this.pipe = new PS1Pipeline(this.renderer);
    this.texData = buildTextureData();
    shared.uTex.value = createTextureArray();
    this.cam = new KeeperCamera(1);
    this.input = new Input(canvas);
    // stone texture for UI panels, straight from the game's own texture set
    const stone = layerToCanvas(this.texData, Tex.RockTop, 2);
    document.documentElement.style.setProperty('--stone', `url(${stone.toDataURL()})`);
    void TEX;

    this.hud = new Hud(ui, this.texData, {
      onRoom: (r) => this.setMode(this.mode.kind === 'build' && this.mode.room === r ? { kind: 'hand' } : { kind: 'build', room: r }),
      onSpell: (k) => this.selectSpell(k),
      onSell: () => this.setMode(this.mode.kind === 'sell' ? { kind: 'hand' } : { kind: 'sell' }),
      onPickKind: (k) => this.pickKind(k),
      onJumpKind: (k) => this.jumpKind(k),
      onMinimap: (fx, fz) => {
        if (!this.game) return;
        this.cam.panTo(fx * this.game.map.w, fz * this.game.map.h);
      },
      onMenu: () => this.onMenu?.(),
      onSpeed: () => (this.paused = !this.paused),
    });
    this.hud.show(false);

    this.scene.add(this.fx.group);
    this.scene.add(this.hand.root);
    this.cursorMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const cg = new THREE.BoxGeometry(1.04, 0.05, 1.04);
    this.cursor = new THREE.Mesh(cg, this.cursorMat);
    this.cursor.renderOrder = 5;
    this.scene.add(this.cursor);
    this.possession = new Possession(this);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.pipe.resize(w, h);
    this.cam.camera.aspect = this.pipe.lowW / this.pipe.lowH;
    this.cam.camera.updateProjectionMatrix();
    this.possession.camera.aspect = this.cam.camera.aspect;
    this.possession.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ realm lifecycle
  demo = false;

  loadRealm(g: Game, name: string, demo = false) {
    this.unloadRealm();
    this.demo = demo;
    this.game = g;
    this.realmName = name;
    this.terrain = new TerrainRenderer(g.map);
    const [hx, hz] = g.heartCenter();
    this.terrain.extraLights = this.realmLights(g);
    this.scene.add(this.terrain.group);
    this.entities = new EntityRenderer(g);
    this.scene.add(this.entities.group);
    this.props = new RoomProps(g);
    this.scene.add(this.props.group);
    this.cam.setBounds(g.map.w, g.map.h);
    this.cam.jumpTo(hx, hz + 2);
    this.cam.yaw = this.cam.yawGoal = 0;
    this.cam.dist = this.cam.distGoal = 14;
    this.held = [];
    this.mode = { kind: 'hand' };
    this.paused = false;
    this.speed = 1;
    this.simRunning = true;
    this.hud.show(!demo);
    if (demo) {
      this.cam.dist = this.cam.distGoal = 13;
      this.cam.jumpTo(hx, hz);
    }
    this.hud.setInfo('<span class="dim">Tag earth for your imps to dig. Build a Treasury, Lair and Hatchery, then claim the Portal.</span>');
    // prime terrain so the first frame is complete
    for (let k = 0; k < 20; k++) this.terrain.update();
  }

  realmLights(g: Game) {
    const [hx, hz] = g.heartCenter();
    const L = [{ x: hx, z: hz, y: 1.3, r: 1.0, g: 0.22, b: 0.16, radius: 6.5, flicker: 0 }];
    for (const p of g.layout.portals) L.push({ x: p.x + 0.5, z: p.z + 0.5, y: 1, r: 0.55, g: 0.2, b: 0.9, radius: 5.5, flicker: 0 });
    for (const p of g.layout.heroGates) L.push({ x: p.x + 0.5, z: p.z + 0.5, y: 1, r: 0.6, g: 0.75, b: 1.1, radius: 5, flicker: 0 });
    if (g.layout.heroKeep) L.push({ x: g.layout.heroKeep.x + 0.5, z: g.layout.heroKeep.z + 0.5, y: 1.5, r: 0.9, g: 0.85, b: 0.7, radius: 7, flicker: 0 });
    return L;
  }

  unloadRealm() {
    this.possession.release();
    if (this.terrain) this.scene.remove(this.terrain.group);
    if (this.entities) this.scene.remove(this.entities.group);
    if (this.props) this.scene.remove(this.props.group);
    if (this.heldView) {
      this.hand.root.remove(this.heldView.rig.root);
      this.heldView = null;
    }
    this.terrain = null;
    this.entities = null;
    this.props = null;
    this.game = null;
    this.simRunning = false;
    this.hud.show(false);
  }

  setMode(m: Mode) {
    this.mode = m;
    this.hud.selected = m.kind === 'build' ? { kind: 'room', id: m.room } : m.kind === 'spell' ? { kind: 'spell', id: m.key } : m.kind === 'sell' ? { kind: 'sell', id: 0 } : null;
    this.dragTag = 0;
    this.dragLast = -1;
  }

  selectSpell(key: string) {
    const g = this.game;
    if (!g) return;
    if (!g.keeper.spells.has(key)) {
      this.hud.message('That spell has not been researched.', '#a08070');
      return;
    }
    if (this.mode.kind === 'spell' && this.mode.key === key) this.setMode({ kind: 'hand' });
    else this.setMode({ kind: 'spell', key });
  }

  pickKind(kind: string) {
    const g = this.game;
    if (!g) return;
    const cands = g.creatures.filter((c) => c.alive && c.owner === PLAYER && c.kind === kind && c.state !== 'held' && c.state !== 'fall');
    if (!cands.length) return;
    // prefer idle ones
    cands.sort((a, b) => (a.state === 'idle' || a.state === 'wander' ? 0 : 1) - (b.state === 'idle' || b.state === 'wander' ? 0 : 1));
    this.pickUp(cands[0]);
  }

  jumpKind(kind: string) {
    const g = this.game;
    if (!g) return;
    const cands = g.creatures.filter((c) => c.alive && c.owner === PLAYER && c.kind === kind && c.state !== 'held');
    if (!cands.length) return;
    const c = cands[Math.floor(this.time * 1.7) % cands.length];
    this.cam.panTo(c.x, c.z);
  }

  pickUp(c: Creature): boolean {
    const g = this.game!;
    if (this.held.length >= 8) {
      this.hud.message('Your hand is full.', '#a08070');
      return false;
    }
    if (c.owner !== PLAYER || !c.alive || c.kind === 'chicken') return false;
    g.releaseJob(c);
    c.path = null;
    c.target = null;
    c.state = 'held';
    c.anim = 'held';
    c.y = 0;
    this.held.push(c);
    this.hand.trigger('grab');
    this.sfx.play('pickup');
    this.hud.setHeld(this.held);
    return true;
  }

  drop(tile: TileHit): boolean {
    const g = this.game!;
    const m = g.map;
    const c = this.held[this.held.length - 1];
    if (!c) return false;
    const i = m.idx(tile.x, tile.z);
    const t = m.tile[i];
    const ok = !isSolid(t) && g.walkableFor(c, tile.x, tile.z) && (m.owner[i] === PLAYER || (t === Tile.Floor && m.room[i] === Room.Bridge));
    if (!ok) {
      this.hud.message('You may only drop minions onto your own territory.', '#a08070');
      this.sfx.play('deny');
      return false;
    }
    this.held.pop();
    c.x = tile.x + 0.5 + (Math.random() - 0.5) * 0.3;
    c.z = tile.z + 0.5 + (Math.random() - 0.5) * 0.3;
    c.y = 1.6;
    c.vy = 0;
    c.state = 'fall';
    c.anim = 'held';
    c.thinkCd = 0;
    this.hand.trigger('open');
    this.sfx.play('drop');
    this.hud.setHeld(this.held);
    return true;
  }

  slap(c: Creature) {
    const g = this.game!;
    if (c.owner !== PLAYER) {
      if (c.kind === 'chicken') {
        g.kill(c, null);
        c.removed = true;
      }
      return;
    }
    c.slapT = 10;
    c.hp = Math.max(1, c.hp - c.maxHp * 0.04);
    if (!c.isImp) c.anger += 0.035;
    c.hitFlash = 0.2;
    if (c.state === 'sleep') c.state = 'idle';
    c.stunT = 0.25;
    this.hand.trigger('slap');
    this.sfx.play('slap');
    g.fx('hit', c.x, c.z, 0.6, 3);
  }

  // ------------------------------------------------------------------ main loop
  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    shared.uTime.value = this.time;
    try {
      this.tick(dt);
    } catch (e) {
      console.error(e);
    }
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  private tick(dt: number) {
    const g = this.game;
    if (!g || !this.terrain || !this.entities || !this.props) {
      this.fx.update(dt, []);
      this.pipe.render(this.scene, this.cam.camera);
      return;
    }

    if (this.demo) {
      this.cam.yawGoal += dt * 0.07;
      this.cam.update(dt);
      this.hoverTile = null;
      this.hoverCreature = null;
    } else if (this.possession.active) {
      this.possession.update(dt);
    } else if (!this.overlayOpen) this.handleInput(dt);
    else this.cam.update(dt);

    // simulation
    if (this.simRunning && !this.paused && (!this.overlayOpen || this.demo)) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 10) {
        g.update(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps >= 10) this.acc = 0;
    }
    this.processEvents(g);

    // possession request from spell
    if (g.possessRequest) {
      const c = g.possessRequest;
      g.possessRequest = null;
      this.setMode({ kind: 'hand' });
      this.possession.begin(c);
    }

    // rendering
    this.terrain.update();
    const heldIds = new Set(this.held.map((c) => c.id));
    const activeCam = this.possession.active ? this.possession.camera : this.cam.camera;
    this.entities.hovered = this.hoverCreature;
    this.entities.update(dt, this.time, activeCam, heldIds);
    if (this.possession.active && this.possession.target) {
      const v = this.entities.views.get(this.possession.target.id);
      if (v) v.rig.root.visible = false;
    }
    this.props.update(this.time);
    this.fx.update(dt, g.projectiles);
    this.updateHand(dt);
    shared.uFogRange.value.set(this.possession.active ? 3 : this.cam.dist + 4, this.possession.active ? 14 : this.cam.dist + 22);
    this.pipe.postMat.uniforms.uFlash.value.set(g.heartHit > 0 ? 0.12 : 0, 0, 0);
    this.pipe.render(this.scene, activeCam);

    // HUD
    this.hud.update(g, { realmName: this.realmName, paused: this.paused, speed: this.speed });
    this.mmT -= dt;
    if (this.mmT <= 0) {
      this.mmT = 0.25;
      this.hud.drawMinimap(g, { x: this.cam.target.x, z: this.cam.target.z, yaw: this.cam.yaw });
    }
  }

  private processEvents(g: Game) {
    const [cx, cz] = [this.cam.target.x, this.cam.target.z];
    for (const e of g.events) {
      switch (e.type) {
        case 'msg':
          if (this.demo) break;
          this.hud.message(e.text!, e.color, e.important);
          if (e.important) this.sfx.play('bell');
          break;
        case 'sfx': {
          let vol = 1;
          if (e.x !== undefined) {
            const d = Math.hypot(e.x - cx, e.z! - cz);
            vol = Math.max(0, 1 - d / 22);
            if (vol <= 0.02) break;
            if (!g.isVisible(e.x, e.z!) && e.sfx !== 'heartHit') vol *= 0.4;
          }
          this.sfx.play(e.sfx!, vol);
          break;
        }
        case 'fx':
          if (e.fx === 'goldpile') break;
          if (g.isVisible(e.x!, e.z!)) this.fx.play(e.fx!, e.x!, e.z!, e.y ?? 0.5, e.n ?? 1);
          break;
        case 'shake':
          this.cam.shake = Math.max(this.cam.shake, e.n ?? 0.5);
          break;
        case 'end':
          this.simRunning = false;
          setTimeout(() => this.onRealmEnd?.(!!e.win, g), e.win ? 1500 : 2500);
          break;
      }
    }
    g.events.length = 0;
  }

  // ------------------------------------------------------------------ input
  private handleInput(dt: number) {
    const g = this.game!;
    const inp = this.input;
    const cam = this.cam;

    // keyboard camera
    const k = inp.keys;
    const pan = dt * 0.9;
    let px = 0,
      pz = 0;
    if (k.has('w') || k.has('ArrowUp')) pz -= pan;
    if (k.has('s') || k.has('ArrowDown')) pz += pan;
    if (k.has('a') || k.has('ArrowLeft')) px -= pan;
    if (k.has('d') || k.has('ArrowRight')) px += pan;
    // edge scroll
    if (this.edgeScroll && inp.inside && inp.moved && document.hasFocus()) {
      const m = 3;
      if (inp.x <= m) px -= pan;
      if (inp.x >= window.innerWidth - m - 1) px += pan;
      if (inp.y <= m) pz -= pan;
      if (inp.y >= window.innerHeight - m - 1) pz += pan;
    }
    if (px || pz) cam.pan(px, pz);
    if (k.has('q')) cam.rotate(dt * 1.8);
    if (k.has('e')) cam.rotate(-dt * 1.8);
    if (inp.wheel && !inp.overUI) cam.zoom(inp.wheel > 0 ? 1.12 : 1 / 1.12);
    if (inp.down[1]) cam.rotate(-inp.dragDX * 0.01);
    if (k.has('=') || k.has('+')) cam.zoom(1 - dt);
    if (k.has('-')) cam.zoom(1 + dt);
    cam.update(dt);

    for (const key of inp.keyPressed) {
      if (key === ' ') this.paused = !this.paused;
      else if (key === '1') this.speed = 1;
      else if (key === '2') this.speed = 2;
      else if (key === '3') this.speed = 4;
      else if (key === 'm') this.sfx.toggleMusic();
      else if (key === 'h') {
        const [hx, hz] = g.heartCenter();
        cam.panTo(hx, hz);
      } else if (key === 'Escape') {
        if (this.mode.kind !== 'hand') this.setMode({ kind: 'hand' });
        else this.onMenu?.();
      } else if (key === 'Tab') {
        const tabs: Hud['tab'][] = ['rooms', 'spells', 'minions'];
        this.hud.tab = tabs[(tabs.indexOf(this.hud.tab) + 1) % 3];
        (this.hud.el.querySelector(`[data-tab="${this.hud.tab}"]`) as HTMLElement)?.click();
      }
    }

    // picking
    const overCanvas = !inp.overUI && inp.inside;
    const ray = rayFromScreen(cam.camera, inp.nx, inp.ny);
    this.hoverTile = overCanvas ? pickTile(g.map, ray, (x, z) => this.solidForPick(x, z)) : null;
    this.hoverCreature = overCanvas && this.entities ? this.entities.pick(ray, (c) => c.kind !== 'chicken' || c.owner !== PLAYER) : null;

    // hover info
    if (this.hoverCreature) {
      this.hud.setInfo(creatureInfo(this.hoverCreature));
      this.hud.tooltip(null);
    } else if (this.hoverTile && overCanvas) {
      this.hud.setInfo(this.tileInfo(this.hoverTile));
      this.hud.tooltip(this.modeTip(), inp.x, inp.y);
    } else this.hud.tooltip(null);

    if (!overCanvas) {
      this.dragTag = 0;
      return;
    }

    const ht = this.hoverTile;
    const hc = this.hoverCreature;
    const m = g.map;

    // right click
    if (inp.pressed.includes(2)) {
      if (this.mode.kind !== 'hand') this.setMode({ kind: 'hand' });
      else if (this.held.length && ht) this.drop(ht);
      else if (hc) this.slap(hc);
    }

    // left click
    if (inp.pressed.includes(0)) {
      this.dragLast = -1;
      if (this.mode.kind === 'spell') {
        const key = this.mode.key;
        const def = SPELLS[key];
        const target = def.target === 'creature' || def.target === 'enemy' ? hc : null;
        const px2 = ht ? ht.point.x : 0,
          pz2 = ht ? ht.point.z : 0;
        const tx = ht ? ht.x + 0.5 : hc ? hc.x : 0;
        const tz = ht ? ht.z + 0.5 : hc ? hc.z : 0;
        const useX = def.target === 'area' ? px2 : tx,
          useZ = def.target === 'area' ? pz2 : tz;
        const err = ht || hc ? castSpell(g, key, hc && (def.target === 'creature' || def.target === 'enemy') ? hc.x : useX, hc && (def.target === 'creature' || def.target === 'enemy') ? hc.z : useZ, target) : 'No target';
        if (err) {
          this.hud.message(err, '#a08070');
          this.sfx.play('deny');
        } else {
          this.hand.trigger('cast');
          if (key === 'possess') this.setMode({ kind: 'hand' });
        }
      } else if (this.mode.kind === 'hand') {
        if (hc && hc.owner === PLAYER && hc.kind !== 'chicken') this.pickUp(hc);
        else if (ht) {
          const i = m.idx(ht.x, ht.z);
          if (!isSolid(m.tile[i]) && m.gold[i] > 0 && m.revealed[i]) {
            g.keeper.addGold(m.gold[i]);
            g.fx('coins', ht.x + 0.5, ht.z + 0.5, 0.3, 8);
            m.gold[i] = 0;
            this.hand.trigger('grab');
            this.sfx.play('coins');
          } else if (this.canTag(i)) {
            this.dragTag = m.tagged[i] ? -1 : 1;
          }
        }
      } else if (this.mode.kind === 'build' || this.mode.kind === 'sell') {
        this.dragTag = 2;
      }
    }
    if (!inp.down[0]) this.dragTag = 0;

    // drag painting
    if (this.dragTag && ht) {
      const i = m.idx(ht.x, ht.z);
      if (i !== this.dragLast) {
        this.dragLast = i;
        if (this.mode.kind === 'build') {
          const err = g.canBuild(ht.x, ht.z, this.mode.room);
          if (!err) g.build(ht.x, ht.z, this.mode.room);
          else if (inp.pressed.includes(0)) {
            this.hud.message(err, '#a08070');
            this.sfx.play('deny');
          }
        } else if (this.mode.kind === 'sell') g.sell(ht.x, ht.z);
        else if (this.dragTag === 1 || this.dragTag === -1) {
          if (this.canTag(i) && g.tagDig(ht.x, ht.z, this.dragTag === 1)) this.sfx.play(this.dragTag === 1 ? 'tag' : 'untag', 0.5);
        }
      }
    }
  }

  canTag(i: number) {
    const m = this.game!.map;
    const t = m.tile[i];
    return isDiggable(t) || (t === Tile.Wall && m.owner[i] === HEROES && !!m.revealed[i]);
  }

  solidForPick(x: number, z: number) {
    const m = this.game!.map;
    if (!m.inBounds(x, z)) return true;
    const i = m.idx(x, z);
    if (!m.revealed[i]) return true;
    return isSolid(m.tile[i]);
  }

  private tileInfo(h: TileHit): string {
    const g = this.game!;
    const m = g.map;
    const i = m.idx(h.x, h.z);
    const t = m.tile[i];
    if (!m.revealed[i] && !isSolid(t)) return '<b>Earth</b><br><span class="dim">Unexplored soil.</span>';
    if (!m.revealed[i] && t === Tile.Wall) return '<b>Earth</b><br><span class="dim">Unexplored soil.</span>';
    const names: Record<number, string> = { 0: 'Impenetrable Rock', 1: 'Earth', 2: 'Gold Seam', 3: 'Gem Seam', 4: 'Fortified Wall', 5: 'Dirt Path', 6: 'Claimed Floor', 7: 'Water', 8: 'Lava' };
    let s = `<b>${names[t]}</b>`;
    const r = m.room[i] as Room;
    if (r !== Room.None && ROOMS[r]) s = `<b style="color:${ROOMS[r].color}">${ROOMS[r].name}</b>`;
    const o = m.owner[i];
    if (o) s += ` <span style="color:${OWNER_CSS[o]}">(${o === PLAYER ? 'yours' : 'heroes'})</span>`;
    if (t === Tile.Gold) s += `<br><span class="dim">Holds ~${m.gold[i]} gold.</span>`;
    if (t === Tile.Gems) s += '<br><span class="dim">Inexhaustible riches.</span>';
    if (m.tagged[i]) s += '<br><span style="color:#f0c050">Marked for digging.</span>';
    if (!isSolid(t) && m.gold[i] > 0) s += `<br><span style="color:#f0c050">${m.gold[i]} gold lies here.</span>`;
    if (r !== Room.None && ROOMS[r]) {
      const inst = g.rooms[m.roomId[i]];
      if (inst) s += `<br><span class="dim">${inst.tiles.length} tiles.</span> ${ROOMS[r].desc}`;
      if (r === Room.Treasury) s += `<br><span class="dim">Stores ${Math.round(1000 * g.rules.treasuryMul)} gold per tile.</span>`;
    }
    return s;
  }

  private modeTip(): string | null {
    const g = this.game!;
    const h = this.hoverTile;
    if (!h) return null;
    if (this.mode.kind === 'build') {
      const err = g.canBuild(h.x, h.z, this.mode.room);
      return `<b>${ROOMS[this.mode.room].name}</b> ${g.roomCost(this.mode.room)}g${err ? `<br><span class="warn">${err}</span>` : ''}`;
    }
    if (this.mode.kind === 'spell') return `<b style="color:#c8a0ff">${SPELLS[this.mode.key].name}</b>`;
    if (this.mode.kind === 'sell') return '<b class="warn">Sell</b>';
    return null;
  }

  private updateHand(dt: number) {
    const g = this.game!;
    const h = this.hoverTile;
    const hc = this.hoverCreature;
    const visible = !!h && !this.possession.active && !this.input.overUI && !this.demo && !this.overlayOpen;
    this.hand.root.visible = visible;
    this.fx.cursorLight.on = visible;
    if (h) {
      const p = h.point.clone();
      if (hc) {
        p.x = hc.x;
        p.z = hc.z;
        p.y = hc.y + 0.4;
      }
      if (h.top) p.y = Math.max(p.y, WALL_H - 0.35);
      this.hand.setTarget(p);
      this.fx.cursorLight.x = p.x;
      this.fx.cursorLight.y = p.y + 1.1;
      this.fx.cursorLight.z = p.z;
    }
    this.hand.update(dt, this.time, this.cam.yaw, this.held.length > 0);

    // dangling held creature
    const top = this.held[this.held.length - 1] ?? null;
    if (!top && this.heldView) {
      this.hand.root.remove(this.heldView.rig.root);
      this.heldView.dispose();
      this.heldView = null;
    } else if (top && (!this.heldView || this.heldView.c !== top)) {
      if (this.heldView) {
        this.hand.root.remove(this.heldView.rig.root);
        this.heldView.dispose();
      }
      this.heldView = new CreatureView(top);
      this.hand.root.add(this.heldView.rig.root);
    }
    if (this.heldView && top) {
      top.anim = 'held';
      this.heldView.update(dt, false, this.time);
      const r = this.heldView.rig.root;
      r.position.set(0, -0.35 - this.heldView.rig.spec.height * top.def.scale, 0.1);
      r.rotation.set(0, Math.PI + Math.sin(this.time) * 0.3, 0);
      r.scale.setScalar(1 / 1.25);
    }

    // tile cursor
    const m = g.map;
    this.cursor.visible = visible;
    if (h) {
      const i = m.idx(h.x, h.z);
      const solid = this.solidForPick(h.x, h.z);
      this.cursor.position.set(h.x + 0.5, solid ? WALL_H + 0.03 : 0.03, h.z + 0.5);
      let col = 0xffcc44;
      if (this.mode.kind === 'build') col = g.canBuild(h.x, h.z, this.mode.room) ? 0xff3020 : 0x40ff60;
      else if (this.mode.kind === 'sell') col = 0xff4020;
      else if (this.mode.kind === 'spell') col = 0xb070ff;
      else if (solid && !this.canTag(i)) col = 0x606060;
      this.cursorMat.color.setHex(col);
      this.cursorMat.opacity = 0.22 + Math.sin(this.time * 6) * 0.08;
    }
  }
}
