import * as THREE from 'three';
import { GeoBuilder, M } from './builder';
import { Tex } from './textures';

export type RigType = 'biped' | 'quad' | 'insect' | 'chicken';

interface PartSpec {
  name: string;
  parent: string | null;
  pos: [number, number, number];
  geo: THREE.BufferGeometry | null;
}

export interface RigSpec {
  type: RigType;
  parts: PartSpec[];
  height: number;
  hover: number; // flying height
  bodyY: number;
}

export interface Rig {
  spec: RigSpec;
  root: THREE.Group; // world placement (y=feet)
  pivot: THREE.Group; // for whole-body poses (lying down etc.)
  p: Record<string, THREE.Group>;
  base: Record<string, THREE.Vector3>;
}

const cache = new Map<string, RigSpec>();

const g = () => new GeoBuilder();
const PI = Math.PI;

function part(name: string, parent: string | null, pos: [number, number, number], build?: (b: GeoBuilder) => void): PartSpec {
  let geo: THREE.BufferGeometry | null = null;
  if (build) {
    const b = g();
    build(b);
    if (!b.empty) geo = b.build();
  }
  return { name, parent, pos, geo };
}

// ------------------------------------------------------------------ biped
interface BipedOpts {
  legLen: number;
  legW: number;
  hipW: number;
  torso: [number, number, number];
  torsoColor: number;
  torsoTex?: Tex;
  head: number;
  headColor: number;
  headTex?: Tex;
  face?: boolean;
  armLen: number;
  armW: number;
  shoulder: number;
  armColor: number;
  armTex?: Tex;
  legColor: number;
  legTex?: Tex;
  handColor?: number;
  footColor?: number;
  robe?: { color: number; tex?: Tex; bottom: number };
  headExtras?: (b: GeoBuilder, s: number) => void;
  torsoExtras?: (b: GeoBuilder) => void;
  armRExtras?: (b: GeoBuilder, len: number) => void;
  armLExtras?: (b: GeoBuilder, len: number) => void;
  tail?: (b: GeoBuilder) => void;
  cape?: { color: number; len: number };
  wings?: { color: number; span: number };
  neckY?: number;
}

function biped(o: BipedOpts): RigSpec {
  const parts: PartSpec[] = [];
  const [tw, th, td] = o.torso;
  const bodyY = o.legLen;
  parts.push(
    part('body', null, [0, bodyY, 0], (b) => {
      b.box(M(0, th / 2, 0), tw, th, td, { color: o.torsoColor, layer: o.torsoTex ?? Tex.Cloth });
      if (o.robe) {
        b.cyl(M(0, -o.legLen + o.robe.bottom, 0), tw * 0.72, tw * 0.5, o.legLen - o.robe.bottom + 0.02, 7, { color: o.robe.color, layer: o.robe.tex ?? Tex.Cloth });
      }
      o.torsoExtras?.(b);
    }),
  );
  const hs = o.head;
  parts.push(
    part('head', 'body', [0, o.neckY ?? th, 0], (b) => {
      b.box(M(0, hs / 2, 0.02), hs, hs, hs * 0.92, {
        color: o.headColor,
        layer: o.headTex ?? Tex.Skin,
        front: o.face === false ? undefined : Tex.Face,
      });
      o.headExtras?.(b, hs);
    }),
  );
  const al = o.armLen;
  parts.push(
    part('armL', 'body', [o.shoulder, th * 0.9, 0], (b) => {
      b.box(M(0, -al / 2, 0), o.armW, al, o.armW, { color: o.armColor, layer: o.armTex ?? Tex.Skin });
      b.box(M(0, -al - o.armW * 0.4, 0), o.armW * 1.25, o.armW * 1.1, o.armW * 1.25, { color: o.handColor ?? o.headColor, layer: Tex.Skin });
      o.armLExtras?.(b, al);
    }),
  );
  parts.push(
    part('armR', 'body', [-o.shoulder, th * 0.9, 0], (b) => {
      b.box(M(0, -al / 2, 0), o.armW, al, o.armW, { color: o.armColor, layer: o.armTex ?? Tex.Skin });
      b.box(M(0, -al - o.armW * 0.4, 0), o.armW * 1.25, o.armW * 1.1, o.armW * 1.25, { color: o.handColor ?? o.headColor, layer: Tex.Skin });
      o.armRExtras?.(b, al);
    }),
  );
  const ll = o.legLen;
  const legBuild = (b: GeoBuilder) => {
    if (o.robe) return;
    b.box(M(0, -ll / 2, 0), o.legW, ll, o.legW, { color: o.legColor, layer: o.legTex ?? Tex.Cloth });
    b.box(M(0, -ll + 0.03, 0.04), o.legW * 1.2, 0.06, o.legW * 1.7, { color: o.footColor ?? 0x2a2018, layer: Tex.Skin });
  };
  parts.push(part('legL', null, [o.hipW, bodyY, 0], legBuild));
  parts.push(part('legR', null, [-o.hipW, bodyY, 0], legBuild));
  if (o.tail) parts.push(part('tail', 'body', [0, 0.05, -td / 2], o.tail));
  if (o.cape)
    parts.push(
      part('cape', 'body', [0, th * 0.95, -td / 2 - 0.01], (b) => {
        const w = tw * 1.15,
          l = o.cape!.len;
        b.quad(M(), [w / 2, -l, 0, -w / 2, -l, 0, -w / 2, 0, 0, w / 2, 0, 0], { color: o.cape!.color, layer: Tex.Cloth });
        b.quad(M(), [-w / 2, -l, -0.01, w / 2, -l, -0.01, w / 2, 0, -0.01, -w / 2, 0, -0.01], { color: o.cape!.color, layer: Tex.Cloth });
      }),
    );
  if (o.wings) {
    const sp = o.wings.span;
    const wing = (side: number) => (b: GeoBuilder) => {
      b.quad(M(), [0, 0, 0, side * sp, 0.25, -0.1, side * sp * 0.8, -0.35, -0.12, side * sp * 0.2, -0.3, -0.05], { color: o.wings!.color, layer: Tex.Skin });
      b.quad(M(), [side * sp * 0.2, -0.3, -0.05, side * sp * 0.8, -0.35, -0.12, side * sp, 0.25, -0.1, 0, 0, 0], { color: o.wings!.color, layer: Tex.Skin });
    };
    parts.push(part('wingL', 'body', [tw * 0.3, th * 0.8, -td / 2], wing(1)));
    parts.push(part('wingR', 'body', [-tw * 0.3, th * 0.8, -td / 2], wing(-1)));
  }
  return { type: 'biped', parts, height: bodyY + th + hs, hover: 0, bodyY };
}

