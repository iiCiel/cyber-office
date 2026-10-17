// What every object in the office map says and does. Positions live in public/maps/office.tmj (Tiled);
// this file is keyed by the Tiled object name. Keep each line short: one idea per line.

// Collision footprint per texture: [width, height] measured up from the sprite's bottom edge.
export const FOOTPRINTS = {
  desk: [32, 12],
  'desk-mine': [32, 12],
  'desk-soc': [32, 12],
  rack: [16, 12],
  plant: [10, 6],
  cooler: [10, 6],
  printer: [22, 8],
  bookshelf: [28, 8],
  coffee: [20, 8],
  fridge: [16, 8],
  table: [40, 10],
  'table-long': [64, 14],
  reception: [48, 12],
  whiteboard: [48, 4],
};

// The in-game date, used by the clock and by fake log timestamps.
export const GAME_DATE = { weekday: 'MON', month: 'Oct', day: 19, startMinutes: 8 * 60 + 57 };

// Objectives, in order. `id` is the object you must use to complete it.
export const OBJECTIVES = [
  { id: 'priya', text: 'Check in with Priya, your manager' },
  { id: 'my-desk', text: 'Sit down at your desk' },
  { id: 'server-door', text: 'Badge into the server room' },
  { id: 'soc', text: 'Check the SOC console' },
];
export const OBJECTIVES_DONE = 'Explore the office. More coming soon.';

export const NPCS = {
  priya: {
    name: 'Priya (SOC lead)',
    talk: [
      'Morning! Welcome to the SOC. Well, the SOC is mostly you and me.',
      'I just activated your badge, so the server room should let you in now.',
      'Get settled at your desk first. Then go look at the SOC console in there.',
      'Rule one: if something looks weird, it probably is. Come ask me.',
    ],
    again: ['Desk, then the SOC console. Shout if anything looks off.'],
  },
  dana: {
    name: 'Dana (IT helpdesk)',
    talk: [
      'Oh hey, you must be the new analyst!',
      "I'm Dana. Helpdesk. I reset about forty passwords a day.",
      'Your desk is the one with the bright blue screen. Middle row.',
      'Server room is the metal door on the right. Badge reader is picky.',
    ],
    again: ['Forty-one passwords now. It is 9 AM.'],
  },
};

// kind: 'talk' (default) just shows lines. 'desk' opens your computer. 'soc' opens the SOC console.
// 'badge' is the server room door. `again` is shown on the second and later visits.
export const PROPS = {
  'my-desk': { name: 'Your desk', kind: 'desk', seat: 'up' },
  'mgr-desk': {
    name: "Priya's desk",
    talk: ['Three monitors, two coffee cups, one framed photo of a cat.', 'A printout on top: "Incident Response Plan v4 - DRAFT".'],
  },
  bookshelf: {
    name: 'Bookshelf',
    talk: ['"Security+ Study Guide", "The Cuckoo\'s Egg", "Windows Event Logs Explained".', 'Every spine is cracked. Priya reads.'],
  },
  'desk-a': { name: 'Empty desk', talk: ['Someone left their PC unlocked.', 'You press Win+L. Small wins.'] },
  'desk-b': { name: 'Desk', talk: ['A half-eaten bagel and 47 unread emails. Not yours. Yet.'] },
  'desk-c': { name: 'Desk', talk: ['A USB stick labeled "SALARIES 2026" sits by the keyboard.', 'You leave it alone. Good instinct.'] },
  'desk-d': { name: 'Desk', talk: ['A sticky note on the monitor: "pw: Spring2026!"', 'Passwords do not go on sticky notes. You make a mental note.'] },
  'dana-desk': { name: "Dana's desk", talk: ['A mug: "Have you tried turning it off and on again?"'] },
  printer: { name: 'Printer', talk: ['The printer is blinking red.', 'Someone printed payroll and left it in the tray. Hmm.'] },
  corkboard: {
    name: 'Cork board',
    talk: ['A flyer: "Phishing test results: 31% clicked. Let\'s get that under 10%."', 'Someone drew a sad fish next to it.'],
  },
  soc: { name: 'SOC console', kind: 'soc', seat: 'up' },
  'rack-1': { name: 'Server rack', talk: ['Label: "DC01 - domain controller - DO NOT REBOOT".'] },
  'rack-2': { name: 'Server rack', talk: ['Label: "FILE01". Where everyone\'s spreadsheets live.'] },
  'rack-3': { name: 'Server rack', talk: ['Label: "MAIL01". All company email flows through here.'] },
  'rack-4': { name: 'Server rack', talk: ['Label: "WEB01". The customer portal.'] },
  'rack-5': { name: 'Server rack', talk: ['Label: "VPN01". How people log in from home.'] },
  'rack-6': { name: 'Server rack', talk: ['Label: "BACKUP01". Last backup: 2 days ago. Hmm.'] },
  'rack-7': { name: 'Server rack', talk: ['Label: "SIEM01". Collects logs from everything else.'] },
  'rack-8': { name: 'Server rack', talk: ['No label. A blinking amber light. Nobody knows what it does.'] },
  coffee: { name: 'Coffee machine', talk: ['You pour a coffee. It tastes like a firewall rule from 2009.'] },
  fridge: { name: 'Fridge', talk: ['A sticky note: "IF YOU TAKE MY YOGURT AGAIN I WILL FIND YOU. - IT"'] },
  cooler: { name: 'Water cooler', talk: ['The water cooler. Where all the real news spreads.'] },
  'break-table': { name: 'Table', talk: ['Someone brought donuts. Two left. Both plain.'] },
  reception: { name: 'Reception', talk: ['A visitor log. Last entry: "Pest control, 7:40 AM".', 'Pest control, before anyone else was in? Huh.'] },
  whiteboard: {
    name: 'Whiteboard',
    talk: ['"Q4 goals: MFA for everyone. Patch Tuesday on time. Fewer clicks on phish."'],
  },
  'meeting-table': { name: 'Meeting table', talk: ['The conference phone blinks. Someone is still dialed in. Nobody is here.'] },
  'plant-mgr': { name: 'Plant', talk: ['A very healthy plant. Priya waters it.'] },
  'plant-office': { name: 'Plant', talk: ['Someone named this plant "Firewall".'] },
  'plant-office-2': { name: 'Plant', talk: ['A plant. Probably fake. You check. It is real.'] },
  'plant-lobby-1': { name: 'Plant', talk: ['A lobby plant. Very corporate.'] },
  'plant-lobby-2': { name: 'Plant', talk: ['Another lobby plant. They come in pairs.'] },
};

export const DOORS = {
  'server-door': {
    name: 'Server room door',
    kind: 'badge',
    locked: ['You tap your badge. The light blinks red. Access denied.', "Your badge isn't activated yet. Maybe ask your manager."],
    opened: ['You tap your badge. Beep. The light turns green.', 'The door clicks open. Cold air and fan noise.'],
  },
  'front-door': { name: 'Front door', talk: ['You just got here. Leaving at 9 AM is a bold move.'] },
};
