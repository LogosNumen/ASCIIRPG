import * as THREE from 'three';
import { shared, fogUniforms, NOISE_GLSL } from '../render/shared.js';
import { ballistic } from '../render/particles.js';
import { heightAt, FALLS, POOL, WATER_Y } from './layout.js';

const FOG_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FALLS_FRAG = /* glsl */ `
uniform float uTime, uBright, uSpeed, uOffset;
varying vec2 vUv;
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  float y = vUv.y * 14.0;
  float t = uTime * uSpeed + uOffset;
  float s1 = vnoise(vec2(vUv.x * 14.0 + uOffset, y + t * 3.2));
  float s2 = vnoise(vec2(vUv.x * 34.0, y * 2.0 + t * 5.5));
  float streak = s1 * 0.6 + s2 * 0.4;
  float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
  float foam = smoothstep(0.1, 0.0, vUv.y);
  vec3 col = mix(vec3(0.05, 0.12, 0.22), vec3(1.0, 1.1, 1.25), smoothstep(0.4, 0.9, streak)) * uBright;
  col += foam * 0.9;
  gl_FragColor = vec4(col, clamp(edge * (0.35 + 0.65 * streak) + foam * edge, 0.0, 1.0));
  #include <fog_fragment>
}`;

const POOL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uImpact, uCenter;
uniform float uRadius;
varying vec3 vWorld;
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  float d = distance(vWorld.xz, uImpact);
  float rip = (sin(d * 3.0 - uTime * 4.0) * 0.5 + 0.5) * exp(-d * 0.22);
  float n = vnoise(vWorld.xz * 1.3 + vec2(uTime * 0.3, uTime * 0.2));
  float foam = smoothstep(3.5, 0.3, d) * (0.5 + 0.5 * vnoise(vWorld.xz * 4.0 + uTime * 3.0));
  vec3 col = vec3(0.03, 0.07, 0.12) + vec3(0.18, 0.34, 0.5) * rip * 0.7 + vec3(0.15, 0.28, 0.4) * n * 0.35;
  col = mix(col, vec3(1.4, 1.5, 1.65), foam);
  float a = smoothstep(uRadius + 1.0, uRadius - 0.5, distance(vWorld.xz, uCenter));
  gl_FragColor = vec4(col, a * 0.9);
  #include <fog_fragment>
}`;

function fallsMaterial(bright, speed, offset) {
  return new THREE.ShaderMaterial({
    uniforms: { ...fogUniforms(), uTime: shared.uTime, uBright: { value: bright }, uSpeed: { value: speed }, uOffset: { value: offset } },
    vertexShader: FOG_VERT,
    fragmentShader: FALLS_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

// Curved sheet: water leaves the lip and arcs outward (horizontal offset ~ sqrt of drop).
function sheetGeometry(top, bottom, zAt, wTop, wBottom, zPush) {
  const segY = 48, segX = 8, p = [], uv = [], idx = [];
  for (let j = 0; j <= segY; j++) {
    const v = j / segY, y = bottom + v * (top - bottom), w = wBottom + (wTop - wBottom) * v;
    for (let i = 0; i <= segX; i++) {
      const u = i / segX;
      p.push(FALLS.x + (u - 0.5) * w, y, zAt(y) + zPush);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < segY; j++)
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, b = a + segX + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

export function createWaterfall(rand) {
  const group = new THREE.Group();
  const top = heightAt(FALLS.x, FALLS.lipZ) - 0.4;
  const bottom = WATER_Y - 0.3;
  const zAt = (y) => FALLS.lipZ + 0.9 + 1.05 * Math.sqrt(Math.max(0, top - y));
  const impact = { x: FALLS.x, z: zAt(bottom) + 0.4 };

  group.add(new THREE.Mesh(sheetGeometry(top, bottom, zAt, 3.6, 6.5, 0), fallsMaterial(0.75, 1, 0)));
  group.add(new THREE.Mesh(sheetGeometry(top, bottom, zAt, 5, 9, 0.5), fallsMaterial(0.3, 0.8, 7.3)));

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(POOL.r + 1, 48).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: {
        ...fogUniforms(), uTime: shared.uTime,
        uImpact: { value: new THREE.Vector2(impact.x, impact.z) },
        uCenter: { value: new THREE.Vector2(POOL.x, POOL.z) },
        uRadius: { value: POOL.r },
      },
      vertexShader: FOG_VERT,
      fragmentShader: POOL_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    }),
  );
  pool.position.set(POOL.x, WATER_Y, POOL.z);
  group.add(pool);

  const r = () => rand() - 0.5;
  // Spray bursting up off the impact point.
  group.add(ballistic(1100, (rnd) => [
    impact.x + r() * 6, WATER_Y, impact.z + r() * 1.5,
    r() * 7, 1.5 + rnd() * 6.5, 0.6 + rnd() * 4, 0.9 + rnd() * 1.6, -6, 0.07 + rnd() * 0.12,
  ], rand, { color: [1.5, 1.7, 2.0] }));
  // Droplets peeling off the falling sheet.
  group.add(ballistic(900, (rnd) => [
    FALLS.x + r() * 4.5, top, zAt(top) + 0.3,
    r() * 0.8, -rnd() * 2, 0.8 + rnd() * 1.8, 2.6 + rnd() * 0.6, -9.8, 0.07 + rnd() * 0.1,
  ], rand, { color: [1.8, 2.0, 2.3] }));
  // Soft mist billowing around the base.
  group.add(ballistic(220, (rnd) => [
    impact.x + r() * 10, WATER_Y + rnd() * 2, impact.z + r() * 6 + 1,
    r() * 0.8, 0.3 + rnd() * 0.7, 0.2 + rnd() * 0.6, 6 + rnd() * 5, 0, 5 + rnd() * 6,
  ], rand, { color: [0.6, 0.7, 0.85], opacity: 0.02 }));

  const light = new THREE.PointLight(0x8ab8ff, 35, 24, 1.6);
  light.position.set(impact.x, 2.5, impact.z + 2);
  group.add(light);
  return { group, impact };
}
