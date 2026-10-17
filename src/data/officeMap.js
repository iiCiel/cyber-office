// M1 hand-written room layout. M2 replaces this with a Tiled map.
// T = wall top, F = wall face, N = window, D = door, . = office carpet, , = server room floor
export const MAP = [
  'TTTTTTTTTTTTTTTTTTTT',
  'TFFNFFNFFNFFNTFFFFFT',
  'T............T,,,,,T',
  'T............T,,,,,T',
  'T............T,,,,,T',
  'T............T,,,,,T',
  'T............T,,,,,T',
  'T............T,,,,,T',
  'T.............,,,,,T',
  'T.............,,,,,T',
  'T............T,,,,,T',
  'T............T,,,,,T',
  'T............T,,,,,T',
  'T............T,,,,,T',
  'TTTTTTDTTTTTTTTTTTTT',
];

export const TILE_TEXTURE = {
  T: 'wall-top',
  F: 'wall-face',
  N: 'window',
  D: 'door',
  '.': 'floor',
  ',': 'floor-server',
};

export const SOLID = new Set(['T', 'F', 'N', 'D']);

// Furniture: x = center, y = bottom edge (sprites are y-sorted by their feet).
// foot = collision box [width, height] measured up from the bottom edge.
// talk = what you see when you press E next to it. Keep each line short.
export const PROPS = [
  {
    id: 'my-desk', tex: 'desk-mine', x: 48, y: 80, foot: [32, 12],
    name: 'Your desk',
    talk: [
      'Your desk. The monitor glows a hopeful blue.',
      'A sticky note on the screen: "Welcome! Wi-Fi pw: Halcyon2026!"',
      'Lesson one: passwords do not go on sticky notes. You pocket it.',
      '(The inbox opens here in the next update.)',
    ],
  },
  {
    id: 'desk-2', tex: 'desk', x: 112, y: 80, foot: [32, 12],
    name: 'Empty desk',
    talk: ['Someone left their PC unlocked.', 'You press Win+L. Small wins.'],
  },
  {
    id: 'desk-3', tex: 'desk', x: 48, y: 152, foot: [32, 12],
    name: "Dana's desk",
    talk: ['A mug that says "Have you tried turning it off and on again?"'],
  },
  {
    id: 'desk-4', tex: 'desk', x: 112, y: 152, foot: [32, 12],
    name: 'Desk',
    talk: ['A half-eaten bagel and 47 unread emails. Not yours. Yet.'],
  },
  {
    id: 'soc', tex: 'desk-soc', x: 264, y: 168, foot: [32, 12],
    name: 'SOC console',
    talk: [
      'The SOC console. Green text, quiet for now.',
      'Alerts will light up here soon. (Next updates.)',
    ],
  },
  { id: 'rack-1', tex: 'rack', x: 240, y: 72, foot: [16, 12], name: 'Server rack', talk: ['A server rack. It hums. One LED blinks amber.'] },
  { id: 'rack-2', tex: 'rack', x: 256, y: 72, foot: [16, 12], name: 'Server rack', talk: ['Label: "DC01 - DO NOT REBOOT". Noted.'] },
  { id: 'rack-3', tex: 'rack', x: 272, y: 72, foot: [16, 12], name: 'Server rack', talk: ['Label: "FILE01". Where everyone\'s spreadsheets live.'] },
  { id: 'rack-4', tex: 'rack', x: 288, y: 72, foot: [16, 12], name: 'Server rack', talk: ['Label: "MAIL01". All the company email flows through here.'] },
  { id: 'plant-1', tex: 'plant', x: 24, y: 52, foot: [10, 6], name: 'Plant', talk: ['A plant. Probably fake. You check. It is real.'] },
  { id: 'plant-2', tex: 'plant', x: 200, y: 52, foot: [10, 6], name: 'Plant', talk: ['Someone named this plant "Firewall".'] },
  { id: 'cooler', tex: 'cooler', x: 196, y: 220, foot: [10, 6], name: 'Water cooler', talk: ['The water cooler. Where all the real news spreads.'] },
  { id: 'printer', tex: 'printer', x: 176, y: 120, foot: [22, 8], name: 'Printer', talk: ['The printer is blinking red.', 'Someone printed payroll and left it in the tray. Hmm.'] },
];

// Decorative chairs (no collision).
export const CHAIRS = [
  { x: 48, y: 92 }, { x: 112, y: 92 }, { x: 48, y: 164 }, { x: 112, y: 164 }, { x: 264, y: 180 },
];

export const COWORKER = {
  x: 76, y: 172, name: 'Dana (IT helpdesk)',
  talk: [
    'Oh hey, you must be the new analyst!',
    "I'm Dana. Helpdesk. I reset about forty passwords a day.",
    'Your desk is the one with the blue screen. Not THAT kind of blue screen.',
    'Server room is through the gap on the right. Try not to trip on cables.',
  ],
};

export const DOOR = { x: 104, y: 232, name: 'Front door', talk: ["You just got here. It's 8:57. Nice try."] };
export const SPAWN = { x: 104, y: 222 };
