import './style.css';
import * as THREE from 'three';
import { PS1Pipeline, shared } from './render/ps1';
import { createTextureArray } from './render/textures';
import { generateRealm } from './game/mapgen';
import { TerrainRenderer } from './render/terrain';
import { KeeperCamera } from './render/camera';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setClearColor(0x050307);
const pipe = new PS1Pipeline(renderer);
shared.uTex.value = createTextureArray();

const scene = new THREE.Scene();
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1234);
const layout = generateRealm({ seed, w: 64, h: 64, depth: 0, goldMul: 1, water: 1, lava: 1, rockiness: 0.5, caves: 10, portals: 1, heroBase: true });
for (let i = 0; i < layout.map.revealed.length; i++) layout.map.revealed[i] = params.has('reveal') ? 1 : layout.map.revealed[i];
const terrain = new TerrainRenderer(layout.map);
terrain.extraLights.push({ x: layout.heart.x + 0.5, z: layout.heart.z + 0.5, y: 1.2, r: 1.1, g: 0.3, b: 0.22, radius: 6, flicker: 0 });
scene.add(terrain.group);

const cam = new KeeperCamera(1);
cam.setBounds(64, 64);
cam.jumpTo(layout.heart.x + 0.5, layout.heart.z + 0.5);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  pipe.resize(w, h);
  cam.camera.aspect = pipe.lowW / pipe.lowH;
  cam.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  shared.uTime.value += dt;
  terrain.update();
  cam.update(dt);
  shared.uFogRange.value.set(cam.dist + 4, cam.dist + 22);
  pipe.render(scene, cam.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as any).__cam = cam;
