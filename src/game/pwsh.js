// A small PowerShell for the in-game Terminal (the Windows jump box / a domain controller console).
// It is not a full interpreter: it understands the cmdlets a SOC analyst reaches for when investigating Active
// Directory, with real parameter names, real pipelines and real-looking output and errors.
//
//   Active Directory   Get-ADUser  Get-ADGroup  Get-ADGroupMember  Get-ADComputer  Get-ADDomain  Get-ADDomainController
//                      Get-ADPrincipalGroupMembership  Get-ADDefaultDomainPasswordPolicy
//   Event logs         Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4769}  (reads the day's SIEM events)
//   Files and text     Get-Content  Select-String  Get-ChildItem  Set-Location  Get-Location
//   Pipeline           Where-Object  Select-Object  Sort-Object  Group-Object  Measure-Object  ForEach-Object
//                      Format-Table  Format-List  Out-String  and the parenthesis form  (Get-ADGroupMember 'Domain Admins').Count
//   Native tools       whoami [/groups]  hostname  net user|group|localgroup  nltest  setspn  klist  ipconfig  nslookup
//
// Pure logic (no DOM), unit tested. The day provides ctx: { dir, events(), fs, cwd, user, host, ... }.

import { adDate, uacNames, UAC } from './directory.js';

const lc = (s) => String(s).toLowerCase();
// A DateTime as PowerShell prints it (10/24/2026 3:12:31 AM) that still sorts and compares like a date.
export class PsDate {
  constructor(iso, time = '9:14:02 AM') {
    this.iso = iso;
    this.time = time;
  }

  valueOf() {
    const [y, m, d] = this.iso.split('-').map(Number);
    const t = this.time.match(/(\d+):(\d+):(\d+) (AM|PM)/);
    const hh = t ? (Number(t[1]) % 12) + (t[4] === 'PM' ? 12 : 0) : 0;
    return Date.UTC(y, m - 1, d, hh, t ? Number(t[2]) : 0, t ? Number(t[3]) : 0);
  }

  toString() {
    const [y, m, d] = this.iso.split('-').map(Number);
    return `${m}/${d}/${y} ${this.time}`;
  }
}
const pd = (iso, time) => (iso ? new PsDate(iso, time) : null);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof PsDate);

export const PWSH_BANNER = ['Windows PowerShell', 'Copyright (C) Microsoft Corporation. All rights reserved.', '', 'Try the new cross-platform PowerShell https://aka.ms/pscore6', '', ''].join('\n');

class PsError extends Error {
  constructor(msg, { cat = 'NotSpecified', id = 'RuntimeException', target = '' } = {}) {
    super(msg);
    this.cat = cat;
    this.id = id;
    this.target = target;
  }
}

// ---------------------------------------------------------------------------------------------- tokenizing
function splitTop(str, sep) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let q = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (q) {
      if (c === q) { if (str[i + 1] === q) { cur += c + str[++i]; continue; } q = null; }
      cur += c;
    } else if (c === "'" || c === '"') { q = c; cur += c; } else if ('({['.includes(c)) { depth++; cur += c; } else if (')}]'.includes(c)) { depth--; cur += c; } else if (c === sep && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += c;
  }
  parts.push(cur.trim());
  return parts;
}

function tokenizeStage(str) {
  const out = [];
  let i = 0;
  const grab = (open, close) => {
    let depth = 0;
    let j = i;
    let q = null;
    for (; j < str.length; j++) {
      const c = str[j];
      if (q) { if (c === q) q = null; continue; }
      if (c === "'" || c === '"') q = c;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) break;
    }
    if (j >= str.length) throw new PsError(`Missing closing '${close}' in expression.`, { id: 'ParseException' });
    const raw = str.slice(i, j + 1);
    i = j + 1;
    return raw;
  };
  while (i < str.length) {
    const c = str[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === ',') { out.push({ t: 'comma' }); i++; continue; }
    if (c === "'") {
      let j = i + 1;
      let s = '';
      while (j < str.length) { if (str[j] === "'") { if (str[j + 1] === "'") { s += "'"; j += 2; continue; } break; } s += str[j++]; }
      if (j >= str.length) throw new PsError('The string is missing the terminator: \'.', { id: 'TerminatorExpectedAtEndOfString' });
      out.push({ t: 'str', v: s, expand: false });
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < str.length && str[j] !== '"') { if (str[j] === '`') j++; s += str[j++]; }
      if (j >= str.length) throw new PsError('The string is missing the terminator: ".', { id: 'TerminatorExpectedAtEndOfString' });
      out.push({ t: 'str', v: s, expand: true });
      i = j + 1;
      continue;
    }
    if (c === '{') { out.push({ t: 'block', v: grab('{', '}').slice(1, -1).trim() }); continue; }
    if (c === '@' && str[i + 1] === '{') { i++; out.push({ t: 'hash', v: grab('{', '}').slice(1, -1) }); continue; }
    if (c === '(') {
      const raw = grab('(', ')');
      let tail = '';
      while (i < str.length && /[\w.[\]]/.test(str[i])) tail += str[i++];
      out.push({ t: 'paren', v: raw.slice(1, -1), tail });
      continue;
    }
    let j = i;
    while (j < str.length && !/[\s,]/.test(str[j])) j++;
    const w = str.slice(i, j);
    i = j;
    const pm = w.match(/^-([A-Za-z][\w]*)(?::(.*))?$/);
    if (pm && !/^-\d/.test(w)) out.push({ t: 'param', v: pm[1], inline: pm[2] });
    else out.push({ t: 'word', v: w });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- objects
const get = (o, name) => {
  if (o === null || o === undefined) return undefined;
  if (Array.isArray(o)) return name.toLowerCase() === 'count' || name.toLowerCase() === 'length' ? o.length : o.map((x) => get(x, name));
  if (typeof o === 'string') return name.toLowerCase() === 'length' ? o.length : undefined;
  const k = Object.keys(o).find((x) => lc(x) === lc(name) && !x.startsWith('__'));
  return k === undefined ? undefined : o[k];
};
const tag = (obj, type) => Object.defineProperty(obj, '__t', { value: type, enumerable: false, writable: true });
const mk = (type, props) => tag({ ...props }, type);

const csv = (v) => (Array.isArray(v) ? v.join(', ') : v);
const fmtVal = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof PsDate) return v.toString();
  if (Array.isArray(v)) return v.length ? `{${v.map((x) => (isObj(x) ? '@{...}' : x)).join(', ')}}` : '{}';
  if (isObj(v)) return v.__t ? `${Object.entries(v).slice(0, 3).map(([k, x]) => `${k}=${x}`).join('; ')}` : `@{${Object.entries(v).map(([k, x]) => `${k}=${fmtVal(x)}`).join('; ')}}`;
  if (v === true) return 'True';
  if (v === false) return 'False';
  return String(v);
};

// ---------------------------------------------------------------------------------------------- AD property bags
const FILETIME = (iso) => (iso ? String((Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) + 11644473600000) * 10000) : '0');

