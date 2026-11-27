import * as THREE from 'three';
import { groundAt, inBounds, CAVERN } from './world/layout.js';

// poise: damage soaked before a stagger (heavy/finisher hits count x2.5); 0 means any hit staggers.
const TYPES = {
  golem: { hp: 70, speed: 2.3, dmg: 18, range: 2.7, windup: 0.85, recover: 1.3, aggro: 13, xp: 40, radius: 1.1, knock: 0.15, poise: 30, staggerT: 0.8, head: 3.3 },
  shade: { hp: 24, speed: 5.4, dmg: 8, range: 1.9, windup: 0.35, recover: 0.9, aggro: 12, xp: 15, radius: 0.55, knock: 0.7, poise: 0, staggerT: 0.45, head: 2.8 },
  wisp: { hp: 20, speed: 3.4, dmg: 10, range: 13, windup: 0.75, recover: 1.6, aggro: 16, xp: 20, radius: 0.5, knock: 0.9, poise: 0, staggerT: 0.6, head: 2.7, ranged: true, keep: 8 },
  colossus: { hp: 1000, speed: 2.4, dmg: 30, range: 5, windup: 1.0, recover: 1.0, aggro: 17, xp: 200, radius: 2.4, knock: 0, poise: 140, staggerT: 1.6, head: 7.4, boss: true },
};
const LEASH = 26;
const glowMat = (r, g, b, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b), ...extra });
const additive = (r, g, b) => glowMat(r, g, b, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function add(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function buildGolem(color = 0x5f656d, ember = [4, 1.6, 0.4], crystals = false) {
  const model = new THREE.Group();
  const body = new THREE.Group(); // torso, head and arms: bobs and leans over the legs
  model.add(body);
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  add(body, new THREE.DodecahedronGeometry(1, 0), mat, 0, 1.45, 0).scale.set(1.1, 1, 0.9);
  add(body, new THREE.DodecahedronGeometry(0.5, 0), mat, 0, 2.55, 0.1);
  const legs = [-1, 1].map((s) => add(model, new THREE.BoxGeometry(0.5, 0.8, 0.5), mat, s * 0.45, 0.4, 0));
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 1.15, 1.9, 0);
    body.add(pivot);
    add(pivot, new THREE.DodecahedronGeometry(0.48, 0), mat, 0, -0.7, 0);
    return pivot;
  });
  const glow = glowMat(...ember);
  add(body, new THREE.SphereGeometry(0.22, 6, 4), glow, 0, 1.5, 0.82);
  add(body, new THREE.BoxGeometry(0.12, 0.07, 0.05), glow, -0.17, 2.6, 0.5);
  add(body, new THREE.BoxGeometry(0.12, 0.07, 0.05), glow, 0.17, 2.6, 0.5);
  if (crystals) {
    const shard = new THREE.OctahedronGeometry(0.3, 0);
    [[-0.6, 2.2, -0.5, 0.4], [0.5, 2.3, -0.6, -0.3], [0, 2.0, -0.85, 0], [-1.2, 2.3, 0, 0.6], [1.2, 2.3, 0, -0.6]].forEach(([x, y, z, r]) => {
      add(body, shard, glow, x, y, z).scale.set(0.7, 1.8, 0.7);
      body.children.at(-1).rotation.z = r;
    });
  }
  return { model, mat, body, arms, legs, glow };
}

