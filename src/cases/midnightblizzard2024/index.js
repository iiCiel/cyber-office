// Case file: Microsoft / Midnight Blizzard (NOBELIUM, APT29), January 2024. A recreation of a real breach, built from Microsoft's
// own public account. Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the Case Files
// menu card and the "what really happened" half of the report. The player sits in the security team of a stand-in company (CORP)
// that has the same shape of problem: a legacy test tenant, a legacy OAuth app, and executive mail reachable through app-only access.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, POOL, EXO, GRAPH, GRAPH_ROLES, ROLE_FULL_ACCESS, LEGACY, MALICIOUS, BACKUP, CALBRIDGE, DASH, CORP, TENANT_CORP, TENANT_TEST } from './logs.js';
import { DISCLOSE_TALK, DISCLOSE_SCORE, SECRETS_TALK, SECRETS_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';
import { makeAzCli, cliError } from '../../game/cloudcli.js';
import { uuid } from '../../game/cloudfmt.js';

const MAIN = 'mb-mail';
// Hunting in the cloud: the Azure CLI (app and service principal lists, Graph through az rest), or jq / grep on the exported logs.
const CLOUD_RE = /(\baz\s+(ad\s+(app|sp|user)|rest)\b|\bjq\b|\bgrep\b.*(full_access_as_app|signinlogs|unified-audit|auditlogs|MailItemsAccessed|50126|50076|maint\.svc02)|\bawk\b.*(signinlogs|unified-audit|auditlogs))/i;

function cloudItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const hit = cmds.filter((e) => CLOUD_RE.test(e.cmd));
  const found = hit.some((e) => /\baz\s+(ad\s+(app|sp)|rest)\b|appRoleAssignedTo|full_access_as_app|MailItemsAccessed|50126|50076/i.test(e.cmd));
  return {
    id: 'cloud',
    area: 'Terminal',
    title: 'Find the apps that hold full_access_as_app',
    max: 10,
    teaches: { skill: 'Audit OAuth apps and role assignments with the Azure CLI, and mine exported cloud logs with jq and grep', secplus: '4.9 Use data sources to support an investigation; 4.6 Identity and access management: service accounts and apps' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? 'You listed the apps and the Exchange role assignments (or searched the exports) and found the three new apps that nobody created: Azure-Sync-Helper, Exchange-Health-Check and Office-Addin-Telemetry.' : cmds.length ? 'You opened the Terminal but never looked at the apps, the role assignments or the exported logs.' : 'You never looked at the apps in the tenant.',
    why: 'The logs tell you what happened; the tenant tells you what is left behind. Asking who holds Exchange full_access_as_app (Graph appRoleAssignedTo) puts the approved backup vendor next to three apps created two days ago by another app. That is the comparison Microsoft\'s guidance asks defenders to make: audit the privileges of all identities and service principals, and review apps holding EWS.AccessAsUser.All or EWS.full_access_as_app.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    scoreConversation(SECRETS_SCORE, st.enc?.secrets),
    cloudItem(st),
    scoreConversation(DISCLOSE_SCORE, st.enc?.disclose),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to what Microsoft said happened."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the public account: a password spray against a legacy test tenant account without MFA, a legacy OAuth app with elevated access to the corporate environment, new malicious apps and a new user to grant consent, the full_access_as_app role, and mail read through Exchange Web Services.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. As Microsoft described it, in order: a password spray against a legacy test tenant account, a legacy OAuth app, new apps and a new user, the Exchange full_access_as_app role, then EWS access to leadership, cybersecurity and legal mailboxes.');
  else lines.push('You never wrote it up. In the real incident Microsoft detected the activity on January 12, 2024. Until then, the apps kept reading.');
  if (by.case.contained) lines.push('You removed the apps and the legacy app\'s power, and shut the test account. That is what Microsoft\'s guidance tells defenders to do: audit service principals, remove unused full_access_as_app grants, and scope the rest to named mailboxes.');
  if (by.cloud.outcome === 'good') lines.push('And you found the three apps with the Azure CLI or the exports. The comparison that mattered was the approved backup vendor next to apps that were two days old and had no owner.');
  if (st.enc?.disclose?.outcome === 'process') lines.push('On the "keep it quiet" request you took it to the CISO and Legal. Microsoft filed an 8-K on January 19, 2024, a week after detecting the activity on January 12. Under the SEC rule, the four business days run from the decision that an incident is material.');
  else if (st.enc?.disclose?.outcome === 'quiet') lines.push('You agreed to keep it quiet. The people who decide materiality never heard about it. Microsoft told the SEC on January 19, 2024.');
  if (st.enc?.secrets?.outcome === 'rotate-notify') lines.push('You rotated the secrets and told the customers. On March 8, 2024 Microsoft said the actor was using information from the exfiltrated email to try to gain further access, and that some of the secrets had been shared between customers and Microsoft in email. CISA\'s Emergency Directive 24-02 (April 2, 2024) told federal agencies to analyze the exfiltrated emails, reset compromised credentials, and make sure authentication tools for privileged Azure accounts were secure.');
  else if (st.enc?.secrets?.outcome) lines.push('On the secrets in the mailbox: this is the part of the real story that kept running after the mail was found. Microsoft said in March 2024 that the actor was using secrets from the emails to try to reach other systems. Customers and agencies had to rotate credentials, and CISA ordered federal agencies to do so.');
  if (st.tickets?.['mfa-exception'] === 'extend' || st.tickets?.['mfa-exception']?.choice === 'extend') lines.push('You extended the MFA exemption for the lab tenant. That tenant is where the real intrusion started.');
  if (st.mail?.['entra-blocked']?.enteredCreds) lines.push('And you gave your password to the copycat "unusual sign-in" phish. Breaches attract scammers.');
  lines.push('The technical lesson in one line: nothing here was a vulnerability. It was a test account without MFA, an app nobody owned that could create other apps and grant them mail access, and no alert for either. Microsoft later called out the same gaps in its Secure Future Initiative.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

// ---------------------------------------------------------------------------------------------- the Terminal: exported logs + az
const DAYSEC = 86400;
const isoAt = (day, h, m, s = 0) => new Date(Date.UTC(2024, 0, 12, 0, 0, 0) + (day * DAYSEC + (h + 5) * 3600 + m * 60 + s) * 1000).toISOString().replace('.000Z', 'Z');
const MS_TENANT = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a'; // Microsoft's own services tenant (publicly documented)
const EXO_SP = uuid(`ressp${EXO.name}`);
const GRAPH_SP = uuid(`ressp${GRAPH.name}`);
const VENDOR_TENANT = uuid('tenant-vaultline');

const appRecord = (a, o = {}) => ({
  id: a.objId, appId: a.appId, displayName: a.name, createdDateTime: o.created, identifierUris: [], publisherDomain: CORP, signInAudience: o.audience || 'AzureADMyOrg',
  requiredResourceAccess: o.rra || [], passwordCredentials: o.creds || [], keyCredentials: [],
});
const spRecord = (a, o = {}) => ({
  id: a.spId, appId: a.appId, displayName: a.name, accountEnabled: true, servicePrincipalType: 'Application', appOwnerOrganizationId: o.owner || TENANT_CORP, signInAudience: o.audience || 'AzureADMyOrg',
  createdDateTime: o.created, appRoleAssignmentRequired: false, tags: [], replyUrls: [],
});

function buildApps() {
  const rraFull = [{ resourceAppId: EXO.appId, resourceAccess: [{ id: ROLE_FULL_ACCESS, type: 'Role' }] }];
  const mal = MALICIOUS.map((a, i) => {
    const base = -2 * DAYSEC + 3 * 3600 + 30 * 60 + i * 95;
    const at = (d) => isoAt(0, 0, 0, base + d);
    return { a, created: at(0), spCreated: at(6), secretAt: at(9), grantedAt: isoAt(0, 0, 0, -2 * DAYSEC + 3 * 3600 + 52 * 60 + i * 17) };
  });
  const apps = [
    appRecord({ objId: uuid('obj-intranet'), appId: uuid('app-intranet'), name: 'corp-intranet' }, { created: '2021-02-11T16:20:05Z' }),
    appRecord({ objId: uuid('obj-hrsso'), appId: uuid('app-hrsso'), name: 'hr-portal-sso' }, { created: '2022-05-03T09:41:50Z' }),
    appRecord(DASH, { created: isoAt(-3, 14, 18, 40) }),
    ...mal.map(({ a, created, secretAt }) => appRecord(a, {
      created, audience: 'AzureADMyOrg', rra: rraFull,
      creds: [{ customKeyIdentifier: null, displayName: null, endDateTime: '2026-01-10T08:39:00Z', hint: fakeHint(a.name), keyId: uuid(`key${a.name}1`), secretText: null, startDateTime: secretAt }],
    })),
  ];
  const sps = [
    spRecord({ spId: EXO_SP, appId: EXO.appId, name: EXO.name }, { owner: MS_TENANT, created: '2019-01-08T12:00:00Z', audience: 'AzureADMultipleOrgs' }),
    spRecord({ spId: GRAPH_SP, appId: GRAPH.appId, name: GRAPH.name }, { owner: MS_TENANT, created: '2019-01-08T12:00:00Z', audience: 'AzureADMultipleOrgs' }),
    spRecord(BACKUP, { owner: VENDOR_TENANT, created: BACKUP.created, audience: 'AzureADMultipleOrgs' }),
    spRecord(CALBRIDGE, { owner: uuid('tenant-calbridge'), created: CALBRIDGE.created, audience: 'AzureADMultipleOrgs' }),
    spRecord(LEGACY, { owner: TENANT_TEST, created: LEGACY.created, audience: 'AzureADMultipleOrgs' }),
    spRecord({ spId: uuid('sp-intranet'), appId: uuid('app-intranet'), name: 'corp-intranet' }, { created: '2021-02-11T16:20:08Z' }),
    spRecord(DASH, { created: isoAt(-3, 14, 18, 46) }),
    ...mal.map(({ a, spCreated }) => spRecord(a, { created: spCreated })),
  ];
  const assigned = [
    { id: uuid('ara-backup'), appRoleId: ROLE_FULL_ACCESS, createdDateTime: '2021-06-02T13:52:10Z', deletedDateTime: null, principalDisplayName: BACKUP.name, principalId: BACKUP.spId, principalType: 'ServicePrincipal', resourceDisplayName: EXO.name, resourceId: EXO_SP },
    ...mal.map(({ a, grantedAt }) => ({ id: uuid(`ara-${a.name}`), appRoleId: ROLE_FULL_ACCESS, createdDateTime: grantedAt, deletedDateTime: null, principalDisplayName: a.name, principalId: a.spId, principalType: 'ServicePrincipal', resourceDisplayName: EXO.name, resourceId: EXO_SP })),
  ];
  const legacyRoles = Object.entries(GRAPH_ROLES).map(([name, id]) => ({ id: uuid(`ara-legacy-${name}`), appRoleId: id, createdDateTime: '2020-08-17T14:03:22Z', deletedDateTime: null, principalDisplayName: LEGACY.name, principalId: LEGACY.spId, principalType: 'ServicePrincipal', resourceDisplayName: GRAPH.name, resourceId: GRAPH_SP }));
  return { apps, sps, assigned, legacyRoles };
}
const fakeHint = (name) => uuid(`hint${name}`).slice(0, 3);

function buildAz() {
  const { apps, sps, assigned, legacyRoles } = buildApps();
  const users = [
    ['Priya Raman', 'priya.r', 'Security Operations Lead'], ['Dana Kowalski', 'dana.k', 'Identity and Endpoint Administrator'], ['Theo Okoye', 't.okoye', 'Cloud Engineer'], ['Mike Chen', 'm.chen', 'Director, Business Operations'],
    ['Ana Rojas', 'a.rojas', 'Executive Assistant'], ['Hugo Pereira', 'h.pereira', 'Customer Success Manager'],
    ['R. Hallworth', 'r.hallworth', 'Chief Executive Office'], ['M. Sorensen', 'm.sorensen', 'Chief Operating Office'], ['I. Babatunde', 'i.babatunde', 'Chief Information Security Office'], ['L. Fontaine', 'l.fontaine', 'General Counsel'],
    ['Maintenance Service 02', 'maint.svc02', null],
  ].map(([displayName, sam, jobTitle]) => ({ businessPhones: [], displayName, givenName: displayName.split(' ')[0], id: uuid(`uid${sam}@${CORP}`), jobTitle, mail: sam === 'maint.svc02' ? null : `${sam}@${CORP}`, mobilePhone: null, officeLocation: null, preferredLanguage: null, surname: displayName.split(' ').slice(1).join(' ') || null, userPrincipalName: `${sam}@${CORP}` }));
  const match = (list, f) => {
    let out = list;
    const dn = f.displayName || f.displayname;
    if (typeof dn === 'string') out = out.filter((x) => x.displayName.toLowerCase().includes(dn.toLowerCase()));
    if (typeof f.filter === 'string') {
      const m = f.filter.match(/startswith\(displayName,\s*'([^']*)'\)/i) || f.filter.match(/displayName\s+eq\s+'([^']*)'/i);
      if (m) out = out.filter((x) => x.displayName.toLowerCase().startsWith(m[1].toLowerCase()));
    }
    return out;
  };
  const find = (list, id) => list.find((x) => x.id === id || x.appId === id || x.userPrincipalName === id || x.displayName === id);
  const need = (f) => { if (!f.id) throw cliError('az ad: error: the following arguments are required: --id'); return String(f.id); };

  const rest = (f) => {
    if (String(f.method || 'get').toLowerCase() !== 'get') throw cliError('ERROR: This terminal is read-only for az rest: only --method get is available here.');
    const url = String(f.url || '');
    const u = url.replace(/^https:\/\/graph\.microsoft\.com\/(v1\.0|beta)/i, '');
    const spBy = (key) => sps.find((s) => s.id === key || s.appId === key);
    let m = u.match(/^\/servicePrincipals\(appId='([^']+)'\)\/(appRoleAssignedTo|appRoleAssignments)(?:\?.*)?$/i) || u.match(/^\/servicePrincipals\/([^/?]+)\/(appRoleAssignedTo|appRoleAssignments)(?:\?.*)?$/i);
    if (m) {
      const sp = spBy(m[1]);
      if (!sp) throw cliError(`Not Found({"error":{"code":"Request_ResourceNotFound","message":"Resource '${m[1]}' does not exist or one of its queried reference-property objects are not present."}})`);
      let value = [];
      if (m[2].toLowerCase() === 'approleassignedto') value = sp.id === EXO_SP ? assigned : sp.id === GRAPH_SP ? legacyRoles : [];
      else value = sp.id === LEGACY.spId ? legacyRoles : assigned.filter((x) => x.principalId === sp.id).map((x) => ({ ...x }));
      return { '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#directoryObjects`, value };
    }
    m = u.match(/^\/servicePrincipals(?:\?.*)?$/i);
    if (m) return { '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#servicePrincipals', value: sps };
    m = u.match(/^\/applications(?:\?.*)?$/i);
    if (m) return { '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#applications', value: apps };
    throw cliError(`Not Found({"error":{"code":"Request_ResourceNotFound","message":"Resource not found for the segment '${u.split('/')[1] || ''}'.","innerError":{"date":"2024-01-12T13:12:00","request-id":"${uuid('rid')}"}}})`);
  };

  return makeAzCli({
    'account show': () => ({ environmentName: 'AzureCloud', homeTenantId: TENANT_CORP, id: '9c1b2d3e-4f50-4a61-8b72-93a4b5c6d7e8', isDefault: true, managedByTenants: [], name: 'CORP Production', state: 'Enabled', tenantId: TENANT_CORP, user: { name: `analyst01@${CORP}`, type: 'user' } }),
    'ad app list': (f) => match(apps, f),
    'ad app show': (f) => { const x = find(apps, need(f)); if (!x) throw cliError(`ERROR: Resource '${f.id}' does not exist or one of its queried reference-property objects are not present.`); return x; },
    'ad app credential': (f, pos) => { const x = find(apps, need(f)); if (!x) throw cliError(`ERROR: Resource '${f.id}' does not exist or one of its queried reference-property objects are not present.`); if (pos[0] !== 'list') throw cliError('ERROR: Only "az ad app credential list" is available here.'); return x.passwordCredentials; },
    'ad sp list': (f) => match(sps, f),
    'ad sp show': (f) => { const x = find(sps, need(f)); if (!x) throw cliError(`ERROR: Resource '${f.id}' does not exist or one of its queried reference-property objects are not present.`); return x; },
    'ad user list': (f) => match(users, f),
    'ad user show': (f) => { const x = find(users, need(f)); if (!x) throw cliError(`ERROR: Resource '${f.id}' does not exist or one of its queried reference-property objects are not present.`); return x; },
    'role assignment list': () => [
      { principalName: `dana.k@${CORP}`, principalType: 'User', roleDefinitionName: 'Owner', scope: '/subscriptions/9c1b2d3e-4f50-4a61-8b72-93a4b5c6d7e8' },
      { principalName: `t.okoye@${CORP}`, principalType: 'User', roleDefinitionName: 'Contributor', scope: '/subscriptions/9c1b2d3e-4f50-4a61-8b72-93a4b5c6d7e8/resourceGroups/rg-dashboards' },
    ],
    rest,
  }, { loggedIn: true, user: `analyst01@${CORP}`, tenant: TENANT_CORP });
}

function terminal() {
  const logs = generateLogs({ nowMinutes: 24 * 60 });
  const compact = (e) => JSON.stringify(JSON.parse(e.raw));
  const sign = logs.filter((e) => e.source === 'entra-signin' && !e.sp).map(compact).join('\n');
  const spsign = logs.filter((e) => e.source === 'entra-signin' && e.sp).map(compact).join('\n');
  const audit = logs.filter((e) => e.source === 'azure-audit').map(compact).join('\n');
  const ual = logs.filter((e) => e.source === 'm365-audit').map(compact).join('\n');
  const whois = {};
  for (const p of POOL) whois[p.ip] = [`inetnum:        ${p.ip.split('.').slice(0, 3).join('.')}.0 - ${p.ip.split('.').slice(0, 3).join('.')}.255`, `netname:        ${p.ip.startsWith('203') ? 'TEST-NET-3' : 'TEST-NET-2'}`, 'descr:          Reserved for documentation (replay stand-in for a residential proxy exit address)', `org-name:       ${p.isp.replace(/^AS\d+ /, '')}`, `country:        US`, 'remarks:        Consumer broadband customer line used as a proxy exit node. Do not block by address.'].join('\n');
  whois['192.0.2.77'] = ['inetnum:        192.0.2.0 - 192.0.2.255', 'netname:        TEST-NET-1', 'descr:          Vaultline Backup (SaaS vendor) fixed egress address', 'country:        US'].join('\n');
  whois['192.0.2.201'] = ['inetnum:        192.0.2.0 - 192.0.2.255', 'netname:        TEST-NET-1', 'descr:          Northgate Security (authorized pen test host)', 'country:        US'].join('\n');
  return {
    date: 'Fri Jan 12 2024',
    note: 'Exported Entra sign-in, service-principal, audit and Unified Audit Log records (one JSON object per line) are in /var/log/remote. Try az, jq, grep and awk.',
    files: {
      '/var/log/remote/entra/signinlogs.json': `${sign}\n`,
      '/var/log/remote/entra/spsignin.json': `${spsign}\n`,
      '/var/log/remote/entra/auditlogs.json': `${audit}\n`,
      '/var/log/remote/m365/unified-audit.json': `${ual}\n`,
      '/home/analyst01/approved-apps.txt': [
        'Apps approved by change management for Exchange Online application permissions (as of Jan 2024):',
        '  Vaultline Backup     full_access_as_app   CHG-1184   nightly backup, 40 mailboxes   egress 192.0.2.77',
        '  Calendar Bridge      Calendars.Read       CHG-1960   delegated by admin consent',
        '  internal-dashboard-dev   no Exchange permissions   engineering sandbox',
        '',
      ].join('\n'),
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  az ad app list --query "[].displayName" -o tsv                      which apps exist in our tenant?',
        '  az ad app list -o table                                              and when were they created?',
        "  az ad sp list --query \"[?appOwnerOrganizationId!='" + TENANT_CORP + "'].displayName\" -o tsv    service principals that belong to another tenant",
        "  az rest --method get --url \"https://graph.microsoft.com/v1.0/servicePrincipals(appId='00000002-0000-0ff1-ce00-000000000000')/appRoleAssignedTo\" --query 'value[].principalDisplayName' -o tsv",
        "  jq -r 'select(.status.errorCode==50126) | .ipAddress' /var/log/remote/entra/signinlogs.json | sort -u | wc -l       how many addresses sprayed?",
        "  jq -r 'select(.status.errorCode==0 and .authenticationRequirement==\"singleFactor\") | .userPrincipalName' /var/log/remote/entra/signinlogs.json | sort | uniq -c       who signed in with a password alone?",
        "  jq -r 'select(.Operation==\"MailItemsAccessed\") | .AppId' /var/log/remote/m365/unified-audit.json | sort | uniq -c        which apps read mail?",
        '  whois 203.0.113.34                                  what is this address?',
        '',
        'Compare what you find with /home/analyst01/approved-apps.txt.',
        '',
      ].join('\n'),
    },
    whois,
    dns: {},
    commands: { az: buildAz() },
  };
}

export default {
  n: 2,
  caseId: 'midnight-blizzard-2024',
  date: DATE,
  title: 'Microsoft · January 2024',
  start: 8 * 60 + 5,
  endAt: 11 * 60 + 30,
  intro: ['Case Files: Microsoft and Midnight Blizzard, January 12, 2024.', 'A replay of a real breach. Priya is running it from her office.'],
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
        'Welcome to Case Files. Today: Microsoft and Midnight Blizzard, January 2024.',
        "It's Friday, January 12, 2024, 8:05 AM. You're on the security team at a company with the same kind of problem: an old test tenant, an old OAuth app, and mail that leadership, security and legal would rather nobody read.",
        'This replay squeezes about seven weeks into five days. In reality the spraying began in late November 2023. Microsoft found the activity on January 12 and told the world on January 19. The logs are already in the SIEM.',
        'You have two new tools. The SIEM shows Entra sign-in and audit logs and the Purview audit log as JSON. The Terminal has the Azure CLI and the same logs as files, so jq and grep work. Start with your inbox.',
      ],
      again: ['Inbox first. Then the change queue.'],
    },
    dana: { talk: ["I'm the identity admin. I own the lab tenant on paper. In practice nobody does."], again: ['Please tell me the lab tenant is not in the alerts.'] },
    mike: { talk: ["I'm playing a business executive. Please do not make a thing of this before the board meets."], again: ['Is my mailbox on the list?'] },
    theo: { talk: ["I'm the cloud engineer. Apps, roles, mailboxes. If it has a service principal, it's mine."], again: ['If you need the app list, use az in the Terminal.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the identity and cloud change queue' },
    { id: 'cloud', type: 'terminal', match: CLOUD_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: find which apps hold Exchange full_access_as_app (az, jq)', waitText: 'Waiting on the SIEM.' },
    { id: 'secrets', type: 'encounter', target: 'theo', text: 'Theo is coming over about what was in the mailboxes', waitText: 'Someone is on the way to talk to you.' },
    { id: 'disclose', type: 'encounter', target: 'mike', text: 'Mike is coming over, and he looks worried', waitText: 'An executive wants a word.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what Microsoft said happened' },
  ],
  encounters: [
    { id: 'secrets', type: 'walkup', npc: 'theo', after: 'cloud', delayMs: 1500, fallbackAt: 10 * 60 + 5, intro: 'Hey. I looked at what the apps read. You need to hear this.', conv: SECRETS_TALK },
    { id: 'disclose', type: 'walkup', npc: 'mike', after: 'secrets', delayMs: 1500, fallbackAt: 10 * 60 + 40, intro: 'Security? Got a minute? Legal just called me.', conv: DISCLOSE_TALK },
  ],

  score,
  debrief,

  caseFile: {
    id: 'midnight-blizzard-2024',
    company: 'Microsoft',
    when: 'Nov 2023 - Jan 2024',
    title: 'A test account, a legacy app, and the executives\' mail',
    pitch: 'A Russian state group sprayed passwords at a forgotten test tenant that had no MFA, then used an old OAuth app with too much power to build new apps, grant them mail access to the whole tenant, and read the mailboxes of leadership, cybersecurity and legal. Microsoft found it on January 12, 2024.',
    tags: ['Password spray', 'Cloud identity', 'OAuth app abuse', 'Entra ID', 'Microsoft 365 audit logs', 'Disclosure'],
    difficulty: 'Advanced',
    headline: 'Per Microsoft, from late November 2023 the Midnight Blizzard group (NOBELIUM, APT29) used a password spray against a legacy, non-production test tenant account without multifactor authentication, then a legacy test OAuth application with elevated access to the corporate environment to create more apps and a user, grant them Exchange Online full_access_as_app, and read a very small percentage of corporate mailboxes, including senior leadership, cybersecurity and legal. Microsoft detected it on January 12, 2024.',
    timeline: [
      { when: 'Late Nov 2023', what: 'Per Microsoft, the activity begins. The actor password-sprays a legacy, non-production test tenant account that does not have multifactor authentication (MSRC, Jan 19, 2024).' },
      { when: 'Nov 2023 - Jan 2024', what: 'The spray uses a distributed network of residential proxies, with a limited number of attempts per account to avoid lockout. High IP churn makes address-based indicators unreliable (Microsoft Security blog, Jan 25, 2024).' },
      { when: 'Unspecified', what: 'Microsoft says the actor identified and compromised a legacy test OAuth application that had elevated access to the corporate environment. How it was compromised is not stated.' },
      { when: 'Unspecified', what: 'The actor created additional malicious OAuth applications, created a new user account to grant consent to them, and used the legacy application to grant them the Office 365 Exchange Online full_access_as_app role (Microsoft Security blog).' },
      { when: 'Unspecified', what: 'The malicious apps authenticated to Exchange Online through Exchange Web Services and read a very small percentage of corporate mailboxes, including senior leadership and employees in cybersecurity, legal and other functions. Some email and attached documents were exfiltrated (MSRC).' },
      { when: 'Jan 12, 2024', what: 'Microsoft\'s security team detects the attack and starts its response process (MSRC; 8-K).' },
      { when: 'On or about Jan 13, 2024', what: 'Microsoft removes the threat actor\'s access to the email accounts. The 8-K says: "on or about January 13, 2024."' },
      { when: 'Jan 19, 2024', what: 'Microsoft publishes the MSRC post and files a Form 8-K with the SEC.' },
      { when: 'Jan 25, 2024', what: 'Microsoft Threat Intelligence publishes responder guidance: the attack chain, audit and sign-in guidance, and detections for OAuth app abuse and password spray.' },
      { when: 'Mar 8, 2024', what: 'Microsoft updates: the actor is using information from the exfiltrated email to try to gain access, including some source code repositories and internal systems. Some of the secrets were shared between customers and Microsoft in email. Password sprays rose by as much as 10-fold in February compared with January.' },
      { when: 'Apr 2, 2024 (public Apr 11)', what: 'CISA issues Emergency Directive 24-02: federal agencies must analyze the exfiltrated emails, reset compromised credentials, and make sure authentication tools for privileged Azure accounts are secure.' },
    ],
    realOutcome: [
      'Microsoft said the actor accessed a very small percentage of corporate email accounts, including members of its senior leadership team and employees in cybersecurity, legal and other functions, and exfiltrated some emails and attached documents.',
      'Microsoft said the incident was not the result of a vulnerability in its products or services, and that it had found no evidence the actor had access to customer environments, production systems, source code or AI systems at the time of the January post.',
      'On March 8, 2024 Microsoft said the actor used information from the corporate email to gain, or attempt to gain, access to some source code repositories and internal systems, and that it found no evidence customer-facing systems were compromised. Some secrets had been shared between customers and Microsoft in email.',
      'CISA said federal agency correspondence with Microsoft was exfiltrated and issued Emergency Directive 24-02. It required agencies to analyze the exfiltrated emails, reset compromised credentials and secure privileged Azure accounts. CISA has since sunset the directive.',
    ],
    failures: [
      'A legacy test tenant account with no multifactor authentication could be signed in to with a guessed password.',
      'A legacy OAuth application had elevated access to the corporate environment, enough to create other applications and grant them roles.',
      'Nothing paged anyone when a new user consented to new applications, or when an application was given the Exchange full_access_as_app role.',
      'Application-only mailbox access (EWS with full_access_as_app) is not limited to named mailboxes unless an administrator does that work.',
      'Sign-in monitoring built on IP addresses fails against a residential proxy network, where each attempt comes from another home address.',
      'Secrets and credentials were being sent by email between customers and Microsoft, and then were in the mailboxes that were read.',
    ],
    attack: [
      { id: 'T1110.003', name: 'Brute Force: Password Spraying', fix: 'Require MFA on every account including test tenants, use Entra Password Protection and Smart Lockout, and alert on many accounts failing from many addresses (AADSTS50126 across a tenant).' },
      { id: 'T1090.002', name: 'Proxy: External Proxy', fix: 'Do not rely on IP reputation. Alert on behavior: one password tried per account from many consumer addresses, and on sign-ins that succeed without MFA from a new location. Use Conditional Access with risk-based and location policies.' },
      { id: 'T1078.004', name: 'Valid Accounts: Cloud Accounts', fix: 'Retire legacy tenants and accounts, require MFA, review accounts with owner rights on apps, and review "unfamiliar sign-in properties" risk detections.' },
      { id: 'T1098.001', name: 'Account Manipulation: Additional Cloud Credentials', fix: 'Alert on new secrets or certificates added to existing applications, rotate old ones, and prefer certificates or managed identities.' },
      { id: 'T1136.003', name: 'Create Account: Cloud Account', fix: 'Alert on users created by applications rather than people, and require approval for new accounts that can consent to apps.' },
      { id: 'T1098.003', name: 'Account Manipulation: Additional Cloud Roles', fix: 'Alert on "Add app role assignment to service principal" with full_access_as_app, restrict who can grant app roles, and remove AppRoleAssignment.ReadWrite.All from apps that do not need it.' },
      { id: 'T1550.001', name: 'Use Alternate Authentication Material: Application Access Token', fix: 'Audit all service principals and their permissions, scope EWS and Graph mail access to named mailboxes (RBAC for Applications), and add Conditional Access for workload identities.' },
      { id: 'T1114.002', name: 'Email Collection: Remote Email Collection', fix: 'Keep MailItemsAccessed (Purview Audit) for high-value mailboxes, alert on app-only access to many mailboxes, and keep secrets out of email.' },
    ],
    resume: 'Investigated a simulated recreation of the January 2024 Midnight Blizzard intrusion into corporate email in Cyber Office: traced a residential-proxy password spray against a no-MFA legacy test tenant account through a legacy OAuth app that created malicious apps, a new user and a full_access_as_app grant, using Entra sign-in and audit logs, Purview MailItemsAccessed records and the Azure CLI (MITRE ATT&CK T1110.003, T1098.003, T1114.002), then wrote a containment plan and handled the disclosure and secrets-rotation decisions. Score: {grade}.',
    sources: [
      { title: 'Microsoft Security Response Center: Microsoft Actions Following Attack by Nation State Actor Midnight Blizzard (Jan 19, 2024)', url: 'https://msrc.microsoft.com/blog/2024/01/microsoft-actions-following-attack-by-nation-state-actor-midnight-blizzard/' },
      { title: 'Microsoft Security Response Center: Update on Microsoft Actions Following Attack by Nation State Actor Midnight Blizzard (Mar 8, 2024)', url: 'https://msrc.microsoft.com/blog/2024/03/update-on-microsoft-actions-following-attack-by-nation-state-actor-midnight-blizzard/' },
      { title: 'Microsoft Security blog: Midnight Blizzard: Guidance for responders on nation-state attack (Jan 25, 2024)', url: 'https://www.microsoft.com/en-us/security/blog/2024/01/25/midnight-blizzard-guidance-for-responders-on-nation-state-attack/' },
      { title: 'SEC filing: Microsoft Form 8-K (Jan 19, 2024): detected Jan 12, access removed on or about Jan 13', url: 'https://www.sec.gov/Archives/edgar/data/789019/000119312524011295/d708866d8k.htm' },
      { title: 'SEC filing: Microsoft Form 8-K/A with the Mar 8, 2024 update (Exhibit 99.1)', url: 'https://www.sec.gov/Archives/edgar/data/789019/000119312524062997/d808756dex991.htm' },
      { title: 'CISA: Emergency Directive 24-02, Mitigating the Significant Risk from Nation-State Compromise of Microsoft Corporate Email System', url: 'https://www.cisa.gov/news-events/directives/ed-24-02-mitigating-significant-risk-nation-state-compromise-microsoft-corporate-email-system' },
      { title: 'Microsoft Learn: Authenticate an EWS application by using OAuth (app-only access and full_access_as_app)', url: 'https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/how-to-authenticate-an-ews-application-by-using-oauth' },
      { title: 'Microsoft Learn: Use MailItemsAccessed to investigate compromised accounts', url: 'https://learn.microsoft.com/en-us/purview/audit-log-investigate-accounts' },
      { title: 'Microsoft Learn: Microsoft Entra audit log activity reference', url: 'https://learn.microsoft.com/en-us/entra/identity/monitoring-health/reference-audit-activities' },
      { title: 'Splunk Security Content: O365 FullAccessAsApp Permission Assigned (detection, cites the Microsoft guidance)', url: 'https://research.splunk.com/cloud/01a510b3-a6ac-4d50-8812-7e8a3cde3d79' },
      { title: 'SEC: Rules on Cybersecurity Risk Management, Strategy, Governance, and Incident Disclosure (Jul 26, 2023)', url: 'https://www.sec.gov/newsroom/press-releases/2023-139' },
    ],
    disclaimer: 'A dramatized recreation based on Microsoft\'s public statements. Microsoft never published its internal logs, so the company (CORP), tenants (corp.example, corp-test.onmicrosoft.example), application, user, mailbox and vendor names, every IP address (documentation ranges), the number of accounts, attempts and mailbox reads, and the audit and sign-in lines are invented. The chain follows Microsoft: a password spray against a legacy non-production test tenant account without MFA, residential proxies with limited attempts per account, a legacy test OAuth application with elevated access, additional malicious applications, a new user to grant consent, the Exchange Online full_access_as_app role, and EWS access to leadership, cybersecurity and legal mail. How the legacy application was compromised, which Graph permissions it held, the names of the malicious apps, the sign-in client and user agents, and what the logs looked like are not public; the secret added to the legacy app, its Graph roles and the python user agent are plausible stand-ins. Whether Microsoft\'s own audit records of app-only mailbox access look like the ones here (the UserId and LogonType of an impersonated read) is not public. About seven weeks (late November 2023 to January 12, 2024) are compressed into five days. The weekly governance digest, the pen test, the backup vendor, the phishing mail, the SIEM alerts, the two conversations and the tickets did not exist in reality. Microsoft detected the activity on January 12, 2024, published on January 19 and updated on March 8; the SEC and CISA steps are as published. Dollar costs in your report are estimates for this replay.',
  },
};
