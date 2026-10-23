// Case file: Microsoft / Midnight Blizzard (NOBELIUM, APT29), the corporate-email intrusion Microsoft disclosed in January 2024.
// A recreation for a defender's chair: a stand-in company ("CORP") with a stand-in legacy test tenant, built from Microsoft's own
// account (MSRC blog Jan 19 and Mar 8, 2024; Microsoft Security blog Jan 25, 2024; 8-K of Jan 19, 2024).
//
// What Microsoft documented, in order (the replay squeezes about seven weeks into five days, Mon Jan 8 - Fri Jan 12, 2024):
//   spray      Password spray against a legacy, non-production TEST TENANT account with no MFA, a few attempts per account
//              ("limited the number of attempts to evade detection or account lockout"), through residential proxies (high IP churn).
//   legacy app The actor "identified and compromised a legacy test OAuth application that had elevated access to the Microsoft
//              corporate environment" (how it was compromised is not stated; here: a new secret added by the owner account).
//   new apps   It "created additional malicious OAuth applications", "created a new user account to grant consent" to them in the
//              corporate environment, and "used the legacy test OAuth application to grant them the Office 365 Exchange Online
//              full_access_as_app role".
//   mail       The malicious apps authenticated to Exchange Online and read mail through Exchange Web Services (EWS): a very small
//              percentage of corporate mailboxes, including senior leadership, cybersecurity and legal.
//   detection  Microsoft detected it Jan 12, 2024, removed the access on or about Jan 13 (8-K), disclosed Jan 19.
//
// Everything in the JSON follows the vendor schemas (Graph signIn / servicePrincipalSignIn, directoryAudit, Purview Unified Audit
// Log MailItemsAccessed, Graph security alert). Tenant, app, user and mailbox names, IPs, volumes and times are invented.
// Decoys: a legitimate backup vendor with full_access_as_app, an authorized pen test, a developer locking himself out, an employee
// declining MFA prompts, an assistant reading an executive's mailbox, a normal consent and a normal app registration.

import { T, rng, logBuilder, finishDays } from '../../game/logkit.js';
import { uuid, fakeId, modProp, entraSignIn } from '../../game/cloudfmt.js';

export const DATE = { weekday: 'FRI', name: 'Friday', month: 'Jan', day: 12, year: 2024, domain: 'corp.example', netbios: 'CORP' };
const DAY = 86400;
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);

export const CORP = 'corp.example';
export const TEST = 'corp-test.onmicrosoft.example';
export const TENANT_CORP = uuid('tenantcorp');
export const TENANT_TEST = uuid('tenantcorp-test');

// ------------------------------------------------------------------------------------------------ apps
export const EXO = { appId: '00000002-0000-0ff1-ce00-000000000000', name: 'Office 365 Exchange Online' };
export const GRAPH = { appId: '00000003-0000-0000-c000-000000000000', name: 'Microsoft Graph' };
export const ROLE_FULL_ACCESS = 'dc890d15-9560-4a4c-9b7f-a736ec74ec40'; // EWS full_access_as_app (Microsoft Learn, "Authenticate an EWS application by using OAuth")
export const GRAPH_ROLES = {
  'Application.ReadWrite.All': '1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9',
  'AppRoleAssignment.ReadWrite.All': '06b708a9-e830-4db3-a914-8e69da51d44f',
  'User.ReadWrite.All': '741f803b-c850-494e-b5df-cde7c675a1ca',
};
const CLIENT = {
  portal: ['Azure Portal', 'c44b4083-3bb0-49c1-b47d-974e53cbdf3c'],
  office: ['Microsoft Office', 'd3590ed6-52b3-4102-aeff-aad2292ab01c'],
  teams: ['Microsoft Teams', '1fec8e78-bce4-4aaf-ab1b-5451cc387264'],
  outlookMobile: ['Microsoft Outlook', '27922004-5251-4030-b22d-91ecd9a37ea4'],
  owa: ['Office365 Shell WCSS-Client', '89bee1f7-5e6e-4d8a-9f3d-ecd601259da7'],
  azps: ['Microsoft Azure PowerShell', '1950a258-227b-4e31-a9cf-717495945fc2'],
};

// Display name -> ids follow the builders' own rule (appId = uuid('app' + name), service principal = uuid('sp' + name)).
const appOf = (name, extra = {}) => ({ name, appId: uuid(`app${name}`), spId: uuid(`sp${name}`), objId: uuid(`obj${name}`), ...extra });
export const LEGACY = appOf('LabSync-Legacy', { created: '2019-03-14T15:22:08Z', owner: `qa-legacy07@${TEST}` });
export const MALICIOUS = [appOf('Azure-Sync-Helper'), appOf('Exchange-Health-Check'), appOf('Office-Addin-Telemetry')];
export const BACKUP = appOf('Vaultline Backup', { created: '2021-06-02T13:40:55Z', ip: '192.0.2.77' });
export const CALBRIDGE = appOf('Calendar Bridge', { created: '2022-09-19T10:05:12Z' });
export const DASH = appOf('internal-dashboard-dev', { created: '2024-01-09T14:18:40Z' });
export const NEW_USER = `maint.svc02@${CORP}`;

// ------------------------------------------------------------------------------------------------ people
export const MAILBOXES = {
  slt1: { upn: `r.hallworth@${CORP}`, role: 'Senior leadership' },
  slt2: { upn: `m.sorensen@${CORP}`, role: 'Senior leadership' },
  cyber: { upn: `i.babatunde@${CORP}`, role: 'Cybersecurity' },
  legal: { upn: `l.fontaine@${CORP}`, role: 'Legal' },
};
const ASSISTANT = `a.rojas@${CORP}`;
const STAFF = [
  ['priya.r', 'Priya Raman', 'WS-0107'], ['dana.k', 'Dana Kowalski', 'WS-0120'], ['t.okoye', 'Theo Okoye', 'WS-0127'], ['m.chen', 'Mike Chen', 'WS-0131'],
  ['a.moreau', 'Amelie Moreau', 'WS-0140'], ['b.tanaka', 'Ben Tanaka', 'WS-0146'], ['c.osei', 'Clara Osei', 'WS-0152'], ['d.kowal', 'Dmitri Kowal', 'WS-0158'],
  ['e.ibarra', 'Elena Ibarra', 'WS-0163'], ['f.nilsson', 'Finn Nilsson', 'WS-0171'], ['a.rojas', 'Ana Rojas', 'WS-0175'], ['h.pereira', 'Hugo Pereira', 'WS-0182'],
];
const TEST_ACCOUNTS = ['lab-eng01', 'lab-eng02', 'lab-eng03', 'lab-eng04', 'qa-runner01', 'qa-runner02', 'qa-legacy03', 'qa-legacy05', 'qa-legacy07', 'demo.user', 'demo.sales', 'test.admin',
  'testuser01', 'testuser02', 'sandbox.owner', 'pm.sandbox', 'build.agent', 'ci-lab', 'integration01', 'integration02', 'vendor.eval', 'trainee01', 'trainee02', 'labsync.owner'];
