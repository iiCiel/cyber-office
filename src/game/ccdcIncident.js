// Incident reports. A team that catches Red Team and writes it up with evidence wins back the points that activity
// cost. The grade is checked against what Red Team really did this round: artifact names, the attacker's address
// and the time differ every game, so a report only scores if the player found them on the box or in the logs.

import { implantAlive, gameTime } from './ccdcRed.js';

export const IR_CRITERIA = ['host', 'source', 'time', 'artifact', 'evidence', 'remediation', 'prevention'];
const lc = (s) => String(s || '').toLowerCase();
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

function minutes(hhmm) {
  const m = String(hhmm || '').match(/\b(\d{1,2}):(\d{2})\b/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// The one piece of Red Team activity this report describes: on the host it names, and an artifact beats a keyword.
function matchEvent(state, r, body, hostText) {
  const onHost = r.events.filter((e) => {
    const dev = state.deviceList.find((d) => d.id === e.host);
    return e.recovered < e.charged && (hostText.includes(lc(dev.host)) || hostText.includes(dev.ip));
  });
  const byArtifact = onHost.filter((e) => e.artifact && body.includes(lc(e.artifact)));
  const byKeyword = onHost.filter((e) => !e.artifact && e.keywords.some((k) => k && body.includes(lc(k))));
  return (byArtifact.length ? byArtifact : byKeyword).sort((a, b) => b.charged - a.charged)[0] || null;
}

/**
 * File one report. Fields: { host, src, time, what, evidence, remediation, prevention }.
 * Returns the stored record: { n, at, status, credit, recovered, hits, missing, eventId }.
 */
export function submitIncident(state, report) {
  const r = state.engine?.red;
  const list = (state.incidents ||= []);
  const rec = { n: list.length + 1, at: state.engine?.clock || 0, report, credit: 0, recovered: 0, hits: [], missing: [...IR_CRITERIA], eventId: null };
  list.push(rec);
  if (!r) return rec;
  const body = lc([report.what, report.evidence, report.remediation].join(' '));
  const ev = matchEvent(state, r, body, lc(report.host));
  if (!ev) return rec;
  const dev = state.deviceList.find((d) => d.id === ev.host);
  const want = minutes(gameTime(state, ev.at));
  const got = minutes(report.time);
  const alive = ev.implant ? implantAlive(state, ev.implant) : false;
  const checks = {
    host: lc(report.host).includes(lc(dev.host)) || lc(report.host).includes(dev.ip),
    source: lc(report.src).includes(ev.src) || lc(report.evidence).includes(ev.src),
    time: got !== null && Math.abs(got - want) <= 30,
    artifact: ev.artifact ? lc(report.what + report.evidence).includes(lc(ev.artifact)) : ev.keywords.some((k) => lc(report.what).includes(lc(k))),
    evidence: words(report.evidence) >= 6 && /\d+\.\d+\.\d+\.\d+|\/[a-z]|\b4[67]\d\d\b|[a-z]:\\/i.test(report.evidence),
    remediation: words(report.remediation) >= 5 && !alive,
    prevention: words(report.prevention) >= 8,
  };
  rec.hits = IR_CRITERIA.filter((k) => checks[k]);
  rec.missing = IR_CRITERIA.filter((k) => !checks[k]);
  rec.credit = rec.hits.length / IR_CRITERIA.length;
  rec.eventId = ev.id;
  const won = Math.round(ev.charged * rec.credit);
  rec.recovered = Math.max(0, won - ev.recovered);
  ev.recovered = Math.max(ev.recovered, won);
  return rec;
}
