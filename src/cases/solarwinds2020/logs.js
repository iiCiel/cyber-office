// Case file: SolarWinds / SUNBURST, December 2020. A RECREATION for a defender's chair: Halcyon Mutual (a stand-in customer of SolarWinds
// Orion) on Monday December 14, 2020, the morning after FireEye (Mandiant) published the SUNBURST analysis.
//
// What the public record documents (FireEye Dec 13 2020 blog; Microsoft MSRC Dec 13 and MSTIC "Solorigate" posts; CISA ED 21-01 and
// AA20-352A; SolarWinds 8-K Dec 14 2020; CrowdStrike SUNSPOT Jan 2021), in the order it happened to a victim like this one:
//   install    A signed, trojanized SolarWinds.Orion.Core.BusinessLayer.dll arrives in an ordinary Orion update (versions released
//              Mar-Jun 2020). The DLL loads inside SolarWinds.BusinessLayerHost.exe and is signed with SolarWinds' certificate.
//   dormant    It waits "up to two weeks" (12 to 14 days) before doing anything.
//   dns        It resolves generated subdomains of avsvmcloud[.]com (a domain generation algorithm: <random>.appsync-api.<region>
//              .avsvmcloud.com). An answer can be a CNAME to a second-stage server; traffic imitates the Orion Improvement Program.
//   hands-on   For a small number of victims the actors loaded a memory-only dropper (TEARDROP) and a Cobalt Strike BEACON, used the
//              stolen credentials to move to the identity servers, stole the SAML token-signing certificate and forged tokens
//              (the "Golden SAML" technique), then added their own credentials to existing Microsoft 365 apps and read mail.
//   disclosure FireEye Dec 13; CISA ED 21-01 told federal agencies to disconnect or power down Orion; SolarWinds 8-K Dec 14.
// What is invented: every host, account, address, app, mailbox, count and the install date (SolarWinds says the compromised builds
// went out between March and June 2020). Log fields follow the vendors' schemas. Dates are real calendar dates; the replay samples
// the months in between (a few DNS beacons per week, fewer in October and November) so the SIEM stays searchable.
//
// Decoys: Orion's own lookups of solarwinds.com from the same process, AWS AppSync lookups from a developer (same "appsync-api" label,
// different domain), Orion's hourly WMI polling with the same service account, the administrator who signs in every day through ADFS,
// the HR-Sync app's nightly sign-in from the office, and a ticketed secret rotation on that same app.

import { T, rng, logBuilder, finishDays } from '../../game/logkit.js';
import { uuid, fakeId, modProp } from '../../game/cloudfmt.js';

export const DATE = { weekday: 'MON', name: 'Monday', month: 'Dec', day: 14, year: 2020, domain: 'halcyonmutual.local', netbios: 'HALCYON' };
const DAY = 86400;
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
// Real calendar date -> case time (day 0 = Mon Dec 14, 2020)
const D = (mon, day, h, m, s = 0) => Math.round((Date.UTC(2020, mon - 1, day) - Date.UTC(2020, 11, 14)) / 86400000) * DAY + T(h, m, s);

export const CORP = 'halcyonmutual.com';
export const TENANT = uuid('tenant-halcyon');
export const AVS = 'avsvmcloud.com';
export const STAGE2 = { ip: '198.51.100.44', host: 'freescanonline.com' };
export const BEACON = { ip: '198.51.100.61', host: 'incomeupdate.com' };
export const VPS = '203.0.113.77';
const ORION = { name: 'ORION01', ip: '192.0.2.25' };
const SYS = 'C:\\Windows\\System32\\';
const ORION_DIR = 'C:\\Program Files (x86)\\SolarWinds\\Orion\\';
const HOST_EXE = `${ORION_DIR}SolarWinds.BusinessLayerHost.exe`;
export const DLL = 'SolarWinds.Orion.Core.BusinessLayer.dll';
// Published by FireEye for the trojanized DLL, file version 2020.2.5300.12432 (compiled May 11 2020); Indicator_Release_Hashes.csv in
// mandiant/sunburst_countermeasures. The better-known 32519b85... sample is the 2019.4.5200.9083 build.
export const DLL_MD5 = '846E27A652A5E1BFBD0DDD38A16DC865';
export const DLL_SHA256 = 'CE77D116A074DAB7A22A0FD4F2C1AB475F16EEC42E1DED3C0B0AA8211FE858D6';

const GRAPH = { appId: '00000003-0000-0000-c000-000000000000', name: 'Microsoft Graph' };
const EXO = { appId: '00000002-0000-0ff1-ce00-000000000000', name: 'Office 365 Exchange Online' };
const appOf = (name, extra = {}) => ({ name, appId: uuid(`app${name}`), spId: uuid(`sp${name}`), objId: uuid(`obj${name}`), ...extra });
export const HRSYNC = appOf('Halcyon-HR-Sync', { created: '2019-02-11T15:08:41Z', ip: '192.0.2.77' });
export const ADMIN = `it.admin01@${CORP}`;
export const MAILBOXES = {
  sec: { upn: `priya.r@${CORP}`, role: 'Security operations lead' },
  infra: { upn: `t.okoye@${CORP}`, role: 'Infrastructure' },
  cfo: { upn: `r.hallworth@${CORP}`, role: 'Executive' },
  legal: { upn: `l.fontaine@${CORP}`, role: 'Legal' },
};

export const STAFF = [
  ['priya.r', 'Priya Raman', 'WS-0107', '192.0.2.101'], ['dana.k', 'Dana Kowalski', 'WS-0120', '192.0.2.102'], ['t.okoye', 'Theo Okoye', 'WS-0127', '192.0.2.103'], ['m.chen', 'Mike Chen', 'WS-0131', '192.0.2.104'],
  ['a.moreau', 'Amelie Moreau', 'WS-0140', '192.0.2.105'], ['b.tanaka', 'Ben Tanaka', 'WS-0146', '192.0.2.106'], ['c.osei', 'Clara Osei', 'WS-0152', '192.0.2.107'], ['d.kowal', 'Dmitri Kowal', 'WS-0158', '192.0.2.108'],
  ['e.ibarra', 'Elena Ibarra', 'WS-0163', '192.0.2.109'], ['h.pereira', 'Hugo Pereira', 'WS-0182', '192.0.2.110'], ['r.hallworth', 'R. Hallworth', 'WS-0190', '192.0.2.111'], ['it.admin01', 'IT Admin 01', 'WS-0112', '192.0.2.112'],
];

