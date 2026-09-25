import * as THREE from 'three';
import type { Game, RoomInst } from '../game/game';
import { Room, PLAYER } from '../game/defs';
import { GeoBuilder, M } from './builder';
import { Tex } from './textures';
import { createModelMaterial } from './ps1';
import { goldPile } from './views';

const PI = Math.PI;

export class RoomProps {
  group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private glowMat: THREE.ShaderMaterial;
  private heartTint = new THREE.Vector4(0, 0, 0, 0);
  private heartMat: THREE.ShaderMaterial;
  private staticMesh: THREE.Mesh | null = null;
  private dynamic: THREE.Object3D[] = [];
  private sig = '';
  private heart: THREE.Mesh | null = null;
  private vortices: { mesh: THREE.Mesh; speed: number }[] = [];
  private trapMesh: THREE.Mesh | null = null;
  private trapSig = -1;
  private doorMeshes = new Map<number, THREE.Mesh>();
  private doorGeo: Record<string, THREE.BufferGeometry> = {};

  constructor(public game: Game) {
    this.mat = createModelMaterial();
    this.glowMat = createModelMaterial({ tint: new THREE.Vector4(0, 0, 0, 1) });
    this.heartMat = createModelMaterial({ tint: this.heartTint });
  }

  setGame(g: Game) {
    this.game = g;
    this.sig = '';
    this.trapSig = -1;
  }

  private roomSeen(r: RoomInst): boolean {
    const m = this.game.map;
    return r.tiles.some((t) => m.revealed[t]);
  }

  private signature(): string {
    const g = this.game;
    let s = g.roomsVersion + '|' + Math.floor(g.keeper.gold / 250) + '|';
    for (const r of g.rooms) s += this.roomSeen(r) ? '1' : '0';
    s += '|';
    for (const [t] of g.bedOwner) s += t + ',';
    return s;
  }

  update(time: number) {
    const g = this.game;
    const sig = this.signature();
    if (sig !== this.sig) {
      this.sig = sig;
      this.rebuild();
    }
    // heart pulse
    if (this.heart) {
      const beat = Math.pow(Math.max(0, Math.sin(time * 3.2)), 8) * 0.12 + Math.pow(Math.max(0, Math.sin(time * 3.2 - 0.5)), 8) * 0.06;
      const hpF = g.keeper.heartHp / g.keeper.heartMax;
      this.heart.scale.setScalar(1 + beat);
      this.heart.rotation.y = time * 0.3;
      this.heart.position.y = 1.3 + Math.sin(time * 1.1) * 0.06;
      const hit = g.heartHit > 0 ? 0.8 : 0;
      this.heartTint.set(0.35 + beat * 2 + hit, 0.05 + hit * 0.5, 0.05 + hit * 0.5, 0);
      if (hpF < 0.3) this.heartTint.x += Math.sin(time * 10) * 0.2;
    }
    for (const v of this.vortices) v.mesh.rotation.z = time * v.speed;
    this.updateTraps();
  }

  private updateTraps() {
    const g = this.game;
    const m = g.map;
    if (g.trapsVersion !== this.trapSig) {
      this.trapSig = g.trapsVersion;
      if (this.trapMesh) {
        this.group.remove(this.trapMesh);
        this.trapMesh.geometry.dispose();
        this.trapMesh = null;
      }
      const b = new GeoBuilder();
      for (const [i, t] of g.traps) {
        const x = (i % m.w) + 0.5,
          z = ((i / m.w) | 0) + 0.5;
        b.box(M(x, 0.02, z), 0.7, 0.04, 0.7, { color: 0x3a3438, layer: Tex.Metal });
        if (t.key === 'spike') for (let k = 0; k < 9; k++) b.cyl(M(x - 0.2 + (k % 3) * 0.2, 0.04, z - 0.2 + Math.floor(k / 3) * 0.2), 0.035, 0, 0.12, 4, { color: 0x9a9aa4, layer: Tex.Metal });
        if (t.key === 'fire') b.box(M(x, 0.05, z), 0.4, 0.03, 0.4, { color: 0xff6010, layer: Tex.Flame });
        if (t.key === 'lightning') {
          b.cyl(M(x, 0.04, z), 0.04, 0.03, 0.5, 4, { color: 0x8a8aa0, layer: Tex.Metal });
          b.sphere(M(x, 0.56, z), 0.07, 5, 3, { color: 0x80a0ff, layer: Tex.Flame });
        }
        if (t.key === 'alarm') b.cyl(M(x, 0.04, z), 0.12, 0.05, 0.2, 6, { color: 0xc0a040, layer: Tex.Metal });
      }
      if (!b.empty) {
        this.trapMesh = new THREE.Mesh(b.build(), this.mat);
        this.group.add(this.trapMesh);
      }
      // doors
      for (const [i, mesh] of this.doorMeshes) {
        if (!g.doors.has(i)) {
          this.group.remove(mesh);
          this.doorMeshes.delete(i);
        }
      }
      for (const [i, d] of g.doors) {
        if (this.doorMeshes.has(i)) continue;
        const mesh = new THREE.Mesh(this.getDoorGeo(d.key), this.mat);
        mesh.position.set((i % m.w) + 0.5, 0, ((i / m.w) | 0) + 0.5);
        mesh.rotation.y = d.axis === 1 ? 0 : Math.PI / 2;
        this.group.add(mesh);
        this.doorMeshes.set(i, mesh);
      }
    }
    for (const [i, mesh] of this.doorMeshes) {
      const d = g.doors.get(i);
      if (!d) continue;
      mesh.children.length;
      mesh.position.y = -d.open * 1.1;
      mesh.visible = d.open < 0.99;
    }
  }

