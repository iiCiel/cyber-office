// CCDC "blue team" hands-on engine. The player does NOT pick A/B/C — they move between real devices, each
// with its OWN working simulated terminal, and actually TYPE admin commands to inspect and harden the boxes.
//
//   - Linux boxes (web01, mail01, db01): a bash terminal — the real src/game/shell.js engine (ls, cat, grep,
//     awk, find, …) over a per-box read-only filesystem, so the player can investigate before they fix.
//   - Windows / Active Directory (dc01): a PowerShell terminal — the real src/game/pwsh.js engine (Get-ADUser,
//     Get-ADGroupMember, Get-WinEvent, …) over an AD model that contains the rogue admin.
//   - Edge firewall (edge-fw): a pfSense-style RULE EDITOR driven by typed rule commands (see ccdcFirewall.js).
//
// On top of the inspection engine, each box recognises the specific HARDENING commands that fix its findings —
// and the plausible-but-wrong commands that are traps (a trap can knock a scored service DOWN, exactly like a
// real self-inflicted CCDC outage). Scored services (web/DNS/mail/DB) go UP or DOWN from what the player types.
// Red Team works these same boxes for the whole round (ccdcRed.js).
//
// Everything is fiction: RFC 5737 / RFC 1918 addresses, invented hosts, canned output, nothing executed.

import { run as runBash } from './shell.js';
import { runPwsh } from './pwsh.js';
import { evalFirewall, applyFirewallCommand, firewallHelp } from './ccdcFirewall.js';
import { applyEdit, isEdit } from './ccdcEdit.js';
import { rng, freshSeed } from './shuffle.js';
import { liveCompromises, tickTo } from './ccdcEngine.js';
import { initHostState, applyHostChange, applyAdChange } from './hostState.js';
import { REVERT_PENALTY, REVERT_SECS, applyBoxCommand, applyUfwExtras, boxCommands, continuePending, dirOf, initBox, passwordInLine, passwordStrong, syncServices } from './ccdcBox.js';
import { RED_POOL, redCharged, redForgetBox } from './ccdcRed.js';
import { prepareScenario } from './ccdcRound.js';

export const SERVICE_STATE = { UP: 'up', DOWN: 'down' };
export const MODES = { GUIDED: 'guided', COMPETITION: 'competition' };

// The five specialised CCDC team seats, plus a whole-team generalist. Real CCDC splits the work: each seat
// owns different boxes and runs its own first-15-minute checklist. Every device and finding is tagged with the
// seat that owns it, so a player can drill one seat or play the whole team at once.
export const ROLES = {
  ALL: 'all', NETWORK: 'network', WINDOWS: 'windows', LINUX: 'linux', WEBDB: 'webdb', IR: 'ir',
};

export const ROLE_INFO = [
  { id: 'all', name: 'Whole team', short: 'All seats', blurb: 'Every device and finding at once — the full company. Best once you know each seat.' },
  { id: 'network', name: 'Firewall / Network', short: 'Network', blurb: 'The edge firewall and the path every scored service crosses. One wrong rule drops the whole team.' },
  { id: 'windows', name: 'Windows / Active Directory', short: 'Windows + AD', blurb: 'The domain controller: rogue admins, legacy protocols, DNS that must stay up.' },
  { id: 'linux', name: 'Linux / Services', short: 'Linux', blurb: 'The mail server: an open relay and an attacker’s planted SSH key (root login backdoor).' },
  { id: 'webdb', name: 'Web / Database', short: 'Web + DB', blurb: 'The web app and the database behind it: default logins, an exposed DB.' },
  { id: 'ir', name: 'Incident Response / Injects (Captain)', short: 'IR + Captain', blurb: 'The written injects and coordination. Business tasks are worth real points.' },
];

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Seats a scenario has content for, in canonical order. */
export function rolesFor(scenario) {
  const present = new Set(scenario.devices.map((d) => d.role).concat(scenario.injects.map(() => ROLES.IR)));
  return ROLE_INFO.filter((r) => r.id === ROLES.ALL || present.has(r.id));
}

