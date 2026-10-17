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
        'Morning! Welcome to the SOC. Well, the SOC is mostly you and me.',
        'I just activated your badge, so the server room should let you in now.',
        'Get settled at your desk first. Then go look at the SOC console in there.',
        'Rule one: if something looks weird, it probably is. Come ask me.',
      ],
      again: ['Desk, then the SOC console. Shout if anything looks off.'],
      effect: { badgeActive: true },
    },
    dana: {
      talk: [
        'Oh hey, you must be the new analyst!',
        "I'm Dana. Helpdesk. I reset about forty passwords a day.",
        'Your desk is the one with the bright blue screen. Middle row.',
        'I set up your laptop at 6 this morning, so you might get a sign-in alert email. That was me.',
        'Server room is the metal door on the right. Badge reader is picky.',
      ],
      again: ['Forty-one passwords now. It is 9 AM.'],
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
