// An Active Directory domain as a small data model: OUs, users, groups, computers, SIDs, userAccountControl flags,
// group membership (including nesting). One model feeds both the "Active Directory Users and Computers" window and
// the PowerShell cmdlets (Get-ADUser, Get-ADGroupMember...), so what the player sees always agrees.
//
// A case describes its domain compactly with makeDirectory({ domain, netbios, users: [...], groups: [...], computers: [...] })
// and gets back normalized objects with distinguishedName, objectSid, userAccountControl, memberOf, etc.

import { DOMAIN_SID, WELL_KNOWN_RID, sidOf } from './winevents.js';

export const UAC = {
  SCRIPT: 0x1,
  ACCOUNTDISABLE: 0x2,
  PASSWD_NOTREQD: 0x20,
  NORMAL_ACCOUNT: 0x200,
  WORKSTATION_TRUST_ACCOUNT: 0x1000,
  SERVER_TRUST_ACCOUNT: 0x2000,
  DONT_EXPIRE_PASSWORD: 0x10000,
  SMARTCARD_REQUIRED: 0x40000,
  TRUSTED_FOR_DELEGATION: 0x80000,
  NOT_DELEGATED: 0x100000,
  DONT_REQ_PREAUTH: 0x400000,
  PASSWORD_EXPIRED: 0x800000,
  TRUSTED_TO_AUTH_FOR_DELEGATION: 0x1000000,
};

export const uacNames = (n) => Object.entries(UAC).filter(([, v]) => n & v).map(([k]) => k);
export const uacText = (n) => `0x${n.toString(16)} = ( ${uacNames(n).join(' | ')} )`;

const DEFAULT_OUS = [
  { name: 'Builtin', kind: 'container' },
  { name: 'Computers', kind: 'container' },
  { name: 'Domain Controllers', kind: 'ou' },
  { name: 'ForeignSecurityPrincipals', kind: 'container' },
  { name: 'Managed Service Accounts', kind: 'container' },
  { name: 'Users', kind: 'container' },
];

const DEFAULT_GROUPS = [
  { name: 'Domain Admins', scope: 'Global', ou: 'Users', desc: 'Designated administrators of the domain' },
  { name: 'Domain Users', scope: 'Global', ou: 'Users', desc: 'All domain users' },
  { name: 'Domain Computers', scope: 'Global', ou: 'Users', desc: 'All workstations and servers joined to the domain' },
  { name: 'Domain Controllers', scope: 'Global', ou: 'Users', desc: 'All domain controllers in the domain' },
  { name: 'Enterprise Admins', scope: 'Universal', ou: 'Users', desc: 'Designated administrators of the enterprise' },
  { name: 'Schema Admins', scope: 'Universal', ou: 'Users', desc: 'Designated administrators of the schema' },
  { name: 'Group Policy Creator Owners', scope: 'Global', ou: 'Users', desc: 'Members in this group can modify group policy for the domain' },
  { name: 'DnsAdmins', scope: 'Domain Local', ou: 'Users', desc: 'DNS Administrators Group' },
  { name: 'Protected Users', scope: 'Global', ou: 'Users', desc: 'Members of this group are afforded additional protections against authentication security threats.' },
  { name: 'Administrators', scope: 'Domain Local', ou: 'Builtin', desc: 'Administrators have complete and unrestricted access to the computer/domain', builtin: 544 },
  { name: 'Remote Desktop Users', scope: 'Domain Local', ou: 'Builtin', desc: 'Members in this group are granted the right to logon remotely', builtin: 555 },
  { name: 'Backup Operators', scope: 'Domain Local', ou: 'Builtin', desc: 'Backup Operators can override security restrictions for the sole purpose of backing up or restoring files', builtin: 551 },
  { name: 'Account Operators', scope: 'Domain Local', ou: 'Builtin', desc: 'Members can administer domain user and group accounts', builtin: 548 },
  { name: 'Server Operators', scope: 'Domain Local', ou: 'Builtin', desc: 'Members can administer domain servers', builtin: 549 },
];

const rid = (name) => 1100 + ([...name.toLowerCase()].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7) % 8900);
const guid = (seed) => {
  let a = [...seed].reduce((x, c) => (Math.imul(x, 33) + c.charCodeAt(0)) >>> 0, 5381);
  const hex = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return (a >>> 8).toString(16).padStart(6, '0').slice(0, 6); };
  const s = `${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}`.slice(0, 32);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
};

/**
 * @param {object} spec
 * @param {string} spec.domain 'halcyonmutual.local'   @param {string} spec.netbios 'HALCYON'
 * @param {Array} spec.ous     extra OUs: { name, parent?: 'Halcyon', desc? }
 * @param {Array} spec.users   { sam, first, last, ou: 'Employees' (an OU name), title, dept, desc, mail, enabled, neverExpires, noPreauth,
 *                              delegation, pwdLastSet: 'YYYY-MM-DD', lastLogon: 'YYYY-MM-DD', created, memberOf: [group names], spn: [], adminCount, logonCount, badPwdCount }
 * @param {Array} spec.groups  extra groups: { name, scope, ou, desc, members: [sam|group names] }
 * @param {Array} spec.computers { name, ou, os, role: 'Workstation'|'Server'|'Domain Controller', ip, desc, lastLogon, delegation }
 */
