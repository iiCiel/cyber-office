// Quotient, the scoring engine used at MWCCDC 2026, as far as the blue team sees it: per-service round results and
// the Password Change Request (PCR) screen. A scenario lists the credential lists Quotient logs in with
// (scenario.quotient.lists) and the PCR record per list (scenario.pcr, see ccdcEngine.notePcrFiled).
//
// The rules from Nov 14 that this enforces:
//   - one line per credential, "username,password";
//   - every username must be on the selected list, or NOTHING is updated (one bad name rejects the whole paste);
//   - the list only knows the users Quotient scores with, so service accounts (svc-*) are not on it.
import { notePcrFiled } from './ccdcEngine.js';

export const PCR_REJECT = 'No credentials were updated. Verify usernames exist in the selected list.';

export function quotientLists(scenario) {
  return scenario?.quotient?.lists || {};
}

/** Parse a PCR paste. Returns { rows:[{user,pass}], bad:[{line, why}] }. Blank lines are ignored. */
export function parsePcr(text) {
  const rows = []; const bad = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(',');
    if (i <= 0 || i === line.length - 1) { bad.push({ line, why: 'not username,password' }); continue; }
    rows.push({ user: line.slice(0, i).trim(), pass: line.slice(i + 1) });
  }
  return { rows, bad };
}

/**
 * Submit a PCR for one credential list. All-or-nothing, like the real screen. On success the engine records the
 * list as filed, so a password rotation AFTER this is pre-approved and one BEFORE it stops failing.
 * Returns { ok, count, msg, unknown:[names] }.
 */
export function submitPcr(state, listName, text) {
  const list = quotientLists(state.scenario)[listName];
  if (!list) return { ok: false, count: 0, msg: 'Select a credential list.' };
  const { rows, bad } = parsePcr(text);
  const known = new Set(list.users.map((u) => u.toLowerCase()));
  const unknown = rows.filter((r) => !known.has(r.user.toLowerCase())).map((r) => r.user);
  const q = state.quotient || (state.quotient = { submissions: [] });
  const at = state.engine?.clock || 0;
  if (!rows.length || bad.length || unknown.length) {
    q.submissions.push({ list: listName, at, ok: false, count: 0, unknown });
    return { ok: false, count: 0, msg: PCR_REJECT, unknown, bad };
  }
  q.submissions.push({ list: listName, at, ok: true, count: rows.length });
  notePcrFiled(state, listName);
  return { ok: true, count: rows.length, msg: `${rows.length} credential${rows.length === 1 ? '' : 's'} updated for ${listName}.` };
}
