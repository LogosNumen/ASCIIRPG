import * as THREE from 'three';
import { shared } from '../render/shared.js';
import { heightAt, distToPath, smooth, POOL, SHRINE, CAVE } from './layout.js';
import { noise, fbm } from './noise.js';

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(220, 220, 240, 240);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grass = new THREE.Color(0x1d3a22), moss = new THREE.Color(0x2f4f2c);
  const rock = new THREE.Color(0x4a525c), rockDark = new THREE.Color(0x272c34), dirt = new THREE.Color(0x4d4335);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const steep = smooth(0.92, 0.6, nrm.getY(i));
    const n = noise(x * 0.3, z * 0.3);
    c.copy(grass).lerp(moss, n);
    c.lerp(n > 0.45 ? rock : rockDark, Math.max(steep, smooth(4, 10, y)));
    c.lerp(dirt, smooth(2.2, 0.8, distToPath(x, z)) * (1 - steep));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

function slopeAt(x, z) {
  const h = heightAt(x, z);
  return Math.abs(heightAt(x + 0.7, z) - h) + Math.abs(heightAt(x, z + 0.7) - h);
}

function bladeGeometry() {
  const w = 0.07;
  const rows = [[0, 1], [0.4, 0.8], [0.75, 0.5]];
  const p = [], col = [];
  for (const [y, s] of rows) {
    p.push(-w * s, y, 0, w * s, y, 0);
    col.push(0.35 + y, 0.35 + y, 0.35 + y, 0.35 + y, 0.35 + y, 0.35 + y);
  }
  p.push(0, 1, 0);
  col.push(1.3, 1.3, 1.3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Array(7).fill([0, 1, 0]).flat(), 3));
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  return geo;
}

export function createGrass(count, rand) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  // Wind sway applied after instancing so every blade bends the same world direction.
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = shared.uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <project_vertex>', /* glsl */ `
      vec4 mvPosition = vec4(transformed, 1.0);
      mvPosition = instanceMatrix * mvPosition;
      vec3 ip = instanceMatrix[3].xyz;
      float k = position.y * position.y;
      float gust = sin(uTime * 0.6 + ip.x * 0.05 + ip.z * 0.08) * 0.5 + 0.5;
      float w = sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.22) * (0.25 + gust * 0.5) + sin(uTime * 3.3 + ip.x * 1.3) * 0.08;
      mvPosition.x += w * k * 0.45;
      mvPosition.z += w * k * 0.2;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  // Blades are binned into 16 m tiles, one InstancedMesh each, so tiles off-screen are frustum-culled.
  const TILE = 16, tiles = new Map();
  const m = new THREE.Object3D();
  const deep = new THREE.Color(0x24502e), blue = new THREE.Color(0x2f6a62), pale = new THREE.Color(0x6f8f5c);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 8; tries++) {
    const x = -32 + rand() * 64, z = -40 + rand() * 98;
    if (rand() > 0.25 + fbm(x * 0.06, z * 0.06) * 0.9) continue; // clumpy meadows
    if (distToPath(x, z) < 1.3 || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r - 0.5) continue;
    if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < SHRINE.r + 0.3 || Math.hypot(x - CAVE.x, z - CAVE.z) < 3) continue;
    if (slopeAt(x, z) > 0.55) continue;
    m.position.set(x, heightAt(x, z) - 0.05, z);
    m.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI * 2, 0);
    const h = 0.4 + rand() * rand() * 0.85; // stays under the wanderer's shoulders
    m.scale.set(0.8 + rand() * 0.6, h, 1);
    m.updateMatrix();
    const c = deep.clone().lerp(blue, rand() * 0.8);
    if (rand() < 0.12) c.lerp(pale, 0.6);
    const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push([m.matrix.clone(), c]);
    n++;
  }
  const geo = bladeGeometry(), group = new THREE.Group();
  for (const list of tiles.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([mx, c], i) => { mesh.setMatrixAt(i, mx); mesh.setColorAt(i, c); });
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 0.5; // wind sway
    group.add(mesh);
  }
  return group;
}

export function createRocks(rand) {
  const group = new THREE.Group();
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x4f5761, flatShading: true }), 140);
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x1f4027, flatShading: true }), 110);
  const m = new THREE.Object3D();
  const place = (mesh, accept, size) => {
    let n = 0;
    for (let tries = 0; n < mesh.count && tries < 5000; tries++) {
      const x = -36 + rand() * 72, z = -44 + rand() * 100;
      if (!accept(x, z) || distToPath(x, z) < 2) continue;
      const s = size();
      m.position.set(x, heightAt(x, z) + s * 0.1, z);
      m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      m.scale.set(s * (0.8 + rand() * 0.5), s * (0.5 + rand() * 0.5), s * (0.8 + rand() * 0.5));
      m.updateMatrix();
      mesh.setMatrixAt(n++, m.matrix);
    }
    mesh.count = n;
    mesh.computeBoundingSphere();
  };
  const nearWall = (x, z) => { const s = slopeAt(x, z); return s > 0.3 && s < 2.5; };
  place(rockMesh, (x, z) => nearWall(x, z) || rand() < 0.08 || Math.abs(Math.hypot(x - POOL.x, z - POOL.z) - POOL.r) < 1.5, () => 0.4 + rand() * rand() * 2.2);
  place(bushMesh, (x, z) => slopeAt(x, z) < 1.2 && (nearWall(x, z) || rand() < 0.05), () => 0.6 + rand() * 1.1);
  group.add(rockMesh, bushMesh);
  return group;
}
