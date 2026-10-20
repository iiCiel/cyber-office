// Lab: "The invoice that changed banks". A fictional adversary-in-the-middle (AiTM) phishing and business-email-compromise
// incident at Halcyon Mutual, investigated in Microsoft 365 / Entra ID logs. Nothing here is a real organization. The technique
// chain is the one Microsoft documented in "From cookie theft to BEC" (Jul 12, 2022); the log formats follow the vendor schemas
// (Graph signIn and directoryAudit, the Purview Unified Audit Log, Defender XDR EmailEvents and alerts).
//
// The story, compressed from about eight days into the logs the player sees (day 0 = Fri Oct 30, 2026; day -7 = Fri Oct 23):
//   -7  14:12  a "shared document" email reaches Rosa Delgado (accounts payable). The link goes to an AiTM reverse proxy that
//              relays the real Microsoft sign-in page. Rosa signs in and approves her MFA prompt: the PROXY is what the sign-in
//              log sees (hosting address, MFA satisfied). 14:24 the stolen session cookie is replayed from a residential proxy:
//              "MFA requirement satisfied by claim in the token", a new device, ID Protection risk anomalousToken.
//   -7  14:26  the attacker searches her mailbox for invoice / wire / bank details, registers its own Authenticator app (persistence),
//              creates an inbox rule that hides warnings and bounces, and sends the lure on to her contacts from her mailbox.
//   -6..-1     quiet watching: token replays every few hours, reading the AP mail.
//   -3  10:02  a REAL vendor invoice (Tidewater Facilities, INV-20418) arrives. The attacker creates a second rule that hides every
//              mail from that vendor, then 11:20 a lookalike-domain "bank details changed" email lands in the AP shared mailbox,
//              and "Rosa" confirms it from her real mailbox.
//   -1  14:05  the first payment (INV-20395, $42,600) goes to the new account. The attacker edits the rule to hide the vendor's chasers.
//    0  09:10  a lookalike "CFO" email tells Mike Chen to release the next wire ($184,350) at the 11:00 cutoff, today.
//
// Decoys: Hugo Pereira really is in Lisbon (impossible-travel alert, but his own managed laptop and no other change); two harmless
// inbox rules made from the office; a scanner that still uses SMTP basic auth; a user who declines an MFA prompt once; a user who
// registers a new phone from the office.

import { T, rng, logBuilder, finishDays } from '../../game/logkit.js';
import { uuid, fakeId, modProp, entraSignIn } from '../../game/cloudfmt.js';

export const DATE = { weekday: 'FRI', name: 'Friday', month: 'Oct', day: 30, year: 2026, domain: 'halcyonmutual.com', netbios: 'HALCYON' };
const DAY = 86400;
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
export const DOM = 'halcyonmutual.com';
export const TENANT = uuid('tenant-halcyon');
export const VENDOR_DOM = 'tidewater-facilities.example';
export const LOOK_VENDOR = 'tidewater-facilities-ap.example'; // lookalike of the vendor (extra "-ap")
export const LOOK_HALCYON = 'halcyonmutual-invoices.example'; // lookalike of us
export const VICTIM = `r.delgado@${DOM}`;

const EXO = { appId: '00000002-0000-0ff1-ce00-000000000000', name: 'Office 365 Exchange Online' };
const CLIENT = {
  office: ['Microsoft Office', 'd3590ed6-52b3-4102-aeff-aad2292ab01c'],
  teams: ['Microsoft Teams', '1fec8e78-bce4-4aaf-ab1b-5451cc387264'],
  owa: ['Office365 Shell WCSS-Client', '89bee1f7-5e6e-4d8a-9f3d-ecd601259da7'],
  home: ['OfficeHome', '4765445b-32c6-49b0-83e6-1d93765276ca'],
  outlookMobile: ['Microsoft Outlook', '27922004-5251-4030-b22d-91ecd9a37ea4'],
};

const NY = { city: 'New York', state: 'New York', country: 'US', lat: 40.71, lon: -74.0 };
const OFFICE = '192.0.2.10';
const VPN = '192.0.2.20';

// attacker infrastructure (RFC 5737 stand-ins)
export const AITM = '198.51.100.58'; // the reverse-proxy server (hosting provider, Frankfurt)
export const LURE_MTA = '203.0.113.64'; // sends the "shared document" lure
export const LOOK_MTA = '203.0.113.88'; // sends both lookalike-domain mails
export const RES = [
  { ip: '203.0.113.141', city: 'Miami', state: 'Florida', lat: 25.76, lon: -80.19, isp: 'AS64501 Prairie Cable' },
  { ip: '203.0.113.52', city: 'Tampa', state: 'Florida', lat: 27.95, lon: -82.46, isp: 'AS64503 Summit Wireless' },
  { ip: '203.0.113.177', city: 'Atlanta', state: 'Georgia', lat: 33.75, lon: -84.39, isp: 'AS64502 Lakeshore Fiber' },
  { ip: '203.0.113.9', city: 'Dallas', state: 'Texas', lat: 32.78, lon: -96.8, isp: 'AS64504 Riverbend Telecom' },
  { ip: '203.0.113.201', city: 'Columbus', state: 'Ohio', lat: 39.96, lon: -82.99, isp: 'AS64505 Cardinal Broadband' },
];
const resGeo = (p) => ({ city: p.city, state: p.state, country: 'US', lat: p.lat, lon: p.lon });
const LISBON = { ip: '198.51.100.130', geo: { city: 'Lisbon', state: 'Lisboa', country: 'PT', lat: 38.72, lon: -9.14 } };
const FRANKFURT = { city: 'Frankfurt am Main', state: 'Hessen', country: 'DE', lat: 50.11, lon: 8.68 };

