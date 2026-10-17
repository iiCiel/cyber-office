// End-of-day scoring (M6). Pure functions over GameState data, unit tested in tests/scoring.test.js.
//
// Every scored item: { id, area, title, outcome: 'good'|'ok'|'bad', points, max, what, why, cost?, teaches }
// `what` = what you did, `why` = why it matters (plain words), `cost` = { amount, text } when it hurt.

import { EMAILS } from '../data/day1.js';
import { CASE, ATTACKER_IP } from '../data/day1Logs.js';

const money = (n) => `$${n.toLocaleString('en-US')}`;

function scoreEmail(e, ms = {}) {
  const base = { id: `mail-${e.id}`, area: 'Email', title: e.subject, max: 10, teaches: e.teaches };
  if (e.phish) {
    if (ms.enteredCreds) {
      return { ...base, outcome: 'bad', points: 0, what: 'You typed your password into the phishing page.', why: `The attacker logged in as you a few minutes later. ${e.verdictNote}`, cost: { amount: 4500, text: 'Reset your account, check what the attacker touched' } };
    }
    if (ms.replied && e.id === 'ceo-giftcards') {
      return { ...base, outcome: 'bad', points: 0, what: 'You replied and agreed to buy the gift cards.', why: `Your reply went to a Gmail address, not the CEO. Gift cards are untraceable cash for scammers. ${e.verdictNote}`, cost: { amount: 500, text: '5 Apple gift cards' } };
    }
    if (ms.reported) {
      const clicked = ms.clicked?.length;
      return { ...base, outcome: clicked ? 'ok' : 'good', points: clicked ? 7 : 10, what: clicked ? 'You clicked the link, but then reported it.' : 'You reported it.', why: clicked ? `Reporting was right. Clicking was risky: some pages install malware on the click alone. ${e.verdictNote}` : e.verdictNote };
    }
    if (ms.deleted) {
      return { ...base, outcome: 'ok', points: 6, what: 'You deleted it but did not report it.', why: `Everyone else got the same email. Reporting lets the SOC block it for all of them. ${e.verdictNote}` };
    }
    if (ms.clicked?.length) {
      return { ...base, outcome: 'bad', points: 3, what: 'You clicked the link and left the email in your inbox.', why: e.verdictNote };
    }
    return { ...base, outcome: 'bad', points: ms.read ? 2 : 0, what: ms.read ? 'You read it and left it in your inbox.' : 'You never opened it.', why: e.verdictNote };
  }
  // Legit email
  if (ms.reported) {
    return { ...base, outcome: 'ok', points: 5, what: 'You reported it as phishing.', why: `False alarm. ${e.verdictNote} False positives cost the SOC time, and people stop trusting real emails.` };
  }
  if (ms.replied && e.id === 'it-reset') return { ...base, outcome: 'ok', points: 5, what: 'You replied.', why: e.verdictNote };
  return { ...base, outcome: ms.read ? 'good' : 'ok', points: ms.read ? 10 : 6, what: ms.read ? 'You read it and treated it as real.' : 'You never read it.', why: e.verdictNote };
}

