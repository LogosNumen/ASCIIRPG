import * as THREE from 'three';
import { groundAt, heightAt, inBounds } from './world/layout.js';

const GRAVITY = 24;
const SPEED = 6.5;
const MAX_SLOPE = 1.0; // rise over run; steeper terrain blocks movement

const HIP = 0.85; // rig pivot height: lean, roll and squash happen around the hips

function buildModel() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  rig.position.y = HIP;
  g.add(rig);
  const body = new THREE.Group();
  body.position.y = -HIP;
  rig.add(body);
  const cloth = new THREE.MeshLambertMaterial({ color: 0x8c98ab, emissive: 0x1c2430, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x101318 });
  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const cloak = add(new THREE.ConeGeometry(0.55, 1.45, 8), cloth, 0, 0.72, 0);
  add(new THREE.SphereGeometry(0.36, 8, 6), cloth, 0, 1.35, 0).scale.y = 0.7;
  const hood = new THREE.Group();
  hood.position.set(0, 1.6, -0.04);
  body.add(hood);
  add(new THREE.ConeGeometry(0.3, 0.62, 8), cloth, 0, 0.16, 0, hood);
  add(new THREE.SphereGeometry(0.27, 8, 6), cloth, 0, 0, 0, hood); // back of the hood
  add(new THREE.SphereGeometry(0.2, 8, 6), dark, 0, 0, 0.17, hood);
  // Boots peek out under the cloak hem as the wanderer steps.
  const feet = [-1, 1].map((s) => add(new THREE.BoxGeometry(0.17, 0.12, 0.3), dark, s * 0.17, 0.06, 0.05, g));
  // Red scarf: the warm accent that keeps the wanderer readable in the ASCII pass.
  const scarf = add(new THREE.BoxGeometry(0.16, 0.7, 0.05), new THREE.MeshLambertMaterial({ color: 0xb0322a }), 0.12, 1.05, -0.34);
  const swordPivot = new THREE.Group();
  swordPivot.position.set(0.42, 1.0, 0.1);
  body.add(swordPivot);
  const steel = new THREE.MeshLambertMaterial({ color: 0xd8e2ee, emissive: 0x223344 });
  add(new THREE.BoxGeometry(0.07, 0.07, 1.25), steel, 0, 0, 0.7, swordPivot);
  add(new THREE.BoxGeometry(0.3, 0.06, 0.06), dark, 0, 0, 0.08, swordPivot);
  const slash = add(
    new THREE.RingGeometry(1.0, 2.5, 20, 1, -Math.PI / 2 - 1.15, 2.3).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.5, 2.8, 3.2), transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    0, 1.0, 0, g,
  );
  return { g, rig, cloak, hood, feet, scarf, swordPivot, slash };
}

