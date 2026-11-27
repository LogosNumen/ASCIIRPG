import * as THREE from 'three';
import { heightAt, CAVERN, CAVERN_EXIT } from './layout.js';
import { fireflies } from '../render/particles.js';
import { smooth } from './layout.js';

const glow = (r, g, b, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b), ...extra });

// The hollow beneath the falls: a domed cavern lit by crystals and one shaft of moonlight.
export function createCavern(rand) {
  const group = new THREE.Group();

  const geo = new THREE.PlaneGeometry(64, 64, 110, 110);
  geo.rotateX(-Math.PI / 2);
  geo.translate(CAVERN.x, 0, CAVERN.z);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3), c = new THREE.Color();
  const floor = new THREE.Color(0x2a2f3a), wall = new THREE.Color(0x1a1e26), moss = new THREE.Color(0x1f3a3c);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    c.copy(floor).lerp(moss, rand() * 0.5).lerp(wall, smooth(0.5, 6, y));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // Rock dome with a hole near the top where the moonlight falls through.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(34, 24, 12, 0, Math.PI * 2, 0.12, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x14171d, flatShading: true, side: THREE.BackSide }),
  );
  dome.position.set(CAVERN.x, -2, CAVERN.z);
  group.add(dome);

  // Stalactites and crystal clusters, instanced.
  const m = new THREE.Object3D();
  const stal = new THREE.InstancedMesh(new THREE.ConeGeometry(0.6, 1, 5), new THREE.MeshLambertMaterial({ color: 0x232833, flatShading: true }), 70);
  for (let i = 0; i < stal.count; i++) {
    const a = rand() * Math.PI * 2, r = 6 + rand() * 22, h = 2 + rand() * 6;
    const x = CAVERN.x + Math.cos(a) * r, z = CAVERN.z + Math.sin(a) * r;
    const top = Math.sqrt(Math.max(0, 34 * 34 - r * r)) - 2;
    m.position.set(x, top - h / 2, z);
    m.rotation.set(Math.PI, rand() * 3, 0);
    m.scale.set(0.6 + rand(), h, 0.6 + rand());
    m.updateMatrix();
    stal.setMatrixAt(i, m.matrix);
  }
  const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), glow(0.9, 2.4, 3.6), 90);
  for (let i = 0; i < crystals.count; i++) {
    const a = rand() * Math.PI * 2, r = CAVERN.r - 2 + rand() * 6;
    const x = CAVERN.x + Math.cos(a) * r, z = CAVERN.z + Math.sin(a) * r;
    if (Math.hypot(x - CAVERN_EXIT.x, z - CAVERN_EXIT.z) < 4) { i--; continue; }
    m.position.set(x, heightAt(x, z) + rand() * 0.6, z);
    m.rotation.set((rand() - 0.5) * 1.2, rand() * 3, (rand() - 0.5) * 1.2);
    const s = 0.4 + rand() * 1.1;
    m.scale.set(s * 0.6, s * 2.2, s * 0.6);
    m.updateMatrix();
    crystals.setMatrixAt(i, m.matrix);
  }
  group.add(stal, crystals);

  // Shaft of moonlight and the trickle of water that falls with it.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 3, 34, 16, 1, true),
    glow(0.35, 0.5, 0.8, { transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  shaft.position.set(CAVERN.x + 9, 15, CAVERN.z + 3); // off to the side so it never hides the fight
  group.add(shaft);

  const lightA = new THREE.PointLight(0x6fc8ff, 70, 45, 1.3);
  lightA.position.set(CAVERN.x, 9, CAVERN.z);
  group.add(lightA);

  // Exit: a ring of pale light that opens once the Colossus falls.
  const exit = new THREE.Group();
  exit.position.set(CAVERN_EXIT.x, heightAt(CAVERN_EXIT.x, CAVERN_EXIT.z), CAVERN_EXIT.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.18, 6, 32), glow(2.5, 3, 4));
  ring.position.y = 2.3;
  const veil = new THREE.Mesh(new THREE.CircleGeometry(1.9, 32), glow(1.2, 1.6, 2.4, { transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  veil.position.y = 2.3;
  exit.add(ring, veil);
  exit.visible = false;
  group.add(exit);

  const motes = [];
  for (let i = 0; i < 160; i++) {
    const a = rand() * Math.PI * 2, r = rand() * CAVERN.r;
    motes.push(CAVERN.x + Math.cos(a) * r, 0.5 + rand() * 8, CAVERN.z + Math.sin(a) * r);
  }
  group.add(fireflies(motes, rand));

  return {
    group,
    update(t, exitOpen) {
      exit.visible = exitOpen;
      ring.rotation.z = t * 0.5;
      veil.material.opacity = 0.4 + Math.sin(t * 3) * 0.15;
      shaft.material.opacity = 0.05 + Math.sin(t * 0.7) * 0.015;
    },
  };
}
