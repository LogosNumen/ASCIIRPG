import * as THREE from 'three';
import { groundAt, inBounds } from './world/layout.js';

const TYPES = {
  golem: { hp: 70, speed: 2.3, dmg: 18, range: 2.7, windup: 0.85, recover: 1.3, aggro: 13, xp: 40, radius: 1.1, knock: 0.15 },
  shade: { hp: 24, speed: 5.4, dmg: 8, range: 1.9, windup: 0.35, recover: 0.9, aggro: 12, xp: 15, radius: 0.55, knock: 0.7 },
};
const LEASH = 26;
const glowMat = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b) });

function add(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function buildGolem() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x5f656d, flatShading: true });
  add(g, new THREE.DodecahedronGeometry(1, 0), mat, 0, 1.45, 0).scale.set(1.1, 1, 0.9);
  add(g, new THREE.DodecahedronGeometry(0.5, 0), mat, 0, 2.55, 0.1);
  add(g, new THREE.BoxGeometry(0.5, 0.8, 0.5), mat, -0.45, 0.4, 0);
  add(g, new THREE.BoxGeometry(0.5, 0.8, 0.5), mat, 0.45, 0.4, 0);
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 1.15, 1.9, 0);
    g.add(pivot);
    add(pivot, new THREE.DodecahedronGeometry(0.48, 0), mat, 0, -0.7, 0);
    return pivot;
  });
  const ember = glowMat(4, 1.6, 0.4);
  add(g, new THREE.SphereGeometry(0.22, 6, 4), ember, 0, 1.5, 0.82);
  add(g, new THREE.BoxGeometry(0.12, 0.07, 0.05), ember, -0.17, 2.6, 0.5);
  add(g, new THREE.BoxGeometry(0.12, 0.07, 0.05), ember, 0.17, 2.6, 0.5);
  return { group: g, mat, arms };
}

function buildShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x0c0f14, flatShading: true, transparent: true, opacity: 0.92 });
  const body = new THREE.Group();
  g.add(body);
  add(body, new THREE.ConeGeometry(0.55, 1.8, 7, 1, true), mat, 0, 0.9, 0).material.side = THREE.DoubleSide;
  add(body, new THREE.SphereGeometry(0.33, 7, 5), mat, 0, 1.85, 0);
  for (let i = 0; i < 3; i++) add(body, new THREE.ConeGeometry(0.1, 0.9, 4), mat, (i - 1) * 0.35, 0.05, -0.2).rotation.x = Math.PI;
  const eye = glowMat(2.2, 4, 6);
  add(body, new THREE.SphereGeometry(0.06, 5, 4), eye, -0.11, 1.88, 0.28);
  add(body, new THREE.SphereGeometry(0.06, 5, 4), eye, 0.11, 1.88, 0.28);
  return { group: g, mat, body };
}

class Enemy {
  constructor(spawn, scene) {
    this.id = spawn.id;
    this.type = spawn.type;
    this.cfg = TYPES[spawn.type];
    Object.assign(this, spawn.type === 'golem' ? buildGolem() : buildShade());
    this.home = { x: spawn.x, z: spawn.z };
    this.x = spawn.x;
    this.z = spawn.z;
    this.hp = this.cfg.hp;
    this.state = 'idle';
    this.timer = 0;
    this.flash = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.seed = Math.random() * 10;
    scene.add(this.group);
  }

  get alive() { return this.state !== 'dead'; }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return d;
    const step = Math.min(d, speed * dt);
    const nx = this.x + (dx / d) * step, nz = this.z + (dz / d) * step;
    if (inBounds(nx, nz)) { this.x = nx; this.z = nz; }
    this.yaw = Math.atan2(dx, dz);
    return d;
  }
}

export class Enemies {
  constructor(scene, spawns, killedIds) {
    this.scene = scene;
    this.total = spawns.length;
    this.list = spawns.filter((s) => !killedIds.includes(s.id)).map((s) => new Enemy(s, scene));
    this.orbs = [];
    this.orbGeo = new THREE.OctahedronGeometry(0.14, 0);
    this.orbMat = glowMat(3.2, 2.3, 0.8);
  }

  get alive() { return this.list.filter((e) => e.alive).length; }

