// Day 5 (Friday): the ransomware. The main alert runs a live damage counter until you contain it,
// and the week's backups decide the ending. No tickets or walk-ups: it's one escalating incident.
import { emailsFor, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, C2 } from './logs.js';
import { halcyonDirectory, halcyonPowershell } from '../../data/halcyonDirectory.js';
import { scoreEmail, scoreCase, finalize } from '../../game/scoring.js';

const MAIN = 'ransomware-file01';

// Recovery outcome from how the week went: a tested backup Thursday = clean; old = partial; none = bad.
function recovery(carry) {
  if (carry.d4BackupFixed) return { kind: 'clean', cost: 45000, text: 'Recovered from last night\'s tested backup; a few hours of downtime' };
  if (carry.d4BackupPartial) return { kind: 'partial', cost: 160000, text: 'Restored from a 3-day-old backup; lost work and long downtime' };
  return { kind: 'none', cost: 480000, text: 'No usable backup; days down, data lost or ransom paid' };
}

const caseFor = (carry) => ({
  ...CASE,
  costs: {
    contained: { amount: recovery(carry).cost, text: recovery(carry).text },
    breach: { amount: 480000, text: 'The whole company encrypted; days of downtime, customer data gone' },
  },
  extra: (cf) => {
    if (cf.verdict !== 'isolate') return null;
    const r = recovery(carry);
    if (cf.actions.includes('restore') && r.kind === 'none') return { points: 0, note: 'You chose "recover from backup", but there was no good backup: the backup ticket was never fixed this week.' };
    if (cf.actions.includes('restore') && r.kind === 'clean') return { points: 2, note: 'And you had a tested backup from this morning to recover from. That is the whole game.' };
    return null;
  },
});

function score(st, campaign) {
  const carry = campaign?.carry || {};
  return finalize([...emailsFor(carry).map((e) => scoreEmail(e, st.mail?.[e.id])), scoreCase(caseFor(carry), st.soc?.cases?.[MAIN], { carry })]);
}

function crisisResult(st, carry) {
  const c = st.crisis;
  const files = c ? (c.filesAtStop ?? Math.min(80000, Math.floor(400 + (c.elapsed || 0) * 220))) : 0;
  return { contained: !!c?.contained, files };
}

function debrief(st, campaign) {
  const carry = campaign?.carry || {};
  const r = score(st, campaign);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const cr = crisisResult(st, carry);
  const lines = ['Okay. Breathe. It\'s 4 PM on Friday and we\'re still standing. Mostly.'];
  if (by.case.outcome === 'good' && cr.contained) {
    lines.push(`You isolated it fast: about ${cr.files.toLocaleString('en-US')} files encrypted before the spread was cut. It could have been everything.`);
  } else if (st.soc?.cases?.[MAIN]) {
    lines.push('You got there, but it kept spreading while we worked. A lot of machines went down.');
  } else {
    lines.push('Nobody ran the response in time. It encrypted everything it could reach.');
  }
  const rec = recovery(carry);
  if (rec.kind === 'clean') lines.push('But here\'s the thing: you fixed the backups on Thursday and tested the restore this morning. We rebuilt from clean copies. We lost a morning, not the company.');
  else if (rec.kind === 'partial') lines.push('We restored from a 3-day-old backup. We lost two days of everyone\'s work, but we didn\'t pay a cent.');
  else lines.push('And we had no backup newer than Sunday. That backup ticket we kept ignoring? This was the week it mattered.');
  if (st.mail?.['fake-alert']?.macroEnabled) lines.push('You also ran that fake "Defender removal tool", which was a second ransomware. On today of all days.');
  lines.push('Five days. Spam, stolen accounts, our portal, our customers, our money, and today our whole network. One group, the whole time.');
  lines.push('You walked in Monday not knowing what a 4625 was. Look at you now. Let\'s see the week.');
  return lines;
}

function weekEnding(st, campaign) {
  const carry = campaign?.carry || {};
  const hist = campaign?.history || [];
  const totalCost = hist.reduce((s, d) => s + d.cost, 0) + (score(st, campaign).cost - (hist.find((d) => d.day === 5)?.cost || 0));
  const rec = recovery(carry);
  const contained = crisisResult(st, carry).contained && st.soc?.cases?.[MAIN]?.verdict === 'isolate';
  if (contained && rec.kind === 'clean') {
    return { tone: 'good', title: 'Friday, 5:58 PM. The office is quiet, and still yours.', lines: ['The ransomware hit, and you cut it off before it spread. The backups you fixed on Thursday brought everyone back by lunch.', 'Priya buys the pizza this time. "Best first week I\'ve seen," she says. She means it.', 'The attackers are gone. For now.'] };
  }
  if (contained || rec.kind !== 'none') {
    return { tone: 'ok', title: 'Friday, 7:40 PM. Lights still on in the SOC.', lines: ['You stopped the worst of it, but the week left marks: machines down, data gone, trust to rebuild.', 'It could have been so much worse. It could have been better, too.', 'Monday, you start again, a little sharper.'] };
  }
  return { tone: 'bad', title: 'Friday, 11:12 PM. The screens are all red.', lines: ['The whole network is encrypted. No clean backup. Leadership is on a call with lawyers and the FBI.', 'None of this was one big mistake. It was a hundred small ones, all week, that nobody caught in time.', 'Play it again. You know what to watch for now.'] };
}

