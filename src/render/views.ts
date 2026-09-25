import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Creature } from '../game/entity';
import { PLAYER, HEROES, WALL_H } from '../game/defs';
import { makeRig, Rig } from './models';
import { createModelMaterial } from './ps1';
import { GeoBuilder, M } from './builder';
import { Tex } from './textures';

const OWNER_COL: Record<number, [number, number, number]> = {
  0: [0.7, 0.7, 0.7],
  1: [0.9, 0.15, 0.1],
  2: [0.3, 0.55, 1],
};

export class CreatureView {
  rig: Rig;
  mat: THREE.ShaderMaterial;
  tint = new THREE.Vector4();
  deadT = 0;
  constructor(public c: Creature) {
    this.mat = createModelMaterial({ tint: this.tint });
    this.rig = makeRig(c.kind, this.mat, c.def.scale);
    this.rig.root.userData.creature = c;
  }

  dispose() {
    this.mat.dispose();
  }

  update(dt: number, hovered: boolean, time: number) {
    const c = this.c;
    const r = this.rig;
    const p = r.p;
    const b = r.base;
    const spec = r.spec;
    // reset pose
    for (const k in p) {
      p[k].rotation.set(0, 0, 0);
      p[k].position.copy(b[k]);
    }
    r.pivot.rotation.set(0, 0, 0);
    r.pivot.position.set(0, 0, 0);

    const lvlScale = 1 + (c.level - 1) * 0.025;
    r.pivot.scale.setScalar(c.def.scale * lvlScale);

    r.root.position.set(c.x, c.y, c.z);
    r.root.rotation.y = c.angle;
    if (c.carriedBy) {
      // slung over an imp's shoulders
      r.root.position.y = 0.55;
      r.root.rotation.y = c.carriedBy.angle + Math.PI / 2;
    }

    const t = c.animT;
    const anim = c.alive ? c.anim : 'dead';
    const walkSpeed = c.speed * 5.2 / Math.max(0.6, c.def.scale);
    const ph = time * walkSpeed + c.id;

    if (spec.hover) {
      p.body.position.y = b.body.y + Math.sin(time * 3 + c.id) * 0.06;
      if (p.head) p.head.position.y = b.head.y;
    }

    const walkBiped = (amp = 0.7) => {
      const s = Math.sin(ph);
      if (p.legL) p.legL.rotation.x = s * amp;
      if (p.legR) p.legR.rotation.x = -s * amp;
      if (p.armL) p.armL.rotation.x = -s * amp * 0.7;
      if (p.armR) p.armR.rotation.x = s * amp * 0.7;
      p.body.position.y = b.body.y + Math.abs(Math.cos(ph)) * 0.035;
    };
    const walkLegs = (amp = 0.6) => {
      const s = Math.sin(ph);
      if (p.legFL) {
        p.legFL.rotation.x = s * amp;
        p.legBR.rotation.x = s * amp;
        p.legFR.rotation.x = -s * amp;
        p.legBL.rotation.x = -s * amp;
      }
      for (let k = 0; k < 8; k++) {
        const L = p['leg' + k];
        if (L) L.rotation.y = Math.sin(ph * 1.5 + k * 1.3) * 0.4;
      }
      if (p.legL && spec.type === 'chicken') {
        p.legL.rotation.x = s * 0.8;
        p.legR.rotation.x = -s * 0.8;
      }
      p.body.position.y += Math.abs(Math.cos(ph)) * 0.02;
    };
    const wings = (rate: number, amp: number) => {
      if (p.wingL) {
        p.wingL.rotation.z = Math.sin(time * rate) * amp;
        p.wingR.rotation.z = -Math.sin(time * rate) * amp;
      }
    };
    if (c.def.flying) wings(28, 0.7);
    else wings(2, 0.12);
    if (p.tail) p.tail.rotation.y = Math.sin(time * 3 + c.id) * 0.4;

    const biped = spec.type === 'biped';
    switch (anim) {
      case 'walk':
      case 'carry':
        if (biped) {
          walkBiped();
          if (anim === 'carry' && p.armL) {
            p.armL.rotation.x = -1.3;
            p.armR.rotation.x = -1.3;
          }
        } else walkLegs();
        break;
      case 'dig': {
        const sw = (t % 0.55) / 0.55;
        const a = sw < 0.6 ? -2.6 + (sw / 0.6) * 0.3 : -2.3 + ((sw - 0.6) / 0.4) * 2.0;
        if (biped) {
          p.armR.rotation.x = a;
          p.armL.rotation.x = a * 0.8;
          p.body.rotation.x = 0.15 + (sw > 0.6 ? 0.2 : 0);
        } else {
          p.head.rotation.x = Math.sin(t * 12) * 0.3;
          walkLegs(0.2);
        }
        break;
      }
      case 'work': {
        if (biped) {
          p.body.rotation.x = 0.4;
          p.armL.rotation.x = -1.2 + Math.sin(t * 10) * 0.5;
          p.armR.rotation.x = -1.2 - Math.sin(t * 10) * 0.5;
          p.body.position.y = b.body.y - 0.06;
          if (p.legL) {
            p.legL.rotation.x = -0.4;
            p.legR.rotation.x = 0.2;
          }
        } else p.head.rotation.x = Math.sin(t * 10) * 0.2;
        break;
      }
      case 'attack':
      case 'train': {
        const dur = 0.4;
        const k = Math.min(1, (t % (anim === 'train' ? 0.9 : 99)) / dur);
        const swing = k < 0.35 ? -2.4 * (k / 0.35) : -2.4 + ((k - 0.35) / 0.65) * 2.6;
        if (biped) {
          p.armR.rotation.x = swing;
          p.body.rotation.y = k < 0.35 ? 0.3 : 0.3 - (k - 0.35) * 0.9;
          p.body.rotation.x = k > 0.35 ? 0.15 : 0;
        } else {
          // lunge
          p.body.position.z = b.body.z + Math.sin(k * Math.PI) * 0.15;
          p.head.rotation.x = -Math.sin(k * Math.PI) * 0.5;
        }
        break;
      }
      case 'cast': {
        const k = Math.min(1, t / 0.5);
        if (biped) {
          p.armR.rotation.x = -1.7 + Math.sin(k * Math.PI) * -0.4;
          p.armL.rotation.x = -1.4;
          p.body.rotation.x = -0.1;
        } else p.head.rotation.x = -0.4 * Math.sin(k * Math.PI);
        break;
      }
      case 'research':
        if (biped) {
          p.armL.rotation.x = -1.1;
          p.armR.rotation.x = -1.1;
          p.armL.rotation.z = 0.3;
          p.armR.rotation.z = -0.3;
          p.head.rotation.x = 0.4 + Math.sin(time * 0.7 + c.id) * 0.1;
          p.head.rotation.y = Math.sin(time * 0.4 + c.id) * 0.3;
        }
        break;
      case 'pray':
        if (biped) {
          p.armL.rotation.x = -2.8 + Math.sin(time * 2) * 0.2;
          p.armR.rotation.x = -2.8 + Math.sin(time * 2) * 0.2;
          p.body.rotation.x = Math.sin(time * 2) * 0.2;
        }
        break;
      case 'sleep':
        r.pivot.rotation.z = Math.PI / 2;
        r.pivot.position.y = 0.12 * c.def.scale;
        r.pivot.position.x = -0.2 * c.def.scale;
        p.body.scale?.setScalar(1);
        p.body.position.y = b.body.y + Math.sin(time * 1.5 + c.id) * 0.015;
        if (!biped) {
          r.pivot.rotation.z = 0;
          r.pivot.position.set(0, -b.body.y * 0.4, 0);
        }
        break;
      case 'eat':
        if (biped) {
          p.armR.rotation.x = -2 + Math.sin(time * 9) * 0.4;
          p.head.rotation.x = 0.2 + Math.sin(time * 9) * 0.15;
        } else p.head.rotation.x = 0.4 + Math.sin(time * 9) * 0.2;
        break;
      case 'held': {
        const sw = Math.sin(time * 4 + c.id);
        if (biped) {
          p.armL.rotation.x = -2.9;
          p.armR.rotation.x = -2.9;
          p.legL.rotation.x = sw * 0.5;
          p.legR.rotation.x = -sw * 0.5;
        } else walkLegs(0.8);
        r.pivot.rotation.z = sw * 0.15;
        break;
      }
      case 'stunned':
        r.pivot.rotation.z = Math.sin(time * 10) * 0.1;
        if (p.head) p.head.rotation.y = Math.sin(time * 6) * 0.4;
        break;
      case 'dead': {
        const k = Math.min(1, this.deadT / 0.5);
        r.pivot.rotation.x = -(Math.PI / 2) * k;
        r.pivot.position.y = 0.1 * k;
        if (biped) {
          p.armL.rotation.z = 0.6;
          p.armR.rotation.z = -0.6;
        }
        const left = c.decayAt - c.deathT;
        if (left < 1.5 && !c.carriedBy) r.root.position.y -= (1.5 - left) * 0.3;
        break;
      }
      default: {
        // idle breathing / looking around
        if (biped) {
          p.body.position.y = b.body.y + Math.sin(time * 2 + c.id) * 0.012;
          p.head.rotation.y = Math.sin(time * 0.6 + c.id * 3) * 0.35;
          p.armL.rotation.z = 0.08;
          p.armR.rotation.z = -0.08;
          if (c.kind === 'imp' && Math.sin(time * 0.3 + c.id) > 0.95) {
            // mischievous little hop
            r.pivot.position.y = Math.abs(Math.sin(time * 10)) * 0.08;
          }
        } else if (p.head) p.head.rotation.y = Math.sin(time * 0.8 + c.id) * 0.3;
      }
    }

    // tint: hit flash, hover highlight, possession
    this.tint.set(0, 0, 0, 0);
    if (c.hitFlash > 0) this.tint.set(0.9, 0.2, 0.15, 0);
    else if (hovered) this.tint.set(0.25, 0.2, 0.12, 0);
    else if (c.shieldT > 0) this.tint.set(0.25, 0.25, 0.05, 0);
    else if (c.speedT > 0) this.tint.set(0.0, 0.12, 0.25, 0);
    if (!c.alive) {
      this.deadT += dt;
    }
    void WALL_H;
  }
}

