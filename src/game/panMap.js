// PAN-OS model for the Palo Alto in the Invitational replay. One config model drives both the typed CLI
// (set/delete/move/commit, as on the PA-VM console) and the web UI (PanOsApp turns every click into the same
// command line, so grading never depends on which one the player used).
//
// The firewall keeps a CANDIDATE config (what you edit) and a RUNNING config (what the box enforces). Nothing
// is live until `commit` copies candidate to running — the lesson from Nov 14. Scored services are judged
// against RUNNING: for each service the first enabled rule that matches decides allow or deny, and the
// predefined interzone-default denies anything left. Everything is simulated.

const clone = (x) => JSON.parse(JSON.stringify(x));

export const PAN_PREDEFINED = [
  { name: 'intrazone-default', type: 'intrazone', from: ['any'], to: ['(intrazone)'], source: ['any'], destination: ['any'], application: ['any'], service: ['any'], action: 'allow', predefined: true, logEnd: false },
  { name: 'interzone-default', type: 'interzone', from: ['any'], to: ['any'], source: ['any'], destination: ['any'], application: ['any'], service: ['any'], action: 'deny', predefined: true, logEnd: false },
];

/** Starting PAN config: the two allow-everything rules found on Nov 14, no profile groups, nothing logged. */
export function initialPan() {
  const rules = [
    { name: 'Permit Outbound', type: 'interzone', from: ['any'], to: ['any'], source: ['any'], destination: ['any'], application: ['any'], service: ['any'], action: 'allow', logEnd: true },
    { name: 'Permit Inbound', type: 'interzone', from: ['external'], to: ['any'], source: ['any'], destination: ['any'], application: ['any'], service: ['application-default'], action: 'allow', logEnd: true },
  ];
  const cfg = { rules, profileGroups: {}, defaults: clone(PAN_PREDEFINED), adminChanged: false };
  return { candidate: clone(cfg), running: clone(cfg), dirty: false, commits: 0, lastCommit: null };
}

// What each scored service looks like to the firewall: inside address, the App-IDs that carry it, and the port
// (for a service-object rule such as "tcp-5985").
export const PAN_SERVICE_MAP = {
  'ecomm-http': { ip: '172.20.240.10', apps: ['web-browsing', 'ssl'], ports: ['tcp-80', 'tcp-443'] },
  'ecomm-ping': { ip: '172.20.240.10', apps: ['ping', 'icmp'], ports: [] },
  'webmail-smtp': { ip: '172.20.240.15', apps: ['smtp'], ports: ['tcp-25'] },
  'webmail-imap': { ip: '172.20.240.15', apps: ['imap'], ports: ['tcp-143'] },
  'webmail-ssh': { ip: '172.20.240.15', apps: ['ssh'], ports: ['tcp-22'] },
  'splunk-ssh': { ip: '172.20.240.20', apps: ['ssh'], ports: ['tcp-22'] },
  'splunk-chrony': { ip: '172.20.240.20', apps: ['ntp'], ports: ['udp-123'] },
  'splunk-mgmt': { ip: '172.20.240.20', apps: ['splunk', 'ssl'], ports: ['tcp-8089'] },
  'splunk-query': { ip: '172.20.240.20', apps: ['splunk', 'ssl'], ports: ['tcp-8089'] },
  'ad-dns': { ip: '172.20.240.100', apps: ['dns'], ports: ['udp-53', 'tcp-53'] },
  'ad-winrm': { ip: '172.20.240.100', apps: [], ports: ['tcp-5985'] },
  'mssql-smb': { ip: '172.20.240.120', apps: ['ms-ds-smb'], ports: ['tcp-445'] },
  'mssql-rdp': { ip: '172.20.240.120', apps: ['ms-rdp'], ports: ['tcp-3389'] },
  'mssql-mssql': { ip: '172.20.240.120', apps: ['mssql-db'], ports: ['tcp-1433'] },
};

// --- command parsing -------------------------------------------------------------------------------------------
// Tokenise a PAN-OS CLI line: quoted names stay whole, [ a b c ] becomes one list token.
export function panTokens(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|\[([^\]]*)\]|(\S+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[3] !== undefined) out.push(m[3].trim().split(/\s+/).filter(Boolean));
    else out.push(m[1] ?? m[2] ?? m[4]);
  }
  return out;
}
const asArr = (v) => (Array.isArray(v) ? v : [v]);
const RULE_KEYS = { from: 'from', to: 'to', source: 'source', destination: 'destination', application: 'application', service: 'service' };

