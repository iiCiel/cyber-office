// Day 2 (Tuesday): MFA goes live, and the attackers go after it. Covering the helpdesk queue.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE } from './logs.js';
import { MIKE_CONFESSES } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'mfa-fatigue-mchen';

const MIKE_SCORE = {
  id: 'mike',
  area: 'Coworker',
  title: 'Mike admits he approved the push',
  max: 10,
  teaches: { skill: 'Respond to a user mistake without blame', secplus: '5.6 Security awareness: reporting culture' },
  missing: { points: 3, what: 'You never talked to Mike about it.', why: 'He still thinks approving pushes to make them stop is fine.' },
  outcomes: {
    supportive: { outcome: 'good', points: 10, what: 'You thanked him and explained what happened.', why: 'People who get thanked for reporting keep reporting. Mike is now telling the sales team to hit Deny.' },
    blamed: { outcome: 'ok', points: 4, what: 'You told him off.', why: 'Fair to be frustrated, but now he says he won\'t report next time. Early reports are the cheapest part of security.' },
    dismissed: { outcome: 'bad', points: 0, what: 'You told him it was probably a glitch.', why: 'It was an attacker, and now Mike will keep approving pushes "so they stop".' },
  },
};

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
    scoreConversation(MIKE_SCORE, st.enc?.mike),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ['Okay, quick wrap-up for Tuesday.'];
  if (by.case.outcome === 'good') lines.push('Mike\'s account: you nailed it. Sessions killed, the forwarding rule is gone, and IT turns on number matching tonight.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Mike\'s account: that was MFA fatigue. And the forwarding rule kept sending invoice emails to the attacker until I found it at 3.');
  else lines.push('Nobody wrote up the MFA alert. The attacker\'s mail rule forwarded invoice emails all day.');
  if (st.mail?.['invoice-macro']?.macroEnabled) lines.push('That "invoice" macro you enabled downloaded a backdoor from 203.0.113.45. Dana is reimaging your PC tonight.');
  if (st.mail?.['mfa-qr']?.enteredCreds) lines.push('Your password went to that QR-code page. MFA saved you, but only because you denied the push. Change it.');
  if (by['ticket-teamviewer']?.outcome !== 'good') lines.push("Mike's TeamViewer is still sitting on his laptop. I don't love that.");
  if (by['ticket-payroll-access']?.outcome === 'bad') lines.push('And the intern has read/write on payroll now. I\'m pulling that back.');
  if (st.enc?.mike?.outcome === 'supportive') lines.push('Mike told me how you handled him. That\'s how you get people to report. Nice.');
  lines.push('Notice the pattern? Same people as Monday. Their server keeps showing up: 203.0.113.45.');
  lines.push("Let's look at your day.");
  return lines;
}

function carry(st, r) {
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  return {
    d2Contained: !!by.case.contained,
    d2NumberMatching: !!st.soc?.cases?.[MAIN]?.actions?.includes('numbermatch'),
    d2MacroEnabled: !!st.mail?.['invoice-macro']?.macroEnabled,
    d2Creds: !!st.mail?.['mfa-qr']?.enteredCreds,
    d2TeamViewer: ['install', 'temp'].includes(st.tickets?.teamviewer),
    d2MikeSupported: st.enc?.mike?.outcome === 'supportive',
  };
}

function prepare(c) {
  const usb = c.d1UsbToSoc
    ? 'That USB stick you brought me yesterday? It was built for us. Details are in your inbox.'
    : c.d1UsbPlugged
      ? 'The USB stick you plugged in yesterday installed a backdoor. Dana reimaged your PC at 6 this morning. Details in your inbox.'
      : 'I dug that USB stick out of the trash. It was built for us. Details in your inbox.';
  const mfa = c.d1MfaRecommended
    ? 'Good news: your MFA recommendation went through. MFA on the VPN starts today.'
    : 'IT turns on MFA for the VPN today. About time.';
  return {
    npcLines: {
      priya: {
        talk: ['Morning!', usb, mfa, "Dana's buried in laptop setups, so you're covering the helpdesk ticket queue. Tickets app, on your PC.", 'Inbox first, then tickets. I\'ll ping you if the SIEM lights up.'],
        again: ['Inbox, then the ticket queue. Watch for 203.0.113.45.'],
      },
      dana: { talk: ["Thanks for taking the queue. I've got 14 laptops to set up and one of them is on fire. Figuratively."], again: ['Still figuratively on fire.'] },
      mike: { talk: ['Morning. Excel crashed twice already. I put in a ticket.'], again: ['Still crashing.'] },
    },
  };
}

export default {
  n: 2,
  date: DATE,
  title: 'Tuesday · Push it',
  start: 8 * 60 + 57,
  intro: ['Tuesday. Day two.', 'Priya wants a word before you sit down.'],
  badgeAtStart: true,
  cast: ['mike'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) =>
    generateLogs({
      nowMinutes: st.minutes,
      carry: st.campaign.carry,
      macroAt: st.events.find((e) => e.type === 'macro-enabled')?.t ?? null,
      qrCredsAt: st.phishedAt(),
    }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  prepare,

  objectives: [
    { id: 'priya', type: 'talk', text: 'Morning briefing with Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through your email' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the helpdesk queue' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Investigate the MFA alert at the SOC console' },
    { id: 'mike', type: 'encounter', target: 'mike', text: 'Mike wants to talk to you', waitText: 'Mike looks like he wants to tell you something.' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya before you head home' },
  ],
  encounters: [{ id: 'mike', type: 'walkup', npc: 'mike', after: 'soc', delayMs: 3000, intro: 'Hey, um. Do you have a second?', conv: MIKE_CONFESSES }],

  score,
  debrief,
  carry,
  teaser: [
    'Wednesday, 8:57 AM. Your Terminal access finally comes through.',
    'Overnight, a new IP spent half an hour typing strange things into the customer portal\'s search box.',
  ],
};