/** Devices a seat owns (all of them for the whole-team seat). */
export function devicesForRole(scenario, role) {
  if (!role || role === ROLES.ALL) return scenario.devices;
  return scenario.devices.filter((d) => d.role === role);
}

/** Injects a seat handles. The captain/IR seat (and the whole team) run them all; other seats focus on boxes. */
export function injectsForRole(scenario, role) {
  if (!role || role === ROLES.ALL || role === ROLES.IR) return scenario.injects;
  return [];
}

// --- new game --------------------------------------------------------------

function makeDevState(d) {
  const ds = {
    cwd: d.cwd || (d.kind === 'pwsh' ? 'C:\\Users\\Administrator' : `/home/${d.user || 'analyst'}`),
    history: [],
    firewall: d.kind === 'firewall' ? { rules: (d.firewall?.rules || []).map((r) => ({ ...r })), default: d.firewall?.default || 'pass' } : null,
    // A per-game, mutable copy of the box's filesystem so edits (sed -i, echo >>, rm, …) actually change it and
    // `cat` reflects the change. Starts as a deep copy of the scenario's read-only fs.
    fs: d.kind === 'bash' && d.ctx?.fs ? JSON.parse(JSON.stringify(d.ctx.fs)) : null,
    // Live host state (running services, local users, scheduled tasks, units, host-firewall rules) that status
    // commands read, so verifying a change shows the CURRENT state, not the starting one.
    live: d.kind === 'firewall' ? null : initHostState(d),
  };
  initBox(d, ds);
  return ds;
}

export function newGame(baseScenario, opts = {}) {
  const seed = opts.seed ?? freshSeed();
  const scenario = prepareScenario(baseScenario, opts.length, seed);
  const mode = opts.mode === MODES.COMPETITION ? MODES.COMPETITION : MODES.GUIDED;
  const role = opts.role && opts.role !== ROLES.ALL ? opts.role : ROLES.ALL;
  rng(seed); // reserved for future per-game variation; keeps the signature stable

  const devices = devicesForRole(scenario, role);
  const deviceIds = new Set(devices.map((d) => d.id));
  const injects = injectsForRole(scenario, role);

  // Findings in play: those whose host is an owned device.
  const findingList = scenario.findings.filter((f) => deviceIds.has(f.host));

  // Scored services this seat is graded on: those hosted on its boxes. The firewall seat carries every service.
  const ownsEdge = devices.some((d) => d.kind === 'firewall');
  const serviceList = role === ROLES.ALL || ownsEdge ? scenario.services : scenario.services.filter((s) => deviceIds.has(s.host));

  const services = {};
  for (const s of serviceList) services[s.id] = { ...s, state: SERVICE_STATE.UP, drops: 0 };

  const findings = {};
  for (const f of findingList) findings[f.id] = { status: 'open', triggeredTraps: {}, steps: {} };

  const devState = {};
  for (const d of devices) devState[d.id] = makeDevState(d);

  const injectState = {};
  for (const i of injects) injectState[i.id] = { answer: null, done: false, grade: null };

  return {
    scenario, seed, mode, role, timeScale: scenario.timeScale,
    deviceList: devices, findingList, serviceList, injectList: injects,
    timeLimitSec: mode === MODES.COMPETITION ? scenario.clockSeconds || 0 : 0,
    services, findings, devState, injects: injectState,
    redTeamRun: false, compromises: [], expired: false, reverts: [], incidents: [],
  };
}

/** Tech Support restores a box to how it started: backdoors gone, but so are your fixes, and it costs points. */
export function requestRevert(state, deviceId) {
  const dev = state.deviceList.find((d) => d.id === deviceId);
  if (!dev) return { ok: false };
  const ds = makeDevState(dev);
  if (ds.live) ds.live.offlineUntil = (state.engine?.clock || 0) + REVERT_SECS;
  state.devState[deviceId] = ds;
  for (const f of state.findingList) if (f.host === deviceId) state.findings[f.id] = { status: 'open', triggeredTraps: {}, steps: {} };
  redForgetBox(state, deviceId);
  const pcr = state.engine?.pcr;
  if (pcr && pcr.host === deviceId) { pcr.rotated = false; pcr.breaking = false; }
  state.reverts.push({ dev: deviceId, at: state.engine?.clock || 0 });
  state.engine?.events.push({ at: state.engine.clock, cls: 'revert', text: `Tech Support reverted ${dev.host} to its original state (-${REVERT_PENALTY}).` });
  syncServices(state);
  return { ok: true };
}

