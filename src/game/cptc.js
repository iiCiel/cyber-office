// CPTC engine (pure logic, no DOM, unit-tested).
//
// CPTC — the Collegiate Penetration Testing Competition — is NOT won by who pops the most boxes. It is won by
// the team that hands the client the best REPORT: scoped correctly, risk-rated defensibly, written for an
// executive, with remediation a sysadmin can actually follow. So this mode is built entirely around the
// deliverable. The attacking is already done (canned findings against a fictional client); your job is the
// part that scores:
//
//   1. SCOPE / RULES OF ENGAGEMENT — a handful of judgment calls (is this host in scope? what do you do when
//      you stumble onto real patient data? can you social-engineer staff?). Getting RoE right is table stakes;
//      getting it wrong gets a real team disqualified.
//   2. RISK RATING — for each finding you set Likelihood and Impact, and the engine derives the severity from a
//      transparent 3x3 risk matrix (shown to the player). This is the skill judges grade hardest: a severity
//      you can justify from likelihood x impact, not a gut "it feels critical".
//   3. REMEDIATION — pick the remediation that actually fixes the root cause (not a band-aid, not overkill).
//   4. EXECUTIVE SUMMARY — choose the summary written in business-risk language a non-technical board can act
//      on. This single thing separates winning CPTC reports from losing ones.
//
// The report then "writes itself" from your calls: exec summary + risk-ranked findings table + remediation.
// Scored across those four dimensions and graded A–F. Deterministic and pure (a unit test plays a perfect and
// an all-wrong run). All content lives in the scenario (src/data/cptcScenario.js).

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const LIKELIHOOD = ['Low', 'Medium', 'High'];
export const IMPACT = ['Low', 'Medium', 'High'];

// The risk matrix, shown to the player so the rating is learnable rather than a guess.
// Rows = likelihood, columns = impact. Returns a severity in SEVERITIES.
export const RISK_MATRIX = {
  High: { Low: 'Medium', Medium: 'High', High: 'Critical' },
  Medium: { Low: 'Low', Medium: 'Medium', High: 'High' },
  Low: { Low: 'Low', Medium: 'Low', High: 'Medium' },
};

export function severityFor(likelihood, impact) {
  return RISK_MATRIX[likelihood]?.[impact] || null;
}

// ---- new game -------------------------------------------------------------

export function newReport(scenario) {
  const roe = {};
  for (const d of scenario.roe) roe[d.id] = null;
  const findings = {};
  for (const f of scenario.findings) findings[f.id] = { likelihood: null, impact: null, remediation: null };
  return {
    scenario,
    roe, // id -> choiceId
    findings, // id -> { likelihood, impact, remediation }
    execChoice: null,
    phase: 'scope',
    submitted: false,
  };
}

// ---- player input ---------------------------------------------------------

export function setRoe(state, decisionId, choiceId) {
  if (state.roe[decisionId] === undefined) return false;
  state.roe[decisionId] = choiceId;
  return true;
}

export function setRisk(state, findingId, field, value) {
  const rec = state.findings[findingId];
  if (!rec) return false;
  if (field === 'likelihood' && !LIKELIHOOD.includes(value)) return false;
  if (field === 'impact' && !IMPACT.includes(value)) return false;
  rec[field] = value;
  return true;
}

export function setRemediation(state, findingId, choiceId) {
  const rec = state.findings[findingId];
  if (!rec) return false;
  rec.remediation = choiceId;
  return true;
}

export function setExec(state, choiceId) {
  state.execChoice = choiceId;
}

// Is every required field filled? (All RoE, both risk dials + a remediation per finding, an exec summary.)
export function completeness(state) {
  const sc = state.scenario;
  const roeDone = sc.roe.filter((d) => state.roe[d.id] != null).length;
  const findingsDone = sc.findings.filter((f) => {
    const r = state.findings[f.id];
    return r.likelihood && r.impact && r.remediation != null;
  }).length;
  return {
    roeDone,
    roeTotal: sc.roe.length,
    findingsDone,
    findingsTotal: sc.findings.length,
    execDone: state.execChoice != null,
    complete: roeDone === sc.roe.length && findingsDone === sc.findings.length && state.execChoice != null,
  };
}

// ---- scoring ---------------------------------------------------------------

/**
 * Score the report across the four CPTC dimensions. Returns per-dimension points, per-item detail for the
 * debrief, a weighted total and a letter grade. Each dimension is normalised to its own max so the weights
 * are explicit and the debrief can show "risk rating: 8/10".
 */
