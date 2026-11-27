import * as THREE from 'three';
import './style.css';
import { AsciiRenderer, gpuName } from './render/ascii.js';
import { shared } from './render/shared.js';
import { createWorld } from './world/world.js';
import {
  START, NPC_POS, SHRINE, CAVE_TRIGGER, ENEMY_SPAWNS, WAYSTONES, CAVERN_ENTRY, CAVERN_EXIT, inCavern, groundAt,
} from './world/layout.js';
import { Player } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { Enemies } from './enemies.js';
import { createInput } from './input.js';
import { UI } from './ui.js';
import { createDebug } from './debug.js';
import { NPC_NAME, BOSS_NAME, STAGE, npcLines, stageAfterTalk, questText } from './quest.js';
import * as S from './state.js';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const gpu = gpuName(renderer);
// CPU-rendered WebGL (hardware acceleration off) is ~50x slower: start with far less work.
const software = /swiftshader|basic render|llvmpipe|softpipe|software/i.test(gpu);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
const ascii = new AsciiRenderer(renderer);
if (software) ascii.params.renderScale = 0.4;
const world = createWorld(scene, { grass: software ? 12000 : 70000 });

const saved = S.load();
let state = saved ?? S.newState();
const player = new Player(scene);
const enemies = new Enemies(scene, ENEMY_SPAWNS, state.killed);
const cam = new ThirdPersonCamera(camera);
const input = createInput(canvas);
const ui = new UI(document.querySelector('#ui'));
const debug = createDebug(ascii, scene, { onResetSave: () => { S.clear(); location.reload(); } });
for (const w of world.waystones) if (state.lit.includes(w.id)) w.setLit(true);

let mode = 'title'; // title | play | dead | end
let saveTimer = 0;
let hintCd = 0;
let hitStop = 0; // brief freeze when the sword connects, so hits feel heavy
let inShrine = false;
let showFps = false;
let forceActive = false; // dev hook: run gameplay without pointer lock

const info = () => ({ pathLeft: enemies.aliveIn('path'), pathTotal: enemies.totalIn('path'), lit: state.lit.length, stones: WAYSTONES.length });
const hint = (text, ms) => { if (hintCd > 0) return; ui.toast(text, ms); hintCd = 4; };

function placeAt(x, z, yaw = 0) {
  world.setZone(inCavern(x) ? 'cavern' : 'valley');
  player.teleport(x, z);
  cam.yaw = yaw;
  cam.target = null;
}
const p0 = state.pos ?? START;
placeAt(p0.x, p0.z);

function persist() {
  state.pos = { x: player.pos.x, z: player.pos.z };
  S.save(state);
}

const lock = () => canvas.requestPointerLock?.()?.catch?.(() => {});

function startGame(newGame) {
  if (newGame) { S.clear(); location.reload(); return; }
  mode = 'play';
  ui.hideOverlay();
  lock();
  if (state.quest === STAGE.TALK && !saved) ui.toast('Find the Warden at the ruined shrine', 4000);
}

canvas.addEventListener('click', () => { if (mode === 'play' && !input.locked && !debug.open) lock(); });
document.addEventListener('pointerlockchange', () => {
  if (mode !== 'play') return;
  if (input.locked) ui.hideOverlay();
  else if (!debug.open) ui.showPause(lock);
});
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // typing in the debug panel
  if (e.code === 'KeyF') showFps = !showFps;
  if (e.code !== 'KeyG') return;
  debug.toggle();
  if (debug.open) document.exitPointerLock();
  else if (mode === 'play') ui.showPause(lock);
});

const hooks = {
  onHitPlayer(dmg, src) {
    if (player.invuln > 0 || mode !== 'play') return;
    state.hp -= dmg;
    player.invuln = 0.5;
    player.hurt();
    if (src) player.knockFrom(src.x, src.z, 7);
    cam.addShake(0.35);
    ui.hurt();
    ui.float(player.pos.x, player.pos.y + 2.4, player.pos.z, `-${dmg}`, 'hurt');
    if (state.hp <= 0) die();
  },
  onKill(e) {
    if (e.group !== 'adds') state.killed.push(e.id);
    if (e.cfg.boss) {
      state.quest = STAGE.EXIT;
      ui.toast('The Colossus falls. A pale light opens at the far wall.', 4000);
      cam.addShake(0.8);
    }
    persist();
  },
  onXp(v) {
    if (S.addXp(state, v) > 0) ui.toast(`LEVEL UP  ·  LV ${state.level}  ·  +15 HP  +4 ATK`, 3200);
    persist();
  },
  onShake: (a) => cam.addShake(a),
  onBossPhase() {
    ui.toast('The Colossus cracks open, and the dark answers it.', 3200);
    cam.addShake(0.6);
  },
  onDamage(x, y, z, dmg, big) {
    if (dmg === 'parry') ui.float(x, y, z, 'DEFLECT', 'parry');
    else ui.float(x, y, z, dmg, big ? 'big' : '');
  },
};

