// CPTC hands-on engine. The player does NOT answer a quiz about pentesting — they PLAY the pentest: a Kali-style
// attacker terminal (assessor@kali:~$) where they TYPE recon and exploitation commands against a fictional
// target, each of which DISCOVERS a finding with canned-but-realistic output. THEN they write the report from
// what they found: rate each discovered finding on a likelihood×impact matrix and write its remediation and an
// executive summary. Grading rewards what they actually found and how well they wrote it up.
//
// Everything is fiction: RFC 5737 (198.51.100/24) and *.example hosts, canned output, nothing executed.

import { freshSeed } from './shuffle.js';

export const MODES = { GUIDED: 'guided', COMPETITION: 'competition' };
export const LEVELS = ['Low', 'Medium', 'High'];
// Likelihood × Impact -> severity, the standard CPTC risk matrix.
export const MATRIX = {
  'Low|Low': 'Low', 'Low|Medium': 'Low', 'Low|High': 'Medium',
  'Medium|Low': 'Low', 'Medium|Medium': 'Medium', 'Medium|High': 'High',
  'High|Low': 'Medium', 'High|Medium': 'High', 'High|High': 'Critical',
};
export const severityFor = (likelihood, impact) => MATRIX[`${likelihood}|${impact}`] || null;

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const matchesAll = (pats, line) => asList(pats).every((p) => (p instanceof RegExp ? p.test(line) : line.includes(String(p).toLowerCase())));
const matchesAny = (groups, line) => asList(groups).some((g) => matchesAll(g, line));

export function newReport(scenario, opts = {}) {
  const seed = opts.seed ?? freshSeed();
  const mode = opts.mode === MODES.COMPETITION ? MODES.COMPETITION : MODES.GUIDED;
  const discovered = {}; // findingId -> true once the right command reveals it
  const report = {}; // findingId -> { likelihood, impact, remediation }
  for (const f of scenario.findings) report[f.id] = { likelihood: null, impact: null, remediation: '', locked: false };
  return {
    scenario, seed, mode,
    timeLimitSec: mode === MODES.COMPETITION ? scenario.clockSeconds || 0 : 0,
    cwd: '~', history: [],
    discovered, report, execSummary: '',
    phase: 'enum', // 'enum' (terminal) | 'report' | 'done'
    expired: false,
  };
}

const HELP = [
  'Kali assessor shell (simulated). You are testing the in-scope hosts; nothing is executed.',
  'Built-ins:  help  scope  found  clear',
  'Try the standard tools — recon first, then dig into each service:',
  '  nmap <range>              discover live hosts and open ports',
  '  then enumerate/exploit each service you find (the output tells you what to try next).',
];

/**
 * Run one typed line in the Kali terminal. Returns { lines:[{cls,text}], discovered?:findingId }.
 * A command either prints recon output or DISCOVERS a finding (its `reveal` text) the first time it is run.
 */
export function runEnum(state, rawLine) {
  const sc = state.scenario;
  const line = norm(rawLine);
  if (!line) return { lines: [] };
  if (line === 'clear' || line === 'cls') return { lines: [], clear: true };
  if (line === 'help' || line === '?') return { lines: HELP.map((text) => ({ cls: 'note', text })) };
  if (line === 'scope') return { lines: sc.scope.map((text) => ({ cls: 'note', text: `- ${text}` })) };
  state.history.push(line);
  if (line === 'found' || line === 'findings') {
    const got = sc.findings.filter((f) => state.discovered[f.id]);
    if (!got.length) return { lines: [{ cls: 'err', text: 'Nothing confirmed yet. Start with recon: nmap the in-scope range.' }] };
    return { lines: got.map((f) => ({ cls: 'ok', text: `✓ ${f.title} — ${f.system}` })) };
  }

  // A command that discovers a finding?
  for (const f of sc.findings) {
    if (matchesAny(f.discover, line)) {
      const first = !state.discovered[f.id];
      state.discovered[f.id] = true;
      const lines = (f.reveal || []).map((text) => ({ cls: '', text }));
      if (first) lines.push({ cls: 'flag', text: `FINDING CONFIRMED → ${f.title}  [added to your report]` });
      else lines.push({ cls: 'note', text: '(already in your report)' });
      return { lines, discovered: f.id };
    }
  }
  // A recon command that does not map to a finding?
  for (const r of sc.recon || []) {
    if (matchesAny(r.match, line)) return { lines: (r.output || []).map((text) => ({ cls: '', text })) };
  }
  return { lines: [{ cls: 'err', text: `${line.split(' ')[0]}: no result. Type "help", or "scope" for what is in scope. Recon first (nmap), then enumerate each service.` }] };
}

export const discoveredFindings = (state) => state.scenario.findings.filter((f) => state.discovered[f.id]);

// --- the report step --------------------------------------------------------

export function rate(state, findingId, field, value) {
  const r = state.report[findingId];
  if (!r || r.locked) return;
  if (field === 'likelihood' || field === 'impact') r[field] = value;
  if (field === 'remediation') r.remediation = value;
}

export function setExecSummary(state, text) { state.execSummary = text; }