  private getDoorGeo(key: string): THREE.BufferGeometry {
    if (this.doorGeo[key]) return this.doorGeo[key];
    const b = new GeoBuilder();
    const iron = key === 'irondoor';
    // panel spans the corridor (x axis), studded, with banded frame
    b.box(M(0, 0.62, 0), 0.96, 1.24, 0.14, { color: iron ? 0x4a4a52 : 0x7a5230, layer: iron ? Tex.Metal : Tex.Wood });
    for (const y of [0.25, 0.95]) b.box(M(0, y, 0), 0.98, 0.08, 0.17, { color: iron ? 0x2a2a30 : 0x3a3a40, layer: Tex.Metal });
    b.box(M(0.3, 0.62, 0.09), 0.08, 0.08, 0.04, { color: 0xc09030, layer: Tex.Metal });
    b.box(M(0, 0.62, 0.08), 0.18, 0.24, 0.03, { color: 0xa01010, layer: Tex.Cloth });
    this.doorGeo[key] = b.build();
    return this.doorGeo[key];
  }

  private rebuild() {
    const g = this.game;
    const m = g.map;
    for (const d of this.dynamic) this.group.remove(d);
    this.dynamic = [];
    this.vortices = [];
    this.heart = null;
    if (this.staticMesh) {
      this.group.remove(this.staticMesh);
      this.staticMesh.geometry.dispose();
      this.staticMesh = null;
    }
    const b = new GeoBuilder();
    const w = m.w;
    const tileXZ = (i: number): [number, number] => [(i % w) + 0.5, ((i / w) | 0) + 0.5];
    const interior = (r: RoomInst, i: number) => {
      const x = i % w,
        z = (i / w) | 0;
      let n = 0;
      m.forNeighbors4(x, z, (nx, nz) => {
        if (m.roomId[m.idx(nx, nz)] === r.id) n++;
      });
      return n === 4;
    };

    // treasury gold: fill tiles in order
    let stored = Math.max(0, g.keeper.gold - g.rules.heartVault);
    const perTile = 1000 * g.rules.treasuryMul;

    for (const r of g.rooms) {
      if (!this.roomSeen(r)) continue;
      switch (r.type) {
        case Room.Heart: {
          const [cx, cz] = [r.cx, r.cz];
          if (r.owner !== PLAYER) break;
          // stepped obsidian dais
          b.cyl(M(cx, 0, cz), 1.4, 1.5, 0.14, 8, { color: 0x4a3a44, layer: Tex.WallTop });
          b.cyl(M(cx, 0.14, cz), 1.05, 1.2, 0.14, 8, { color: 0x5a4a52, layer: Tex.WallTop });
          b.cyl(M(cx, 0.28, cz), 0.55, 0.7, 0.3, 8, { color: 0x7a2a2a, layer: Tex.WallHeart });
          // a cage of great curved ribs
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * PI * 2;
            const ca = Math.cos(a),
              sa = Math.sin(a);
            for (let s = 0; s < 5; s++) {
              const t0 = s / 5;
              const rr = 1.05 - Math.pow(t0 - 0.2, 2) * 1.1;
              const y = 0.3 + t0 * 2.0;
              b.box(M(cx + ca * rr, y, cz + sa * rr, 0, -a, (0.5 - t0) * 0.9), 0.13 - t0 * 0.04, 0.46, 0.13 - t0 * 0.04, { color: 0xd8ccb0, layer: Tex.Bone });
            }
            b.sphere(M(cx + ca * 1.12, 0.32, cz + sa * 1.12), 0.12, 5, 3, { color: 0xe0d4b8, layer: Tex.Bone });
          }
          // candles around the dais
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * PI * 2 + 0.2;
            const px = cx + Math.cos(a) * 1.32,
              pz = cz + Math.sin(a) * 1.32;
            b.cyl(M(px, 0.14, pz), 0.04, 0.04, 0.14 + (k % 3) * 0.06, 5, { color: 0xe8e0c8, layer: Tex.Plain });
            b.cross(M(px, 0.3 + (k % 3) * 0.06, pz), 0.07, 0.1, { color: 0xffffff, layer: Tex.Flame });
          }
          const hb = new GeoBuilder();
          // two lobes, a pointed apex and a crown of arteries
          hb.sphere(M(0.13, 0.05, 0, 0, 0, 0, 0.3, 0.34, 0.3), 1, 7, 5, { color: 0xc01818, layer: Tex.WallHeart });
          hb.sphere(M(-0.13, 0.05, 0.02, 0, 0, 0, 0.3, 0.34, 0.3), 1, 7, 5, { color: 0xb01414, layer: Tex.WallHeart });
          hb.cyl(M(0, -0.12, 0.01, PI, 0, 0), 0.34, 0.0, 0.42, 7, { color: 0xa01010, layer: Tex.WallHeart, caps: false });
          hb.cyl(M(0.1, 0.28, 0, 0, 0, -0.25), 0.1, 0.08, 0.32, 5, { color: 0x8a0e18, layer: Tex.WallHeart });
          hb.cyl(M(-0.08, 0.28, 0.05, 0, 0, 0.35), 0.08, 0.06, 0.3, 5, { color: 0x6a1a3a, layer: Tex.WallHeart });
          hb.cyl(M(0.0, 0.3, -0.08, -0.3, 0, 0), 0.07, 0.05, 0.26, 5, { color: 0x8a0e18, layer: Tex.WallHeart });
          const heart = new THREE.Mesh(hb.build(), this.heartMat);
          heart.position.set(cx, 1.35, cz);
          this.group.add(heart);
          this.dynamic.push(heart);
          this.heart = heart;
          break;
        }
        case Room.Portal:
        case Room.HeroGate: {
          const hero = r.type === Room.HeroGate;
          const cx = r.cx,
            cz = r.cz;
          const s = hero ? 0.55 : 1;
          const stone = hero ? 0xb0a890 : 0x4a3a5a;
          if (!hero)
            for (const [dx, dz] of [
              [-1.3, -1.3],
              [1.3, -1.3],
              [-1.3, 1.3],
              [1.3, 1.3],
            ]) {
              b.box(M(cx + dx, 0.6, cz + dz), 0.3, 1.2, 0.3, { color: stone, layer: Tex.WallTop });
              b.cyl(M(cx + dx, 1.2, cz + dz), 0.2, 0.0, 0.3, 4, { color: stone, layer: Tex.WallTop });
            }
          // standing ring
          const R = 0.95 * s;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * PI * 2;
            b.box(M(cx + Math.cos(a) * R, 1.05 * s + Math.sin(a) * R, cz, 0, 0, a), 0.22 * s, 0.52 * s, 0.26, { color: stone, layer: Tex.RockSide });
          }
          b.box(M(cx, 0.06, cz), 1.2 * s, 0.12, 0.5, { color: stone, layer: Tex.RockTop });
          const vb = new GeoBuilder();
          vb.cyl(M(0, 0, 0, PI / 2, 0, 0), R * 0.9, R * 0.9, 0.02, 12, { color: hero ? 0xd8e8ff : 0xb070ff, layer: hero ? Tex.HeroGateFloor : Tex.PortalFloor });
          const vortex = new THREE.Mesh(vb.build(), this.glowMat);
          vortex.position.set(cx, 1.05 * s, cz);
          this.group.add(vortex);
          this.dynamic.push(vortex);
          this.vortices.push({ mesh: vortex, speed: hero ? -1.5 : 2 });
          break;
        }
        case Room.HeroKeep: {
          const [cx, cz] = [r.cx, r.cz];
          b.box(M(cx, 0.25, cz - 0.9), 0.7, 0.5, 0.5, { color: 0xc0b080, layer: Tex.HeroWallTop });
          b.box(M(cx, 0.9, cz - 1.1), 0.7, 0.9, 0.12, { color: 0x2a4aa0, layer: Tex.Cloth });
          b.box(M(cx, 0.55, cz - 0.9), 0.6, 0.1, 0.4, { color: 0xa01a1a, layer: Tex.Cloth });
          for (const dx of [-1.2, 1.2]) {
            b.box(M(cx + dx, 0.9, cz - 1.2), 0.05, 1.8, 0.05, { color: 0x8a7a50, layer: Tex.Wood });
            b.box(M(cx + dx, 1.4, cz - 1.15), 0.4, 0.7, 0.02, { color: 0x2a4ab0, layer: Tex.Cloth });
            b.box(M(cx + dx, 1.45, cz - 1.14), 0.12, 0.12, 0.02, { color: 0xffd040, layer: Tex.Plain });
          }
          break;
        }
        case Room.Treasury:
          for (const t of r.tiles) {
            if (stored <= 0) break;
            const amt = Math.min(perTile, stored);
            stored -= amt;
            const [x, z] = tileXZ(t);
            goldPile(b, x, z, 0.3 + (amt / perTile) * 0.9, m.variant[t]);
          }
          break;
        case Room.Lair:
          for (const t of r.tiles) {
            const [x, z] = tileXZ(t);
            if (g.bedOwner.has(t)) {
              const c = g.byId.get(g.bedOwner.get(t)!);
              const s = c ? Math.max(0.7, c.def.scale) : 1;
              b.box(M(x, 0.04, z, 0, (m.variant[t] / 255) * 0.6 - 0.3, 0), 0.7 * s, 0.08, 0.5 * s, { color: 0xc8a060, layer: Tex.Straw });
              b.box(M(x - 0.1 * s, 0.09, z, 0, (m.variant[t] / 255) * 0.6 - 0.3, 0), 0.42 * s, 0.03, 0.46 * s, { color: 0x7a4a2a, layer: Tex.Fur });
            }
          }
          break;
        case Room.Hatchery:
          for (const t of r.tiles) {
            if (!interior(r, t) && r.tiles.length > 4) continue;
            if ((m.variant[t] & 3) !== 0) continue;
            const [x, z] = tileXZ(t);
            b.box(M(x, 0.15, z), 0.5, 0.3, 0.4, { color: 0x8a6a3a, layer: Tex.Wood });
            b.box(M(x, 0.36, z, 0, 0, 0), 0.6, 0.12, 0.5, { color: 0xd0a860, layer: Tex.Straw });
            b.box(M(x, 0.12, z + 0.2), 0.2, 0.16, 0.02, { color: 0x201010, layer: Tex.Plain });
          }
          break;
        case Room.Training:
          for (const t of r.tiles) {
            const x0 = t % w,
              z0 = (t / w) | 0;
            if ((x0 + z0 * 2) % 3 !== 0) continue;
            const [x, z] = tileXZ(t);
            b.box(M(x, 0.5, z), 0.1, 1.0, 0.1, { color: 0x7a5a3a, layer: Tex.Wood });
            b.box(M(x, 0.75, z), 0.6, 0.08, 0.08, { color: 0x7a5a3a, layer: Tex.Wood });
            b.box(M(x, 0.65, z, 0, 0.2, 0), 0.26, 0.4, 0.22, { color: 0xb09060, layer: Tex.Straw });
            b.sphere(M(x, 1.0, z), 0.12, 5, 3, { color: 0xb09060, layer: Tex.Straw });
          }
          break;
        case Room.Library:
          for (const t of r.tiles) {
            const [x, z] = tileXZ(t);
            const x0 = t % w,
              z0 = (t / w) | 0;
            if ((x0 + z0) % 2 === 0) {
              // bookcase
              const rot = (m.variant[t] & 1) * (PI / 2);
              b.box(M(x, 0.55, z, 0, rot, 0), 0.8, 1.1, 0.26, { color: 0x6a4a2a, layer: Tex.Wood });
              b.box(M(x, 0.55, z, 0, rot, 0), 0.72, 1.0, 0.28, { color: 0xffffff, layer: Tex.WallLibrary });
            } else if ((m.variant[t] & 3) === 1) {
              // candle stand
              b.cyl(M(x, 0, z), 0.08, 0.05, 0.7, 5, { color: 0x404048, layer: Tex.Metal });
              b.cyl(M(x, 0.7, z), 0.04, 0.04, 0.12, 5, { color: 0xf0e8d0, layer: Tex.Plain });
              b.cross(M(x, 0.82, z), 0.08, 0.12, { color: 0xffffff, layer: Tex.Flame });
            }
          }
          break;
        case Room.Workshop:
          for (const t of r.tiles) {
            const x0 = t % w,
              z0 = (t / w) | 0;
            if ((x0 + z0) % 3 !== 0) continue;
            const [x, z] = tileXZ(t);
            b.box(M(x, 0.18, z), 0.22, 0.36, 0.22, { color: 0x5a3a2a, layer: Tex.Wood });
            b.box(M(x, 0.42, z), 0.5, 0.14, 0.22, { color: 0x505058, layer: Tex.Metal });
            b.cyl(M(x + 0.25, 0.42, z, 0, 0, PI / 2), 0.07, 0.0, 0.18, 4, { color: 0x505058, layer: Tex.Metal });
          }
          break;
        case Room.GuardPost: {
          const [cx, cz] = [r.cx, r.cz];
          b.box(M(cx, 0.9, cz), 0.06, 1.8, 0.06, { color: 0x6a4a2a, layer: Tex.Wood });
          b.box(M(cx + 0.22, 1.5, cz), 0.44, 0.5, 0.02, { color: 0xa01010, layer: Tex.Cloth });
          b.box(M(cx + 0.22, 1.5, cz + 0.01), 0.14, 0.14, 0.02, { color: 0xffd040, layer: Tex.Plain });
          break;
        }
        case Room.Prison:
          for (const t of r.tiles) {
            if (!interior(r, t) && r.tiles.length > 4) continue;
            const [x, z] = tileXZ(t);
            for (let k = 0; k < 4; k++) {
              b.box(M(x - 0.35 + k * 0.23, 0.55, z - 0.4), 0.03, 1.1, 0.03, { color: 0x505058, layer: Tex.Metal });
              b.box(M(x - 0.35 + k * 0.23, 0.55, z + 0.4), 0.03, 1.1, 0.03, { color: 0x505058, layer: Tex.Metal });
            }
            b.box(M(x, 1.1, z), 0.8, 0.04, 0.84, { color: 0x404048, layer: Tex.Metal });
          }
          break;
        case Room.Torture:
          for (const t of r.tiles) {
            if (!interior(r, t) && r.tiles.length > 4) continue;
            if ((m.variant[t] & 1) === 0) continue;
            const [x, z] = tileXZ(t);
            b.cyl(M(x, 0.55, z, PI / 2, 0, 0), 0.45, 0.45, 0.08, 8, { color: 0x6a4a2a, layer: Tex.Wood });
            b.box(M(x, 0.25, z), 0.1, 0.5, 0.1, { color: 0x4a3a2a, layer: Tex.Wood });
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * PI * 2;
              b.cyl(M(x + Math.cos(a) * 0.45, 0.55 + Math.sin(a) * 0.45, z, 0, 0, a - PI / 2), 0.03, 0, 0.12, 3, { color: 0xa0a0a8, layer: Tex.Metal });
            }
          }
          break;
        case Room.Graveyard:
          for (const t of r.tiles) {
            if ((m.variant[t] & 1) === 0) continue;
            const [x, z] = tileXZ(t);
            b.box(M(x, 0.25, z, 0, ((m.variant[t] >> 2) / 64 - 0.5) * 0.5, ((m.variant[t] >> 4) / 16 - 0.5) * 0.3), 0.3, 0.5, 0.08, { color: 0x8a8a90, layer: Tex.RockSide });
            b.box(M(x, 0.02, z + 0.25), 0.3, 0.04, 0.4, { color: 0x3a3028, layer: Tex.Path });
          }
          break;
        case Room.Temple: {
          const [cx, cz] = [r.cx, r.cz];
          b.box(M(cx, 0.3, cz), 0.8, 0.6, 0.5, { color: 0x2a1a30, layer: Tex.Temple });
          b.box(M(cx, 0.62, cz), 0.9, 0.05, 0.6, { color: 0xc0a040, layer: Tex.Metal });
          for (const t of r.tiles) {
            if ((m.variant[t] & 3) !== 0) continue;
            const [x, z] = tileXZ(t);
            b.cyl(M(x, 0, z), 0.05, 0.05, 0.3, 5, { color: 0xe8e0d0, layer: Tex.Plain });
            b.cross(M(x, 0.3, z), 0.08, 0.12, { color: 0xffffff, layer: Tex.Flame });
          }
          break;
        }
      }
    }
    if (!b.empty) {
      this.staticMesh = new THREE.Mesh(b.build(), this.mat);
      this.group.add(this.staticMesh);
    }
  }
}
