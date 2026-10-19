// The stand-in estate for the NotPetya case: hosts, the infection plan (who infected whom, and when each machine is scheduled
// to reboot), and the Active Directory directory built from them. Every name, address and account is invented.
// Maersk never published its internal layout. What is documented: it ran a worldwide Active Directory with many domain
// controllers, and one of them (in Ghana) had been knocked offline by a power outage before the worm arrived.
import { rng, T } from '../../game/logkit.js';
import { makeDirectory } from '../../game/directory.js';

export const SITE = { cph: 'Copenhagen (HQ)', ua: 'Ukraine office', lon: 'London', nj: 'New Jersey', gh: 'Ghana', tos: 'Terminal systems network', core: 'Core services' };

const W7 = 'Windows 7 Professional';
const W10 = 'Windows 10 Enterprise';
const S08 = 'Windows Server 2008 R2 Standard';
const S12 = 'Windows Server 2012 R2 Standard';
const OSVER = { [W7]: '6.1 (7601)', [S08]: '6.1 (7601)', [S12]: '6.3 (9600)', [W10]: '10.0 (14393)' };

export const HOSTS = {};
function h(name, ip, os, site, desc, extra = {}) {
  HOSTS[name.toLowerCase()] = { name, ip, os, osVersion: OSVER[os], site, desc, role: /^DC-/.test(name) ? 'Domain Controller' : /^WS-/.test(name) ? 'Workstation' : 'Server', ...extra };
}

// Domain controllers: one per major site, two at headquarters, one at the remote Ghana site.
h('DC-CPH01', '10.10.1.10', S12, 'cph', 'Domain controller, Copenhagen. PDC emulator, RID master.');
h('DC-CPH02', '10.10.1.11', S12, 'cph', 'Domain controller, Copenhagen.');
h('DC-LON01', '10.20.1.10', S12, 'lon', 'Domain controller, London.');
h('DC-NJ01', '10.30.1.10', S12, 'nj', 'Domain controller, New Jersey.');
h('DC-UA01', '10.40.1.10', S08, 'ua', 'Domain controller, Ukraine office (Windows Server 2008 R2).');
h('DC-GH01', '10.50.1.10', S12, 'gh', 'Domain controller, Ghana office. Small site, runs on a UPS.');

// Servers
h('FILE-CPH01', '10.10.1.20', S12, 'cph', 'File server, Copenhagen.');
h('SQL-CPH02', '10.10.1.30', S12, 'cph', 'Booking database server.');
h('APP-CPH03', '10.10.1.40', S08, 'cph', 'Legacy shipping-documents application. Vendor never certified the SMB patch.');
h('APP-CPH07', '10.10.1.47', S12, 'cph', 'Customer portal back end. Patched (KB4012213) in May.');
h('BKP-CPH01', '10.10.1.60', S12, 'cph', 'Backup server. Backs up servers; domain controllers are not in its job list.');
h('PRT-CPH01', '10.10.1.70', S12, 'cph', 'Print server.');
h('FILE-LON01', '10.20.1.20', S12, 'lon', 'File server, London.');
h('APP-NJ01', '10.30.1.40', S12, 'nj', 'Regional application server, New Jersey.');
h('SRV-UA-APP01', '10.40.1.30', S08, 'ua', 'Local accounting and tax reporting server (M.E.Doc is used at this site). Windows Server 2008 R2.');
h('TOS-APP01', '10.60.1.21', S12, 'tos', 'Terminal operations application server. Behind its own firewall; SMB from the WAN is blocked.');
h('JUMP-CPH01', '10.10.9.30', S12, 'core', 'Admin jump host used by IT.');
h('SCAN01', '10.10.9.20', S12, 'core', 'Vulnerability scanner (svc_scan).');
h('MON-CPH01', '10.10.9.40', 'CentOS Linux 7', 'core', 'Nagios monitoring.', { role: 'Server' });