export function scoreReport(state) {
  const sc = state.scenario;

  // Dimension 1: RoE / scope judgment.
  const roeResults = sc.roe.map((d) => {
    const pick = state.roe[d.id];
    const choice = d.choices.find((c) => c.id === pick);
    const credit = choice?.correct ? 1 : choice?.partial || 0;
    return { id: d.id, title: d.title, picked: pick, choice, correct: !!choice?.correct, credit };
  });
  const roeScore = roeResults.reduce((n, r) => n + r.credit, 0);
  const roeMax = sc.roe.length;

  // Dimension 2: risk rating (likelihood x impact -> severity vs the reference). Full credit for the exact
  // reference severity, half credit if off by one rank (a defensible but conservative/aggressive call).
  const riskResults = sc.findings.map((f) => {
    const rec = state.findings[f.id];
    const derived = rec.likelihood && rec.impact ? severityFor(rec.likelihood, rec.impact) : null;
    const refSev = severityFor(f.refLikelihood, f.refImpact);
    const exact = derived === refSev;
    const close = !exact && derived && Math.abs(SEVERITIES.indexOf(derived) - SEVERITIES.indexOf(refSev)) === 1;
    return { id: f.id, title: f.title, derived, refSev, likelihood: rec.likelihood, impact: rec.impact, refLikelihood: f.refLikelihood, refImpact: f.refImpact, exact, close, credit: exact ? 1 : close ? 0.5 : 0 };
  });
  const riskScore = riskResults.reduce((n, r) => n + r.credit, 0);
  const riskMax = sc.findings.length;

  // Dimension 3: remediation quality.
  const remResults = sc.findings.map((f) => {
    const rec = state.findings[f.id];
    const choice = f.remediations.find((c) => c.id === rec.remediation);
    const credit = choice?.correct ? 1 : choice?.partial || 0;
    return { id: f.id, title: f.title, choice, correct: !!choice?.correct, credit };
  });
  const remScore = remResults.reduce((n, r) => n + r.credit, 0);
  const remMax = sc.findings.length;

  // Dimension 4: executive summary.
  const execChoice = sc.execSummaries.find((e) => e.id === state.execChoice);
  const execCredit = execChoice?.correct ? 1 : execChoice?.partial || 0;

  // Weighting (CPTC rewards the report over raw findings): risk 30, remediation 25, exec 25, RoE 20.
  const W = { roe: 20, risk: 30, rem: 25, exec: 25 };
  const dims = {
    roe: { label: 'Scope & rules of engagement', pts: round2((roeScore / roeMax) * W.roe), max: W.roe, raw: `${roeScore}/${roeMax}` },
    risk: { label: 'Risk rating (likelihood x impact)', pts: round2((riskScore / riskMax) * W.risk), max: W.risk, raw: `${riskScore}/${riskMax}` },
    rem: { label: 'Remediation quality', pts: round2((remScore / remMax) * W.rem), max: W.rem, raw: `${remScore}/${remMax}` },
    exec: { label: 'Executive summary', pts: round2(execCredit * W.exec), max: W.exec, raw: execChoice ? (execChoice.correct ? 'best' : execChoice.partial ? 'weak' : 'poor') : 'none' },
  };
  const total = round2(dims.roe.pts + dims.risk.pts + dims.rem.pts + dims.exec.pts);
  const max = W.roe + W.risk + W.rem + W.exec; // 100
  const pct = Math.round((total / max) * 100);

  return {
    dims,
    total,
    max,
    pct,
    letter: letterFor(pct),
    roeResults,
    riskResults,
    remResults,
    execChoice,
    // The findings table for the generated report, risk-ranked (reference severity, most severe first).
    table: riskResults
      .map((r) => ({ ...r, finding: sc.findings.find((f) => f.id === r.id) }))
      .sort((a, b) => SEVERITIES.indexOf(a.refSev) - SEVERITIES.indexOf(b.refSev)),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function letterFor(pct) {
  if (pct >= 90) return 'A';
  if (pct >= 75) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 45) return 'D';
  return 'F';
}

// Severity tally for the exec summary, highest first.
export function severityTally(state) {
  const t = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const f of state.scenario.findings) {
    const s = severityFor(f.refLikelihood, f.refImpact);
    if (s) t[s]++;
  }
  return SEVERITIES.map((s) => ({ sev: s, count: t[s] })).filter((x) => x.count > 0);
}

// ---- best-grade persistence ------------------------------------------------

const KEY = 'cyberoffice.cptc.best';
function store() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
export function loadBests(s = store()) {
  if (!s) return {};
  try {
    return JSON.parse(s.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
export function recordBest(scenarioId, grade, s = store()) {
  if (!s) return;
  const all = loadBests(s);
  const prev = all[scenarioId];
  if (!prev || grade.pct > prev.pct) {
    all[scenarioId] = { letter: grade.letter, pct: grade.pct };
    try {
      s.setItem(KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }
}
