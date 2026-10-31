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
// A live red team probes at the end: any exploitable finding still unfixed becomes a compromise.
//
// Everything is fiction: RFC 5737 / RFC 1918 addresses, invented hosts, canned output, nothing executed.

import { run as runBash } from './shell.js';
import { runPwsh } from './pwsh.js';
import { evalFirewall, applyFirewallCommand, firewallHelp } from './ccdcFirewall.js';
import { rng, freshSeed } from './shuffle.js';

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

export function newGame(scenario, opts = {}) {
  const seed = opts.seed ?? freshSeed();
  const mode = opts.mode === MODES.COMPETITION ? MODES.COMPETITION : MODES.GUIDED;
  const role = opts.role && opts.role !== ROLES.ALL ? opts.role : ROLES.ALL;
  rng(seed); // reserved for future per-game variation; keeps the signature stable

  const devices = devicesForRole(scenario, role);
  const deviceIds = new Set(devices.map((d) => d.id));
  const injects = injectsForRole(scenario, role);

  // Findings in play: those whose host is an owned device.
  const findingList = scenario.findings.filter((f) => deviceIds.has(f.host));

  // Scored services this seat is graded on: any service a finding on an owned device can drop/restore, or that
  // lives on an owned device. Whole team = all services.
  let serviceList;
  if (role === ROLES.ALL) serviceList = scenario.services;
  else {
    const refs = new Set();
    for (const s of scenario.services) if (deviceIds.has(s.host)) refs.add(s.id);
    for (const f of findingList) {
      for (const t of f.traps) for (const s of asList(t.drops)) refs.add(s);
      for (const s of asList(f.fix.restores)) refs.add(s);
      for (const s of asList(f.compromise?.drops)) refs.add(s);
    }
    serviceList = scenario.services.filter((s) => refs.has(s.id));
  }

  const services = {};
  for (const s of serviceList) services[s.id] = { ...s, state: SERVICE_STATE.UP, downBy: {}, drops: 0 };

  const findings = {};
  for (const f of findingList) findings[f.id] = { status: 'open', triggeredTraps: {}, steps: {} };

  const devState = {};
  for (const d of devices) {
    devState[d.id] = {
      cwd: d.cwd || (d.kind === 'pwsh' ? 'C:\\Users\\Administrator' : `/home/${d.user || 'analyst'}`),
      history: [],
      firewall: d.kind === 'firewall' ? { rules: (d.firewall?.rules || []).map((r) => ({ ...r })), default: d.firewall?.default || 'pass' } : null,
    };
  }

  const injectState = {};
  for (const i of injects) injectState[i.id] = { answer: null, done: false, grade: null };

  return {
    scenario, seed, mode, role,
    deviceList: devices, findingList, serviceList, injectList: injects,
    timeLimitSec: mode === MODES.COMPETITION ? scenario.clockSeconds || 0 : 0,
    services, findings, devState, injects: injectState,
    redTeamRun: false, compromises: [], expired: false,
  };
}

// --- service bookkeeping ----------------------------------------------------

function dropService(state, svcId, findingId, note) {
  const svc = state.services[svcId];
  if (!svc) return false;
  const wasUp = svc.state === SERVICE_STATE.UP && !svc.downBy[findingId];
  if (!svc.downBy[findingId]) { svc.downBy[findingId] = note || true; svc.drops += 1; }
  if (Object.keys(svc.downBy).length) svc.state = SERVICE_STATE.DOWN;
  return wasUp;
}

function restoreService(state, svcId, findingId) {
  const svc = state.services[svcId];
  if (!svc) return false;
  const had = !!svc.downBy[findingId];
  delete svc.downBy[findingId];
  if (!Object.keys(svc.downBy).length) svc.state = SERVICE_STATE.UP;
  return had;
}

// --- running a typed line ---------------------------------------------------

