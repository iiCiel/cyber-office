// Day 3 (Wednesday): the customer portal. The Terminal works now.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, accessLog, ALERTS, CASE, IP_INFO, DATE, ATTACKER_IP } from './logs.js';
import { THEO_WAF } from './talk.js';
import { scoreEmail, scoreCase, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'portal-sqli';
const WHOIS_RE = /whois\s+198\.51\.100\.23\b/;

const THEO_SCORE = {
  id: 'theo',
  area: 'Coworker',
  title: 'Theo wants the WAF turned off',
  max: 10,
  teaches: { skill: 'Change management: no ad-hoc security changes', secplus: '1.3 Change management processes' },
  missing: { points: 3, what: 'It never came up.', why: 'Theo found someone else to ask.' },
  outcomes: {
    disabled: { outcome: 'bad', points: 0, what: 'You turned the WAF off.', why: 'The portal sat unprotected for hours, the day after a breach, with no change record. Security controls change through change management, not favors.', cost: { amount: 15000, text: 'Emergency re-audit of the portal after an unapproved WAF change' } },
    'change-request': { outcome: 'good', points: 10, what: 'You asked for an emergency change and offered a narrow exception.', why: 'That is how it works: a recorded change, the smallest possible exception, and the release still ships.' },
    escalated: { outcome: 'good', points: 8, what: 'You took it to Priya and the change board.', why: 'Right instinct. Offering the narrow exception yourself would have been even faster.' },
  },
};

function whoisItem(st) {
  const did = st.events.some((e) => e.type === 'terminal-cmd' && WHOIS_RE.test(e.cmd));
  const used = st.events.filter((e) => e.type === 'terminal-cmd').length;
  return {
    id: 'whois',
    area: 'Terminal',
    title: `Who owns ${ATTACKER_IP}?`,
    max: 5,
    teaches: { skill: 'Use whois and grep on the command line', secplus: '4.9 Use data sources to support an investigation' },
    outcome: did ? 'good' : used ? 'ok' : 'bad',
    points: did ? 5 : used ? 2 : 0,
    what: did ? `You ran whois yourself (${used} command${used === 1 ? '' : 's'} in total).` : used ? 'You used the Terminal but never looked up the IP.' : 'You never opened the Terminal.',
    why: 'whois shows a "bulletproof" host that ignores abuse reports, in the same block as Tuesday\'s attacker. One group, not random noise.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    whoisItem(st),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
    scoreConversation(THEO_SCORE, st.enc?.theo),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ['Wednesday. What a day.'];
  if (by.case.outcome === 'good') lines.push('The portal: spot on. It\'s offline, Theo is fixing the query, and Legal is preparing the customer notices.');
  else lines.push('The portal: that was SQL injection, and it worked. Users, claims and customers all left the building.');
  if (by.whois.outcome === 'good') lines.push('And thanks for the whois. Same bulletproof host as Tuesday\'s MFA attacker. It\'s one group.');
  if (st.mail?.customer?.reported) lines.push("Dolores Whitfield's email wasn't phishing. She's a customer being scammed with our stolen data. Support called her back.");
  if (st.mail?.sharepoint?.enteredCreds) lines.push('Your password went to that fake SharePoint page. Reset again. Three days, three lures.');
  if (st.enc?.theo?.outcome === 'disabled') lines.push('Theo told me you turned the WAF off for him. Please don\'t do that again. Change requests exist for days like this.');
  lines.push('They\'re getting bolder: Monday spam, Tuesday accounts, today our customers. I don\'t think they\'re done.');
  lines.push("Let's look at your day.");
  return lines;
}

function carry(st, r) {
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  return {
    d3Contained: !!by.case.contained,
    d3WafDisabled: st.enc?.theo?.outcome === 'disabled',
    d3Creds: !!st.mail?.sharepoint?.enteredCreds,
    d3Whois: by.whois.outcome === 'good',
  };
}

const WHOIS = {
  '198.51.100.23': [
    'NetRange:       198.51.100.0 - 198.51.100.255',
    'CIDR:           198.51.100.0/24',
    'OrgName:        ShadowHost Ltd',
    'Country:        NL',
    'Comment:        Offshore VPS. "We respect our customers\' privacy."',
    'OrgAbuseEmail:  abuse@shadowhost.example (no reply)',
  ].join('\n'),
  '198.51.100.77': 'NetRange: 198.51.100.0 - 198.51.100.255\nOrgName: ShadowHost Ltd\nCountry: NL',
  '203.0.113.45': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Krannet Hosting SRL\nCountry: MD',
  '185.220.101.47': 'NetRange: 185.220.101.0 - 185.220.101.255\nOrgName: F3 Netze e.V. (Tor exit relays)\nCountry: DE',
  'sharepointonline-halcyon.com': 'Domain Name: SHAREPOINTONLINE-HALCYON.COM\nCreation Date: 2026-10-19T03:11:52Z\nRegistrar: NiceNIC International Group\nRegistrant: REDACTED FOR PRIVACY',
  'halcyon-mfa.com': 'Domain Name: HALCYON-MFA.COM\nCreation Date: 2026-10-14T22:40:09Z\nRegistrar: NiceNIC International Group',
  'halcyonmutual.com': 'Domain Name: HALCYONMUTUAL.COM\nCreation Date: 2003-04-17T15:02:11Z\nRegistrar: MarkMonitor Inc.\nRegistrant Organization: Halcyon Mutual Insurance',
};
const DNS = {
  'sharepointonline-halcyon.com': 'Name:\tsharepointonline-halcyon.com\nAddress: 198.51.100.24',
  'halcyon-mfa.com': 'Name:\thalcyon-mfa.com\nAddress: 203.0.113.46',
  'halcyonmutual.com': 'Name:\thalcyonmutual.com\nAddress: 192.0.2.250',
  'portal.halcyonmutual.com': 'Name:\tportal.halcyonmutual.com\nAddress: 192.0.2.250',
};

function terminal(st) {
  const now = st.minutes ?? 8 * 60 + 57; // a brand-new day has no clock yet
  const modsec = generateLogs({ nowMinutes: now })
    .filter((e) => e.source === 'modsec')
    .map((e) => `${e.time} ${e.msg}`)
    .join('\n');
  return {
    date: 'Wed Oct 21 2026',
    motd: 'Welcome to HALCYON-WS-0142. Server logs are mirrored under /var/log/remote/. Type help.\n',
    files: {
      '/var/log/remote/web01/nginx/access.log': accessLog(now),
      '/var/log/remote/web01/modsec/audit.log': `${modsec}\n`,
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  grep 198.51.100.23 /var/log/remote/web01/nginx/access.log | wc -l     how many requests?',
        "  awk '{print $9}' access.log | sort | uniq -c                          status codes",
        "  awk '{print $10, $7}' access.log | sort -n | tail                      biggest responses",
        '  whois <ip>                                                             who owns it?',
        '',
      ].join('\n'),
      '/home/analyst01/iocs.txt': '203.0.113.45   C2 server (USB stick, fake invoice)\n198.51.100.77  MFA fatigue on m.chen (Tue)\n185.220.101.47 Tor exit, brute force on j.alvarez (Mon)\n',
    },
    whois: WHOIS,
    dns: DNS,
  };
}

function prepare(c) {
  const mfa = c.d2NumberMatching ? 'IT switched MFA to number matching last night, thanks to your write-up. No more blind Approves.' : 'MFA fatigue is still a risk. I\'m pushing IT for number matching.';
  return {
    npcLines: {
      priya: {
        talk: [
          'Morning. Your Terminal access finally came through: ticket #4471. Server logs are mirrored under /var/log/remote/.',
          mfa,
          'Theo ships portal release 4.2 today. Inbox first, and keep the Terminal handy.',
        ],
        again: ['Inbox first. Then, if the SIEM pings, the Terminal and the SOC console.'],
      },
      dana: { talk: ['Laptops are done. I can feel my soul again.'], again: ['Need a laptop? Too bad, they are all gone.'] },
      theo: { talk: ['Release day. Do not talk to me about scope.'], again: ['Still releasing.'] },
      mike: { talk: c.d2MikeSupported ? ['Hey! I hit Deny on two weird pushes this week. Felt good.'] : ['Morning.'], again: ['Busy busy.'] },
    },
  };
}

export default {
  n: 3,
  date: DATE,
  title: 'Wednesday · The portal',
  start: 8 * 60 + 57,
  intro: ['Wednesday. Hump day.', 'Priya is waiting for you.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  // The Terminal's files are built from the logs as of when the day loads.
  prepare: (c, st) => ({ ...prepare(c), terminal: terminal(st) }),

  objectives: [
    { id: 'priya', type: 'talk', text: 'Morning briefing with Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through your email' },
    { id: 'whois', type: 'terminal', match: WHOIS_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal on your PC: whois 198.51.100.23', waitText: 'Waiting on the SIEM. Look around.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Investigate the portal alert at the SOC console' },
    { id: 'theo', type: 'encounter', target: 'theo', text: 'Theo needs something from you', waitText: 'Theo is pacing near his desk.' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya before you head home' },
  ],
  encounters: [{ id: 'theo', type: 'walkup', npc: 'theo', after: 'soc', delayMs: 3000, intro: "Got a minute? It's about the WAF.", conv: THEO_WAF }],

  score,
  debrief,
  carry,
  teaser: [
    'Thursday, 8:57 AM. Finance is about to pay Northwind Supplies $48,200.',
    'And somebody moved 4 GB out of the file server at 2 AM.',
  ],
};