export function makeDirectory(spec) {
  const domain = spec.domain || 'halcyonmutual.local';
  const netbios = spec.netbios || domain.split('.')[0].toUpperCase();
  const domainDn = domain.split('.').map((p) => `DC=${p}`).join(',');
  const domainSid = spec.domainSid || DOMAIN_SID;
  const ouByName = new Map();
  const ous = [];
  for (const o of [...DEFAULT_OUS, ...(spec.ous || [])]) {
    const parent = o.parent ? ouByName.get(o.parent) : null;
    const dn = `${o.kind === 'container' ? 'CN' : 'OU'}=${o.name},${parent ? parent.dn : domainDn}`;
    const rec = { name: o.name, kind: o.kind || 'ou', dn, parent: parent?.dn || domainDn, desc: o.desc || '', guid: guid(dn) };
    ouByName.set(o.name, rec);
    ous.push(rec);
  }
  const ouDn = (name) => ouByName.get(name || 'Users')?.dn || ouByName.get('Users').dn;

  const groups = [...DEFAULT_GROUPS, ...(spec.groups || [])].map((g) => {
    const known = WELL_KNOWN_RID[g.name.toLowerCase()];
    return {
      type: 'group',
      name: g.name,
      sam: g.name,
      scope: g.scope || 'Global',
      category: g.category || 'Security',
      desc: g.desc || '',
      ou: g.ou || 'Users',
      dn: `CN=${g.name},${ouDn(g.ou || 'Users')}`,
      sid: g.builtin ? `S-1-5-32-${g.builtin}` : known ? `${domainSid}-${known}` : `${domainSid}-${rid(g.name)}`,
      guid: guid(`group${g.name}`),
      members: [...(g.members || [])],
      memberOf: [...(g.memberOf || [])],
      created: g.created || '2016-03-04',
    };
  });
  const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));

  const users = [
    { sam: 'Administrator', first: '', last: '', display: 'Administrator', ou: 'Users', desc: 'Built-in account for administering the computer/domain', memberOf: ['Domain Admins', 'Enterprise Admins', 'Schema Admins', 'Administrators', 'Group Policy Creator Owners'], neverExpires: true, adminCount: 1, pwdLastSet: '2024-01-15', lastLogon: spec.adminLastLogon || '2026-09-02', created: '2016-03-04', builtin: 500 },
    { sam: 'Guest', display: 'Guest', ou: 'Users', desc: 'Built-in account for guest access to the computer/domain', enabled: false, neverExpires: true, noPwd: true, pwdLastSet: '2016-03-04', created: '2016-03-04', builtin: 501, memberOf: [] },
    { sam: 'krbtgt', display: 'krbtgt', ou: 'Users', desc: 'Key Distribution Center Service Account', enabled: false, adminCount: 1, pwdLastSet: spec.krbtgtPwdLastSet || '2019-06-20', created: '2016-03-04', builtin: 502, memberOf: [] },
    ...(spec.users || []),
  ].map((u) => {
    const display = u.display || [u.first, u.last].filter(Boolean).join(' ') || u.sam;
    let uac = UAC.NORMAL_ACCOUNT;
    if (u.enabled === false) uac |= UAC.ACCOUNTDISABLE;
    if (u.neverExpires) uac |= UAC.DONT_EXPIRE_PASSWORD;
    if (u.noPreauth) uac |= UAC.DONT_REQ_PREAUTH;
    if (u.delegation) uac |= UAC.TRUSTED_FOR_DELEGATION;
    if (u.noPwd) uac |= UAC.PASSWD_NOTREQD;
    return {
      type: 'user',
      sam: u.sam,
      name: display,
      display,
      first: u.first || '',
      last: u.last || '',
      ou: u.ou || 'Users',
      dn: `CN=${display},${ouDn(u.ou || 'Users')}`,
      upn: `${u.sam}@${domain}`,
      mail: u.mail ?? (u.service ? '' : `${u.sam}@${domain.replace(/\.local$/, '.com')}`),
      title: u.title || '',
      dept: u.dept || '',
      desc: u.desc || '',
      office: u.office || '',
      phone: u.phone || '',
      uac,
      enabled: u.enabled !== false,
      sid: u.builtin ? `${domainSid}-${u.builtin}` : `${domainSid}-${rid(u.sam)}`,
      guid: guid(`user${u.sam}`),
      memberOf: [...new Set(['Domain Users', ...(u.memberOf || [])])],
      spn: u.spn || [],
      adminCount: u.adminCount || 0,
      pwdLastSet: u.pwdLastSet || '2026-03-02',
      pwdTime: u.pwdTime,
      createdTime: u.createdTime,
      lastLogon: u.lastLogon || '2026-10-19',
      created: u.created || '2021-05-17',
      logonCount: u.logonCount ?? 412,
      badPwdCount: u.badPwdCount ?? 0,
      workstations: u.workstations || '',
      primaryGroupId: 513,
    };
  });

  const computers = (spec.computers || []).map((c) => {
    const role = c.role || (/^(DC|AD)/i.test(c.name) ? 'Domain Controller' : /^(WS|LT|PC)/i.test(c.name) ? 'Workstation' : 'Server');
    const ou = c.ou || (role === 'Domain Controller' ? 'Domain Controllers' : 'Computers');
    let uac = role === 'Domain Controller' ? UAC.SERVER_TRUST_ACCOUNT | UAC.TRUSTED_FOR_DELEGATION : UAC.WORKSTATION_TRUST_ACCOUNT;
    if (c.delegation) uac |= UAC.TRUSTED_FOR_DELEGATION;
    return {
      type: 'computer',
      sam: `${c.name}$`,
      name: c.name,
      ou,
      dn: `CN=${c.name},${ouDn(ou)}`,
      dns: `${c.name.toLowerCase()}.${domain}`,
      os: c.os || (role === 'Workstation' ? 'Windows 10 Enterprise' : 'Windows Server 2019 Standard'),
      osVersion: c.osVersion || (role === 'Workstation' ? '10.0 (19045)' : '10.0 (17763)'),
      role,
      ip: c.ip || '',
      desc: c.desc || '',
      uac,
      enabled: c.enabled !== false,
      sid: `${domainSid}-${rid(c.name)}`,
      guid: guid(`computer${c.name}`),
      lastLogon: c.lastLogon || '2026-10-19',
      created: c.created || '2021-05-17',
      spn: c.spn || [`HOST/${c.name.toLowerCase()}`, `HOST/${c.name.toLowerCase()}.${domain}`],
      memberOf: role === 'Domain Controller' ? ['Domain Controllers'] : ['Domain Computers'],
    };
  });

  // Group membership both ways: u.memberOf names a group; g.members names users/groups/computers.
  const memberKey = (o) => o.sam.toLowerCase();
  const all = [...users, ...computers, ...groups.map((g) => ({ ...g }))];
  const byKey = new Map();
  for (const o of [...users, ...computers]) byKey.set(memberKey(o), o);
  for (const g of groups) byKey.set(g.name.toLowerCase(), g);
  for (const g of groups) {
    for (const m of g.members) {
      const o = byKey.get(String(m).toLowerCase());
      if (o && !(o.memberOf || (o.memberOf = [])).includes(g.name)) o.memberOf.push(g.name);
    }
  }
  for (const o of [...users, ...computers]) for (const gname of o.memberOf) {
    const g = groupByName.get(gname.toLowerCase());
    if (g && !g.members.some((m) => String(m).toLowerCase() === memberKey(o))) g.members.push(o.sam);
  }
  // nested group names count as members of the parent (Domain Admins contains the group "Tier0 Admins")
  for (const g of groups) for (const gname of g.memberOf || []) {
    const p = groupByName.get(gname.toLowerCase());
    if (p && !p.members.includes(g.name)) p.members.push(g.name);
  }

  const lookup = (id) => {
    const k = String(id || '').toLowerCase().replace(/^.*\\/, '');
    return byKey.get(k) || byKey.get(`${k}$`) || [...byKey.values()].find((o) => o.dn.toLowerCase() === k || o.sid.toLowerCase() === k || o.upn?.toLowerCase() === k || o.display?.toLowerCase() === k);
  };

  function groupMembers(name, { recursive = false } = {}) {
    const g = groupByName.get(String(name).toLowerCase());
    if (!g) return null;
    const out = [];
    const seen = new Set();
    const walk = (grp) => {
      if (seen.has(grp.name)) return;
      seen.add(grp.name);
      for (const m of grp.members) {
        const o = byKey.get(String(m).toLowerCase());
        if (!o) continue;
        if (o.type === 'group') {
          if (recursive) walk(o);
          else out.push(o);
        } else if (!out.includes(o)) out.push(o);
      }
    };
    walk(g);
    return out;
  }

  const effectiveGroups = (o) => {
    const seen = new Set();
    const walk = (x) => {
      for (const gname of x.memberOf || []) {
        const g = groupByName.get(gname.toLowerCase());
        if (g && !seen.has(g.name)) { seen.add(g.name); walk(g); }
      }
    };
    walk(o);
    return [...seen];
  };

  return {
    domain,
    netbios,
    dn: domainDn,
    sid: domainSid,
    dc: (computers.find((c) => c.role === 'Domain Controller') || { name: 'DC01' }).name,
    ous,
    ouByName,
    users,
    groups,
    computers,
    all: [...users, ...computers, ...groups],
    lookup,
    groupMembers,
    effectiveGroups,
    privileged: () => groupMembers('Domain Admins', { recursive: true }) || [],
    sidOf: (name) => sidOf(name, domainSid),
  };
}

// ---------- dates the way AD prints them ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function adDate(iso, { tz = 'Eastern Daylight Time', time = '9:14:02 AM' } = {}) {
  if (!iso) return '<never>';
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${y} ${time} ${tz}`;
}
export const whenCreated = (iso) => (iso ? `${iso.replace(/-/g, '')}141502.0Z` : '<not set>');
export const shortDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MON[m - 1]} ${d}, ${y}`;
};