function userProps(u, dir, all) {
  const eff = u.memberOf.filter((g) => lc(g) !== 'domain users').map((g) => dir.groups.find((x) => lc(x.name) === lc(g))?.dn).filter(Boolean);
  const base = {
    DistinguishedName: u.dn,
    Enabled: u.enabled,
    GivenName: u.first || null,
    Name: u.name,
    ObjectClass: 'user',
    ObjectGUID: u.guid,
    SamAccountName: u.sam,
    SID: u.sid,
    Surname: u.last || null,
    UserPrincipalName: u.upn,
  };
  if (!all) return base;
  return {
    ...base,
    AccountExpirationDate: null,
    accountExpires: '9223372036854775807',
    AccountLockoutTime: null,
    adminCount: u.adminCount,
    BadLogonCount: u.badPwdCount,
    badPwdCount: u.badPwdCount,
    CannotChangePassword: false,
    CanonicalName: `${dir.domain}/${u.ou === 'Users' ? 'Users' : dir.ouByName.get(u.ou) ? dir.ouByName.get(u.ou).dn.split(',').filter((p) => p.startsWith('OU=') || p.startsWith('CN=')).map((p) => p.slice(3)).reverse().join('/') : u.ou}/${u.name}`,
    CN: u.name,
    Created: pd(u.created, u.createdTime),
    Department: u.dept || null,
    Description: u.desc || null,
    DisplayName: u.display,
    DoesNotRequirePreAuth: !!(u.uac & UAC.DONT_REQ_PREAUTH),
    EmailAddress: u.mail || null,
    LastLogonDate: pd(u.lastLogon, '8:47:11 AM'),
    lastLogon: FILETIME(u.lastLogon),
    lastLogonTimestamp: FILETIME(u.lastLogon),
    LockedOut: false,
    logonCount: u.logonCount,
    MemberOf: eff,
    Modified: pd(u.pwdLastSet),
    msDS_User_Account_Control_Computed: 0,
    PasswordExpired: false,
    PasswordLastSet: pd(u.pwdLastSet, u.pwdTime),
    PasswordNeverExpires: !!(u.uac & UAC.DONT_EXPIRE_PASSWORD),
    PasswordNotRequired: !!(u.uac & UAC.PASSWD_NOTREQD),
    primaryGroupID: 513,
    pwdLastSet: FILETIME(u.pwdLastSet),
    sAMAccountType: 805306368,
    servicePrincipalName: u.spn,
    ServicePrincipalNames: u.spn,
    Title: u.title || null,
    TrustedForDelegation: !!(u.uac & UAC.TRUSTED_FOR_DELEGATION),
    userAccountControl: u.uac,
    whenChanged: pd(u.pwdLastSet, u.pwdTime),
    whenCreated: pd(u.created, u.createdTime),
  };
}

function groupProps(g, dir, all) {
  const base = { DistinguishedName: g.dn, GroupCategory: g.category, GroupScope: g.scope, Name: g.name, ObjectClass: 'group', ObjectGUID: g.guid, SamAccountName: g.sam, SID: g.sid };
  if (!all) return base;
  return { ...base, CN: g.name, Description: g.desc || null, Created: pd(g.created), Members: g.members.map((m) => dir.lookup(m)?.dn).filter(Boolean), MemberOf: (g.memberOf || []).map((n) => dir.groups.find((x) => lc(x.name) === lc(n))?.dn).filter(Boolean), whenCreated: pd(g.created) };
}

function computerProps(c, dir, all) {
  const base = { DistinguishedName: c.dn, DNSHostName: c.dns, Enabled: c.enabled, Name: c.name, ObjectClass: 'computer', ObjectGUID: c.guid, SamAccountName: c.sam, SID: c.sid, UserPrincipalName: null };
  if (!all) return base;
  return { ...base, CN: c.name, Description: c.desc || null, IPv4Address: c.ip || null, LastLogonDate: pd(c.lastLogon, '8:41:02 AM'), OperatingSystem: c.os, OperatingSystemVersion: c.osVersion, PrimaryGroupID: c.role === 'Domain Controller' ? 516 : 515, ServicePrincipalNames: c.spn, TrustedForDelegation: !!(c.uac & UAC.TRUSTED_FOR_DELEGATION), userAccountControl: c.uac, whenCreated: pd(c.created) };
}

const asObject = (o, dir, propsWanted, type) => {
  const all = propsWanted.includes('*');
  const fn = o.type === 'user' ? userProps : o.type === 'group' ? groupProps : computerProps;
  const bag = fn(o, dir, true);
  const base = fn(o, dir, false);
  const out = {};
  const names = all ? Object.keys(bag) : [...Object.keys(base), ...propsWanted.map((p) => Object.keys(bag).find((k) => lc(k) === lc(p))).filter(Boolean)];
  for (const k of new Set(names)) out[k] = bag[k];
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => lc(a).localeCompare(lc(b))));
  return mk(type || (o.type === 'user' ? 'ADUser' : o.type === 'group' ? 'ADGroup' : 'ADComputer'), sorted);
};

// ---------------------------------------------------------------------------------------------- expressions ($_.Prop -eq 'x')
function evalExpr(src, scope) {
  const tk = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '`') j++; s += src[j++]; }
      tk.push({ t: 'lit', v: c === '"' ? interpolate(s, scope) : s });
      i = j + 1;
      continue;
    }
    if (c === '(' || c === ')') { tk.push({ t: c }); i++; continue; }
    if (c === '$') {
      const m = src.slice(i).match(/^\$(_|true|false|null|[A-Za-z_][\w]*(?::\w+)?)((?:\.[A-Za-z_]\w*(?:\([^)]*\))?)*)/i);
      if (m) { tk.push({ t: 'var', name: m[1], path: m[2] }); i += m[0].length; continue; }
    }
    if (c === '!' ) { tk.push({ t: 'op', v: '-not' }); i++; continue; }
    const m = src.slice(i).match(/^-(eq|ne|gt|lt|ge|le|like|notlike|match|notmatch|contains|notcontains|in|notin|and|or|not|is|ceq|cne|imatch)\b/i);
    if (m) { tk.push({ t: 'op', v: `-${lc(m[1])}` }); i += m[0].length; continue; }
    const n = src.slice(i).match(/^-?\d+(\.\d+)?/);
    if (n) { tk.push({ t: 'lit', v: Number(n[0]) }); i += n[0].length; continue; }
    const w = src.slice(i).match(/^[\w.*\\/:-]+/);
    if (w) { tk.push({ t: 'lit', v: w[0] }); i += w[0].length; continue; }
    throw new PsError(`Unexpected token '${c}' in expression or statement.`, { id: 'UnexpectedToken' });
  }
  let p = 0;
  const peek = () => tk[p];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const prim = () => {
    const t = tk[p++];
    if (!t) throw new PsError('You must provide a value expression following the operator.', { id: 'ExpectedValueExpression' });
    if (t.t === '(') { const v = orx(); p++; return v; }
    if (t.t === 'op' && t.v === '-not') return !prim();
    if (t.t === 'lit') return t.v;
    if (t.t === 'var') return varValue(t, scope);
    throw new PsError(`Unexpected token '${t.v || t.t}' in expression or statement.`, { id: 'UnexpectedToken' });
  };
  const cmp = () => {
    let l = prim();
    while (peek()?.t === 'op' && !['-and', '-or', '-not'].includes(peek().v)) {
      const op = tk[p++].v;
      const r = prim();
      l = compare(op, l, r);
    }
    return l;
  };
  const andx = () => { let l = cmp(); while (isOp('-and')) { p++; const r = cmp(); l = truthy(l) && truthy(r); } return l; };
  const orx = () => { let l = andx(); while (isOp('-or')) { p++; const r = andx(); l = truthy(l) || truthy(r); } return l; };
  const v = orx();
  if (p < tk.length) throw new PsError(`Unexpected token '${tk[p].v || tk[p].t}' in expression or statement.`, { id: 'UnexpectedToken' });
  return v;
}

const truthy = (v) => (Array.isArray(v) ? v.length > 0 : !!v && v !== 0);

