import * as THREE from 'three';
import { Tex } from './textures';

// Shared uniforms: one object instance referenced by every PS1 material.
export const MAX_DYN = 12;

export const shared = {
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(480, 270) },
  uSnap: { value: 1 },
  uAffine: { value: 0.55 },
  uTex: { value: null as THREE.DataArrayTexture | null },
  uAmbient: { value: new THREE.Color(0.1, 0.085, 0.11) },
  uFogColor: { value: new THREE.Color(0.02, 0.012, 0.025) },
  uFogRange: { value: new THREE.Vector2(16, 34) },
  uLightGrid: { value: null as THREE.DataTexture | null },
  uGridSize: { value: new THREE.Vector2(64, 64) },
  uDynPos: { value: Array.from({ length: MAX_DYN }, () => new THREE.Vector4(0, -100, 0, 1)) },
  uDynCol: { value: Array.from({ length: MAX_DYN }, () => new THREE.Vector3(0, 0, 0)) },
  uKeyDir: { value: new THREE.Vector3(0.4, 1, 0.3).normalize() },
};

const COMMON_VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uRes;
uniform float uSnap;
uniform vec3 uAmbient;
uniform vec2 uFogRange;
uniform vec4 uDynPos[${MAX_DYN}];
uniform vec3 uDynCol[${MAX_DYN}];

vec4 ps1Snap(vec4 clip) {
  if (uSnap > 0.5) {
    vec2 grid = uRes * 0.5;
    clip.xy = floor(clip.xy / clip.w * grid + 0.5) / grid * clip.w;
  }
  return clip;
}

vec3 dynLight(vec3 wp, vec3 n, float useN) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_DYN}; i++) {
    vec4 L = uDynPos[i];
    vec3 d = L.xyz - wp;
    float dist = length(d);
    float att = clamp(1.0 - dist / L.w, 0.0, 1.0);
    att *= att;
    float ndl = mix(1.0, clamp(dot(n, d / max(dist, 0.001)) * 0.7 + 0.3, 0.0, 1.0), useN);
    acc += uDynCol[i] * att * ndl;
  }
  return acc;
}
`;

// ---------- Terrain ----------
const TERRAIN_VERT = /* glsl */ `
${COMMON_VERT}
attribute vec3 color;
attribute float layer;
varying vec3 vUvA;
varying vec2 vUv;
flat varying float vLayer;
varying vec3 vLight;
varying float vFog;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vec4 clip = projectionMatrix * mv;
  clip = ps1Snap(clip);
  gl_Position = clip;

  vec2 uv0 = uv;
  float L = layer;
  if (abs(L - ${Tex.Water}.0) < 0.5) uv0 += vec2(uTime * 0.04, uTime * 0.025);
  if (abs(L - ${Tex.Lava}.0) < 0.5) uv0 += vec2(uTime * 0.02, uTime * 0.012);
  if (abs(L - ${Tex.PortalFloor}.0) < 0.5) {
    float a = uTime * 0.6;
    vec2 c = uv0 - 0.5; uv0 = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a)) + 0.5;
  }
  vUv = uv0;
  vUvA = vec3(uv0 * clip.w, clip.w);
  vLayer = L;

  // baked light flickers like torch flame
  float fl = 1.0 + (sin(uTime * 7.3 + wp.x * 1.7 + wp.z * 2.3) + sin(uTime * 12.7 + wp.z * 3.1 - wp.x)) * 0.035;
  vec3 light = color * fl + uAmbient + dynLight(wp.xyz, vec3(0.0, 1.0, 0.0), 0.0);
  if (abs(L - ${Tex.Lava}.0) < 0.5) light = max(light, vec3(1.05 + 0.1 * sin(uTime * 2.0 + wp.x)));
  vLight = light;
  vFog = smoothstep(uFogRange.x, uFogRange.y, -mv.z);
}
`;

const COMMON_FRAG = /* glsl */ `
uniform sampler2DArray uTex;
uniform float uAffine;
uniform vec3 uFogColor;
varying vec3 vUvA;
varying vec2 vUv;
flat varying float vLayer;
varying vec3 vLight;
varying float vFog;
`;

const TERRAIN_FRAG = /* glsl */ `
${COMMON_FRAG}
void main() {
  vec2 uv = mix(vUv, vUvA.xy / vUvA.z, uAffine);
  vec4 t = texture(uTex, vec3(uv, vLayer));
  vec3 c = t.rgb * vLight;
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, 1.0);
}
`;

export function createTerrainMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: shared as unknown as Record<string, THREE.IUniform>,
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
  });
}

// ---------- Models (creatures, props, hand) ----------
const MODEL_VERT = /* glsl */ `
${COMMON_VERT}
uniform sampler2D uLightGrid;
uniform vec2 uGridSize;
uniform vec3 uKeyDir;
uniform vec4 uTint; // rgb additive, a = emissive flag
attribute vec3 color;
attribute float layer;
varying vec3 vUvA;
varying vec2 vUv;
flat varying float vLayer;
varying vec3 vLight;
varying float vFog;
varying vec3 vAlbedo;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  bool flame = abs(layer - ${Tex.Flame}.0) < 0.5;
  if (flame) {
    float ph = wp.x * 3.1 + wp.z * 2.3;
    wp.x += sin(uTime * 9.0 + ph) * 0.02 * max(0.0, position.y);
    wp.y += sin(uTime * 13.0 + ph) * 0.015;
  }
  vec4 mv = viewMatrix * wp;
  vec4 clip = projectionMatrix * mv;
  clip = ps1Snap(clip);
  gl_Position = clip;
  vec3 n = normalize(mat3(modelMatrix) * normal);

  vUv = uv;
  vUvA = vec3(uv * clip.w, clip.w);
  vLayer = layer;
  vAlbedo = color;

  vec3 grid = texture(uLightGrid, wp.xz / uGridSize).rgb * 2.0;
  float key = clamp(dot(n, uKeyDir), 0.0, 1.0);
  float up = n.y * 0.5 + 0.5;
  vec3 light = uAmbient * (0.9 + up * 0.8) + grid * (0.55 + key * 0.6) + dynLight(wp.xyz, n, 1.0);
  light += uTint.rgb;
  if (uTint.a > 0.5) light = vec3(1.0) + uTint.rgb;
  if (flame) light = vec3(1.25);
  vLight = light;
  vFog = smoothstep(uFogRange.x, uFogRange.y, -mv.z);
}
`;

const MODEL_FRAG = /* glsl */ `
${COMMON_FRAG}
varying vec3 vAlbedo;
uniform float uOpacity;
void main() {
  vec2 uv = mix(vUv, vUvA.xy / vUvA.z, uAffine);
  vec4 t = texture(uTex, vec3(uv, vLayer));
  if (t.a < 0.5) discard;
  vec3 c = t.rgb * vAlbedo * vLight;
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, uOpacity);
}
`;

export function createModelMaterial(opts: { tint?: THREE.Vector4; transparent?: boolean; opacity?: number } = {}) {
  const uniforms: Record<string, THREE.IUniform> = {
    ...(shared as unknown as Record<string, THREE.IUniform>),
    uTint: { value: opts.tint ?? new THREE.Vector4(0, 0, 0, 0) },
    uOpacity: { value: opts.opacity ?? 1 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MODEL_VERT,
    fragmentShader: MODEL_FRAG,
    transparent: !!opts.transparent,
    depthWrite: !opts.transparent,
  });
}

// ---------- Unlit, additive sprites / particles ----------
const FX_VERT = /* glsl */ `
${COMMON_VERT}
attribute vec3 color;
attribute float size;
varying vec3 vCol;
void main() {
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;
  clip = ps1Snap(clip);
  gl_Position = clip;
  gl_PointSize = max(1.0, size * uRes.y / (-mv.z) * 0.5);
  vCol = color;
}
`;
const FX_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  if (max(abs(p.x), abs(p.y)) > 0.5) discard;
  gl_FragColor = vec4(vCol, 1.0);
}
`;
export function createFxMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: shared as unknown as Record<string, THREE.IUniform>,
    vertexShader: FX_VERT,
    fragmentShader: FX_FRAG,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