function die() {
  mode = 'dead';
  const cave = inCavern(player.pos.x);
  ui.showDeath(cave ? 'the mouth of the cavern' : 'the shrine');
  setTimeout(() => {
    state.hp = state.maxHp;
    state.flasks = S.MAX_FLASKS;
    if (cave) placeAt(CAVERN_ENTRY.x, CAVERN_ENTRY.z);
    else placeAt(NPC_POS.x + 1.5, NPC_POS.z + 2);
    enemies.resetAlive();
    persist();
    mode = 'play';
    ui.hideOverlay();
    if (!input.locked && !forceActive) ui.showPause(lock);
  }, 2600);
}

function enterCavern() {
  placeAt(CAVERN_ENTRY.x, CAVERN_ENTRY.z);
  if (state.quest === STAGE.ENTER) state.quest = STAGE.BOSS;
  ui.toast('Beneath the falls, something vast turns toward you.', 3500);
  persist();
}

function leaveCavern() {
  placeAt(CAVE_TRIGGER.x, CAVE_TRIGGER.z + 5);
  persist();
}

function finish() {
  state.quest = STAGE.DONE;
  persist();
  mode = 'end';
  document.exitPointerLock();
  ui.showEnd(state, state.killed.length,
    () => { S.clear(); location.reload(); },
    () => { leaveCavern(); mode = 'play'; ui.hideOverlay(); lock(); });
}

function kindle(w) {
  w.setLit(true);
  state.lit.push(w.id);
  cam.addShake(0.2);
  if (state.lit.length === WAYSTONES.length) {
    state.quest = STAGE.ENTER;
    ui.toast('Far off, stone grinds open. The cave seal is broken.', 4000);
  } else ui.toast(`Waystone kindled  (${state.lit.length}/${WAYSTONES.length})`);
  persist();
}

function drinkFlask() {
  if (state.flasks <= 0) { hint('No flasks left. The shrine brazier refills them.'); return; }
  if (state.hp >= state.maxHp || !player.drink()) return;
  state.flasks--;
  const heal = Math.min(state.maxHp - state.hp, Math.round(state.maxHp * 0.4));
  state.hp += heal;
  ui.float(player.pos.x, player.pos.y + 2.4, player.pos.z, `+${heal}`, 'heal');
  persist();
}

function gameplay(dt, t) {
  if (ui.dialogueOpen) {
    if (input.interact || input.attack) ui.advanceDialogue();
    ui.prompt(null);
    return;
  }
  if (hitStop > 0) { hitStop -= dt; dt *= 0.08; }
  const strike = player.update(dt, input, cam.yaw, world.zone === 'valley' ? world.colliders : []);
  if (strike && enemies.strike({ ...strike, dmg: Math.round(state.atk * strike.mult) }, hooks) > 0) {
    hitStop = strike.heavy ? 0.1 : 0.06;
    cam.addShake(strike.heavy ? 0.3 : 0.15);
  }
  if (input.heal) drinkFlask();
  enemies.update(dt, t, player, hooks);
  if (mode !== 'play') return;

  const p = player.pos;
  const near = (o, r) => Math.hypot(p.x - o.x, p.z - o.z) < r;
  hintCd = Math.max(0, hintCd - dt);
  let prompt = null;

  if (world.zone === 'valley') {
    if (near(NPC_POS, 3)) {
      prompt = 'E  talk to the Warden';
      if (input.interact) {
        ui.openDialogue(NPC_NAME, npcLines(state.quest, info()), () => {
          const next = stageAfterTalk(state.quest, info());
          if (next !== state.quest) {
            state.quest = next;
            ui.toast(next === STAGE.PATH ? 'Quest: clear the path to the cave' : 'Quest: reach the cave');
            persist();
          }
        });
      }
    }

    // Resting at the shrine restores health and flasks.
    const atShrine = near(SHRINE, SHRINE.r);
    if (atShrine && !inShrine && (state.flasks < S.MAX_FLASKS || state.hp < state.maxHp)) {
      state.flasks = S.MAX_FLASKS;
      state.hp = state.maxHp;
      ui.toast('The brazier warms you. Health and flasks restored.');
      persist();
    }
    inShrine = atShrine;

    for (const w of world.waystones) {
      if (w.lit || !near(w, 2.6)) continue;
      if (state.quest < STAGE.STONES) { prompt = 'a cold waystone, carved with old wards'; continue; }
      prompt = 'E  kindle the waystone';
      if (input.interact) kindle(w);
    }

    if (state.quest === STAGE.PATH && enemies.aliveIn('path') === 0) {
      state.quest = STAGE.CAVE;
      ui.toast('The path is clear. Go to the cave.', 3500);
      persist();
    }

    if (near(CAVE_TRIGGER, CAVE_TRIGGER.r)) {
      if (state.quest >= STAGE.ENTER) enterCavern();
      else if (state.quest === STAGE.CAVE) {
        state.quest = STAGE.STONES;
        ui.toast('Amber wards seal the cave. Three waystones must burn to break them.', 4500);
        persist();
      } else if (state.quest === STAGE.STONES) hint(`The seal holds. ${state.lit.length} of ${WAYSTONES.length} waystones burn.`);
      else hint('A cold breath from the dark. Not yet... the path is not clear.');
    }
  } else if (near(CAVERN_EXIT, CAVERN_EXIT.r)) {
    if (state.quest === STAGE.EXIT) finish();
    else if (state.quest === STAGE.DONE) leaveCavern();
  }
  ui.prompt(prompt);

  saveTimer += dt;
  if (saveTimer > 3) { saveTimer = 0; persist(); }
}