// --- running a typed line ---------------------------------------------------

const matchesAll = (patterns, line) => asList(patterns).every((p) => (p instanceof RegExp ? p.test(line) : line.toLowerCase().includes(String(p).toLowerCase())));
const matchesAny = (groups, line) => asList(groups).some((g) => matchesAll(g, line));
// A step may list `reject` patterns: lines that look like the fix but do the wrong thing (deny instead of allow).
const rejected = (step, line) => asList(step.reject).some((p) => (p instanceof RegExp ? p.test(line) : line.includes(String(p).toLowerCase())));

/**
 * Run one line on a device. Returns { lines:[{cls,text}], effects:{ fixed?, trapId?, dropped:[], restored:[],
 * note? } }. Every admin command changes the box; then the graded findings are checked; then status tools read the
 * box as it now is. In competition the terminal only ever prints what the real command prints. Whether a fix
 * worked is for the player to verify, and a service they broke shows up at the next scored check.
 */
export function runLine(state, deviceId, rawLine) {
  const res = executeLine(state, deviceId, rawLine);
  const { dropped, restored } = syncServices(state);
  const e = res.effects || (res.effects = {});
  if (dropped.length) e.dropped = [...new Set([...(e.dropped || []), ...dropped])];
  if (restored.length) e.restored = [...new Set([...(e.restored || []), ...restored])];
  if (dropped.length && state.mode !== MODES.COMPETITION) res.lines = [...res.lines, { cls: 'bad', text: `!! Scored service DOWN: ${dropped.join(', ')} — ${state.services[dropped[0]].problem}.` }];
  return res;
}

