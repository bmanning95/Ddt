import * as THREE from 'three';
import { Tex } from './textures';

export type RGB = [number, number, number];

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export function hexRGB(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export interface PrimOpts {
  color?: RGB | number;
  layer?: Tex;
  uvScale?: [number, number];
}

// Accumulates low-poly primitives into a single BufferGeometry with
// position / normal / uv / color / layer attributes.
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  lay: number[] = [];
  idx: number[] = [];

  private resolve(o: PrimOpts): { c: RGB; l: number; us: number; vs: number } {
    let c: RGB = [1, 1, 1];
    if (typeof o.color === 'number') c = hexRGB(o.color);
    else if (o.color) c = o.color;
    return { c, l: o.layer ?? Tex.Plain, us: o.uvScale?.[0] ?? 1, vs: o.uvScale?.[1] ?? 1 };
  }

  vert(m: THREE.Matrix4, x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: RGB, l: number) {
    _v.set(x, y, z).applyMatrix4(m);
    _nm.getNormalMatrix(m);
    _n.set(nx, ny, nz).applyMatrix3(_nm).normalize();
    this.pos.push(_v.x, _v.y, _v.z);
    this.nor.push(_n.x, _n.y, _n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.lay.push(l);
    return this.pos.length / 3 - 1;
  }

  // Axis-aligned box centred on origin (then transformed by m).
  box(m: THREE.Matrix4, w: number, h: number, d: number, o: PrimOpts = {}) {
    const { c, l, us, vs } = this.resolve(o);
    const x = w / 2,
      y = h / 2,
      z = d / 2;
    const faces: [number[], number[], number[]][] = [
      // normal, corners (4 x xyz)
      [[0, 0, 1], [-x, -y, z, x, -y, z, x, y, z, -x, y, z], []],
      [[0, 0, -1], [x, -y, -z, -x, -y, -z, -x, y, -z, x, y, -z], []],
      [[1, 0, 0], [x, -y, z, x, -y, -z, x, y, -z, x, y, z], []],
      [[-1, 0, 0], [-x, -y, -z, -x, -y, z, -x, y, z, -x, y, -z], []],
      [[0, 1, 0], [-x, y, z, x, y, z, x, y, -z, -x, y, -z], []],
      [[0, -1, 0], [-x, -y, -z, x, -y, -z, x, -y, z, -x, -y, z], []],
    ];
    for (const [n, p] of faces) {
      const uvs = [0, 0, us, 0, us, vs, 0, vs];
      const b: number[] = [];
      for (let k = 0; k < 4; k++) b.push(this.vert(m, p[k * 3], p[k * 3 + 1], p[k * 3 + 2], n[0], n[1], n[2], uvs[k * 2], uvs[k * 2 + 1], c, l));
      this.idx.push(b[0], b[1], b[2], b[0], b[2], b[3]);
    }
  }

  // Cylinder / cone / frustum along Y, base at y=0.
  cyl(m: THREE.Matrix4, rBot: number, rTop: number, h: number, seg = 6, o: PrimOpts & { caps?: boolean } = {}) {
    const { c, l, us, vs } = this.resolve(o);
    const slope = (rBot - rTop) / h;
    const ring: number[][] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      const nl = Math.hypot(1, slope);
      const i0 = this.vert(m, ca * rBot, 0, sa * rBot, ca / nl, slope / nl, sa / nl, (i / seg) * us, 0, c, l);
      const i1 = this.vert(m, ca * rTop, h, sa * rTop, ca / nl, slope / nl, sa / nl, (i / seg) * us, vs, c, l);
      ring.push([i0, i1]);
    }
    for (let i = 0; i < seg; i++) {
      const [a0, a1] = ring[i];
      const [b0, b1] = ring[i + 1];
      this.idx.push(a0, a1, b1, a0, b1, b0);
    }
    if (o.caps !== false) {
      if (rTop > 0.001) this.disc(m, rTop, h, seg, 1, c, l);
      if (rBot > 0.001) this.disc(m, rBot, 0, seg, -1, c, l);
    }
  }

  private disc(m: THREE.Matrix4, r: number, y: number, seg: number, ny: number, c: RGB, l: number) {
    const center = this.vert(m, 0, y, 0, 0, ny, 0, 0.5, 0.5, c, l);
    const ids: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      ids.push(this.vert(m, Math.cos(a) * r, y, Math.sin(a) * r, 0, ny, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, c, l));
    }
    for (let i = 0; i < seg; i++) {
      if (ny > 0) this.idx.push(center, ids[i + 1], ids[i]);
      else this.idx.push(center, ids[i], ids[i + 1]);
    }
  }

  // Low-poly UV sphere centred on origin.
  sphere(m: THREE.Matrix4, r: number, wseg = 6, hseg = 4, o: PrimOpts = {}) {
    const { c, l, us, vs } = this.resolve(o);
    const grid: number[][] = [];
    for (let j = 0; j <= hseg; j++) {
      const v = j / hseg;
      const phi = v * Math.PI;
      const row: number[] = [];
      for (let i = 0; i <= wseg; i++) {
        const u = i / wseg;
        const th = u * Math.PI * 2;
        const x = -Math.cos(th) * Math.sin(phi);
        const y = Math.cos(phi);
        const z = Math.sin(th) * Math.sin(phi);
        row.push(this.vert(m, x * r, y * r, z * r, x, y, z, u * us, (1 - v) * vs, c, l));
      }
      grid.push(row);
    }
    for (let j = 0; j < hseg; j++)
      for (let i = 0; i < wseg; i++) {
        const a = grid[j][i + 1],
          b = grid[j][i],
          cc = grid[j + 1][i],
          d = grid[j + 1][i + 1];
        if (j !== 0) this.idx.push(a, b, d);
        if (j !== hseg - 1) this.idx.push(b, cc, d);
      }
  }

  // Single quad from 4 points (counter-clockwise), with its own normal.
  quad(m: THREE.Matrix4, p: number[], o: PrimOpts & { uvs?: number[] } = {}) {
    const { c, l } = this.resolve(o);
    const a = new THREE.Vector3(p[0], p[1], p[2]);
    const b = new THREE.Vector3(p[3], p[4], p[5]);
    const d = new THREE.Vector3(p[9], p[10], p[11]);
    const n = b.sub(a).cross(d.sub(a)).normalize();
    const uvs = o.uvs ?? [0, 0, 1, 0, 1, 1, 0, 1];
    const ids: number[] = [];
    for (let k = 0; k < 4; k++) ids.push(this.vert(m, p[k * 3], p[k * 3 + 1], p[k * 3 + 2], n.x, n.y, n.z, uvs[k * 2], uvs[k * 2 + 1], c, l));
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }

  // Vertical cross of two quads (for flames, plants): width w, height h, base at y=0.
  cross(m: THREE.Matrix4, w: number, h: number, o: PrimOpts = {}) {
    const x = w / 2;
    this.quad(m, [-x, 0, 0, x, 0, 0, x, h, 0, -x, h, 0], o);
    this.quad(m, [x, 0, 0, -x, 0, 0, -x, h, 0, x, h, 0], o);
    this.quad(m, [0, 0, -x, 0, 0, x, 0, h, x, 0, h, -x], o);
    this.quad(m, [0, 0, x, 0, 0, -x, 0, h, -x, 0, h, x], o);
  }

  get empty() {
    return this.idx.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('layer', new THREE.Float32BufferAttribute(this.lay, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Matrix helper: translate, rotate (euler XYZ radians), scale.
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}
