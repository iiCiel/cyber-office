// Day 1 (Monday): first day. Recon week starts: phishing, a 3 AM brute force, vishing, a bait USB stick.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, IP_INFO, DATE } from './logs.js';
import { PHONE_CALL, USB_DROP } from './talk.js';
import { scoreDay1, debrief1, carry1 } from './score.js';

export default {
  n: 1,
  date: DATE,
  title: 'Monday · First day',
  start: 8 * 60 + 57,
  intro: ['First day. Badge works. Coffee in hand.', 'Priya, your manager, should be in her office. Top left.'],
  badgeAtStart: false,

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes, phishedAt: st.phishedAt() }),
  ipInfo: IP_INFO,
  alerts: ALERTS,

  npcLines: {
    priya: {
      talk: [
        "Morning, welcome aboard. Priya Raman, I run security here. The SOC is you, me, and Northgate's MDR overnight.",
        'Your badge is live as of five minutes ago, so the server room door will open for you now.',
        "Plan for today: get logged in at your desk, clear your inbox, then take the SIEM console in the server room. There's a P3 sitting in the queue with your name on it.",
        "House rules: anything that smells off, you open a case and write down what you saw, with timestamps. And you don't sit on a P1. You come get me.",
      ],
      again: ['Desk, inbox, then the SIEM console in the server room. If you\'re unsure whether it\'s a P1, treat it like one and grab me.'],
      effect: { badgeActive: true },
    },
    dana: {
      talk: [
        "Oh hey, you're the new analyst! Dana. Service desk, Tier 1, also Tier 2 when Greg's out, which is always.",
        'Your desk is the one with the blue screen, middle row. I imaged it at 6 this morning.',
        "Heads up: you'll probably get a new-sign-in alert email from that. That was me. It's on INC0004388 if anyone asks.",
        'Server room is the metal door on the right. The badge reader wants you to really mean it.',
      ],
      again: ['Queue check: 23 open, 9 of them password resets. It is 9 AM.'],
    },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Check in with Priya, your manager' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through your email' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Investigate the alert at the SOC console' },
    { id: 'phone', type: 'encounter', target: 'my-desk', text: 'Answer your desk phone' },
    { id: 'usb', type: 'encounter', target: 'dana', text: 'Dana is coming over to you' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya before you head home' },
  ],

  encounters: [
    { id: 'phone', type: 'phone', after: 'soc', delayMs: 4000, fallbackAt: 10 * 60 + 30, conv: PHONE_CALL },
    { id: 'usb', type: 'walkup', npc: 'dana', after: 'phone', delayMs: 0, intro: "Hey! Hang on, I'm coming over. Gotta show you something.", conv: USB_DROP },
  ],

  score: scoreDay1,
  debrief: debrief1,
  carry: carry1,
  teaser: [
    'Tuesday, 8:57 AM. Priya pulled the code off that USB stick. Whoever made it knew our VPN address and the names of people in HR.',
    'Same group as the 3 AM break-in?',
  ],
};