function findRule(cfg, name) {
  return cfg.rules.find((r) => r.name.toLowerCase() === String(name).toLowerCase())
    || cfg.defaults.find((r) => r.name.toLowerCase() === String(name).toLowerCase());
}

/**
 * Apply one PAN-OS line to the model. Returns { handled, lines:[text], error } — handled=false for lines that
 * are not PAN config commands (the shell's own commands then run).
 */
export function applyPan(pan, line) {
  const t = panTokens(String(line || '').trim());
  if (!t.length) return { handled: false };
  const verb = String(t[0]).toLowerCase();
  const c = pan.candidate;
  const ok = (lines) => { pan.dirty = true; return { handled: true, lines }; };

  if (verb === 'commit') {
    if (!pan.dirty) return { handled: true, lines: ['There are no changes to commit.'], commit: false };
    pan.running = clone(pan.candidate);
    pan.dirty = false;
    pan.commits += 1;
    pan.lastCommit = pan.commits;
    return { handled: true, lines: ['Commit job ' + (6 + pan.commits) + ' is in progress. Use Ctrl+C to return to command prompt', '..........55%...100%', 'Configuration committed successfully'], commit: true };
  }
  if (verb === 'revert' || (verb === 'load' && /running/.test(line))) {
    pan.candidate = clone(pan.running); pan.dirty = false;
    return { handled: true, lines: ['Candidate configuration reverted to the running configuration.'] };
  }

  // set mgt-config users admin password
  if (verb === 'set' && t[1] === 'mgt-config') { c.adminChanged = true; return ok(['Enter password   : ****************', 'Confirm password : ****************']); }

  // set profile-group NAME virus default spyware default vulnerability default
  if (verb === 'set' && (t[1] === 'profile-group' || (t[1] === 'profile-group' && t[2]))) {
    const name = t[2];
    if (!name) return { handled: true, error: true, lines: ['Invalid syntax: set profile-group <name> virus <profile> spyware <profile> vulnerability <profile>'] };
    const g = c.profileGroups[name] || { virus: null, spyware: null, vulnerability: null };
    for (let i = 3; i + 1 < t.length; i += 2) {
      const k = String(t[i]).toLowerCase();
      if (['virus', 'spyware', 'vulnerability', 'url-filtering', 'file-blocking', 'wildfire-analysis'].includes(k)) g[k] = String(asArr(t[i + 1])[0]);
    }
    c.profileGroups[name] = g;
    return ok([`[edit profile-group ${name}]`]);
  }
  if (verb === 'delete' && t[1] === 'profile-group') { delete c.profileGroups[t[2]]; return ok(['']); }

  // set rulebase default-security-rules rules interzone-default log-end yes
  if (verb === 'set' && t[1] === 'rulebase' && t[2] === 'default-security-rules') {
    const r = c.defaults.find((d) => d.name === t[4]);
    if (!r) return { handled: true, error: true, lines: [`Invalid syntax: no predefined rule "${t[4]}"`] };
    for (let i = 5; i + 1 < t.length; i += 2) {
      if (t[i] === 'log-end') r.logEnd = /^yes$/i.test(t[i + 1]);
      if (t[i] === 'action') r.action = String(t[i + 1]).toLowerCase();
    }
    return ok([`[edit rulebase default-security-rules rules ${r.name}] (override)`]);
  }

  // set rulebase security rules NAME key value ...
  if (verb === 'set' && t[1] === 'rulebase' && t[2] === 'security' && t[3] === 'rules') {
    const name = t[4];
    if (!name || Array.isArray(name)) return { handled: true, error: true, lines: ['Invalid syntax: set rulebase security rules <name> ...'] };
    let r = findRule(c, name);
    if (r?.predefined) return { handled: true, error: true, lines: [`${name} is a predefined rule. Use: set rulebase default-security-rules rules ${name} ... (Override)`] };
    if (!r) {
      r = { name, type: 'universal', from: ['any'], to: ['any'], source: ['any'], destination: ['any'], application: ['any'], service: ['application-default'], action: 'allow', logEnd: true };
      c.rules.push(r);
    }
    for (let i = 5; i < t.length; i += 1) {
      const k = String(t[i]).toLowerCase();
      const v = t[i + 1];
      if (RULE_KEYS[k] && v !== undefined) { r[RULE_KEYS[k]] = asArr(v).map(String); i += 1; continue; }
      if (k === 'action' && v) { r.action = String(v).toLowerCase(); i += 1; continue; }
      if (k === 'disabled' && v) { r.disabled = /^yes$/i.test(v); i += 1; continue; }
      if (k === 'log-end' && v) { r.logEnd = /^yes$/i.test(v); i += 1; continue; }
      if (k === 'profile-setting' && String(t[i + 1]).toLowerCase() === 'group' && t[i + 2]) { r.group = String(asArr(t[i + 2])[0]); i += 2; continue; }
      if (k === 'profile-setting' && String(t[i + 1]).toLowerCase() === 'none') { delete r.group; i += 1; continue; }
    }
    if (r.group && !c.profileGroups[r.group]) return { handled: true, error: true, lines: [`Validation error: profile group "${r.group}" does not exist (create it under Objects > Security Profile Groups first)`] };
    return ok([`[edit rulebase security rules "${r.name}"]`]);
  }
  if (verb === 'delete' && t[1] === 'rulebase' && t[2] === 'security' && t[3] === 'rules') {
    const before = c.rules.length;
    c.rules = c.rules.filter((r) => r.name.toLowerCase() !== String(t[4]).toLowerCase());
    if (c.rules.length === before) return { handled: true, error: true, lines: [`No such rule: ${t[4]}`] };
    return ok(['']);
  }
  // move rulebase security rules NAME top|bottom|before X|after X
  if (verb === 'move' && t[1] === 'rulebase' && t[3] === 'rules') {
    const i = c.rules.findIndex((r) => r.name.toLowerCase() === String(t[4]).toLowerCase());
    if (i < 0) return { handled: true, error: true, lines: [`No such rule: ${t[4]}`] };
    const [r] = c.rules.splice(i, 1);
    const where = String(t[5] || 'bottom').toLowerCase();
    if (where === 'top') c.rules.unshift(r);
    else if (where === 'before' || where === 'after') {
      const j = c.rules.findIndex((x) => x.name.toLowerCase() === String(t[6]).toLowerCase());
      c.rules.splice(j < 0 ? c.rules.length : where === 'before' ? j : j + 1, 0, r);
    } else c.rules.push(r);
    return ok(['']);
  }
  return { handled: false };
}