function scoreCase(state) {
  const cf = state.soc?.caseFile;
  const teaches = { skill: 'Read a failed-logon burst and spot the success after it', secplus: '4.9 Use data sources to support an investigation' };
  const base = { id: 'case', area: 'SOC alert', title: 'Brute force on j.alvarez (3 AM)', max: 30, teaches };
  const breach = { amount: 86000, text: 'Payroll, bank details and SSNs for 214 employees: notification and credit monitoring' };
  if (!cf) {
    return { ...base, outcome: 'bad', points: 0, what: 'You never wrote up the alert.', why: `The 3 AM success came from a Tor exit node (${ATTACKER_IP}) and read payroll files. Nobody stopped it.`, cost: breach };
  }
  let points = 0;
  const notes = [];
  const verdictOk = cf.verdict === CASE.correctVerdict;
  if (verdictOk) points += 15;
  else notes.push(cf.verdict === 'forgot'
    ? 'It wasn\'t j.alvarez: the 3 AM logons came from a Tor exit node, and the real j.alvarez logged on from his own desk at 8:47.'
    : 'Somebody did get in: look for the 4624 (success) right after the 4625s, from the same IP.');
  const keys = new Set((cf.evidence || []).map((e) => e.key).filter(Boolean));
  if (keys.has('success')) points += 5;
  else notes.push('The key evidence is the successful logon (4624) from the attacker\'s IP at 03:14:52.');
  if ([...keys].filter((k) => CASE.keyEvidence.includes(k)).length >= 2) points += 5;
  const good = CASE.actions.filter((a) => a.good && cf.actions.includes(a.id));
  const bad = CASE.actions.filter((a) => !a.good && cf.actions.includes(a.id));
  points += Math.round((good.length / CASE.actions.filter((a) => a.good).length) * 5);
  points = Math.max(0, points - bad.length * 3);
  for (const a of bad) notes.push(a.why);
  const missedGood = CASE.actions.filter((a) => a.good && !cf.actions.includes(a.id));
  if (missedGood.length) notes.push(`Also worth doing: ${missedGood.map((a) => a.text.toLowerCase()).join('; ')}.`);

  const contained = verdictOk && cf.actions.includes('disable') && cf.actions.includes('block');
  const outcome = points >= 25 ? 'good' : points >= 15 ? 'ok' : 'bad';
  return {
    ...base,
    outcome,
    points: Math.min(points, 30),
    what: `You called it "${CASE.verdicts.find((v) => v.id === cf.verdict)?.text}" with ${cf.evidence.length} flagged line${cf.evidence.length === 1 ? '' : 's'} and ${cf.actions.length} response action${cf.actions.length === 1 ? '' : 's'}.`,
    why: notes.length ? notes.join(' ') : 'Spot on: 38 failures, then a success from a Tor exit node, then payroll files read. Contained before lunch.',
    cost: contained ? { amount: 6000, text: 'Incident response the same morning (contained)' } : breach,
  };
}

function scorePhone(state) {
  const p = state.phone;
  const teaches = { skill: 'Verify a caller before resetting a password', secplus: '2.2 Threat vectors: vishing, impersonation' };
  const base = { id: 'phone', area: 'Phone call', title: '"Mike from Sales" wants a password reset', max: 15, teaches };
  const idNote = p?.askedId ? ' Asking for an employee ID isn\'t proof: IDs are printed on badges and in email signatures.' : '';
  if (!p?.outcome) return { ...base, outcome: 'ok', points: 5, what: 'You never answered the call.', why: 'Nobody got a free password, at least. But the helpdesk would have.' };
  if (p.outcome.startsWith('reset')) {
    return {
      ...base, outcome: 'bad', points: 0,
      what: p.outcome === 'reset-under-pressure' ? 'You pushed back, then caved to the pressure and reset it.' : 'You reset the password and read it over the phone.',
      why: `The real Mike was at his desk the whole time (he logged on at 8:21). The caller used urgency and the CEO's name to rush you.${idNote}`,
      cost: { amount: 12000, text: "Attacker took over Mike's mailbox and redirected a client invoice" },
    };
  }
  if (p.outcome === 'callback-verified') {
    return { ...base, outcome: 'good', points: 15, what: 'You called back on the number in the directory.', why: `That's the gold standard: it reached the real Mike, at his desk. The caller was a fake.${idNote}` };
  }
  return { ...base, outcome: 'good', points: 13, what: 'You sent him to the helpdesk verification process.', why: `Good: process beats pressure. Calling back on the directory number would have proven he was a fake right away.${idNote}` };
}

