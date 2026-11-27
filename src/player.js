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
// Sword pose [pitch, yaw] at rest; swings go rest -> cocked -> swung -> rest (mirrored for the backhand).
const REST = [-0.5, 0.2];
const SWING = { windup: 0.07, slash: 0.17, end: 0.34 };
const SPIN = { windup: 0.28, spin: 0.28, end: 0.78 };

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
    this.attackT = -1; // sword swing clock, -1 when idle
    this.attackCd = 0;
    this.queued = 0; // buffered attack click
    this.combo = 0; // 0, 1, 2 (finisher)
    this.comboT = 0; // window to chain the next swing after one ends
    this.swingScale = 1;
    this.spinT = -1; // heavy spin clock
    this.spinCd = 0;
    this.drinkT = -1;
    this.knock = [0, 0];
    this.walk = 0;
    this.moveAmt = 0;
    this.squash = 0; // >0 squashed, <0 stretched
    this.hurtT = 0;
    this.side = 1; // alternates forehand / backhand swings
  }

  get pos() { return this.mesh.position; }
  get busy() { return (this.attackT >= 0 && this.attackT / this.swingScale < SWING.slash) || this.spinT >= 0 || this.drinkT >= 0; }

  hurt() { this.hurtT = 0.3; }

  knockFrom(x, z, strength) {
    const dx = this.pos.x - x, dz = this.pos.z - z, d = Math.hypot(dx, dz) || 1;
    this.knock = [(dx / d) * strength, (dz / d) * strength];
  }

  // Starts the drinking animation; the caller applies the heal. Returns false if mid-action.
  drink() {
    if (this.busy || this.attackT >= 0) return false;
    this.drinkT = 0;
    return true;
  }

  teleport(x, z) {
    this.pos.set(x, groundAt(x, z), z);
    this.vy = 0;
    this.knock = [0, 0];
  }

  tryMove(dx, dz) {
    const p = this.pos;
    const cur = heightAt(p.x, p.z);
    const ok = (nx, nz) => inBounds(nx, nz) && (heightAt(nx, nz) - cur) / (Math.hypot(nx - p.x, nz - p.z) || 1e-6) < MAX_SLOPE;
    if (ok(p.x + dx, p.z)) p.x += dx;
    if (ok(p.x, p.z + dz)) p.z += dz;
  }

  // Returns a strike {x, z, dirX, dirZ, mult, range, arc, knock, heavy} on the frame a swing connects, else null.
  update(dt, input, camYaw, colliders) {
    const p = this.pos;
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.spinCd = Math.max(0, this.spinCd - dt);
    this.dodgeT = Math.max(0, this.dodgeT - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    this.queued = input.attack ? 0.3 : Math.max(0, this.queued - dt);

    const k = input.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let mx = fx * f + Math.cos(camYaw) * r, mz = fz * f - Math.sin(camYaw) * r;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const aim = () => { if (len === 0) this.facing = Math.atan2(fx, fz); }; // idle attacks go where the camera looks

    // Dodge cancels a sword swing, but not a spin or a drink.
    if (input.jump && this.grounded && this.spinT < 0 && this.drinkT < 0) {
      this.vy = 8;
      this.grounded = false;
      this.squash = -0.22;
      this.invuln = Math.max(this.invuln, 0.4);
      if (len > 0) { this.dodgeT = 0.3; this.dodgeDir = [mx, mz]; this.attackT = -1; }
    }

    let speed = SPEED * (this.spinT >= 0 ? 0.25 : this.drinkT >= 0 ? 0.4 : this.attackT >= 0 ? 0.35 : 1);
    if (this.dodgeT > 0) { [mx, mz] = this.dodgeDir; speed = SPEED * 2.3; }
    const moving = len > 0 || this.dodgeT > 0;
    if (moving) {
      this.tryMove(mx * speed * dt, mz * speed * dt);
      if (this.attackT < 0 && this.spinT < 0) this.turnTo(Math.atan2(mx, mz), dt);
    }
    if (this.knock[0] || this.knock[1]) {
      this.tryMove(this.knock[0] * dt, this.knock[1] * dt);
      const decay = Math.exp(-dt * 8);
      this.knock = Math.hypot(...this.knock) < 0.05 ? [0, 0] : [this.knock[0] * decay, this.knock[1] * decay];
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
    const dir = () => ({ x: p.x, z: p.z, dirX: Math.sin(this.facing), dirZ: Math.cos(this.facing) });

    // Combo: a click buffered during a swing chains into the next one once the slash has landed.
    if (this.queued > 0 && !this.busy && this.attackCd <= 0 && this.dodgeT <= 0) {
      this.combo = this.attackT >= 0 || this.comboT > 0 ? (this.combo + 1) % 3 : 0;
      this.swingScale = this.combo === 2 ? 1.35 : 1;
      this.attackT = 0;
      this.attackCd = 0.1;
      this.queued = 0;
      this.side = -this.side;
      this.struck = false;
      aim();
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      const t = this.attackT / this.swingScale;
      if (!this.struck && t >= SWING.windup + 0.04) {
        this.struck = true;
        const fin = this.combo === 2;
        if (fin) this.tryMove(Math.sin(this.facing) * 0.7, Math.cos(this.facing) * 0.7); // finisher lunge
        strike = { ...dir(), mult: fin ? 1.7 : 1, range: fin ? 3.1 : 2.6, arc: fin ? -0.15 : 0.3, knock: fin ? 2.5 : 1, heavy: fin };
      }
      if (t > SWING.end) { this.attackT = -1; this.comboT = this.combo === 2 ? 0 : 0.45; }
    }

    // Heavy: crouch, then a full spin that hits everything around.
    if (input.heavy && !this.busy && this.spinCd <= 0 && this.grounded) {
      this.spinT = 0;
      this.spinCd = 1.3;
      this.attackT = -1;
      this.combo = 0;
      this.spunHit = false;
      aim();
    }
    if (this.spinT >= 0) {
      this.spinT += dt;
      if (!this.spunHit && this.spinT >= SPIN.windup + 0.06) {
        this.spunHit = true;
        strike = { ...dir(), mult: 2.2, range: 3.4, arc: -1.01, knock: 3, heavy: true };
      }
      if (this.spinT > SPIN.end) this.spinT = -1;
    }

    if (this.drinkT >= 0 && (this.drinkT += dt) > 0.7) this.drinkT = -1;
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
    const crouch = this.spinT >= 0 && this.spinT < SPIN.windup ? ease(this.spinT / SPIN.windup) * 0.18 : 0;
    const sq = this.squash + crouch + (1 - mv) * Math.sin(idle * 2.2) * 0.012;
    m.rig.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    m.rig.position.y = HIP + Math.abs(Math.sin(ph)) * 0.09 * mv;
    const drink = this.drinkT >= 0 ? Math.sin(Math.min(1, this.drinkT / 0.7) * Math.PI) : 0;
    m.rig.rotation.x = 0.16 * mv - this.hurtT * 1.2 + (dodge ? ease(dodge) * Math.PI * 2 : 0) - drink * 0.15 + crouch;
    m.rig.rotation.z = Math.sin(ph) * 0.05 * mv;
    m.hood.rotation.x = -0.1 * mv + Math.sin(ph * 2) * 0.03 * mv - drink * 0.6;
    m.cloak.rotation.x = -0.12 * mv; // hem trails behind
    m.cloak.scale.set(1 + 0.05 * mv, 1, 1 + 0.05 * mv);
    m.feet.forEach((f, i) => {
      const s = Math.sin(ph + i * Math.PI);
      f.position.z = 0.05 + s * 0.24 * mv;
      f.position.y = 0.06 + Math.max(0, Math.cos(ph + i * Math.PI)) * 0.12 * mv;
    });
    const spinning = this.spinT >= SPIN.windup ? 1 : 0;
    m.scarf.rotation.x = 0.35 + 0.6 * Math.max(this.moveAmt, spinning) + Math.sin(ph * 1.3) * (0.1 + 0.15 * this.moveAmt);
    m.scarf.rotation.z = Math.sin(ph * 0.9) * 0.15 * this.moveAmt;

    m.rig.position.z = 0;
    m.rig.rotation.y = 0;
    m.slash.material.opacity = 0;
    m.slash.rotation.y = 0;
    m.slash.scale.set(1, 1, 1);
    m.swordPivot.rotation.set(REST[0] + Math.sin(ph) * 0.12 * mv, REST[1], 0);

    const side = this.side;
    if (this.attackT >= 0) {
      // windup -> fast slash -> follow-through and recover, with a body twist and small lunge.
      const t = this.attackT / this.swingScale, fin = this.combo === 2 ? 1.25 : 1;
      const cocked = [-0.1, 1.7 * side * fin], swung = [0.15, -1.5 * side * fin];
      let pose, twist;
      if (t < SWING.windup) {
        const k = ease(t / SWING.windup);
        pose = [REST[0] + (cocked[0] - REST[0]) * k, REST[1] + (cocked[1] - REST[1]) * k];
        twist = 0.35 * side * k * fin;
      } else if (t < SWING.slash) {
        const k = easeOut((t - SWING.windup) / (SWING.slash - SWING.windup));
        pose = [cocked[0] + (swung[0] - cocked[0]) * k, cocked[1] + (swung[1] - cocked[1]) * k];
        twist = (0.35 * side - 0.75 * side * k) * fin;
      } else {
        const k = ease((t - SWING.slash) / (SWING.end - SWING.slash));
        pose = [swung[0] + (REST[0] - swung[0]) * k, swung[1] + (REST[1] - swung[1]) * k];
        twist = -0.4 * side * (1 - k) * fin;
      }
      m.swordPivot.rotation.set(pose[0], pose[1], side * 0.3);
      m.rig.rotation.y = twist;
      m.rig.position.z = Math.sin(clamp01((t - SWING.windup) / 0.2) * Math.PI) * 0.25 * fin;
      const lit = clamp01((t - SWING.windup) / 0.03) * (1 - clamp01((t - SWING.slash) / 0.15));
      m.slash.material.opacity = lit * 0.9;
      m.slash.scale.set(side * fin * 1.1, 1, fin * 1.1);
    } else if (this.spinT >= 0) {
      const t = this.spinT;
      if (t < SPIN.windup) {
        const k = ease(t / SPIN.windup);
        m.swordPivot.rotation.set(-0.1, REST[1] + (1.6 - REST[1]) * k, 0.3);
        m.rig.rotation.y = 0.6 * k;
      } else {
        const k = easeOut(clamp01((t - SPIN.windup) / SPIN.spin));
        m.swordPivot.rotation.set(0, 1.6, 0.3);
        m.rig.rotation.y = 0.6 - k * (Math.PI * 2 + 0.6);
        m.slash.rotation.y = m.rig.rotation.y + 1.6;
        m.slash.scale.set(1.3, 1, 1.3);
        m.slash.material.opacity = (1 - clamp01((t - SPIN.windup - SPIN.spin) / 0.2)) * 0.9 * clamp01((t - SPIN.windup) / 0.04);
      }
    } else if (this.drinkT >= 0) {
      m.swordPivot.rotation.set(0.6, 0.2, 0);
    }
    this.mesh.visible = this.invuln <= 0 || this.dodgeT > 0 || Math.floor(this.invuln * 20) % 2 === 0;
  }
}