// ------------------------------------------------------------------ weapons & bits
const pick = (b: GeoBuilder, len: number) => {
  b.box(M(0, -len - 0.05, 0.12, PI / 2, 0, 0), 0.035, 0.38, 0.035, { color: 0x6a4a2a, layer: Tex.Wood });
  b.box(M(0, -len - 0.05, 0.3, 0, 0, 0), 0.04, 0.2, 0.05, { color: 0x9a9aa8, layer: Tex.Metal });
};
const sword = (color = 0xc8c8d8, l = 0.55) => (b: GeoBuilder, len: number) => {
  b.box(M(0, -len - 0.04, 0.05), 0.05, 0.05, 0.14, { color: 0x6a4a20, layer: Tex.Wood });
  b.box(M(0, -len - 0.04, 0.12 + l / 2, PI / 2, 0, 0), 0.05, l, 0.018, { color, layer: Tex.Metal });
  b.box(M(0, -len - 0.04, 0.12), 0.18, 0.04, 0.04, { color: 0x8a7a40, layer: Tex.Metal });
};
const axe = (b: GeoBuilder, len: number) => {
  b.box(M(0, -len - 0.04, 0.2, PI / 2, 0, 0), 0.04, 0.6, 0.04, { color: 0x5a3a1a, layer: Tex.Wood });
  b.box(M(0, -len + 0.04, 0.45), 0.03, 0.26, 0.16, { color: 0xb0b0c0, layer: Tex.Metal });
};
const club = (b: GeoBuilder, len: number) => {
  b.cyl(M(0, -len - 0.04, 0.05, PI / 2, 0, 0), 0.04, 0.11, 0.62, 5, { color: 0x6a4a2a, layer: Tex.Wood });
};
const staff = (orb: number) => (b: GeoBuilder, len: number) => {
  b.box(M(0, -len + 0.1, 0.04), 0.04, 0.95, 0.04, { color: 0x5a3a1a, layer: Tex.Wood });
  b.sphere(M(0, -len + 0.62, 0.04), 0.07, 5, 3, { color: orb, layer: Tex.Flame });
};
const shield = (color: number, emblem = 0xe0e0e0) => (b: GeoBuilder, len: number) => {
  b.box(M(0.07, -len * 0.7, 0.06), 0.04, 0.34, 0.28, { color, layer: Tex.Metal });
  b.box(M(0.095, -len * 0.7, 0.06), 0.01, 0.12, 0.08, { color: emblem, layer: Tex.Plain });
};
const bow = (b: GeoBuilder, len: number) => {
  for (let k = -2; k <= 2; k++) b.box(M(0, -len - 0.02 + k * 0.1, 0.1 - Math.abs(k) * 0.03), 0.03, 0.11, 0.03, { color: 0x7a5a2a, layer: Tex.Wood });
  b.box(M(0, -len - 0.02, 0.13), 0.005, 0.5, 0.005, { color: 0xe0e0d0, layer: Tex.Plain });
};
const horns = (color: number, s: number, big = 1) => (b: GeoBuilder) => {
  b.cyl(M(s * 0.35, s * 0.95, 0, 0, 0, -0.6), 0.05 * big, 0.0, 0.25 * big, 4, { color, layer: Tex.Bone });
  b.cyl(M(-s * 0.35, s * 0.95, 0, 0, 0, 0.6), 0.05 * big, 0.0, 0.25 * big, 4, { color, layer: Tex.Bone });
};
const ears = (color: number, s: number, len = 0.22) => (b: GeoBuilder) => {
  b.cyl(M(s * 0.5, s * 0.62, 0, 0, 0, -1.25), 0.06, 0, len, 4, { color, layer: Tex.Skin });
  b.cyl(M(-s * 0.5, s * 0.62, 0, 0, 0, 1.25), 0.06, 0, len, 4, { color, layer: Tex.Skin });
};
const helmet = (color: number, s: number, plume?: number) => (b: GeoBuilder) => {
  b.box(M(0, s * 0.75, 0.01), s * 1.1, s * 0.6, s * 1.04, { color, layer: Tex.Metal });
  b.box(M(0, s * 0.5, s * 0.5), s * 0.9, s * 0.08, 0.02, { color: 0x202028, layer: Tex.Plain });
  if (plume !== undefined) b.box(M(0, s * 1.15, -0.02), 0.05, s * 0.3, s * 0.8, { color: plume, layer: Tex.Fur });
};
const hood = (color: number, s: number, pointy = false) => (b: GeoBuilder) => {
  b.box(M(0, s * 0.6, -0.02), s * 1.12, s * 1.05, s * 1.0, { color, layer: Tex.Cloth });
  if (pointy) b.cyl(M(0, s * 1.08, -0.04, -0.25, 0, 0), s * 0.5, 0, s * 0.9, 5, { color, layer: Tex.Cloth });
};
const beard = (color: number, s: number) => (b: GeoBuilder) => {
  b.box(M(0, s * 0.12, s * 0.5), s * 0.9, s * 0.55, 0.08, { color, layer: Tex.Fur });
};

