// Placeholder pixel art, drawn in code so M1 has zero external assets.
// Each sprite is a list of rows; each character is a palette key ('.' = transparent).
// Swap these for a CC0 tile pack or original art later (see PROJECT.md).

export const PLAYER_PALETTE = {
  k: '#1b1b2a', // outline
  h: '#3b2a20', // hair
  s: '#f1c27d', // skin
  S: '#d9a066', // skin shade
  e: '#1b1b2a', // eyes
  b: '#3b6fb6', // shirt
  B: '#2a4f86', // shirt shade
  l: '#e8c547', // lanyard / badge
  p: '#2d2d3a', // pants
  o: '#111118', // shoes
};

const HEAD_DOWN = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '.khhhhhhhhk.',
  '.khsssssshk.',
  '.ksessssesk.',
  '.kssssssssk.',
  '..kSSSSSSk..',
];
const BODY_DOWN = [
  '.kbbbllbbbk.',
  'kbbbbllbbbbk',
  'kbkbbbbbbkbk',
  'kskBBBBBBksk',
  '.kkppppppkk.',
];
const HEAD_UP = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '.khhhhhhhhk.',
  '.khhhhhhhhk.',
  '.khhhhhhhhk.',
  '.kShhhhhhSk.',
  '..kSSSSSSk..',
];
const BODY_UP = [
  '.kbbbbbbbbk.',
  'kbbbbbbbbbbk',
  'kbkbbbbbbkbk',
  'kskBBBBBBksk',
  '.kkppppppkk.',
];
const HEAD_SIDE = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '.khhhhhhhhk.',
  '.khhhhsssssk',
  '.khhhssssesk',
  '.khhssssssk.',
  '..kSSSSSSk..',
];
const BODY_SIDE = [
  '..kbbbblbk..',
  '..kbbbblbk..',
  '..kbbkbbbk..',
  '..kBBksBBk..',
  '..kkppppkk..',
];

const LEGS_FRONT = {
  idle: ['..kppkkppk..', '..kppkkppk..', '..kookkook..', '............'],
  walk1: ['..kppkkppk..', '..kookkppk..', '...kk.kook..', '............'],
  walk2: ['..kppkkppk..', '..kppkkook..', '..kook.kk...', '............'],
};
const LEGS_SIDE = {
  idle: ['...kppppk...', '...kppppk...', '...kooooook.', '............'],
  walk1: ['..kppkkppk..', '..kpk..kpk..', '..kook.koook', '............'],
  walk2: ['...kppppk...', '...kpkkpk...', '...koookook.', '............'],
};

// Frame order in the generated spritesheet. Left-facing frames are right-facing frames flipped.
export const PLAYER_FRAMES = [];
for (const [dir, head, body, legs] of [
  ['down', HEAD_DOWN, BODY_DOWN, LEGS_FRONT],
  ['up', HEAD_UP, BODY_UP, LEGS_FRONT],
  ['side', HEAD_SIDE, BODY_SIDE, LEGS_SIDE],
]) {
  for (const step of ['idle', 'walk1', 'walk2']) {
    PLAYER_FRAMES.push({ name: `${dir}-${step}`, rows: [...head, ...body, ...legs[step]] });
  }
}

// Coworker: same body, different colors.
export const COWORKER_PALETTE = {
  ...PLAYER_PALETTE,
  h: '#b8572b',
  s: '#c68642',
  S: '#a86b32',
  b: '#7a3e8f',
  B: '#5a2c6b',
  l: '#e8c547',
};

// Manager (Priya, SOC lead): dark hair, blazer.
export const MANAGER_PALETTE = {
  ...PLAYER_PALETTE,
  h: '#1b1410',
  s: '#a8754a',
  S: '#8e5f3a',
  b: '#3a3a4a',
  B: '#2a2a36',
  l: '#3fe07a',
};

// Mike Chen (Sales): short black hair, light blue shirt.
export const MIKE_PALETTE = { ...PLAYER_PALETTE, h: '#141414', s: '#e8c39e', S: '#cfa37c', b: '#8fb6e8', B: '#6a90c4', l: '#3b6fb6' };
// Theo Okoye (developer): green hoodie.
export const THEO_PALETTE = { ...PLAYER_PALETTE, h: '#2a1a12', s: '#7a4f30', S: '#633f26', b: '#3f8f5a', B: '#2f6f44', l: '#e6e6ea', p: '#3a3a4a' };
// Carla Reyes (Finance): blond, red blouse.
export const CARLA_PALETTE = { ...PLAYER_PALETTE, h: '#d8b25a', s: '#f1c9a5', S: '#d9a987', b: '#c43c3c', B: '#962c2c', l: '#e8c547', p: '#1b1b2a' };