function executeLine(state, deviceId, rawLine) {
  const dev = state.deviceList.find((d) => d.id === deviceId);
  if (!dev) return { lines: [{ cls: 'err', text: 'No such device on this seat.' }], effects: {} };
  const ds = state.devState[deviceId];
  const quiet = state.mode === MODES.COMPETITION;
  if (ds.pending) return { lines: continuePending(ds, String(rawLine)).lines, effects: {} };
  const line = norm(rawLine).replace(/^sudo\s+/i, '');
  if (!line) return { lines: [], effects: {} };
  if (/^(clear|cls)$/i.test(line)) return { lines: [], effects: { clear: true } };
  if (ds.live?.bricked || (ds.live && ds.live.offlineUntil > (state.engine?.clock || 0))) {
    return { lines: [{ cls: 'err', text: `ssh: connect to host ${dev.ip} port 22: Connection timed out` }], effects: {} };
  }
  ds.history.push(line);

  // Firewall is a rule editor, not a shell.
  if (dev.kind === 'firewall') return runFirewallLine(state, dev, ds, line);

  const lower = line.toLowerCase();
  const findings = state.findingList.filter((f) => f.host === deviceId);

  // A file-editing command (sed -i / echo >> / rm / tee / truncate / nano…) on a Linux box actually changes the
  // box's own filesystem, so a later `cat` shows the edited result. Apply the change first, then still let the
  // trap/fix logic below recognise the command (e.g. removing a planted file is both an edit AND the fix).
  let editLines = null;
  if (dev.kind === 'bash' && ds.fs && isEdit(line)) {
    const er = applyEdit(ds.fs, line, { cwd: ds.cwd, ctx: { ...dev.ctx, cwd: ds.cwd, fs: ds.fs, live: ds.live } });
    if (er.handled) editLines = er.lines;
    // A malformed edit (bad quoting, missing file, bare tee) changed nothing: report the shell error and stop —
    // it must never count as a fix.
    if (er.handled && er.error) return { lines: editLines, effects: {} };
    if (er.handled && quiet) editLines = /^(tee|echo .*\|\s*tee)/.test(line) ? editLines : [];
  }
  // State-changing admin commands (Stop-Service, Remove-LocalUser, systemctl stop, ufw allow, …) update the box's
  // live state whether or not they are the graded fix, so status commands afterwards reflect reality.
  if (ds.live) { applyHostChange(ds.live, line, dev.kind); applyUfwExtras(ds.live, line); }
  // Domain controller: AD changes land in this game's own copy of the directory.
  if (dev.kind === 'pwsh' && dev.ctx?.dir?.spec) applyAdChange(dirOf(dev, ds), line);
  const box = applyBoxCommand(state, dev, ds, line);
  const realLines = () => [...(editLines || []), ...(box?.lines || [])];

  // 0) Rotating the scored account's password? The command is legitimate, but until a PCR is filed the scoring
  //    engine can no longer authenticate — flag it so the live engine fails that service until the PCR lands.
  const pcr = state.scenario.pcr;
  const pcrRotated = pcr && pcr.host === deviceId && matchesAll(pcr.rotateMatch, lower);

  // 1) A plausible-but-wrong trap command? Traps are checked BEFORE fixes so a harmful command (e.g. denying 3306
  //    for everyone) can never be mistaken for the scoped fix. The damage itself is whatever it did to the box.
  for (const f of findings) {
    const rec = state.findings[f.id];
    for (const t of f.traps) {
      if (rec.triggeredTraps[t.id]) continue;
      if (matchesAny(t.match, lower)) {
        rec.triggeredTraps[t.id] = true;
        const lines = quiet ? realLines() : (t.output || []).map((text) => ({ cls: 'warn', text }));
        return { lines, effects: { trapId: t.id, dropped: [], note: t.note, why: t.why } };
      }
    }
  }

  // A password that would not survive a spray is accepted by the box and hardens nothing.
  const inline = passwordInLine(line);
  const weakPassword = inline !== null && !passwordStrong(inline);

  // 2) A correct hardening command for an open finding on this box? A fix is either a single `accept` command
  //    or a set of `steps` (real hardening is often multi-command; the finding only clears once all are done).
  for (const f of weakPassword ? [] : findings) {
    const rec = state.findings[f.id];
    if (rec.status === 'fixed') {
      // Re-running a fix on a hardened box: acknowledge it instead of sending it to the inspection engine.
      const again = f.fix.steps ? f.fix.steps.some((st) => matchesAll(st.accept, lower) && !rejected(st, lower)) : matchesAny(f.fix.accept, lower);
      if (again) return { lines: quiet ? realLines() : [{ cls: 'note', text: `(already hardened: ${f.title})` }], effects: {} };
      continue;
    }
    if (f.fix.steps) {
      const step = f.fix.steps.find((s) => !rec.steps[s.id] && matchesAll(s.accept, lower) && !rejected(s, lower));
      if (step) {
        // A step may also require the box's EDITED file to really be in the right state (not just a matching
        // command line): e.g. pg_hba.conf has no trust line left and still admits the scoring engine.
        const check = step.verify ? step.verify(ds.fs || {}) : { ok: true };
        if (!check.ok) {
          const lines = quiet ? realLines() : [...(editLines || []), { cls: 'warn', text: check.why || 'That command ran, but the file is not in a hardened state yet.' }];
          return { lines, effects: check.trap ? { trapId: check.trap.id, note: check.trap.note, why: check.trap.why } : {} };
        }
        rec.steps[step.id] = true;
        const remaining = f.fix.steps.filter((s) => !rec.steps[s.id]);
        const lines = quiet ? realLines() : (step.output || [`✓ ${step.label}`]).map((text) => ({ cls: 'ok', text }));
        if (!remaining.length) return finishFix(state, f, lines, quiet);
        if (!quiet) lines.push({ cls: 'note', text: `Step done (${f.fix.steps.length - remaining.length}/${f.fix.steps.length}). Still to do: ${remaining.map((s) => s.todo || s.label).join('; ')}` });
        return { lines, effects: { stepId: step.id } };
      }
    } else if (matchesAny(f.fix.accept, lower)) {
      return finishFix(state, f, quiet ? realLines() : (f.fix.output || ['Done.']).map((text) => ({ cls: 'ok', text })), quiet);
    }
  }

  // 2.5) An admin command or file edit that wasn't itself a trap or a fix: show what the real command prints.
  if (box || editLines) return { lines: realLines(), effects: pcrRotated ? { pcrRotated: true } : {} };

  // 3) Everything else: the real inspection engine for this box (reading the box's current, possibly edited, fs).
  const ctx = { ...dev.ctx, cwd: ds.cwd, fs: ds.fs || dev.ctx?.fs, live: ds.live, dir: ds.dir || dev.ctx?.dir, commands: boxCommands(state, dev, ds) };
  const res = dev.kind === 'pwsh' ? runPwsh(line, ctx) : runBash(line, ctx);
  if (res.cwd) ds.cwd = res.cwd;
  const text = res.out == null ? '' : String(res.out).replace(/\n$/, '');
  const lines = text === '' ? [] : text.split('\n').map((t) => ({ cls: res.error ? 'err' : '', text: t }));
  if (pcrRotated && !quiet) lines.push({ cls: 'warn', text: `Scored account ${pcr.account} rotated. File the Password Change Request inject, or ${pcr.service} will start failing its scored check.` });
  return { lines, effects: pcrRotated ? { pcrRotated: true } : {} };
}

