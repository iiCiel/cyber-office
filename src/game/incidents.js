// Incident reports (CCDC "Incident Response" submissions). Unlike injects, nobody tells the team which incidents
// exist: the team files a report when it finds red-team activity, and the white team matches it to what really
// happened (scenario.incidents). A report scores on: naming the right hosts, citing real indicators, saying what was
// done about it, and evidence the team actually collected on the boxes (their own command history). A good report
// on an incident also halves the penalty for the compromises it covers (ccdcLab.score).
//
//   scenario.incidents = [{ id, title, points, hosts:[deviceId], iocs:[RegExp], findings:[findingId],
//                            evidence(state) -> bool, evidenceHint }]
//   submitIncident(state, { title, hosts:[], time, source, description, actions }) -> { ok, matched, grade, msg }

const REMEDIATION = /\b(kill(ed)?|remov(ed|e)|delet(ed|e)|disabl(ed|e)|reset|restor(ed|e)|block(ed)?|crontab -r|userdel|rm\b|revok(ed|e)|changed?)\b/i;

export function historyOf(state, deviceIds) {
  return (deviceIds || []).flatMap((id) => state.devState?.[id]?.history || []);
}

function score(inc, report, state) {
  const text = [report.title, report.source, report.description, report.actions].join('\n');
  const iocHits = inc.iocs.filter((re) => re.test(text)).length;
  const hosts = new Set((report.hosts || []).map(String));
  const items = [
    { label: `names the affected host${inc.hosts.length > 1 ? 's' : ''}`, ok: inc.hosts.every((h) => hosts.has(h)) },
    { label: 'cites concrete indicators (files, accounts, PIDs, IPs, rules)', ok: iocHits >= Math.min(2, inc.iocs.length) },
    { label: 'says what was done to contain or remove it', ok: REMEDIATION.test(report.actions || '') },
    { label: 'gives when it was detected', ok: /\d{1,2}:\d{2}/.test(report.time || '') || /\d{1,2}:\d{2}/.test(text) },
    { label: `backed by evidence you collected (${inc.evidenceHint})`, ok: !!inc.evidence(state) },
  ];
  const hits = items.filter((i) => i.ok).length;
  return { pts: Math.round((hits / items.length) * inc.points), max: inc.points, items, iocHits };
}

/** Which real incident does this report describe? The one whose indicators it mentions most (at least one). */
export function matchIncident(scenario, report) {
  const text = [report.title, report.source, report.description, report.actions].join('\n');
  let best = null; let bestN = 0;
  for (const inc of scenario.incidents || []) {
    const n = inc.iocs.filter((re) => re.test(text)).length;
    if (n > bestN) { best = inc; bestN = n; }
  }
  return best;
}

export function submitIncident(state, report) {
  const list = (state.incidentReports ||= []);
  const at = state.engine?.clock || 0;
  if (!String(report.description || '').trim() || String(report.description).length < 40) return { ok: false, msg: 'The white team needs a real description (what you saw, where, how you found it).' };
  const inc = matchIncident(state.scenario, report);
  const n = list.length + 1;
  if (!inc) {
    list.push({ n, at, report, matched: null, grade: { pts: 0, max: 0, items: [] } });
    return { ok: true, matched: null, n, msg: `Report #${n} received. White team: we could not match this to red-team activity in your environment.` };
  }
  const grade = score(inc, report, state);
  list.push({ n, at, report, matched: inc.id, grade });
  return { ok: true, matched: inc.id, n, grade, msg: `Report #${n} received and matched to an incident: ${grade.pts}/${grade.max}.` };
}

/** Best grade per real incident (a team can file again with more detail). */
export function incidentResults(state) {
  const out = {};
  for (const r of state.incidentReports || []) {
    if (!r.matched) continue;
    if (!out[r.matched] || r.grade.pts > out[r.matched].pts) out[r.matched] = r.grade;
  }
  return out;
}

/** Is this finding's compromise covered by a strong incident report (>= 60% of its points)? */
export function coveredByIncident(state, findingId) {
  const best = incidentResults(state);
  return (state.scenario.incidents || []).some((inc) => inc.findings.includes(findingId) && best[inc.id] && best[inc.id].pts >= 0.6 * best[inc.id].max);
}