// ------------------------------------------------------------------ quad / insect / chicken
interface QuadOpts {
  bodyL: number;
  bodyW: number;
  bodyH: number;
  legLen: number;
  color: number;
  tex?: Tex;
  headS: number;
  headColor?: number;
  snout?: number;
  tailLen?: number;
  wings?: number;
  neck?: number;
  horns?: number;
  spikes?: number;
  bellyColor?: number;
}
function quad(o: QuadOpts): RigSpec {
  const parts: PartSpec[] = [];
  const by = o.legLen + o.bodyH / 2;
  const tex = o.tex ?? Tex.Skin;
  parts.push(
    part('body', null, [0, by, 0], (b) => {
      b.box(M(0, 0, 0), o.bodyW, o.bodyH, o.bodyL, { color: o.color, layer: tex });
      if (o.bellyColor) b.box(M(0, -o.bodyH / 2 + 0.02, 0), o.bodyW * 0.8, 0.04, o.bodyL * 0.8, { color: o.bellyColor, layer: tex });
      if (o.spikes) for (let k = 0; k < o.spikes; k++) b.cyl(M(0, o.bodyH / 2, -o.bodyL / 2 + (k + 0.5) * (o.bodyL / o.spikes)), 0.05, 0, 0.14, 4, { color: 0x2a1a10, layer: Tex.Bone });
    }),
  );
  const neck = o.neck ?? 0;
  parts.push(
    part('head', 'body', [0, o.bodyH * 0.3 + neck * 0.6, o.bodyL / 2 + neck * 0.5], (b) => {
      if (neck) b.box(M(0, -neck * 0.3, -neck * 0.25, -0.7, 0, 0), o.headS * 0.55, neck, o.headS * 0.55, { color: o.color, layer: tex });
      b.box(M(0, 0, o.headS * 0.3), o.headS, o.headS * 0.85, o.headS, { color: o.headColor ?? o.color, layer: tex, front: Tex.Face });
      if (o.snout) b.box(M(0, -o.headS * 0.15, o.headS * 0.85), o.headS * 0.6, o.headS * 0.45, o.snout, { color: o.headColor ?? o.color, layer: tex });
      if (o.horns) {
        b.cyl(M(o.headS * 0.3, o.headS * 0.35, o.headS * 0.1, -0.9, 0, -0.3), 0.05, 0, o.horns, 4, { color: 0xd8c8a0, layer: Tex.Bone });
        b.cyl(M(-o.headS * 0.3, o.headS * 0.35, o.headS * 0.1, -0.9, 0, 0.3), 0.05, 0, o.horns, 4, { color: 0xd8c8a0, layer: Tex.Bone });
      }
    }),
  );
  const ll = o.legLen + o.bodyH * 0.3;
  const lw = Math.min(0.14, o.bodyW * 0.28);
  const leg = (b: GeoBuilder) => {
    b.box(M(0, -ll / 2, 0), lw, ll, lw, { color: o.color, layer: tex });
    b.box(M(0, -ll + 0.03, 0.04), lw * 1.3, 0.06, lw * 1.6, { color: 0x1a1210, layer: tex });
  };
  const fx = o.bodyW / 2 - lw / 2,
    fz = o.bodyL / 2 - lw;
  const ly = by - o.bodyH * 0.2;
  parts.push(part('legFL', null, [fx, ly, fz], leg));
  parts.push(part('legFR', null, [-fx, ly, fz], leg));
  parts.push(part('legBL', null, [fx, ly, -fz], leg));
  parts.push(part('legBR', null, [-fx, ly, -fz], leg));
  if (o.tailLen)
    parts.push(
      part('tail', 'body', [0, o.bodyH * 0.2, -o.bodyL / 2], (b) => {
        b.cyl(M(0, 0, 0, -PI / 2 - 0.5, 0, 0), 0.08, 0.01, o.tailLen!, 5, { color: o.color, layer: tex });
      }),
    );
  if (o.wings) {
    const sp = o.wings;
    // bat-like: a bony arm with three finger spars and a scalloped membrane between them
    const wing = (side: number) => (b: GeoBuilder) => {
      const tip = [side * sp, 0.34, 0.05];
      const f1 = [side * sp * 0.95, 0.05, -0.35];
      const f2 = [side * sp * 0.55, -0.02, -0.42];
      const root = [0, 0, -0.25];
      const elbow = [side * sp * 0.45, 0.2, 0.12];
      const mem = { color: 0x4a1a14, layer: Tex.Skin } as const;
      const tri = (a: number[], c: number[], d: number[]) => {
        b.quad(M(), [...a, ...c, ...d, ...d], mem);
        b.quad(M(), [...d, ...d, ...c, ...a], mem);
      };
      tri(elbow, tip, f1);
      tri(elbow, f1, f2);
      tri(elbow, f2, root);
      tri([0, 0, 0.1], elbow, root);
      const spar = (a: number[], c: number[], w: number) => {
        const dx = c[0] - a[0],
          dy = c[1] - a[1],
          dz = c[2] - a[2];
        const len = Math.hypot(dx, dy, dz);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(c[0], c[1], c[2]), new THREE.Vector3(0, 1, 0));
        m.setPosition((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
        b.box(m, w, w, len, { color: o.color, layer: tex });
      };
      spar([0, 0, 0.1], elbow, 0.07);
      spar(elbow, tip, 0.05);
      spar(elbow, f1, 0.035);
      spar(elbow, f2, 0.035);
    };
    parts.push(part('wingL', 'body', [o.bodyW / 2, o.bodyH / 2, 0], wing(1)));
    parts.push(part('wingR', 'body', [-o.bodyW / 2, o.bodyH / 2, 0], wing(-1)));
  }
  return { type: 'quad', parts, height: by + o.bodyH / 2 + o.headS, hover: 0, bodyY: by };
}

interface InsectOpts {
  body: [number, number, number];
  abdomen?: number;
  color: number;
  accent: number;
  legs: number;
  legLen: number;
  head: number;
  wings?: boolean;
  hover?: number;
  pincers?: boolean;
}
function insect(o: InsectOpts): RigSpec {
  const parts: PartSpec[] = [];
  const [bw, bh, bl] = o.body;
  const by = o.hover ? o.hover : o.legLen * 0.6 + bh / 2;
  parts.push(
    part('body', null, [0, by, 0], (b) => {
      b.box(M(0, 0, 0), bw, bh, bl, { color: o.color, layer: Tex.Scale });
      b.box(M(0, bh / 2, 0), bw * 0.7, 0.03, bl * 0.9, { color: o.accent, layer: Tex.Scale });
      if (o.abdomen) b.sphere(M(0, bh * 0.2, -bl / 2 - o.abdomen * 0.7), o.abdomen, 6, 4, { color: o.color, layer: Tex.Scale });
    }),
  );
  parts.push(
    part('head', 'body', [0, 0, bl / 2], (b) => {
      b.box(M(0, 0, o.head * 0.4), o.head, o.head * 0.8, o.head * 0.8, { color: o.color, layer: Tex.Skin, front: Tex.Face, frontColor: o.accent });
      if (o.pincers) {
        b.cyl(M(o.head * 0.3, -0.03, o.head * 0.8, PI / 2, 0, 0.3), 0.03, 0, 0.2, 4, { color: 0x2a2020, layer: Tex.Bone });
        b.cyl(M(-o.head * 0.3, -0.03, o.head * 0.8, PI / 2, 0, -0.3), 0.03, 0, 0.2, 4, { color: 0x2a2020, layer: Tex.Bone });
      }
      if (o.wings) {
        b.sphere(M(o.head * 0.35, o.head * 0.15, o.head * 0.6), o.head * 0.3, 5, 3, { color: 0xd02020, layer: Tex.Scale });
        b.sphere(M(-o.head * 0.35, o.head * 0.15, o.head * 0.6), o.head * 0.3, 5, 3, { color: 0xd02020, layer: Tex.Scale });
      }
    }),
  );
  const pairs = o.legs / 2;
  for (let k = 0; k < pairs; k++) {
    const z = bl / 2 - (k + 0.5) * (bl / pairs);
    for (const side of [1, -1]) {
      parts.push(
        part(`leg${k * 2 + (side > 0 ? 0 : 1)}`, 'body', [(side * bw) / 2, 0, z], (b) => {
          b.box(M((side * o.legLen) / 2, 0.06, 0, 0, 0, side * 0.5), o.legLen, 0.035, 0.035, { color: o.color, layer: Tex.Scale });
          b.box(M(side * o.legLen * 0.95, -o.legLen * 0.25, 0, 0, 0, side * -0.9), 0.035, o.legLen * 0.8, 0.035, { color: o.color, layer: Tex.Scale });
        }),
      );
    }
  }
  if (o.wings) {
    const wing = (side: number) => (b: GeoBuilder) => {
      b.quad(M(), [0, 0, 0.05, side * 0.5, 0.05, -0.1, side * 0.45, 0, -0.35, 0, 0, -0.2], { color: 0xb0c0c8, layer: Tex.Plain });
      b.quad(M(), [0, 0, -0.2, side * 0.45, 0, -0.35, side * 0.5, 0.05, -0.1, 0, 0, 0.05], { color: 0xb0c0c8, layer: Tex.Plain });
    };
    parts.push(part('wingL', 'body', [bw * 0.3, bh / 2, 0.05], wing(1)));
    parts.push(part('wingR', 'body', [-bw * 0.3, bh / 2, 0.05], wing(-1)));
  }
  return { type: 'insect', parts, height: by + bh, hover: o.hover ?? 0, bodyY: by };
}

function chicken(): RigSpec {
  const parts: PartSpec[] = [];
  parts.push(
    part('body', null, [0, 0.2, 0], (b) => {
      b.box(M(0, 0, 0), 0.2, 0.18, 0.26, { color: 0xf0ece0, layer: Tex.Fur });
      b.box(M(0, 0.06, -0.15, 0.6, 0, 0), 0.14, 0.12, 0.06, { color: 0xe0dcd0, layer: Tex.Fur });
    }),
  );
  parts.push(
    part('head', 'body', [0, 0.1, 0.12], (b) => {
      b.box(M(0, 0.06, 0.02), 0.1, 0.12, 0.1, { color: 0xf8f4ea, layer: Tex.Fur });
      b.box(M(0, 0.05, 0.1), 0.04, 0.03, 0.06, { color: 0xf0b020, layer: Tex.Plain });
      b.box(M(0, 0.14, 0.02), 0.025, 0.05, 0.08, { color: 0xd02020, layer: Tex.Plain });
    }),
  );
  const leg = (b: GeoBuilder) => b.box(M(0, -0.05, 0), 0.025, 0.12, 0.025, { color: 0xe0a020, layer: Tex.Plain });
  parts.push(part('legL', null, [0.05, 0.12, 0], leg));
  parts.push(part('legR', null, [-0.05, 0.12, 0], leg));
  return { type: 'chicken', parts, height: 0.4, hover: 0, bodyY: 0.2 };
}

// ------------------------------------------------------------------ roster
function build(kind: string): RigSpec {
  switch (kind) {
    case 'imp':
      return biped({
        legLen: 0.32,
        legW: 0.09,
        hipW: 0.08,
        torso: [0.3, 0.32, 0.22],
        torsoColor: 0xb8482a,
        torsoTex: Tex.Skin,
        head: 0.3,
        headColor: 0xc4522e,
        armLen: 0.34,
        armW: 0.07,
        shoulder: 0.19,
        armColor: 0xb8482a,
        legColor: 0xa03e24,
        legTex: Tex.Skin,
        footColor: 0x3a1a10,
        headExtras: (b, s) => {
          ears(0xc4522e, s, 0.2)(b);
          horns(0x2a1a10, s, 0.6)(b);
        },
        torsoExtras: (b) => b.box(M(0, 0.02, 0.0), 0.32, 0.1, 0.24, { color: 0x4a3020, layer: Tex.Cloth }),
        armRExtras: pick,
        tail: (b) => {
          b.cyl(M(0, 0, 0, -PI / 2 - 0.6, 0, 0), 0.03, 0.015, 0.36, 4, { color: 0xb8482a, layer: Tex.Skin });
          b.cyl(M(0, -0.21, -0.3, 0, 0, 0), 0.05, 0, 0.08, 4, { color: 0x2a1a10, layer: Tex.Skin });
        },
      });
    case 'goblin':
      return biped({
        legLen: 0.4,
        legW: 0.1,
        hipW: 0.09,
        torso: [0.36, 0.38, 0.24],
        torsoColor: 0x6a4a2a,
        torsoTex: Tex.Cloth,
        head: 0.3,
        headColor: 0x6aa03a,
        armLen: 0.38,
        armW: 0.08,
        shoulder: 0.22,
        armColor: 0x6aa03a,
        legColor: 0x4a3a2a,
        headExtras: (b, s) => ears(0x6aa03a, s, 0.26)(b),
        armRExtras: sword(0xa0a0a8, 0.4),
      });
    case 'warlock':
      return biped({
        legLen: 0.5,
        legW: 0.1,
        hipW: 0.09,
        torso: [0.36, 0.46, 0.26],
        torsoColor: 0x4a2a7a,
        head: 0.28,
        headColor: 0xd0b090,
        armLen: 0.44,
        armW: 0.09,
        shoulder: 0.23,
        armColor: 0x4a2a7a,
        armTex: Tex.Cloth,
        legColor: 0x4a2a7a,
        robe: { color: 0x3a1a6a, bottom: 0.02 },
        headExtras: (b, s) => {
          hood(0x2a1050, s, true)(b);
          beard(0xc0c0c8, s)(b);
        },
        torsoExtras: (b) => b.box(M(0, 0.3, 0.135), 0.08, 0.34, 0.01, { color: 0xc0a040, layer: Tex.Plain }),
        armRExtras: staff(0xff7020),
      });
    case 'troll':
      return biped({
        legLen: 0.44,
        legW: 0.15,
        hipW: 0.13,
        torso: [0.52, 0.5, 0.36],
        torsoColor: 0x6a7a5a,
        torsoTex: Tex.Skin,
        head: 0.3,
        headColor: 0x7a8a66,
        armLen: 0.58,
        armW: 0.13,
        shoulder: 0.32,
        armColor: 0x6a7a5a,
        legColor: 0x4a3a2a,
        torsoExtras: (b) => b.box(M(0, 0.06, 0), 0.54, 0.14, 0.38, { color: 0x5a4028, layer: Tex.Cloth }),
        headExtras: (b, s) => b.box(M(0, s * 0.4, s * 0.5), 0.12, 0.12, 0.08, { color: 0x7a8a66, layer: Tex.Skin }),
        armRExtras: (b, len) => {
          b.box(M(0, -len - 0.02, 0.18, PI / 2, 0, 0), 0.05, 0.45, 0.05, { color: 0x5a3a1a, layer: Tex.Wood });
          b.box(M(0, -len - 0.02, 0.42), 0.16, 0.14, 0.12, { color: 0x707078, layer: Tex.Metal });
        },
      });
    case 'bile':
      return biped({
        legLen: 0.3,
        legW: 0.16,
        hipW: 0.16,
        torso: [0.62, 0.55, 0.5],
        torsoColor: 0xa83a28,
        torsoTex: Tex.Skin,
        head: 0.32,
        headColor: 0xb8442e,
        armLen: 0.4,
        armW: 0.14,
        shoulder: 0.38,
        armColor: 0xa83a28,
        legColor: 0x8a2a1a,
        legTex: Tex.Skin,
        neckY: 0.5,
        torsoExtras: (b) => b.sphere(M(0, 0.24, 0.12), 0.36, 7, 5, { color: 0xc86040, layer: Tex.Skin }),
        headExtras: (b, s) => horns(0xe0d0b0, s, 1.1)(b),
      });
    case 'mistress':
      return biped({
        legLen: 0.52,
        legW: 0.08,
        hipW: 0.08,
        torso: [0.3, 0.44, 0.2],
        torsoColor: 0x2a1a2a,
        torsoTex: Tex.Metal,
        head: 0.26,
        headColor: 0xe8c8b8,
        armLen: 0.46,
        armW: 0.07,
        shoulder: 0.19,
        armColor: 0xe8c8b8,
        legColor: 0x1a101a,
        legTex: Tex.Metal,
        headExtras: (b, s) => {
          b.box(M(0, s * 0.55, -s * 0.2), s * 1.1, s * 1.1, s * 0.8, { color: 0x1a0a14, layer: Tex.Fur });
          b.box(M(0, s * 0.0, -s * 0.5), s * 0.9, s * 1.2, 0.08, { color: 0x1a0a14, layer: Tex.Fur });
        },
        armRExtras: (b, len) => {
          for (let k = 0; k < 5; k++) b.box(M(0, -len - 0.05 - k * 0.02, 0.1 + k * 0.1), 0.02, 0.02, 0.1, { color: 0x3a2a1a, layer: Tex.Plain });
        },
      });
    case 'skeleton':
      return biped({
        legLen: 0.46,
        legW: 0.06,
        hipW: 0.09,
        torso: [0.3, 0.4, 0.16],
        torsoColor: 0xd8d4c0,
        torsoTex: Tex.Bone,
        head: 0.26,
        headColor: 0xe0dcc8,
        headTex: Tex.Bone,
        armLen: 0.42,
        armW: 0.055,
        shoulder: 0.2,
        armColor: 0xd8d4c0,
        armTex: Tex.Bone,
        legColor: 0xd8d4c0,
        legTex: Tex.Bone,
        handColor: 0xd8d4c0,
        footColor: 0xc8c4b0,
        torsoExtras: (b) => {
          for (let k = 0; k < 4; k++) b.box(M(0, 0.08 + k * 0.08, 0.02), 0.34, 0.03, 0.18, { color: 0xe8e4d0, layer: Tex.Bone });
        },
        armRExtras: sword(0x9a9aa0, 0.45),
        armLExtras: shield(0x5a4a3a, 0xb0a080),
      });
    case 'vampire':
      return biped({
        legLen: 0.52,
        legW: 0.09,
        hipW: 0.08,
        torso: [0.34, 0.46, 0.22],
        torsoColor: 0x2a1020,
        head: 0.27,
        headColor: 0xd8d0dc,
        armLen: 0.46,
        armW: 0.08,
        shoulder: 0.21,
        armColor: 0x2a1020,
        armTex: Tex.Cloth,
        legColor: 0x1a0a14,
        cape: { color: 0x7a0a1a, len: 0.9 },
        headExtras: (b, s) => {
          b.box(M(0, s * 0.95, -0.02), s * 1.02, s * 0.15, s * 0.95, { color: 0x100810, layer: Tex.Fur });
          b.box(M(0, s * 0.65, -s * 0.5), s * 1.3, s * 0.7, 0.04, { color: 0x7a0a1a, layer: Tex.Cloth });
        },
      });
    case 'reaper':
      return biped({
        legLen: 0.6,
        legW: 0.16,
        hipW: 0.14,
        torso: [0.56, 0.6, 0.34],
        torsoColor: 0x8a1010,
        torsoTex: Tex.Skin,
        head: 0.34,
        headColor: 0x9a1a14,
        armLen: 0.6,
        armW: 0.13,
        shoulder: 0.36,
        armColor: 0x8a1010,
        legColor: 0x2a0a0a,
        legTex: Tex.Skin,
        headExtras: (b, s) => horns(0x1a1010, s, 2.0)(b),
        wings: { color: 0x3a0a0a, span: 0.8 },
        armRExtras: (b, len) => {
          b.box(M(0, -len + 0.2, 0.05), 0.05, 1.3, 0.05, { color: 0x2a1a10, layer: Tex.Wood });
          b.box(M(0, -len + 0.82, 0.3, 0.3, 0, 0), 0.03, 0.12, 0.6, { color: 0xc0c0d0, layer: Tex.Metal });
        },
      });
    // ---------------- heroes
    case 'knight':
      return biped({
        legLen: 0.5,
        legW: 0.11,
        hipW: 0.1,
        torso: [0.42, 0.46, 0.26],
        torsoColor: 0xc0c4d0,
        torsoTex: Tex.Metal,
        head: 0.28,
        headColor: 0xe0b890,
        armLen: 0.44,
        armW: 0.1,
        shoulder: 0.26,
        armColor: 0xb0b4c0,
        armTex: Tex.Metal,
        legColor: 0xa0a4b0,
        legTex: Tex.Metal,
        handColor: 0x909098,
        headExtras: (b, s) => helmet(0xc8ccd8, s, 0x2a4ab0)(b),
        torsoExtras: (b) => b.box(M(0, 0.25, 0.135), 0.2, 0.26, 0.01, { color: 0x2a4aa0, layer: Tex.Cloth }),
        armRExtras: sword(),
        armLExtras: shield(0x2a4aa0, 0xe0c040),
      });
    case 'archer':
      return biped({
        legLen: 0.48,
        legW: 0.09,
        hipW: 0.09,
        torso: [0.34, 0.42, 0.22],
        torsoColor: 0x3a6a2a,
        head: 0.27,
        headColor: 0xe0b890,
        armLen: 0.42,
        armW: 0.08,
        shoulder: 0.21,
        armColor: 0x3a6a2a,
        armTex: Tex.Cloth,
        legColor: 0x5a4a2a,
        headExtras: (b, s) => hood(0x2a5a1a, s)(b),
        armLExtras: bow,
      });
    case 'wizard':
      return biped({
        legLen: 0.5,
        legW: 0.1,
        hipW: 0.09,
        torso: [0.36, 0.46, 0.24],
        torsoColor: 0x2a3a9a,
        head: 0.27,
        headColor: 0xe0c0a0,
        armLen: 0.44,
        armW: 0.09,
        shoulder: 0.22,
        armColor: 0x2a3a9a,
        armTex: Tex.Cloth,
        legColor: 0x2a3a9a,
        robe: { color: 0x243288, bottom: 0.02 },
        headExtras: (b, s) => {
          b.cyl(M(0, s * 0.9, 0, -0.2, 0, 0), s * 0.8, 0, s * 1.4, 6, { color: 0x2a3a9a, layer: Tex.Cloth });
          b.cyl(M(0, s * 0.85, 0), s * 0.9, s * 0.9, 0.04, 8, { color: 0x2a3a9a, layer: Tex.Cloth });
          beard(0xe8e8f0, s)(b);
        },
        armRExtras: staff(0x60c0ff),
      });
    case 'dwarf':
      return biped({
        legLen: 0.28,
        legW: 0.11,
        hipW: 0.1,
        torso: [0.42, 0.38, 0.3],
        torsoColor: 0x8a5a2a,
        head: 0.3,
        headColor: 0xe0a080,
        armLen: 0.34,
        armW: 0.1,
        shoulder: 0.26,
        armColor: 0x8a5a2a,
        armTex: Tex.Cloth,
        legColor: 0x5a3a2a,
        headExtras: (b, s) => {
          helmet(0x9a9aa0, s)(b);
          b.box(M(0, s * 0.05, s * 0.5), s * 1.0, s * 0.8, 0.1, { color: 0xc07030, layer: Tex.Fur });
        },
        armRExtras: pick,
      });
    case 'monk':
      return biped({
        legLen: 0.48,
        legW: 0.1,
        hipW: 0.09,
        torso: [0.36, 0.44, 0.24],
        torsoColor: 0x8a6a3a,
        head: 0.27,
        headColor: 0xe0b890,
        armLen: 0.42,
        armW: 0.09,
        shoulder: 0.22,
        armColor: 0x8a6a3a,
        armTex: Tex.Cloth,
        legColor: 0x8a6a3a,
        robe: { color: 0x7a5a30, bottom: 0.02 },
        torsoExtras: (b) => b.box(M(0, 0.1, 0), 0.38, 0.05, 0.26, { color: 0xe0d0a0, layer: Tex.Plain }),
        armRExtras: staff(0xfff0a0),
      });
    case 'barbarian':
      return biped({
        legLen: 0.5,
        legW: 0.12,
        hipW: 0.11,
        torso: [0.46, 0.46, 0.28],
        torsoColor: 0xd09060,
        torsoTex: Tex.Skin,
        head: 0.28,
        headColor: 0xd09060,
        armLen: 0.46,
        armW: 0.11,
        shoulder: 0.28,
        armColor: 0xd09060,
        legColor: 0x6a4a2a,
        legTex: Tex.Fur,
        torsoExtras: (b) => b.box(M(0, 0.04, 0), 0.48, 0.12, 0.3, { color: 0x7a5a3a, layer: Tex.Fur }),
        headExtras: (b, s) => b.box(M(0, s * 0.7, -s * 0.2), s * 1.1, s * 0.6, s * 0.9, { color: 0xa05020, layer: Tex.Fur }),
        armRExtras: axe,
      });
    case 'samurai':
      return biped({
        legLen: 0.5,
        legW: 0.11,
        hipW: 0.1,
        torso: [0.4, 0.46, 0.26],
        torsoColor: 0xa02020,
        torsoTex: Tex.Scale,
        head: 0.27,
        headColor: 0xe0c0a0,
        armLen: 0.44,
        armW: 0.1,
        shoulder: 0.25,
        armColor: 0x202020,
        armTex: Tex.Scale,
        legColor: 0x202020,
        headExtras: (b, s) => {
          b.box(M(0, s * 0.8, 0), s * 1.2, s * 0.35, s * 1.1, { color: 0x202020, layer: Tex.Metal });
          b.cyl(M(0, s * 1.0, s * 0.3, 0, 0, 0), 0.03, 0.12, 0.2, 3, { color: 0xe0c040, layer: Tex.Metal });
        },
        armRExtras: sword(0xe0e0f0, 0.62),
      });
    case 'giant':
      return biped({
        legLen: 0.7,
        legW: 0.2,
        hipW: 0.18,
        torso: [0.7, 0.7, 0.42],
        torsoColor: 0x6a5a4a,
        head: 0.4,
        headColor: 0xc09070,
        armLen: 0.7,
        armW: 0.17,
        shoulder: 0.44,
        armColor: 0xc09070,
        legColor: 0xa07a58,
        legTex: Tex.Skin,
        armRExtras: club,
      });
    case 'lord':
      return biped({
        legLen: 0.54,
        legW: 0.12,
        hipW: 0.11,
        torso: [0.46, 0.5, 0.3],
        torsoColor: 0xd8b040,
        torsoTex: Tex.Metal,
        head: 0.3,
        headColor: 0xe0b890,
        armLen: 0.48,
        armW: 0.11,
        shoulder: 0.28,
        armColor: 0xc0c4d0,
        armTex: Tex.Metal,
        legColor: 0xc0c4d0,
        legTex: Tex.Metal,
        cape: { color: 0xa01a1a, len: 0.9 },
        headExtras: (b, s) => {
          helmet(0xd8b040, s)(b);
          for (let k = 0; k < 5; k++) b.cyl(M(-s * 0.45 + k * s * 0.22, s * 1.05, 0), 0.03, 0, 0.14, 3, { color: 0xffd040, layer: Tex.Metal });
        },
        armRExtras: sword(0xe8e8ff, 0.8),
        armLExtras: shield(0xa01a1a, 0xffd040),
      });
    case 'avatar':
      return biped({
        legLen: 0.62,
        legW: 0.13,
        hipW: 0.12,
        torso: [0.52, 0.58, 0.32],
        torsoColor: 0xf0f0ff,
        torsoTex: Tex.Metal,
        head: 0.32,
        headColor: 0xf0d0b0,
        armLen: 0.54,
        armW: 0.12,
        shoulder: 0.32,
        armColor: 0xe8e8f8,
        armTex: Tex.Metal,
        legColor: 0xe0e0f0,
        legTex: Tex.Metal,
        cape: { color: 0x3a5ad0, len: 1.1 },
        wings: { color: 0xf8f8ff, span: 0.9 },
        headExtras: (b, s) => {
          b.box(M(0, s * 0.9, -0.02), s * 1.04, s * 0.3, s * 1.0, { color: 0xffe070, layer: Tex.Fur });
          b.cyl(M(0, s * 1.35, 0, PI / 2, 0, 0), s * 0.55, s * 0.55, 0.03, 10, { color: 0xffe060, layer: Tex.Flame, caps: false });
        },
        armRExtras: sword(0xffffff, 0.9),
      });
    // ---------------- beasts
    case 'beetle':
      return insect({ body: [0.42, 0.24, 0.5], color: 0x1a4a5a, accent: 0x3a8a8a, legs: 6, legLen: 0.24, head: 0.2, pincers: true });
    case 'spider':
      return insect({ body: [0.3, 0.2, 0.28], abdomen: 0.26, color: 0x2a1a1a, accent: 0xa02020, legs: 8, legLen: 0.34, head: 0.18 });
    case 'fly':
      return insect({ body: [0.2, 0.18, 0.28], abdomen: 0.14, color: 0x2a3a2a, accent: 0x6a8a3a, legs: 4, legLen: 0.14, head: 0.16, wings: true, hover: 0.9 });
    case 'hound':
      return quad({ bodyL: 0.62, bodyW: 0.3, bodyH: 0.28, legLen: 0.3, color: 0x6a1a10, headS: 0.26, snout: 0.16, tailLen: 0.35, spikes: 4, bellyColor: 0xff7020 });
    case 'dragon':
      return quad({ bodyL: 0.9, bodyW: 0.5, bodyH: 0.42, legLen: 0.34, color: 0x2a6a3a, tex: Tex.Scale, headS: 0.3, snout: 0.22, tailLen: 0.8, wings: 0.9, neck: 0.4, horns: 0.2, spikes: 5, bellyColor: 0xc0b060 });
    case 'chicken':
      return chicken();
    default:
      return biped({
        legLen: 0.4,
        legW: 0.1,
        hipW: 0.09,
        torso: [0.34, 0.4, 0.22],
        torsoColor: 0x808080,
        head: 0.28,
        headColor: 0xc0a080,
        armLen: 0.4,
        armW: 0.08,
        shoulder: 0.21,
        armColor: 0x808080,
        legColor: 0x505050,
      });
  }
}

export function rigSpec(kind: string): RigSpec {
  let s = cache.get(kind);
  if (!s) {
    s = build(kind);
    cache.set(kind, s);
  }
  return s;
}

export function makeRig(kind: string, mat: THREE.Material, scale = 1): Rig {
  const spec = rigSpec(kind);
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  pivot.scale.setScalar(scale);
  const p: Record<string, THREE.Group> = {};
  const base: Record<string, THREE.Vector3> = {};
  for (const ps of spec.parts) {
    const grp = new THREE.Group();
    grp.position.set(ps.pos[0], ps.pos[1], ps.pos[2]);
    if (ps.geo) {
      const mesh = new THREE.Mesh(ps.geo, mat);
      grp.add(mesh);
    }
    p[ps.name] = grp;
    base[ps.name] = grp.position.clone();
    (ps.parent ? p[ps.parent] : pivot).add(grp);
  }
  return { spec, root, pivot, p, base };
}