// Workstations: the people from the cast, the Ukraine office, and the rest of the offices
h('WS-CPH-0107', '10.10.20.107', W10, 'cph', 'Priya Raman');
h('WS-CPH-0120', '10.10.20.120', W10, 'cph', 'Dana Kowalski');
h('WS-CPH-0127', '10.10.20.127', W10, 'cph', 'Theo Okoye');
h('WS-CPH-0131', '10.10.20.131', W10, 'cph', 'Mike Chen');
h('WS-CPH-0142', '10.10.20.142', W10, 'cph', 'Analyst One (SOC)');
h('WS-UA-0412', '10.40.20.12', W7, 'ua', 'Finance, Ukraine office. Runs M.E.Doc (tax reporting). Unpatched Windows 7.');
h('WS-UA-0415', '10.40.20.15', W7, 'ua', 'Finance, Ukraine office.');
h('WS-UA-0416', '10.40.20.16', W7, 'ua', 'Operations, Ukraine office.');
h('WS-UA-0417', '10.40.20.17', W7, 'ua', 'Operations, Ukraine office. Unpatched Windows 7 (MS17-010 missing).');
for (const n of [18, 19, 20, 21, 22, 23, 24, 25]) h(`WS-UA-04${n}`, `10.40.20.${n}`, W7, 'ua', 'Ukraine office workstation.');
for (let i = 1; i <= 6; i++) h(`WS-CPH-010${i}`, `10.10.20.10${i}`, W10, 'cph', 'Copenhagen office workstation.');
for (let i = 1; i <= 4; i++) h(`WS-LON-020${i}`, `10.20.20.${i}`, W10, 'lon', 'London office workstation.');
h('WS-LON-0207', '10.20.20.7', W10, 'lon', 'London operations (lon.ops01).');
for (let i = 1; i <= 4; i++) h(`WS-NJ-030${i}`, `10.30.20.${i}`, W10, 'nj', 'New Jersey office workstation.');
h('WS-NJ-0311', '10.30.20.11', W10, 'nj', 'New Jersey operations (nj.ops01).');
h('WS-GH-0509', '10.50.20.9', W10, 'gh', 'Ghana operations (gh.ops01).');