// --- evaluation ------------------------------------------------------------------------------------------------
const any = (list) => !list || list.includes('any');
function ruleMatches(r, svc) {
  if (r.disabled) return false;
  if (!(any(r.from) || r.from.includes('external'))) return false;
  if (!(any(r.to) || r.to.includes('internal'))) return false;
  if (!(any(r.destination) || r.destination.includes(svc.ip))) return false;
  const appOk = any(r.application) || r.application.some((a) => svc.apps.includes(a));
  const svcIsPort = r.service.some((s) => /^(tcp|udp)-\d+/.test(s));
  if (svcIsPort) {
    if (!r.service.some((s) => svc.ports.includes(s))) return false;
    return any(r.application) || appOk;
  }
  return appOk;
}

/** Which scored services the RUNNING config lets in from outside, and which it blocks. */
export function panReach(cfg, serviceIds) {
  const allowed = []; const blocked = [];
  for (const id of serviceIds) {
    const svc = PAN_SERVICE_MAP[id];
    if (!svc) continue;
    const r = cfg.rules.find((x) => ruleMatches(x, svc));
    if (r && r.action === 'allow') allowed.push(id); else blocked.push(id);
  }
  return { allowed, blocked };
}

/**
 * Is the perimeter hardened (TOOL23T done hands-on)? Judged on the RUNNING config only.
 * Needs: the allow-everything inbound rule gone or disabled, outbound no longer any/any, every enabled allow rule
 * carrying a security profile group, denied traffic logged, and every scored service still reachable.
 */
export function panVerdict(pan, serviceIds) {
  const cfg = pan.running;
  const { blocked } = panReach(cfg, serviceIds);
  const on = cfg.rules.filter((r) => !r.disabled);
  const openIn = on.find((r) => r.action === 'allow' && r.from.includes('external') && any(r.destination) && any(r.application));
  const openOut = on.find((r) => r.action === 'allow' && any(r.from) && any(r.to) && any(r.destination) && any(r.application));
  const noProfile = on.filter((r) => r.action === 'allow' && !r.group);
  const logsDeny = on.some((r) => r.action === 'deny' && r.logEnd) || cfg.defaults.some((d) => d.name === 'interzone-default' && d.logEnd);
  const todo = [];
  if (openIn) todo.push(`"${openIn.name}" still allows everything in from external`);
  if (openOut) todo.push(`"${openOut.name}" still allows any to any`);
  if (noProfile.length) todo.push(`no security profile group on: ${noProfile.map((r) => r.name).join(', ')}`);
  if (!logsDeny) todo.push('denied traffic is not logged (deny-all with log at session end, or override interzone-default)');
  return { fixed: !todo.length && !blocked.length, blocked, todo, dirty: pan.dirty };
}
