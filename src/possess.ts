import * as THREE from 'three';
import type { App } from './app';
import type { Creature } from './game/entity';
import { isSolid, Tile, PLAYER, isDiggable } from './game/defs';
import { hostile, targetable, fire, dmgMul } from './game/combat';
import { rigSpec } from './render/models';

// First-person control of one of your minions.
export class Possession {
  active = false;
  target: Creature | null = null;
  camera = new THREE.PerspectiveCamera(72, 1, 0.05, 40);
  yaw = 0;
  pitch = 0;
  private hudEl: HTMLElement | null = null;
  private bob = 0;
  private digT = 0;

  constructor(private app: App) {}

  begin(c: Creature) {
    this.active = true;
    this.target = c;
    this.yaw = c.angle + Math.PI;
    this.pitch = -0.1;
    c.state = 'possessed';
    c.path = null;
    c.target = null;
    this.app.game?.releaseJob(c);
    const canvas = this.app.renderer.domElement;
    canvas.requestPointerLock?.();
    this.hudEl = document.createElement('div');
    this.hudEl.innerHTML = `<div class="crosshair"></div><div class="possess-hud"><div id="p-name"></div><div class="dim">WASD move · Mouse look · Left-click attack${c.isImp ? '/dig' : ''} · Right-click or Esc to release</div></div>`;
    this.app.ui.appendChild(this.hudEl);
    this.app.hud.show(false);
    this.app.sfx.play('summon');
  }

  release() {
    if (!this.active) return;
    this.active = false;
    if (this.target && this.target.alive) {
      this.target.state = 'idle';
      this.target.thinkCd = 0;
    }
    this.target = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hudEl?.remove();
    this.hudEl = null;
    if (this.app.game) this.app.hud.show(true);
  }

  update(dt: number) {
    const app = this.app;
    const g = app.game;
    const c = this.target;
    const inp = app.input;
    if (!g || !c || !c.alive || c.removed) {
      this.release();
      return;
    }
    if (inp.pressed.includes(2) || inp.keyPressed.includes('Escape')) {
      this.release();
      return;
    }
    // look
    const locked = !!document.pointerLockElement;
    if (locked) {
      this.yaw -= inp.lockDX * 0.0028;
      this.pitch -= inp.lockDY * 0.0028;
    } else {
      // fallback: steer with keys when pointer lock is unavailable
      if (inp.keys.has('q') || inp.keys.has('ArrowLeft')) this.yaw += dt * 2.2;
      if (inp.keys.has('e') || inp.keys.has('ArrowRight')) this.yaw -= dt * 2.2;
      if (inp.pressed.includes(0) && !locked) app.renderer.domElement.requestPointerLock?.();
    }
    this.pitch = Math.max(-1.1, Math.min(0.9, this.pitch));

    // move
    const k = inp.keys;
    let fwd = 0,
      side = 0;
    if (k.has('w') || k.has('ArrowUp')) fwd += 1;
    if (k.has('s') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('a')) side += 1;
    if (k.has('d')) side -= 1;
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const sx = -Math.cos(this.yaw),
      sz = Math.sin(this.yaw);
    let mx = fx * fwd + sx * side,
      mz = fz * fwd + sz * side;
    const ml = Math.hypot(mx, mz);
    c.angle = Math.atan2(fx, fz);
    if (ml > 0) {
      mx /= ml;
      mz /= ml;
      const sp = c.speed * 1.15 * dt;
      const r = 0.22;
      const nx = c.x + mx * sp;
      const nz = c.z + mz * sp;
      if (this.free(nx + Math.sign(mx) * r, c.z, c)) c.x = nx;
      if (this.free(c.x, nz + Math.sign(mz) * r, c)) c.z = nz;
      this.bob += dt * c.speed * 5;
      c.anim = 'walk';
      c.moving = true;
    } else {
      c.moving = false;
      if (c.anim === 'walk') c.anim = 'idle';
    }

    // attack / dig
    if (inp.down[0] && locked) this.attack(c, dt);
    if (c.anim === 'attack' && c.animT > 0.45) c.anim = 'idle';

    // camera
    const spec = rigSpec(c.kind);
    const eye = (spec.height * 0.88 + spec.hover) * c.def.scale + Math.abs(Math.sin(this.bob)) * 0.03;
    this.camera.position.set(c.x, c.y + eye, c.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // keep fog of war revealed around the host
    g.revealAround(c.tx, c.tz, 5);

    const nm = this.hudEl?.querySelector('#p-name') as HTMLElement | null;
    if (nm) nm.innerHTML = `<b style="color:#ff8a60">${c.def.name}</b> Lv ${c.level} · HP ${Math.ceil(c.hp)}/${c.maxHp}`;
  }

  private free(x: number, z: number, c: Creature) {
    const g = this.app.game!;
    return g.walkableFor(c, Math.floor(x), Math.floor(z));
  }

  private attack(c: Creature, dt: number) {
    const g = this.app.game!;
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    // find enemy in the forward cone
    let best: Creature | null = null;
    let bd = c.def.ranged ? c.def.ranged.range : 1.4;
    for (const e of g.creatures) {
      if (!targetable(e) || !hostile(c, e)) continue;
      const dx = e.x - c.x,
        dz = e.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > bd) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.8) continue;
      best = e;
      bd = d;
    }
    if (best) {
      const d = Math.hypot(best.x - c.x, best.z - c.z);
      if (d < 1.2 + best.def.scale * 0.2) {
        if (c.attackCd <= 0) {
          c.attackCd = c.def.attackRate * 0.8;
          c.anim = 'attack';
          c.animT = 0;
          g.damage(best, c.dmg * dmgMul(g, c) * 1.25, c);
          g.fx('hit', best.x, best.z, 0.7, 5);
          this.app.sfx.play('hit');
        }
      } else if (c.def.ranged && c.rangedCd <= 0) {
        c.rangedCd = c.def.ranged.rate * 0.7;
        c.anim = 'cast';
        c.animT = 0;
        fire(g, c, best, c.def.ranged.kind, c.def.ranged.dmg * 1.25, c.def.ranged.speed, c.def.ranged.splash ?? 0);
      }
      return;
    }
    // swing at walls: imps can dig in first person
    const tx = Math.floor(c.x + fx * 0.7),
      tz = Math.floor(c.z + fz * 0.7);
    const m = g.map;
    if (!m.inBounds(tx, tz)) return;
    const i = m.idx(tx, tz);
    const t = m.tile[i];
    if (isSolid(t) && c.isImp && (isDiggable(t) || (t === Tile.Wall && m.owner[i] !== PLAYER))) {
      c.anim = 'dig';
      this.digT += dt;
      if (this.digT > 0.4) {
        this.digT = 0;
        m.hp[i] += 1.5;
        g.fx('chip', tx + 0.5 - fx * 0.5, tz + 0.5 - fz * 0.5, 0.8, 4);
        this.app.sfx.play(t === Tile.Gold ? 'dig_gold' : 'dig');
        if (t === Tile.Gold || t === Tile.Gems) {
          const amt = 40;
          g.keeper.addGold(amt);
          if (t === Tile.Gold) m.gold[i] -= amt;
          if (t === Tile.Gold && m.gold[i] <= 0) g.digOut(tx, tz);
        }
        if (t !== Tile.Gems && m.tile[i] !== Tile.Path && m.hp[i] >= g.digStrength(t, m.owner[i])) g.digOut(tx, tz);
      }
    } else if (c.attackCd <= 0) {
      c.attackCd = c.def.attackRate;
      c.anim = 'attack';
      c.animT = 0;
    }
  }
}
