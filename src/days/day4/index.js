// Day 4 (Thursday): follow the money. Vendor fraud, data theft with a service account, and the backups.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE } from './logs.js';
import { CARLA_CALL } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'exfil-svc-backup';

const CARLA_SCORE = {
  id: 'carla',
  area: 'Phone call',
  title: 'Carla asks about Northwind\'s "new bank details"',
  max: 15,
  teaches: { skill: 'Verify payment changes out-of-band', secplus: '2.2 Threat vectors: business email compromise' },
  missing: { points: 0, what: 'You never took Carla\'s call.', why: 'She paid it. $48,200 went to a bank in Riga.', cost: { amount: 48200, text: 'Invoice NW-7781 paid to the attacker\'s account' } },
  outcomes: {
    callback: { outcome: 'good', points: 15, what: 'You had her call Northwind on the number already on file.', why: 'The gold standard: a channel the attacker doesn\'t control. The real Northwind had never changed banks.' },
    domain: { outcome: 'good', points: 13, what: 'You spotted the lookalike domain and stopped the payment.', why: 'Great catch. A call to the number on file would confirm it too, since attackers sometimes send from a vendor\'s real, hacked mailbox.' },
    reply: { outcome: 'bad', points: 0, what: 'You told her to reply and ask them to confirm.', why: 'Replying asks the attacker to vouch for the attacker. "Janet" confirmed politely, and Carla paid.', cost: { amount: 48200, text: 'Invoice NW-7781 paid to the attacker\'s account' } },
    paid: { outcome: 'bad', points: 0, what: 'You told her to pay.', why: 'Passing the spam filter only means the attacker set up their own domain properly. $48,200 went to Riga.', cost: { amount: 48200, text: 'Invoice NW-7781 paid to the attacker\'s account' } },
  },
};

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(CARLA_SCORE, st.enc?.carla),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st, campaign) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ['Thursday. Sit down, this one is a story.'];
  if (by.carla.outcome === 'good') lines.push('Northwind: Carla says you saved us $48,200. The fake email quoted a real invoice, because Mike\'s forwarding rule leaked it on Tuesday.');
  else lines.push('Northwind: the money is gone, $48,200 to a bank in Riga. The fake email quoted a real invoice that leaked through Mike\'s mailbox on Tuesday.');
  lines.push('svc_backup: its password was on a sticky note on the desk by the window. Remember "pest control, 7:40 AM" in the visitor log on Monday? The camera shows him photographing desks.');
  if (by.case.outcome === 'good') lines.push('You shut that account down fast. The HR files are gone, but the door is closed.');
  else lines.push('And the attacker still had that account when I checked at 4.');
  if (st.tickets?.backup === 'fix') lines.push('The backups are running again, thanks to you. Test restore tomorrow at 8. Remember that.');
  else if (st.tickets?.backup === 'delete') lines.push('Backups run again, but you deleted most of the history. Fingers crossed we never need it.');
  else lines.push('The backup server still has no backup newer than Sunday. That keeps me up at night.');
  if (campaign?.carry?.d1UsbPlugged || campaign?.carry?.d2MacroEnabled) lines.push('Your PC has been reimaged twice this week. If they kept a foothold anywhere, it was there.');
  lines.push("Get some sleep. Something tells me tomorrow is the big one. Let's look at your day.");
  return lines;
}

function carry(st, r) {
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  return {
    d4Contained: !!by.case.contained,
    d4BackupFixed: st.tickets?.backup === 'fix',
    d4BackupPartial: st.tickets?.backup === 'delete',
    d4Paid: by.carla.outcome === 'bad',
    d4Creds: !!st.mail?.voicemail?.enteredCreds,
  };
}

function prepare(c) {
  const portal = c.d3Contained ? 'The portal is back up with Theo\'s fix. Legal sent the customer notices.' : 'The portal is still a mess from yesterday.';
  return {
    npcLines: {
      priya: {
        talk: ['Morning.', portal, 'Two things today: Carla in Finance has a payment question, and the backup server keeps failing. It\'s in your ticket queue.', 'Inbox first.'],
        again: ['Inbox, Carla, tickets. In that order.'],
      },
      dana: { talk: ['Pizza day. The only good news this week.'], again: ['Pineapple. I said what I said.'] },
      carla: { talk: ['I emailed you. I\'ll call you in a bit about Northwind.'], again: ['Call incoming!'] },
      theo: { talk: c.d3WafDisabled ? ['Thanks for the WAF thing yesterday. Priya was... not thrilled.'] : ['Portal fix is live. Parameterized queries everywhere now.'], again: ['Coding.'] },
      mike: { talk: ['Is it Friday yet?'], again: ['No? Okay.'] },
    },
    propLines: {
      'desk-d': { name: 'Desk by the window', talk: ['The sticky note that said "pw: Spring2026!" is gone.', 'Under it, someone wrote "svc_backup" in pencil.'] },
    },
  };
}

export default {
  n: 4,
  date: DATE,
  title: 'Thursday · Follow the money',
  start: 8 * 60 + 57,
  intro: ['Thursday. Pizza day, allegedly.', 'Priya first.'],
  badgeAtStart: true,
  cast: ['carla', 'theo', 'mike'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  prepare,

  objectives: [
    { id: 'priya', type: 'talk', text: 'Morning briefing with Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through your email' },
    { id: 'carla', type: 'encounter', target: 'my-desk', text: 'Answer your desk phone (Carla)', waitText: 'Carla said she would call. Stay near your desk.' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the helpdesk queue' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Investigate the upload alert at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya before you head home' },
  ],
  encounters: [{ id: 'carla', type: 'phone', after: 'inbox', delayMs: 3000, fallbackAt: 9 * 60 + 30, notice: '☎ Your desk phone is ringing (Carla, Finance)', conv: CARLA_CALL }],

  score,
  debrief,
  carry,
  teaser: ['Friday, 8:57 AM. Last day of your first week.', 'Priya scheduled your week review for 4 PM. If you make it to 4 PM.'],
};