function buildShade() {
  const model = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x0c0f14, flatShading: true, transparent: true, opacity: 0.92 });
  const body = new THREE.Group();
  model.add(body);
  add(body, new THREE.ConeGeometry(0.55, 1.8, 7, 1, true), mat, 0, 0.9, 0).material.side = THREE.DoubleSide;
  add(body, new THREE.SphereGeometry(0.33, 7, 5), mat, 0, 1.85, 0);
  // Tendrils hang from pivots at the hem so they can trail and wave.
  const tendrils = [0, 1, 2].map((i) => {
    const pivot = new THREE.Group();
    pivot.position.set((i - 1) * 0.35, 0.45, -0.2);
    body.add(pivot);
    add(pivot, new THREE.ConeGeometry(0.1, 0.9, 4), mat, 0, -0.4, 0).rotation.x = Math.PI;
    return pivot;
  });
  const eye = glowMat(2.2, 4, 6, { transparent: true });
  add(body, new THREE.SphereGeometry(0.06, 5, 4), eye, -0.11, 1.88, 0.28);
  add(body, new THREE.SphereGeometry(0.06, 5, 4), eye, 0.11, 1.88, 0.28);
  return { model, mat, body, tendrils, eye };
}

// Wisp: a hovering lantern-core ringed by dark shards; it keeps its distance and throws bolts.
function buildWisp() {
  const model = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.7;
  model.add(body);
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a1d2a, flatShading: true });
  const core = add(body, new THREE.IcosahedronGeometry(0.26, 0), glowMat(3.2, 2.2, 6), 0, 0, 0);
  const shards = [0, 1, 2, 3].map((i) => {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 4) * Math.PI * 2;
    body.add(pivot);
    add(pivot, new THREE.OctahedronGeometry(0.16, 0), mat, 0.55, 0, 0).scale.set(0.6, 1.8, 0.6);
    return pivot;
  });
  add(body, new THREE.ConeGeometry(0.35, 0.5, 6), mat, 0, 0.45, 0);
  return { model, mat, body, core, shards };
}

