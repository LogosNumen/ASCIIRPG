import { xpToNext, MAX_FLASKS } from './state.js';

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
    this.floatLayer = el(root, 'floats');
    this.bossEl = el(root, 'panel boss hidden');
    this.perfEl = el(root, 'perf hidden');
    this.overlayEl = el(root, 'overlay hidden');
    this.dialogue = null;
    this.lastHud = '';
    this.floats = [];
    this.tags = new Map();
  }

  hud(s, quest) {
    const w = 28;
    const flasks = Array.from({ length: MAX_FLASKS }, (_, i) => (i < s.flasks ? '(o)' : '( )')).join(' ');
    const text = box([
      `HP ${bar(s.hp, s.maxHp, 16)} ${String(Math.ceil(s.hp)).padStart(3)}/${s.maxHp}`,
      `XP ${bar(s.xp, xpToNext(s.level), 16)} LV ${s.level}`,
      `ATK ${String(s.atk).padEnd(4)}  FLASK ${flasks} [Q]`,
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

  // Floating combat text that rises from a world position. project(x, y, z) -> {x, y, on} in CSS px.
  float(x, y, z, text, kind = '') {
    const d = el(this.floatLayer, `float ${kind}`, esc(String(text)));
    this.floats.push({ d, x, y, z, age: 0, dx: (Math.random() - 0.5) * 30 });
  }

  updateFloats(dt, project) {
    for (const f of [...this.floats]) {
      f.age += dt;
      const p = project(f.x, f.y, f.z);
      f.d.style.transform = `translate(${p.x + f.dx * f.age}px, ${p.y - f.age * 60}px) translate(-50%, -50%)`;
      f.d.style.opacity = p.on ? String(Math.min(1, 2.4 - f.age * 2.4)) : '0';
      if (f.age > 1) { f.d.remove(); this.floats.splice(this.floats.indexOf(f), 1); }
    }
  }

  // Small ASCII health bars over damaged enemies. items: [{id, x, y, z, hp, max}]
  enemyTags(items, project) {
    const seen = new Set();
    for (const it of items) {
      const p = project(it.x, it.y, it.z);
      if (!p.on) continue;
      seen.add(it.id);
      let d = this.tags.get(it.id);
      if (!d) { d = el(this.floatLayer, 'tag'); this.tags.set(it.id, d); }
      d.textContent = bar(it.hp, it.max, 8);
      d.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
    for (const [id, d] of this.tags) if (!seen.has(id)) { d.remove(); this.tags.delete(id); }
  }

  bossBar(name, hp, max) {
    if (!name) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    const t = box([name.padStart(Math.floor((44 + name.length) / 2)).padEnd(44), bar(hp, max, 42)], 44);
    if (this.bossEl.textContent !== t) this.bossEl.textContent = t;
  }

  perf(text) {
    this.perfEl.classList.toggle('hidden', !text);
    if (text && this.perfEl.textContent !== text) this.perfEl.textContent = text;
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

  showTitle(hasSave, onStart, gpu = '', warning = '') {
    const controls = box([
      'WASD ......... move',
      'mouse ........ orbit camera',
      'left click ... attack (x3 combo)',
      'right click .. spin attack',
      'space ........ jump / dodge roll',
      'Q ............ drink flask',
      'E ............ talk / kindle',
      'F ............ fps counter',
      'G ............ ASCII debug panel',
      'Esc .......... release mouse',
    ], 34);
    const gpuLine = gpu ? `<p class="gpu">renderer: ${esc(gpu)}</p>` : '';
    const warn = warning ? `<p class="warn">${esc(warning)}</p>` : '';
    this.overlay(
      `<pre class="title">${esc(TITLE)}</pre><p class="sub">a quiet valley at the edge of the world</p><pre>${esc(controls)}</pre>${warn}${gpuLine}`,
      hasSave ? [['CONTINUE', () => onStart(false)], ['NEW GAME', () => onStart(true)]] : [['BEGIN', () => onStart(false)]],
    );
  }

  showPause(onResume) {
    this.overlay('<pre class="title small">paused</pre><p class="sub">click to resume  ·  G for the debug panel</p>', [['RESUME', onResume]]);
  }

  showDeath(where = 'the shrine') {
    this.overlay(`<pre class="title small">you fall...</pre><p class="sub">the valley carries you back to ${where}</p>`);
  }

  showEnd(s, kills, onRestart, onContinue) {
    const stats = box([`level reached .. ${s.level}`, `foes cleared ... ${kills}`, `attack ......... ${s.atk}`], 22);
    this.overlay(
      `<pre class="title small">DEMO COMPLETE</pre><p class="sub">The Colossus is dust. You climb out into the dawn above the falls.</p><pre>${esc(stats)}</pre>`,
      [['PLAY AGAIN', onRestart], ['KEEP EXPLORING', onContinue]],
    );
  }
}