const NONEXISTENT = ['administrator', 'jsmith'];
export const TARGET_ACCOUNT = `qa-legacy07@${TEST}`;

// ------------------------------------------------------------------------------------------------ the residential proxy pool
// 96 stand-in addresses from the RFC 5737 documentation ranges. Each looks like a different home broadband customer.
const PLACES = [['Columbus', 'Ohio', 39.96, -82.99], ['Austin', 'Texas', 30.27, -97.74], ['Tampa', 'Florida', 27.95, -82.46], ['Denver', 'Colorado', 39.74, -104.99], ['Phoenix', 'Arizona', 33.45, -112.07],
  ['Charlotte', 'North Carolina', 35.23, -80.84], ['Portland', 'Oregon', 45.52, -122.68], ['Atlanta', 'Georgia', 33.75, -84.39], ['Kansas City', 'Missouri', 39.1, -94.58], ['Boise', 'Idaho', 43.62, -116.2],
  ['Pittsburgh', 'Pennsylvania', 40.44, -79.99], ['Nashville', 'Tennessee', 36.16, -86.78], ['Minneapolis', 'Minnesota', 44.98, -93.27], ['San Antonio', 'Texas', 29.42, -98.49], ['Raleigh', 'North Carolina', 35.78, -78.64],
  ['Salt Lake City', 'Utah', 40.76, -111.89], ['Albuquerque', 'New Mexico', 35.08, -106.65], ['Louisville', 'Kentucky', 38.25, -85.76], ['Omaha', 'Nebraska', 41.26, -95.93], ['Richmond', 'Virginia', 37.54, -77.44],
  ['Tulsa', 'Oklahoma', 36.15, -95.99], ['Milwaukee', 'Wisconsin', 43.04, -87.91]];
const ISPS = ['AS64500 ExampleNet Broadband', 'AS64501 Prairie Cable', 'AS64502 Lakeshore Fiber', 'AS64503 Summit Wireless', 'AS64504 Riverbend Telecom', 'AS64505 Cardinal Broadband'];
const SPRAY_UAS = [
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', os: 'Windows 10', browser: 'Chrome 120.0.0' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0', os: 'Windows 10', browser: 'Edge 119.0.0' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15', os: 'MacOs', browser: 'Safari 17.1.0' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0', os: 'Windows 10', browser: 'Firefox 121.0.0' },
  { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36', os: 'Linux', browser: 'Chrome 118.0.0' },
  { ua: 'python-requests/2.31.0', os: 'Linux', browser: 'Rich Client 2.31.0' },
];
const prand = rng(7741);
export const POOL = [];
{
  const used = new Set();
  while (POOL.length < 96) {
    const ip = `${POOL.length < 62 ? '203.0.113' : '198.51.100'}.${1 + Math.floor(prand() * 254)}`;
    if (used.has(ip)) continue;
    used.add(ip);
    const [city, state, lat, lon] = PLACES[Math.floor(prand() * PLACES.length)];
    POOL.push({ ip, city, state, lat, lon, isp: ISPS[Math.floor(prand() * ISPS.length)], ua: SPRAY_UAS[Math.floor(prand() * SPRAY_UAS.length)] });
  }
}
const poolGeo = (p) => ({ city: p.city, state: p.state, country: 'US', lat: p.lat, lon: p.lon });

export const IP_INFO = {
  '192.0.2.10': { where: 'New York, NY (office egress)', owner: 'CORP office NAT', note: 'Our own offices. Developers, the lab team and everyone in the building sign in from here.', external: false },
  '192.0.2.20': { where: 'New York, NY (VPN gateway)', owner: 'CORP VPN', note: 'Remote employees arrive from here after the VPN.', external: false },
  '192.0.2.77': { where: 'Ashburn, VA', owner: 'Vaultline Backup (SaaS vendor)', note: 'The backup vendor\'s fixed egress address. It reads mailboxes at night through EWS with full_access_as_app, and always has.', external: false },
  '192.0.2.201': { where: 'Chicago, IL', owner: 'Northgate Security (authorized pen test)', note: 'The pen test firm\'s single scan host. Announced in a change ticket for Thursday night.', external: true },
  '192.0.2.140': { where: 'Brooklyn, NY (home broadband)', owner: 'Mike Chen, home', note: 'Mike\'s home connection.', external: true },
};
for (const p of POOL) {
  IP_INFO[p.ip] = { where: `${p.city}, ${p.state} (US)`, owner: `${p.isp} (consumer broadband)`, note: 'A home broadband address that is not a data center. One of dozens that show up in this tenant once or twice each, which is what a residential proxy network looks like. Blocking it does nothing; the next attempt comes from another home.', external: true };
}

// ------------------------------------------------------------------------------------------------ JSON builders not in logkit
const msgId = (seed) => `<${fakeId(`mi${seed}`, 12, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}.${fakeId(`mj${seed}`, 8, '0123456789abcdef')}@MW4PR12MB.namprd12.prod.outlook.com>`;
const spSigninRecord = (st, o) => {
  const code = o.errorCode ?? 0;
  const geo = o.geo || { city: 'Ashburn', state: 'Virginia', country: 'US', lat: 39.04, lon: -77.49 };
  const res = o.resource || EXO;
  return {
    id: uuid(`sps${st.iso}${o.app.name}${o.ip}`),
    createdDateTime: st.iso,
    appId: o.app.appId,
    appDisplayName: o.app.name,
    servicePrincipalId: o.app.spId,
    servicePrincipalName: o.app.name,
    ipAddress: o.ip,
    resourceDisplayName: res.name,
    resourceId: uuid(`res${res.name}`),
    resourceServicePrincipalId: uuid(`ressp${res.name}`),
    servicePrincipalCredentialKeyId: uuid(`key${o.app.name}${o.keyGen || 0}`),
    clientCredentialType: o.credType || 'clientSecret',
    status: { errorCode: code, failureReason: code ? 'Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID, for a secret added to app.' : 'Other.', additionalDetails: null },
    conditionalAccessStatus: 'notApplied',
    appliedConditionalAccessPolicies: [],
    correlationId: uuid(`spc${st.iso}${o.app.name}${o.ip}`),
    location: { city: geo.city, state: geo.state, countryOrRegion: geo.country, geoCoordinates: { latitude: geo.lat, longitude: geo.lon } },
    signInEventTypes: ['servicePrincipal'],
    homeTenantId: o.homeTenant || TENANT_CORP,
    resourceTenantId: TENANT_CORP,
    isInteractive: false,
  };
};

