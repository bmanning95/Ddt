import * as THREE from 'three';
import { GameMap } from '../game/map';
import { WALL_H, isSolid, Tile } from '../game/defs';

export class KeeperCamera {
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(32, 0, 32);
  goal = new THREE.Vector3(32, 0, 32);
  yaw = 0;
  yawGoal = 0;
  pitch = 0.98;
  dist = 13;
  distGoal = 13;
  minDist = 5;
  maxDist = 24;
  bounds = new THREE.Box2(new THREE.Vector2(2, 2), new THREE.Vector2(62, 62));
  shake = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 80);
  }

  setBounds(w: number, h: number) {
    this.bounds.min.set(2, 2);
    this.bounds.max.set(w - 2, h - 2);
  }

  jumpTo(x: number, z: number) {
    this.goal.set(x, 0, z);
    this.target.copy(this.goal);
  }
  panTo(x: number, z: number) {
    this.goal.set(x, 0, z);
  }

  pan(dx: number, dz: number) {
    // dx/dz in screen-relative units
    const s = this.dist * 0.9;
    const c = Math.cos(this.yaw),
      sn = Math.sin(this.yaw);
    this.goal.x += (dx * c + dz * sn) * s;
    this.goal.z += (-dx * sn + dz * c) * s;
  }

  rotate(d: number) {
    this.yawGoal += d;
  }
  zoom(f: number) {
    this.distGoal = THREE.MathUtils.clamp(this.distGoal * f, this.minDist, this.maxDist);
  }

  update(dt: number) {
    this.goal.x = THREE.MathUtils.clamp(this.goal.x, this.bounds.min.x, this.bounds.max.x);
    this.goal.z = THREE.MathUtils.clamp(this.goal.z, this.bounds.min.y, this.bounds.max.y);
    const k = 1 - Math.exp(-dt * 10);
    this.target.lerp(this.goal, k);
    this.yaw += (this.yawGoal - this.yaw) * k;
    this.dist += (this.distGoal - this.dist) * k;
    // pitch flattens a little when zoomed in, for drama
    const zt = (this.dist - this.minDist) / (this.maxDist - this.minDist);
    const pitch = this.pitch - (1 - zt) * 0.22;
    const cp = Math.cos(pitch);
    const c = this.camera;
    c.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      const s = this.shake * 0.25;
      c.position.x += (Math.random() - 0.5) * s;
      c.position.y += (Math.random() - 0.5) * s;
      c.position.z += (Math.random() - 0.5) * s;
    }
    c.lookAt(this.target.x, this.target.y + 0.2, this.target.z);
  }
}

export interface TileHit {
  x: number;
  z: number;
  point: THREE.Vector3;
  top: boolean; // hit the top of a solid block
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

export function rayFromScreen(camera: THREE.Camera, nx: number, ny: number): THREE.Ray {
  _ndc.set(nx, ny);
  _ray.setFromCamera(_ndc, camera);
  return _ray.ray;
}

// March the ray through the tile grid, honouring block heights.
export function pickTile(map: GameMap, ray: THREE.Ray, solidAt: (x: number, z: number) => boolean): TileHit | null {
  const o = ray.origin,
    d = ray.direction;
  if (d.y >= -1e-4) return null;
  // start where the ray drops below the wall-top plane
  let t = Math.max(0, (o.y - WALL_H) / -d.y);
  let px = o.x + d.x * t,
    pz = o.z + d.z * t;
  let x = Math.floor(px),
    z = Math.floor(pz);
  const stepX = d.x > 0 ? 1 : -1,
    stepZ = d.z > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / (d.x || 1e-9)),
    tDeltaZ = Math.abs(1 / (d.z || 1e-9));
  let tMaxX = t + (d.x > 0 ? x + 1 - px : px - x) * tDeltaX;
  let tMaxZ = t + (d.z > 0 ? z + 1 - pz : pz - z) * tDeltaZ;
  for (let i = 0; i < 256; i++) {
    const tExit = Math.min(tMaxX, tMaxZ);
    const solid = solidAt(x, z);
    const h = solid ? WALL_H : 0;
    const yExit = o.y + d.y * tExit;
    if (yExit <= h) {
      const tHit = Math.max(t, (o.y - h) / -d.y);
      const p = new THREE.Vector3(o.x + d.x * tHit, o.y + d.y * tHit, o.z + d.z * tHit);
      if (!map.inBounds(x, z)) return null;
      return { x, z, point: p, top: solid && tHit > t + 1e-5 };
    }
    t = tExit;
    if (tMaxX < tMaxZ) {
      x += stepX;
      tMaxX += tDeltaX;
    } else {
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
    if (x < -1 || z < -1 || x > map.w || z > map.h) return null;
  }
  return null;
}

export function defaultSolidAt(map: GameMap) {
  return (x: number, z: number) => {
    if (!map.inBounds(x, z)) return true;
    const i = map.idx(x, z);
    const t = map.tile[i] as Tile;
    if (!map.revealed[i]) return true;
    return isSolid(t);
  };
}
