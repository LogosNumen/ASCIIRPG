// Quest stages: 0 not started, 1 clear the path, 2 reach the cave, 3 complete.
export const NPC_NAME = 'THE WARDEN';

export function npcLines(stage, alive) {
  if (stage === 0) return [
    'Ah... a wanderer. Few come to the valley of falling water now.',
    'The old path to the cave has been taken. Golems have woken from the cliffs, and shades drift in the mist.',
    'Clear the path, then walk into the mouth of the cave. What waits beyond is older than this shrine.',
  ];
  if (stage === 1) return [`Stone and shadow still walk the path. ${alive} remain.`];
  if (stage === 2) return ['The mist has gone quiet. The cave is waiting for you, wanderer.'];
  return ['You walked into the dark and came back. The valley will remember.'];
}

// Stage to move to once the Warden finishes talking.
export const stageAfterTalk = (stage, alive) => (stage === 0 ? (alive === 0 ? 2 : 1) : stage);

export function questText(stage, alive, total) {
  return [
    'Speak to the Warden at the shrine',
    `Clear the path  (${total - alive}/${total})`,
    'Reach the cave to the north',
    'Complete',
  ][stage];
}