function ualEwsFields(o) {
  const ids = [];
  for (let i = 0; i < o.count; i++) ids.push({ InternetMessageId: msgId(`${o.seed}${i}`) });
  const fields = {
    OrganizationName: 'corp.onmicrosoft.example',
    OriginatingServer: `MW4PR12MB${4000 + (o.seed.length * 37) % 900} (15.20.7159.020)`,
    Version: 1,
    ClientInfoString: o.client,
    ClientIPAddress: o.ip,
    SessionId: uuid(`sess${o.seed}`),
    ExternalAccess: false,
    InternalLogonType: 0,
    LogonType: o.logonType ?? 0,
    LogonUserSid: `S-1-5-21-2873391520-${(o.seed.length * 7919) % 100000}-3409827162-${1100 + (o.seed.length % 90)}`,
    MailboxGuid: uuid(`mbx${o.mailbox}`),
    MailboxOwnerSid: `S-1-5-21-2873391520-${(o.mailbox.length * 6361) % 100000}-3409827162-${2100 + (o.mailbox.length % 90)}`,
    MailboxOwnerUPN: o.mailbox,
    OperationProperties: [{ Name: 'MailAccessType', Value: o.access || 'Bind' }, { Name: 'IsThrottled', Value: 'False' }],
    OperationCount: o.count,
    Folders: [{ Path: o.folder || '\\Inbox', FolderItems: ids }],
  };
  if (o.appCtx) fields.AppAccessContext = { AADSessionId: uuid(`aad${o.seed}`), ClientAppId: o.appCtx.appId, APIId: EXO.appId, UniqueTokenId: fakeId(`tok${o.seed}`, 22, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_') };
  return fields;
}

const AADREQ = [{ ResourceAppId: EXO.appId, RequiredAppPermissions: [{ EntitlementId: ROLE_FULL_ACCESS, DirectAccessGrant: false }] }];

// ------------------------------------------------------------------------------------------------ the logs
export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2401);
  const { r, pick } = b;
  const jitter = (n) => Math.floor(r() * n);
  let pi = 0;
  const nextProxy = () => POOL[pi++ % POOL.length];

  // o.mfaHow: the second authentication step, stamped with the event's own time when the record is rendered
  const corp = (t, o, extra) => {
    const full = { tenant: 'corp', ...o };
    const e = b.signin(t, full, extra);
    if (o.mfaHow) e.make = (st) => entraSignIn({ utc: st.iso, ...full, authDetails: mfaDetails(st.iso, o.mfaHow) });
    return e;
  };
  const test = (t, o, extra) => b.signin(t, { tenant: 'corp-test', display: o.upn.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), ...o }, extra);
  const spSignin = (t, o, extra = {}) => b.record(t, 'entra-id', 'entra-signin',
    `ServicePrincipalSignInLogs app="${o.app.name}" ip=${o.ip} result=${o.errorCode ? 'Failure' : 'Success'} errorCode=${o.errorCode || 0} resource="${(o.resource || EXO).name}"`,
    (st) => spSigninRecord(st, o), { user: o.app.name, ip: o.ip, sp: true, ...extra });
  const ual = (t, o, extra) => b.ual(t, o, extra);
  const readMail = (t, o, extra = {}) => {
    const seed = `${o.mailbox}${t}${o.ip}`;
    return b.ual(t, {
      op: 'MailItemsAccessed', type: 'ExchangeItemAggregated', workload: 'Exchange', user: o.actor || o.mailbox, ip: o.ip, app: o.app?.name, appId: o.app?.appId, userType: o.userType ?? 0,
      fields: ualEwsFields({ seed, mailbox: o.mailbox, ip: o.ip, client: o.client, count: o.count, folder: o.folder, logonType: o.logonType, access: o.access, appCtx: o.app }),
    }, extra);
  };
  const aadUal = (t, o, extra) => b.ual(t, {
    op: o.op, type: 'AzureActiveDirectory', workload: 'AzureActiveDirectory', user: o.actorId ? `ServicePrincipal_${o.actorId}` : o.user, ip: o.ip ?? null, userType: o.actorId ? 5 : 0,
    objectId: o.objectId,
    fields: {
      AzureActiveDirectoryEventType: 1,
      Actor: [{ ID: o.actorId || o.user, Type: o.actorId ? 3 : 5 }],
      ActorContextId: TENANT_CORP,
      ApplicationId: o.applicationId,
      ExtendedProperties: [{ Name: 'additionalDetails', Value: '{"User-Agent":"python-requests/2.31.0"}' }, { Name: 'extendedAuditEventCategory', Value: o.category || 'Application' }],
      ModifiedProperties: o.mods || [],
      Target: [{ ID: o.objectId, Type: 2 }],
      TargetContextId: TENANT_CORP,
    },
  }, extra);

  // ====================================================================================================== ordinary life
  const corpPolicy = [{ id: uuid('ca-mfa'), displayName: 'Require MFA for all users', enforcedGrantControls: ['Mfa'], enforcedSessionControls: [], result: 'success' }];
  const mfaDetails = (t, how) => [
    { authenticationStepDateTime: t, authenticationMethod: 'Password', authenticationMethodDetail: 'Password in the cloud', succeeded: true, authenticationStepResultDetail: 'Correct password', authenticationStepRequirement: 'Primary authentication' },
    { authenticationStepDateTime: t, authenticationMethod: 'Mobile app notification', authenticationMethodDetail: 'Mobile app notification', succeeded: true, authenticationStepResultDetail: how, authenticationStepRequirement: 'Multi-factor authentication' },
  ];
  const OFFICE_UA = 'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17126; Pro)';
  const TEAMS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Teams/1.6.00.4472 Chrome/98.0.4758.141 Electron/17.4.5 Safari/537.36';
  const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  STAFF.forEach(([sam, name, ws], idx) => {
    const upn = `${sam}@${CORP}`;
    for (let d = -4; d <= 0; d++) {
      const arrive = A(d, 7, 25) + idx * 240 + jitter(900);
      const via = (d === -1 && sam === 'm.chen') ? '192.0.2.20' : '192.0.2.10';
      const base = { upn, display: name, ip: via, mfa: true, policies: corpPolicy, deviceName: ws, managed: true, compliant: true, trust: 'Hybrid Azure AD joined', geo: { city: 'New York', state: 'New York', country: 'US', lat: 40.71, lon: -74.0 } };
      if (sam === 'm.chen' && d === -1) continue; // his evening is a decoy below
      corp(arrive, { ...base, app: CLIENT.office[0], appId: CLIENT.office[1], client: 'Mobile Apps and Desktop clients', ua: OFFICE_UA, mfaHow: 'MFA completed in Azure AD' }, { noise: true });
      corp(arrive + 120 + jitter(300), { ...base, app: CLIENT.teams[0], appId: CLIENT.teams[1], client: 'Mobile Apps and Desktop clients', ua: TEAMS_UA, interactive: false, resource: 'Microsoft Graph', mfaHow: 'MFA requirement satisfied by claim in the token' }, { noise: true });
      if (jitter(3) === 0) corp(arrive + 14400 + jitter(3600), { ...base, app: CLIENT.owa[0], appId: CLIENT.owa[1], client: 'Browser', ua: WEB_UA, mfaHow: 'MFA requirement satisfied by claim in the token' }, { noise: true });
    }
  });
  // decoy: an employee on the VPN who is asked for MFA, hesitates, declines once, then approves (50074, 500121, success)
  const mike = { upn: `m.chen@${CORP}`, display: 'Mike Chen', ip: '192.0.2.140', app: CLIENT.outlookMobile[0], appId: CLIENT.outlookMobile[1], client: 'Mobile Apps and Desktop clients', ua: 'Outlook-iOS/4.2402.0', geo: { city: 'Brooklyn', state: 'New York', country: 'US', lat: 40.65, lon: -73.95 }, os: 'iOS', browser: 'Mobile Safari UI/WKWebView', policies: corpPolicy };
  corp(A(-1, 20, 41, 8), { ...mike, errorCode: 50074, mfa: true }, { noise: true, key: 'decoy-mfa-prompt' });
  corp(A(-1, 20, 41, 51), { ...mike, errorCode: 500121, mfa: true, details: 'MFA denied; user declined the authentication' }, { noise: true });
  corp(A(-1, 20, 43, 12), { ...mike, mfa: true, mfaHow: 'MFA completed in Azure AD' }, { noise: true });

  // decoy: a developer in the legacy lab fat-fingers a password until Smart Lockout stops him; no MFA exists in that tenant
  const devIp = '192.0.2.10';
  const nyGeo = { city: 'New York', state: 'New York', country: 'US', lat: 40.71, lon: -74.0 };
  for (let i = 0; i < 10; i++) test(A(-3, 9, 0, 0) + i * 70 + jitter(30), { upn: `lab-eng02@${TEST}`, app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: devIp, errorCode: 50126, geo: nyGeo, resource: 'Windows Azure Active Directory', deviceName: 'LAB-DEV-02' }, { noise: true });
  test(A(-3, 9, 13, 20), { upn: `lab-eng02@${TEST}`, app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: devIp, errorCode: 50053, geo: nyGeo, resource: 'Windows Azure Active Directory', deviceName: 'LAB-DEV-02' }, { noise: true, key: 'decoy-lockout' });
  test(A(-3, 9, 19, 45), { upn: `lab-eng02@${TEST}`, app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: devIp, errorCode: 50053, geo: nyGeo, resource: 'Windows Azure Active Directory', deviceName: 'LAB-DEV-02' }, { noise: true });
  test(A(-3, 10, 5, 9), { upn: `lab-eng02@${TEST}`, app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: devIp, geo: nyGeo, resource: 'Windows Azure Active Directory', deviceName: 'LAB-DEV-02' }, { noise: true });
  // the lab team signs in with a password alone, every day, because that tenant has no MFA (this is normal here, and the problem)
  for (let d = -4; d <= 0; d++) {
    for (const who of ['lab-eng01', 'lab-eng03', 'lab-eng04', 'qa-runner01']) {
      if (jitter(2)) test(A(d, 8, 30) + jitter(5400), { upn: `${who}@${TEST}`, app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: devIp, geo: nyGeo, resource: 'Windows Azure Active Directory', deviceName: `LAB-DEV-${who.slice(-2)}` }, { noise: true });
    }
  }
  // decoy: authorized pen test, Thursday 22:05-23:40, one host, accounts pt-user*, announced in the change calendar
  for (let i = 0; i < 14; i++) {
    const pt = `pt-user0${1 + (i % 7)}@${TEST}`;
    test(A(-1, 22, 5) + i * 360 + jitter(120), { upn: pt, app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: '192.0.2.201', errorCode: 50126, ua: 'python-requests/2.31.0', client: 'Other clients', os: 'Linux', browser: 'Rich Client 2.31.0', geo: { city: 'Chicago', state: 'Illinois', country: 'US', lat: 41.88, lon: -87.63 }, resource: 'Windows Azure Active Directory' }, { noise: true, key: i === 0 ? 'decoy-pentest' : undefined });
  }

  // decoy: the backup vendor. Legitimately holds full_access_as_app (since 2021), reads mailboxes at 01:10 every night from one address.
  for (let d = -4; d <= 0; d++) {
    const t0 = A(d, 1, 10, 4 + jitter(20));
    spSignin(t0, { app: BACKUP, ip: BACKUP.ip, keyGen: 1 }, { noise: true, key: d === -4 ? 'decoy-backup' : undefined });
    [MAILBOXES.slt1.upn, MAILBOXES.cyber.upn, MAILBOXES.legal.upn, `d.kowal@${CORP}`, `b.tanaka@${CORP}`].forEach((mb, i) => {
      readMail(t0 + 120 + i * 130, { mailbox: mb, ip: BACKUP.ip, app: BACKUP, client: 'Client=WebServices;Vaultline-Exchange/5.2.1;', count: 14 + jitter(12), logonType: 0, userType: 0, folder: i % 2 ? '\\Sent Items' : '\\Inbox' }, { noise: true, key: d === -4 && i === 0 ? 'decoy-backup-mail' : undefined });
    });
  }
  // decoy: the calendar connector refreshes its token during working hours
  for (let d = -4; d <= 0; d++) for (const h of [9, 12, 15]) spSignin(A(d, h, 2, jitter(50)), { app: CALBRIDGE, ip: '192.0.2.88', resource: GRAPH, keyGen: 2 }, { noise: true });
  // decoy: an assistant reads the executive's mailbox as a delegate, through Outlook, from the office, in working hours
  for (let d = -4; d <= 0; d++) {
    readMail(A(d, 8, 40) + jitter(1800), { mailbox: MAILBOXES.slt1.upn, actor: ASSISTANT, ip: '192.0.2.10', client: 'Client=MSExchangeRPC;Microsoft Outlook 16.0.17126.20132;Windows 10;Mapi', count: 3 + jitter(6), logonType: 2 }, { noise: true, user: 'a.rojas', key: d === -4 ? 'decoy-assistant' : undefined });
    readMail(A(d, 13, 15) + jitter(1800), { mailbox: MAILBOXES.slt1.upn, actor: ASSISTANT, ip: '192.0.2.10', client: 'Client=MSExchangeRPC;Microsoft Outlook 16.0.17126.20132;Windows 10;Mapi', count: 2 + jitter(5), logonType: 2, folder: '\\Sent Items' }, { noise: true, user: 'a.rojas' });
  }
  // and the owners read their own mail
  for (const mb of Object.values(MAILBOXES)) for (let d = -4; d <= 0; d++) readMail(A(d, 8, 5) + jitter(3600), { mailbox: mb.upn, ip: '192.0.2.10', client: 'Client=MSExchangeRPC;Microsoft Outlook 16.0.17126.20132;Windows 10;Mapi', count: 4 + jitter(8) }, { noise: true });

  // ordinary directory changes
  const adminIp = '192.0.2.10';
  b.audit(A(-4, 10, 11, 5), { activity: 'Add member to group', category: 'GroupManagement', by: { upn: `dana.k@${CORP}`, ip: adminIp }, targets: [{ name: 'a.moreau', type: 'User', upn: `a.moreau@${CORP}` }, { name: 'SG-Finance-Reports', type: 'Group', groupType: 'unknownFutureValue' }], op: 'Assign' }, { noise: true });
  b.audit(A(-3, 11, 47, 31), { activity: 'Reset password (self-service)', by: { upn: `lab-eng02@${TEST}`, ip: devIp }, targets: [{ name: 'lab-eng02', type: 'User', upn: `lab-eng02@${TEST}` }] }, { noise: true });
  b.audit(A(-3, 14, 30, 2), { activity: 'Update user', by: { upn: `dana.k@${CORP}`, ip: adminIp }, targets: [{ name: 'h.pereira', type: 'User', upn: `h.pereira@${CORP}`, props: [modProp('Department', 'Support', 'Customer Success')] }] }, { noise: true });
  b.audit(A(-2, 9, 22, 18), { activity: 'Add member to group', category: 'GroupManagement', by: { upn: `dana.k@${CORP}`, ip: adminIp }, targets: [{ name: 'f.nilsson', type: 'User', upn: `f.nilsson@${CORP}` }, { name: 'SG-VPN-Users', type: 'Group', groupType: 'unknownFutureValue' }], op: 'Assign' }, { noise: true });
  // decoy: a normal admin consent for a normal app, and a normal app registration by an engineer
  b.audit(A(-3, 15, 2, 40), {
    activity: 'Consent to application', category: 'ApplicationManagement', by: { upn: `dana.k@${CORP}`, ip: adminIp }, op: 'Assign',
    targets: [{ name: CALBRIDGE.name, type: 'ServicePrincipal', id: CALBRIDGE.spId, props: [modProp('ConsentContext.IsAdminConsent', null, 'True'), modProp('ConsentContext.OnBehalfOfAll', null, 'True'), modProp('ConsentAction.Permissions', null, 'ClientAppId: ' + CALBRIDGE.appId + ' ; ConsentType: AllPrincipals ; Scope: Calendars.Read ; ')] }],
    details: [{ key: 'User-Agent', value: WEB_UA }],
  }, { noise: true, key: 'decoy-consent' });
  b.audit(A(-3, 14, 18, 40), {
    activity: 'Add application', category: 'ApplicationManagement', by: { upn: `t.okoye@${CORP}`, ip: adminIp }, op: 'Add', service: 'Core Directory',
    targets: [{ name: DASH.name, type: 'Application', id: DASH.objId, props: [modProp('AvailableToOtherTenants', null, 'false'), modProp('DisplayName', null, DASH.name)] }],
    details: [{ key: 'User-Agent', value: WEB_UA }],
  }, { noise: true, key: 'decoy-add-app' });
  b.audit(A(-2, 9, 50, 12), {
    activity: 'Update application - Certificates and secrets management', category: 'ApplicationManagement', by: { upn: `dana.k@${CORP}`, ip: adminIp }, op: 'Update',
    targets: [{ name: BACKUP.name, type: 'Application', id: BACKUP.objId, props: [modProp('KeyDescription', '[KeyIdentifier=' + uuid('key-old') + ';KeyType=Password;KeyUsage=Verify;DisplayName=vault-2023]', '[KeyIdentifier=' + uuid('key-new') + ';KeyType=Password;KeyUsage=Verify;DisplayName=vault-2024]')] }],
    details: [{ key: 'User-Agent', value: WEB_UA }],
  }, { noise: true, key: 'decoy-secret-rotation' });

  // ====================================================================================================== the spray (Mon-Tue)
  // Sweep 1 (Mon) with password A, sweep 2 (Tue) with password B. One attempt per account per sweep, each from a different home address.
  const sprayOnce = (t, user, code, extra = {}) => {
    const p = nextProxy();
    return test(t, {
      upn: user.includes('@') ? user : `${user}@${TEST}`, app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: p.ip, errorCode: code, geo: poolGeo(p), resource: 'Windows Azure Active Directory',
      ua: p.ua.ua, os: p.ua.os, browser: p.ua.browser, client: p.ua.ua.startsWith('python') ? 'Other clients' : 'Browser', authDetails: code === 50034 ? [] : undefined, ...extra.o,
    }, { attack: true, ...extra.e });
  };
  const sweep1 = [...TEST_ACCOUNTS, ...NONEXISTENT];
  sweep1.forEach((u, i) => {
    const t = A(-4, 0, 20) + Math.floor((i / sweep1.length) * 80000) + jitter(2400);
    sprayOnce(t, u, NONEXISTENT.includes(u) ? 50034 : 50126, { e: { key: i === 0 ? 'spray-wave' : undefined } });
  });
  const sweep2 = [...TEST_ACCOUNTS, ...NONEXISTENT];
  sweep2.forEach((u, i) => {
    const t = A(-3, 0, 35) + Math.floor((i / sweep2.length) * 36000) + jitter(1500);
    if (u === 'qa-legacy07') return; // the success is placed by hand below
    // the same password B is right for three accounts, which tells the story: valid password, but...
    const code = NONEXISTENT.includes(u) ? 50034 : u === 'trainee02' ? 50057 : u === 'test.admin' ? 50076 : 50126;
    sprayOnce(t, u, code, { e: { key: u === 'trainee02' ? 'spray-disabled' : u === 'test.admin' ? 'spray-mfa-block' : undefined } });
  });
  // the hit: 02:41, no MFA exists on this account, so a password is all it takes
  const hit = POOL[90];
  test(A(-3, 2, 41, 17), {
    upn: TARGET_ACCOUNT, app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: hit.ip, geo: poolGeo(hit), resource: 'Windows Azure Active Directory', ua: hit.ua.ua, os: hit.ua.os, browser: hit.ua.browser,
    authReq: 'singleFactor', client: 'Browser',
  }, { attack: true, key: 'test-success' });
  // a few follow-up sign-ins to look around (new addresses every time)
  for (const [dt, res] of [[130, 'Windows Azure Active Directory'], [410, 'Microsoft Graph'], [1210, 'Microsoft Graph']]) {
    const p = nextProxy();
    test(A(-3, 2, 41, 17) + dt, { upn: TARGET_ACCOUNT, app: CLIENT.azps[0], appId: CLIENT.azps[1], ip: p.ip, geo: poolGeo(p), resource: res, ua: p.ua.ua, os: p.ua.os, browser: p.ua.browser, client: 'Mobile Apps and Desktop clients', interactive: false, authReq: 'singleFactor' }, { attack: true });
  }

  // ====================================================================================================== legacy app, new apps, new user, role grant (Wed)
  const ip1 = nextProxy();
  const t0 = A(-2, 3, 10);
  b.audit(t0, {
    activity: 'Update application - Certificates and secrets management', category: 'ApplicationManagement', by: { upn: TARGET_ACCOUNT, ip: ip1.ip }, op: 'Update',
    targets: [{ name: LEGACY.name, type: 'Application', id: LEGACY.objId, props: [modProp('KeyDescription', null, '[KeyIdentifier=' + uuid('key-legacy-new') + ';KeyType=Password;KeyUsage=Verify;DisplayName=]')] }],
    details: [{ key: 'User-Agent', value: ip1.ua.ua }],
  }, { attack: true, key: 'legacy-secret' });
  // from now on the legacy app signs in to the corporate tenant with its new secret
  const ip2 = nextProxy();
  spSignin(A(-2, 3, 22, 40), { app: LEGACY, ip: ip2.ip, geo: poolGeo(ip2), resource: GRAPH, homeTenant: TENANT_TEST, keyGen: 9 }, { attack: true, key: 'legacy-sp-login' });
  spSignin(A(-2, 3, 22, 41), { app: LEGACY, ip: ip2.ip, geo: poolGeo(ip2), resource: GRAPH, homeTenant: TENANT_TEST, keyGen: 9 }, { attack: true });

  // three malicious apps
  const UAS = [{ key: 'User-Agent', value: 'python-requests/2.31.0' }];
  MALICIOUS.forEach((app, i) => {
    const base = A(-2, 3, 30) + i * 95;
    b.audit(base, {
      activity: 'Add application', category: 'ApplicationManagement', by: { app: LEGACY.name }, op: 'Add',
      targets: [{ name: app.name, type: 'Application', id: app.objId, props: [modProp('AvailableToOtherTenants', null, 'false'), modProp('DisplayName', null, app.name), modProp('Included Updated Properties', null, 'AvailableToOtherTenants, DisplayName')] }],
      details: UAS,
    }, { attack: true, key: i === 0 ? 'add-app' : undefined });
    b.audit(base + 6, {
      activity: 'Add service principal', category: 'ApplicationManagement', by: { app: LEGACY.name }, op: 'Add',
      targets: [{ name: app.name, type: 'ServicePrincipal', id: app.spId, props: [modProp('AccountEnabled', null, 'true'), modProp('AppPrincipalId', null, app.appId), modProp('DisplayName', null, app.name), modProp('ServicePrincipalNames', null, app.appId)] }],
      details: UAS,
    }, { attack: true });
    b.audit(base + 9, {
      activity: 'Update application - Certificates and secrets management', category: 'ApplicationManagement', by: { app: LEGACY.name }, op: 'Update',
      targets: [{ name: app.name, type: 'Application', id: app.objId, props: [modProp('KeyDescription', null, '[KeyIdentifier=' + uuid(`key${app.name}1`) + ';KeyType=Password;KeyUsage=Verify;DisplayName=]')] }],
      details: UAS,
    }, { attack: true, key: i === 0 ? 'mal-secret' : undefined });
    b.audit(base + 11, {
      activity: 'Update application', category: 'ApplicationManagement', by: { app: LEGACY.name }, op: 'Update',
      targets: [{ name: app.name, type: 'Application', id: app.objId, props: [modProp('RequiredResourceAccess', null, AADREQ), modProp('Included Updated Properties', null, 'RequiredResourceAccess')] }],
      details: UAS,
    }, { attack: true, key: i === 0 ? 'update-app-perms' : undefined });
    aadUal(base + 11, { op: 'Update application.', actorId: LEGACY.spId, objectId: app.objId, applicationId: LEGACY.appId, mods: [{ Name: 'RequiredResourceAccess', NewValue: JSON.stringify(AADREQ), OldValue: '[]' }, { Name: 'Included Updated Properties', NewValue: 'RequiredResourceAccess', OldValue: '' }] }, { attack: true, key: i === 0 ? 'ual-update-app' : undefined });
  });

  // a new user, created by the legacy app, grants consent
  const tu = A(-2, 3, 41, 12);
  b.audit(tu, {
    activity: 'Add user', category: 'UserManagement', by: { app: LEGACY.name }, op: 'Add',
    targets: [{ name: NEW_USER, type: 'User', upn: NEW_USER, id: uuid(`uid${NEW_USER}`), props: [modProp('AccountEnabled', null, 'true'), modProp('UserPrincipalName', null, NEW_USER), modProp('DisplayName', null, 'Maintenance Service 02'), modProp('UserType', null, 'Member'), modProp('Included Updated Properties', null, 'AccountEnabled, UserPrincipalName, DisplayName, UserType')] }],
    details: UAS,
  }, { attack: true, key: 'add-user' });
  const ip3 = nextProxy();
  MALICIOUS.forEach((app, i) => {
    const t = A(-2, 3, 46) + i * 40;
    corp(t - 8, { upn: NEW_USER, display: 'Maintenance Service 02', app: CLIENT.portal[0], appId: CLIENT.portal[1], ip: ip3.ip, geo: poolGeo(ip3), resource: 'Windows Azure Active Directory', ua: ip3.ua.ua, os: ip3.ua.os, browser: ip3.ua.browser, authReq: 'singleFactor' }, { attack: true, key: i === 0 ? 'newuser-login' : undefined });
    b.audit(t, {
      activity: 'Consent to application', category: 'ApplicationManagement', by: { upn: NEW_USER, ip: ip3.ip }, op: 'Assign',
      targets: [{ name: app.name, type: 'ServicePrincipal', id: app.spId, props: [modProp('ConsentContext.IsAdminConsent', null, 'True'), modProp('ConsentContext.OnBehalfOfAll', null, 'True'), modProp('ConsentContext.Tags', null, 'WindowsAzureActiveDirectoryIntegratedApp'), modProp('ConsentAction.Permissions', null, 'ClientAppId: ' + app.appId + ' ; ConsentType: AllPrincipals ; Scope: User.Read ; '), modProp('TargetId.ServicePrincipalNames', null, app.appId)] }],
      details: [{ key: 'User-Agent', value: ip3.ua.ua }],
    }, { attack: true, key: i === 0 ? 'consent' : undefined });
    aadUal(t, { op: 'Consent to application.', user: NEW_USER, ip: ip3.ip, objectId: app.spId, applicationId: CLIENT.portal[1], mods: [{ Name: 'ConsentContext.IsAdminConsent', NewValue: 'True', OldValue: '' }, { Name: 'ConsentAction.Permissions', NewValue: 'ClientAppId: ' + app.appId + ' ; ConsentType: AllPrincipals ; Scope: User.Read ; ', OldValue: '' }] }, { attack: true, key: i === 0 ? 'ual-consent' : undefined });
  });

  // the legacy app grants each malicious app EWS full_access_as_app
  MALICIOUS.forEach((app, i) => {
    const t = A(-2, 3, 52) + i * 17;
    b.audit(t, {
      activity: 'Add app role assignment to service principal', category: 'ApplicationManagement', by: { app: LEGACY.name }, op: 'Assign',
      targets: [
        { name: app.name, type: 'ServicePrincipal', id: app.spId, props: [modProp('AppRole.Id', null, ROLE_FULL_ACCESS), modProp('AppRole.Value', null, 'full_access_as_app'), modProp('AppRole.DisplayName', null, 'Use Exchange Web Services with full access to all mailboxes'), modProp('ServicePrincipal.ObjectID', null, app.spId), modProp('ServicePrincipal.DisplayName', null, app.name)] },
        { name: EXO.name, type: 'ServicePrincipal', id: uuid(`ressp${EXO.name}`), props: [] },
      ],
      details: UAS,
    }, { attack: true, key: i === 0 ? 'grant-fullaccess' : undefined });
  });

  // ====================================================================================================== reading mail (Wed 04:05 on, Thu, Fri) with app-only access through EWS
  const EWS = 'Client=WebServices;ExchangeServicesClient/15.00.0913.015;';
  const sessions = [
    [A(-2, 4, 5), 'slt1'], [A(-2, 4, 31), 'cyber'],
    [A(-1, 3, 50), 'legal'], [A(-1, 4, 12), 'slt1'], [A(-1, 4, 40), 'slt2'], [A(-1, 5, 2), 'cyber'],
    [A(0, 3, 58), 'legal'], [A(0, 4, 20), 'cyber'], [A(0, 4, 47), 'slt1'],
    [A(0, 9, 20), 'slt2'], // still going while you read this
  ];
  sessions.forEach(([t, who], i) => {
    const app = MALICIOUS[i % 3];
    const p = nextProxy();
    const mb = MAILBOXES[who].upn;
    spSignin(t - 14, { app, ip: p.ip, geo: poolGeo(p), keyGen: 1 }, { attack: true, key: i === 0 ? 'mal-sp-login' : undefined });
    const n = 3 + (i % 2);
    for (let k = 0; k < n; k++) {
      const folder = ['\\Inbox', '\\Sent Items', '\\Inbox\\Customer Escalations', '\\Inbox\\Incident Reports', '\\Archive'][(i + k) % 5];
      const key = i === 0 && k === 0 ? 'mail-access-exec' : i === 1 && k === 0 ? 'mail-access-sec' : i === 2 && k === 0 ? 'mail-access-legal' : undefined;
      readMail(t + k * 120, { mailbox: mb, ip: p.ip, app, client: EWS, count: 6 + jitter(24), logonType: 0, folder }, { attack: true, key });
    }
  });

  // Defender XDR / Defender for Cloud Apps did raise it, Friday 04:58, medium severity, in a queue nobody pages from
  b.record(A(0, 4, 58, 20), 'defender365', 'defender365', 'DefenderAlert title="Suspicious user created an OAuth app that accessed mailbox items" severity=medium serviceSource=microsoftDefenderForCloudApps status=new',
    (st) => ({
      id: `da${fakeId('da1', 24, '0123456789')}_1`,
      providerAlertId: uuid('prov-da1'),
      incidentId: 4412,
      status: 'new',
      severity: 'medium',
      classification: null,
      determination: null,
      serviceSource: 'microsoftDefenderForCloudApps',
      detectionSource: 'microsoftDefenderForCloudApps',
      detectorId: uuid('detector-oauth-mail'),
      tenantId: TENANT_CORP,
      title: 'Suspicious user created an OAuth app that accessed mailbox items',
      description: 'A user that was created recently, and has not been seen before, created an OAuth app that accessed mailbox items. This might be an attempt to gain persistent access to mail data.',
      recommendedActions: 'Review the app, its permissions and the user who consented to it. Revoke consent and disable the app if it is not recognized.',
      category: 'Collection',
      mitreTechniques: ['T1114.002', 'T1098.003'],
      createdDateTime: st.iso,
      lastUpdateDateTime: st.iso,
      firstActivityDateTime: st.iso,
      lastActivityDateTime: st.iso,
      assignedTo: null,
      evidence: [
        { '@odata.type': '#microsoft.graph.security.userEvidence', userAccount: { accountName: 'maint.svc02', domainName: CORP, userPrincipalName: NEW_USER, azureAdUserId: uuid(`uid${NEW_USER}`) }, verdict: 'suspicious', remediationStatus: 'none' },
        { '@odata.type': '#microsoft.graph.security.oauthApplicationEvidence', objectId: MALICIOUS[1].spId, appId: MALICIOUS[1].appId, name: MALICIOUS[1].name, publisher: null, verdict: 'suspicious', remediationStatus: 'none' },
        { '@odata.type': '#microsoft.graph.security.ipEvidence', ipAddress: POOL[23].ip, verdict: 'suspicious', remediationStatus: 'none' },
      ],
    }), { attack: true, key: 'defender-alert' });

  return finishDays(b.ev, { nowMinutes, date: DATE });
}

