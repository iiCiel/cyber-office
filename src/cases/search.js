// Case Files search. Matches a free-text query against everything on a card (company, title, pitch,
// tags, date, difficulty, LAB/real) plus the MITRE ATT&CK techniques inside the case, so "kerberos",
// "T1621" or "ransomware" all find something. Every word in the query has to match. Short words
// (3 letters or less, like "ad" or "aws") must match a whole word, so "ad" doesn't hit "admin".
// A few common abbreviations expand to the full name.

const ALIASES = {
  ad: ['active directory', 'kerberos', 'dcsync'],
  'active directory': ['ad'],
  m365: ['microsoft 365', 'office 365'],
  o365: ['microsoft 365', 'office 365'],
  azure: ['entra id', 'azure'],
  entra: ['entra id', 'azure'],
  mfa: ['mfa', 'multi-factor'],
  '2fa': ['mfa', 'multi-factor'],
  sqli: ['sql injection'],
  bec: ['business email compromise'],
  aitm: ['adversary-in-the-middle', 'aitm'],
  phish: ['phishing'],
  ransom: ['ransomware'],
  cloud: ['cloud', 'aws', 'azure', 'entra'],
  windows: ['windows', 'active directory', 'powershell'],
  splunk: ['siem'],
  lab: ['lab'],
  labs: ['lab'],
  real: ['real breach'],
};

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function caseHaystack(c) {
  const f = c.caseFile || {};
  return norm([
    f.company, f.title, f.pitch, f.when, f.difficulty, f.headline,
    ...(f.tags || []),
    ...(f.attack || []).flatMap((a) => [a.id, a.name]),
    f.kind === 'lab' ? 'lab fictional' : 'real breach case',
    c.comingSoon ? 'coming soon' : '',
  ].join(' | '));
}

function termHits(hay, term) {
  if (term.length <= 3) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(hay);
  }
  return hay.includes(term);
}

// Returns true when the case matches every word in the query (empty query matches everything).
export function matchCase(c, query, hay = caseHaystack(c)) {
  let q = norm(query);
  if (!q) return true;
  // Multi-word aliases first ("active directory"), so they count as one term.
  const terms = [];
  for (const key of Object.keys(ALIASES)) {
    if (key.includes(' ') && q.includes(key)) {
      terms.push(key);
      q = q.replace(key, ' ');
    }
  }
  terms.push(...q.split(' ').filter(Boolean));
  return terms.every((t) => [t, ...(ALIASES[t] || [])].some((alt) => termHits(hay, alt)));
}

export const searchCases = (cases, query) => cases.filter((c) => matchCase(c, query));

// Quick-pick topics shown under the search box.
export const TOPICS = ['Active Directory', 'Cloud', 'Ransomware', 'Phishing', 'MFA', 'Linux', 'Web shell', 'Supply chain', 'Lab'];