function finishFix(state, f, lines, quiet) {
  state.findings[f.id].status = 'fixed';
  if (!quiet) lines.unshift({ cls: 'fix', text: `✓ Hardened: ${f.title}` });
  return { lines, effects: { fixed: f.id, restored: [], why: f.fix.why } };
}

function runFirewallLine(state, dev, ds, line) {
  const quiet = state.mode === MODES.COMPETITION;
  if (/^(help|\?|moves)$/i.test(line)) return { lines: firewallHelp(quiet).map((text) => ({ cls: 'note', text })), effects: {} };
  const pw = line.match(/^passwd\s+(\S+)/i);
  if (pw) { ds.creds.admin = { pw: pw[1], strong: passwordStrong(pw[1], 'admin'), def: false }; return { lines: [{ cls: '', text: 'Password changed for user admin.' }], effects: {} }; }
  const applied = applyFirewallCommand(ds.firewall, line);
  const lines = applied.lines.map((text) => ({ cls: applied.error ? 'err' : 'note', text }));
  if (applied.error) return { lines, effects: {} };

  // Re-evaluate the firewall finding(s) on this device after every rule change.
  const effects = {};
  for (const f of state.findingList.filter((ff) => ff.host === dev.id)) {
    const rec = state.findings[f.id];
    const verdict = evalFirewall(ds.firewall, f.fw);
    if (verdict.fixed) {
      if (rec.status !== 'fixed') { rec.status = 'fixed'; effects.fixed = f.id; effects.why = f.fix.why; if (!quiet) lines.push({ cls: 'fix', text: `✓ Hardened: ${f.title}` }); }
    } else {
      if (rec.status === 'fixed') rec.status = 'open';
      if (!quiet && ds.firewall.default === 'block' && verdict.open && !verdict.down.length) lines.push({ cls: 'warn', text: `Not hardened yet: ${verdict.open}.` });
    }
  }
  return { lines, effects };
}

// --- injects (written business tasks the IR/captain seat answers) -----------
// Each inject carries a rubric: the items a white-team judge looks for. A submission is graded per item with
// partial credit, so a blank box or filler earns nothing and the debrief names what was missing.

export const INJECT_MIN_CHARS = 40;
export const SLA_CAP = 50;

function countMatches(re, text) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return new Set((text.match(g) || []).map((m) => m.toLowerCase())).size;
}