export const IP_INFO = {
  [OFFICE]: { where: 'New York, NY (office egress)', owner: 'Halcyon Mutual office NAT', note: 'Our own offices. Everyone in the building signs in from here.', external: false },
  [VPN]: { where: 'New York, NY (VPN gateway)', owner: 'Halcyon Mutual VPN', note: 'Remote employees arrive from here after the VPN.', external: false },
  [AITM]: { where: 'Frankfurt, Germany', owner: 'AS64510 Nimbus Hosting GmbH (cloud hosting)', note: 'A rented server in a data center, not a home or an office. Rosa never works from Germany, and a real sign-in does not come from a hosting provider. This is the address that sat in the middle of her sign-in and relayed it to Microsoft.', external: true },
  [LURE_MTA]: { where: 'Amsterdam, Netherlands', owner: 'AS64511 Cobalt VPS', note: 'Mail server of the "DocuShare" sender domain, which was registered 9 days before the lure.', external: true },
  [LOOK_MTA]: { where: 'Amsterdam, Netherlands', owner: 'AS64511 Cobalt VPS', note: 'Sends mail for both lookalike domains (tidewater-facilities-ap.example and halcyonmutual-invoices.example). One server, two brands: the same operator.', external: true },
  [LISBON.ip]: { where: 'Lisbon, Portugal', owner: 'AS64520 Atlantic Telecom (hotel and consumer broadband)', note: 'Hugo Pereira (Sales) is at a trade fair in Lisbon this week; see his travel notice in the inbox. He signs in from his own managed laptop.', external: true },
};
for (const p of RES) {
  IP_INFO[p.ip] = { where: `${p.city}, ${p.state} (US)`, owner: `${p.isp} (consumer broadband)`, note: 'A home broadband address, not a data center. Rosa has never signed in from here. It is one of a handful of residential-proxy addresses that replay the same stolen session, one after another.', external: true };
}

// ------------------------------------------------------------------------------------------------ people
const STAFF = [
  ['priya.r', 'Priya Raman', 'WS-0107'], ['dana.k', 'Dana Kowalski', 'WS-0120'], ['t.okoye', 'Theo Okoye', 'WS-0127'], ['m.chen', 'Mike Chen', 'WS-0131'],
  ['r.delgado', 'Rosa Delgado', 'WS-0133'], ['l.nguyen', 'Linh Nguyen', 'WS-0134'], ['b.tanaka', 'Ben Tanaka', 'WS-0146'], ['c.osei', 'Clara Osei', 'WS-0152'],
  ['e.hart', 'Evelyn Hart', 'WS-0101'], ['j.alvarez', 'Jordan Alvarez', 'WS-0112'], ['h.pereira', 'Hugo Pereira', 'WS-0182'], ['s.okafor', 'Sam Okafor', 'WS-0138'],
];
const WORKDAYS = [-7, -4, -3, -2, -1, 0];

const msgId = (seed) => `<${fakeId(`mi${seed}`, 12, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}.${fakeId(`mj${seed}`, 8, '0123456789abcdef')}@BN7PR12MB.namprd12.prod.outlook.com>`;
const sid = (n) => `S-1-5-21-3156789012-${(n.length * 7919) % 100000}-4021987345-${1100 + (n.length % 90)}`;