export const IP_INFO = {
  '192.0.2.2': { where: 'New York, NY (office egress)', owner: 'Halcyon Mutual office NAT', note: 'Everyone in the building signs in from here.', external: false },
  '192.0.2.10': { where: 'Internal: server VLAN', owner: 'DC01 (domain controller)', note: 'Our domain controller.', external: false },
  '192.0.2.25': { where: 'Internal: server VLAN', owner: 'ORION01 (SolarWinds Orion, network monitoring)', note: 'Runs Orion Platform 2020.2 HF1. Polls about 1,900 devices every few minutes with a domain service account (svc-solarwinds).', external: false },
  '192.0.2.30': { where: 'Internal: server VLAN', owner: 'ADFS01 (identity federation server)', note: 'Issues the SAML tokens that sign everyone in to Microsoft 365. Holds the token-signing certificate.', external: false },
  '192.0.2.40': { where: 'Internal: server VLAN', owner: 'FILE01', note: 'File server.', external: false },
  '192.0.2.53': { where: 'Internal: server VLAN', owner: 'DNS01 (internal resolver)', note: 'Every workstation and server resolves names here; it logs every query.', external: false },
  '192.0.2.77': { where: 'New York, NY', owner: 'Halcyon-HR-Sync server (fixed egress)', note: 'The HR system that runs the HR-Sync app every night at 02:00 with its client secret.', external: false },
  [STAGE2.ip]: { where: 'Internet (documentation range stand-in)', owner: `${STAGE2.host} (SUNBURST second-stage server, published by FireEye)`, note: 'The address here is a stand-in for the real server. FireEye listed this domain as an indicator. Orion has no business talking to it.', external: true },
  [BEACON.ip]: { where: 'Internet (documentation range stand-in)', owner: `${BEACON.host} (BEACON command-and-control, published by FireEye)`, note: 'A Cobalt Strike BEACON server named in FireEye\'s indicators. The address here is a stand-in.', external: true },
  [VPS]: { where: 'Ashburn, Virginia (US)', owner: 'AS64510 ExampleHost VPS (rented server)', note: 'A rented server in the same country as the victim. FireEye and Microsoft both say the actors chose addresses near the victim. No employee, vendor or app of ours uses this address.', external: true },
};
for (const [sam, , ws, ip] of STAFF) IP_INFO[ip] = { where: 'Internal: office', owner: `${ws} (${sam})`, note: 'A workstation on the office subnet.', external: false };

