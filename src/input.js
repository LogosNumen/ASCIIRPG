// Keyboard + pointer-lock mouse. "Pressed" flags last one frame; endFrame() clears them.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    dx: 0,
    dy: 0,
    attack: false,
    jump: false,
    interact: false,
    locked: false,
    endFrame() {
      input.dx = input.dy = 0;
      input.attack = input.jump = input.interact = false;
    },
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) input.jump = true; }
    if (e.code === 'KeyE' && !e.repeat) input.interact = true;
    input.keys.add(e.code);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());
  addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.dx += e.movementX;
    input.dy += e.movementY;
  });
  addEventListener('mousedown', (e) => {
    if (input.locked && e.button === 0) input.attack = true;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) input.keys.clear();
  });
  return input;
}
