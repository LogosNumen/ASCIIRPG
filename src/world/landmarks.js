import * as THREE from 'three';
import { heightAt, groundAt, SHRINE, SHRINE_TOP, NPC_POS, CAVE } from './layout.js';

const stone = new THREE.MeshLambertMaterial({ color: 0x5f666e, flatShading: true });
const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b) });

function mesh(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function createShrine() {
  const g = new THREE.Group();
  g.position.set(SHRINE.x, SHRINE_TOP - 0.55, SHRINE.z);
  mesh(new THREE.CylinderGeometry(SHRINE.r, SHRINE.r + 0.4, 0.7, 10), stone, 0, 0.2, 0, g);
  const colliders = [];
  const heights = [3.8, 1.3, 4.3, 4.3, 0.6, 2.9, 1.9];
  heights.forEach((h, i) => {
    const a = (i / heights.length) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 4.2, z = Math.sin(a) * 4.2;
    const p = mesh(new THREE.CylinderGeometry(0.34, 0.42, h, 6), stone, x, 0.55 + h / 2, z, g);
    p.rotation.z = (i % 3 - 1) * 0.04;
    if (h > 3.5) mesh(new THREE.BoxGeometry(1, 0.3, 1), stone, x, 0.55 + h + 0.15, z, g);
    colliders.push({ x: SHRINE.x + x, z: SHRINE.z + z, r: 0.55 });
  });
  // Lintel across the two adjacent tall pillars, and one toppled column.
  const pa = (2 / 7) * Math.PI * 2 + 0.3, pb = (3 / 7) * Math.PI * 2 + 0.3;
  const dx = (Math.cos(pb) - Math.cos(pa)) * 4.2, dz = (Math.sin(pb) - Math.sin(pa)) * 4.2;
  const lintel = mesh(new THREE.BoxGeometry(Math.hypot(dx, dz) + 1, 0.45, 0.8), stone,
    (Math.cos(pa) + Math.cos(pb)) * 2.1, 0.55 + 4.3 + 0.52, (Math.sin(pa) + Math.sin(pb)) * 2.1, g);
  lintel.rotation.y = -Math.atan2(dz, dx);
  const fallen = mesh(new THREE.CylinderGeometry(0.38, 0.42, 3.6, 6), stone, -6.5, heightAt(SHRINE.x - 6.5, SHRINE.z + 1.5) - SHRINE_TOP + 0.9, 1.5, g);
  fallen.rotation.set(0.1, 0.4, Math.PI / 2);

  mesh(new THREE.BoxGeometry(1.6, 1, 1.1), stone, 0, 1.05, 0, g);
  mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.35, 8), stone, 0, 1.72, 0, g);
  const flame = mesh(new THREE.ConeGeometry(0.26, 0.8, 6), glow(4, 1.7, 0.45), 0, 2.25, 0, g);
  const light = new THREE.PointLight(0xff9a50, 22, 14, 1.8);
  light.position.set(0, 2.6, 0);
  g.add(light);
  colliders.push({ x: SHRINE.x, z: SHRINE.z, r: 1.1 });

  return {
    group: g,
    colliders,
    update(t) {
      const f = 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23.7) * 0.07;
      flame.scale.set(1, f, 1);
      light.intensity = 22 * f;
    },
  };
}

export function createNpc() {
  const g = new THREE.Group();
  const robe = new THREE.MeshLambertMaterial({ color: 0x9aa1ab, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x15181d });
  mesh(new THREE.ConeGeometry(0.6, 1.6, 8), robe, 0, 0.8, 0, g);
  mesh(new THREE.SphereGeometry(0.38, 8, 6), robe, 0, 1.45, 0, g).scale.y = 0.7;
  mesh(new THREE.ConeGeometry(0.32, 0.7, 8), robe, 0, 1.85, -0.04, g);
  mesh(new THREE.SphereGeometry(0.2, 8, 6), dark, 0, 1.68, 0.13, g);
  const staff = mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 5), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }), 0.55, 1.2, 0.15, g);
  staff.rotation.z = -0.08;
  const orb = mesh(new THREE.SphereGeometry(0.14, 8, 6), glow(2.5, 3.6, 5), 0.6, 2.45, 0.15, g);
  g.position.set(NPC_POS.x, groundAt(NPC_POS.x, NPC_POS.z), NPC_POS.z);
  g.rotation.y = Math.atan2(-2 - NPC_POS.x, 30 - NPC_POS.z); // face the path toward the south
  return {
    group: g,
    collider: { x: NPC_POS.x, z: NPC_POS.z, r: 0.7 },
    update(t) {
      g.children[0].scale.y = 1 + Math.sin(t * 1.5) * 0.015;
      orb.scale.setScalar(1 + Math.sin(t * 2.2) * 0.15);
    },
  };
}

export function createCave() {
  const g = new THREE.Group();
  const y = heightAt(CAVE.x, CAVE.z - 2.5);
  g.position.set(CAVE.x, y, CAVE.z - 2.5);
  mesh(new THREE.CircleGeometry(3.3, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, -0.2, 0, g);
  const arch = mesh(new THREE.TorusGeometry(3.6, 0.85, 5, 12, Math.PI), stone, 0, -0.2, 0.2, g);
  arch.scale.z = 1.4;
  for (let i = 0; i < 6; i++) {
    const r = mesh(new THREE.DodecahedronGeometry(0.4 + (i % 3) * 0.3, 0), stone, (i - 2.5) * 1.6, 0.1, 1.5 + (i % 2), g);
    r.rotation.set(i, i * 2, 0);
  }
  // Pale glow that wakes in the mouth once the path is clear.
  const veil = mesh(new THREE.CircleGeometry(3.2, 20, 0, Math.PI), new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.6, 0.9, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }), 0, -0.2, 0.05, g);
  const light = new THREE.PointLight(0x7fc4ff, 0, 18, 1.6);
  light.position.set(0, 2, 2.5);
  g.add(light);
  return {
    group: g,
    update(t, open) {
      const target = open ? 0.35 + Math.sin(t * 2) * 0.1 : 0;
      veil.material.opacity += (target - veil.material.opacity) * 0.05;
      light.intensity = veil.material.opacity * 120;
    },
  };
}
