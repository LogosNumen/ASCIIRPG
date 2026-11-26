import * as THREE from 'three';
import { groundAt, heightAt, inBounds } from './world/layout.js';

const GRAVITY = 24;
const SPEED = 6.5;
const MAX_SLOPE = 1.0; // rise over run; steeper terrain blocks movement

function buildModel() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: 0x8c98ab, emissive: 0x1c2430, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x101318 });
  const add = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const body = add(new THREE.ConeGeometry(0.55, 1.45, 8), cloth, 0, 0.72, 0);
  add(new THREE.SphereGeometry(0.36, 8, 6), cloth, 0, 1.35, 0).scale.y = 0.7;
  add(new THREE.ConeGeometry(0.3, 0.62, 8), cloth, 0, 1.76, -0.04);
  add(new THREE.SphereGeometry(0.27, 8, 6), cloth, 0, 1.6, -0.04); // back of the hood
  add(new THREE.SphereGeometry(0.2, 8, 6), dark, 0, 1.6, 0.13);
  // Red scarf: the warm accent that keeps the wanderer readable in the ASCII pass.
  const scarf = add(new THREE.BoxGeometry(0.16, 0.7, 0.05), new THREE.MeshLambertMaterial({ color: 0xb0322a }), 0.12, 1.05, -0.34);
  scarf.rotation.x = 0.35;
  const swordPivot = new THREE.Group();
  swordPivot.position.set(0.42, 1.0, 0.1);
  g.add(swordPivot);
  const steel = new THREE.MeshLambertMaterial({ color: 0xd8e2ee, emissive: 0x223344 });
  add(new THREE.BoxGeometry(0.07, 0.07, 1.25), steel, 0, 0, 0.7, swordPivot);
  add(new THREE.BoxGeometry(0.3, 0.06, 0.06), dark, 0, 0, 0.08, swordPivot);
  const slash = add(
    new THREE.RingGeometry(1.0, 2.5, 20, 1, -Math.PI / 2 - 1.15, 2.3).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.5, 2.8, 3.2), transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    0, 1.0, 0,
  );
  return { g, body, scarf, swordPivot, slash };
}

export class Player {
  constructor(scene) {
    this.model = buildModel();
    this.mesh = this.model.g;
    scene.add(this.mesh);
    const lantern = new THREE.PointLight(0xffb070, 5, 9, 1.6);
    lantern.position.set(0, 1.8, 0.4);
    this.mesh.add(lantern);
    this.vy = 0;
    this.grounded = true;
    this.facing = Math.PI; // model faces +z; PI looks north up the valley
    this.dodgeT = 0;
    this.dodgeDir = [0, 0];
    this.invuln = 0;
    this.attackT = -1;
    this.attackCd = 0;
    this.walk = 0;
  }

  get pos() { return this.mesh.position; }

  teleport(x, z) {
    this.pos.set(x, groundAt(x, z), z);
    this.vy = 0;
  }

  tryMove(dx, dz) {
    const p = this.pos;
    const cur = heightAt(p.x, p.z);
    const ok = (nx, nz) => inBounds(nx, nz) && (heightAt(nx, nz) - cur) / (Math.hypot(nx - p.x, nz - p.z) || 1e-6) < MAX_SLOPE;
    if (ok(p.x + dx, p.z)) p.x += dx;
    if (ok(p.x, p.z + dz)) p.z += dz;
  }

  // Returns a strike {x, z, dirX, dirZ} on the frame the swing connects, else null.
  update(dt, input, camYaw, colliders) {
    const p = this.pos;
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dodgeT = Math.max(0, this.dodgeT - dt);

    const k = input.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let mx = fx * f + Math.cos(camYaw) * r, mz = fz * f - Math.sin(camYaw) * r;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }

    if (input.jump && this.grounded) {
      this.vy = 8;
      this.grounded = false;
      this.invuln = Math.max(this.invuln, 0.4);
      if (len > 0) { this.dodgeT = 0.3; this.dodgeDir = [mx, mz]; }
    }

    let speed = SPEED * (this.attackT >= 0 ? 0.35 : 1);
    if (this.dodgeT > 0) { [mx, mz] = this.dodgeDir; speed = SPEED * 2.3; }
    const moving = len > 0 || this.dodgeT > 0;
    if (moving) {
      this.tryMove(mx * speed * dt, mz * speed * dt);
      if (this.attackT < 0) this.turnTo(Math.atan2(mx, mz), dt);
    }
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.45;
      if (d < min && d > 1e-4) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
    }

    this.vy -= GRAVITY * dt;
    p.y += this.vy * dt;
    const g = groundAt(p.x, p.z);
    if (p.y <= g || (this.grounded && this.vy <= 0 && p.y - g < 0.5)) {
      p.y = g;
      this.vy = 0;
      this.grounded = true;
    } else this.grounded = false;

    let strike = null;
    if (input.attack && this.attackCd <= 0) {
      this.attackT = 0;
      this.attackCd = 0.5;
      this.struck = false;
      if (len === 0) this.facing = Math.atan2(fx, fz); // idle swings go where the camera looks
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (!this.struck && this.attackT >= 0.1) {
        this.struck = true;
        strike = { x: p.x, z: p.z, dirX: Math.sin(this.facing), dirZ: Math.cos(this.facing) };
      }
      if (this.attackT > 0.3) this.attackT = -1;
    }
    this.animate(dt, moving);
    return strike;
  }

  turnTo(target, dt) {
    let d = target - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * 14);
  }

  animate(dt, moving) {
    const m = this.model;
    this.mesh.rotation.y = this.facing;
    this.walk += dt * (moving ? 10 : 2);
    m.body.scale.set(1, 1 + Math.sin(this.walk) * (moving ? 0.04 : 0.01), 1);
    m.scarf.rotation.x = 0.35 + (moving ? 0.5 : 0.1) + Math.sin(this.walk * 0.7) * 0.15;
    if (this.attackT >= 0) {
      const t = Math.min(1, this.attackT / 0.22);
      m.swordPivot.rotation.set(0, 1.5 - t * 3, 0);
      m.slash.material.opacity = (1 - this.attackT / 0.3) * 0.9;
    } else {
      m.swordPivot.rotation.set(-0.5, 0.2, 0);
      m.slash.material.opacity = 0;
    }
    this.mesh.visible = this.invuln <= 0 || this.dodgeT > 0 || Math.floor(this.invuln * 20) % 2 === 0;
  }
}
