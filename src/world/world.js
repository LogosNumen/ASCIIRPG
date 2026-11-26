import * as THREE from 'three';
import { rng } from './noise.js';
import { heightAt, POOL, inBounds } from './layout.js';
import { createTerrain, createGrass, createRocks } from './terrain.js';
import { createWaterfall } from './waterfall.js';
import { createShrine, createNpc, createCave } from './landmarks.js';
import { fireflies, ballistic } from '../render/particles.js';

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uHorizon;
void main() {
  vec3 d = normalize(vDir);
  vec3 zenith = vec3(0.01, 0.016, 0.032);
  float warm = pow(max(0.0, dot(normalize(d.xz + 1e-4), normalize(vec2(-0.5, -1.0)))), 6.0) * smoothstep(0.3, 0.0, d.y);
  vec3 horizon = uHorizon + vec3(0.16, 0.07, 0.03) * warm;
  gl_FragColor = vec4(mix(horizon, zenith, smoothstep(0.0, 0.55, d.y)), 1.0);
}`;

export function createWorld(scene) {
  const rand = rng(7);
  const horizon = new THREE.Color().setRGB(0.03, 0.04, 0.06);
  scene.fog = new THREE.FogExp2(horizon.clone(), 0.0105);
  scene.background = horizon.clone();

  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: horizon } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  }));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.2, 2.3, 2.6), fog: false }));
  moon.position.set(-140, 150, -330);
  const starPos = [];
  for (let i = 0; i < 700; i++) {
    const a = rand() * Math.PI * 2, y = 0.15 + rand() * 0.85, r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(a) * r * 400, y * 400, Math.sin(a) * r * 400);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xb8c8e8, size: 1.6, sizeAttenuation: false, fog: false }),
  );
  scene.add(sky, moon, stars);

  scene.add(new THREE.HemisphereLight(0x8aa2c8, 0x1a2a1c, 0.9));
  const moonLight = new THREE.DirectionalLight(0xaec4e8, 2.6);
  moonLight.position.set(-50, 55, 10);
  const fill = new THREE.DirectionalLight(0x5a6a88, 0.7);
  fill.position.set(30, 25, 60);
  scene.add(moonLight, fill);

  scene.add(createTerrain(), createGrass(70000, rand), createRocks(rand));
  const falls = createWaterfall(rand);
  const shrine = createShrine();
  const npc = createNpc();
  const cave = createCave();
  scene.add(falls.group, shrine.group, npc.group, cave.group);

  const ff = [];
  while (ff.length < 320 * 3) {
    const nearPool = rand() < 0.3;
    const x = nearPool ? POOL.x + (rand() - 0.5) * 22 : -30 + rand() * 60;
    const z = nearPool ? POOL.z + 4 + (rand() - 0.5) * 16 : -38 + rand() * 92;
    if (!inBounds(x, z) || heightAt(x, z) > 3) continue;
    ff.push(x, Math.max(heightAt(x, z), -0.4) + 0.4 + rand() * 2.2, z);
  }
  scene.add(fireflies(ff, rand));
  // Low valley mist drifting across the meadow.
  scene.add(ballistic(380, (rnd) => [
    -30 + rnd() * 60, heightAt(0, 0) + 0.3 + rnd() * 2, -40 + rnd() * 95,
    0.2 + rnd() * 0.5, 0, (rnd() - 0.5) * 0.3, 14 + rnd() * 10, 0, 9 + rnd() * 9,
  ], rand, { color: [0.45, 0.55, 0.7], opacity: 0.016 }));

  return {
    colliders: [...shrine.colliders, npc.collider],
    impact: falls.impact,
    update(t, caveOpen) {
      shrine.update(t);
      npc.update(t);
      cave.update(t, caveOpen);
    },
  };
}
