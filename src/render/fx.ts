import * as THREE from 'three';
import { createFxMaterial, shared, MAX_DYN, createModelMaterial } from './ps1';
import { GeoBuilder, M } from './builder';
import { Tex } from './textures';
import type { Projectile } from '../game/combat';

const MAX_P = 3000;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  size: number;
  life: number;
  max: number;
  grav: number;
  drag: number;
}

interface DynLight {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  life: number;
  max: number;
}

export class FxSystem {
  group = new THREE.Group();
  private parts: Particle[] = [];
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private points: THREE.Points;
  private lights: DynLight[] = [];
  cursorLight = { x: 0, y: 1.2, z: 0, on: true, r: 0.55, g: 0.48, b: 0.38 };
  private projMeshes = new Map<number, THREE.Object3D>();
  private projGeo: Record<string, THREE.BufferGeometry> = {};
  private projMat: THREE.ShaderMaterial;
  private bolts: { mesh: THREE.Mesh; life: number }[] = [];
  private boltMat: THREE.MeshBasicMaterial;

  constructor() {
    this.pos = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 3);
    this.size = new Float32Array(MAX_P);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geo, createFxMaterial());
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.projMat = createModelMaterial({ tint: new THREE.Vector4(0, 0, 0, 1) });
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xd0e0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mk = (fn: (b: GeoBuilder) => void) => {
      const b = new GeoBuilder();
      fn(b);
      return b.build();
    };
    this.projGeo.fireball = mk((b) => b.sphere(M(), 0.12, 6, 4, { color: 0xffffff, layer: Tex.Flame }));
    this.projGeo.bolt = mk((b) => b.sphere(M(), 0.13, 6, 4, { color: 0xa0c0ff, layer: Tex.Flame }));
    this.projGeo.breath = mk((b) => b.sphere(M(), 0.1, 5, 3, { color: 0xffa040, layer: Tex.Flame }));
    this.projGeo.arrow = mk((b) => {
      b.box(M(0, 0, 0), 0.02, 0.02, 0.36, { color: 0x8a6a3a, layer: Tex.Wood });
      b.box(M(0, 0, 0.18), 0.04, 0.04, 0.06, { color: 0xc0c0c0, layer: Tex.Metal });
    });
    this.projGeo.heal = mk((b) => b.sphere(M(), 0.08, 5, 3, { color: 0x80ff90, layer: Tex.Flame }));
    this.projGeo.drain = mk((b) => b.sphere(M(), 0.09, 5, 3, { color: 0xff2020, layer: Tex.Flame }));
    this.projGeo.web = mk((b) => b.sphere(M(), 0.09, 5, 3, { color: 0xf0f0f0, layer: Tex.Plain }));
    this.projGeo.gas = mk((b) => b.sphere(M(), 0.16, 5, 3, { color: 0x90d040, layer: Tex.Flame }));
  }

  emit(x: number, y: number, z: number, n: number, o: { color: [number, number, number]; spread?: number; up?: number; speed?: number; size?: number; life?: number; grav?: number; drag?: number; jitter?: number }) {
    for (let k = 0; k < n; k++) {
      if (this.parts.length >= MAX_P) this.parts.shift();
      const sp = o.speed ?? 1.5;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const j = o.jitter ?? 0.15;
      const s = o.spread ?? 0.2;
      this.parts.push({
        x: x + (Math.random() - 0.5) * s,
        y: y + (Math.random() - 0.5) * s * 0.5,
        z: z + (Math.random() - 0.5) * s,
        vx: Math.cos(a) * sp * r,
        vy: (o.up ?? 1.5) * (0.5 + Math.random()),
        vz: Math.sin(a) * sp * r,
        r: o.color[0] * (1 - j + Math.random() * j * 2),
        g: o.color[1] * (1 - j + Math.random() * j * 2),
        b: o.color[2] * (1 - j + Math.random() * j * 2),
        size: (o.size ?? 0.08) * (0.7 + Math.random() * 0.6),
        life: 0,
        max: (o.life ?? 0.8) * (0.6 + Math.random() * 0.8),
        grav: o.grav ?? 5,
        drag: o.drag ?? 0.5,
      });
    }
  }

  light(x: number, y: number, z: number, r: number, g: number, b: number, radius: number, life: number) {
    this.lights.push({ x, y, z, r, g, b, radius, life, max: life });
    if (this.lights.length > MAX_DYN - 1) this.lights.shift();
  }

  // Named effect bursts triggered by game events.
  play(name: string, x: number, z: number, y = 0.5, n = 1) {
    switch (name) {
      case 'dust':
        this.emit(x, y, z, n * 2, { color: [0.45, 0.33, 0.24], spread: 0.8, up: 0.8, speed: 1.2, size: 0.12, life: 1, grav: 1, drag: 1.5 });
        break;
      case 'chip':
        this.emit(x, y, z, n * 2, { color: [0.5, 0.36, 0.24], spread: 0.1, up: 2, speed: 2, size: 0.05, life: 0.5, grav: 9 });
        break;
      case 'blood':
        this.emit(x, y, z, n, { color: [0.6, 0.02, 0.02], spread: 0.2, up: 2.2, speed: 2, size: 0.06, life: 0.7, grav: 9 });
        break;
      case 'hit':
        this.emit(x, y, z, n * 2, { color: [1, 0.9, 0.6], spread: 0.1, up: 1.5, speed: 3, size: 0.05, life: 0.25, grav: 4 });
        break;
      case 'fire':
        this.emit(x, y, z, n * 2, { color: [1, 0.5, 0.1], spread: 0.3, up: 1.8, speed: 2.2, size: 0.12, life: 0.5, grav: -1 });
        this.light(x, y + 0.3, z, 1.2, 0.6, 0.2, 3.5, 0.4);
        break;
      case 'gas':
        this.emit(x, y, z, n * 3, { color: [0.4, 0.7, 0.15], spread: 0.8, up: 0.4, speed: 0.8, size: 0.2, life: 1.2, grav: -0.2, drag: 2 });
        break;
      case 'web':
        this.emit(x, y, z, n * 2, { color: [0.85, 0.85, 0.85], spread: 0.3, up: 0.5, speed: 1, size: 0.05, life: 0.6, grav: 3 });
        break;
      case 'drain':
        this.emit(x, y, z, n * 2, { color: [0.8, 0.05, 0.15], spread: 0.3, up: 1.2, speed: 1.2, size: 0.07, life: 0.7, grav: -0.5 });
        break;
      case 'summon':
      case 'portal':
        this.emit(x, y, z, n, { color: [0.6, 0.25, 1], spread: 0.6, up: 2.5, speed: 1.2, size: 0.08, life: 1, grav: -0.5 });
        this.light(x, y + 0.5, z, 0.8, 0.3, 1.2, 4, 0.8);
        break;
      case 'herogate':
        this.emit(x, y, z, n, { color: [0.8, 0.9, 1], spread: 0.6, up: 2.5, speed: 1.2, size: 0.08, life: 1.2, grav: -0.5 });
        this.light(x, y + 0.5, z, 0.9, 1, 1.4, 5, 1.2);
        break;
      case 'claim':
        this.emit(x, y, z, n, { color: [1, 0.2, 0.15], spread: 0.8, up: 1.2, speed: 0.3, size: 0.06, life: 0.8, grav: -0.8 });
        break;
      case 'build':
        this.emit(x, y, z, n, { color: [1, 0.8, 0.3], spread: 0.9, up: 1.5, speed: 0.4, size: 0.06, life: 0.7, grav: -0.5 });
        break;
      case 'levelup':
        this.emit(x, y, z, n, { color: [0.5, 1, 0.4], spread: 0.5, up: 2.5, speed: 0.4, size: 0.07, life: 1.2, grav: -1 });
        this.light(x, y, z, 0.4, 1, 0.4, 3, 0.8);
        break;
      case 'coins':
        this.emit(x, y, z, n, { color: [1, 0.8, 0.2], spread: 0.2, up: 2.5, speed: 1, size: 0.05, life: 0.6, grav: 9 });
        break;
      case 'heal':
        this.emit(x, y, z, n, { color: [0.4, 1, 0.5], spread: 0.5, up: 1.5, speed: 0.3, size: 0.07, life: 1, grav: -1 });
        this.light(x, y, z, 0.3, 1, 0.4, 2.5, 0.6);
        break;
      case 'speed':
        this.emit(x, y, z, n, { color: [0.3, 0.8, 1], spread: 0.5, up: 1, speed: 1.5, size: 0.06, life: 0.6, grav: 0 });
        break;
      case 'protect':
        this.emit(x, y, z, n, { color: [0.9, 0.9, 0.4], spread: 0.6, up: 0.6, speed: 0.6, size: 0.07, life: 1, grav: 0 });
        break;
      case 'sight':
        this.emit(x, y, z, n, { color: [0.3, 0.6, 1], spread: 6, up: 0.6, speed: 0.3, size: 0.1, life: 1.5, grav: -0.3 });
        this.light(x, 2, z, 0.4, 0.6, 1.4, 8, 1.5);
        break;
      case 'feather':
        this.emit(x, y, z, n, { color: [0.95, 0.95, 0.9], spread: 0.3, up: 0.8, speed: 0.5, size: 0.05, life: 1, grav: 1, drag: 3 });
        break;
      case 'heartHit':
        this.emit(x, y, z, n * 2, { color: [1, 0.1, 0.1], spread: 0.6, up: 2, speed: 2, size: 0.08, life: 0.6, grav: 6 });
        break;
      case 'heartDie':
        this.emit(x, y, z, n * 3, { color: [1, 0.15, 0.05], spread: 1.5, up: 5, speed: 4, size: 0.14, life: 2, grav: 5 });
        this.light(x, y, z, 3, 0.5, 0.2, 10, 3);
        break;
      case 'crate':
        this.emit(x, y, z, n, { color: [1, 0.9, 0.5], spread: 0.4, up: 3, speed: 1.5, size: 0.07, life: 1, grav: 4 });
        this.light(x, y + 0.5, z, 1.2, 1, 0.5, 4, 1);
        break;
      case 'lightning': {
        const geo = new THREE.BufferGeometry();
        const pts: number[] = [];
        let px = x,
          pz = z;
        for (let yy = 7; yy > 0; yy -= 0.7) {
          const nx = x + (Math.random() - 0.5) * 0.6,
            nz = z + (Math.random() - 0.5) * 0.6;
          const ny = Math.max(0, yy - 0.7);
          const w = 0.06;
          pts.push(px - w, yy, pz, px + w, yy, pz, nx + w, ny, nz, px - w, yy, pz, nx + w, ny, nz, nx - w, ny, nz);
          pts.push(px, yy, pz - w, px, yy, pz + w, nx, ny, nz + w, px, yy, pz - w, nx, ny, nz + w, nx, ny, nz - w);
          px = nx;
          pz = nz;
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const mesh = new THREE.Mesh(geo, this.boltMat);
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.bolts.push({ mesh, life: 0.35 });
        this.light(x, 1.5, z, 2, 2.2, 3, 8, 0.5);
        this.emit(x, 0.2, z, 30, { color: [0.7, 0.8, 1], spread: 0.5, up: 3, speed: 3, size: 0.06, life: 0.5, grav: 6 });
        break;
      }
      case 'hellfire':
        for (let k = 0; k < 10; k++) {
          const ox = x + (Math.random() - 0.5) * 5,
            oz = z + (Math.random() - 0.5) * 5;
          this.emit(ox, 0.3, oz, 20, { color: [1, 0.45, 0.08], spread: 0.6, up: 3.5, speed: 2.5, size: 0.16, life: 0.9, grav: 2 });
        }
        this.light(x, 1.5, z, 3, 1.2, 0.3, 9, 1.2);
        break;
      default:
        this.emit(x, y, z, n, { color: [1, 1, 1], size: 0.05 });
    }
  }

  update(dt: number, projectiles: Projectile[]) {
    // particles
    let n = 0;
    const alive: Particle[] = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      alive.push(p);
      const f = 1 - p.life / p.max;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r * f;
      this.col[n * 3 + 1] = p.g * f;
      this.col[n * 3 + 2] = p.b * f;
      this.size[n] = p.size;
      n++;
    }
    this.parts = alive;
    this.geo.setDrawRange(0, n);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;

    // bolts
    for (const b of this.bolts) {
      b.life -= dt;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.life / 0.35);
      if (b.life <= 0) {
        this.group.remove(b.mesh);
        b.mesh.geometry.dispose();
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);

    // projectiles
    const seen = new Set<number>();
    for (const p of projectiles) {
      if (!p.alive) continue;
      seen.add(p.id);
      let m = this.projMeshes.get(p.id);
      if (!m) {
        m = new THREE.Mesh(this.projGeo[p.kind] ?? this.projGeo.fireball, this.projMat);
        this.projMeshes.set(p.id, m);
        this.group.add(m);
      }
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = Math.atan2(p.vx, p.vz);
      if (p.kind === 'fireball' || p.kind === 'breath' || p.kind === 'bolt') {
        this.emit(p.x, p.y, p.z, 1, { color: p.kind === 'bolt' ? [0.6, 0.7, 1] : [1, 0.5, 0.1], spread: 0.05, up: 0.3, speed: 0.3, size: 0.08, life: 0.3, grav: -1 });
      }
      if (p.kind === 'gas') this.emit(p.x, p.y, p.z, 1, { color: [0.4, 0.7, 0.15], spread: 0.2, up: 0.2, speed: 0.3, size: 0.12, life: 0.5, grav: 0 });
    }
    for (const [id, m] of this.projMeshes) {
      if (!seen.has(id)) {
        this.group.remove(m);
        this.projMeshes.delete(id);
      }
    }
    // lights for projectiles
    const glowing = projectiles.filter((p) => p.alive && (p.kind === 'fireball' || p.kind === 'bolt' || p.kind === 'breath'));

    // dynamic lights -> uniforms (slot 0 = hand)
    for (const l of this.lights) l.life -= dt;
    this.lights = this.lights.filter((l) => l.life > 0);
    const P = shared.uDynPos.value,
      C = shared.uDynCol.value;
    let k = 0;
    const cl = this.cursorLight;
    if (cl.on) {
      P[k].set(cl.x, cl.y, cl.z, 3.8);
      C[k].set(cl.r, cl.g, cl.b);
      k++;
    }
    for (const p of glowing) {
      if (k >= MAX_DYN) break;
      P[k].set(p.x, p.y, p.z, 2.6);
      if (p.kind === 'bolt') C[k].set(0.5, 0.6, 1.2);
      else C[k].set(1.1, 0.5, 0.15);
      k++;
    }
    for (const l of this.lights) {
      if (k >= MAX_DYN) break;
      const f = l.life / l.max;
      P[k].set(l.x, l.y, l.z, l.radius);
      C[k].set(l.r * f, l.g * f, l.b * f);
      k++;
    }
    for (; k < MAX_DYN; k++) {
      P[k].set(0, -100, 0, 0.001);
      C[k].set(0, 0, 0);
    }
  }
}
