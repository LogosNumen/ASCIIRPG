# Mistfall: an ASCII RPG demo

A small single-player fantasy RPG vertical slice. The whole thing is a real Three.js 3D scene drawn through a GPU shader that turns every frame into coloured ASCII glyphs: a misty valley at dusk, a waterfall pouring into a pool, swaying grass, fireflies, a ruined shrine and a cave.

You talk to the Warden at the shrine, clear the path of golems and shades, and walk into the cave to finish the demo.

## Controls

| Input | Action |
|---|---|
| WASD | move (relative to camera) |
| Mouse | orbit camera (click the game to capture the mouse) |
| Left click | sword swing |
| Space | jump; while moving it's a dodge dash with brief invulnerability |
| E | talk / advance dialogue |
| G | toggle the ASCII debug panel (releases the mouse) |
| Esc | release the mouse / pause |

Progress (level, XP, quest stage, defeated enemies, position) is saved to `localStorage` every few seconds and on every kill, level-up and quest step. "New game" on the title screen, "Play again" on the end screen, or "reset save" in the debug panel clears it.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for levelling and save/load
npm run build    # production build in dist/
```

Needs Node 20+ and a browser with WebGL2.

## How the ASCII shader works

`src/render/ascii.js`

1. The 3D scene renders into an off-screen half-float render target with 4× MSAA and mipmaps. MSAA stops thin grass blades aliasing into flickering glyphs.
2. A full-screen shader splits the screen into character cells (default 6 × 9 CSS px). For each cell it reads the scene at the cell centre from the mip level that averages about one cell, plus a sharper sample two levels down. It keeps the brighter of the two, so tiny bright things like spray droplets and fireflies survive the averaging.
3. That colour is tone-mapped (ACES) and gamma-encoded. Its luminance goes through the brightness curve (gamma), contrast and offset, plus a little per-cell time jitter so moving water shimmers.
4. The luminance picks a glyph from a font atlas: a canvas texture whose tiles are exactly one cell in device pixels. The browser rasterises each glyph at its final size, and the shader fetches it texel-for-texel, so characters stay crisp at any cell size or display scaling. The atlas is rebuilt when the cell size, pixel ratio or glyph set changes. Glyphs are sorted by measured ink coverage, so any character set you type maps sparse to dense automatically.
5. The glyph mask is tinted with the cell's saturated scene colour. A small amount of the raw colour bleeds through behind the glyphs, and a soft halo from a blurred mip blooms behind bright areas like the waterfall and lights.

The debug panel (G) tunes all of this live: cell size, 3D render scale, glyph preset or custom glyph string, contrast, saturation, brightness curve, gain, background bleed, highlight detail, shimmer, exposure, glow, fog density, and a switch to turn the ASCII pass off and compare with the raw scene. **Auto resolution** (on by default) lowers the 3D render scale in 15% steps, down to 40%, whenever a 1.5-second window averages under 45 fps. Glyph cells average several pixels anyway, so this costs little visually. The panel also shows the fps and which GPU the browser is using. If that's an integrated GPU on a machine with a dedicated card, set the browser to "High performance" in Windows Settings → System → Display → Graphics.

Grass is split into 16 m tiles, so tiles outside the camera's view are skipped each frame.

## Code layout

```
src/
  main.js            game loop, modes (title/play/dead/end), wiring
  render/ascii.js    ASCII post-process + glyph atlas
  render/particles.js GPU particle systems (spray, droplets, mist, fireflies)
  render/shared.js   shared time uniform + GLSL noise
  world/layout.js    valley layout, terrain height function, spawn points
  world/terrain.js   terrain mesh, instanced grass with wind shader, rocks
  world/waterfall.js waterfall sheets, pool, spray/mist
  world/landmarks.js shrine, Warden NPC, cave
  world/world.js     sky, fog, lights, assembles the zone
  player.js          wanderer model, movement, jump/dodge, sword swing
  camera.js          third-person orbit camera
  enemies.js         golem + shade AI (idle/chase/windup/recover/return/dead), XP orbs
  quest.js           dialogue lines and quest stages
  state.js           stats, levelling, localStorage save (+ state.test.js)
  ui.js / style.css  ASCII-framed HUD, dialogue, title/pause/death/end screens
  debug.js           lil-gui panel
```

All geometry is procedural; there are no external assets.

## Deploying to GitHub Pages

`vite.config.js` builds with base path `/ASCIIRPG/`, and `.github/workflows/deploy.yml` tests, builds and deploys `dist/` on every push to `main`. One-time setup: in the repository go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. If the repository is renamed, change `base` in `vite.config.js` to match.