const STOPWORDS = /\b(the|a|an|to|of|and|for|is|are|we|will|with|on|in|that|this|our|your|be|has|have|by|from|as|it|not|at|or|was|were)\b/gi;
const MEMO_HEAD = /^\s*(to|from|subject|re|date)\s*:/im;
export const MEMO_LABEL = 'written as a memo (To / From / Subject)';
export const MIN_INJECT_WORDS = 25;

/** Is this a business deliverable at all, or a bag of keywords? Tables get a pass on prose, not on facts. */
export function looksLikeWriting(inject, text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < MIN_INJECT_WORDS) return false;
  if (inject.format === 'table') return true;
  return (String(text).match(STOPWORDS) || []).length / words.length >= 0.18;
}

/** Grade one written deliverable against an inject rubric. Returns { pts, max, hits:[label], missing:[label] }. */
export function gradeInject(inject, text, state = null) {
  const t = String(text || '');
  const rubric = [...(inject.rubric || []), { label: MEMO_LABEL, check: (x) => MEMO_HEAD.test(x) }];
  const max = inject.points || 0;
  const prose = looksLikeWriting(inject, t);
  const hits = [];
  const missing = [];
  for (const item of rubric) {
    let ok;
    if (item.verify) ok = !!state && !!item.verify(state);
    else if (!prose) ok = false;
    else if (item.check) ok = !!item.check(t, state);
    else ok = item.min ? countMatches(item.re, t) >= item.min : item.re.test(t);
    (ok ? hits : missing).push(item.label);
  }
  const pts = rubric.length ? Math.round((hits.length / rubric.length) * max) : 0;
  return { pts, max, hits, missing, rejected: !prose };
}

export function answerInject(state, injectId, text) {
  const i = state.injectList.find((x) => x.id === injectId);
  if (!i) return { ok: false, error: 'No such inject.' };
  const rec = state.injects[injectId];
  if (rec.done) return { ok: false, error: 'Already submitted.' };
  const body = String(text || '').trim();
  if (body.length < INJECT_MIN_CHARS) {
    return { ok: false, error: `Too short to submit — the white team needs a real deliverable (at least ${INJECT_MIN_CHARS} characters).` };
  }
  rec.answer = body;
  rec.done = true;
  // Deadlines are real: with the live engine attached, a deliverable submitted after its due time scores zero
  // (the rubric is still shown so the player can learn from it).
  const t = state.engine?.injectTimers?.[injectId];
  rec.late = !!(t && (t.overdue || state.engine.clock > t.dueAt));
  const g = gradeInject(i, body, state);
  rec.grade = rec.late ? { ...g, pts: 0, earned: g.pts, late: true } : g;
  const isPcr = state.scenario.pcr && state.scenario.pcr.injectId === injectId;
  return { ok: true, grade: rec.grade, isPcr, late: rec.late };
}

// --- red team ---------------------------------------------------------------

export function runRedTeam(state) {
  if (state.redTeamRun) return state.compromises;
  state.compromises = [];
  if (state.engine) {
    // Ending early fast-forwards to the buzzer with the boxes as they are now: the remaining scored checks and
    // Red Team operations still happen (otherwise quitting at 0:01 would bank a perfect round).
    if (state.timeLimitSec && state.engine.clock < state.timeLimitSec) tickTo(state, state.timeLimitSec);
    state.compromises = liveCompromises(state);
    state.redTeamRun = true;
    return state.compromises;
  }
  for (const f of state.findingList) {
    if (!f.exploitable || state.findings[f.id].status === 'fixed') continue;
    const c = f.compromise || {};
    state.compromises.push({ id: f.id, title: f.title, impact: c.impact || 'Compromised.', penalty: c.penalty || 40 });
  }
  state.redTeamRun = true;
  return state.compromises;
}

export function expire(state) {
  if (state.expired) return;
  state.expired = true;
  runRedTeam(state);
}

// --- scoring ----------------------------------------------------------------