const matchesAll = (patterns, line) => asList(patterns).every((p) => (p instanceof RegExp ? p.test(line) : line.toLowerCase().includes(String(p).toLowerCase())));
const matchesAny = (groups, line) => asList(groups).some((g) => matchesAll(g, line));
// A step may list `reject` patterns: lines that look like the fix but do the wrong thing (deny instead of allow).
const rejected = (step, line) => asList(step.reject).some((p) => (p instanceof RegExp ? p.test(line) : line.includes(String(p).toLowerCase())));

/**
 * Run one line on a device. Returns { lines:[{cls,text}], effects:{ fixed?, trapId?, dropped:[], restored:[],
 * note? } }. Mutates state for accepted fixes and triggered traps. Everything else is passed to the real bash /
 * PowerShell engine so inspection commands (ls, cat, grep, Get-ADUser, …) produce realistic output.
 */
export function runLine(state, deviceId, rawLine) {
  const dev = state.deviceList.find((d) => d.id === deviceId);
  if (!dev) return { lines: [{ cls: 'err', text: 'No such device on this seat.' }], effects: {} };
  const ds = state.devState[deviceId];
  const line = norm(rawLine);
  if (!line) return { lines: [], effects: {} };
  if (/^(clear|cls)$/i.test(line)) return { lines: [], effects: { clear: true } };
  ds.history.push(line);

  // Firewall is a rule editor, not a shell.
  if (dev.kind === 'firewall') return runFirewallLine(state, dev, ds, line);

  const lower = line.toLowerCase();
  const findings = state.findingList.filter((f) => f.host === deviceId);

  // 0) Rotating the scored account's password? The command is legitimate, but until a PCR is filed the scoring
  //    engine can no longer authenticate — flag it so the live engine fails that service until the PCR lands.
  const pcr = state.scenario.pcr;
  const pcrRotated = pcr && pcr.host === deviceId && matchesAll(pcr.rotateMatch, lower);

  // 1) A plausible-but-wrong trap command? (Can drop a scored service.) Traps are checked BEFORE fixes so a
  //    harmful command (e.g. denying 3306 for everyone) can never be mistaken for the scoped fix.
  for (const f of findings) {
    const rec = state.findings[f.id];
    for (const t of f.traps) {
      if (rec.triggeredTraps[t.id]) continue;
      if (matchesAny(t.match, lower)) {
        rec.triggeredTraps[t.id] = true;
        const dropped = [];
        for (const s of asList(t.drops)) if (dropService(state, s, f.id, t.note)) dropped.push(s);
        const lines = (t.output || []).map((text) => ({ cls: 'warn', text }));
        if (dropped.length) lines.push({ cls: 'bad', text: `!! Scored service DOWN: ${dropped.join(', ')} — ${t.note || 'your change broke it.'}` });
        return { lines, effects: { trapId: t.id, dropped, note: t.note, why: t.why } };
      }
    }
  }

  // 2) A correct hardening command for an open finding on this box? A fix is either a single `accept` command
  //    or a set of `steps` (real hardening is often multi-command; the finding only clears once all are done).
  for (const f of findings) {
    const rec = state.findings[f.id];
    if (rec.status === 'fixed') {
      // Re-running a fix on a hardened box: acknowledge it instead of sending it to the inspection engine.
      const again = f.fix.steps ? f.fix.steps.some((st) => matchesAll(st.accept, lower) && !rejected(st, lower)) : matchesAny(f.fix.accept, lower);
      if (again) return { lines: [{ cls: 'note', text: `(already hardened: ${f.title})` }], effects: {} };
      continue;
    }
    if (f.fix.steps) {
      const step = f.fix.steps.find((s) => !rec.steps[s.id] && matchesAll(s.accept, lower) && !rejected(s, lower));
      if (step) {
        rec.steps[step.id] = true;
        const lines = (step.output || [`✓ ${step.label}`]).map((text) => ({ cls: 'ok', text }));
        const remaining = f.fix.steps.filter((s) => !rec.steps[s.id]);
        if (!remaining.length) return finishFix(state, f, lines);
        lines.push({ cls: 'note', text: `Step done (${f.fix.steps.length - remaining.length}/${f.fix.steps.length}). Still to do: ${remaining.map((s) => s.todo || s.label).join('; ')}` });
        return { lines, effects: { stepId: step.id } };
      }
    } else if (matchesAny(f.fix.accept, lower)) {
      return finishFix(state, f, (f.fix.output || ['Done.']).map((text) => ({ cls: 'ok', text })));
    }
  }

  // 3) Everything else: the real inspection engine for this box.
  const ctx = { ...dev.ctx, cwd: ds.cwd };
  const res = dev.kind === 'pwsh' ? runPwsh(line, ctx) : runBash(line, ctx);
  if (res.cwd) ds.cwd = res.cwd;
  const text = res.out == null ? '' : String(res.out).replace(/\n$/, '');
  const lines = text === '' ? [] : text.split('\n').map((t) => ({ cls: res.error ? 'err' : '', text: t }));
  if (pcrRotated) lines.push({ cls: 'warn', text: `Scored account ${pcr.account} rotated. File the Password Change Request inject, or ${pcr.service} will start failing its scored check.` });
  return { lines, effects: pcrRotated ? { pcrRotated: true } : {} };
}