// ------------------------------------------------------------------------------------------------ the logs
export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2610);
  const { r } = b;
  const jitter = (n) => Math.floor(r() * n);

  const caPolicy = [{ id: uuid('ca-mfa'), displayName: 'Require MFA for all users', enforcedGrantControls: ['Mfa'], enforcedSessionControls: [], result: 'success' }];
  const mfaSteps = (iso, how) => [
    { authenticationStepDateTime: iso, authenticationMethod: 'Password', authenticationMethodDetail: 'Password in the cloud', succeeded: true, authenticationStepResultDetail: 'Correct password', authenticationStepRequirement: 'Primary authentication' },
    { authenticationStepDateTime: iso, authenticationMethod: 'Mobile app notification', authenticationMethodDetail: 'Mobile app notification', succeeded: true, authenticationStepResultDetail: how, authenticationStepRequirement: 'Multi-factor authentication' },
  ];
  const claimSteps = (iso) => [
    { authenticationStepDateTime: iso, authenticationMethod: 'Previously satisfied', authenticationMethodDetail: null, succeeded: true, authenticationStepResultDetail: 'First factor requirement satisfied by claim in the token', authenticationStepRequirement: 'Primary authentication' },
    { authenticationStepDateTime: iso, authenticationMethod: 'Previously satisfied', authenticationMethodDetail: null, succeeded: true, authenticationStepResultDetail: 'MFA requirement satisfied by claim in the token', authenticationStepRequirement: 'Multi-factor authentication' },
  ];
  // o.how: 'mfa' (a real MFA step) or 'claim' (the MFA claim was already in the token: the session was replayed)
  const si = (t, o, extra) => {
    const full = { tenant: 'halcyon', ...o };
    const e = b.signin(t, full, extra);
    if (o.how === 'mfa') e.make = (st) => entraSignIn({ utc: st.iso, ...full, authDetails: mfaSteps(st.iso, o.mfaHow || 'MFA completed in Azure AD') });
    else if (o.how === 'claim') e.make = (st) => entraSignIn({ utc: st.iso, ...full, authDetails: claimSteps(st.iso) });
    return e;
  };

  const OFFICE_UA = 'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.18526; Pro)';
  const TEAMS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Teams/1.7.00.30000 Chrome/124.0.6367.243 Electron/30.1.0 Safari/537.36';
  const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  const RPC = 'Client=MSExchangeRPC;Microsoft Outlook 16.0.18526.20168;Windows 10;Mapi';
  const OWA = 'Client=OWA;Action=ViewInApp';

  // --- Unified Audit Log helpers (Purview): real Operation names, real field names
  const mailFields = (o) => ({
    OrganizationName: 'halcyonmutual.onmicrosoft.com',
    OriginatingServer: `BN7PR12MB${3000 + ((o.seed.length * 41) % 900)} (15.20.8093.014)`,
    ClientInfoString: o.client,
    ClientIPAddress: o.ip,
    SessionId: uuid(`sess${o.seed}`),
    ExternalAccess: false,
    InternalLogonType: 0,
    LogonType: o.logonType ?? 0,
    LogonUserSid: sid(`${o.seed}u`),
    MailboxGuid: uuid(`mbx${o.mailbox}`),
    MailboxOwnerSid: sid(o.mailbox),
    MailboxOwnerUPN: o.mailbox,
  });
  const readMail = (t, o, extra = {}) => {
    const seed = `${o.mailbox}${t}${o.ip}`;
    const ids = [];
    for (let i = 0; i < o.count; i++) ids.push({ InternetMessageId: msgId(`${seed}${i}`) });
    return b.ual(t, {
      op: 'MailItemsAccessed', type: 'ExchangeItemAggregated', workload: 'Exchange', user: o.mailbox, ip: o.ip,
      fields: { RecordType: 50, Version: 1, ...mailFields({ ...o, seed }), OperationProperties: [{ Name: 'MailAccessType', Value: 'Bind' }, { Name: 'IsThrottled', Value: 'False' }], OperationCount: o.count, Folders: [{ Path: o.folder || '\\Inbox', FolderItems: ids }] },
    }, extra);
  };
  const rule = (t, o, extra) => b.ual(t, {
    op: o.op || 'New-InboxRule', type: 'ExchangeAdmin', workload: 'Exchange', user: o.mailbox, ip: o.ip, result: 'True', objectId: `${o.mailbox}\\${o.name}`,
    fields: {
      RecordType: 1, Version: 1, OrganizationName: 'halcyonmutual.onmicrosoft.com', OriginatingServer: 'BN7PR12MB3118 (15.20.8093.014)', ExternalAccess: false,
      ClientInfoString: o.client, SessionId: uuid(`ruleses${o.mailbox}${t}`),
      Parameters: [{ Name: o.op === 'Set-InboxRule' ? 'Identity' : 'Name', Value: o.name }, ...o.params, { Name: 'AlwaysDeleteOutlookRulesBlob', Value: 'False' }, { Name: 'Force', Value: 'False' }, { Name: 'Mailbox', Value: o.mailbox }],
    },
  }, extra);
  const send = (t, o, extra) => b.ual(t, {
    op: 'Send', type: 'ExchangeItem', workload: 'Exchange', user: o.mailbox, ip: o.ip,
    fields: { RecordType: 2, Version: 1, ...mailFields({ ...o, seed: `send${o.subject}${t}` }), Item: { Id: fakeId(`it${o.subject}${t}`, 40, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789'), ImmutableId: fakeId(`im${o.subject}${t}`, 40, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789'), InternetMessageId: msgId(`send${o.subject}${t}`), ParentFolder: { Id: fakeId('pf', 24, 'ABCDEF0123456789'), MemberUpn: o.mailbox, Path: '\\Sent Items' }, SizeInBytes: o.size || 24800, Subject: o.subject } },
  }, extra);
  const search = (t, o, extra) => b.ual(t, {
    op: 'SearchQueryInitiatedExchange', type: 'SearchQueryInitiatedExchange', workload: 'Exchange', user: o.mailbox, ip: o.ip,
    fields: { RecordType: 81, Version: 1, ...mailFields({ ...o, seed: `q${o.query}${t}` }), QuerySource: 'OWA', QueryText: o.query, SearchScope: 'Mailbox', ResultCount: o.hits, ReturnedResultsCount: o.hits },
  }, extra);
  const logon = (t, o, extra) => b.ual(t, {
    op: 'UserLoggedIn', type: 'AzureActiveDirectoryStsLogon', workload: 'AzureActiveDirectory', user: o.upn, ip: o.ip, objectId: EXO.appId,
    fields: {
      RecordType: 15, Version: 1, AzureActiveDirectoryEventType: 1, Actor: [{ ID: o.upn, Type: 5 }, { ID: uuid(`uid${o.upn}`), Type: 3 }], ActorContextId: TENANT, ApplicationId: o.appId || CLIENT.owa[1],
      DeviceProperties: [{ Name: 'OS', Value: o.os || 'Windows 10' }, { Name: 'BrowserType', Value: o.browser || 'Chrome' }, { Name: 'IsCompliantAndManaged', Value: o.managed ? 'True' : 'False' }, { Name: 'SessionId', Value: uuid(`ses${o.upn}${t}`) }],
      ErrorNumber: '0', InterSystemsId: uuid(`isid${o.upn}${t}`), IntraSystemId: uuid(`isy${o.upn}${t}`), SupportTicketId: '',
      Target: [{ ID: EXO.appId, Type: 0 }], TargetContextId: TENANT,
      ExtendedProperties: [{ Name: 'ResultStatusDetail', Value: 'Redirect' }, { Name: 'UserAgent', Value: o.ua }, { Name: 'RequestType', Value: 'Login:login' }],
    },
  }, extra);

  // Defender XDR EmailEvents (one row per recipient)
  const emailEvent = (t, o, extra) => b.record(t, 'defender365', 'defender365',
    `EmailEvents SenderFromDomain=${o.from.split('@')[1]} SenderFromAddress=${o.from} SenderIPv4=${o.ip} RecipientEmailAddress=${o.to} Subject="${o.subject}" EmailDirection=${o.dir || 'Inbound'} DeliveryAction=Delivered DeliveryLocation=${o.loc || 'Inbox'}`,
    (st) => ({
      Timestamp: st.iso, NetworkMessageId: uuid(`nmi${o.subject}${o.to}${t}`), InternetMessageId: msgId(`em${o.subject}${o.to}${t}`),
      SenderMailFromAddress: o.from, SenderFromAddress: o.from, SenderDisplayName: o.display, SenderMailFromDomain: o.from.split('@')[1], SenderFromDomain: o.from.split('@')[1], SenderIPv4: o.ip,
      RecipientEmailAddress: o.to, Subject: o.subject, EmailDirection: o.dir || 'Inbound', DeliveryAction: 'Delivered', DeliveryLocation: o.loc || 'Inbox',
      ThreatTypes: '', DetectionMethods: '', ConfidenceLevel: '', BulkComplaintLevel: 1, AttachmentCount: o.attach ?? 0, UrlCount: o.urls ?? 0, EmailSize: 18000 + ((o.subject.length * 313) % 40000), EmailLanguage: 'en',
      AuthenticationDetails: JSON.stringify(o.auth || { SPF: 'pass', DKIM: 'pass', DMARC: 'pass', CompAuth: 'pass' }), OrgLevelAction: '', OrgLevelPolicy: '', UserLevelAction: '', UserLevelPolicy: '',
    }), { ip: o.ip, ...extra });
  const defenderAlert = (t, o, extra) => b.record(t, 'defender365', 'defender365', `DefenderAlert title="${o.title}" severity=${o.severity} serviceSource=microsoftDefenderForCloudApps status=new user=${o.upn}`,
    (st) => ({
      id: `da${fakeId(`da${o.title}${t}`, 24, '0123456789')}_1`, providerAlertId: uuid(`pa${o.title}${t}`), incidentId: o.incident, status: 'new', severity: o.severity, classification: null, determination: null,
      serviceSource: 'microsoftDefenderForCloudApps', detectionSource: 'microsoftDefenderForCloudApps', tenantId: TENANT, title: o.title, description: o.description, recommendedActions: o.actions,
      category: o.category, mitreTechniques: o.mitre, createdDateTime: st.iso, lastUpdateDateTime: st.iso, firstActivityDateTime: st.iso, lastActivityDateTime: st.iso, assignedTo: null,
      evidence: [{ '@odata.type': '#microsoft.graph.security.userEvidence', userAccount: { accountName: o.upn.split('@')[0], domainName: DOM, userPrincipalName: o.upn, azureAdUserId: uuid(`uid${o.upn}`) }, verdict: 'suspicious', remediationStatus: 'none' }, ...(o.ips || []).map((ip) => ({ '@odata.type': '#microsoft.graph.security.ipEvidence', ipAddress: ip, verdict: 'suspicious', remediationStatus: 'none' }))],
    }), extra);

  // ====================================================================================================== ordinary life
  STAFF.forEach(([sam, name, ws], idx) => {
    const upn = `${sam}@${DOM}`;
    for (const d of WORKDAYS) {
      const abroad = sam === 'h.pereira' && d >= -3;
      const ip = abroad ? LISBON.ip : (d === -1 && sam === 'm.chen') ? VPN : OFFICE;
      const geo = abroad ? LISBON.geo : NY;
      const arrive = A(d, 7, 25) + idx * 240 + jitter(900) + (abroad ? 3600 : 0);
      if (sam === 'h.pereira' && d === -3) continue; // his first Lisbon sign-in is placed by hand below
      const base = { upn, display: name, ip, mfa: true, policies: caPolicy, deviceName: ws, deviceId: uuid(`dev${ws}`), managed: true, compliant: true, trust: 'Hybrid Azure AD joined', geo };
      si(arrive, { ...base, app: CLIENT.office[0], appId: CLIENT.office[1], client: 'Mobile Apps and Desktop clients', ua: OFFICE_UA, how: 'mfa' }, { noise: true });
      si(arrive + 120 + jitter(300), { ...base, app: CLIENT.teams[0], appId: CLIENT.teams[1], client: 'Mobile Apps and Desktop clients', ua: TEAMS_UA, interactive: false, resource: 'Microsoft Graph', how: 'claim' }, { noise: true });
      readMail(arrive + 200 + jitter(1800), { mailbox: upn, ip, client: RPC, count: 3 + jitter(9), logonType: 0 }, { noise: true, user: sam });
    }
  });

  // decoy: Hugo Pereira is really in Lisbon (a flight on Monday night). New country, new address, same managed laptop, normal MFA.
  si(A(-4, 18, 10), { upn: `h.pereira@${DOM}`, display: 'Hugo Pereira', ip: OFFICE, mfa: true, policies: caPolicy, deviceName: 'WS-0182', deviceId: uuid('devWS-0182'), managed: true, compliant: true, trust: 'Hybrid Azure AD joined', geo: NY, app: CLIENT.office[0], appId: CLIENT.office[1], client: 'Mobile Apps and Desktop clients', ua: OFFICE_UA, how: 'mfa' }, { noise: true });
  si(A(-3, 8, 15), { upn: `h.pereira@${DOM}`, display: 'Hugo Pereira', ip: LISBON.ip, mfa: true, policies: caPolicy, deviceName: 'WS-0182', deviceId: uuid('devWS-0182'), managed: true, compliant: true, trust: 'Hybrid Azure AD joined', geo: LISBON.geo, app: CLIENT.office[0], appId: CLIENT.office[1], client: 'Mobile Apps and Desktop clients', ua: OFFICE_UA, how: 'mfa', risk: 'low', riskEvents: ['unlikelyTravel'], riskState: 'atRisk' }, { noise: true, key: 'decoy-travel' });
  defenderAlert(A(-3, 8, 32), { title: 'Impossible travel activity', severity: 'low', incident: 5109, upn: `h.pereira@${DOM}`, ips: [LISBON.ip], category: 'InitialAccess', mitre: ['T1078'], description: 'The user h.pereira signed in from New York, United States and from Lisbon, Portugal within 14 hours. Travelling that distance in that time is unlikely.', actions: 'Confirm with the user. If the user did not travel, revoke sessions and require a password reset.' }, { noise: true, key: 'decoy-travel-alert' });

  // decoy: a scanner that still sends mail with SMTP basic auth (legacy auth, from the office, every day)
  for (const d of WORKDAYS) si(A(d, 8, 5) + jitter(3000), { upn: `scan-to-email@${DOM}`, display: 'Scan to email', ip: OFFICE, app: 'Exchange Online', appId: EXO.appId, client: 'Authenticated SMTP', ua: 'Konica-Scan/3.2', authReq: 'singleFactorAuthentication', geo: NY, interactive: false }, { noise: true, key: d === -7 ? 'decoy-legacy-smtp' : undefined });

  // decoy: Linh Nguyen declines one MFA prompt (fumbles the phone), then approves
  const linh = { upn: `l.nguyen@${DOM}`, display: 'Linh Nguyen', ip: OFFICE, app: CLIENT.office[0], appId: CLIENT.office[1], client: 'Mobile Apps and Desktop clients', ua: OFFICE_UA, deviceName: 'WS-0134', managed: true, compliant: true, trust: 'Hybrid Azure AD joined', policies: caPolicy, geo: NY, mfa: true };
  si(A(-2, 8, 41, 8), { ...linh, errorCode: 500121, details: 'MFA denied; user declined the authentication' }, { noise: true, key: 'decoy-mfa-fatigue' });
  si(A(-2, 8, 42, 30), { ...linh, how: 'mfa' }, { noise: true });
  // decoy: the same Linh registers a new phone from her desk, at the office, in working hours
  b.audit(A(-2, 8, 47, 12), { activity: 'User registered security info', category: 'UserManagement', service: 'Authentication Methods', by: { upn: `l.nguyen@${DOM}`, ip: OFFICE }, op: 'Add', reason: 'User registered Authenticator app with notification and code', targets: [{ name: 'Linh Nguyen', type: 'User', upn: `l.nguyen@${DOM}`, props: [modProp('Included Updated Properties', null, 'StrongAuthenticationMethod')] }] }, { noise: true, key: 'decoy-mfa-register' });

  // decoy: two harmless inbox rules made from the office through Outlook
  rule(A(-4, 10, 20, 14), { mailbox: `b.tanaka@${DOM}`, ip: OFFICE, client: RPC, name: 'Invoices to AP team', params: [{ Name: 'SubjectContainsWords', Value: 'invoice' }, { Name: 'ForwardTo', Value: `ap@${DOM}` }, { Name: 'StopProcessingRules', Value: 'False' }] }, { noise: true, key: 'decoy-forward-internal' });
  rule(A(-3, 9, 5, 40), { mailbox: `c.osei@${DOM}`, ip: OFFICE, client: RPC, name: 'Newsletters', params: [{ Name: 'From', Value: 'news@industryweekly.example' }, { Name: 'MoveToFolder', Value: 'Newsletters' }, { Name: 'StopProcessingRules', Value: 'False' }] }, { noise: true, key: 'decoy-inbox-rule' });
  // an IT-side Exchange change that looks like forwarding but is internal and ticketed
  b.audit(A(-2, 15, 12, 9), { activity: 'Update user', by: { upn: `dana.k@${DOM}`, ip: OFFICE }, targets: [{ name: 'k.stone', type: 'User', upn: `k.stone@${DOM}`, props: [modProp('AccountEnabled', 'true', 'false')] }], op: 'Update' }, { noise: true });

  // ====================================================================================================== the attack
  const rosa = { upn: VICTIM, display: 'Rosa Delgado' };
  // -7 14:12 the lure
  emailEvent(A(-7, 14, 12, 40), { from: `no-reply@docu-share-notify.example`, display: 'DocuShare Notifications', ip: LURE_MTA, to: VICTIM, subject: 'Tidewater Facilities shared "Remittance_Advice_Oct.pdf" with you', urls: 1, auth: { SPF: 'pass', DKIM: 'pass', DMARC: 'pass', CompAuth: 'pass' } }, { attack: true, key: 'phish-delivered', user: 'r.delgado' });
  readMail(A(-7, 14, 17, 55), { mailbox: VICTIM, ip: OFFICE, client: RPC, count: 2 }, { noise: true, user: 'r.delgado' });
  // 14:19 the sign-in the proxy relays: hosting address, her real UA, MFA completed by Rosa herself, but an unmanaged "device"
  si(A(-7, 14, 19, 12), { ...rosa, ip: AITM, geo: FRANKFURT, app: CLIENT.home[0], appId: CLIENT.home[1], client: 'Browser', ua: WIN_UA, os: 'Windows 10', browser: 'Chrome 130.0.0', mfa: true, policies: caPolicy, how: 'mfa', risk: 'medium', riskEvents: ['unfamiliarFeatures'], riskState: 'atRisk' }, { attack: true, key: 'aitm-signin', user: 'r.delgado' });
  logon(A(-7, 14, 19, 14), { upn: VICTIM, ip: AITM, ua: WIN_UA, appId: CLIENT.home[1] }, { attack: true, user: 'r.delgado' });
  // 14:24 the stolen cookie is replayed from a residential address: no password, no MFA, a different OS and browser
  const res0 = RES[0];
  const replay = (t, p, o = {}, extra = {}) => {
    si(t, { ...rosa, ip: p.ip, geo: resGeo(p), app: o.app || CLIENT.owa[0], appId: o.appId || CLIENT.owa[1], client: 'Browser', ua: LINUX_UA, os: 'Linux', browser: 'Chrome 129.0.0', mfa: true, policies: caPolicy, how: 'claim', risk: 'medium', riskEvents: o.events || ['anomalousToken'], riskState: 'atRisk', interactive: o.interactive ?? true, extra: { tokenProtectionStatusDetails: { signInSessionStatus: 'unbound', signInSessionStatusCode: 1002 } } }, { attack: true, user: 'r.delgado', ...extra });
    logon(t + 1, { upn: VICTIM, ip: p.ip, ua: LINUX_UA, os: 'Linux', browser: 'Chrome', appId: CLIENT.owa[1] }, { attack: true, user: 'r.delgado' });
  };
  replay(A(-7, 14, 24, 31), res0, { events: ['anomalousToken', 'unfamiliarFeatures'] }, { key: 'token-replay' });
  defenderAlert(A(-7, 16, 5, 20), { title: 'Impossible travel activity', severity: 'medium', incident: 5047, upn: VICTIM, ips: [AITM, res0.ip], category: 'InitialAccess', mitre: ['T1078.004'], description: 'The user r.delgado signed in from New York, United States, from Frankfurt am Main, Germany and from Miami, United States, from different devices within 12 minutes.', actions: 'Confirm with the user. If the user did not do this, revoke sessions and require a password reset.' }, { attack: true, key: 'defender-impossible' });
  // 14:26 she is searched for money, her own MFA method is added, the rule is made, the lure is sent on
  search(A(-7, 14, 26, 50), { mailbox: VICTIM, ip: res0.ip, client: OWA, query: 'invoice', hits: 212 }, { attack: true, key: 'search-invoice', user: 'r.delgado' });
  search(A(-7, 14, 27, 40), { mailbox: VICTIM, ip: res0.ip, client: OWA, query: 'wire', hits: 31 }, { attack: true, user: 'r.delgado' });
  search(A(-7, 14, 28, 25), { mailbox: VICTIM, ip: res0.ip, client: OWA, query: '"bank details"', hits: 9 }, { attack: true, user: 'r.delgado' });
  readMail(A(-7, 14, 29, 10), { mailbox: VICTIM, ip: res0.ip, client: OWA, count: 14, folder: '\\Inbox' }, { attack: true, user: 'r.delgado' });
  b.audit(A(-7, 14, 30, 5), { activity: 'User registered security info', category: 'UserManagement', service: 'Authentication Methods', by: { upn: VICTIM, ip: res0.ip }, op: 'Add', reason: 'User registered Authenticator app with notification and code', targets: [{ name: 'Rosa Delgado', type: 'User', upn: VICTIM, props: [modProp('Included Updated Properties', null, 'StrongAuthenticationMethod'), modProp('StrongAuthenticationPhoneAppDetail', null, 'Pixel 7')] }], details: [{ key: 'User-Agent', value: LINUX_UA }] }, { attack: true, key: 'mfa-register' });
  rule(A(-7, 14, 33, 18), {
    mailbox: VICTIM, ip: res0.ip, client: OWA, name: '.',
    params: [{ Name: 'SubjectContainsWords', Value: 'spam;phish;suspicious;undeliverable;hacked;shared with you' }, { Name: 'MarkAsRead', Value: 'True' }, { Name: 'MoveToFolder', Value: 'RSS Subscriptions' }, { Name: 'StopProcessingRules', Value: 'True' }],
  }, { attack: true, key: 'inbox-rule-first', user: 'r.delgado' });
  send(A(-7, 14, 41, 3), { mailbox: VICTIM, ip: res0.ip, client: OWA, subject: 'Tidewater Facilities shared "Remittance_Advice_Oct.pdf" with you' }, { attack: true, key: 'onward-phish', user: 'r.delgado' });
  send(A(-7, 14, 41, 50), { mailbox: VICTIM, ip: res0.ip, client: OWA, subject: 'Tidewater Facilities shared "Remittance_Advice_Oct.pdf" with you', size: 25100 }, { attack: true, user: 'r.delgado' });
  b.ual(A(-7, 14, 44, 12), { op: 'SoftDelete', type: 'ExchangeItem', workload: 'Exchange', user: VICTIM, ip: res0.ip, fields: { RecordType: 2, Version: 1, ...mailFields({ mailbox: VICTIM, ip: res0.ip, client: OWA, seed: 'softdel1' }), AffectedItems: [{ Subject: 'Tidewater Facilities shared "Remittance_Advice_Oct.pdf" with you', ParentFolder: { Path: '\\Sent Items' }, InternetMessageId: msgId('softdel1a') }, { Subject: 'Tidewater Facilities shared "Remittance_Advice_Oct.pdf" with you', ParentFolder: { Path: '\\Sent Items' }, InternetMessageId: msgId('softdel1b') }] } }, { attack: true, user: 'r.delgado' });
  defenderAlert(A(-7, 14, 58, 40), { title: 'Suspicious inbox manipulation rule', severity: 'medium', incident: 5047, upn: VICTIM, ips: [res0.ip], category: 'DefenseEvasion', mitre: ['T1564.008', 'T1114.003'], description: 'A suspicious inbox rule was set on the inbox of r.delgado: it moves messages with the words spam, phish, suspicious, undeliverable and hacked to the RSS Subscriptions folder and marks them as read. This might be an attempt to exfiltrate information or hide warnings.', actions: 'Review the rule, remove it if the user did not create it, and revoke the session.' }, { attack: true, key: 'defender-inbox-rule' });

  // -6 .. 0: the cookie keeps working. Replays from changing residential addresses; the attacker reads AP mail.
  let ri = 0;
  for (let d = -6; d <= 0; d++) {
    const slots = d === -6 || d === -5 ? [[2, 40], [9, 15], [20, 5]] : d === 0 ? [[1, 30], [6, 20]] : [[3, 10], [10, 25], [15, 40]];
    slots.forEach(([h, m]) => {
      const p = RES[(ri++) % RES.length];
      const t = A(d, h, m, jitter(50));
      replay(t, p, { events: ['anomalousToken'], interactive: false, app: CLIENT.office[0], appId: CLIENT.office[1] });
      readMail(t + 90, { mailbox: VICTIM, ip: p.ip, client: OWA, count: 4 + jitter(10), folder: ri % 3 ? '\\Inbox' : '\\Sent Items' }, { attack: true, user: 'r.delgado' });
    });
  }
  // Rosa's own sessions carry on from the office at the same time (nothing for her to notice)

  // -3: the real vendor invoice is hidden, the lookalike appears, "Rosa" confirms it
  const pTue = RES[2];
  replay(A(-3, 10, 31, 6), pTue, { events: ['anomalousToken'] });
  search(A(-3, 10, 33, 12), { mailbox: VICTIM, ip: pTue.ip, client: OWA, query: 'from:ar@tidewater-facilities.example', hits: 17 }, { attack: true, user: 'r.delgado' });
  readMail(A(-3, 10, 34, 40), { mailbox: VICTIM, ip: pTue.ip, client: OWA, count: 6, folder: '\\Inbox' }, { attack: true, user: 'r.delgado' });
  rule(A(-3, 10, 41, 22), {
    mailbox: VICTIM, ip: pTue.ip, client: OWA, name: '.',
    params: [{ Name: 'From', Value: `ar@${VENDOR_DOM};billing@${VENDOR_DOM}` }, { Name: 'SubjectOrBodyContainsWords', Value: 'INV-20418;bank;remittance' }, { Name: 'MarkAsRead', Value: 'True' }, { Name: 'MoveToFolder', Value: 'Archive' }, { Name: 'StopProcessingRules', Value: 'True' }],
  }, { attack: true, key: 'inbox-rule', user: 'r.delgado' });
  defenderAlert(A(-3, 10, 52, 5), { title: 'Suspicious inbox manipulation rule', severity: 'medium', incident: 5047, upn: VICTIM, ips: [pTue.ip], category: 'DefenseEvasion', mitre: ['T1564.008', 'T1114.003'], description: 'A suspicious inbox rule was set on the inbox of r.delgado: it moves messages from ar@tidewater-facilities.example and messages with the words INV-20418, bank and remittance to the Archive folder and marks them as read.', actions: 'Review the rule, remove it if the user did not create it, and revoke the session.' }, { attack: true });
  emailEvent(A(-3, 11, 20, 30), { from: `ap@${LOOK_VENDOR}`, display: 'Tidewater Facilities Accounts Receivable', ip: LOOK_MTA, to: `ap@${DOM}`, subject: 'RE: Invoice INV-20418: updated banking details effective immediately', attach: 1, urls: 0 }, { attack: true, key: 'lookalike-delivered', user: 'ap' });
  emailEvent(A(-3, 11, 20, 30), { from: `ap@${LOOK_VENDOR}`, display: 'Tidewater Facilities Accounts Receivable', ip: LOOK_MTA, to: VICTIM, subject: 'RE: Invoice INV-20418: updated banking details effective immediately', attach: 1, urls: 0 }, { attack: true, user: 'r.delgado' });
  replay(A(-3, 11, 38, 44), pTue, { events: ['anomalousToken'] });
  send(A(-3, 11, 44, 9), { mailbox: VICTIM, ip: pTue.ip, client: OWA, subject: 'RE: Invoice INV-20418: updated banking details effective immediately', size: 31800 }, { attack: true, key: 'rosa-send', user: 'r.delgado' });
  for (const to of [`ap@${DOM}`, `m.chen@${DOM}`]) {
    emailEvent(A(-3, 11, 44, 11), { from: VICTIM, display: 'Rosa Delgado', ip: pTue.ip, to, subject: 'RE: Invoice INV-20418: updated banking details effective immediately', dir: 'Intra-org', loc: 'Inbox' }, { attack: true, user: 'r.delgado' });
  }

  // -1: first payment goes out; the vendor chases; the attacker reads the chaser from the Archive folder and stalls it
  const pThu = RES[3];
  replay(A(-1, 15, 58, 20), pThu, { events: ['anomalousToken'] });
  rule(A(-1, 16, 5, 33), {
    op: 'Set-InboxRule', mailbox: VICTIM, ip: pThu.ip, client: OWA, name: '.',
    params: [{ Name: 'SubjectOrBodyContainsWords', Value: 'INV-20418;INV-20395;bank;remittance;payment;unpaid' }, { Name: 'MarkAsRead', Value: 'True' }, { Name: 'MoveToFolder', Value: 'Archive' }, { Name: 'StopProcessingRules', Value: 'True' }],
  }, { attack: true, key: 'inbox-rule-edit', user: 'r.delgado' });
  readMail(A(-1, 16, 22, 41), { mailbox: VICTIM, ip: pThu.ip, client: OWA, count: 3, folder: '\\Archive' }, { attack: true, key: 'read-vendor-reply', user: 'r.delgado' });
  send(A(-1, 16, 27, 15), { mailbox: VICTIM, ip: pThu.ip, client: OWA, subject: 'RE: INV-20395 payment status', size: 19400 }, { attack: true, key: 'vendor-stall', user: 'r.delgado' });

  // 0: the "CFO" pushes the big wire
  emailEvent(A(0, 9, 10, 20), { from: `e.hart@${LOOK_HALCYON}`, display: 'Evelyn Hart', ip: LOOK_MTA, to: `m.chen@${DOM}`, subject: 'Urgent: release today\'s Tidewater wire before the 11:00 cutoff', auth: { SPF: 'pass', DKIM: 'pass', DMARC: 'pass', CompAuth: 'pass' } }, { attack: true, key: 'cfo-lookalike', user: 'm.chen' });

  return finishDays(b.ev, { nowMinutes, date: DATE });
}

