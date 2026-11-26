import * as THREE from 'three';
import { shared, fogUniforms } from './shared.js';

// GPU-animated ballistic particles: one draw call per system, no per-frame CPU work.
// Each particle loops: pos = start + vel*age + 0.5*g*age^2, with a phase offset per particle.
const BALLISTIC_VERT = /* glsl */ `
attribute vec3 aVel;
attribute vec4 aParams; // life, phase, gravity, size
uniform float uTime, uPointScale, fogDensity;
varying float vAlpha;
void main() {
  float life = aParams.x;
  float age = mod(uTime + aParams.y * life, life);
  float t = age / life;
  vec3 p = position + aVel * age + vec3(0.0, 0.5 * aParams.z * age * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = clamp(aParams.w * uPointScale / d, 1.0, 160.0);
  vAlpha = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.7, t) * exp(-fogDensity * fogDensity * d * d);
}`;

const FIREFLY_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uPointScale, fogDensity;
varying float vAlpha;
void main() {
  float s = aSeed * 6.2831;
  vec3 p = position + vec3(sin(uTime * 0.4 + s) * 1.6, sin(uTime * 0.9 + s * 1.7) * 0.5, cos(uTime * 0.33 + s * 2.3) * 1.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = clamp(0.22 * uPointScale / d, 2.0, 24.0);
  float blink = pow(max(0.0, sin(uTime * (0.7 + aSeed) + s * 3.0)), 2.0);
  vAlpha = (0.15 + 0.85 * blink) * exp(-fogDensity * fogDensity * d * d * 0.5);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, r) * vAlpha * uOpacity);
}`;

function material(vertexShader, color, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uTime: shared.uTime,
      uPointScale: shared.uPointScale,
      uColor: { value: new THREE.Color().setRGB(...color) },
      uOpacity: { value: opacity },
    },
    vertexShader,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
}

// spawn(rand) -> [x, y, z, vx, vy, vz, life, gravity, size]
export function ballistic(count, spawn, rand, { color, opacity = 1 }) {
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), par = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const [x, y, z, vx, vy, vz, life, g, size] = spawn(rand);
    pos.set([x, y, z], i * 3);
    vel.set([vx, vy, vz], i * 3);
    par.set([life, rand(), g, size], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(par, 4));
  const points = new THREE.Points(geo, material(BALLISTIC_VERT, color, opacity));
  points.frustumCulled = false;
  return points;
}

export function fireflies(positions, rand) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: positions.length / 3 }, rand), 1));
  const points = new THREE.Points(geo, material(FIREFLY_VERT, [2.2, 3.4, 5.0], 1));
  points.frustumCulled = false;
  return points;
}