function scoreUsb(state) {
  const u = state.usb;
  const teaches = { skill: "Don't plug in unknown USB drives", secplus: '2.2 Threat vectors: removable media, baiting' };
  const base = { id: 'usb', area: 'Coworker', title: 'A "SALARIES 2026" USB stick from the parking lot', max: 10, teaches };
  if (!u?.outcome) return { ...base, outcome: 'ok', points: 5, what: 'It never came up.', why: 'Dana was still holding it at the end of the day.' };
  if (u.outcome === 'plugged') {
    return { ...base, outcome: 'bad', points: 0, what: 'You plugged it into your PC.', why: 'It was a keystroke injector (a "Rubber Ducky"): that black window was it typing commands that installed a backdoor. Leaving USB sticks around with juicy labels is a classic attack called baiting.', cost: { amount: 9000, text: 'Reimage your PC and hunt for the backdoor' } };
  }
  if (u.outcome === 'trashed') {
    return { ...base, outcome: 'ok', points: 5, what: 'You told Dana to throw it away.', why: 'Safer than plugging it in, but the SOC should see it: it was evidence, and there was a second one on someone\'s desk.' };
  }
  return { ...base, outcome: 'good', points: 10, what: 'You bagged it and gave it to the SOC.', why: 'Right call. Priya analyzed it on an isolated machine: it was a keystroke injector built to install a backdoor. Dana grabbed the second one in time.' };
}

export function scoreDay(state) {
  const items = [
    ...EMAILS.map((e) => scoreEmail(e, state.mail?.[e.id])),
    scoreCase(state),
    scorePhone(state),
    scoreUsb(state),
  ];
  const points = items.reduce((s, i) => s + i.points, 0);
  const max = items.reduce((s, i) => s + i.max, 0);
  const pct = Math.round((points / max) * 100);
  let grade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
  // One outright miss (a stolen password, a breach) means it wasn't an A day, whatever the points say.
  const capped = grade === 'A' && items.some((i) => i.outcome === 'bad');
  if (capped) grade = 'B';
  const costs = items.filter((i) => i.cost).map((i) => ({ ...i.cost, item: i.title }));
  const cost = costs.reduce((s, c) => s + c.amount, 0);
  const skills = [];
  for (const i of items) {
    if (!skills.some((s) => s.skill === i.teaches.skill)) skills.push({ ...i.teaches, outcome: i.outcome });
  }
  return { items, points, max, pct, grade, capped, costs, cost, costText: money(cost), skills };
}

// What Priya says in the end-of-day debrief: the biggest consequences first, one line each.
export function debriefLines(state) {
  const r = scoreDay(state);
  const lines = ['Long day! Before you go, a few things I found out this afternoon.'];
  const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
  if (byId.case.outcome !== 'good') lines.push(state.soc?.caseFile ? 'That 3 AM alert: it was a real break-in. The attacker read the payroll files before anyone noticed.' : 'Nobody wrote up the 3 AM alert. It was a real break-in. The attacker read the payroll files.');
  else lines.push('Your read on the 3 AM alert was right. We locked j.alvarez out and blocked that IP before lunch. Nice work.');
  if (byId['mail-it-reset'].outcome === 'bad' && state.mail?.['it-reset']?.enteredCreds) lines.push('The fake "IT Support" page: your password was used from Russia ten minutes later. We reset it. Lesson learned, right?');
  if (byId['mail-ceo-giftcards'].outcome === 'bad' && state.mail?.['ceo-giftcards']?.replied) lines.push('Finance asked why you emailed "Mark" about gift cards. Mark never asked for any.');
  if (byId.phone.outcome === 'bad') lines.push("The 'Mike' you reset? Not Mike. Someone logged into his mailbox from Lagos at 11:40.");
  else if (state.phone?.outcome) lines.push('That call from "Mike"? The real Mike was at his desk. Good thing you checked.');
  if (byId.usb.outcome === 'bad') lines.push('And that USB stick was a keystroke injector. Your PC gets reimaged tonight.');
  else if (state.usb?.outcome === 'handed-to-soc') lines.push('That USB stick was a keystroke injector, built to install a backdoor. Thanks for bringing it to me.');
  lines.push("Let's look at your day.");
  return lines;
}