function finishFix(state, f, lines) {
  state.findings[f.id].status = 'fixed';
  const restored = [];
  for (const s of asList(f.fix.restores)) if (restoreService(state, s, f.id)) restored.push(s);
  lines.unshift({ cls: 'fix', text: `✓ Hardened: ${f.title}` });
  return { lines, effects: { fixed: f.id, restored, why: f.fix.why } };
}

function runFirewallLine(state, dev, ds, line) {
  if (/^(help|\?|moves)$/i.test(line)) return { lines: firewallHelp().map((text) => ({ cls: 'note', text })), effects: {} };
  const applied = applyFirewallCommand(ds.firewall, line);
  const lines = applied.lines.map((text) => ({ cls: applied.error ? 'err' : 'note', text }));
  if (applied.error) return { lines, effects: {} };

  // Re-evaluate the firewall finding(s) on this device after every rule change.
  const effects = { dropped: [], restored: [] };
  for (const f of state.findingList.filter((ff) => ff.host === dev.id)) {
    const rec = state.findings[f.id];
    const verdict = evalFirewall(ds.firewall, f.fw);
    if (verdict.fixed) {
      for (const s of f.fw.scored) if (restoreService(state, s, f.id)) effects.restored.push(s);
      if (rec.status !== 'fixed') { rec.status = 'fixed'; effects.fixed = f.id; effects.why = f.fix.why; lines.push({ cls: 'fix', text: `✓ Hardened: ${f.title}` }); }
    } else {
      if (rec.status === 'fixed') rec.status = 'open';
      if (ds.firewall.default === 'block' && verdict.open && !verdict.down.length) lines.push({ cls: 'warn', text: `Not hardened yet: ${verdict.open}.` });
      for (const s of verdict.down) if (dropService(state, s, f.id, verdict.note)) effects.dropped.push(s);
      for (const s of f.fw.scored) if (!verdict.down.includes(s)) if (restoreService(state, s, f.id)) effects.restored.push(s);
    }
  }
  if (effects.dropped.length) lines.push({ cls: 'bad', text: `!! Scored service DOWN: ${effects.dropped.join(', ')} — no allow rule for it with the default policy set to block.` });
  return { lines, effects };
}

// --- injects (written business tasks the IR/captain seat answers) -----------
// Each inject carries a rubric: the items a white-team judge looks for. A submission is graded per item with
// partial credit, so a blank box or filler earns nothing and the debrief names what was missing.

export const INJECT_MIN_CHARS = 40;

