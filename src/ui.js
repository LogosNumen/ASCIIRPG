import { xpToNext } from './state.js';

const TITLE = String.raw`
 __  __ ___ ___ _____ ___   _   _    _
|  \/  |_ _/ __|_   _| __| /_\ | |  | |
| |\/| || |\__ \ | | | _| / _ \| |__| |__
|_|  |_|___|___/ |_| |_| /_/ \_\____|____|`;

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > width) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

function box(lines, width) {
  const edge = '+' + '-'.repeat(width + 2) + '+';
  return [edge, ...lines.map((l) => '| ' + l.padEnd(width) + ' |'), edge].join('\n');
}

const bar = (v, max, w) => {
  const n = Math.round((Math.max(0, v) / max) * w);
  return '[' + '#'.repeat(n) + '-'.repeat(w - n) + ']';
};

function el(parent, cls, html = '') {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  parent.appendChild(d);
  return d;
}

// All UI is DOM text in a monospace font, framed with ASCII box characters.
export class UI {
  constructor(root) {
    this.hudEl = el(root, 'panel hud');
    this.questEl = el(root, 'panel quest');
    this.promptEl = el(root, 'prompt');
    this.toastEl = el(root, 'toast');
    this.dialogueEl = el(root, 'panel dialogue hidden');
    this.flashEl = el(root, 'flash');
    this.overlayEl = el(root, 'overlay hidden');
    this.dialogue = null;
    this.lastHud = '';
  }

  hud(s, quest) {
    const w = 28;
    const text = box([
      `HP ${bar(s.hp, s.maxHp, 16)} ${String(Math.ceil(s.hp)).padStart(3)}/${s.maxHp}`,
      `XP ${bar(s.xp, xpToNext(s.level), 16)} LV ${s.level}`,
      `ATK ${s.atk}`,
    ], w + 4);
    if (text !== this.lastHud) {
      this.lastHud = text;
      let i = 0;
      this.hudEl.innerHTML = esc(text).replace(/\[(#*)(-*)\]/g, (_, a, b) =>
        `[<span class="${i++ === 0 ? 'hp' : 'xp'}">${a}</span><span class="dim">${b}</span>]`);
    }
    const q = box(['QUEST', quest], Math.max(24, quest.length));
    if (this.questEl.textContent !== q) this.questEl.textContent = q;
  }

  prompt(text) {
    this.promptEl.textContent = text ? `[ ${text} ]` : '';
  }

  toast(text, ms = 2600) {
    const t = el(this.toastEl, 'toast-line', esc(`~ ${text} ~`));
    setTimeout(() => t.classList.add('fade'), ms);
    setTimeout(() => t.remove(), ms + 800);
  }

  hurt() {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth; // restart the CSS animation
    this.flashEl.classList.add('on');
  }

  get dialogueOpen() { return !!this.dialogue; }

  openDialogue(name, lines, onClose) {
    this.dialogue = { name, lines, onClose, line: 0, chars: 0 };
    this.dialogueEl.classList.remove('hidden');
  }

  // Click/E: finish typing the current line, or go to the next one.
  advanceDialogue() {
    const d = this.dialogue;
    if (!d) return;
    if (d.chars < d.lines[d.line].length) { d.chars = d.lines[d.line].length; return; }
    if (++d.line < d.lines.length) { d.chars = 0; return; }
    this.dialogue = null;
    this.dialogueEl.classList.add('hidden');
    d.onClose?.();
  }

  updateDialogue(dt) {
    const d = this.dialogue;
    if (!d) return;
    const full = d.lines[d.line];
    d.chars = Math.min(full.length, d.chars + dt * 55);
    const w = 52;
    const body = wrap(full, w);
    // Type out inside the final layout so words never jump lines mid-reveal.
    let left = Math.floor(d.chars);
    const shown = body.map((l) => { const s = l.slice(0, Math.max(0, left)); left -= l.length + 1; return s; });
    while (shown.length < 3) shown.push('');
    const more = d.chars >= full.length ? (d.line < d.lines.length - 1 ? '[E] next  >' : '[E] close  x') : '';
    this.dialogueEl.textContent = box([d.name, '', ...shown, '', more.padStart(w)], w);
  }

  overlay(html, buttons = []) {
    this.overlayEl.innerHTML = html;
    for (const [label, fn] of buttons) {
      const b = document.createElement('button');
      b.textContent = `[ ${label} ]`;
      b.onclick = (e) => { e.stopPropagation(); fn(); };
      this.overlayEl.appendChild(b);
    }
    this.overlayEl.classList.remove('hidden');
  }

  hideOverlay() { this.overlayEl.classList.add('hidden'); }

  showTitle(hasSave, onStart) {
    const controls = box([
      'WASD ........ move',
      'mouse ....... orbit camera',
      'left click .. attack',
      'space ....... jump / dodge',
      'E ........... talk',
      'G ........... ASCII debug panel',
      'Esc ......... release mouse',
    ], 33);
    this.overlay(
      `<pre class="title">${esc(TITLE)}</pre><p class="sub">a quiet valley at the edge of the world</p><pre>${esc(controls)}</pre>`,
      hasSave ? [['CONTINUE', () => onStart(false)], ['NEW GAME', () => onStart(true)]] : [['BEGIN', () => onStart(false)]],
    );
  }

  showPause(onResume) {
    this.overlay('<pre class="title small">paused</pre><p class="sub">click to resume  ·  G for the debug panel</p>', [['RESUME', onResume]]);
  }

  showDeath() {
    this.overlay('<pre class="title small">you fall...</pre><p class="sub">the valley carries you back to the shrine</p>');
  }

  showEnd(s, kills, onRestart, onContinue) {
    const stats = box([`level reached .. ${s.level}`, `foes cleared ... ${kills}`, `attack ......... ${s.atk}`], 22);
    this.overlay(
      `<pre class="title small">DEMO COMPLETE</pre><p class="sub">You step into the cave. Somewhere below, water falls in the dark.</p><pre>${esc(stats)}</pre>`,
      [['PLAY AGAIN', onRestart], ['KEEP EXPLORING', onContinue]],
    );
  }
}