function varValue(t, scope) {
  let v;
  const n = lc(t.name);
  if (n === '_') v = scope.item;
  else if (n === 'true') v = true;
  else if (n === 'false') v = false;
  else if (n === 'null') v = null;
  else if (scope.vars && n in scope.vars) v = scope.vars[n];
  else if (n.startsWith('env:')) v = { username: scope.user, computername: scope.host, userdomain: scope.netbios, userdnsdomain: scope.domain?.toUpperCase() }[n.slice(4)] ?? '';
  else v = null;
  for (const part of (t.path || '').split('.').filter(Boolean)) {
    const m = part.match(/^(\w+)(?:\(([^)]*)\))?$/);
    const name = m[1];
    if (m[2] !== undefined && typeof v === 'string') {
      const f = lc(name);
      if (f === 'toupper') v = v.toUpperCase();
      else if (f === 'tolower') v = v.toLowerCase();
      else if (f === 'trim') v = v.trim();
      else if (f === 'split') v = v.split(m[2].replace(/['"]/g, ''));
      else if (f === 'contains') v = v.includes(m[2].replace(/['"]/g, ''));
      else if (f === 'startswith') v = v.startsWith(m[2].replace(/['"]/g, ''));
      else if (f === 'endswith') v = v.endsWith(m[2].replace(/['"]/g, ''));
      else if (f === 'substring') v = v.substring(...m[2].split(',').map(Number));
      else v = null;
    } else v = get(v, name);
  }
  return v;
}

function interpolate(s, scope) {
  return s.replace(/\$\(([^)]*)\)|\$(_(?:\.\w+)*|env:\w+|[A-Za-z_]\w*)/g, (m, sub, simple) => {
    try {
      const v = sub !== undefined ? evalExpr(sub, scope) : varValue({ name: simple.split('.')[0], path: simple.includes('.') ? simple.slice(simple.indexOf('.')) : '' }, scope);
      return Array.isArray(v) ? v.join(' ') : v === null || v === undefined ? '' : String(v);
    } catch { return m; }
  });
}

function compare(op, a, b) {
  if (a instanceof PsDate) {
    a = a.valueOf();
    b = b instanceof PsDate ? b.valueOf() : Date.parse(String(b));
  }
  const num = (x) => (typeof x === 'number' ? x : x !== '' && x !== null && !Number.isNaN(Number(x)) ? Number(x) : NaN);
  const likeRe = (pat) => new RegExp(`^${String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'is');
  const any = (arr, f) => (Array.isArray(arr) ? arr.some(f) : f(arr));
  const eq = (x, y) => (typeof x === 'boolean' || typeof y === 'boolean' ? truthy(x) === truthy(y) : !Number.isNaN(num(x)) && !Number.isNaN(num(y)) && x !== null && y !== null ? num(x) === num(y) : x === null || y === null ? x === y : lc(x) === lc(y));
  switch (op) {
    case '-eq': return Array.isArray(a) ? a.filter((x) => eq(x, b)).length > 0 : eq(a, b);
    case '-ne': return Array.isArray(a) ? a.filter((x) => !eq(x, b)).length > 0 : !eq(a, b);
    case '-gt': return any(a, (x) => (!Number.isNaN(num(x)) ? num(x) > num(b) : lc(x) > lc(b)));
    case '-lt': return any(a, (x) => (!Number.isNaN(num(x)) ? num(x) < num(b) : lc(x) < lc(b)));
    case '-ge': return any(a, (x) => (!Number.isNaN(num(x)) ? num(x) >= num(b) : lc(x) >= lc(b)));
    case '-le': return any(a, (x) => (!Number.isNaN(num(x)) ? num(x) <= num(b) : lc(x) <= lc(b)));
    case '-like': return any(a, (x) => x !== null && x !== undefined && likeRe(b).test(String(x)));
    case '-notlike': return !any(a, (x) => x !== null && x !== undefined && likeRe(b).test(String(x)));
    case '-match': case '-imatch': return any(a, (x) => x !== null && x !== undefined && new RegExp(b, 'i').test(String(x)));
    case '-notmatch': return !any(a, (x) => x !== null && x !== undefined && new RegExp(b, 'i').test(String(x)));
    case '-contains': return Array.isArray(a) && a.some((x) => eq(x, b));
    case '-notcontains': return !(Array.isArray(a) && a.some((x) => eq(x, b)));
    case '-in': return Array.isArray(b) && b.some((x) => eq(a, x));
    case '-notin': return !(Array.isArray(b) && b.some((x) => eq(a, x)));
    default: throw new PsError(`The operator '${op}' is not supported here.`, { id: 'OperatorNotSupported' });
  }
}

// ---------------------------------------------------------------------------------------------- formatting
const pad = (s, n, right) => (right ? String(s).padStart(n) : String(s).padEnd(n));
const WIDTH = 120;

function lineWrapValue(v, indent) {
  const s = fmtVal(v);
  return s.split('\n').map((l, i) => (i === 0 ? l : `${' '.repeat(indent)}${l}`)).join('\n');
}

function formatList(objs, props) {
  const out = [];
  for (const o of objs) {
    const keys = props || Object.keys(o).filter((k) => !k.startsWith('__'));
    const w = Math.max(...keys.map((k) => k.length));
    for (const k of keys) out.push(`${pad(k, w)} : ${lineWrapValue(get(o, k), w + 3)}`);
    out.push('');
  }
  return out.length ? `\n${out.join('\n')}\n` : '';
}

function formatTable(objs, props, { header = true } = {}) {
  const keys = props || [...new Set(objs.flatMap((o) => Object.keys(o).filter((k) => !k.startsWith('__'))))];
  const cells = objs.map((o) => keys.map((k) => fmtVal(get(o, k)).split('\n')[0]));
  const numeric = keys.map((k) => objs.every((o) => get(o, k) === null || get(o, k) === undefined || typeof get(o, k) === 'number'));
  let widths = keys.map((k, i) => Math.max(k.length, ...cells.map((r) => r[i].length)));
  // like PowerShell: shrink the last column to fit the window and mark the cut
  const total = widths.reduce((a, b) => a + b, 0) + (keys.length - 1);
  if (total > WIDTH && keys.length > 1) widths[widths.length - 1] = Math.max(8, widths[widths.length - 1] - (total - WIDTH));
  const line = (arr) => arr.map((c, i) => (i === keys.length - 1 ? (c.length > widths[i] ? `${c.slice(0, widths[i] - 3)}...` : c) : pad(c, widths[i], numeric[i]))).join(' ').trimEnd();
  const rows = [];
  if (header) { rows.push(line(keys)); rows.push(line(keys.map((k, i) => '-'.repeat(k.length)).map((d, i) => (numeric[i] ? d.padStart(widths[i]) : d)))); }
  for (const r of cells) rows.push(line(r));
  return `\n${rows.join('\n')}\n\n`;
}

function formatDefault(items) {
  const objs = items.filter(isObj);
  const plain = items.filter((x) => !isObj(x));
  let out = plain.map((x) => (Array.isArray(x) ? x.join('\n') : fmtVal(x))).join('\n');
  if (out) out += '\n';
  if (!objs.length) return out;
  // group consecutive objects by type, like PowerShell does
  const t = objs[0].__t;
  if (t === 'EventLogRecord') {
    const byProv = new Map();
    for (const o of objs) byProv.set(o.ProviderName, [...(byProv.get(o.ProviderName) || []), o]);
    return out + [...byProv].map(([prov, list]) => `\n   ProviderName: ${prov}\n${formatTable(list.map((o) => mk('x', { TimeCreated: o.TimeCreated, Id: o.Id, LevelDisplayName: o.LevelDisplayName, Message: String(o.Message).split('\n')[0] })), ['TimeCreated', 'Id', 'LevelDisplayName', 'Message'])}`).join('');
  }
  if (t === 'FileInfo') return out + formatTable(objs, ['Mode', 'LastWriteTime', 'Length', 'Name']);
  if (['ADUser', 'ADGroup', 'ADComputer', 'ADPrincipal', 'ADDomain', 'ADDC', 'Measure', 'Policy'].includes(t)) return out + formatList(objs);
  const keys = [...new Set(objs.flatMap((o) => Object.keys(o).filter((k) => !k.startsWith('__'))))];
  return out + (keys.length <= 4 ? formatTable(objs, keys) : formatList(objs));
}

// ---------------------------------------------------------------------------------------------- the interpreter
const ALIASES = {
  gci: 'Get-ChildItem', ls: 'Get-ChildItem', dir: 'Get-ChildItem', cat: 'Get-Content', gc: 'Get-Content', type: 'Get-Content',
  cd: 'Set-Location', sl: 'Set-Location', chdir: 'Set-Location', pwd: 'Get-Location', gl: 'Get-Location',
  ft: 'Format-Table', fl: 'Format-List', select: 'Select-Object', sort: 'Sort-Object', where: 'Where-Object', '?': 'Where-Object',
  '%': 'ForEach-Object', foreach: 'ForEach-Object', measure: 'Measure-Object', group: 'Group-Object', sls: 'Select-String',
  echo: 'Write-Output', write: 'Write-Output', cls: 'Clear-Host', clear: 'Clear-Host', gwe: 'Get-WinEvent', ogv: 'Out-GridView', man: 'Get-Help', help: 'Get-Help',
};

const PARAMS = {
  'Get-ADUser': { pos: ['Identity'], values: ['Identity', 'Filter', 'Properties', 'SearchBase', 'Server', 'ResultSetSize', 'LDAPFilter'], switches: [] },
  'Get-ADGroup': { pos: ['Identity'], values: ['Identity', 'Filter', 'Properties', 'SearchBase', 'Server'], switches: [] },
  'Get-ADComputer': { pos: ['Identity'], values: ['Identity', 'Filter', 'Properties', 'SearchBase', 'Server'], switches: [] },
  'Get-ADGroupMember': { pos: ['Identity'], values: ['Identity', 'Server'], switches: ['Recursive'] },
  'Get-ADPrincipalGroupMembership': { pos: ['Identity'], values: ['Identity', 'Server'], switches: [] },
  'Get-ADDomain': { pos: ['Identity'], values: ['Identity', 'Server'], switches: [] },
  'Get-ADDomainController': { pos: ['Identity'], values: ['Identity', 'Filter', 'Server'], switches: ['Discover'] },
  'Get-ADDefaultDomainPasswordPolicy': { pos: [], values: ['Identity', 'Server'], switches: [] },
  'Get-WinEvent': { pos: ['LogName'], values: ['LogName', 'FilterHashtable', 'MaxEvents', 'ComputerName', 'ProviderName'], switches: ['Oldest'] },
  'Get-Content': { pos: ['Path'], values: ['Path', 'Tail', 'TotalCount', 'Head', 'First'], switches: [] },
  'Select-String': { pos: ['Pattern', 'Path'], values: ['Pattern', 'Path', 'Context'], switches: ['SimpleMatch', 'CaseSensitive', 'NotMatch', 'List'] },
  'Get-ChildItem': { pos: ['Path'], values: ['Path', 'Filter', 'Include'], switches: ['Recurse', 'Force', 'File', 'Directory'] },
  'Set-Location': { pos: ['Path'], values: ['Path'], switches: [] },
  'Select-Object': { pos: ['Property'], values: ['Property', 'First', 'Last', 'ExpandProperty', 'Skip'], switches: ['Unique'] },
  'Sort-Object': { pos: ['Property'], values: ['Property'], switches: ['Descending', 'Unique'] },
  'Group-Object': { pos: ['Property'], values: ['Property'], switches: ['NoElement'] },
  'Measure-Object': { pos: ['Property'], values: ['Property'], switches: ['Sum', 'Average', 'Maximum', 'Minimum', 'Line', 'Word', 'Character'] },
  'Where-Object': { pos: ['FilterScript'], values: ['FilterScript', 'Property', 'Value'], switches: [] },
  'ForEach-Object': { pos: ['Process'], values: ['Process', 'MemberName'], switches: [] },
  'Format-Table': { pos: ['Property'], values: ['Property'], switches: ['AutoSize', 'Wrap', 'HideTableHeaders'] },
  'Format-List': { pos: ['Property'], values: ['Property'], switches: [] },
  'Out-String': { pos: [], values: ['Width'], switches: ['Stream'] },
  'Get-Date': { pos: [], values: ['Format'], switches: [] },
  'Write-Output': { pos: ['InputObject'], values: ['InputObject'], switches: [] },
  'Get-Help': { pos: ['Name'], values: ['Name'], switches: ['Examples', 'Full'] },
};

function bindArgs(cmd, tokens) {
  const spec = PARAMS[cmd] || { pos: [], values: [], switches: [] };
  const all = [...spec.values, ...spec.switches];
  const named = {};
  const positional = [];
  const take = (i) => {
    const vals = [];
    let j = i;
    for (;;) {
      const t = tokens[j];
      if (!t || t.t === 'param') break;
      vals.push(t);
      j++;
      if (tokens[j]?.t === 'comma') j++;
      else break;
    }
    return [vals, j];
  };
  for (let i = 0; i < tokens.length;) {
    const t = tokens[i];
    if (t.t === 'param') {
      const cand = all.filter((a) => lc(a).startsWith(lc(t.v)));
      const exact = all.find((a) => lc(a) === lc(t.v));
      const name = exact || (cand.length === 1 ? cand[0] : null);
      if (!name) throw new PsError(`A parameter cannot be found that matches parameter name '${t.v}'.`, { cat: 'InvalidArgument', id: 'NamedParameterNotFound', target: t.v });
      if (spec.switches.includes(name)) { named[name] = t.inline !== undefined ? t.inline !== 'false' && t.inline !== '$false' : true; i++; continue; }
      if (t.inline !== undefined) { named[name] = [{ t: 'word', v: t.inline }]; i++; continue; }
      const [vals, j] = take(i + 1);
      if (!vals.length) throw new PsError(`Missing an argument for parameter '${name}'. Specify a parameter of type 'System.String' and try again.`, { cat: 'InvalidArgument', id: 'MissingArgument', target: name });
      named[name] = vals;
      i = j;
    } else {
      const [vals, j] = take(i);
      positional.push(vals);
      i = j;
    }
  }
  spec.pos.forEach((p, i) => { if (positional[i] && named[p] === undefined) named[p] = positional[i]; });
  return named;
}

export function runPwsh(line, ctx) {
  const text = line.trim();
  if (!text) return { out: '', cwd: ctx.cwd };
  const state = { cwd: ctx.cwd, clear: false, errors: [] };
  const full = { ...ctx, state };
  let out = '';
  try {
    for (const statement of splitTop(text, ';')) {
      if (!statement) continue;
      const res = pipeline(statement, full);
      out += res;
      if (state.clear) return { out: '', cwd: state.cwd, clear: true };
    }
  } catch (e) {
    if (e instanceof PsError) {
      const first = text.split('|')[0].trim();
      const name = first.split(/\s+/)[0];
      const caret = first.length ? '~'.repeat(first.length) : '~';
      return {
        out: `${out}${name} : ${e.message}\nAt line:1 char:1\n+ ${first}\n+ ${caret}\n    + CategoryInfo          : ${e.cat}: (${e.target || name}:String) [${name}], ${e.id}\n    + FullyQualifiedErrorId : ${e.id}\n`,
        cwd: state.cwd,
        error: true,
      };
    }
    throw e;
  }
  return { out, cwd: state.cwd };
}

function pipeline(statement, ctx) {
  // $var = expression
  const asg = statement.match(/^\$(\w+)\s*=\s*(.+)$/s);
  if (asg) {
    const r = runStages(splitTop(asg[2], '|'), ctx);
    ctx.vars = { ...(ctx.vars || {}), [lc(asg[1])]: r.length === 1 ? r[0] : r };
    return '';
  }
  const objs = runStages(splitTop(statement, '|'), ctx);
  return render(objs, ctx);
}

function render(objs, ctx) {
  if (ctx.state.rendered) { const r = ctx.state.rendered; ctx.state.rendered = null; return r; }
  return formatDefault(objs);
}

function runStages(stages, ctx) {
  let data = null; // null = no pipeline input yet
  for (const stage of stages) {
    if (!stage) throw new PsError('An empty pipe element is not allowed.', { id: 'EmptyPipeElement' });
    data = runStage(stage, data, ctx);
  }
  return data ?? [];
}

const arr = (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);
const word = (t) => (t ? (t.t === 'str' && t.expand ? t.v : t.v) : undefined);
const list = (vals) => (vals || []).flatMap((t) => (t.t === 'paren' ? arr(subExpr(t)) : [word(t)]));
let CUR_CTX = null;
const subExpr = (t) => {
  const r = runStages(splitTop(t.v, '|'), CUR_CTX);
  return applyTail(r, t.tail);
};
function applyTail(r, tail) {
  if (!tail) return r;
  let v = r.length === 1 ? r[0] : r;
  for (const part of tail.replace(/^\./, '').split('.').filter(Boolean)) v = get(v, part.replace(/\[.*$/, ''));
  return arr(v);
}

function runStage(stage, input, ctx) {
  CUR_CTX = ctx;
  const toks = tokenizeStage(stage);
  if (!toks.length) return input ?? [];
  // (expr).Property  or  $var.Property  or a bare expression
  if (toks[0].t === 'paren') return applyTail(runStages(splitTop(toks[0].v, '|'), ctx), toks[0].tail);
  if (toks[0].t === 'word' && toks[0].v.startsWith('$')) {
    try { return arr(evalExpr(stage, { item: null, vars: ctx.vars, user: ctx.user, host: ctx.host, netbios: ctx.dir?.netbios, domain: ctx.dir?.domain })); } catch (e) { if (e instanceof PsError) throw e; throw e; }
  }
  if (toks[0].t === 'str') return [toks[0].v];
  const name0 = toks[0].v;
  const cmd = ALIASES[lc(name0)] || canonical(name0);
  const rest = toks.slice(1);
  const handler = CMDLETS[cmd];
  // Simplified Where-Object syntax (`Where-Object Enabled -eq $true`, `? Name -like 'svc*'`): rewrite to a script block.
  if (cmd === 'Where-Object' && rest.length && rest[0].t !== 'block') {
    const [prop, ...tail] = rest;
    const v = tail.length ? ` ${tail.map((t) => (t.t === 'param' ? `-${t.v}` : t.t === 'str' ? `'${t.v}'` : rawArg(t))).join(' ')}` : '';
    return handler(bindArgs(cmd, [{ t: 'block', v: `$_.${rawArg(prop)}${v}` }]), input, ctx, rest);
  }
  if (handler) return handler(bindArgs(cmd, rest), input, ctx, rest);
  const nat = NATIVE[lc(name0)];
  if (nat) return nativeLines(nat(rest.map(rawArg), ctx));
  const custom = ctx.commands?.[lc(name0)];
  if (custom) return arr(custom(rest.map(rawArg), input, ctx));
  throw new PsError(`The term '${name0}' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.`, { cat: 'ObjectNotFound', id: 'CommandNotFoundException', target: name0 });
}

// A native command's text output becomes one string per line, so it flows through the pipeline like real stdout.
const rawArg = (t) => (t.t === 'param' ? `-${t.v}${t.inline !== undefined ? `:${t.inline}` : ''}` : t.v ?? '');
const nativeLines = (text) => String(text).replace(/\n$/, '').split('\n');
const CMD_NAMES = ['Get-ADUser', 'Get-ADGroup', 'Get-ADComputer', 'Get-ADGroupMember', 'Get-ADPrincipalGroupMembership', 'Get-ADDomain', 'Get-ADDomainController', 'Get-ADDefaultDomainPasswordPolicy', 'Get-WinEvent', 'Get-Content', 'Select-String', 'Get-ChildItem', 'Set-Location', 'Get-Location', 'Select-Object', 'Sort-Object', 'Group-Object', 'Measure-Object', 'Where-Object', 'ForEach-Object', 'Format-Table', 'Format-List', 'Out-String', 'Out-Host', 'Get-Date', 'Write-Output', 'Write-Host', 'Clear-Host', 'Get-Help', 'Get-Command', 'Get-Process'];
const canonical = (n) => CMD_NAMES.find((c) => lc(c) === lc(n)) || n;

// ---- helpers for cmdlets
const propList = (vals) => list(vals).map(String).flatMap((s) => s.split(','));
const hashtable = (t) => {
  const out = {};
  if (!t || t.t !== 'hash') return out;
  for (const pair of splitTop(t.v, ';')) {
    if (!pair) continue;
    const m = pair.match(/^\s*([\w]+)\s*=\s*(.+)$/s);
    if (!m) continue;
    const vals = splitTop(m[2], ',').map((x) => x.trim().replace(/^['"]|['"]$/g, ''));
    out[lc(m[1])] = vals.length === 1 ? (/^\d+$/.test(vals[0]) ? Number(vals[0]) : vals[0]) : vals.map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  }
  return out;
};

// AD -Filter: an expression over attribute names; '*' matches everything.
function adFilter(f, ctx) {
  const src = f.trim();
  if (src === '*' || src === '') return () => true;
  return (o, extended) => {
    const bag = extended;
    const scope = { item: bag, vars: ctx.vars };
    // property names in an AD filter are bare words: turn  Name -like 'x'  into $_.Name -like 'x'
    const rewritten = src.replace(/(^|[\s(])([A-Za-z_][\w]*)(\s+-(?:eq|ne|like|notlike|match|notmatch|gt|lt|ge|le|contains|in)\b)/gi, (m, a, p, b) => `${a}$_.${p}${b}`);
    return truthy(evalExpr(rewritten, scope));
  };
}

function adTargets(kind, dir) {
  return kind === 'user' ? dir.users : kind === 'group' ? dir.groups : dir.computers;
}

function getAD(kind) {
  return (named, input, ctx) => {
    const dir = ctx.dir;
    if (!dir) throw new PsError("The term 'Get-ADUser' is not recognized as the name of a cmdlet, function, script file, or operable program. (The ActiveDirectory module is not installed on this machine.)", { cat: 'ObjectNotFound', id: 'CommandNotFoundException' });
    const wanted = propList(named.Properties);
    const typeName = kind === 'user' ? 'ADUser' : kind === 'group' ? 'ADGroup' : 'ADComputer';
    const label = kind === 'user' ? 'ADUser' : kind === 'group' ? 'ADGroup' : 'ADComputer';
    const cmdName = kind === 'user' ? 'GetADUser' : kind === 'group' ? 'GetADGroup' : 'GetADComputer';
    if (named.Identity) {
      const idv = list(named.Identity).map((x) => (isObj(x) ? x.SamAccountName || x.Name : x));
      const res = idv.map((id) => {
        const o = dir.lookup(id);
        if (!o || o.type !== kind) throw new PsError(`Cannot find an object with identity: '${id}' under: '${dir.dn}'.`, { cat: 'ObjectNotFound', id: `ActiveDirectoryCmdlet:Microsoft.ActiveDirectory.Management.ADIdentityNotFoundException,Microsoft.ActiveDirectory.Management.Commands.${cmdName}`, target: `${id}:${label}` });
        return asObject(o, dir, wanted, typeName);
      });
      return res;
    }
    if (named.Filter || named.LDAPFilter) {
      const fv = named.Filter ? word(named.Filter[0]) : '*';
      const pred = adFilter(fv, ctx);
      const base = named.SearchBase ? lc(word(named.SearchBase[0])) : null;
      return adTargets(kind, dir)
        .filter((o) => !base || lc(o.dn).endsWith(base))
        .filter((o) => {
          const bag = kind === 'user' ? userProps(o, dir, true) : kind === 'group' ? groupProps(o, dir, true) : computerProps(o, dir, true);
          return pred(o, { ...bag, DoesNotRequirePreAuth: bag.DoesNotRequirePreAuth, Enabled: o.enabled });
        })
        .map((o) => asObject(o, dir, wanted, typeName));
    }
    throw new PsError("Cannot process command because of one or more missing mandatory parameters: Filter.", { cat: 'InvalidArgument', id: 'ParameterBindingException' });
  };
}

const CMDLETS = {
  'Get-ADUser': getAD('user'),
  'Get-ADGroup': getAD('group'),
  'Get-ADComputer': getAD('computer'),
  'Get-ADGroupMember': (named, input, ctx) => {
    const dir = ctx.dir;
    const id = word(named.Identity?.[0]) ?? (input && input[0]?.Name);
    const g = dir.groups.find((x) => lc(x.name) === lc(id));
    if (!g) throw new PsError(`Cannot find an object with identity: '${id}' under: '${dir.dn}'.`, { cat: 'ObjectNotFound', id: 'ActiveDirectoryCmdlet:Microsoft.ActiveDirectory.Management.ADIdentityNotFoundException,Microsoft.ActiveDirectory.Management.Commands.GetADGroupMember', target: `${id}:ADGroup` });
    return dir.groupMembers(g.name, { recursive: !!named.Recursive }).map((m) => mk('ADPrincipal', { distinguishedName: m.dn, name: m.name, objectClass: m.type, objectGUID: m.guid, SamAccountName: m.sam, SID: m.sid }));
  },
  'Get-ADPrincipalGroupMembership': (named, input, ctx) => {
    const dir = ctx.dir;
    const id = word(named.Identity?.[0]) ?? (input && input[0]?.SamAccountName);
    const o = dir.lookup(id);
    if (!o) throw new PsError(`Cannot find an object with identity: '${id}' under: '${dir.dn}'.`, { cat: 'ObjectNotFound', id: 'ActiveDirectoryCmdlet:Microsoft.ActiveDirectory.Management.ADIdentityNotFoundException,Microsoft.ActiveDirectory.Management.Commands.GetADPrincipalGroupMembership', target: `${id}:ADPrincipal` });
    return o.memberOf.map((n) => dir.groups.find((x) => lc(x.name) === lc(n))).filter(Boolean).map((g) => mk('ADGroup', { distinguishedName: g.dn, GroupCategory: g.category, GroupScope: g.scope, name: g.name, objectClass: 'group', objectGUID: g.guid, SamAccountName: g.sam, SID: g.sid }));
  },
  'Get-ADDomain': (named, input, ctx) => {
    const d = ctx.dir;
    const dc = d.computers.find((c) => c.role === 'Domain Controller');
    return [mk('ADDomain', {
      AllowedDNSSuffixes: [], ChildDomains: [], ComputersContainer: `CN=Computers,${d.dn}`, DeletedObjectsContainer: `CN=Deleted Objects,${d.dn}`, DistinguishedName: d.dn,
      DNSRoot: d.domain, DomainControllersContainer: `OU=Domain Controllers,${d.dn}`, DomainMode: 'Windows2016Domain', DomainSID: d.sid, ForeignSecurityPrincipalsContainer: `CN=ForeignSecurityPrincipals,${d.dn}`,
      Forest: d.domain, InfrastructureMaster: dc?.dns, LastLogonReplicationInterval: null, LinkedGroupPolicyObjects: [`CN={31B2F340-016D-11D2-945F-00C04FB984F9},CN=Policies,CN=System,${d.dn}`], ManagedBy: null, Name: d.netbios,
      NetBIOSName: d.netbios, ObjectClass: 'domainDNS', ObjectGUID: '7c4f3e1a-5b7d-4d0e-9a52-1a6f2c0b9d33', ParentDomain: null, PDCEmulator: dc?.dns, RIDMaster: dc?.dns, SystemsContainer: `CN=System,${d.dn}`, UsersContainer: `CN=Users,${d.dn}`,
    })];
  },
  'Get-ADDomainController': (named, input, ctx) => ctx.dir.computers.filter((c) => c.role === 'Domain Controller').map((c) => mk('ADDC', { ComputerObjectDN: c.dn, DefaultPartition: ctx.dir.dn, Domain: ctx.dir.domain, Enabled: true, Forest: ctx.dir.domain, HostName: c.dns, InvocationId: c.guid, IPv4Address: c.ip, IsGlobalCatalog: true, IsReadOnly: false, Name: c.name, OperatingSystem: c.os, Site: 'Default-First-Site-Name' })),
  'Get-ADDefaultDomainPasswordPolicy': (named, input, ctx) => [mk('Policy', { ComplexityEnabled: true, DistinguishedName: ctx.dir.dn, LockoutDuration: '00:30:00', LockoutObservationWindow: '00:30:00', LockoutThreshold: 0, MaxPasswordAge: '90.00:00:00', MinPasswordAge: '1.00:00:00', MinPasswordLength: 8, objectClass: 'domainDNS', PasswordHistoryCount: 24, ReversibleEncryptionEnabled: false })],
  'Get-WinEvent': (named, input, ctx) => {
    const hashTok = named.FilterHashtable?.[0];
    const f = hashtable(hashTok);
    const logName = lc(word(named.LogName?.[0]) ?? f.logname ?? 'Security');
    const ids = f.id === undefined ? null : arr(f.id).map(Number);
    const events = (ctx.events?.() || []).filter((e) => e.fields?.EventCode && e.fields?.LogName);
    let hits = events.filter((e) => lc(e.fields.LogName[0]) === logName && (!ids || ids.includes(Number(e.fields.EventCode[0]))));
    if (f.data) hits = hits.filter((e) => lc(e.raw).includes(lc(arr(f.data)[0])));
    if (f.providername) hits = hits.filter((e) => lc(e.fields.SourceName?.[0] || '').includes(lc(f.providername)));
    if (f.userid) hits = hits.filter((e) => lc(e.raw).includes(lc(f.userid)));
    hits = [...hits].reverse(); // newest first, like Get-WinEvent
    if (named.Oldest) hits.reverse();
    if (named.MaxEvents) hits = hits.slice(0, Number(word(named.MaxEvents[0])));
    if (!hits.length) throw new PsError('No events were found that match the specified selection criteria.', { cat: 'ObjectNotFound', id: 'NoMatchingEventsFound,Microsoft.PowerShell.Commands.GetWinEventCommand', target: '' });
    return hits.map((e) => mk('EventLogRecord', {
      TimeCreated: e.splunkTime.replace(/^(\d+)\/(\d+)\/(\d+)/, (m, mm, dd, yy) => `${Number(mm)}/${Number(dd)}/20${yy}`).replace(/\.000 /, ' '),
      Id: Number(e.fields.EventCode[0]),
      LevelDisplayName: 'Information',
      ProviderName: e.fields.SourceName?.[0]?.replace(/\.$/, '').replace('Microsoft Windows security auditing', 'Microsoft-Windows-Security-Auditing') || 'Microsoft-Windows-Security-Auditing',
      LogName: e.fields.LogName[0],
      MachineName: e.fields.ComputerName?.[0] || '',
      RecordId: Number(e.fields.RecordNumber?.[0] || 0),
      Message: e.raw.split('\nMessage=').slice(1).join('\nMessage=') || e.raw,
    }));
  },
  'Get-Content': (named, input, ctx) => {
    const p = list(named.Path)[0];
    if (p === undefined && input) return input.map(String);
    const file = ctx.fs?.[winPath(p, ctx)];
    if (file === undefined) throw new PsError(`Cannot find path '${p}' because it does not exist.`, { cat: 'ObjectNotFound', id: 'PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand', target: p });
    let ls = file.replace(/\n$/, '').split('\n');
    if (named.Tail) ls = ls.slice(-Number(word(named.Tail[0])));
    const head = named.TotalCount || named.Head || named.First;
    if (head) ls = ls.slice(0, Number(word(head[0])));
    return ls;
  },
  'Select-String': (named, input, ctx) => {
    const pat = list(named.Pattern)[0];
    if (pat === undefined) throw new PsError("Cannot bind argument to parameter 'Pattern' because it is null.", { cat: 'InvalidData', id: 'ParameterArgumentValidationErrorNullNotAllowed' });
    const re = named.SimpleMatch ? new RegExp(String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), named.CaseSensitive ? '' : 'i') : new RegExp(pat, named.CaseSensitive ? '' : 'i');
    const hit = (l) => re.test(l) !== !!named.NotMatch;
    const paths = list(named.Path);
    if (paths.length) {
      const out = [];
      for (const p of paths) {
        const file = ctx.fs?.[winPath(p, ctx)];
        if (file === undefined) throw new PsError(`Cannot find path '${p}' because it does not exist.`, { cat: 'ObjectNotFound', id: 'FileNotFound,Microsoft.PowerShell.Commands.SelectStringCommand', target: p });
        file.replace(/\n$/, '').split('\n').forEach((l, i) => { if (hit(l)) out.push(`${winPath(p, ctx).replace(/^[a-z]:/i, (d) => d.toUpperCase())}:${i + 1}:${l}`); });
      }
      return out;
    }
    return (input || []).map((x) => (isObj(x) ? fmtVal(x) : String(x))).flatMap((s) => s.split('\n')).filter(hit);
  },
  'Get-ChildItem': (named, input, ctx) => {
    const p = list(named.Path)[0] ?? ctx.state.cwd;
    const base = winPath(p, ctx).replace(/\\$/, '');
    const files = Object.keys(ctx.fs || {}).filter((f) => lc(f).startsWith(`${lc(base)}\\`));
    if (!files.length && ctx.fs?.[base] === undefined) throw new PsError(`Cannot find path '${p}' because it does not exist.`, { cat: 'ObjectNotFound', id: 'PathNotFound,Microsoft.PowerShell.Commands.GetChildItemCommand', target: p });
    const seen = new Set();
    const res = [];
    for (const f of files) {
      const rel = f.slice(base.length + 1);
      const first = rel.split('\\')[0];
      if (seen.has(first)) continue;
      seen.add(first);
      const isDir = rel.includes('\\');
      res.push(mk('FileInfo', { Mode: isDir ? 'd-----' : '-a----', LastWriteTime: '10/19/2026  8:41 AM', Length: isDir ? '' : String(ctx.fs[f].length), Name: first }));
    }
    return res;
  },
  'Set-Location': (named, input, ctx) => {
    const p = list(named.Path)[0] ?? 'C:\\Users\\analyst01';
    const target = winPath(p, ctx).replace(/\\$/, '');
    const isDir = target === 'C:' || Object.keys(ctx.fs || {}).some((f) => lc(f).startsWith(`${lc(target)}\\`)) || lc(target) === lc(ctx.home);
    if (!isDir) throw new PsError(`Cannot find path '${p}' because it does not exist.`, { cat: 'ObjectNotFound', id: 'PathNotFound,Microsoft.PowerShell.Commands.SetLocationCommand', target: p });
    ctx.state.cwd = target === 'C:' ? 'C:\\' : target;
    return [];
  },
  'Get-Location': (named, input, ctx) => {
    ctx.state.rendered = `\nPath\n----\n${ctx.state.cwd}\n\n`;
    return [];
  },
  'Where-Object': (named, input, ctx) => {
    const t = named.FilterScript?.[0];
    if (!t || t.t !== 'block') throw new PsError("Where-Object needs a script block, for example: Where-Object { $_.Name -like 'svc*' }", { cat: 'InvalidArgument', id: 'ParameterBindingException' });
    return (input || []).filter((o) => truthy(evalExpr(t.v, { item: o, vars: ctx.vars, user: ctx.user, host: ctx.host })));
  },
  'ForEach-Object': (named, input, ctx) => {
    const t = named.Process?.[0] || (named.MemberName && { t: 'block', v: `$_.${word(named.MemberName[0])}` });
    if (!t || t.t !== 'block') throw new PsError('ForEach-Object needs a script block, for example: ForEach-Object { $_.Name }', { cat: 'InvalidArgument', id: 'ParameterBindingException' });
    return (input || []).flatMap((o) => arr(evalExpr(t.v, { item: o, vars: ctx.vars, user: ctx.user, host: ctx.host })));
  },
  'Select-Object': (named, input) => {
    let items = input || [];
    if (named.Skip) items = items.slice(Number(word(named.Skip[0])));
    if (named.First) items = items.slice(0, Number(word(named.First[0])));
    if (named.Last) items = items.slice(-Number(word(named.Last[0])));
    if (named.ExpandProperty) {
      const p = word(named.ExpandProperty[0]);
      return items.flatMap((o) => arr(get(o, p)));
    }
    const props = named.Property ? propList(named.Property) : null;
    if (!props) return named.Unique ? [...new Set(items.map(String))] : items;
    const res = items.map((o) => {
      const out = {};
      for (const p of props) {
        if (p === '*') { Object.assign(out, o); continue; }
        out[p] = get(o, p) ?? null;
      }
      return tag(out, 'Custom');
    });
    return named.Unique ? res.filter((r, i) => res.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i) : res;
  },
  'Sort-Object': (named, input) => {
    const props = named.Property ? propList(named.Property) : [];
    const items = [...(input || [])];
    const key = (o, p) => { const v = p ? get(o, p) : o; return v instanceof PsDate ? v.valueOf() : typeof v === 'number' ? v : v === undefined || v === null ? '' : !Number.isNaN(Number(v)) && String(v).trim() !== '' ? Number(v) : lc(v); };
    items.sort((a, b) => {
      for (const p of props.length ? props : [null]) {
        const x = key(a, p);
        const y = key(b, p);
        if (x < y) return -1;
        if (x > y) return 1;
      }
      return 0;
    });
    if (named.Descending) items.reverse();
    return named.Unique ? items.filter((r, i) => items.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i) : items;
  },
  'Group-Object': (named, input) => {
    const p = word(named.Property?.[0]);
    const groups = new Map();
    for (const o of input || []) {
      const k = p ? fmtVal(get(o, p)) : fmtVal(o);
      groups.set(k, [...(groups.get(k) || []), o]);
    }
    return [...groups].sort((a, b) => lc(a[0]).localeCompare(lc(b[0]))).map(([name, grp]) => mk('Group', { Count: grp.length, Name: name, Group: named.NoElement ? undefined : grp.map((g) => (isObj(g) ? Object.values(g)[0] : g)) })).map((g) => { if (g.Group === undefined) delete g.Group; return g; });
  },
  'Measure-Object': (named, input) => {
    const p = word(named.Property?.[0]);
    const items = input || [];
    const nums = p ? items.map((o) => Number(get(o, p))).filter((n) => !Number.isNaN(n)) : [];
    const o = { Count: items.length, Average: named.Average && nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null, Sum: named.Sum ? nums.reduce((a, b) => a + b, 0) : null, Maximum: named.Maximum && nums.length ? Math.max(...nums) : null, Minimum: named.Minimum && nums.length ? Math.min(...nums) : null, Property: p || null };
    return [mk('Measure', o)];
  },
  'Format-Table': (named, input, ctx) => {
    const props = named.Property ? propList(named.Property) : null;
    const objs = (input || []).map((o) => (isObj(o) ? o : mk('x', { Value: o })));
    const keys = props ? props.flatMap((p) => (p === '*' ? Object.keys(objs[0] || {}) : [p])) : null;
    ctx.state.rendered = formatTable(objs, keys, { header: !named.HideTableHeaders });
    return [];
  },
  'Format-List': (named, input, ctx) => {
    const props = named.Property ? propList(named.Property) : null;
    const objs = (input || []).map((o) => (isObj(o) ? o : mk('x', { Value: o })));
    const keys = props ? props.flatMap((p) => (p === '*' ? Object.keys(objs[0] || {}).filter((k) => !k.startsWith('__')) : [p])) : null;
    ctx.state.rendered = formatList(objs, keys);
    return [];
  },
  'Out-String': (named, input) => [formatDefault(input || []).replace(/\n$/, '')],
  'Out-Host': (named, input, ctx) => { ctx.state.rendered = formatDefault(input || []); return []; },
  'Get-Date': () => [new Date(Date.UTC(2026, 9, 21, 12, 30, 0)).toUTCString().replace('GMT', '').trim()],
  'Write-Output': (named, input) => (named.InputObject ? list(named.InputObject) : input || []),
  'Write-Host': (named, input, ctx, rest) => [rest.map((t) => t.v).join(' ')],
  'Clear-Host': (named, input, ctx) => { ctx.state.clear = true; return []; },
  'Get-Help': (named) => [`\nNAME\n    ${word(named.Name?.[0]) || 'Get-Help'}\n\nSYNOPSIS\n    \n\nREMARKS\n    To get help for a cmdlet, run: Get-Help <name> -Online\n    This machine has no internet access, so updatable help is not installed.\n`],
  'Get-Command': (named, input, ctx, rest) => CMD_NAMES.filter((c) => !rest.length || lc(c).includes(lc(rest[0].v?.replace(/\*/g, '') || ''))).map((c) => mk('Cmd', { CommandType: 'Cmdlet', Name: c, Version: c.includes('AD') ? '1.0.1.0' : '3.1.0.0', Source: c.includes('AD') ? 'ActiveDirectory' : 'Microsoft.PowerShell.Utility' })),
  'Get-Process': (named, input, ctx) => (ctx.procs ? ctx.procs().map((p) => mk('Proc', { Handles: p.handles || 300, 'WS(K)': p.ws || 24000, Id: p.pid, ProcessName: p.name, Path: p.path || '' })) : [mk('Proc', { Handles: 612, 'NPM(K)': 28, 'PM(K)': 40124, 'WS(K)': 61212, Id: 4316, ProcessName: 'powershell' })]),
};

function winPath(p, ctx) {
  if (p === undefined) return ctx.state.cwd;
  const s = String(p).replace(/\//g, '\\');
  if (/^[a-z]:/i.test(s)) return s.replace(/\\$/, '') || 'C:\\';
  if (s === '.') return ctx.state.cwd;
  if (s === '..') return ctx.state.cwd.split('\\').slice(0, -1).join('\\') || 'C:\\';
  return `${ctx.state.cwd.replace(/\\$/, '')}\\${s.replace(/^\.\\/, '')}`;
}

// ---------------------------------------------------------------------------------------------- native commands
const NATIVE = {
  whoami: (a, ctx) => {
    if (a.includes('/groups')) {
      const u = ctx.dir?.lookup(ctx.user);
      const gs = ['Everyone', 'BUILTIN\\Users', 'NT AUTHORITY\\INTERACTIVE', 'NT AUTHORITY\\Authenticated Users', ...(u ? ctx.dir.effectiveGroups(u).map((g) => `${ctx.dir.netbios}\\${g}`) : [])];
      return `\nGROUP INFORMATION\n-----------------\n\nGroup Name${' '.repeat(40)}Type             SID\n${'='.repeat(50)} ================ ============\n${gs.map((g) => `${g.padEnd(50)} Group            S-1-5-21-...`).join('\n')}\n`;
    }
    return `${(ctx.dir?.netbios || 'halcyon').toLowerCase()}\\${ctx.user || 'analyst01'}`;
  },
  hostname: (a, ctx) => ctx.host || 'WS-0142',
  ipconfig: (a, ctx) => `\nWindows IP Configuration\n\n\nEthernet adapter Ethernet0:\n\n   Connection-specific DNS Suffix  . : ${ctx.dir?.domain || 'halcyonmutual.local'}\n   IPv4 Address. . . . . . . . . . . : 10.0.4.142\n   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . . : 10.0.4.1\n`,
  net: (a, ctx) => {
    const dir = ctx.dir;
    const sub = lc(a[0] || '');
    const target = a.slice(1).filter((x) => !x.startsWith('/')).join(' ');
    if (!dir) return 'The syntax of this command is:\n\nNET\n    [ ACCOUNTS | COMPUTER | CONFIG | CONTINUE | FILE | GROUP | HELP |\n      HELPMSG | LOCALGROUP | PAUSE | SESSION | SHARE | START |\n      STATISTICS | STOP | TIME | USE | USER | VIEW ]';
    if (sub === 'user') {
      const u = dir.lookup(target);
      if (!target) return `\nUser accounts for \\\\${dir.dc}\n\n-------------------------------------------------------------------------------\n${dir.users.map((x) => x.sam).join('   ')}\nThe command completed successfully.\n`;
      if (!u || u.type !== 'user') return 'The user name could not be found.\n\nMore help is available by typing NET HELPMSG 2221.\n';
      const groups = u.memberOf.map((g) => `*${g}`);
      const grp = [];
      for (let i = 0; i < groups.length; i += 2) grp.push(groups.slice(i, i + 2).map((x) => x.padEnd(30)).join('').trimEnd());
      return `User name                    ${u.sam}\nFull Name                    ${u.display}\nComment                      ${u.desc}\nUser's comment\nCountry/region code          000 (System Default)\nAccount active               ${u.enabled ? 'Yes' : 'No'}\nAccount expires              Never\n\nPassword last set            ${adDate(u.pwdLastSet).replace(/ Eastern.*/, '')}\nPassword expires             ${u.uac & UAC.DONT_EXPIRE_PASSWORD ? 'Never' : '1/17/2027 9:14:02 AM'}\nPassword changeable          ${adDate(u.pwdLastSet).replace(/ Eastern.*/, '')}\nPassword required            Yes\nUser may change password     Yes\n\nWorkstations allowed         All\nLogon script                 \nUser profile                 \nHome directory               \nLast logon                   ${adDate(u.lastLogon).replace(/ Eastern.*/, '')}\n\nLogon hours allowed          All\n\nLocal Group Memberships      \nGlobal Group memberships     ${grp.join('\n                             ') || '*Domain Users'}\nThe command completed successfully.\n`;
    }
    if (sub === 'group') {
      if (!target) return `\nGroup Accounts for \\\\${dir.dc}\n\n-------------------------------------------------------------------------------\n${dir.groups.filter((g) => g.scope !== 'Domain Local').map((g) => `*${g.name}`).join('\n')}\nThe command completed successfully.\n`;
      const g = dir.groups.find((x) => lc(x.name) === lc(target));
      if (!g) return 'The specified group does not exist.\n\nMore help is available by typing NET HELPMSG 2220.\n';
      const mem = dir.groupMembers(g.name).map((m) => m.sam);
      const rows = [];
      for (let i = 0; i < mem.length; i += 3) rows.push(mem.slice(i, i + 3).map((x) => x.padEnd(25)).join('').trimEnd());
      return `Group name     ${g.name}\nComment        ${g.desc}\n\nMembers\n\n-------------------------------------------------------------------------------\n${rows.join('\n')}\nThe command completed successfully.\n`;
    }
    if (sub === 'localgroup') {
      const g = dir.groups.find((x) => lc(x.name) === lc(target) && x.scope === 'Domain Local');
      if (!target) return `\nAliases for \\\\${dir.dc}\n\n-------------------------------------------------------------------------------\n${dir.groups.filter((x) => x.scope === 'Domain Local').map((x) => `*${x.name}`).join('\n')}\nThe command completed successfully.\n`;
      if (!g) return 'The specified local group does not exist.\n\nMore help is available by typing NET HELPMSG 2220.\n';
      return `Alias name     ${g.name}\nComment        ${g.desc}\n\nMembers\n\n-------------------------------------------------------------------------------\n${dir.groupMembers(g.name).map((m) => m.sam).join('\n')}\nThe command completed successfully.\n`;
    }
    return 'The syntax of this command is:\n\nNET USER [username [password | *] [options]] [/DOMAIN]\nNET GROUP [groupname [/COMMENT:"text"]] [/DOMAIN]\n';
  },
  nltest: (a, ctx) => {
    const d = ctx.dir;
    if (!d) return 'The command is not available on this machine.';
    if (a.some((x) => /^\/dclist/i.test(x))) return `Get list of DCs in domain '${d.netbios}' from '\\\\${d.dc}'.\n${d.computers.filter((c) => c.role === 'Domain Controller').map((c, i) => `    ${c.dns} [${i ? '' : 'PDC'}]  [DS] Site: Default-First-Site-Name`).join('\n')}\nThe command completed successfully\n`;
    if (a.some((x) => /^\/dsgetdc/i.test(x))) return `           DC: \\\\${d.dc}.${d.domain}\n      Address: \\\\${d.computers.find((c) => c.name === d.dc)?.ip}\n     Dom Guid: 7c4f3e1a-5b7d-4d0e-9a52-1a6f2c0b9d33\n     Dom Name: ${d.netbios}\n  Forest Name: ${d.domain}\n Dc Site Name: Default-First-Site-Name\nOur Site Name: Default-First-Site-Name\n        Flags: PDC GC DS LDAP KDC TIMESERV WRITABLE DNS_DC DNS_DOMAIN DNS_FOREST CLOSE_SITE FULL_SECRET WS DS_8 DS_9 DS_10\nThe command completed successfully\n`;
    return 'Usage: nltest [/OPTIONS]\n';
  },
  setspn: (a, ctx) => {
    const d = ctx.dir;
    const flag = lc(a[0] || '');
    if (flag === '-l' || flag === '/l') {
      const o = d.lookup(a[1]);
      if (!o) return `Cannot find account ${a[1] || ''}\n`;
      return `Registered ServicePrincipalNames for ${o.dn}:\n${(o.spn || []).map((s) => `        ${s}`).join('\n') || ''}\n`;
    }
    if (flag === '-q' || flag === '/q' || flag === '-t' || flag === '-x') {
      const hits = d.all.filter((o) => (o.spn || []).length && o.type === 'user');
      return `Checking domain ${d.dn}\n${hits.map((o) => `${o.dn}\n${o.spn.map((s) => `        ${s}`).join('\n')}`).join('\n')}\n\nExisting SPN found!\n`;
    }
    return 'Usage: setspn [modifiers switch] [accountname]\n  -L  list SPNs registered for the account\n  -Q  query for existing SPN\n';
  },
  klist: () => '\nCurrent LogonId is 0:0x2d41f7\n\nCached Tickets: (0)\n',
  nslookup: (a, ctx) => {
    const h = lc(a[0] || '');
    const d = ctx.dir;
    const c = d?.computers.find((x) => lc(x.dns) === h || lc(x.name) === h);
    if (!c) return `*** UnKnown can't find ${a[0] || ''}: Non-existent domain\n`;
    return `Server:  ${d.computers.find((x) => x.name === d.dc).dns}\nAddress:  ${d.computers.find((x) => x.name === d.dc).ip}\n\nName:    ${c.dns}\nAddress:  ${c.ip}\n`;
  },
};

export const psPrompt = (cwd) => `PS ${cwd}> `;

// Exposed for tests
export const _internal = { tokenizeStage, evalExpr, splitTop, formatTable, formatList };
export { uacNames };