// ---------------------------------------------------------------------------------------------------------------
// The infection plan. t = absolute seconds (day 0 = Tuesday, June 27, 2017; SIEM clock is UTC). `via`:
//   p0      the machine that ran the M.E.Doc update (Microsoft saw EzVit.exe start rundll32 at about 10:30 GMT)
//   local   WMIC with the shared local Administrator password (credential reuse)
//   psexec  PsExec (renamed dllhost.dat, run with -s) with the domain admin credentials taken from memory
//   wmic    WMIC "process call create" with those credentials
//   eb      EternalBlue / EternalRomance against an unpatched SMBv1 host (no logon, no admin share)
// delay = minutes until the scheduled "shutdown /r /f" (the number after perfc.dat,#1). sched = when it fires.
// ---------------------------------------------------------------------------------------------------------------
export const PLAN = [];
const rr = rng(2706 + 99);
const jit = (n) => Math.floor(rr() * n);
const hhmm = (sec) => `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
export { hhmm };
function plan(o) {
  const p = { via: 'psexec', delay: 60, ...o };
  p.sched = Math.round((p.t + p.delay * 60) / 60) * 60;
  PLAN.push(p);
}

plan({ host: 'ws-ua-0412', t: T(10, 33, 20), via: 'p0', delay: 30 });
plan({ host: 'ws-ua-0417', t: T(10, 34, 31), via: 'eb', src: 'ws-ua-0412' });
{
  let t = T(10, 35, 10);
  for (const n of ['0415', '0416', '0418', '0419', '0420', '0421', '0422', '0423', '0424', '0425']) {
    plan({ host: `ws-ua-${n}`, t, via: 'local', src: 'ws-ua-0412' });
    t += 11 + jit(6);
  }
}
plan({ host: 'srv-ua-app01', t: T(10, 36, 0), via: 'eb', src: 'ws-ua-0412' });
plan({ host: 'dc-ua01', t: T(10, 38, 2), via: 'psexec', src: 'ws-ua-0412' });
plan({ host: 'dc-cph01', t: T(10, 39, 45), via: 'wmic', src: 'dc-ua01' });
plan({ host: 'dc-cph02', t: T(10, 40, 30), via: 'psexec', src: 'dc-ua01' });
plan({ host: 'dc-lon01', t: T(10, 41, 5), via: 'psexec', src: 'dc-ua01' });
plan({ host: 'dc-nj01', t: T(10, 41, 40), via: 'psexec', src: 'dc-ua01' });
plan({ host: 'file-cph01', t: T(10, 42, 10), via: 'psexec', src: 'dc-cph01' });
plan({ host: 'sql-cph02', t: T(10, 42, 40), via: 'psexec', src: 'dc-cph01' });
plan({ host: 'app-cph03', t: T(10, 43, 5), via: 'eb', src: 'dc-cph01' });
plan({ host: 'app-cph07', t: T(10, 43, 30), via: 'psexec', src: 'dc-cph01', ebTried: true });
plan({ host: 'bkp-cph01', t: T(10, 44, 0), via: 'psexec', src: 'dc-cph01' });
plan({ host: 'prt-cph01', t: T(10, 44, 20), via: 'psexec', src: 'dc-cph01' });
plan({ host: 'file-lon01', t: T(10, 44, 50), via: 'psexec', src: 'dc-lon01' });
plan({ host: 'app-nj01', t: T(10, 45, 20), via: 'psexec', src: 'dc-nj01' });
for (const [i, n] of ['0101', '0102', '0103', '0104', '0105', '0106'].entries()) plan({ host: `ws-cph-${n}`, t: T(10, 45, 40) + i * 24 + jit(8), via: 'psexec', src: 'dc-cph01' });
for (const [i, n] of ['0201', '0202', '0203', '0204'].entries()) plan({ host: `ws-lon-${n}`, t: T(10, 46, 10) + i * 27 + jit(8), via: 'psexec', src: 'dc-lon01' });
for (const [i, n] of ['0301', '0302', '0303', '0304'].entries()) plan({ host: `ws-nj-${n}`, t: T(10, 46, 40) + i * 26 + jit(8), via: 'psexec', src: 'dc-nj01' });

export const planOf = (host) => PLAN.find((p) => p.host === host.toLowerCase());
export const isDc = (host) => HOSTS[host.toLowerCase()]?.role === 'Domain Controller';

// ---------------------------------------------------------------------------------------------------------------
// The Active Directory (AD Users and Computers, Get-AD* cmdlets). A 2016-era flat domain, as many large companies had.
// ---------------------------------------------------------------------------------------------------------------
export function corpDirectory() {
  const u = (o) => ({ created: '2016-03-04', lastLogon: '2017-06-27', pwdLastSet: '2017-03-14', ...o });
  return makeDirectory({
    domain: 'corp.example',
    netbios: 'CORP',
    krbtgtPwdLastSet: '2016-03-04',
    adminLastLogon: '2017-05-30',
    ous: [
      { name: 'Corp' },
      { name: 'Employees', parent: 'Corp' },
      { name: 'IT', parent: 'Corp' },
      { name: 'Admins', parent: 'Corp', desc: 'Privileged accounts' },
      { name: 'ServiceAccounts', parent: 'Corp', desc: 'Accounts used by software, not people' },
      { name: 'Servers', parent: 'Corp' },
      { name: 'Workstations', parent: 'Corp' },
    ],
    groups: [
      { name: 'SOC Analysts', scope: 'Global', ou: 'IT', desc: 'Security operations: read-only access to SIEM and logs', created: '2016-03-04' },
      { name: 'IT Helpdesk', scope: 'Global', ou: 'IT', desc: 'Level 1 support', created: '2016-03-04' },
      { name: 'Helpdesk Admins', scope: 'Global', ou: 'Admins', desc: 'Local administrators on every workstation and member server (set by Group Policy)', created: '2016-03-04' },
    ],
    users: [
      u({ sam: 'priya.r', first: 'Priya', last: 'Raman', ou: 'IT', title: 'Security Manager', dept: 'Security', office: 'CPH', memberOf: ['SOC Analysts'] }),
      u({ sam: 'analyst01', first: 'Analyst', last: 'One', display: 'Analyst One', ou: 'IT', title: 'Security Analyst', dept: 'Security', office: 'CPH', memberOf: ['SOC Analysts'], created: '2017-06-26', pwdLastSet: '2017-06-26', logonCount: 3 }),
      u({ sam: 'dana.k', first: 'Dana', last: 'Kowalski', ou: 'IT', title: 'IT Support Specialist', dept: 'IT', office: 'CPH', memberOf: ['IT Helpdesk'] }),
      u({ sam: 't.okoye', first: 'Theo', last: 'Okoye', ou: 'IT', title: 'Server Engineer', dept: 'Infrastructure', office: 'CPH' }),
      u({ sam: 'm.chen', first: 'Mike', last: 'Chen', ou: 'Employees', title: 'Operations Manager', dept: 'Operations', office: 'CPH' }),
      u({ sam: 'ua.fin01', display: 'UA Finance 01', ou: 'Employees', title: 'Accountant', dept: 'Finance', office: 'UA', desc: 'Runs M.E.Doc for local tax reporting' }),
      u({ sam: 'ua.fin02', display: 'UA Finance 02', ou: 'Employees', title: 'Accountant', dept: 'Finance', office: 'UA' }),
      u({ sam: 'lon.ops01', display: 'LON Operations 01', ou: 'Employees', dept: 'Operations', office: 'LON' }),
      u({ sam: 'nj.ops01', display: 'NJ Operations 01', ou: 'Employees', dept: 'Operations', office: 'NJ' }),
      u({ sam: 'gh.ops01', display: 'GH Operations 01', ou: 'Employees', dept: 'Operations', office: 'GH', lastLogon: '2017-06-27' }),
      u({ sam: 'adm.helpdesk', display: 'Helpdesk Admin (shared)', ou: 'Admins', desc: 'Shared helpdesk administrator account, used by every helpdesk technician at every site', memberOf: ['Domain Admins', 'Helpdesk Admins'], neverExpires: true, adminCount: 1, pwdLastSet: '2016-04-11', logonCount: 9114 }),
      u({ sam: 'adm.dana', display: 'IT Admin (Dana)', ou: 'Admins', desc: 'Dana Kowalski: privileged account for server administration', memberOf: ['Domain Admins'], adminCount: 1, pwdLastSet: '2017-04-03' }),
      u({ sam: 'svc_scan', display: 'Vulnerability Scanner', ou: 'ServiceAccounts', service: true, desc: 'Authenticated vulnerability scans (SCAN01)', memberOf: ['Domain Admins'], neverExpires: true, adminCount: 1, pwdLastSet: '2016-09-20', logonCount: 2210 }),
      u({ sam: 'svc_patch', display: 'Patch Service', ou: 'ServiceAccounts', service: true, desc: 'Runs patch-night scheduled tasks (CHG-4417)', neverExpires: true, pwdLastSet: '2016-11-02' }),
      u({ sam: 'svc_backup', display: 'Backup Service', ou: 'ServiceAccounts', service: true, desc: 'Nightly server backups (BKP-CPH01)', memberOf: ['Backup Operators'], neverExpires: true, adminCount: 1, pwdLastSet: '2016-05-10' }),
    ],
    computers: Object.values(HOSTS)
      .filter((c) => c.name !== 'MON-CPH01')
      .map((c) => ({
        name: c.name,
        ou: c.role === 'Domain Controller' ? undefined : c.role === 'Workstation' ? 'Workstations' : 'Servers',
        os: c.os,
        osVersion: c.osVersion,
        role: c.role,
        ip: c.ip,
        desc: c.desc,
        lastLogon: '2017-06-27',
        created: '2016-03-04',
      })),
  });
}
