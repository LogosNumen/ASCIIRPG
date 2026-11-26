import * as THREE from 'three';
import { shared } from './shared.js';

// Glyph sets are sorted by measured ink coverage when the atlas is built, so order here doesn't matter.
export const GLYPH_PRESETS = {
  valley: " .`',:;-~=+*irxzvoaecsXZ#%&@",
  classic: ' .:-=+*#%@',
  dense: " .'`^,:;~-_+<>i!lI?/|()1{}[]rcvunxzjftLCJUYXZO0Qoahkbdpqwm*#MW&8%B@$",
  letters: ' .,coaesxnwmkhdbqpgXWM#@',
  blocks: ' ░▒▓█',
};

const CELL_ASPECT = 1.5;

// Atlas tiles are exactly one cell in device pixels, so glyphs are drawn by the browser's text
// rasteriser at their final size and fetched texel-for-texel: crisp, no resampling blur.
function buildAtlas(chars, tw, th) {
  const glyphs = [...new Set([' ', ...chars])];
  const canvas = document.createElement('canvas');
  canvas.width = tw * glyphs.length;
  canvas.height = th;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const draw = (list) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = `${tw >= 9 ? 'bold ' : ''}${Math.round(th * 0.85)}px Consolas, "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    list.forEach((g, i) => ctx.fillText(g, i * tw + tw / 2, Math.round(th / 2) + 1));
  };
  draw(glyphs);
  const data = ctx.getImageData(0, 0, canvas.width, th).data;
  const ink = glyphs.map((_, i) => {
    let s = 0;
    for (let y = 0; y < th; y++)
      for (let x = i * tw; x < (i + 1) * tw; x++) s += data[(y * canvas.width + x) * 4];
    return s;
  });
  const sorted = glyphs.map((g, i) => [g, ink[i]]).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  draw(sorted);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return { texture, count: sorted.length };
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tAtlas;
uniform float uGlyphCount;
uniform vec2 uResolution;   // output size in device px
uniform vec2 uCell;         // cell size in device px (whole pixels, matches the atlas tiles)
uniform float uMip;         // mip level that averages roughly one cell of the scene
uniform float uEnabled, uContrast, uSaturation, uGamma, uBrightness, uGain, uBgMix, uDetail, uJitter, uExposure, uGlow, uTime;
varying vec2 vUv;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toDisplay(vec3 lin) { return pow(aces(lin * uExposure), vec3(1.0 / 2.2)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  if (uEnabled < 0.5) { gl_FragColor = vec4(toDisplay(texture2D(tScene, vUv).rgb), 1.0); return; }

  vec2 frag = gl_FragCoord.xy;
  vec2 cellId = floor(frag / uCell);
  vec2 centerUv = (cellId + 0.5) * uCell / uResolution;
  // Cell average, plus a sharper sample so tiny bright things (spray, fireflies) survive the averaging.
  vec3 avg = textureLod(tScene, centerUv, uMip).rgb;
  vec3 sharp = textureLod(tScene, centerUv, max(uMip - 2.0, 0.0)).rgb;
  vec3 col = toDisplay(max(avg, sharp * uDetail));

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float l = pow(lum, uGamma);
  l = (l - 0.5) * uContrast + 0.5 + uBrightness;
  l += (hash(cellId + floor(uTime * 6.0)) - 0.5) * uJitter;
  l = clamp(l, 0.0, 0.999);

  float idx = floor(l * uGlyphCount);
  ivec2 local = ivec2(frag - cellId * uCell);
  float mask = texelFetch(tAtlas, ivec2(int(idx) * int(uCell.x) + local.x, local.y), 0).r;

  vec3 tint = mix(vec3(lum), col, uSaturation);
  // Soft halo from a blurred mip, so bright water and lights bloom behind the glyphs.
  vec3 halo = toDisplay(textureLod(tScene, vUv, uMip + 2.0).rgb);
  gl_FragColor = vec4(tint * mask * uGain + col * uBgMix + halo * halo * halo * uGlow, 1.0);
}`;

export class AsciiRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = { w: 1, h: 1 };
    this.params = {
      enabled: true,
      cellSize: 6,
      renderScale: 1, // 3D scene resolution under the ASCII pass; lower it on slow GPUs
      preset: 'valley',
      glyphs: GLYPH_PRESETS.valley,
      contrast: 1.3,
      saturation: 1.4,
      gamma: 0.55, // brightness curve
      brightness: 0.0,
      gain: 2.4,
      bgMix: 0.15,
      detail: 0.7,
      jitter: 0.03,
      exposure: 1.3,
      glow: 0.45,
    };
    // Scene renders at CSS resolution (x renderScale) with 4x MSAA so thin grass doesn't
    // alias into flickering glyphs; the glyph pass runs at device resolution.
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.atlasKey = '';
    const v = (value) => ({ value });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tScene: v(this.rt.texture), tAtlas: v(null), uGlyphCount: v(1),
        uResolution: v(new THREE.Vector2()), uCell: v(new THREE.Vector2()), uMip: v(0),
        uEnabled: v(1), uContrast: v(1), uSaturation: v(1), uGamma: v(1), uBrightness: v(0),
        uGain: v(1), uBgMix: v(0), uDetail: v(0), uJitter: v(0), uExposure: v(1), uGlow: v(0), uTime: v(0),
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.postScene = new THREE.Scene().add(quad);
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setGlyphs(chars) {
    this.params.glyphs = chars || ' ';
  }

  // Rebuilt only when glyphs, cell size or pixel ratio change.
  updateAtlas(tw, th) {
    const key = `${this.params.glyphs}|${tw}|${th}`;
    if (key === this.atlasKey) return;
    this.atlasKey = key;
    const u = this.material.uniforms;
    u.tAtlas.value?.dispose();
    const { texture, count } = buildAtlas(this.params.glyphs, tw, th);
    u.tAtlas.value = texture;
    u.uGlyphCount.value = count;
  }

  setSize(w, h) {
    this.size = { w, h };
    this.renderer.setSize(w, h);
  }

  render(scene, camera, time) {
    const p = this.params;
    const u = this.material.uniforms;
    const pr = this.renderer.getPixelRatio();
    const scale = p.enabled ? p.renderScale : 1;
    const rw = Math.max(1, Math.round(this.size.w * scale)), rh = Math.max(1, Math.round(this.size.h * scale));
    if (this.rt.width !== rw || this.rt.height !== rh) this.rt.setSize(rw, rh);
    shared.uPointScale.value = rh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const tw = Math.max(3, Math.round(p.cellSize * pr)), th = Math.round(tw * CELL_ASPECT);
    this.updateAtlas(tw, th);
    u.uResolution.value.set(this.size.w * pr, this.size.h * pr);
    u.uCell.value.set(tw, th);
    u.uMip.value = Math.max(0, Math.log2((Math.sqrt(tw * th) / pr) * scale));
    u.uEnabled.value = p.enabled ? 1 : 0;
    u.uContrast.value = p.contrast;
    u.uSaturation.value = p.saturation;
    u.uGamma.value = p.gamma;
    u.uBrightness.value = p.brightness;
    u.uGain.value = p.gain;
    u.uBgMix.value = p.bgMix;
    u.uDetail.value = p.detail;
    u.uJitter.value = p.jitter;
    u.uExposure.value = p.exposure;
    u.uGlow.value = p.glow;
    u.uTime.value = time;

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }
}