/**
 * Commit a finding's write-up (guided mode's "check my write-up"). Only once the player has rated it and written a
 * remediation; after that the rating and text are frozen and the model answer + rubric feedback can be shown.
 */
export function lockFinding(state, findingId) {
  const r = state.report[findingId];
  if (!r) return { ok: false, error: 'No such finding.' };
  if (!r.likelihood || !r.impact) return { ok: false, error: 'Rate likelihood and impact first.' };
  if ((r.remediation || '').trim().length < 12) return { ok: false, error: 'Write the remediation first.' };
  r.locked = true;
  return { ok: true, feedback: gradeText(findingRubric(state, findingId), r.remediation) };
}

const findingRubric = (state, id) => state.scenario.findings.find((f) => f.id === id)?.remediationRubric;

/**
 * Grade free text against a rubric { need:[{label,re}], wrong:[{label,re,unless?}] }.
 * credit = items covered / items needed, minus 0.5 per wrong control named (floored at 0).
 */
const NEGATION = /\b(not|no|never|instead of|rather than|avoid|bypass(ed)?|insufficient|alone|wrong|still|unnecessary)\b|n't\b/i;

export function gradeText(rubric, text) {
  const t = String(text || '');
  if (!rubric || !t.trim()) return { credit: 0, hits: [], missing: (rubric?.need || []).map((n) => n.label), wrong: [] };
  const hits = [];
  const missing = [];
  for (const n of rubric.need || []) (n.re.test(t) ? hits : missing).push(n.label);
  // A wrong control only costs credit when it is RECOMMENDED: a clause that names it in order to reject it
  // ("moving the port does not fix it", "a WAF alone is not enough") is fine.
  const clauses = t.split(/[.;!?\n]+/);
  const wrong = (rubric.wrong || []).filter((w) => !(w.unless && w.unless.test(t))
    && clauses.some((c) => w.re.test(c) && !NEGATION.test(c))).map((w) => w.label);
  const need = (rubric.need || []).length || 1;
  const credit = Math.max(0, hits.length / need - 0.5 * wrong.length);
  return { credit, hits, missing, wrong };
}

export function toReport(state) { if (state.phase === 'enum') state.phase = 'report'; }

export function expire(state) {
  if (state.expired) return;
  state.expired = true;
  if (state.phase === 'enum') state.phase = 'report';
}

/**
 * Grade the engagement on four weighted dimensions, CPTC-style:
 *   Coverage (35): how many in-scope findings you actually discovered at the terminal.
 *   Risk rating (30): for discovered findings, how close your severity is to the reference (exact / one step off).
 *   Remediation (25): per finding, the root-cause controls its rubric requires, minus wrong controls named.
 *   Executive summary (10): business risk, both critical issues by name, a timeframe, and the outcome — no jargon.
 */
export function score(state) {
  const sc = state.scenario;
  const all = sc.findings;
  const found = discoveredFindings(state);

  const coverage = all.length ? Math.round((found.length / all.length) * 35) : 0;

  let riskPts = 0;
  const ratingRows = found.map((f) => {
    const r = state.report[f.id];
    const sev = r.likelihood && r.impact ? severityFor(r.likelihood, r.impact) : null;
    const ref = severityFor(f.refLikelihood, f.refImpact);
    const order = ['Low', 'Medium', 'High', 'Critical'];
    let credit = 0;
    if (sev && ref) {
      const d = Math.abs(order.indexOf(sev) - order.indexOf(ref));
      credit = d === 0 ? 1 : d === 1 ? 0.5 : 0;
    }
    riskPts += credit;
    return { id: f.id, title: f.title, yours: sev, ref, credit };
  });
  const risk = found.length ? Math.round((riskPts / found.length) * 30) : 0;

  // Remediation is graded against each finding's keyword rubric (root-cause controls it must name) with a
  // penalty for naming a known-wrong control — boilerplate that names no control earns nothing.
  let remCredit = 0;
  const remRows = found.map((f) => {
    const r = state.report[f.id];
    const g = gradeText(f.remediationRubric, r.remediation);
    remCredit += g.credit;
    return { id: f.id, title: f.title, written: !!(r.remediation || '').trim(), text: r.remediation || '', ...g, model: f.modelRemediation };
  });
  const remediation = found.length ? Math.round((remCredit / found.length) * 25) : 0;

  const execGrade = gradeText(sc.execRubric, state.execSummary);
  const exec = Math.round(execGrade.credit * 10);
  const execOk = exec >= 8;

  const pct = coverage + risk + remediation + exec;
  return {
    coverage, risk, remediation, exec, pct, letter: letterFor(pct),
    foundCount: found.length, totalFindings: all.length,
    ratingRows, remRows, execOk, execGrade,
  };
}

function letterFor(pct) {
  return pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
}

export function progress(state) {
  const found = discoveredFindings(state).length;
  const rated = discoveredFindings(state).filter((f) => { const r = state.report[f.id]; return r.likelihood && r.impact && (r.remediation || '').trim().length >= 12; }).length;
  return { found, total: state.scenario.findings.length, rated };
}

const KEY = 'cyber-office.cptclab.best';
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