class Enemy {
  constructor(spawn, scene) {
    this.id = spawn.id;
    this.type = spawn.type;
    this.group = spawn.group;
    this.cfg = TYPES[spawn.type];
    const parts = spawn.type === 'golem' ? buildGolem()
      : spawn.type === 'colossus' ? buildGolem(0x7d8898, [1.2, 3.2, 5], true)
        : spawn.type === 'wisp' ? buildWisp() : buildShade();
    Object.assign(this, parts);
    this.root = new THREE.Group(); // positioned, turned and recoil-scaled; the model keeps its own scale
    this.root.add(this.model);
    this.glowBase = 0;
    if (spawn.type === 'colossus') { this.model.scale.setScalar(2.2); this.glowBase = 0.08; } // faint self-light so it reads in the dark cavern
    this.home = { x: spawn.x, z: spawn.z };
    this.x = spawn.x;
    this.z = spawn.z;
    this.hp = this.cfg.hp;
    this.state = 'idle';
    this.timer = 0;
    this.flash = 0;
    this.poiseDmg = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.face = this.yaw; // rendered yaw, eased toward this.yaw
    this.seed = Math.random() * 10;
    this.phase = 0; // walk cycle
    this.moveAmt = 0;
    this.lunge = 0; // 1 right after an attack lands, decays
    this.cd = 0; // ranged/boss attack cooldown
    this.attack = 'slam';
    this.tele = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2), additive(3, 0.5, 0.3));
    this.tele.visible = false;
    scene.add(this.root, this.tele);
    this.pose(0, 0);
  }

  get alive() { return this.state !== 'dead'; }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return d;
    const step = Math.min(d, speed * dt);
    const nx = this.x + (dx / d) * step, nz = this.z + (dz / d) * step;
    if (inBounds(nx, nz)) { this.x = nx; this.z = nz; }
    this.yaw = Math.atan2(dx, dz);
    this.moved = true;
    return d;
  }

  // Where a melee slam lands and how wide it is.
  slamSpot() {
    const boss = this.cfg.boss, reach = boss ? 3.2 : 1.6;
    return { x: this.x + Math.sin(this.face) * reach, z: this.z + Math.cos(this.face) * reach, r: boss ? (this.attack === 'stomp' ? 4 : 3.4) : 1.9 };
  }

  pose(t, dt) {
    const e = this;
    e.root.position.set(e.x, groundAt(e.x, e.z), e.z);
    const turn = Math.atan2(Math.sin(e.yaw - e.face), Math.cos(e.yaw - e.face));
    e.face += turn * Math.min(1, dt * (e.type === 'shade' || e.type === 'wisp' ? 9 : 4));
    e.root.rotation.y = e.face;
    e.moveAmt += ((e.moved ? 1 : 0) - e.moveAmt) * Math.min(1, dt * 8);
    e.phase += dt * e.cfg.speed * 2.2 * e.moveAmt / (e.cfg.boss ? 1.6 : 1);
    e.lunge = Math.max(0, e.lunge - dt * 3);
    const wind = e.state === 'windup' ? 1 - e.timer / e.windupT : 0;
    const stag = e.state === 'stagger' ? Math.min(1, e.timer * 3) : 0;
    const mv = e.moveAmt, ph = e.phase, f = e.flash;
    // Hit recoil: squash while the flash fades.
    e.root.scale.set(1 + f * 0.12, 1 - f * 0.1, 1 + f * 0.12);
    if (e.type === 'golem' || e.type === 'colossus') {
      const step = Math.sin(ph);
      const stomp = e.attack === 'stomp' ? wind : 0, slam = e.attack === 'stomp' ? 0 : wind;
      e.legs.forEach((l, i) => {
        const s = i ? -1 : 1;
        l.position.z = s * step * 0.35 * mv;
        l.position.y = 0.4 + Math.max(0, s * Math.cos(ph)) * 0.2 * mv + (i ? 0 : stomp * 0.6);
      });
      const tremble = wind > 0.6 ? Math.sin(t * 60) * 0.03 : 0;
      // Heavy footfalls: the torso drops on each step; arms rise overhead in the windup and slam down.
      e.body.position.y = -Math.abs(Math.cos(ph)) * 0.12 * mv + wind * 0.15 - stag * 0.25;
      e.body.rotation.x = 0.1 * mv - slam * 0.3 + e.lunge * 0.45 - f * 0.25 + tremble + stag * 0.5;
      e.body.rotation.z = step * 0.07 * mv + Math.sin(t * 1.3 + e.seed) * 0.015 + stomp * 0.15;
      e.arms.forEach((a, i) => {
        const s = i ? -1 : 1;
        const volley = e.attack === 'volley' ? wind : 0;
        a.rotation.x = s * step * 0.45 * mv - slam * (volley ? 1.4 : 2.8) + e.lunge * 1.2 + stag * 0.6;
        a.rotation.z = s * (0.1 + slam * 0.35 + stomp * 0.9);
      });
      if (e.cfg.boss) e.glow.color.setRGB(1.2 + wind * 3, 3.2 + wind * 3, 5 + wind * 4);
    } else if (e.type === 'shade') {
      e.root.position.y += 0.5 + Math.sin(t * 2.2 + e.seed) * 0.2 - wind * 0.15;
      const chase = e.state === 'chase' ? 1 : 0;
      e.body.rotation.x = -wind * 0.7 + chase * 0.35 + e.lunge * 0.6 - f * 0.4 - stag * 0.6;
      e.body.scale.set(1 - wind * 0.15, 1 + wind * 0.25 - e.lunge * 0.15, 1 + e.lunge * 0.3);
      e.tendrils.forEach((td, i) => {
        td.rotation.x = 0.25 * (chase + mv) + Math.sin(t * 5 + i * 2 + e.seed) * 0.35;
        td.rotation.z = Math.sin(t * 3.3 + i * 1.7) * 0.25;
      });
    } else {
      e.body.position.y = 1.7 + Math.sin(t * 1.7 + e.seed) * 0.25 - stag * 0.4;
      e.body.rotation.x = -f * 0.5 + stag * 0.8;
      e.core.scale.setScalar(1 + wind * 0.9 + Math.sin(t * 6 + e.seed) * 0.08);
      e.shards.forEach((s, i) => { s.rotation.y = t * (1.4 + wind * 6) + (i / 4) * Math.PI * 2; });
    }
  }
}