// ------------------------------------------------------------------------------------------------ small helpers
const hashN = (s) => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
const sysU = (st, t) => `${st.iso.slice(0, 10)} ${st.iso.slice(11, 19)}.${String(100 + (hashN(`${st.iso}${t}`) % 899))}`;
const pguid = (seed) => {
  const h = fakeId(`pg${seed}`, 32, '0123456789abcdef');
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}}`;
};
const p2 = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOf = (t) => { const d = Math.floor(t / DAY); return { d, s: t - d * DAY, dt: new Date(Date.UTC(2020, 11, 14 + d)) }; };
const usStamp = (t) => { const { s, dt } = dateOf(t); const h = Math.floor(s / 3600); return `${p2(dt.getUTCMonth() + 1)}/${p2(dt.getUTCDate())}/2020 ${p2(h % 12 === 0 ? 12 : h % 12)}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)} ${h < 12 ? 'AM' : 'PM'}`; };
const namedStamp = (t, ms) => { const { s, dt } = dateOf(t); return `${p2(dt.getUTCDate())}-${MON[dt.getUTCMonth()]}-2020 ${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}.${String(ms).padStart(3, '0')}`; };

// SUNBURST's generated names look like <20 random characters>.appsync-api.<region>.avsvmcloud.com
const DGA_ALPHA = 'ph2eifo3n5utg1j8d94qrvbmk0sal76c';
const REGIONS = ['us-east-2', 'us-west-2', 'eu-west-1', 'us-east-1'];
const dga = (i) => {
  const r = rng(9100 + i);
  let s = '';
  for (let k = 0; k < 20; k++) s += DGA_ALPHA[Math.floor(r() * DGA_ALPHA.length)];
  return `${s}.appsync-api.${REGIONS[i % REGIONS.length]}.${AVS}`;
};

const spSigninRecord = (st, o) => ({
  id: uuid(`sps${st.iso}${o.app.name}${o.ip}`),
  createdDateTime: st.iso,
  appId: o.app.appId,
  appDisplayName: o.app.name,
  servicePrincipalId: o.app.spId,
  servicePrincipalName: o.app.name,
  ipAddress: o.ip,
  resourceDisplayName: (o.resource || GRAPH).name,
  resourceId: uuid(`res${(o.resource || GRAPH).name}`),
  servicePrincipalCredentialKeyId: uuid(`key${o.app.name}${o.keyGen || 0}`),
  clientCredentialType: o.credType || 'clientSecret',
  status: { errorCode: 0, failureReason: 'Other.', additionalDetails: null },
  conditionalAccessStatus: 'notApplied',
  appliedConditionalAccessPolicies: [],
  correlationId: uuid(`spc${st.iso}${o.app.name}${o.ip}`),
  location: { city: o.geo?.city || 'New York', state: o.geo?.state || 'New York', countryOrRegion: 'US', geoCoordinates: { latitude: o.geo?.lat || 40.71, longitude: o.geo?.lon || -74.0 } },
  signInEventTypes: ['servicePrincipal'],
  homeTenantId: TENANT,
  resourceTenantId: TENANT,
  isInteractive: false,
});

const msgId = (seed) => `<${fakeId(`mi${seed}`, 12, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}.${fakeId(`mj${seed}`, 8, '0123456789abcdef')}@BN7PR12MB.namprd12.prod.outlook.com>`;
function mailFields(o) {
  const ids = [];
  for (let i = 0; i < o.count; i++) ids.push({ InternetMessageId: msgId(`${o.seed}${i}`) });
  return {
    OrganizationName: 'halcyonmutual.onmicrosoft.com',
    OriginatingServer: 'BN7PR12MB2897 (15.20.3654.020)',
    Version: 1,
    ClientInfoString: 'Client=REST;Client=RESTSystem;;',
    ClientIPAddress: o.ip,
    SessionId: uuid(`sess${o.seed}`),
    ExternalAccess: false,
    InternalLogonType: 0,
    LogonType: 0,
    MailboxGuid: uuid(`mbx${o.mailbox}`),
    MailboxOwnerUPN: o.mailbox,
    OperationProperties: [{ Name: 'MailAccessType', Value: 'Bind' }, { Name: 'IsThrottled', Value: 'False' }],
    OperationCount: o.count,
    Folders: [{ Path: o.folder || '\\Inbox', FolderItems: ids }],
    AppAccessContext: { AADSessionId: uuid(`aad${o.seed}`), ClientAppId: HRSYNC.appId, APIId: GRAPH.appId, UniqueTokenId: fakeId(`tok${o.seed}`, 22, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_') },
  };
}

// ------------------------------------------------------------------------------------------------ the logs
export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2020);
  const { r, pick } = b;
  const jitter = (n) => Math.floor(r() * n);

  // ---- helpers that need the builder
  let rec = 7000000;
  const dnsQ = (t, client, name, extra = {}) => {
    const port = 49152 + jitter(16000);
    const tail = `client @0x7f2c1c0a1d90 ${client}#${port} (${name}): query: ${name} IN A + (192.0.2.53)`;
    return b.add(t, 'dns01', 'dns', `named[1042]: ${tail}`, { raw: `${namedStamp(t, jitter(900))} queries: info: ${tail}`, index: 'network', sourcetype: 'isc:bind:query', srcpath: '/var/log/named/queries.log', ip: client, ...extra });
  };
  const sysmon22 = (t, host, o, extra = {}) => b.sysmon(t, host, 22, (st) => [
    ['RuleName', '-'], ['UtcTime', sysU(st, t)], ['ProcessGuid', pguid(`${host}${o.image}`)], ['ProcessId', o.pid ?? 4120], ['QueryName', o.name], ['QueryStatus', o.status ?? '0'],
    ['QueryResults', o.results], ['Image', o.image], ['User', o.user || 'NT AUTHORITY\\SYSTEM'],
  ], { user: (o.user || 'SYSTEM').split('\\').pop(), ...extra });
  const sysmon7 = (t, host, o, extra = {}) => b.sysmon(t, host, 7, (st) => [
    ['RuleName', '-'], ['UtcTime', sysU(st, t)], ['ProcessGuid', pguid(`${host}${o.image}`)], ['ProcessId', 4120], ['Image', o.image], ['ImageLoaded', o.loaded], ['FileVersion', o.version],
    ['Description', o.description], ['Product', o.product], ['Company', o.company], ['OriginalFileName', o.original],
    ['Hashes', `MD5=${o.md5},SHA256=${o.sha256}`], ['Signed', 'true'], ['Signature', o.signature], ['SignatureStatus', 'Valid'], ['User', 'NT AUTHORITY\\SYSTEM'],
  ], extra);
  const adfs1200 = (t, user, ip, extra = {}) => {
    const msg = `AD FS Auditing EventCode=1200 The Federation Service issued a valid token user=${user} client_ip=${ip} relying_party=urn:federation:MicrosoftOnline`;
    const raw = [usStamp(t), 'LogName=Security', 'EventCode=1200', 'EventType=0', 'ComputerName=ADFS01.halcyonmutual.local', 'SourceName=AD FS Auditing', 'Type=Information', `RecordNumber=${rec++}`, 'Keywords=Audit Success', 'TaskCategory=None', 'OpCode=Info',
      `Message=The Federation Service issued a valid token. See XML for audit details.\nAuditType: Successful, Client: ${ip}, Resource: urn:federation:MicrosoftOnline, User: HALCYON\\${user}, TokenType: urn:oasis:names:tc:SAML:1.0:assertion, IssuerId: http://sts.halcyonmutual.com/adfs/services/trust`].join('\n');
    return b.add(t, 'adfs01', 'Security', msg, { raw, index: 'wineventlog', sourcetype: 'WinEventLog:Security', srcpath: 'WinEventLog:Security', user, ip, ...extra });
  };
  const defenderHit = (t, host, name, file, extra = {}) => {
    const msg = `EventCode=1116 LogName="Microsoft-Windows-Windows Defender/Operational" ComputerName=${host.toUpperCase()}.halcyonmutual.local Message="Microsoft Defender Antivirus has detected malware: ${name} file: ${file}"`;
    const raw = [usStamp(t), 'LogName=Microsoft-Windows-Windows Defender/Operational', 'EventCode=1116', 'EventType=3', `ComputerName=${host.toUpperCase()}.halcyonmutual.local`, 'SourceName=Microsoft-Windows-Windows Defender', 'Type=Warning', `RecordNumber=${rec++}`, 'Keywords=None', 'TaskCategory=None', 'OpCode=Info',
      `Message=Microsoft Defender Antivirus has detected malware or other potentially unwanted software.\n For more information please see the following:\n Name: ${name}\n Severity: Severe\n Category: Trojan\n Path: file:_${file}\n Detection Origin: Local machine\n Detection Type: Concrete\n Detection Source: Real-Time Protection\n User: NT AUTHORITY\\SYSTEM\n Process Name: ${HOST_EXE}\n Security intelligence Version: AV: 1.327.1695.0, AS: 1.327.1695.0`].join('\n');
    return b.add(t, host, 'defender', msg, { raw, index: 'endpoint', sourcetype: 'WinEventLog:Microsoft-Windows-Windows Defender/Operational', srcpath: 'WinEventLog:Microsoft-Windows-Windows Defender/Operational', ...extra });
  };
  const spSignin = (t, o, extra = {}) => b.record(t, 'entra-id', 'entra-signin',
    `ServicePrincipalSignInLogs app="${o.app.name}" ip=${o.ip} result=Success errorCode=0 resource="${(o.resource || GRAPH).name}" credential=${o.credType || 'clientSecret'}`,
    (st) => spSigninRecord(st, o), { user: o.app.name, ip: o.ip, sp: true, ...extra });
  const readMail = (t, o, extra = {}) => b.ual(t, {
    op: 'MailItemsAccessed', type: 'ExchangeItemAggregated', workload: 'Exchange', user: o.mailbox, ip: o.ip, app: HRSYNC.name, appId: HRSYNC.appId, userType: 0,
    fields: mailFields({ seed: `${o.mailbox}${t}`, mailbox: o.mailbox, ip: o.ip, count: o.count, folder: o.folder }),
  }, extra);
  const fedSignin = (t, o, extra = {}) => b.signin(t, {
    tenant: 'halcyon', mfa: false, authReq: 'singleFactor', protocol: 'none', ...o,
    authDetails: [{ authenticationStepDateTime: undefined, authenticationMethod: 'Previously satisfied', authenticationMethodDetail: 'Federated authentication (ADFS)', succeeded: true, authenticationStepResultDetail: 'First factor requirement satisfied by claim in the token', authenticationStepRequirement: 'Primary authentication' }],
    extra: { tokenIssuerType: 'ADFederationServices', tokenIssuerName: 'http://sts.halcyonmutual.com/adfs/services/trust' },
  }, extra);

  // ====================================================================================================== ordinary life (Thu Dec 10 - Mon Dec 14)
  const NY = { city: 'New York', state: 'New York', country: 'US', lat: 40.71, lon: -74.0 };
  const OFFICE_UA = 'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.13127; Pro)';
  const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
  const SITES = ['outlook.office365.com', 'login.microsoftonline.com', 'teams.microsoft.com', 'www.google.com', 'github.com', 'slack.com', 'sts.halcyonmutual.com', 'fonts.gstatic.com', 'update.googleapis.com', 'ctldl.windowsupdate.com', 'graph.microsoft.com'];
  STAFF.forEach(([sam, name, ws, ip], idx) => {
    for (let d = -4; d <= 0; d++) {
      const arrive = A(d, 7, 20) + idx * 210 + jitter(900);
      if (d === 0 && arrive > A(0, 8, 0)) continue;
      // every cloud sign-in comes through ADFS, and ADFS writes a 1200 for each one (this is what a forged token will lack)
      for (const [dt, app, appId, ua, interactive] of [[0, 'Microsoft Office', 'd3590ed6-52b3-4102-aeff-aad2292ab01c', OFFICE_UA, true], [180 + jitter(300), 'Microsoft Teams', '1fec8e78-bce4-4aaf-ab1b-5451cc387264', WEB_UA, false]]) {
        const at = arrive + dt;
        fedSignin(at, { upn: `${sam}@${CORP}`, display: name, ip: '192.0.2.2', app, appId, client: 'Mobile Apps and Desktop clients', ua, interactive, deviceName: ws, managed: true, compliant: true, trust: 'Hybrid Azure AD joined', geo: NY }, { noise: true, key: sam === 'it.admin01' && d === -4 && dt === 0 ? 'decoy-admin-signin' : undefined });
        adfs1200(at - 1, sam, '192.0.2.2', { noise: true, key: sam === 'it.admin01' && d === -4 && dt === 0 ? 'decoy-adfs-1200' : undefined });
      }
      for (let k = 0; k < 8; k++) dnsQ(arrive + 20 + k * 1500 + jitter(900), ip, pick(SITES), { noise: true });
    }
  });
  // decoy: a developer resolves AWS AppSync names. Same "appsync-api" label as SUNBURST, a different domain.
  for (let d = -4; d <= 0; d++) {
    for (let k = 0; k < 3; k++) {
      const t = A(d, 10 + k * 2, 15) + jitter(1200);
      if (d === 0 && t > A(0, 8, 0)) continue;
      dnsQ(t, '192.0.2.110', `${fakeId(`aws${d}${k}`, 26, 'abcdefghijklmnopqrstuvwxyz234567')}.appsync-api.us-east-1.amazonaws.com`, { noise: true, key: d === -4 && k === 0 ? 'decoy-appsync' : undefined });
    }
  }
  // decoy: Orion's own, legitimate, lookups of solarwinds.com from the same process that SUNBURST lives in
  for (let d = -4; d <= 0; d++) {
    for (const [h, name] of [[3, 'downloads.solarwinds.com'], [15, 'www.solarwinds.com']]) {
      const t = A(d, h, 5, 12 + jitter(40));
      if (d === 0 && t > A(0, 8, 0)) continue;
      sysmon22(t, 'orion01', { name, results: 'type:  5 solarwinds.com.cdn.cloudflare.net;::ffff:198.51.100.200;', image: HOST_EXE }, { noise: true, key: d === -4 && h === 3 ? 'decoy-orion-legit' : undefined });
      dnsQ(t, ORION.ip, name, { noise: true });
    }
  }
  // decoy: Orion polls servers over WMI every hour with its service account (network logons, never interactive)
  for (let d = -4; d <= 0; d++) {
    for (let h = 0; h < 24; h += 2) {
      const t = A(d, h, 20, 5 + jitter(40));
      if (t > A(0, 8, 0)) continue;
      b.win(t, 'file01', 4624, { user: 'svc-solarwinds', ip: ORION.ip, ws: ORION.name, type: 3, logonId: b.logonId() }, { noise: true, key: d === -4 && h === 0 ? 'decoy-orion-poll' : undefined });
    }
  }
  // decoy: HR-Sync signs in at 02:00 from the HR server with its client secret, and its secret was rotated under a ticket on Dec 9
  for (let d = -4; d <= 0; d++) spSignin(A(d, 2, 0, 4 + jitter(20)), { app: HRSYNC, ip: HRSYNC.ip, keyGen: 1 }, { noise: true, key: d === -4 ? 'decoy-hrsync' : undefined });
  b.audit(A(-5, 10, 14, 30), {
    activity: 'Update application - Certificates and secrets management', category: 'ApplicationManagement', by: { upn: `dana.k@${CORP}`, ip: '192.0.2.2' }, op: 'Update',
    targets: [{ name: HRSYNC.name, type: 'Application', id: HRSYNC.objId, props: [modProp('KeyDescription', '[KeyIdentifier=' + uuid('key-hr-old') + ';KeyType=Password;KeyUsage=Verify;DisplayName=hr-2019]', '[KeyIdentifier=' + uuid('key-hr-new') + ';KeyType=Password;KeyUsage=Verify;DisplayName=hr-2020]')] }],
    details: [{ key: 'User-Agent', value: WEB_UA }],
  }, { noise: true, key: 'decoy-secret-rotation' });
  // the app has always held Mail.Read, from an onboarding feature nobody uses any more
  b.audit(A(-5, 10, 2, 11), {
    activity: 'Add app role assignment to service principal', category: 'ApplicationManagement', by: { upn: `dana.k@${CORP}`, ip: '192.0.2.2' }, op: 'Assign',
    targets: [{ name: HRSYNC.name, type: 'ServicePrincipal', id: HRSYNC.spId, props: [modProp('AppRole.Value', null, 'Mail.Read'), modProp('AppRole.DisplayName', null, 'Read mail in all mailboxes'), modProp('ServicePrincipal.DisplayName', null, HRSYNC.name)] }, { name: GRAPH.name, type: 'ServicePrincipal', id: uuid(`ressp${GRAPH.name}`), props: [] }],
    details: [{ key: 'User-Agent', value: WEB_UA }],
  }, { noise: true, key: 'decoy-mailread-grant' });

  // ====================================================================================================== 1. the trojanized update (Tue May 19)
  const tInstall = D(5, 19, 21, 10, 14);
  b.sysmon11(tInstall, 'orion01', { user: 'NT AUTHORITY\\SYSTEM', image: `${SYS}msiexec.exe`, file: `${ORION_DIR}${DLL}` }, { attack: true, key: 'orion-install' });
  sysmon7(tInstall + 95, 'orion01', {
    image: HOST_EXE, loaded: `${ORION_DIR}${DLL}`, version: '2020.2.5300.12432', description: 'SolarWinds.Orion.Core.BusinessLayer', product: 'SolarWinds Orion', company: 'SolarWinds Worldwide, LLC', original: DLL,
    md5: DLL_MD5, sha256: DLL_SHA256, signature: 'SolarWinds Worldwide, LLC',
  }, { attack: true, key: 'dll-signed' });

  // ====================================================================================================== 2. dormant 13 days, then the first lookup (Tue Jun 2)
  let n = 0;
  const beacon = (t, extra = {}) => {
    const name = dga(n++);
    const answered = n % 3 !== 0;
    sysmon22(t, 'orion01', { name, results: answered ? `type:  5 ${STAGE2.host};::ffff:${STAGE2.ip};` : 'type:  1 ::ffff:198.51.100.7;', image: HOST_EXE }, { attack: true, ...extra });
    dnsQ(t + 1, ORION.ip, name, { attack: true });
    return name;
  };
  const tFirst = D(6, 2, 10, 42, 31);
  beacon(tFirst, { key: 'first-dga' });
  b.sysmon3(tFirst + 6, 'orion01', { user: 'NT AUTHORITY\\SYSTEM', image: HOST_EXE, srcIp: ORION.ip, dstIp: STAGE2.ip, dstPort: 443, dstHost: STAGE2.host, dstPortName: 'https', rule: '-' }, { attack: true, key: 'orion-c2-https' });
  // a few lookups a week afterwards (the replay samples the months; October 8 to December 9 is added at the end of the build)
  const weeks = [];
  for (let m = 6; m <= 10; m++) for (const dd of [4, 9, 15, 21, 26]) { if (m === 6 && dd < 4) continue; if (m === 10 && dd > 7) continue; weeks.push([m, dd]); }
  for (const [m, dd] of weeks) {
    const t = D(m, dd, 9 + jitter(10), jitter(60), jitter(60));
    beacon(t);
    b.sysmon3(t + 4, 'orion01', { user: 'NT AUTHORITY\\SYSTEM', image: HOST_EXE, srcIp: ORION.ip, dstIp: STAGE2.ip, dstPort: 443, dstHost: STAGE2.host, dstPortName: 'https', rule: '-' }, { attack: true });
  }

  // ====================================================================================================== 3. hands on keyboard (Thu Oct 8, 02:10 - 04:30)
  const dropT = D(10, 8, 2, 10, 22);
  b.sysmon11(dropT, 'orion01', { user: 'NT AUTHORITY\\SYSTEM', image: HOST_EXE, file: 'C:\\Windows\\SysWOW64\\netsetupsvc.dll' }, { attack: true, key: 'teardrop-drop' });
  b.sysmon11(dropT + 3, 'orion01', { user: 'NT AUTHORITY\\SYSTEM', image: HOST_EXE, file: 'C:\\Windows\\SysWOW64\\gracious_truth.jpg' }, { attack: true });
  b.sysmon3(dropT + 140, 'orion01', { user: 'NT AUTHORITY\\SYSTEM', image: 'C:\\Windows\\SysWOW64\\svchost.exe', srcIp: ORION.ip, dstIp: BEACON.ip, dstPort: 443, dstHost: BEACON.host, dstPortName: 'https', rule: '-' }, { attack: true, key: 'beacon-c2' });
  dnsQ(dropT + 138, ORION.ip, BEACON.host, { attack: true });
  // the Orion service account, which has never opened a remote desktop session, opens one from ORION01 to ADFS01
  const rdp = b.win(D(10, 8, 2, 31, 9), 'adfs01', 4624, { user: 'svc-solarwinds', ip: ORION.ip, ws: ORION.name, type: 10, logonId: b.logonId() }, { attack: true, key: 'rdp-adfs' });
  void rdp;
  b.win(D(10, 8, 2, 31, 12), 'adfs01', 4672, { user: 'svc-solarwinds' }, { attack: true });
  // the domain's key for the ADFS signing certificate lives in a contact object in the ADFS container (the technique FireEye's ADFSDump tool automates)
  b.win(D(10, 8, 2, 38, 44), 'adfs01', 4104, {
    user: 'svc-solarwinds',
    script: "Get-ADObject -Properties thumbnailPhoto -SearchBase 'CN=ADFS,CN=Microsoft,CN=Program Data,DC=halcyonmutual,DC=local' -Filter 'ObjectClass -eq \"contact\" -and name -ne \"CryptoPolicy\"' | Select-Object -ExpandProperty thumbnailPhoto",
  }, { attack: true, key: 'dkm-read' });
  b.win(D(10, 8, 2, 41, 2), 'adfs01', 4104, { user: 'svc-solarwinds', script: "Get-AdfsCertificate -CertificateType Token-Signing | Select-Object Thumbprint, NotAfter, IsPrimary" }, { attack: true });
  // 03:20 a SAML token that no ADFS server issued: a federated sign-in as the Global Administrator, from a rented server, with no 1200 on ADFS01
  const tForge = D(10, 8, 3, 20, 51);
  fedSignin(tForge, { upn: ADMIN, display: 'IT Admin 01', ip: VPS, app: 'Azure Portal', appId: 'c44b4083-3bb0-49c1-b47d-974e53cbdf3c', client: 'Browser', ua: WEB_UA, resource: 'Windows Azure Active Directory', geo: { city: 'Ashburn', state: 'Virginia', country: 'US', lat: 39.04, lon: -77.49 } }, { attack: true, key: 'forged-signin' });
  fedSignin(tForge + 70, { upn: ADMIN, display: 'IT Admin 01', ip: VPS, app: 'Azure Portal', appId: 'c44b4083-3bb0-49c1-b47d-974e53cbdf3c', client: 'Browser', ua: WEB_UA, resource: 'Microsoft Graph', interactive: false, geo: { city: 'Ashburn', state: 'Virginia', country: 'US', lat: 39.04, lon: -77.49 } }, { attack: true });
  // then a certificate added to an app that already holds Mail.Read
  const tCred = D(10, 8, 3, 34, 40);
  const CERT_KEY = uuid('key-attacker-cert');
  b.audit(tCred, {
    activity: 'Add service principal credentials', category: 'ApplicationManagement', by: { upn: ADMIN, ip: VPS }, op: 'Update',
    targets: [{ name: HRSYNC.name, type: 'ServicePrincipal', id: HRSYNC.spId, props: [modProp('KeyDescription', null, '[KeyIdentifier=' + CERT_KEY + ';KeyType=AsymmetricX509Cert;KeyUsage=Verify;DisplayName=CN=halcyon-hrsync]')] }],
    details: [{ key: 'User-Agent', value: WEB_UA }],
  }, { attack: true, key: 'sp-cred-add' });
  b.audit(tCred + 9, {
    activity: 'Update application - Certificates and secrets management', category: 'ApplicationManagement', by: { upn: ADMIN, ip: VPS }, op: 'Update',
    targets: [{ name: HRSYNC.name, type: 'Application', id: HRSYNC.objId, props: [modProp('KeyDescription', null, '[KeyIdentifier=' + CERT_KEY + ';KeyType=AsymmetricX509Cert;KeyUsage=Verify;DisplayName=CN=halcyon-hrsync]')] }],
    details: [{ key: 'User-Agent', value: WEB_UA }],
  }, { attack: true, key: 'app-cert-update' });
  spSignin(tCred + 300, { app: HRSYNC, ip: VPS, geo: { city: 'Ashburn', state: 'Virginia', lat: 39.04, lon: -77.49 }, credType: 'certificate', keyGen: 77 }, { attack: true, key: 'sp-signin-attacker' });

  // ====================================================================================================== 4. reading mail (Oct 8 - Dec 12; the replay samples sessions)
  const sessions = [
    [D(10, 8, 3, 52), 'sec'], [D(10, 8, 4, 10), 'cfo'], [D(10, 14, 3, 30), 'infra'], [D(10, 22, 4, 5), 'sec'], [D(12, 1, 3, 12), 'legal'], [D(12, 2, 3, 40), 'cfo'],
    [D(12, 8, 4, 2), 'sec'], [D(12, 9, 3, 55), 'infra'], [D(12, 11, 4, 18), 'sec'], [D(12, 12, 3, 48), 'cfo'],
  ];
  sessions.forEach(([t, who], i) => {
    spSignin(t - 20, { app: HRSYNC, ip: VPS, geo: { city: 'Ashburn', state: 'Virginia', lat: 39.04, lon: -77.49 }, credType: 'certificate', keyGen: 77 }, { attack: true });
    for (let k = 0; k < 3; k++) {
      const key = i === 0 && k === 0 ? 'mail-read-sec' : i === 1 && k === 0 ? 'mail-read-cfo' : undefined;
      readMail(t + k * 150, { mailbox: MAILBOXES[who].upn, ip: VPS, count: 8 + jitter(30), folder: ['\\Inbox', '\\Sent Items', '\\Inbox\\Vendors'][k] }, { attack: true, key });
    }
  });

  // ====================================================================================================== 5. the last week (more lookups, and the lights come on)
  for (let d = -4; d <= 0; d++) {
    for (const h of [1, 7, 13, 19]) {
      const t = A(d, h, 10 + jitter(40), jitter(60));
      if (t > A(0, 8, 0)) continue;
      beacon(t);
    }
  }
  // Defender's new signatures land overnight and name the DLL
  defenderHit(A(0, 4, 12, 40), 'orion01', 'Trojan:MSIL/Solorigate.BR!dha', `${ORION_DIR}${DLL}`, { attack: true, key: 'defender-detect' });

  // ====================================================================================================== 6. the quiet autumn (Oct 12 - Dec 9)
  // Built last so the generated names and jitter of everything above stay the same. The US clocks fall back on Sun Nov 1,
  // so from then on the UTC times in the cloud and DNS records are five hours ahead of the office instead of four.
  for (const [m, dd] of [[10, 12], [10, 19], [10, 26], [11, 2], [11, 9], [11, 16], [11, 23], [11, 30], [12, 4], [12, 9]].filter(([m, dd]) => m < 12 || dd < 10)) {
    const t = D(m, dd, 9 + jitter(10), jitter(60), jitter(60));
    beacon(t);
    b.sysmon3(t + 4, 'orion01', { user: 'NT AUTHORITY\\SYSTEM', image: HOST_EXE, srcIp: ORION.ip, dstIp: STAGE2.ip, dstPort: 443, dstHost: STAGE2.host, dstPortName: 'https', rule: '-' }, { attack: true });
  }
  [[D(11, 5, 3, 41), 'sec'], [D(11, 18, 4, 7), 'cfo']].forEach(([t, who]) => {
    spSignin(t - 20, { app: HRSYNC, ip: VPS, geo: { city: 'Ashburn', state: 'Virginia', lat: 39.04, lon: -77.49 }, credType: 'certificate', keyGen: 77 }, { attack: true });
    for (let k = 0; k < 2; k++) readMail(t + k * 150, { mailbox: MAILBOXES[who].upn, ip: VPS, count: 8 + jitter(30), folder: ['\\Inbox', '\\Sent Items'][k] }, { attack: true });
  });

  return finishDays(b.ev, { nowMinutes, date: DATE });
}