// ---------------------------------------------------------------------------------------------- the case
export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'The invoice that changed banks',
  max: 40,
  question: 'How did a vendor\'s bank details change without the vendor knowing, and what has to happen before 11:00?',
  teaches: { skill: 'Trace an AiTM session-cookie theft to a hidden inbox rule and a payment-redirect (BEC), and respond with session revocation and out-of-band verification', secplus: '4.9 Use data sources: Entra sign-in, audit and Unified Audit Log; 2.2 Threat vectors: phishing; 4.8 Incident response' },
  verdicts: [
    { id: 'aitm-bec', text: 'An adversary-in-the-middle phishing page relayed Rosa\'s real sign-in and MFA and stole her session cookie. The attacker replayed it from residential addresses (no password, no MFA prompt), added its own Authenticator app, hid mail with inbox rules, and used the Tidewater invoice thread and lookalike domains to redirect payment: a business email compromise.' },
    { id: 'password-guess', text: 'Someone guessed or sprayed Rosa\'s password and signed in.' },
    { id: 'insider', text: 'Rosa, or someone else in finance, changed the bank details on purpose to steal the payment.' },
    { id: 'vendor-compromised', text: 'Tidewater\'s own email was compromised, and they sent the new bank details themselves.' },
    { id: 'exchange-vuln', text: 'An unpatched Exchange vulnerability let an attacker create rules and read Rosa\'s mailbox.' },
  ],
  correctVerdict: 'aitm-bec',
  wrongVerdictNotes: {
    'password-guess': 'There are no failed passwords against Rosa. The first sign-in from outside succeeds with her real password and a completed MFA step, relayed through a hosting address, and the later ones carry "MFA requirement satisfied by claim in the token": no password at all. Guessing a password would not have gotten past MFA. Resetting only the password would leave the stolen session working.',
    insider: 'Rosa\'s own sessions, from her office PC and her managed device, look ordinary the whole week. Every rule, search, send and the new Authenticator app come from a different device, a different operating system and residential addresses she has never used. Her insider-risk indicators are absent, and she is the one who reported the vendor problem.',
    'vendor-compromised': 'The real Tidewater mail comes from tidewater-facilities.example and says it never changed accounts. The bank-change mail came from tidewater-facilities-ap.example, a different domain registered days earlier, sent from the same server (203.0.113.88) as the fake "CFO" email. Tidewater was not compromised; it was impersonated.',
    'exchange-vuln': 'Nothing here exploits Exchange. Every action is an ordinary, logged operation (New-InboxRule, Send, MailItemsAccessed) by a signed-in session belonging to Rosa. The weakness was the sign-in: phishable MFA and a session cookie that works from anywhere.',
  },
  actions: [
    { id: 'preserve', text: 'Export the sign-in logs, Unified Audit Log records and the inbox rules before changing anything, and keep the lookalike emails with their headers', good: true },
    { id: 'revoke', text: 'Revoke Rosa\'s sessions and refresh tokens (Revoke-MgUserSignInSession), reset her password, and remove the Authenticator app the attacker registered', good: true },
    { id: 'remove-rules', text: 'Delete the two inbox rules named "." (and check every mailbox for rules that move or forward mail), then restore the hidden Archive mail so the vendor\'s replies can be read', good: true },
    { id: 'payments', text: 'Stop the 11:00 wire now, call the bank\'s fraud desk on the known number to request a recall of Thursday\'s $42,600, and verify the bank details with Tidewater on a phone number from the contract, not from the emails', good: true },
    { id: 'conditional-access', text: 'Require phishing-resistant MFA (FIDO2 or passkeys) for finance and admins, require compliant devices, and enable token protection and shorter sign-in frequency in Conditional Access', good: true },
    { id: 'detect', text: 'Alert on New-InboxRule and Set-InboxRule that move or hide mail or forward externally, on anomalousToken and impossible-travel risk, and on a new MFA method registered from a new location', good: true },
    { id: 'notify', text: 'Tell Tidewater and our bank, file a complaint at ic3.gov, warn the people on Rosa\'s onward-phish list, and tell Legal and Finance leadership', good: true },
    { id: 'reset-only', text: 'Reset Rosa\'s password and ask her to re-enroll MFA, and close the case', good: false, why: 'The attacker holds a session cookie, not a password. A password reset does not end an existing session unless sessions are also revoked, and the attacker\'s own Authenticator app and the two hiding rules stay in place.' },
    { id: 'block-ips', text: 'Block the residential and hosting IP addresses seen in the logs', good: false, why: 'The replays came from five home broadband addresses that rotate, and the proxy server can be replaced in minutes. Blocking addresses is whack-a-mole. Revoke the session and fix the sign-in policy instead.' },
    { id: 'discipline', text: 'Start a disciplinary process against Rosa for clicking the link', good: false, why: 'She did what the real Microsoft page and her real MFA prompt told her to. The page was a live proxy of the real login, so no password manager, MFA prompt or "check the padlock" habit would have caught it. Blame teaches people to hide reports, and it fixes nothing. Phishing-resistant MFA does.' },
  ],
  primaryEvidence: { key: 'inbox-rule', note: 'The key line: Operation New-InboxRule on r.delgado, from a Miami residential address through OWA, with From=ar@tidewater-facilities.example, MarkAsRead=True and MoveToFolder=Archive. It hides the real vendor\'s replies so the fake bank details go unchallenged. Compare it with the harmless rules made from the office through Outlook.' },
  keyEvidence: ['phish-delivered', 'aitm-signin', 'token-replay', 'defender-impossible', 'search-invoice', 'mfa-register', 'inbox-rule-first', 'inbox-rule', 'lookalike-delivered', 'rosa-send', 'read-vendor-reply', 'cfo-lookalike', 'onward-phish'],
  containedRequires: ['revoke', 'remove-rules', 'payments'],
  costs: {
    contained: { amount: 61000, text: 'Incident response, a recalled payment fee, vendor and bank follow-up and a hardening sprint (estimate for this lab)' },
    breach: { amount: 227000, text: 'The $42,600 already sent is not recalled and the $184,350 wire goes out too; the attacker keeps the mailbox (estimate for this lab)' },
  },
  perfectWhy: 'Right order: keep the evidence, kill the session (not just the password), remove the rules and the attacker\'s MFA method, stop the money and verify out of band, then fix the controls: phishing-resistant MFA, device and token protection, and alerts on inbox rules and anomalous tokens.',
  notSubmittedWhy: 'Nobody wrote it up. The stolen session still works, both rules still hide the vendor\'s replies, and the $184,350 wire goes at 11:00.',
};

