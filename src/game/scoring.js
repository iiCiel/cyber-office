// Shared scoring helpers. Each day (src/days/dayN) builds its list of scored items with these,
// and finalize() turns them into a grade, a cost total and the skills practiced.
//
// A scored item: { id, area, title, outcome: 'good'|'ok'|'bad', points, max, what, why, cost?, teaches }

export const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Score one email from what the player did with it (GameState.mail[id]).
 * Email data fields used: phish, subject, verdictNote, teaches, replyTrap {cost, what, why}, credsCost.
 */
export function scoreEmail(e, ms = {}) {
  const base = { id: `mail-${e.id}`, area: 'Email', title: e.subject, max: 10, teaches: e.teaches };
  const clicked = (ms.clicked?.length || 0) > 0;
  if (e.phish) {
    if (ms.enteredCreds) {
      return { ...base, outcome: 'bad', points: 0, what: 'You typed your password into the phishing page.', why: `The attacker had your password minutes later. ${e.verdictNote}`, cost: e.credsCost || { amount: 4500, text: 'Reset your account, check what the attacker touched' } };
    }
    if (ms.macroEnabled) {
      return { ...base, outcome: 'bad', points: 0, what: 'You opened the attachment and clicked "Enable Content".', why: `That ran the attacker's macro on your PC. ${e.verdictNote}`, cost: e.macroCost || { amount: 9000, text: 'Reimage your PC and hunt for what the macro installed' } };
    }
    if (ms.replied && e.replyTrap) {
      return { ...base, outcome: 'bad', points: 0, what: e.replyTrap.what, why: `${e.replyTrap.why} ${e.verdictNote}`, cost: e.replyTrap.cost };
    }
    if (ms.reported) {
      const risky = clicked || ms.openedAttachment;
      return { ...base, outcome: risky ? 'ok' : 'good', points: risky ? 7 : 10, what: risky ? 'You opened it up first, but then reported it.' : 'You reported it.', why: risky ? `Reporting was right. Opening links or attachments was risky: some attacks need only the click. ${e.verdictNote}` : e.verdictNote };
    }
    if (ms.deleted) {
      return { ...base, outcome: 'ok', points: 6, what: 'You deleted it but did not report it.', why: `Everyone else got it too. Reporting lets the SOC block it for all of them. ${e.verdictNote}` };
    }
    if (clicked || ms.openedAttachment) {
      return { ...base, outcome: 'bad', points: 3, what: 'You opened it up and left it in your inbox.', why: e.verdictNote };
    }
    return { ...base, outcome: 'bad', points: ms.read ? 2 : 0, what: ms.read ? 'You read it and left it in your inbox.' : 'You never opened it.', why: e.verdictNote };
  }
  if (ms.reported) {
    return { ...base, outcome: 'ok', points: 5, what: 'You reported it as phishing.', why: `False alarm: this one was real. ${e.verdictNote.replace(/^Real\. /, '')} False positives cost the SOC time, and people stop trusting real emails.` };
  }
  return { ...base, outcome: ms.read ? 'good' : 'ok', points: ms.read ? 10 : 6, what: ms.read ? 'You read it and treated it as real.' : 'You never read it.', why: e.verdictNote };
}

/**
 * Score a SIEM case write-up against its definition (see CASE objects in each day's logs.js).
 * caseDef: { id, title, area, max, teaches, verdicts, correctVerdict, wrongVerdictNotes, keyEvidence,
 *            primaryEvidence {key, note}, actions [{id, text, good, why}], containedRequires,
 *            costs {contained, breach}, perfectWhy, notSubmittedWhy, extraPenalty?(cf, ctx) }
 */