// ---------------------------------------------------------------------------------------------- the case
export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'A signed update, a quiet DNS lookup, and a forged login',
  max: 40,
  question: 'Was ORION01 only a monitoring server, or did the SUNBURST backdoor lead further in? What has to be done?',
  teaches: { skill: 'Follow a supply-chain backdoor from a DNS indicator to the identity systems it was used to reach', secplus: '4.9 Use data sources: DNS, Sysmon, Entra sign-in and audit logs; 2.3 Supply-chain vulnerabilities; 4.8 Incident response' },
  verdicts: [
    { id: 'supply-chain', text: 'ORION01 is running the trojanized SolarWinds update (SUNBURST). It beaconed to avsvmcloud.com and a second-stage server, the actors reached the ADFS server with the Orion service account, stole the token-signing certificate, forged a sign-in as an administrator, added a certificate to an app that holds Mail.Read, and have been reading mail with it.' },
    { id: 'false-positive', text: 'Orion talks to the internet all the time. The DNS alert is a false positive from Orion\'s own telemetry.' },
    { id: 'orion-exploit', text: 'Someone exploited a vulnerability in the Orion web console and planted a backdoor.' },
    { id: 'admin-phished', text: 'The Global Administrator\'s password was phished and used to sign in.' },
    { id: 'insider', text: 'An insider with administrator rights added the certificate to the HR-Sync app.' },
  ],
  correctVerdict: 'supply-chain',
  wrongVerdictNotes: {
    'false-positive': 'Orion does look up solarwinds.com every day (see the 03:05 and 15:05 lookups), and that is the decoy. The avsvmcloud.com names are different: 20 random characters under appsync-api.<region>.avsvmcloud.com, the generated names FireEye published as SUNBURST\'s. And what follows is not telemetry: HTTPS to freescanonline.com, then a service account opening a remote desktop session to the ADFS server.',
    'orion-exploit': 'Nothing here exploits the Orion console. The code arrived inside a signed DLL that SolarWinds itself shipped (SolarWinds.Orion.Core.BusinessLayer.dll, signature valid) and was installed by an ordinary update. That is the point of a supply-chain attack: the vendor\'s own certificate vouches for it.',
    'admin-phished': 'There is no phishing mail, no failed or unusual password prompt and no password in this chain. The sign-in is a SAML token that ADFS01 never issued: there is no AD FS Auditing 1200 for it. A phished password would have produced one. The actors made the token themselves with the stolen signing certificate (the "Golden SAML" technique), so resetting the administrator\'s password changes nothing.',
    insider: 'The administrator signs in every day from the office through ADFS, and each of those sign-ins has a matching 1200 on ADFS01. The 03:20 sign-in came from a rented server in Ashburn with no 1200 behind it. No insider needs a forged token.',
  },
  actions: [
    { id: 'preserve', text: 'Take a memory and disk image of ORION01 and ADFS01, and export the DNS, Sysmon, ADFS and Entra logs, before changing anything', good: true },
    { id: 'isolate-orion', text: 'Disconnect ORION01 from the network (as CISA ED 21-01 directs for affected Orion servers), block its outbound traffic and the avsvmcloud.com names, and do not rejoin it', good: true },
    { id: 'creds', text: 'Treat every credential Orion stored or used as stolen: svc-solarwinds, SNMP and WMI credentials, device logins and API keys. Rotate them and hunt for their use', good: true },
    { id: 'saml', text: 'Rotate the ADFS token-signing and decryption certificates (twice), revoke refresh tokens, and review ADFS01 for tools and tampering', good: true },
    { id: 'apps', text: 'List every app and service principal credential (az ad app/sp credential list), remove the certificate on Halcyon-HR-Sync that nobody ticketed, and remove Mail.Read where it is not needed', good: true },
    { id: 'hunt', text: 'Hunt for the same activity elsewhere: other hosts that Orion\'s account touched, other Orion servers, mailbox reads by apps, and sign-ins with federated tokens that have no ADFS 1200', good: true },
    { id: 'rebuild', text: 'Rebuild ORION01 from clean media on a patched version, and only reconnect it with a tight egress allowlist and a least-privilege account', good: true },
    { id: 'notify', text: 'Tell the CISO and Legal now, tell the mailbox owners, and prepare for a notification decision; follow the vendor\'s and CISA\'s updates', good: true },
    { id: 'upgrade-only', text: 'Install the SolarWinds hotfix on ORION01 and mark the incident as remediated', good: false, why: 'Upgrading replaces the DLL. It does not remove what the actors did after the DLL called home: the beacon, the stolen signing certificate, the certificate on the app. SolarWinds and CISA both said that the hotfix is not a cleanup.' },
    { id: 'block-domain', text: 'Block avsvmcloud.com at the DNS server and close the case', good: false, why: 'Blocking the generated domain stops the first stage from finding its server, which is useful, but the actors were already past it: a BEACON on incomeupdate.com, a stolen certificate and an app that signs in from a rented server. None of them uses avsvmcloud.com. Block it as part of the fix, not as the fix.' },
    { id: 'reset-admin', text: 'Reset the Global Administrator\'s password and enforce MFA for that account', good: false, why: 'The forged token never used the password. A SAML assertion signed with the stolen certificate is accepted whatever the password or MFA state. Resetting it changes nothing until the signing certificate is rotated.' },
    { id: 'wipe-now', text: 'Uninstall Orion and reboot ORION01 right now to be safe', good: false, why: 'A reboot loses the memory-only dropper (TEARDROP) and the BEACON that FireEye describes, and removing the software does not remove the stolen credentials. Image first, then isolate.' },
  ],
  primaryEvidence: { key: 'forged-signin', note: 'The key line: a federated sign-in as it.admin01, from a rented server in Ashburn, in the Entra sign-in log. Look for an AD FS Auditing 1200 on ADFS01 at the same second (every real sign-in has one). There is none: ADFS never issued that token. Someone signed it themselves.' },
  keyEvidence: ['dll-signed', 'first-dga', 'orion-c2-https', 'teardrop-drop', 'beacon-c2', 'rdp-adfs', 'dkm-read', 'forged-signin', 'sp-cred-add', 'sp-signin-attacker', 'mail-read-sec', 'defender-detect'],
  containedRequires: ['isolate-orion', 'saml'],
  costs: {
    contained: { amount: 1400000, text: 'Incident response, rebuilding the monitoring platform, rotating certificates and credentials, and a mailbox review (estimate for this recreation)' },
    breach: { amount: 14000000, text: 'The actors keep a forged-token foothold in the cloud tenant for months, mail and credentials are taken, and regulators and customers are involved (estimate for this recreation)' },
  },
  perfectWhy: 'Right order: keep the evidence, disconnect the Orion server, treat what it knew as stolen, rotate the ADFS signing certificate, clean the app, and hunt for the rest. CISA\'s emergency directive said the same: disconnect or power down, then rebuild and reset credentials, and assume the actors may still be in.',
  notSubmittedWhy: 'Nobody wrote it up. ORION01 is still online, the signing certificate is still in the actors\' hands, and the app still accepts their certificate.',
};