// ---------------------------------------------------------------------------------------------- the case
export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'A test account, a legacy app, and executive mail read without a password',
  max: 40,
  question: 'How did someone read leadership, security and legal mail, and what has to be shut off?',
  teaches: { skill: 'Trace a cloud identity attack from a password spray to OAuth app abuse and app-only mailbox access', secplus: '4.9 Use data sources: Entra sign-in, audit and Unified Audit Log; 2.4 Malicious activity: password spraying' },
  verdicts: [
    { id: 'oauth-chain', text: 'A password spray through residential proxies guessed the password of a legacy test-tenant account with no MFA. That account led to a legacy OAuth app with elevated access to the corporate tenant. The attacker used it to create new apps and a new user, grant them full_access_as_app, and read executive, security and legal mailboxes through EWS with app-only access.' },
    { id: 'phished', text: 'An executive was phished: they entered their password on a fake login page and approved a malicious app.' },
    { id: 'brute-mailbox', text: 'Someone brute-forced the executives\' mailbox passwords until one worked.' },
    { id: 'exchange-vuln', text: 'An unpatched Exchange vulnerability let an attacker read mailboxes.' },
    { id: 'backup-vendor', text: 'The backup vendor\'s app was compromised. It already has full_access_as_app.' },
  ],
  correctVerdict: 'oauth-chain',
  wrongVerdictNotes: {
    phished: 'No executive sign-in shows anything unusual, and there is no MFA prompt, no consent from a real user and no phishing mail in this case. The first events are failed sign-ins against a test tenant from dozens of home addresses. The mail reads use an app token, not a password at all.',
    'brute-mailbox': 'The failed passwords are against the legacy test tenant, one or two per account, each from a different address: a password spray, not a brute force of the executives. The mailboxes were never signed in to. The apps read them with an app-only token, so changing the executives\' passwords changes nothing.',
    'exchange-vuln': 'Nothing here exploits Exchange. Every mail read is an ordinary, logged MailItemsAccessed event through EWS by an app that was granted the full_access_as_app role. Microsoft said the same of its own incident: it was not the result of a vulnerability in its products. The weakness was identity: a test account with no MFA and an over-privileged legacy app.',
    'backup-vendor': 'Vaultline Backup reads mail at 01:10 every night from one fixed address (192.0.2.77) with its own client string, and has held full_access_as_app since 2021. The reads in this case come from the three new apps, from different home addresses, at 04:00. A legitimate high-privilege app is a reason to review scope, not the cause.',
  },
  actions: [
    { id: 'preserve', text: 'Export the Entra sign-in and audit logs and the Purview MailItemsAccessed records, and extend retention, before changing anything', good: true },
    { id: 'disable-apps', text: 'Disable the three new apps (Azure-Sync-Helper, Exchange-Health-Check, Office-Addin-Telemetry), remove their full_access_as_app role and delete their secrets, keeping the objects for evidence', good: true },
    { id: 'revoke-legacy', text: 'Remove the Graph roles from LabSync-Legacy in the corporate tenant, delete its secrets and disable it', good: true },
    { id: 'disable-user', text: 'Disable maint.svc02, disable qa-legacy07 and reset the passwords that matched the spray, then revoke their sessions', good: true },
    { id: 'mfa-ca', text: 'Require MFA for every account including the test tenant (or retire the test tenant), and block legacy authentication with Conditional Access', good: true },
    { id: 'scope-ews', text: 'List every app with full_access_as_app or ApplicationImpersonation, remove what is unused, and scope the rest to named mailboxes (RBAC for Applications)', good: true },
    { id: 'detect', text: 'Alert on consent to application, app role assignments of full_access_as_app, new apps created by apps, and password spray across many IPs', good: true },
    { id: 'notify', text: 'Tell the CISO and Legal now for a disclosure assessment, notify the mailbox owners, and rotate any secrets found in the mail the apps read', good: true },
    { id: 'block-ips', text: 'Block the sign-in IP addresses seen in the spray at the firewall and close the case', good: false, why: 'The addresses are home broadband lines in a residential proxy network and each was used once or twice. The next attempt comes from another home. Microsoft said the same: the high churn makes IP-based indicators unreliable. Block behaviors, not addresses.' },
    { id: 'reset-execs', text: 'Reset the passwords of the four executives whose mailboxes were read', good: false, why: 'The apps did not use their passwords. They have their own tokens and the full_access_as_app role, so resetting a mailbox owner\'s password changes nothing. Remove the apps and the role.' },
    { id: 'delete-tenant', text: 'Delete the whole legacy test tenant right now so it cannot be abused again', good: false, why: 'Retiring the test tenant is right, but not first. Deleting it takes the sign-in and audit evidence of the intrusion with it, and the attacker already has a foothold in the corporate tenant. Preserve, contain, then decommission.' },
  ],
  primaryEvidence: { key: 'grant-fullaccess', note: 'The key line: "Add app role assignment to service principal" in the Entra audit log. A service principal (LabSync-Legacy, not a person) gives a brand-new app the Exchange Online full_access_as_app role, which reads every mailbox. Compare it with the deliberate, ticketed grant to the backup vendor.' },
  keyEvidence: ['spray-wave', 'spray-mfa-block', 'test-success', 'legacy-secret', 'legacy-sp-login', 'add-app', 'add-user', 'consent', 'grant-fullaccess', 'mal-sp-login', 'mail-access-exec', 'mail-access-legal'],
  containedRequires: ['disable-apps', 'revoke-legacy'],
  costs: {
    contained: { amount: 650000, text: 'Incident response, secret rotation across affected systems, retiring the test tenant, mailbox-owner notifications and legal review (estimate for this recreation)' },
    breach: { amount: 9500000, text: 'The apps keep reading mail. Secrets sent by email are used to reach other systems, customers must be notified, and regulators are involved (estimate for this recreation)' },
  },
  perfectWhy: 'Right order: keep the evidence, remove the apps and the legacy app\'s power, shut the entry points (MFA, the test account, the new user), then fix the habits: scope EWS access to named mailboxes, alert on consent and role grants, and tell Legal early. Microsoft said it detected the activity on Jan 12 and disclosed on Jan 19.',
  notSubmittedWhy: 'Nobody wrote it up. The three apps still hold full_access_as_app, and the attacker is still reading the mail of leadership, security and legal.',
};

