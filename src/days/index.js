// The week. Each day is one module (src/days/dayN/index.js) describing everything that happens that day:
//
//   n, date {weekday, name, month, day}, title, start (minute), intro [lines], badgeAtStart
//   emails, pages, replyDrafts           -> mail client + in-game browser
//   logs(st) -> events, ipInfo, alerts   -> SIEM (alerts carry trigger, chat lines and an optional case)
//   tickets                              -> helpdesk Tickets app (Day 2+)
//   terminal {files, ...}                -> Terminal app (Day 3+)
//   npcLines {npcId: {talk, again, effect}}, extraNpcs [{id, name, sprite, x, y, face, home}], propLines
//   objectives [{id, type, target, text}]   types: talk, sit, inbox, tickets, badge, case, encounter, debrief
//   encounters [{id, type: phone|walkup, npc, after, delayMs, fallbackAt, intro, conv}]
//   crisis (Day 5): live damage counter while the main alert is open
//   score(st, campaign) -> finalize() result, debrief(st, campaign) -> lines, carry(st, result) -> flags
//   teaser [lines] for the report card
import day1 from './day1/index.js';
// DAYS_IMPORTS

export const DAYS = [day1];
export const LAST_DAY = DAYS.length;
export const getDay = (n) => DAYS[Math.min(Math.max(n, 1), LAST_DAY) - 1];
