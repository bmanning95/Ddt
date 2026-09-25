import * as THREE from 'three';
import { GeoBuilder, M } from './builder';
import { Tex } from './textures';
import { createModelMaterial } from './ps1';

// The Keeper's disembodied hand: pale, clawed, hovering over the cursor.
export class HandModel {
  root = new THREE.Group();
  private palm = new THREE.Group();
  private fingers: THREE.Group[] = [];
  private thumb = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  pose: 'open' | 'grab' | 'slap' | 'point' | 'hold' | 'cast' = 'open';
  poseT = 0;
  private target = new THREE.Vector3();
  held: THREE.Object3D | null = null;

  constructor() {
    this.mat = createModelMaterial({ tint: new THREE.Vector4(0.28, 0.26, 0.3, 0) });
    const skin = 0xc8c0cc;
    const pb = new GeoBuilder();
    // back of the hand, knuckles, wrist and a tattered crimson cuff
    pb.box(M(0, 0, 0.02), 0.4, 0.12, 0.38, { color: skin, layer: Tex.Skin });
    pb.box(M(0, 0.05, 0.17), 0.38, 0.06, 0.08, { color: 0xb0a8b8, layer: Tex.Skin });
    pb.box(M(0, 0.0, -0.26), 0.28, 0.13, 0.22, { color: 0xb8b0bc, layer: Tex.Skin });
    pb.box(M(0, 0.0, -0.4), 0.3, 0.16, 0.1, { color: 0x5a0e14, layer: Tex.Cloth });
    pb.box(M(0, 0.0, -0.35), 0.31, 0.17, 0.03, { color: 0xc09030, layer: Tex.Metal });
    this.palm.add(new THREE.Mesh(pb.build(), this.mat));
    this.root.add(this.palm);
    const mkFinger = (len: number, w: number) => {
      const g = new THREE.Group();
      const b = new GeoBuilder();
      b.box(M(0, 0, len * 0.25), w, w, len * 0.5, { color: skin, layer: Tex.Skin });
      const tip = new THREE.Group();
      tip.position.z = len * 0.5;
      const tb = new GeoBuilder();
      tb.box(M(0, 0, len * 0.2), w * 0.85, w * 0.85, len * 0.4, { color: skin, layer: Tex.Skin });
      // long black talon
      tb.cyl(M(0, -0.005, len * 0.38, Math.PI / 2, 0, 0), w * 0.42, 0, 0.16, 4, { color: 0x151012, layer: Tex.Bone });
      tip.add(new THREE.Mesh(tb.build(), this.mat));
      g.add(new THREE.Mesh(b.build(), this.mat));
      g.add(tip);
      g.userData.tip = tip;
      return g;
    };
    const lens = [0.34, 0.42, 0.4, 0.3];
    for (let k = 0; k < 4; k++) {
      const f = mkFinger(lens[k], 0.075);
      f.position.set(-0.165 + k * 0.11, 0, 0.2);
      f.rotation.y = (k - 1.5) * -0.12; // splay
      f.userData.splay = f.rotation.y;
      this.palm.add(f);
      this.fingers.push(f);
    }
    const t = mkFinger(0.3, 0.095);
    this.thumb = t;
    t.position.set(0.2, -0.02, 0.0);
    t.rotation.y = 0.7;
    this.palm.add(t);
    this.root.scale.setScalar(1.25);
  }

  setTarget(p: THREE.Vector3) {
    this.target.copy(p);
  }

  trigger(p: HandModel['pose']) {
    this.pose = p;
    this.poseT = 0;
  }

  update(dt: number, time: number, camYaw: number, holding: boolean) {
    this.poseT += dt;
    if ((this.pose === 'grab' || this.pose === 'slap' || this.pose === 'cast') && this.poseT > 0.35) this.pose = holding ? 'hold' : 'open';
    if (this.pose === 'hold' && !holding) this.pose = 'open';
    if (this.pose === 'open' && holding) this.pose = 'hold';
    const hover = 0.95 + Math.sin(time * 2) * 0.04;
    const goal = this.target.clone();
    goal.y += hover;
    this.root.position.lerp(goal, 1 - Math.exp(-dt * 25));
    // palm faces down, fingers point away from camera
    this.root.rotation.set(0, camYaw + Math.PI, 0);
    this.palm.rotation.set(-0.45, 0, 0);
    let curl = 0.25;
    let thumbCurl = 0.2;
    switch (this.pose) {
      case 'grab': {
        const k = Math.min(1, this.poseT / 0.15);
        curl = 0.25 + k * 1.1;
        thumbCurl = 0.2 + k * 0.8;
        this.root.position.y -= Math.sin(Math.min(1, this.poseT / 0.35) * Math.PI) * 0.5;
        break;
      }
      case 'hold':
        curl = 1.25;
        thumbCurl = 0.9;
        break;
      case 'slap': {
        const k = Math.min(1, this.poseT / 0.35);
        curl = 0.05;
        this.palm.rotation.x = -0.45 + Math.sin(k * Math.PI) * 1.4;
        this.palm.rotation.z = Math.sin(k * Math.PI) * 0.8;
        this.root.position.y -= Math.sin(k * Math.PI) * 0.5;
        break;
      }
      case 'point':
        curl = 1.2;
        break;
      case 'cast': {
        const k = Math.min(1, this.poseT / 0.35);
        curl = -0.2;
        this.palm.rotation.x = -0.45 - Math.sin(k * Math.PI) * 0.6;
        break;
      }
      default:
        curl = 0.25 + Math.sin(time * 2.3) * 0.08;
    }
    this.fingers.forEach((f, i) => {
      const c = this.pose === 'point' && i === 1 ? 0.1 : curl;
      f.rotation.x = c * 0.8;
      f.rotation.y = f.userData.splay * (1 - Math.min(1, Math.max(0, c)));
      (f.userData.tip as THREE.Group).rotation.x = c;
    });
    this.thumb.rotation.x = thumbCurl;
    (this.thumb.userData.tip as THREE.Group).rotation.x = thumbCurl * 0.8;
  }
}
