import * as THREE from 'three';

// Uniform objects shared by every animated material, so one write per frame updates them all.
export const shared = {
  uTime: { value: 0 },
  uPointScale: { value: 500 }, // px per world unit at distance 1, set on resize
};

export const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}`;