function resize() {
  ascii.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const v = new THREE.Vector3();
const project = (x, y, z) => {
  v.set(x, y, z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, on: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
};

let fpsFrames = 0, fpsTime = 0, fps = 0, slowWarned = false;
function perfStats(raw) {
  fpsFrames++;
  fpsTime += raw;
  if (fpsTime < 0.5) return;
  fps = Math.round(fpsFrames / fpsTime);
  fpsFrames = fpsTime = 0;
  const scale = Math.round(ascii.params.renderScale * (ascii.params.autoRes ? ascii.autoScale : 1) * 100);
  ui.perf(showFps ? `${fps} fps  ·  3D ${scale}%  ·  ${gpu || 'unknown GPU'}` : '');
  if (mode === 'play' && fps < 30 && ascii.autoScale <= 0.4 && !slowWarned) {
    slowWarned = true;
    ui.toast(`Running at ${fps} fps on ${gpu || 'an unknown GPU'}. Press F for details.`, 6000);
  }
}

const timer = new THREE.Timer();
renderer.setAnimationLoop((ts) => {
  timer.update(ts);
  frame(timer.getDelta());
});

function frame(raw, draw = true) {
  ascii.adapt(raw);
  perfStats(raw);
  const dt = Math.min(raw, 1 / 20);
  shared.uTime.value += dt;
  const t = shared.uTime.value;
  if (mode === 'play' && (input.locked || forceActive) && !debug.open) {
    cam.rotate(input.dx, input.dy);
    gameplay(dt, t);
  }
  input.endFrame();
  const q = state.quest;
  world.update(t, q >= STAGE.ENTER ? 2 : q >= STAGE.CAVE ? 1 : 0, q >= STAGE.EXIT);
  ui.updateDialogue(dt);
  ui.hud(state, questText(q, info()));
  cam.update(player.pos, dt);
  const boss = enemies.boss;
  ui.bossBar(world.zone === 'cavern' && boss && boss.state !== 'idle' ? BOSS_NAME : null, boss?.hp, boss?.cfg.hp);
  ui.enemyTags(enemies.list.filter((e) => e.alive && !e.cfg.boss && e.hp < e.cfg.hp)
    .map((e) => ({ id: e.id, x: e.x, y: groundAt(e.x, e.z) + e.cfg.head, z: e.z, hp: e.hp, max: e.cfg.hp })), project);
  ui.updateFloats(dt, project);
  if (draw) ascii.render(scene, camera, t);
  debug.tick(dt);
}

ui.showTitle(!!saved, startGame, gpu, software
  ? 'Your browser is drawing WebGL on the CPU (hardware acceleration is off), so this will be very slow. Turn hardware acceleration on in your browser settings and reload.'
  : '');

if (import.meta.env.DEV) {
  window.__game = {
    ascii, scene, camera, player, enemies, cam, ui, input, world, hooks,
    get state() { return state; },
    get mode() { return mode; },
    setActive(v) { forceActive = v; },
    start: startGame,
    enterCavern,
    kindle,
    step: (n = 1, draw = false) => { for (let i = 0; i < n; i++) frame(1 / 60, draw); },
  };
}