export class Enemies {
  constructor(scene, spawns, killedIds) {
    this.scene = scene;
    this.spawns = spawns;
    this.list = spawns.filter((s) => !killedIds.includes(s.id)).map((s) => new Enemy(s, scene));
    this.orbs = [];
    this.bolts = [];
    this.waves = [];
    this.fx = [];
    this.orbGeo = new THREE.OctahedronGeometry(0.14, 0);
    this.orbMat = glowMat(3.2, 2.3, 0.8);
    this.boltGeo = new THREE.IcosahedronGeometry(0.2, 0);
    this.boltMat = glowMat(3.4, 2.2, 6.5);
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
  }

  get alive() { return this.list.filter((e) => e.alive).length; }
  aliveIn(group) { return this.list.filter((e) => e.alive && e.group === group).length; }
  totalIn(group) { return this.spawns.filter((s) => s.group === group).length; }
  get boss() { return this.list.find((e) => e.cfg.boss && e.alive); }

  spawn(def) {
    const e = new Enemy(def, this.scene);
    e.state = 'chase';
    this.list.push(e);
    return e;
  }

  // hooks: onHitPlayer(dmg, src), onKill(enemy), onXp(amount), onShake(amount), onBossPhase(), onDamage(x, y, z, dmg, big)
  update(dt, t, player, hooks) {
    const p = player.pos;
    for (const e of this.list) {
      const c = e.cfg;
      const dist = Math.hypot(p.x - e.x, p.z - e.z);
      e.flash = Math.max(0, e.flash - dt * 6);
      e.mat.emissive.setRGB(e.glowBase * 0.6 + e.flash, e.glowBase * 0.8 + e.flash, e.glowBase + e.flash);
      e.poiseDmg = Math.max(0, e.poiseDmg - dt * 20);
      e.cd = Math.max(0, e.cd - dt);
      e.tele.visible = false;
      switch (e.state) {
        case 'idle':
          e.yaw += Math.sin(t * 0.5 + e.seed) * dt * 0.5;
          if (dist < c.aggro) e.state = 'chase';
          break;
        case 'chase':
          if (!c.boss && Math.hypot(e.x - e.home.x, e.z - e.home.z) > LEASH) { e.state = 'return'; break; }
          if (c.boss) this.bossChoose(e, dist, p, dt);
          else if (c.ranged) {
            this.keepDistance(e, p, dist, dt, t);
            if (dist < c.range && e.cd <= 0) this.windup(e, 'bolt', c.windup);
          } else if (dist <= c.range) this.windup(e, 'slam', c.windup);
          else e.moveToward(p.x, p.z, c.speed, dt);
          break;
        case 'windup': {
          e.yaw = Math.atan2(p.x - e.x, p.z - e.z);
          e.timer -= dt;
          if (e.attack !== 'bolt' && e.attack !== 'volley') {
            const s = e.slamSpot(), k = 1 - e.timer / e.windupT;
            e.tele.visible = true;
            e.tele.position.set(s.x, groundAt(s.x, s.z) + 0.12, s.z);
            e.tele.scale.setScalar(s.r * (0.3 + 0.7 * k));
            e.tele.material.opacity = 0.35 + 0.5 * k * (0.6 + 0.4 * Math.sin(t * 30));
          }
          if (e.timer <= 0) this.resolve(e, player, dist, hooks);
          break;
        }
        case 'recover':
          e.timer -= dt;
          if (c.ranged) this.keepDistance(e, p, dist, dt, t);
          if (e.timer <= 0) e.state = 'chase';
          break;
        case 'stagger':
          e.timer -= dt;
          if (e.timer <= 0) { e.state = 'chase'; e.poiseDmg = 0; }
          break;
        case 'return':
          if (e.moveToward(e.home.x, e.home.z, c.speed * 1.2, dt) < 0.5) { e.state = 'idle'; e.hp = c.hp; }
          break;
        case 'dead':
          e.timer += dt;
          this.dying(e, dt);
          break;
      }
      if (e.state !== 'dead') e.pose(t, dt);
      e.moved = false;
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

    for (const e of this.list.filter((e) => e.state === 'dead' && e.timer > 1.8)) {
      this.scene.remove(e.root, e.tele);
      this.list.splice(this.list.indexOf(e), 1);
    }
    this.updateOrbs(dt, p, hooks);
    this.updateBolts(dt, player, hooks);
    this.updateWaves(dt, player, hooks);
    this.updateFx(dt);
  }

  windup(e, attack, time) {
    e.state = 'windup';
    e.attack = attack;
    e.timer = e.windupT = time;
  }

  // Wisps hover at a distance and circle the player.
  keepDistance(e, p, dist, dt, t) {
    const c = e.cfg, ax = (e.x - p.x) / (dist || 1), az = (e.z - p.z) / (dist || 1);
    if (dist > c.keep + 3) e.moveToward(p.x, p.z, c.speed, dt);
    else if (dist < c.keep - 2) e.moveToward(e.x + ax * 3, e.z + az * 3, c.speed * 1.2, dt);
    else {
      const side = Math.sin(t * 0.4 + e.seed) > 0 ? 1 : -1;
      e.moveToward(e.x - az * side * 2, e.z + ax * side * 2, c.speed * 0.6, dt);
    }
    e.yaw = Math.atan2(p.x - e.x, p.z - e.z);
  }

  // Colossus: slams up close, stomps out shockwaves you must jump, throws crystal volleys at range.
  bossChoose(e, dist, p, dt) {
    const c = e.cfg, quick = e.phase2 ? 0.75 : 1;
    if (dist <= c.range) this.windup(e, Math.random() < 0.3 ? 'stomp' : 'slam', c.windup * quick);
    else if (e.cd <= 0 && dist > 9) {
      this.windup(e, e.lastRanged === 'volley' ? 'stomp' : 'volley', 0.85 * quick);
      e.lastRanged = e.attack;
    } else e.moveToward(p.x, p.z, c.speed * (e.phase2 ? 1.3 : 1), dt);
  }

  resolve(e, player, dist, hooks) {
    const c = e.cfg, p = player.pos;
    e.state = 'recover';
    e.timer = c.recover * (e.phase2 ? 0.7 : 1);
    e.lunge = 1;
    if (e.attack === 'bolt') {
      this.fire(e, p, 0, 12, c.dmg);
      e.cd = c.recover + 1;
      return;
    }
    if (e.attack === 'volley') {
      for (let i = -2; i <= 2; i++) this.fire(e, p, i * 0.22, 13, 12);
      e.cd = 2.5;
      return;
    }
    if (e.attack === 'stomp') {
      this.waves.push(this.ring(e.x, e.z, { r: 1.5, speed: 9, max: 19, dmg: 20, color: [1.5, 3.5, 6] }));
      hooks.onShake?.(0.35);
      e.cd = 2;
      return;
    }
    if (e.type === 'shade') e.moveToward(p.x, p.z, 30, 0.03); // lunge
    const s = e.type === 'shade' ? { x: e.x, z: e.z, r: c.range + 0.7 } : e.slamSpot();
    if (e.type !== 'shade') {
      this.fx.push(this.ring(s.x, s.z, { r: 0.5, speed: 8, max: s.r + 2, color: c.boss ? [1.5, 3.5, 6] : [3, 1.5, 0.5] }));
      hooks.onShake?.(Math.max(0, (c.boss ? 0.8 : 0.5) - dist * 0.03));
    }
    if (Math.hypot(p.x - s.x, p.z - s.z) <= s.r + 0.4) hooks.onHitPlayer(c.dmg, e);
  }

  fire(e, p, spread, speed, dmg) {
    const from = new THREE.Vector3(e.x, groundAt(e.x, e.z) + (e.cfg.boss ? 5 : 1.7), e.z);
    const dir = new THREE.Vector3(p.x - from.x, p.y + 1 - from.y, p.z - from.z).normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.bolts.push({ mesh, vel: dir.multiplyScalar(speed), dmg, life: 3, x: e.x, z: e.z });
  }

  ring(x, z, opts) {
    const mesh = new THREE.Mesh(this.ringGeo, additive(...opts.color));
    mesh.position.set(x, groundAt(x, z) + 0.2, z);
    this.scene.add(mesh);
    return { mesh, x, z, hit: false, ...opts };
  }

  updateBolts(dt, player, hooks) {
    const p = player.pos;
    for (const b of [...this.bolts]) {
      b.life -= dt;
      const m = b.mesh.position;
      m.addScaledVector(b.vel, dt);
      b.mesh.rotation.y += dt * 8;
      const hit = Math.hypot(m.x - p.x, m.y - (p.y + 1), m.z - p.z) < 0.8;
      if (hit) hooks.onHitPlayer(b.dmg, { x: m.x - b.vel.x, z: m.z - b.vel.z });
      if (hit || b.life <= 0 || m.y < groundAt(m.x, m.z)) this.removeBolt(b);
    }
  }

  removeBolt(b) {
    this.scene.remove(b.mesh);
    this.bolts.splice(this.bolts.indexOf(b), 1);
  }

  // Shockwaves hurt anything standing on the ground where the ring passes: jump over them.
  updateWaves(dt, player, hooks) {
    const p = player.pos;
    for (const w of [...this.waves]) {
      w.r += w.speed * dt;
      w.mesh.scale.set(w.r, 1 + w.r * 0.1, w.r);
      w.mesh.material.opacity = Math.min(1, (w.max - w.r) / 4) * 0.9;
      const grounded = p.y - groundAt(p.x, p.z) < 0.35;
      if (!w.hit && grounded && Math.abs(Math.hypot(p.x - w.x, p.z - w.z) - w.r) < 0.7) {
        w.hit = true;
        hooks.onHitPlayer(w.dmg, { x: w.x, z: w.z });
      }
      if (w.r >= w.max) this.dropMesh(this.waves, w);
    }
  }

  updateFx(dt) {
    for (const f of [...this.fx]) {
      f.r += f.speed * dt;
      f.mesh.scale.setScalar(f.r);
      f.mesh.material.opacity = (1 - f.r / f.max) * 0.9;
      if (f.r >= f.max) this.dropMesh(this.fx, f);
    }
  }

  dropMesh(list, item) {
    this.scene.remove(item.mesh);
    item.mesh.material.dispose();
    list.splice(list.indexOf(item), 1);
  }

  // Golems crumble into tumbling rubble; shades and wisps stretch upward and fade out.
  dying(e, dt) {
    if (e.type === 'shade' || e.type === 'wisp') {
      const k = Math.min(1, e.timer / 1.2);
      e.body.scale.set(1 - k * 0.7, 1 + k * 1.5, 1 - k * 0.7);
      e.root.position.y += dt * 1.5;
      e.mat.transparent = true;
      e.mat.opacity = 0.92 * (1 - k);
      if (e.eye) e.eye.opacity = 1 - k;
      if (e.core) e.core.scale.setScalar(1 - k);
      return;
    }
    if (!e.debris) {
      e.root.scale.setScalar(1);
      e.root.updateMatrixWorld(true);
      const parts = [];
      e.root.traverse((o) => { if (o.isMesh) parts.push(o); });
      e.debris = parts.map((o) => {
        e.root.attach(o); // flatten the hierarchy so each piece flies on its own
        const out = new THREE.Vector3(o.position.x, 0, o.position.z).normalize();
        const v = (1 + Math.random() * 2) * (e.cfg.boss ? 2 : 1);
        return { o, vel: new THREE.Vector3(out.x * v, 2 + Math.random() * 3, out.z * v), spin: new THREE.Vector3().randomDirection().multiplyScalar(6) };
      });
    }
    for (const d of e.debris) {
      d.vel.y -= 14 * dt;
      d.o.position.addScaledVector(d.vel, dt);
      if (d.o.position.y < 0.25) { d.o.position.y = 0.25; d.vel.multiplyScalar(0.5); d.vel.y = Math.abs(d.vel.y) * 0.3; }
      d.o.rotation.x += d.spin.x * dt;
      d.o.rotation.z += d.spin.z * dt;
    }
    if (e.timer > 1.1) e.root.position.y -= dt * 1.5; // rubble sinks into the ground
  }

  // Player swing s: {x, z, dirX, dirZ, dmg, range, arc (min cosine), knock, heavy}. Returns number hit.
  strike(s, hooks) {
    let hits = 0;
    const inArc = (dx, dz, d, r) => d <= r && (d < 1 || (dx * s.dirX + dz * s.dirZ) / d >= s.arc);
    for (const b of [...this.bolts]) {
      const dx = b.mesh.position.x - s.x, dz = b.mesh.position.z - s.z;
      if (inArc(dx, dz, Math.hypot(dx, dz), s.range + 0.5)) { this.removeBolt(b); hooks.onDamage?.(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 'parry', true); }
    }
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz);
      if (!inArc(dx, dz, d, s.range + e.cfg.radius)) continue;
      hits++;
      const dmg = Math.round(s.dmg * (e.state === 'stagger' ? 1.5 : 1)); // punish a broken guard
      e.hp -= dmg;
      e.flash = 1;
      hooks.onDamage?.(e.x, groundAt(e.x, e.z) + e.cfg.head, e.z, dmg, s.heavy || e.state === 'stagger');
      if (d > 1e-3 && e.cfg.knock) { const k = e.cfg.knock * s.knock; e.x += (dx / d) * k; e.z += (dz / d) * k; }
      if (e.state === 'idle' || e.state === 'return') e.state = 'chase';
      e.poiseDmg += dmg * (s.heavy ? 2.5 : 1);
      if (e.hp > 0 && e.state !== 'stagger' && e.poiseDmg >= e.cfg.poise) {
        e.state = 'stagger';
        e.timer = e.cfg.staggerT;
        e.poiseDmg = 0;
      }
      if (e.cfg.boss && !e.phase2 && e.hp < e.cfg.hp / 2 && e.hp > 0) this.bossPhase2(e, hooks);
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

  bossPhase2(e, hooks) {
    e.phase2 = true;
    e.cfg = { ...e.cfg, speed: e.cfg.speed * 1.3 };
    for (const [i, a] of [[1, 0.8], [2, 2.4]]) {
      this.spawn({ id: `add${i}`, type: 'shade', group: 'adds', x: CAVERN.x + Math.cos(a * Math.PI) * 14, z: CAVERN.z + Math.sin(a * Math.PI) * 14 });
    }
    hooks.onBossPhase?.();
  }

  dropOrbs(e) {
    const n = Math.min(8, Math.ceil(e.cfg.xp / 10));
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

  // After the player dies: survivors go home and heal, boss adds vanish, projectiles clear.
  resetAlive() {
    for (const e of this.list.filter((e) => e.group === 'adds')) { this.scene.remove(e.root, e.tele); }
    this.list = this.list.filter((e) => e.group !== 'adds');
    for (const e of this.list) {
      if (!e.alive) continue;
      Object.assign(e, { x: e.home.x, z: e.home.z, hp: e.cfg.hp, state: 'idle', poiseDmg: 0, phase2: false, cd: 0 });
      e.cfg = TYPES[e.type];
    }
    for (const b of [...this.bolts]) this.removeBolt(b);
    for (const w of [...this.waves]) this.dropMesh(this.waves, w);
  }
}