// ---------- Post: low-res target -> dithered 15-bit colour -> nearest upscale ----------
const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uLowRes;
uniform float uDither;
uniform float uVignette;
uniform float uFade;
uniform vec3 uFlash;
uniform float uScale;
varying vec2 vUv;
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[i]) / 16.0;
}
void main() {
  vec2 px = floor(gl_FragCoord.xy / uScale);
  vec2 uv = (px + 0.5) / uLowRes;
  vec3 c = texture2D(tScene, uv).rgb;
  // gentle contrast curve
  c = c * (1.0 + 0.08) - 0.02;
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * uVignette;
  c += uFlash;
  c *= uFade;
  float b = bayer4(px) - 0.5;
  c += b * (1.0 / 31.0) * uDither;
  c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

export class PS1Pipeline {
  renderer: THREE.WebGLRenderer;
  target: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postMat: THREE.ShaderMaterial;
  lowW = 480;
  lowH = 270;
  scale = 2;
  targetHeight = 270;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(this.lowW, this.lowH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        uLowRes: { value: new THREE.Vector2(this.lowW, this.lowH) },
        uDither: { value: 1 },
        uVignette: { value: 0.9 },
        uFade: { value: 1 },
        uFlash: { value: new THREE.Vector3() },
        uScale: { value: 2 },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    // integer upscale so every low-res pixel is a crisp square
    this.scale = Math.max(1, Math.round(h / this.targetHeight));
    this.lowW = Math.ceil(w / this.scale);
    this.lowH = Math.ceil(h / this.scale);
    this.target.setSize(this.lowW, this.lowH);
    (this.postMat.uniforms.uLowRes.value as THREE.Vector2).set(this.lowW, this.lowH);
    this.postMat.uniforms.uScale.value = this.scale;
    shared.uRes.value.set(this.lowW, this.lowH);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}