// ---------------------------------------------------------------------------

export class EntityRenderer {
  group = new THREE.Group();
  views = new Map<number, CreatureView>();
  bars: THREE.Mesh;
  private barGeo: THREE.BufferGeometry;
  private barPos = new Float32Array(4096 * 3);
  private barCol = new Float32Array(4096 * 3);
  hovered: Creature | null = null;
  firstPerson = false;
  private staticMat: THREE.ShaderMaterial;
  private goldMesh: THREE.Mesh | null = null;
  private crateMesh: THREE.Mesh | null = null;
  private goldSig = '';
  private crateSig = '';
  private staticT = 0;

  constructor(public game: Game) {
    this.barGeo = new THREE.BufferGeometry();
    this.barGeo.setAttribute('position', new THREE.BufferAttribute(this.barPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.barGeo.setAttribute('color', new THREE.BufferAttribute(this.barCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.bars = new THREE.Mesh(this.barGeo, new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.bars.renderOrder = 10;
    this.bars.frustumCulled = false;
    this.group.add(this.bars);
    this.staticMat = createModelMaterial();
  }

  setGame(g: Game) {
    for (const v of this.views.values()) {
      this.group.remove(v.rig.root);
      v.dispose();
    }
    this.views.clear();
    this.game = g;
    this.goldSig = '';
    this.crateSig = '';
  }

  update(dt: number, time: number, camera: THREE.Camera, heldIds: Set<number>) {
    const g = this.game;
    const seen = new Set<number>();
    for (const c of g.creatures) {
      if (c.removed) continue;
      if (heldIds.has(c.id)) continue;
      const visible = g.isVisible(c.x, c.z) || c.owner === PLAYER;
      let v = this.views.get(c.id);
      if (!v) {
        v = new CreatureView(c);
        this.views.set(c.id, v);
        this.group.add(v.rig.root);
      }
      seen.add(c.id);
      v.rig.root.visible = visible;
      if (visible) v.update(dt, c === this.hovered, time);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.group.remove(v.rig.root);
        v.dispose();
        this.views.delete(id);
      }
    }
    this.updateBars(camera);
    this.staticT -= dt;
    if (this.staticT <= 0) {
      this.staticT = 0.2;
      this.updateStatic();
    }
  }

  private updateBars(camera: THREE.Camera) {
    const g = this.game;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    let n = 0;
    const P = this.barPos,
      C = this.barCol;
    const quad = (cx: number, cy: number, cz: number, x0: number, x1: number, y0: number, y1: number, col: [number, number, number]) => {
      if (n + 6 > 4096) return;
      const pts = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y0],
        [x1, y1],
        [x0, y1],
      ];
      for (const [px, py] of pts) {
        P[n * 3] = cx + right.x * px + up.x * py;
        P[n * 3 + 1] = cy + right.y * px + up.y * py;
        P[n * 3 + 2] = cz + right.z * px + up.z * py;
        C[n * 3] = col[0];
        C[n * 3 + 1] = col[1];
        C[n * 3 + 2] = col[2];
        n++;
      }
    };
    for (const c of g.creatures) {
      if (!c.alive || c.kind === 'chicken' || c.removed || c.state === 'ko' || c.state === 'carried' || c.carriedBy) continue;
      const v = this.views.get(c.id);
      if (!v || !v.rig.root.visible) continue;
      let show = c.hp < c.maxHp - 0.5 || c === this.hovered || c.state === 'fight' || c.def.boss;
      if (this.firstPerson && c.owner === PLAYER) show = false;
      if (!show) continue;
      const h = v.rig.spec.height * c.def.scale + 0.25 + (v.rig.spec.hover || 0);
      const cx = c.x,
        cy = c.y + h,
        cz = c.z;
      const w = c.def.boss ? 0.5 : 0.28;
      const f = Math.max(0, c.hp / c.maxHp);
      const oc = OWNER_COL[c.owner] ?? OWNER_COL[0];
      quad(cx, cy, cz, -w - 0.03, w + 0.03, -0.045, 0.045, [0.02, 0.02, 0.02]);
      quad(cx, cy, cz, -w, -w + 2 * w * f, -0.025, 0.025, [1 - f, 0.25 + f * 0.7, 0.1]);
      // owner flag with level pips
      quad(cx, cy, cz, -w - 0.12, -w - 0.04, -0.045, 0.045, oc);
      for (let k = 0; k < Math.min(10, c.level); k++) {
        const px = -w + k * 0.055;
        quad(cx, cy, cz, px, px + 0.035, 0.06, 0.09, c.owner === HEROES ? [0.8, 0.85, 1] : [1, 0.8, 0.2]);
      }
    }
    this.barGeo.setDrawRange(0, n);
    (this.barGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.barGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  // loose gold piles on the floor and unopened crates
  private updateStatic() {
    const g = this.game;
    const m = g.map;
    let sig = '';
    for (let i = 0; i < m.gold.length; i++) {
      if (m.gold[i] > 0 && m.tile[i] >= 5 && m.revealed[i]) sig += i + ':' + Math.ceil(m.gold[i] / 100) + ',';
    }
    if (sig !== this.goldSig) {
      this.goldSig = sig;
      if (this.goldMesh) {
        this.group.remove(this.goldMesh);
        this.goldMesh.geometry.dispose();
        this.goldMesh = null;
      }
      const b = new GeoBuilder();
      for (let i = 0; i < m.gold.length; i++) {
        if (!(m.gold[i] > 0 && m.tile[i] >= 5 && m.revealed[i])) continue;
        const x = (i % m.w) + 0.5,
          z = ((i / m.w) | 0) + 0.5;
        const size = Math.min(1, 0.3 + m.gold[i] / 600);
        goldPile(b, x, z, size, m.variant[i]);
      }
      if (!b.empty) {
        this.goldMesh = new THREE.Mesh(b.build(), this.staticMat);
        this.group.add(this.goldMesh);
      }
    }
    let csig = '';
    for (const c of g.crates) if (!c.opened && g.isVisible(c.x, c.z)) csig += c.id + ',';
    if (csig !== this.crateSig) {
      this.crateSig = csig;
      if (this.crateMesh) {
        this.group.remove(this.crateMesh);
        this.crateMesh = null;
      }
      const b = new GeoBuilder();
      for (const c of g.crates) {
        if (c.opened || !g.isVisible(c.x, c.z)) continue;
        b.box(M(c.x, 0.17, c.z, 0, 0.4, 0), 0.34, 0.34, 0.34, { color: 0x9a6a3a, layer: Tex.Wood });
        b.box(M(c.x, 0.17, c.z, 0, 0.4, 0), 0.36, 0.06, 0.36, { color: 0x505058, layer: Tex.Metal });
        b.box(M(c.x, 0.36, c.z, 0, 0.4, 0), 0.08, 0.04, 0.08, { color: 0xffd040, layer: Tex.GoldCoins });
      }
      if (!b.empty) {
        this.crateMesh = new THREE.Mesh(b.build(), this.staticMat);
        this.group.add(this.crateMesh);
      }
    }
  }

  // Pick the creature nearest to the screen ray.
  pick(ray: THREE.Ray, filter: (c: Creature) => boolean): Creature | null {
    let best: Creature | null = null;
    let bd = Infinity;
    const tmp = new THREE.Vector3();
    for (const [, v] of this.views) {
      const c = v.c;
      if (!c.alive || !v.rig.root.visible || !filter(c)) continue;
      const h = v.rig.spec.height * c.def.scale;
      const r = Math.max(0.28, 0.3 * c.def.scale);
      tmp.set(c.x, c.y + h * 0.5 + (v.rig.spec.hover || 0), c.z);
      const dist = ray.distanceSqToPoint(tmp);
      if (dist < r * r * 2.2) {
        const along = tmp.clone().sub(ray.origin).dot(ray.direction);
        if (along < bd) {
          bd = along;
          best = c;
        }
      }
    }
    return best;
  }
}

export function goldPile(b: GeoBuilder, x: number, z: number, size: number, seed: number) {
  const n = 2 + Math.floor(size * 4);
  for (let k = 0; k < n; k++) {
    const a = (seed * 0.37 + k * 2.3) % (Math.PI * 2);
    const r = k === 0 ? 0 : 0.08 + ((seed + k * 13) % 7) * 0.02 * size;
    const h = 0.06 + size * 0.14 * (k === 0 ? 1.4 : 0.8);
    const rad = 0.08 + size * 0.1;
    b.cyl(M(x + Math.cos(a) * r, 0, z + Math.sin(a) * r), rad, rad * 0.35, h, 6, { color: 0xffffff, layer: Tex.GoldCoins });
  }
}