export function score(state) {
  const sc = state.scenario;
  const services = Object.values(state.services);
  const up = services.filter((s) => s.state === SERVICE_STATE.UP);
  // With the live engine attached, service points are earned check by check over the round (uptime), exactly
  // like a real scoring engine: points × passed checks / total checks. Without it, the end state decides.
  const eng = state.engine;
  const svcEarned = (s) => {
    const c = eng?.checks?.[s.id];
    const total = c ? c.ok + c.fail : 0;
    if (!eng || !total) return s.state === SERVICE_STATE.UP ? s.points || 0 : 0;
    return Math.round(((s.points || 0) * c.ok) / total);
  };
  const serviceBreakdown = services.map((s) => ({ id: s.id, earned: svcEarned(s), max: s.points || 0 }));
  const servicePts = serviceBreakdown.reduce((n, s) => n + s.earned, 0);
  const serviceMax = state.serviceList.reduce((n, s) => n + (s.points || 0), 0);

  // SLA: with the live engine attached, use the violations the scoring engine actually accrued over the round
  // (consecutive missed checks). Without it (pure unit tests, checklist drills), fall back to the drop counter.
  const slaEach = sc.slaPenalty || 0;
  const slaCount = state.engine ? state.engine.slaViolations : services.reduce((n, s) => n + (s.drops || 0), 0);
  const slaPenalty = Math.min(SLA_CAP, slaCount * slaEach);

  const injectResults = state.injectList.map((i) => {
    const rec = state.injects[i.id];
    const g = rec.done ? rec.grade || gradeInject(i, rec.answer, state) : { pts: 0, hits: [], missing: (i.rubric || []).map((r) => r.label) };
    const late = !!rec.late;
    return { id: i.id, title: i.title, answered: rec.done, late, points: late ? 0 : g.pts, max: i.points, hits: g.hits, missing: g.missing };
  });
  const injectPts = injectResults.reduce((n, r) => n + r.points, 0);
  const injectMax = state.injectList.reduce((n, i) => n + (i.points || 0), 0);

  // Red Team: a pool you keep unless they take it. Incident reports win points back event by event.
  const redPool = Math.round(RED_POOL * (state.findingList.length / Math.max(1, sc.findings.length)));
  const charged = state.compromises.map((c) => ({ ...c, charged: c.penalty }));
  const taken = eng?.red ? redCharged(state) : charged.reduce((n, c) => n + c.penalty, 0);
  const compromisePenalty = Math.min(redPool, taken);
  const redKept = redPool - compromisePenalty;
  const revertPenalty = (state.reverts?.length || 0) * REVERT_PENALTY;
  const recovered = eng?.red ? eng.red.events.reduce((n, e) => n + e.recovered, 0) : 0;

  const fixed = state.findingList.filter((f) => state.findings[f.id].status === 'fixed').length;
  const raw = servicePts + injectPts + redKept - slaPenalty - revertPenalty;
  const max = serviceMax + injectMax + redPool;
  const pct = max ? Math.max(0, Math.round((raw / max) * 100)) : 0;

  return {
    servicePts, serviceMax, injectPts, injectMax, slaPenalty, slaCount, compromisePenalty, redPool, redKept, revertPenalty, recovered,
    compromises: charged, injectResults, serviceBreakdown, uptimeScored: !!eng, fixed, findingsTotal: state.findingList.length,
    raw, max, pct, letter: letterFor(pct),
  };
}

function letterFor(pct) {
  return pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
}

export function progress(state) {
  const fixed = state.findingList.filter((f) => state.findings[f.id].status === 'fixed').length;
  const injectsDone = state.injectList.filter((i) => state.injects[i.id].done).length;
  const servicesUp = Object.values(state.services).filter((s) => s.state === SERVICE_STATE.UP).length;
  return {
    fixed, findingsTotal: state.findingList.length,
    injectsDone, injectsTotal: state.injectList.length,
    servicesUp, servicesTotal: Object.keys(state.services).length,
  };
}

// --- best-grade persistence -------------------------------------------------

const KEY = 'cyber-office.ccdclab.best';
export function recordBest(id, grade) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!all[id] || grade.pct > all[id].pct) all[id] = { pct: grade.pct, letter: grade.letter };
    localStorage.setItem(KEY, JSON.stringify(all));
    return all[id];
  } catch { return null; }
}
export function loadBests() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