export function scoreCase(caseDef, cf, ctx = {}) {
  const max = caseDef.max || 30;
  const base = { id: caseDef.id || 'case', area: caseDef.area || 'SOC alert', title: caseDef.title, max, teaches: caseDef.teaches };
  if (!cf) return { ...base, outcome: 'bad', points: 0, what: 'You never wrote up the alert.', why: caseDef.notSubmittedWhy, cost: caseDef.costs.breach };

  let points = 0;
  const notes = [];
  const verdictOk = cf.verdict === caseDef.correctVerdict;
  if (verdictOk) points += max / 2;
  else notes.push(caseDef.wrongVerdictNotes?.[cf.verdict] || caseDef.wrongVerdictNotes?.default || 'That is not what the logs show.');
  const keys = new Set((cf.evidence || []).map((e) => e.key).filter(Boolean));
  if (keys.has(caseDef.primaryEvidence.key)) points += max / 6;
  else notes.push(caseDef.primaryEvidence.note);
  if ([...keys].filter((k) => caseDef.keyEvidence.includes(k)).length >= 2) points += max / 6;
  const goodAll = caseDef.actions.filter((a) => a.good);
  const good = goodAll.filter((a) => cf.actions.includes(a.id));
  const bad = caseDef.actions.filter((a) => !a.good && cf.actions.includes(a.id));
  points += Math.round((good.length / goodAll.length) * (max / 6));
  points = Math.max(0, points - bad.length * Math.round(max / 10));
  for (const a of bad) notes.push(a.why);
  const missed = goodAll.filter((a) => !cf.actions.includes(a.id));
  if (missed.length) notes.push(`Also worth doing: ${missed.map((a) => a.text.charAt(0).toLowerCase() + a.text.slice(1)).join('; ')}.`);

  let extra = null;
  if (caseDef.extra) {
    extra = caseDef.extra(cf, ctx);
    if (extra?.points) points += extra.points;
    if (extra?.note) notes.push(extra.note);
  }
  points = Math.max(0, Math.min(max, Math.round(points)));
  const contained = verdictOk && (caseDef.containedRequires || []).every((a) => cf.actions.includes(a));
  const outcome = points >= max * 0.83 ? 'good' : points >= max / 2 ? 'ok' : 'bad';
  const verdictText = caseDef.verdicts.find((v) => v.id === cf.verdict)?.text || cf.verdict;
  const n = (cf.evidence || []).length;
  return {
    ...base,
    outcome,
    points,
    contained,
    what: `You called it "${verdictText}" with ${n} flagged line${n === 1 ? '' : 's'} and ${cf.actions.length} response action${cf.actions.length === 1 ? '' : 's'}.`,
    why: notes.length ? notes.join(' ') : caseDef.perfectWhy,
    cost: extra?.cost || (contained ? caseDef.costs.contained : caseDef.costs.breach),
  };
}

/**
 * Score a helpdesk ticket decision. ticket: { id, title, teaches, options: [{id, text, outcome, points, why, cost?}] }
 */
export function scoreTicket(ticket, decision) {
  const base = { id: `ticket-${ticket.id}`, area: 'Helpdesk tickets', title: ticket.title, max: 10, teaches: ticket.teaches };
  const opt = ticket.options.find((o) => o.id === decision);
  if (!opt) return { ...base, outcome: 'bad', points: 0, what: 'You never handled this ticket.', why: ticket.ignoredWhy || 'Tickets that sit in the queue become tomorrow\'s problems.' };
  return { ...base, outcome: opt.outcome, points: opt.points, what: `You chose: ${opt.text}`, why: opt.why, cost: opt.cost };
}

/**
 * Score a conversation outcome from a table. enc: { id, area, title, max, teaches, outcomes: {outcome: {...}}, missing }
 */
export function scoreConversation(enc, result) {
  const base = { id: enc.id, area: enc.area, title: enc.title, max: enc.max || 10, teaches: enc.teaches };
  const o = result?.outcome && enc.outcomes[result.outcome];
  if (!o) return { ...base, outcome: 'ok', points: enc.missing?.points ?? Math.round((enc.max || 10) / 3), ...(enc.missing || { what: 'It never came up.', why: '' }) };
  const why = typeof o.why === 'function' ? o.why(result) : o.why;
  return { ...base, ...o, why };
}

export function finalize(items) {
  const points = items.reduce((s, i) => s + i.points, 0);
  const max = items.reduce((s, i) => s + i.max, 0);
  const pct = max ? Math.round((points / max) * 100) : 0;
  let grade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
  // One outright miss (a stolen password, a breach) means it wasn't an A day, whatever the points say.
  const capped = grade === 'A' && items.some((i) => i.outcome === 'bad');
  if (capped) grade = 'B';
  const costs = items.filter((i) => i.cost).map((i) => ({ ...i.cost, item: i.title, outcome: i.outcome }));
  const cost = costs.reduce((s, c) => s + c.amount, 0);
  const skills = [];
  for (const i of items) {
    if (!skills.some((s) => s.skill === i.teaches.skill)) skills.push({ ...i.teaches, outcome: i.outcome });
  }
  return { items, points, max, pct, grade, capped, costs, cost, costText: money(cost), skills };
}