const easeOut = (x) => 1 - (1 - x) ** 3;
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// Sword pose [pitch, yaw] at rest, cocked back, and fully swung (mirrored for the backhand).
const REST = [-0.5, 0.2];
const SWING = { windup: 0.07, slash: 0.17, end: 0.34 };

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
    this.moveAmt = 0;
    this.squash = 0; // >0 squashed, <0 stretched
    this.hurtT = 0;
    this.side = 1; // alternates forehand / backhand swings
  }

  hurt() { this.hurtT = 0.3; }

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
      this.squash = -0.22;
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
      if (!this.grounded) this.squash = Math.min(0.3, -this.vy * 0.025);
      p.y = g;
      this.vy = 0;
      this.grounded = true;
    } else this.grounded = false;

    let strike = null;
    if (input.attack && this.attackCd <= 0) {
      this.attackT = 0;
      this.attackCd = 0.42;
      this.side = -this.side;
      this.struck = false;
      if (len === 0) this.facing = Math.atan2(fx, fz); // idle swings go where the camera looks
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (!this.struck && this.attackT >= SWING.windup + 0.04) {
        this.struck = true;
        strike = { x: p.x, z: p.z, dirX: Math.sin(this.facing), dirZ: Math.cos(this.facing) };
      }
      if (this.attackT > SWING.end) this.attackT = -1;
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
    this.moveAmt += ((moving ? 1 : 0) - this.moveAmt) * Math.min(1, dt * 10);
    this.hurtT = Math.max(0, this.hurtT - dt);
    const mv = this.moveAmt * (this.grounded ? 1 : 0.3);
    const dodge = this.dodgeT > 0 ? 1 - this.dodgeT / 0.3 : 0;
    this.walk += dt * (2 + 9 * this.moveAmt);
    const ph = this.walk, idle = performance.now() / 1000;

    // Squash/stretch springs back to neutral; keep the volume roughly constant.
    this.squash *= Math.exp(-dt * 9);
    const sq = this.squash + (1 - mv) * Math.sin(idle * 2.2) * 0.012;
    m.rig.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    m.rig.position.y = HIP + Math.abs(Math.sin(ph)) * 0.09 * mv;
    m.rig.rotation.x = 0.16 * mv - this.hurtT * 1.2 + (dodge ? ease(dodge) * Math.PI * 2 : 0);
    m.rig.rotation.z = Math.sin(ph) * 0.05 * mv;
    m.hood.rotation.x = -0.1 * mv + Math.sin(ph * 2) * 0.03 * mv;
    m.cloak.rotation.x = -0.12 * mv; // hem trails behind
    m.cloak.scale.set(1 + 0.05 * mv, 1, 1 + 0.05 * mv);
    m.feet.forEach((f, i) => {
      const s = Math.sin(ph + i * Math.PI);
      f.position.z = 0.05 + s * 0.24 * mv;
      f.position.y = 0.06 + Math.max(0, Math.cos(ph + i * Math.PI)) * 0.12 * mv;
    });
    m.scarf.rotation.x = 0.35 + 0.6 * this.moveAmt + Math.sin(ph * 1.3) * (0.1 + 0.15 * this.moveAmt);
    m.scarf.rotation.z = Math.sin(ph * 0.9) * 0.15 * this.moveAmt;

    const t = this.attackT, side = this.side;
    if (t >= 0) {
      // windup -> fast slash -> follow-through and recover, with a body twist and small lunge.
      const cocked = [-0.1, 1.7 * side], swung = [0.15, -1.5 * side];
      let pose, twist;
      if (t < SWING.windup) {
        const k = ease(t / SWING.windup);
        pose = [REST[0] + (cocked[0] - REST[0]) * k, REST[1] + (cocked[1] - REST[1]) * k];
        twist = 0.35 * side * k;
      } else if (t < SWING.slash) {
        const k = easeOut((t - SWING.windup) / (SWING.slash - SWING.windup));
        pose = [cocked[0] + (swung[0] - cocked[0]) * k, cocked[1] + (swung[1] - cocked[1]) * k];
        twist = 0.35 * side - 0.75 * side * k;
      } else {
        const k = ease((t - SWING.slash) / (SWING.end - SWING.slash));
        pose = [swung[0] + (REST[0] - swung[0]) * k, swung[1] + (REST[1] - swung[1]) * k];
        twist = -0.4 * side * (1 - k);
      }
      m.swordPivot.rotation.set(pose[0], pose[1], side * 0.3);
      m.rig.rotation.y = twist;
      m.rig.position.z = Math.sin(clamp01((t - SWING.windup) / 0.2) * Math.PI) * 0.25;
      const lit = clamp01((t - SWING.windup) / 0.03) * (1 - clamp01((t - SWING.slash) / 0.15));
      m.slash.material.opacity = lit * 0.9;
      m.slash.scale.x = side;
    } else {
      m.swordPivot.rotation.set(REST[0] + Math.sin(ph) * 0.12 * mv, REST[1], 0);
      m.rig.rotation.y = 0;
      m.rig.position.z = 0;
      m.slash.material.opacity = 0;
    }
    this.mesh.visible = this.invuln <= 0 || this.dodgeT > 0 || Math.floor(this.invuln * 20) % 2 === 0;
  }
}