function carryFn() {
  return { weekFinished: true };
}

function prepare(c) {
  const numberMatch = c.d2NumberMatching ? 'Number matching on MFA held all week, nice.' : '';
  const svc = c.d4Contained ? 'You killed svc_backup yesterday, so they can\'t use that one today.' : 'Heads up: svc_backup was never locked down. If they come back, that\'s their key.';
  return {
    emails: emailsFor(c),
    npcLines: {
      priya: {
        talk: ['Morning. Friday. We made it to Friday.', numberMatch, svc, 'Check your inbox. I pinned the incident runbook in your Terminal. Just in case.'].filter(Boolean),
        again: ['Inbox. And if it all goes sideways: isolate, investigate, recover.'],
      },
      dana: { talk: [c.d4BackupFixed ? 'Test restore passed this morning! We actually have backups!' : 'Still fighting the backup server. Send coffee.'], again: ['Busy.'] },
      mike: { talk: ['TGIF. Nothing can go wrong on a Friday, right?'], again: ['...right?'] },
      theo: { talk: ['Portal\'s holding. Quiet week for me, loud week for you.'], again: ['Shipping.'] },
      carla: { talk: [c.d4Paid ? 'Still sick about that wire to Riga.' : 'Thanks again for catching the Northwind thing.'], again: ['Crunching numbers.'] },
    },
    terminal: terminalFor(c),
  };
}

function terminalFor(c) {
  return {
    date: 'Fri Oct 23 2026',
    motd: 'HALCYON-WS-0142. Server logs mirrored under /var/log/remote/. Type help.\n',
    files: {
      '/home/analyst01/runbook.txt': [
        'HALCYON INCIDENT RESPONSE RUNBOOK (short version)',
        '',
        '1. ISOLATE   Stop the spread first. Pull affected hosts off the network / block at the switch.',
        '             Kill the delivery mechanism (scheduled task, C2 IP).',
        '2. INVESTIGATE  How did they get in, what did they touch, which accounts.',
        '3. RECOVER   Rebuild from the most recent KNOWN-GOOD (tested) backup. Reset credentials.',
        '4. NOTIFY    Legal, leadership, regulators / law enforcement as required.',
        '',
        'Paying the ransom is a last resort, not step 1. It funds the next attack and the decryptor often fails.',
        c.d4BackupFixed ? 'NOTE: a tested backup from this morning exists (Dana).' : 'NOTE: newest backup is 5 days old. Recovery will hurt.',
      ].join('\n'),
      '/home/analyst01/iocs.txt': `203.0.113.45   C2 server (all week)\n198.51.100.0/24 ShadowHost (Mon/Tue/Wed attacker)\n${C2}   today: ransomware delivery\n`,
    },
    whois: {
      '203.0.113.45': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Krannet Hosting SRL\nCountry: MD\nComment: ignores abuse reports',
    },
    dns: {},
  };
}

export default {
  n: 5,
  date: DATE,
  title: 'Friday · The big one',
  start: 8 * 60 + 57,
  intro: ['Friday. Last day of your first week.', 'Priya looks like she slept here. Go say good morning.'],
  badgeAtStart: true,
  cast: ['mike', 'theo', 'carla'],

  emails: emailsFor({}), // replaced by prepare() with the carry-aware set
  pages: PAGES,
  directory: halcyonDirectory(),
  powershell: halcyonPowershell(),
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes, carry: st.campaign.carry, alertAt: st.soc.alerts[MAIN] }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  prepare,

  crisis: {
    label: 'RANSOMWARE SPREADING',
    startFiles: 400,
    filesPerSec: 220,
    maxFiles: 80000,
    stops: (cf) => cf?.verdict === 'isolate' && (cf.actions || []).includes('isolate-net') && (cf.actions || []).includes('disable-task'),
    containedLines: ['Contained! You cut the spread. The counter stopped. Now we recover.'],
    notContainedLines: ["Your response didn't cut off the spread: you have to ISOLATE (isolate the hosts AND kill the scheduled task). It's still going."],
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Good morning, Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through your email (read the runbook)' },
    { id: 'server-door', type: 'badge', text: 'Get to the server room', waitFor: 'alert', waitText: 'Quiet so far. Stay ready.' },
    { id: 'soc', type: 'case', target: 'soc', text: 'INCIDENT: run the response at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: your week review' },
  ],
  encounters: [],

  score,
  debrief,
  carry: carryFn,
  weekEnding,
};
