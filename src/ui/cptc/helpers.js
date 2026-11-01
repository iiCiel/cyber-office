// Pure helpers for the CPTC desktop UI (no DOM), unit-tested in tests/cptcdesk.test.js.

export const sevClass = (sev) => (sev ? `kx-sev-${String(sev).toLowerCase()}` : 'kx-sev-none');

// "F-01", "F-02"... the finding numbering a report uses.
export const findingNo = (i) => `F-${String(i + 1).padStart(2, '0')}`;

// Indicative CVSS v3.1 base-score band printed beside a severity (NVD qualitative ratings).
export const CVSS_BAND = { Low: '0.1 - 3.9', Medium: '4.0 - 6.9', High: '7.0 - 8.9', Critical: '9.0 - 10.0' };
export const cvssBand = (sev) => CVSS_BAND[sev] || 'n/a';

export const fmtClock = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Count findings per severity, for the report's findings summary header.
export function severityCounts(rows) {
  const out = { Critical: 0, High: 0, Medium: 0, Low: 0, Unrated: 0 };
  for (const r of rows) out[r.sev && out[r.sev] != null ? r.sev : 'Unrated']++;
  return out;
}

// Document reference such as "MHP-PT-2026-01" from a client name.
export function docRef(client, year = 2026) {
  const ini = String(client || 'Client').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'CLT';
  return `${ini}-PT-${year}-01`;
}

// Kali panel clock, 24h "Sat 31 Oct, 14:07".
export function panelClock(d = new Date()) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return `${days[d.getDay()]} ${d.getDate()} ${mon[d.getMonth()]}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Split a scenario's free-text scope lines into the three blocks a rules-of-engagement letter uses.
export function splitScope(lines) {
  const out = { inScope: [], outOfScope: [], rules: [] };
  for (const raw of lines || []) {
    const l = String(raw);
    if (/^in scope\s*:/i.test(l)) out.inScope.push(l.replace(/^in scope\s*:\s*/i, ''));
    else if (/^out of scope\s*:/i.test(l)) out.outOfScope.push(l.replace(/^out of scope\s*:\s*/i, ''));
    else out.rules.push(l);
  }
  return out;
}

// Fictional contact domain for a client ("Meridian Health Partners" -> "meridian.example").
export const clientDomain = (client) => `${String(client || 'client').split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}.example`;
