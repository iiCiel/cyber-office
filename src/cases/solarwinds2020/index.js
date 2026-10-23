// Case file: SolarWinds / SUNBURST, 2020. A recreation of a real supply-chain compromise, built from public sources (FireEye/Mandiant,
// Microsoft, CISA, SolarWinds, CrowdStrike). Same engine as the week (see src/days/index.js for every field); plus caseFile, which
// drives the Case Files menu card and the "what really happened" half of the report. The player sits in the security team of a
// stand-in customer (Halcyon Mutual) on Monday December 14, 2020, the morning after the disclosure.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, VPS, STAGE2, BEACON, HRSYNC, CORP, TENANT, DLL, DLL_SHA256, DLL_MD5 } from './logs.js';
import { OFF_TALK, OFF_SCORE, CREDS_TALK, CREDS_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';
import { makeAzCli, cliError } from '../../game/cloudcli.js';
import { uuid } from '../../game/cloudfmt.js';

const MAIN = 'sw-saml';
// Hunting: grep / awk / jq on the exported logs, or the Azure CLI for app credentials.
const HUNT_RE = /(\bgrep\b.*(avsvmcloud|appsync|businesslayer|netsetupsvc|gracious|1200|svc-solarwinds|thedoccloud|freescanonline|thumbnail|203\.0\.113\.77)|\bjq\b|\bawk\b|\baz\s+ad\s+(app|sp)\b|\bwhois\b|\bnslookup\b)/i;

function huntItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const hit = cmds.filter((e) => HUNT_RE.test(e.cmd));
  const found = hit.some((e) => /avsvmcloud|appsync-api|\baz\s+ad\s+(app|sp)\s+credential|businesslayerhost|netsetupsvc|gracious_truth|thedoccloud|freescanonline/i.test(e.cmd));
  return {
    id: 'hunt',
    area: 'Terminal',
    title: 'Hunt for the generated domain and the credential the actors added',
    max: 10,
    teaches: { skill: 'Search exported DNS, Sysmon and cloud logs with grep, awk and jq, and list app credentials with the Azure CLI', secplus: '4.9 Use data sources to support an investigation; 4.6 Identity and access management: application credentials' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? 'You searched the DNS and endpoint logs for the avsvmcloud.com names (or listed the credentials on the apps) and saw how many lookups ORION01 made and who added a certificate to Halcyon-HR-Sync.' : cmds.length ? 'You opened the Terminal but never searched for the generated names or looked at the app credentials.' : 'You never searched the exported logs.',
    why: 'An indicator list tells you what to search for; the logs tell you how long and how far. A grep for avsvmcloud counts the lookups and shows that the first was six months ago; a look at the app credentials shows two: a ticketed secret from last week and an unticketed certificate from October. That comparison is how the real victims found the second half of the story.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    scoreConversation(CREDS_SCORE, st.enc?.creds),
    huntItem(st),
    scoreConversation(OFF_SCORE, st.enc?.off),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to the public record."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the public account: a signed, trojanized Orion update with a dormant backdoor, generated avsvmcloud.com names, a second stage, a hands-on follow-up on the identity server, a stolen SAML signing certificate, a forged sign-in, and credentials added to an existing app to read mail.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. As documented: a trojanized update signed by SolarWinds, a dormancy of up to two weeks, DNS lookups to generated avsvmcloud.com names, a Cobalt Strike BEACON, theft of the SAML token-signing certificate, a forged token, and new credentials on an app that could read mail.');
  else lines.push('You never wrote it up. In the real incident the first victim to notice was a security company that found its own tools had been stolen, on December 8.');
  if (by.case.contained) lines.push('You disconnected the server, treated its credentials as stolen, and rotated the signing certificate. That is what CISA, Microsoft and FireEye told victims to do: not just patch, but remove the access, reset the credentials and rotate the certificate that signs the tokens.');
  if (by.hunt.outcome === 'good') lines.push('And you counted the lookups and compared the two credentials on the HR-Sync app. The comparison that mattered was the ticketed secret from last week next to an unticketed certificate from an administrator, from a rented server, at 3 AM.');
  if (st.enc?.off?.outcome === 'image-isolate') lines.push('On the "can we keep monitoring running" request you imaged first and then disconnected. That matches the order CISA\'s directive implies: preserve, disconnect, rebuild.');
  else if (st.enc?.off?.outcome === 'patch') lines.push('You installed the hotfix and left the server up. SolarWinds\' own advisory warned that an upgrade is not a cleanup. In the real campaign the actors had often done their work long before the news.');
  else if (st.enc?.off?.outcome === 'keep') lines.push('You kept it running another day. CISA\'s emergency directive of December 13 ordered the opposite for federal agencies: disconnect or power down immediately.');
  if (st.enc?.creds?.outcome === 'rotate-all') lines.push('You treated everything Orion held as stolen and pointed Theo at the identity server. FireEye and Microsoft both documented the actors moving from Orion to the SAML token-signing certificate.');
  else if (st.enc?.creds?.outcome) lines.push('On the credentials: the lesson of this campaign is that a reset of the account is not enough. The actors stole the certificate that signs the tokens and made their own.');
  if (st.mail?.['hotfix-phish']?.enteredCreds) lines.push('And you gave your password to the fake "emergency hotfix". Breaking news attracts scammers within hours.');
  lines.push('The costs. SolarWinds told the SEC on December 14, 2020 that fewer than 18,000 Orion customers may have had an installation of the compromised builds. Only a small number were followed up by hand. In April 2021 the US government attributed the campaign to Russia\'s SVR (also called APT29 or Cozy Bear) and imposed sanctions.');
  lines.push('The technical lesson in one line: the backdoor was signed and the vendor was trusted. What turned a quiet beacon into a breach was a monitoring server with Domain Admin and open internet access, an identity server it could reach, tokens nobody checked against the issuer, and apps with mail access nobody needed. Fix those and the same update is an event, not an incident.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

// ---------------------------------------------------------------------------------------------- the Terminal: exported logs + az
const GRAPH_SP = uuid('ressp' + 'Microsoft Graph');
const appRecord = (name, o = {}) => ({
  id: uuid(`obj${name}`), appId: o.appId || uuid(`app${name}`), displayName: name, createdDateTime: o.created, identifierUris: [], publisherDomain: CORP, signInAudience: 'AzureADMyOrg',
  requiredResourceAccess: o.rra || [], passwordCredentials: o.secrets || [], keyCredentials: o.certs || [],
});
const spRecord = (name, o = {}) => ({
  id: uuid(`sp${name}`), appId: o.appId || uuid(`app${name}`), displayName: name, accountEnabled: true, servicePrincipalType: 'Application', appOwnerOrganizationId: TENANT, signInAudience: 'AzureADMyOrg',
  createdDateTime: o.created, appRoleAssignmentRequired: false, tags: [], replyUrls: [],
});

function buildAz() {
  const hrRra = [{ resourceAppId: '00000003-0000-0000-c000-000000000000', resourceAccess: [{ id: '810c84a8-4a9e-49e6-bf7d-12d91bf0f2f8', type: 'Role' }] }]; // Mail.Read (application)
  const hrSecret = { customKeyIdentifier: null, displayName: 'hr-2020', endDateTime: '2022-12-09T15:14:30Z', hint: 'xk3', keyId: uuid('key-hr-new'), secretText: null, startDateTime: '2020-12-09T15:14:30Z' };
  const hrCert = { customKeyIdentifier: 'A61D4F0E7B2C9358E1D0A4B6F2C87D31955E0AB4', displayName: 'CN=halcyon-hrsync', endDateTime: '2021-10-08T07:34:40Z', key: null, keyId: uuid('key-attacker-cert'), startDateTime: '2020-10-08T07:34:40Z', type: 'AsymmetricX509Cert', usage: 'Verify' };
  const apps = [
    appRecord('corp-intranet', { created: '2018-06-11T16:20:05Z', secrets: [{ customKeyIdentifier: null, displayName: 'prod', endDateTime: '2021-06-11T16:20:05Z', hint: 'q8Z', keyId: uuid('key-intranet'), secretText: null, startDateTime: '2019-06-11T16:20:05Z' }] }),
    appRecord('Halcyon-Claims-Portal', { created: '2019-09-02T10:41:50Z', secrets: [{ customKeyIdentifier: null, displayName: 'claims', endDateTime: '2021-09-02T10:41:50Z', hint: 'v2D', keyId: uuid('key-claims'), secretText: null, startDateTime: '2019-09-02T10:41:50Z' }] }),
    appRecord(HRSYNC.name, { appId: HRSYNC.appId, created: HRSYNC.created, rra: hrRra, secrets: [hrSecret], certs: [hrCert] }),
  ];
  const sps = apps.map((a) => spRecord(a.displayName, { appId: a.appId, created: a.createdDateTime }));
  const match = (list, f) => {
    let out = list;
    const dn = f.displayName || f.displayname;
    if (typeof dn === 'string') out = out.filter((x) => x.displayName.toLowerCase().includes(dn.toLowerCase()));
    return out;
  };
  const find = (list, id) => list.find((x) => x.id === id || x.appId === id || x.displayName === id);
  const need = (f) => { if (!f.id) throw cliError('az ad: error: the following arguments are required: --id'); return String(f.id); };
  const notFound = (f) => cliError(`ERROR: Resource '${f.id}' does not exist or one of its queried reference-property objects are not present.`);
  const creds = (list) => (f, pos) => {
    const x = find(list, need(f));
    if (!x) throw notFound(f);
    if (pos[0] !== 'list') throw cliError('ERROR: Only "az ad ... credential list" is available here.');
    const app = apps.find((a) => a.appId === x.appId);
    return [
      ...app.passwordCredentials.map((c) => ({ customKeyIdentifier: c.customKeyIdentifier, displayName: c.displayName, endDateTime: c.endDateTime, hint: c.hint, keyId: c.keyId, startDateTime: c.startDateTime, type: 'Password', usage: 'Verify' })),
      ...app.keyCredentials.map((c) => ({ customKeyIdentifier: c.customKeyIdentifier, displayName: c.displayName, endDateTime: c.endDateTime, hint: null, keyId: c.keyId, startDateTime: c.startDateTime, type: c.type, usage: c.usage })),
    ];
  };
  return makeAzCli({
    'account show': () => ({ environmentName: 'AzureCloud', homeTenantId: TENANT, id: '5a7c1e90-3b24-4d68-9f01-62c8d7e4a3b5', isDefault: true, managedByTenants: [], name: 'Halcyon Mutual Production', state: 'Enabled', tenantId: TENANT, user: { name: `analyst01@${CORP}`, type: 'user' } }),
    'ad app list': (f) => match(apps, f),
    'ad app show': (f) => { const x = find(apps, need(f)); if (!x) throw notFound(f); return x; },
    'ad app credential': creds(apps),
    'ad sp list': (f) => match(sps, f),
    'ad sp show': (f) => { const x = find(sps, need(f)); if (!x) throw notFound(f); return x; },
    'ad sp credential': creds(sps),
  }, { loggedIn: true, user: `analyst01@${CORP}`, tenant: TENANT });
}

function terminal() {
  const logs = generateLogs({ nowMinutes: 24 * 60 });
  const compact = (e) => JSON.stringify(JSON.parse(e.raw));
  const kv = (e, keys) => keys.map((k) => (e.fields?.[k] ? `${k}="${e.fields[k][0]}"` : '')).filter(Boolean).join(' ');
  const dns = logs.filter((e) => e.source === 'dns').map((e) => e.raw).join('\n');
  const sysmon = logs.filter((e) => e.source === 'Sysmon').map((e) => `${e.time} ${e.host} EventCode=${e.fields.EventCode[0]} ${kv(e, ['QueryName', 'QueryResults', 'Image', 'ImageLoaded', 'TargetFilename', 'DestinationIp', 'DestinationHostname', 'Signature', 'Hashes', 'User'])}`).join('\n');
  const security = logs.filter((e) => e.host === 'adfs01' || (e.host === 'file01' && e.source === 'Security')).map((e) => `${e.time} ${e.host} ${e.msg}`).join('\n');
  const sign = logs.filter((e) => e.source === 'entra-signin' && !e.sp).map(compact).join('\n');
  const spsign = logs.filter((e) => e.source === 'entra-signin' && e.sp).map(compact).join('\n');
  const audit = logs.filter((e) => e.source === 'azure-audit').map(compact).join('\n');
  const ual = logs.filter((e) => e.source === 'm365-audit').map(compact).join('\n');
  return {
    date: 'Mon Dec 14 2020',
    note: 'Exported resolver (BIND query log), Sysmon, ADFS/Security, Entra and Unified Audit Log records are in /var/log/remote. Try grep, awk, jq, whois and az.',
    files: {
      '/var/log/remote/dns/queries.log': `${dns}\n`,
      '/var/log/remote/endpoint/sysmon.log': `${sysmon}\n`,
      '/var/log/remote/windows/security.log': `${security}\n`,
      '/var/log/remote/entra/signinlogs.json': `${sign}\n`,
      '/var/log/remote/entra/spsignin.json': `${spsign}\n`,
      '/var/log/remote/entra/auditlogs.json': `${audit}\n`,
      '/var/log/remote/m365/unified-audit.json': `${ual}\n`,
      '/home/analyst01/iocs.txt': [
        'Published indicators for SUNBURST (FireEye / Mandiant, Dec 13 2020; Microsoft, Dec 2020):',
        `  ${DLL}   signed trojanized Orion DLL (run inside SolarWinds.BusinessLayerHost.exe)`,
        `    MD5    ${DLL_MD5.toLowerCase()}`,
        `    SHA256 ${DLL_SHA256.toLowerCase()}`,
        '  *.avsvmcloud.com                      first-stage DNS; generated names like <20 characters>.appsync-api.<region>.avsvmcloud.com',
        '  freescanonline.com                    named by FireEye as a SUNBURST second-stage domain (here resolved to ' + STAGE2.ip + ', a documentation-range stand-in)',
        '  thedoccloud.com                       named by FireEye as a BEACON domain (here ' + BEACON.ip + ', a stand-in)',
        '  netsetupsvc.dll / gracious_truth.jpg  files FireEye associates with the memory-only TEARDROP dropper',
        '',
      ].join('\n'),
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  grep -c avsvmcloud /var/log/remote/dns/queries.log                       how many lookups?',
        "  grep avsvmcloud /var/log/remote/dns/queries.log | awk '{print $1, $2}'   first and last, with dates",
        '  grep -i "appsync-api" /var/log/remote/dns/queries.log | grep -v avsvmcloud   decoy: who else resolves appsync-api names?',
        '  grep netsetupsvc /var/log/remote/endpoint/sysmon.log                      what did the process write?',
        '  grep EventCode=1200 /var/log/remote/windows/security.log | wc -l          how many tokens did ADFS issue?',
        `  jq -r 'select(.ipAddress=="${VPS}") | .userPrincipalName' /var/log/remote/entra/signinlogs.json   who signed in from that address?`,
        '  az ad app list --query "[].displayName" -o tsv                             which apps do we have?',
        `  az ad app credential list --id ${HRSYNC.name} -o table                        what credentials does HR-Sync hold?`,
        `  whois ${VPS}                                                           what is this address?`,
        '',
        'Compare the two credentials on HR-Sync with the Dec 9 change ticket (CHG-3318, a secret rotation by Dana).',
        '',
      ].join('\n'),
    },
    whois: {
      [VPS]: ['inetnum:        203.0.113.0 - 203.0.113.255', 'netname:        TEST-NET-3', 'descr:          Reserved for documentation (replay stand-in for a rented server)', 'org-name:       ExampleHost VPS', 'country:        US', 'remarks:        Cloud hosting, rented by the hour.'].join('\n'),
      [STAGE2.ip]: ['inetnum:        198.51.100.0 - 198.51.100.255', 'netname:        TEST-NET-2', 'descr:          Reserved for documentation (replay stand-in for the SUNBURST second-stage address)', 'country:        US'].join('\n'),
      [BEACON.ip]: ['inetnum:        198.51.100.0 - 198.51.100.255', 'netname:        TEST-NET-2', 'descr:          Reserved for documentation (replay stand-in for the BEACON server address)', 'country:        US'].join('\n'),
    },
    dns: {
      [STAGE2.host]: `Name:\t${STAGE2.host}\nAddress: ${STAGE2.ip}`,
      [BEACON.host]: `Name:\t${BEACON.host}\nAddress: ${BEACON.ip}`,
    },
    commands: { az: buildAz() },
  };
}

export default {
  n: 2,
  caseId: 'solarwinds-2020',
  date: DATE,
  title: 'SolarWinds · December 2020',
  start: 8 * 60 + 5,
  endAt: 11 * 60 + 30,
  intro: ['Case Files: SolarWinds and SUNBURST, December 14, 2020.', 'A replay of a real supply-chain compromise. Priya is running it from her office.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  terminal: terminal(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to Case Files. Today: SolarWinds and SUNBURST, December 14, 2020.',
        "It's Monday, 8:05 AM. FireEye published its write-up last night, CISA issued an emergency directive, and SolarWinds told the SEC this morning. You're on the security team at Halcyon Mutual, which runs Orion on ORION01.",
        'Everything in the logs really happened to a victim like us, in a compressed form. The backdoor was installed in May, woke up after about two weeks, and the actors used it in October. The logs go back that far; the replay skips most of the months in between.',
        'You have the SIEM (DNS, Sysmon, Windows, ADFS, Entra) and a Terminal with the same logs as files, plus the Azure CLI. Start with your inbox.',
      ],
      again: ['Inbox first. Then the infrastructure queue.'],
    },
    dana: { talk: ["I'm the identity admin. I rotated the HR-Sync secret last week, on a ticket. Please tell me that is not in the alerts."], again: ['Is it?'] },
    mike: { talk: ["I'm playing the head of operations. ORION01 is how I know when something breaks."], again: ['How long are we blind?'] },
    theo: { talk: ["I'm the infrastructure lead. ORION01 is mine, and so is ADFS01."], again: ['If you need to know what Orion touches, ask me.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the infrastructure change queue' },
    { id: 'hunt', type: 'terminal', match: HUNT_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: hunt for avsvmcloud.com and list the app credentials (grep, az)', waitText: 'Waiting on the SIEM.' },
    { id: 'creds', type: 'encounter', target: 'theo', text: 'Theo is coming over about what Orion held', waitText: 'Someone is on the way to talk to you.' },
    { id: 'off', type: 'encounter', target: 'mike', text: 'Mike is coming over about the monitoring server', waitText: 'Operations wants a word.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what the public record says' },
  ],
  encounters: [
    { id: 'creds', type: 'walkup', npc: 'theo', after: 'hunt', delayMs: 1500, fallbackAt: 10 * 60 + 5, intro: 'Hey. I went through what ORION01 holds. You need to hear this.', conv: CREDS_TALK },
    { id: 'off', type: 'walkup', npc: 'mike', after: 'creds', delayMs: 1500, fallbackAt: 10 * 60 + 40, intro: 'Security? Got a minute? It is about Orion.', conv: OFF_TALK },
  ],

  score,
  debrief,

  caseFile: {
    id: 'solarwinds-2020',
    company: 'SolarWinds',
    when: 'Sept 2019 - Dec 2020',
    title: 'The update everyone trusted',
    pitch: 'Attackers slip a backdoor into a signed SolarWinds Orion update that thousands of organizations install. It sleeps for two weeks, calls home through generated DNS names, and in a few victims leads to a stolen SAML signing certificate, forged logins and mail read through an app. You are the analyst the morning after FireEye tells the world.',
    tags: ['Supply chain', 'Trojanized update', 'DNS C2', 'Golden SAML', 'Cloud identity', 'Nation-state'],
    difficulty: 'Advanced',
    headline: 'On December 13, 2020, FireEye (Mandiant) disclosed that a signed, trojanized SolarWinds Orion DLL, SUNBURST, had been delivered through the vendor\'s update channel. It waited up to two weeks, resolved generated avsvmcloud.com names, and in selected victims was followed by a Cobalt Strike BEACON, theft of the SAML token-signing certificate, forged sign-ins and credentials added to Microsoft 365 apps. SolarWinds said fewer than 18,000 customers may have had an affected build. The US government attributed the campaign to Russia\'s SVR in April 2021.',
    timeline: [
      { when: 'As early as Sept 2019 (SolarWinds, Jan 2021)', what: 'SolarWinds later says the actors were in its network as early as September 2019, and tested benign code injection into Orion builds in October 2019.' },
      { when: 'Feb - Jun 2020', what: 'CrowdStrike describes SUNSPOT, an implant that watches for Orion builds (MsBuild.exe) and swaps a source file to insert SUNBURST. The trojanized builds, signed with SolarWinds\' certificate, go out between March and June 2020 (SolarWinds 8-K).' },
      { when: '12-14 days after install', what: 'Per FireEye and Microsoft, SUNBURST sleeps for up to two weeks, then resolves generated subdomains of avsvmcloud.com (for example <random>.appsync-api.<region>.avsvmcloud.com). A CNAME answer leads to a second-stage server, and the traffic imitates Orion\'s own improvement-program protocol.' },
      { when: 'Selected victims', what: 'FireEye: the actors then loaded a memory-only dropper (TEARDROP) and a Cobalt Strike BEACON, used a temporary file replacement technique to run tools remotely, used stolen credentials to move laterally, and removed their tools afterward. Microsoft and CISA add: they stole the SAML token-signing certificate, forged tokens, and added credentials to existing apps.' },
      { when: 'Dec 8, 2020', what: 'FireEye announces that it was breached and that its red-team tools were stolen. Its investigation leads to SolarWinds.' },
      { when: 'Dec 13, 2020', what: 'FireEye publishes its SUNBURST analysis. CISA issues Emergency Directive 21-01 ordering federal agencies to disconnect or power down affected Orion servers. Microsoft publishes customer guidance. SolarWinds publishes a security advisory.' },
      { when: 'Dec 14, 2020', what: 'SolarWinds files an 8-K: fewer than 18,000 Orion customers may have had an installation of the affected products.' },
      { when: 'Dec 15-17, 2020', what: 'Microsoft, FireEye and GoDaddy take control of avsvmcloud.com so that infected installations stop reaching the actors (reported). CISA publishes AA20-352A describing the Golden SAML and app-credential techniques.' },
      { when: 'Jan 5, 2021', what: 'The FBI, CISA, ODNI and NSA say the campaign is likely Russian in origin and "intelligence gathering".' },
      { when: 'Apr 15, 2021', what: 'The US government formally attributes the compromise to Russia\'s SVR (APT29, Cozy Bear) and announces sanctions.' },
    ],
    realOutcome: [
      'SolarWinds told the SEC that fewer than 18,000 Orion customers may have had an installation of the products that contained the vulnerability. Not every one of them was exploited.',
      'FireEye said the victims it saw included government, consulting, technology, telecom and extractive entities in North America, Europe, Asia and the Middle East. Microsoft and CISA described a patient, well-resourced actor that followed up only on a small number of targets by hand.',
      'CISA\'s Emergency Directive 21-01 ordered US federal agencies to disconnect or power down Orion servers immediately and, in a supplement, to treat credentials and the identity infrastructure as compromised.',
      'The US government attributed the campaign to Russia\'s Foreign Intelligence Service (SVR) in April 2021. Microsoft calls the actor Nobelium and FireEye/Mandiant called it UNC2452 before it was linked to APT29.',
    ],
    failures: [
      'The vendor\'s own build environment was compromised (SUNSPOT), so a malicious change was compiled, signed and delivered as a normal update. Customers could not tell it from a legitimate one.',
      'Orion servers commonly had very broad privilege: a Domain Admin service account, stored credentials for hundreds of devices, and reach to identity servers.',
      'Unrestricted outbound DNS and HTTPS from management servers let a sleeping backdoor find its server and stay in touch for months.',
      'Identity infrastructure was reachable from a monitoring server, and the SAML token-signing certificate could be taken from it. Microsoft 365 accepted any assertion signed with it.',
      'Few tenants alerted on a federated sign-in that the identity provider had not issued, or on credentials added to an existing app.',
      'Apps kept application permissions (for example Mail.Read on every mailbox) that nobody used, which made an added certificate a mail reader.',
    ],
    attack: [
      { id: 'T1195.002', name: 'Supply Chain Compromise: Compromise Software Supply Chain', fix: 'Verify vendor updates in a test ring, monitor new versions\' network and process behavior, give management software only the rights it needs, and demand build-integrity attestations from critical vendors.' },
      { id: 'T1553.002', name: 'Subvert Trust Controls: Code Signing', fix: 'A valid vendor signature proves who built the file, not that it is safe. Pair signature checks with hash comparison, allowlisting by behavior, and egress control.' },
      { id: 'T1497.003', name: 'Virtualization/Sandbox Evasion: Time Based Evasion', fix: 'Do not rely on a sandbox detonation to clear an update. Watch the installed software for weeks, and alert on first-seen external destinations from servers.' },
      { id: 'T1568.002', name: 'Dynamic Resolution: Domain Generation Algorithms', fix: 'Log all DNS queries, alert on long random-looking subdomains and first-seen domains from servers, and block or sinkhole published generated domains.' },
      { id: 'T1071.004', name: 'Application Layer Protocol: DNS', fix: 'Force servers to use the internal resolver only, block direct DNS and DNS over HTTPS from servers, and review resolver logs for rare domains.' },
      { id: 'T1071.001', name: 'Application Layer Protocol: Web Protocols', fix: 'Deny-by-default outbound rules for servers, with an allowlist of the vendor\'s update hosts, and alert on any new destination.' },
      { id: 'T1078.002', name: 'Valid Accounts: Domain Accounts', fix: 'Take monitoring accounts out of Domain Admins, use a separate least-privilege account per system, rotate secrets, and alert on a service account logging on interactively.' },
      { id: 'T1021.001', name: 'Remote Services: Remote Desktop Protocol', fix: 'Block RDP from management servers to identity servers, require a jump host, and alert on type 10 logons by service accounts.' },
      { id: 'T1606.002', name: 'Forge Web Credentials: SAML Tokens', fix: 'Protect the token-signing certificate (HSM or tightly restricted server), monitor ADFS for certificate export, correlate every federated sign-in with an ADFS issue event, and rotate the certificate twice after exposure.' },
      { id: 'T1098.001', name: 'Account Manipulation: Additional Cloud Credentials', fix: 'Alert on "Add service principal credentials" and certificate or secret changes on apps, require a change ticket, and cap credential lifetime.' },
      { id: 'T1114.002', name: 'Email Collection: Remote Email Collection', fix: 'Remove unused application permissions, limit mail access to named mailboxes, and alert on MailItemsAccessed by an app from a new address.' },
    ],
    resume: 'Investigated a simulated recreation of the 2020 SolarWinds SUNBURST supply-chain compromise in Cyber Office: found a signed, trojanized Orion DLL and generated-domain DNS beaconing (avsvmcloud.com) in resolver and Sysmon logs, traced the stolen service account to a forged SAML sign-in and a certificate added to a Microsoft 365 app using ADFS, Entra ID and Unified Audit Log records and the Azure CLI (MITRE ATT&CK T1195.002, T1568.002, T1606.002, T1098.001), and wrote a containment plan that images and isolates the server and rotates the token-signing certificate. Score: {grade}.',
    sources: [
      { title: 'FireEye / Mandiant: Highly Evasive Attacker Leverages SolarWinds Supply Chain to Compromise Multiple Global Victims With SUNBURST Backdoor (Dec 13, 2020)', url: 'https://www.mandiant.com/resources/blog/evasive-attacker-leverages-solarwinds-supply-chain-compromises-with-sunburst-backdoor' },
      { title: 'CISA Emergency Directive 21-01: Mitigate SolarWinds Orion Code Compromise (Dec 13, 2020)', url: 'https://www.cisa.gov/news-events/directives/ed-21-01-mitigate-solarwinds-orion-code-compromise' },
      { title: 'CISA Alert AA20-352A: Advanced Persistent Threat Compromise of Government Agencies, Critical Infrastructure, and Private Sector Organizations (Dec 17, 2020)', url: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa20-352a' },
      { title: 'Microsoft MSRC: Customer Guidance on Recent Nation-State Cyber Attacks (Dec 13, 2020)', url: 'https://msrc.microsoft.com/blog/2020/12/customer-guidance-on-recent-nation-state-cyber-attacks/' },
      { title: 'Microsoft Security blog: Analyzing Solorigate, the compromised DLL file that started a sophisticated cyberattack (Dec 18, 2020)', url: 'https://www.microsoft.com/en-us/security/blog/2020/12/18/analyzing-solorigate-the-compromised-dll-file-that-started-a-sophisticated-cyberattack-and-how-microsoft-defender-helps-protect/' },
      { title: 'Microsoft Security blog: Using Microsoft 365 Defender to coordinate protection against Solorigate (Dec 28, 2020)', url: 'https://www.microsoft.com/en-us/security/blog/2020/12/28/using-microsoft-365-defender-to-coordinate-protection-against-solorigate/' },
      { title: 'SolarWinds: Security Advisory (Orion Platform, Dec 2020)', url: 'https://www.solarwinds.com/sa-overview/securityadvisory' },
      { title: 'SEC EDGAR: SolarWinds Corp 8-K filings (the Dec 14, 2020 8-K, fewer than 18,000 customers)', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001739942&type=8-K&dateb=&owner=include&count=40' },
      { title: 'CrowdStrike: SUNSPOT Malware, a Technical Analysis (Jan 11, 2021)', url: 'https://www.crowdstrike.com/blog/sunspot-malware-technical-analysis/' },
      { title: 'SolarWinds blog: New Findings From Our Investigation of SUNBURST (Jan 11, 2021)', url: 'https://orangematter.solarwinds.com/2021/01/11/new-findings-from-our-investigation-of-sunburst/' },
      { title: 'White House fact sheet: Imposing Costs for Harmful Foreign Activities by the Russian Government (Apr 15, 2021), attribution to the SVR', url: 'https://bidenwhitehouse.archives.gov/briefing-room/statements-releases/2021/04/15/fact-sheet-imposing-costs-for-harmful-foreign-activities-by-the-russian-government/' },
      { title: 'MITRE ATT&CK: SolarWinds Compromise (C0024)', url: 'https://attack.mitre.org/campaigns/C0024/' },
      { title: 'MITRE ATT&CK: SUNBURST (S0559)', url: 'https://attack.mitre.org/software/S0559/' },
    ],
    disclaimer: 'A dramatized recreation based on public sources. Halcyon Mutual is a stand-in customer: its sites, hosts (ORION01, ADFS01, DC01, DNS01), accounts (svc-solarwinds, it.admin01), the Halcyon-HR-Sync app, the mailboxes, the staff and every internal and attacker-side IP address (documentation ranges) are invented, as is the install date (SolarWinds says the affected builds went out between March and June 2020) and the October intrusion dates. The SIEM, the alerts, the phish, the tickets and all counts did not exist in reality. What is documented: the trojanized DLL and its signature, the dormancy, the generated avsvmcloud.com names and the CNAME-to-second-stage behavior, the TEARDROP and BEACON stage, the temporary file replacement technique, the theft of the SAML token-signing certificate, forged tokens and credentials added to existing apps (FireEye, Microsoft, CISA), the SEC 8-K, ED 21-01 and the April 2021 attribution. The hashes and domains are FireEye\'s published indicators; the addresses they resolve to here are stand-ins. The generated names are made up in the published style. How the actors extracted the signing key (the DKM read in the ADFS container), the exact file paths and event details, and Defender\'s detection timing are reconstructed. The replay samples the months between May and December, so the SIEM holds a few lookups a week (one a week from mid-October) and about eighteen in the last five days. Dollar costs in your report are estimates for this replay.',
  },
};
