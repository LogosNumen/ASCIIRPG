import * as THREE from 'three';
import './style.css';
import { AsciiRenderer } from './render/ascii.js';
import { shared } from './render/shared.js';
import { createWorld } from './world/world.js';
import { START, NPC_POS, CAVE_TRIGGER, ENEMY_SPAWNS } from './world/layout.js';
import { Player } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { Enemies } from './enemies.js';
import { createInput } from './input.js';
import { UI } from './ui.js';
import { createDebug } from './debug.js';
import { NPC_NAME, npcLines, stageAfterTalk, questText } from './quest.js';
import * as S from './state.js';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
const ascii = new AsciiRenderer(renderer);
const world = createWorld(scene);

const saved = S.load();
let state = saved ?? S.newState();
const player = new Player(scene);
const enemies = new Enemies(scene, ENEMY_SPAWNS, state.killed);
const cam = new ThirdPersonCamera(camera);
const input = createInput(canvas);
const ui = new UI(document.querySelector('#ui'));
const debug = createDebug(ascii, scene, { onResetSave: () => { S.clear(); location.reload(); } });

let mode = 'title'; // title | play | dead | end
let saveTimer = 0;
let caveHintCd = 0;
let forceActive = false; // dev hook: run gameplay without pointer lock

const placeAtStart = () => {
  const p = state.pos ?? START;
  player.teleport(p.x, p.z);
  cam.yaw = 0;
};
placeAtStart();

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
  if (state.quest === 0 && !saved) ui.toast('Find the Warden at the ruined shrine', 4000);
}

canvas.addEventListener('click', () => { if (mode === 'play' && !input.locked && !debug.open) lock(); });
document.addEventListener('pointerlockchange', () => {
  if (mode !== 'play') return;
  if (input.locked) ui.hideOverlay();
  else if (!debug.open) ui.showPause(lock);
});
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyG') return;
  debug.toggle();
  if (debug.open) document.exitPointerLock();
  else if (mode === 'play') ui.showPause(lock);
});

const hooks = {
  onHitPlayer(dmg) {
    if (player.invuln > 0 || mode !== 'play') return;
    state.hp -= dmg;
    player.invuln = 0.5;
    ui.hurt();
    if (state.hp <= 0) die();
  },
  onKill(e) {
    state.killed.push(e.id);
    persist();
  },
  onXp(v) {
    if (S.addXp(state, v) > 0) ui.toast(`LEVEL UP  ·  LV ${state.level}  ·  +15 HP  +4 ATK`, 3200);
    persist();
  },
};

function die() {
  mode = 'dead';
  ui.showDeath();
  setTimeout(() => {
    state.hp = state.maxHp;
    player.teleport(NPC_POS.x + 1.5, NPC_POS.z + 2);
    enemies.resetAlive();
    persist();
    mode = 'play';
    ui.hideOverlay();
    if (!input.locked && !forceActive) ui.showPause(lock);
  }, 2600);
}

function finish() {
  state.quest = 3;
  persist();
  mode = 'end';
  document.exitPointerLock();
  ui.showEnd(state, enemies.total - enemies.alive,
    () => { S.clear(); location.reload(); },
    () => { mode = 'play'; ui.hideOverlay(); lock(); });
}

function gameplay(dt, t) {
  if (ui.dialogueOpen) {
    if (input.interact || input.attack) ui.advanceDialogue();
    ui.prompt(null);
    return;
  }
  const strike = player.update(dt, input, cam.yaw, world.colliders);
  if (strike) enemies.strike(strike, state.atk, hooks);
  enemies.update(dt, t, player, hooks);
  if (mode !== 'play') return;

  const p = player.pos;
  const nearNpc = Math.hypot(p.x - NPC_POS.x, p.z - NPC_POS.z) < 3;
  ui.prompt(nearNpc ? 'E  talk to the Warden' : null);
  if (nearNpc && input.interact) {
    ui.openDialogue(NPC_NAME, npcLines(state.quest, enemies.alive), () => {
      const next = stageAfterTalk(state.quest, enemies.alive);
      if (next !== state.quest) {
        state.quest = next;
        ui.toast(next === 1 ? 'Quest: clear the path to the cave' : 'Quest: reach the cave');
        persist();
      }
    });
  }

  if (state.quest === 1 && enemies.alive === 0) {
    state.quest = 2;
    ui.toast('The path is clear. Go to the cave.', 3500);
    persist();
  }

  caveHintCd = Math.max(0, caveHintCd - dt);
  if (Math.hypot(p.x - CAVE_TRIGGER.x, p.z - CAVE_TRIGGER.z) < CAVE_TRIGGER.r) {
    if (state.quest === 2) finish();
    else if (state.quest < 2 && caveHintCd === 0) {
      ui.toast('A cold breath from the dark. Not yet... the path is not clear.');
      caveHintCd = 4;
    }
  }

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

const timer = new THREE.Timer();
renderer.setAnimationLoop((ts) => {
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  shared.uTime.value += dt;
  const t = shared.uTime.value;
  if (mode === 'play' && (input.locked || forceActive) && !debug.open) {
    cam.rotate(input.dx, input.dy);
    gameplay(dt, t);
  }
  input.endFrame();
  world.update(t, state.quest >= 2);
  ui.updateDialogue(dt);
  ui.hud(state, questText(state.quest, enemies.alive, enemies.total));
  cam.update(player.pos, dt);
  ascii.render(scene, camera, t);
  debug.tick(dt);
});

ui.showTitle(!!saved, startGame);

if (import.meta.env.DEV) {
  window.__game = {
    ascii, scene, camera, player, enemies, cam, ui, input,
    get state() { return state; },
    get mode() { return mode; },
    setActive(v) { forceActive = v; },
    start: startGame,
  };
}