export const ALERTS = [
  {
    id: 'mb-spray',
    title: 'Password spray: failed sign-ins from many IP addresses against a tenant',
    severity: 'High',
    rule: 'More than 20 distinct IP addresses with AADSTS50126 (invalid password) against more than 10 accounts in the same tenant within 24 hours, with no more than 3 failures per account.',
    fields: [
      ['Tenant', 'corp-test.onmicrosoft.example'],
      ['Accounts hit', '24 of 41 (plus 2 that do not exist)'],
      ['Distinct source IPs', 'More than 50, all consumer broadband addresses in the US'],
      ['When', 'Mon Jan 8 and Tue Jan 9, spread across the day'],
    ],
    trigger: { when: (st, min) => min >= 8 * 60 + 40 },
    notice: '🚨 SIEM alert (High): password spray against the legacy test tenant',
    chat: [
      'Look at this one first: two sweeps across almost every account in the test tenant. One try per account, every try from a different home address.',
      'That is deliberate. One or two failures per account stays far below Smart Lockout, and a different address each time keeps IP-based rules quiet. Microsoft described the same pattern in its own incident.',
      'Do not stop at the failures. Ask which account succeeded, and which accounts answered with something other than "invalid password".',
    ],
  },
  {
    id: 'mb-grant',
    title: 'OAuth application granted Exchange full_access_as_app',
    severity: 'High',
    rule: 'Audit log: "Add app role assignment to service principal" where AppRole.Value is full_access_as_app (resource: Office 365 Exchange Online). Modeled on the Microsoft Sentinel rule "OAuth application being granted full_access_as_app permission".',
    fields: [
      ['Granted to', 'Azure-Sync-Helper, Exchange-Health-Check, Office-Addin-Telemetry'],
      ['Granted by', 'LabSync-Legacy (an application, not a person)'],
      ['When', 'Wed Jan 10, about 03:52'],
      ['Change ticket', 'None'],
    ],
    trigger: { when: (st, min) => min >= 9 * 60 + 5 },
    notice: '🚨 SIEM alert (High): three new apps granted full_access_as_app',
    chat: [
      'This is the rule the Microsoft guidance suggests. It fired on three new apps at 3:52 on Wednesday morning, and the digest in your inbox says nobody is paged for it.',
      'full_access_as_app lets an app read any mailbox without a user signed in. One grant is a tenant-wide mail reader.',
    ],
  },
  {
    id: 'mb-mail',
    main: true,
    title: 'Applications with app-only access are reading leadership, security and legal mailboxes',
    severity: 'Critical',
    rule: 'MailItemsAccessed through EWS (Client=WebServices) by an application that is not on the approved list, from an address outside the corporate and vendor ranges, to mailboxes in the high-value group (leadership, security, legal).',
    fields: [
      ['Mailboxes', 'r.hallworth, m.sorensen (leadership), i.babatunde (security), l.fontaine (legal)'],
      ['Applications', 'Azure-Sync-Helper, Exchange-Health-Check, Office-Addin-Telemetry'],
      ['Protocol', 'Exchange Web Services, app-only (no user signed in)'],
      ['First seen', 'Wed Jan 10, 04:05; the last read was this morning'],
    ],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= 9 * 60 + 30) || min >= 10 * 60 + 30 },
    notice: '🚨 SIEM alert (Critical): app-only reads of leadership, security and legal mail',
    chat: [
      'This is the one. Three apps nobody here created are reading the mail of the most sensitive people in the company, through EWS, with no user signed in.',
      'Work backward. Who created the apps? Who gave them the role? Which account did that come from? Then look at how that account was reached.',
      'Check the Entra audit log, the Purview MailItemsAccessed records, and the az app and sp lists in the Terminal. Then write the case up at the SOC console.',
    ],
    case: CASE,
  },
];