export const ALERTS = [
  {
    id: 'sw-dns',
    title: 'DNS query to a published SUNBURST indicator (avsvmcloud.com)',
    severity: 'High',
    rule: 'Internal DNS query log: any query for *.avsvmcloud.com (FireEye indicator list, Dec 13 2020).',
    fields: [
      ['Source host', 'ORION01 (192.0.2.25), process SolarWinds.BusinessLayerHost.exe'],
      ['Queries (last 5 days)', '18, from the same host and process'],
      ['Indicator source', 'FireEye / Mandiant SUNBURST write-up, Dec 13 2020'],
      ['First seen in the log', 'Jun 2, 2020 (the log goes back that far)'],
    ],
    trigger: { when: (st, min) => min >= 8 * 60 + 15 },
    notice: '🚨 SIEM alert (High): ORION01 resolves avsvmcloud.com',
    chat: [
      'This is the one the whole industry is looking at this morning. FireEye published the indicators last night, and our resolver just matched one: ORION01, the SolarWinds server.',
      'Do not trust the process name. SolarWinds.BusinessLayerHost.exe also looks up solarwinds.com, which is normal. What is different here is the name: twenty random characters under appsync-api.<region>.avsvmcloud.com.',
      'Ask what else that process has done since the first lookup.',
    ],
  },
  {
    id: 'sw-cred',
    title: 'Credentials added to a service principal by an administrator from a non-corporate address',
    severity: 'High',
    rule: 'Audit log: "Add service principal credentials" or "Update application - Certificates and secrets management" with no change ticket, or initiated from an IP outside the corporate ranges.',
    fields: [
      ['App', 'Halcyon-HR-Sync (holds Mail.Read)'],
      ['Done by', 'it.admin01 (Global Administrator)'],
      ['From', '203.0.113.77 (Ashburn, a rented server)'],
      ['Change ticket', 'None; the ticketed rotation was Dec 9, by Dana, from the office'],
    ],
    trigger: { when: (st, min) => min >= 9 * 60 + 5 },
    notice: '🚨 SIEM alert (High): certificate added to Halcyon-HR-Sync',
    chat: [
      'Microsoft and CISA both say this is what the actors do after they have a foothold: add their own credentials to an app that already has mail permissions, so they can sign in as the app. No user in the loop, and nothing to reset.',
      'There is a ticketed secret rotation on the same app on Dec 9. Compare who, from where, and what kind of credential.',
    ],
  },
  {
    id: 'sw-saml',
    main: true,
    title: 'Federated sign-in with no matching ADFS token, followed by app-only mail reads',
    severity: 'Critical',
    rule: 'Entra sign-in with tokenIssuerType ADFederationServices where no AD FS Auditing event 1200 exists on ADFS01 for the same user and time; MailItemsAccessed by an app from an address outside the corporate and vendor ranges.',
    fields: [
      ['User', 'it.admin01 (Global Administrator)'],
      ['From', '203.0.113.77 (Ashburn, a rented server)'],
      ['ADFS01 event 1200', 'None for that sign-in'],
      ['Mail read by app', 'priya.r, t.okoye, r.hallworth, l.fontaine'],
    ],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= 9 * 60 + 30) || min >= 10 * 60 + 30 },
    notice: '🚨 SIEM alert (Critical): forged-token sign-in and mail reads',
    chat: [
      'This is where the story leaves the Orion box. A sign-in that ADFS says it never issued, a certificate added to an app within fourteen minutes, and the app reading the mail of our security lead, our infrastructure lead, an executive and Legal.',
      'Work backward from the sign-in. Who could sign a token? Where does the signing certificate live? Which account could reach that server, and from where did it come?',
      'Check the DNS log, Sysmon on ORION01 and ADFS01, the ADFS audit log, the Entra logs, and the app credentials in the Terminal. Then write the case up at the SOC console.',
    ],
    case: CASE,
  },
];