function countMatches(re, text) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return new Set((text.match(g) || []).map((m) => m.toLowerCase())).size;
}

/** Grade one written deliverable against an inject rubric. Returns { pts, max, hits:[label], missing:[label] }. */
export function gradeInject(inject, text) {
  const t = String(text || '');
  const rubric = inject.rubric || [];
  const hits = [];
  const missing = [];
  for (const item of rubric) {
    const ok = item.min ? countMatches(item.re, t) >= item.min : item.re.test(t);
    (ok ? hits : missing).push(item.label);
  }
  const max = inject.points || 0;
  const pts = rubric.length ? Math.round((hits.length / rubric.length) * max) : 0;
  return { pts, max, hits, missing };
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
  rec.grade = gradeInject(i, body);
  const isPcr = state.scenario.pcr && state.scenario.pcr.injectId === injectId;
  return { ok: true, grade: rec.grade, isPcr };
}

// --- red team ---------------------------------------------------------------

export function runRedTeam(state) {
  if (state.redTeamRun) return state.compromises;
  state.compromises = [];
  for (const f of state.findingList) {
    if (!f.exploitable) continue;
    if (state.findings[f.id].status === 'fixed') continue;
    const c = f.compromise || {};
    state.compromises.push({ id: f.id, title: f.title, impact: c.impact || 'Compromised.', penalty: c.penalty || 40 });
    for (const s of asList(c.drops)) dropService(state, s, `redteam:${f.id}`, 'Compromised by the red team.');
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
  const servicePts = up.reduce((n, s) => n + (s.points || 0), 0);
  const serviceMax = state.serviceList.reduce((n, s) => n + (s.points || 0), 0);

  // SLA: with the live engine attached, use the violations the scoring engine actually accrued over the round
  // (consecutive missed checks). Without it (pure unit tests, checklist drills), fall back to the drop counter.
  const slaEach = sc.slaPenalty || 0;
  const slaCount = state.engine ? state.engine.slaViolations : services.reduce((n, s) => n + (s.drops || 0), 0);
  const slaPenalty = slaCount * slaEach;

  const injectResults = state.injectList.map((i) => {
    const rec = state.injects[i.id];
    const g = rec.done ? rec.grade || gradeInject(i, rec.answer) : { pts: 0, hits: [], missing: (i.rubric || []).map((r) => r.label) };
    return { id: i.id, title: i.title, answered: rec.done, points: g.pts, max: i.points, hits: g.hits, missing: g.missing };
  });
  const injectPts = injectResults.reduce((n, r) => n + r.points, 0);
  const injectMax = state.injectList.reduce((n, i) => n + (i.points || 0), 0);

  // Incident-report mitigation (real CCDC: an accurate, timely report reclaims part of the red team's points).
  // A compromise whose finding is covered by a submitted, full-marks incident-report inject costs half.
  const reportedFull = (findingId) => {
    const f = state.findingList.find((x) => x.id === findingId);
    const injId = f?.reportableBy;
    if (!injId) return false;
    const rec = state.injects[injId];
    if (!rec?.done) return false;
    const inj = state.injectList.find((x) => x.id === injId);
    const g = rec.grade || gradeInject(inj, rec.answer);
    return g.pts >= g.max;
  };
  const compromisePenalty = state.compromises.reduce((n, c) => n + Math.round(c.penalty * (reportedFull(c.id) ? 0.5 : 1)), 0);

  const fixed = state.findingList.filter((f) => state.findings[f.id].status === 'fixed').length;
  const raw = servicePts + injectPts - slaPenalty - compromisePenalty;
  const max = serviceMax + injectMax;
  const pct = max ? Math.max(0, Math.round((raw / max) * 100)) : 0;

  return {
    servicePts, serviceMax, injectPts, injectMax, slaPenalty, slaCount, compromisePenalty,
    compromises: state.compromises, injectResults, fixed, findingsTotal: state.findingList.length,
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