  // hooks: onHitPlayer(dmg, enemy), onKill(enemy), onXp(amount)
  update(dt, t, player, hooks) {
    const p = player.pos;
    for (const e of this.list) {
      const c = e.cfg;
      const dist = Math.hypot(p.x - e.x, p.z - e.z);
      e.flash = Math.max(0, e.flash - dt * 6);
      e.mat.emissive.setScalar(e.flash);
      switch (e.state) {
        case 'idle':
          e.yaw += Math.sin(t * 0.5 + e.seed) * dt * 0.5;
          if (dist < c.aggro) e.state = 'chase';
          break;
        case 'chase':
          if (Math.hypot(e.x - e.home.x, e.z - e.home.z) > LEASH) { e.state = 'return'; break; }
          if (dist <= c.range) { e.state = 'windup'; e.timer = c.windup; break; }
          e.moveToward(p.x, p.z, c.speed, dt);
          break;
        case 'windup':
          e.yaw = Math.atan2(p.x - e.x, p.z - e.z);
          e.timer -= dt;
          if (e.timer <= 0) {
            if (e.type === 'shade') e.moveToward(p.x, p.z, 30, 0.03); // lunge
            if (dist <= c.range + 0.7) hooks.onHitPlayer(c.dmg, e);
            e.state = 'recover';
            e.timer = c.recover;
          }
          break;
        case 'recover':
          e.timer -= dt;
          if (e.timer <= 0) e.state = 'chase';
          break;
        case 'return':
          if (e.moveToward(e.home.x, e.home.z, c.speed * 1.2, dt) < 0.5) { e.state = 'idle'; e.hp = c.hp; }
          break;
        case 'dead':
          e.timer += dt;
          e.group.scale.setScalar(Math.max(0.01, 1 - e.timer / 1.2));
          e.group.position.y -= dt * 0.8;
          e.group.rotation.z += dt * 2;
          break;
      }
      if (e.state !== 'dead') this.pose(e, t, dist);
    }

    // Keep enemies from stacking on each other or the player.
    for (const a of this.list) {
      if (!a.alive) continue;
      for (const b of this.list) {
        if (a === b || !b.alive) continue;
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = a.cfg.radius + b.cfg.radius;
        if (d < min && d > 1e-4) { a.x += (dx / d) * (min - d) * 0.5; a.z += (dz / d) * (min - d) * 0.5; }
      }
      const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz), min = a.cfg.radius + 0.5;
      if (d < min && d > 1e-4) { a.x = p.x + (dx / d) * min; a.z = p.z + (dz / d) * min; }
    }

    for (const e of this.list.filter((e) => e.state === 'dead' && e.timer > 1.2)) {
      this.scene.remove(e.group);
      this.list.splice(this.list.indexOf(e), 1);
    }
    this.updateOrbs(dt, p, hooks);
  }

  pose(e, t, dist) {
    const y = groundAt(e.x, e.z);
    e.group.position.set(e.x, y, e.z);
    e.group.rotation.y = e.yaw;
    const wind = e.state === 'windup' ? 1 - e.timer / e.cfg.windup : 0;
    if (e.type === 'golem') {
      const walk = e.state === 'chase' || e.state === 'return' ? Math.sin(t * 5 + e.seed) * 0.4 : 0;
      e.arms[0].rotation.x = walk - wind * 2.4;
      e.arms[1].rotation.x = -walk - wind * 2.4;
      e.group.rotation.z = Math.sin(t * 2.5 + e.seed) * (walk ? 0.05 : 0.01);
    } else {
      e.group.position.y += 0.5 + Math.sin(t * 2.2 + e.seed) * 0.2;
      e.body.rotation.x = -wind * 0.6 + (e.state === 'chase' ? 0.3 : 0);
    }
  }

  // Player swing: hits every enemy in a forward arc. Returns number hit.
  strike(s, dmg, hooks) {
    let hits = 0;
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz);
      if (d > 2.6 + e.cfg.radius) continue;
      if (d > 1 && (dx * s.dirX + dz * s.dirZ) / d < 0.3) continue; // ~145 degree arc
      hits++;
      e.hp -= dmg;
      e.flash = 1;
      if (d > 1e-3) { e.x += (dx / d) * e.cfg.knock; e.z += (dz / d) * e.cfg.knock; }
      if (e.state === 'idle' || e.state === 'return') e.state = 'chase';
      if (e.hp <= 0) {
        e.state = 'dead';
        e.timer = 0;
        e.mat.emissive.setScalar(0);
        this.dropOrbs(e);
        hooks.onKill(e);
      }
    }
    return hits;
  }

  dropOrbs(e) {
    const n = Math.ceil(e.cfg.xp / 10);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.orbGeo, this.orbMat);
      mesh.position.set(e.x, groundAt(e.x, e.z) + 1.2, e.z);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      this.orbs.push({ mesh, value: e.cfg.xp / n, age: 0, vel: new THREE.Vector3(Math.cos(a) * 2.5, 4 + Math.random() * 2, Math.sin(a) * 2.5) });
    }
  }

  updateOrbs(dt, p, hooks) {
    const target = new THREE.Vector3(p.x, p.y + 1, p.z);
    for (const o of [...this.orbs]) {
      o.age += dt;
      const m = o.mesh.position;
      if (o.age < 0.6) {
        o.vel.y -= 14 * dt;
        m.addScaledVector(o.vel, dt);
        m.y = Math.max(m.y, groundAt(m.x, m.z) + 0.3);
      } else {
        const d = m.distanceTo(target);
        m.lerp(target, Math.min(1, (dt * (6 + o.age * 14)) / Math.max(d, 0.01)));
        if (d < 0.6) {
          this.scene.remove(o.mesh);
          this.orbs.splice(this.orbs.indexOf(o), 1);
          hooks.onXp(o.value);
        }
      }
      o.mesh.rotation.y += dt * 4;
    }
  }

  // After the player dies: survivors go home and heal.
  resetAlive() {
    for (const e of this.list) {
      if (!e.alive) continue;
      Object.assign(e, { x: e.home.x, z: e.home.z, hp: e.cfg.hp, state: 'idle' });
    }
  }
}