export const ALERTS = [
  {
    id: 'bec-token',
    title: 'Entra ID Protection: anomalous token for r.delgado',
    severity: 'High',
    rule: 'Risk detection anomalousToken (or unfamiliarFeatures) on a sign-in whose MFA was satisfied by claim in the token, from an address and device the user has not used, within 24 hours of a sign-in from a hosting provider.',
    fields: [['User', 'r.delgado@halcyonmutual.com (Accounts Payable)'], ['Risk', 'Medium, state: atRisk (never remediated)'], ['Pattern', 'Sign-ins from Miami, Tampa, Atlanta and Dallas; her device is a Windows PC in New York'], ['First seen', 'Fri Oct 23, 14:24']],
    trigger: { when: (st, min) => min >= 8 * 60 + 40 },
    notice: 'SIEM alert (High): anomalous token for an accounts-payable user',
    chat: [
      'This one has been sitting in ID Protection since last Friday. The risk is "medium" because no policy acts on medium.',
      '"MFA requirement satisfied by claim in the token" means the sign-in did not ask for MFA at all. Somebody is using a session that was already authenticated. Whose session, and where did it start?',
      'Look at the sign-in just before the first one: a hosting address, MFA completed. Rosa did that one herself, through someone else\'s server.',
    ],
  },
  {
    id: 'bec-rule',
    title: 'New inbox rule hides mail from an external domain',
    severity: 'High',
    rule: 'Unified Audit Log: Operation New-InboxRule or Set-InboxRule where Parameters include MarkAsRead=True and a MoveToFolder other than the Inbox, and the client is OWA from a non-corporate address. Modeled on the Defender for Cloud Apps policy "Suspicious inbox manipulation rule".',
    fields: [['Mailbox', 'r.delgado@halcyonmutual.com'], ['Rules', '2 named "." (a single dot)'], ['Hides', 'ar@ and billing@tidewater-facilities.example, and any mail about INV-20418, bank, remittance'], ['Client', 'OWA, from a Miami residential address']],
    trigger: { when: (st, min) => min >= 9 * 60 + 5 },
    notice: 'SIEM alert (High): inbox rule hiding a vendor\'s mail',
    chat: [
      'A rule named with a single dot is not what a person makes. Rules that mark mail as read and move it away are how an attacker keeps the owner from seeing replies.',
      'Compare with the rules in the log made from the office, through Outlook, in working hours. Those are harmless. This one is not.',
      'Ask who is on the other end of it. Which vendor does it hide, and what happened to that vendor\'s invoices?',
    ],
  },
  {
    id: 'bec-payment',
    main: true,
    title: 'Payment run 11:00: vendor bank details changed after suspicious mailbox activity',
    severity: 'Critical',
    rule: 'Finance system: vendor master bank account changed within 14 days, with a payment of more than $100,000 scheduled, where the change request came from a mailbox that has a Defender or ID Protection alert open.',
    fields: [['Vendor', 'Tidewater Facilities (INV-20395 paid Thu $42,600; INV-20418 $184,350 due in the 11:00 wire run)'], ['Change', 'Bank account changed Wed Oct 28 by the AP team after an email'], ['Requested by', 'ap@tidewater-facilities-ap.example (a lookalike domain), confirmed by r.delgado'], ['Cutoff', 'Today 11:00']],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= 9 * 60 + 30) || min >= 10 * 60 + 15 },
    notice: 'SIEM alert (Critical): $184,350 wire to changed bank details at 11:00',
    chat: [
      'This is the one with a deadline. The AP team changed the vendor\'s bank account on Wednesday after an email that Rosa "confirmed". Thursday\'s first payment is already gone.',
      'Work backward. Who sent the change, from which domain, and who "confirmed" it, from which device and address? Then look at what stops the real vendor from telling us.',
      'Write the case up at the SOC console, and do not forget the money: the SIEM cannot call the bank for you.',
    ],
    case: CASE,
  },
];
