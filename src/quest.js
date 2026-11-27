// Quest stages:
// 0 speak to the Warden · 1 clear the path · 2 reach the cave · 3 light the waystones
// 4 enter the cave · 5 defeat the Colossus · 6 step into the light · 7 complete
export const NPC_NAME = 'THE WARDEN';
export const BOSS_NAME = 'THE HOLLOW COLOSSUS';
export const STAGE = { TALK: 0, PATH: 1, CAVE: 2, STONES: 3, ENTER: 4, BOSS: 5, EXIT: 6, DONE: 7 };

// info: { pathLeft, pathTotal, lit, stones }
export function npcLines(stage, info) {
  if (stage === STAGE.TALK) return [
    'Ah... a wanderer. Few come to the valley of falling water now.',
    'The old path to the cave has been taken. Golems have woken from the cliffs, and shades drift in the mist.',
    'Clear the path, then walk to the mouth of the cave. What waits beyond is older than this shrine.',
    'Take these flasks of shrine-water. Drink with Q when you are hurt; the brazier here will fill them again.',
  ];
  if (stage === STAGE.PATH) return [`Stone and shadow still walk the path. ${info.pathLeft} remain.`, 'Strike three times without pause and the third blow will break their guard. Hold nothing back: your heavy swing (right mouse) cuts all around you.'];
  if (stage === STAGE.CAVE) return ['The mist has gone quiet. Go to the cave, wanderer.'];
  if (stage === STAGE.STONES) return [
    'Sealed? Then the old wards still hold. Three waystones stand in this valley: by the falls, in the east meadow, and in the western hollow.',
    `Kindle them and the seal will fail. ${info.lit} of ${info.stones} burn. Beware the wisps; they strike from afar. Keep moving.`,
  ];
  if (stage === STAGE.ENTER) return ['The seal is broken. Whatever sleeps beneath the falls is waking. Go.'];
  if (stage === STAGE.BOSS) return ['You came back? The Colossus still stands below. Jump its shockwaves; do not trade blows with it.'];
  return ['You walked into the dark and came back. The valley will remember.'];
}

// Stage to move to once the Warden finishes talking.
export const stageAfterTalk = (stage, info) => (stage === STAGE.TALK ? (info.pathLeft === 0 ? STAGE.CAVE : STAGE.PATH) : stage);

export function questText(stage, info) {
  return [
    'Speak to the Warden at the shrine',
    `Clear the path  (${info.pathTotal - info.pathLeft}/${info.pathTotal})`,
    'Reach the cave to the north',
    `Light the waystones  (${info.lit}/${info.stones})`,
    'Enter the cave',
    `Defeat ${BOSS_NAME.toLowerCase()}`,
    'Step into the light',
    'Complete',
  ][stage];
}
