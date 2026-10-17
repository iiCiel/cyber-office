// Day 1 scoring and debrief, built on the shared helpers in src/game/scoring.js.
import { EMAILS } from './emails.js';
import { CASE } from './logs.js';
import { scoreEmail, scoreCase, scoreConversation, finalize } from '../../game/scoring.js';

export const MAIN_ALERT = 'bruteforce-jalvarez';

export const PHONE_SCORE = {
  id: 'phone',
  area: 'Phone call',
  title: '"Mike from Sales" wants a password reset',
  max: 15,
  teaches: { skill: 'Verify a caller before resetting a password', secplus: '2.2 Threat vectors: vishing, impersonation' },
  missing: { what: 'You never answered the call.', why: 'Nobody got a free password, at least. But the helpdesk would have.' },
  outcomes: Object.fromEntries(
    [
      ['reset', 'You reset the password and read it over the phone.'],
      ['reset-after-id', 'You asked for an employee ID, then reset the password and read it over the phone.'],
      ['reset-under-pressure', 'You pushed back, then caved to the pressure and reset it.'],
    ].map(([id, what]) => [
      id,
      {
        outcome: 'bad', points: 0, what,
        why: (r) => `The real Mike was at his desk the whole time (he logged on at 8:21). The caller used urgency and the CEO's name to rush you.${r.askedId ? " Asking for an employee ID isn't proof: IDs are printed on badges and in email signatures." : ''}`,
        cost: { amount: 12000, text: "Attacker took over Mike's mailbox and redirected a client invoice" },
      },
    ]),
  ),
};
PHONE_SCORE.outcomes['callback-verified'] = {
  outcome: 'good', points: 15, what: 'You called back on the number in the directory.',
  why: (r) => `That's the gold standard: it reached the real Mike, at his desk. The caller was a fake.${r.askedId ? " (Asking for an employee ID isn't proof: IDs are printed on badges and in email signatures.)" : ''}`,
};
PHONE_SCORE.outcomes['refused-process'] = {
  outcome: 'good', points: 13, what: 'You sent him to the helpdesk verification process.',
  why: 'Good: process beats pressure. Calling back on the directory number would have proven he was a fake right away.',
};

export const USB_SCORE = {
  id: 'usb',
  area: 'Coworker',
  title: 'A "SALARIES 2026" USB stick from the parking lot',
  max: 10,
  teaches: { skill: "Don't plug in unknown USB drives", secplus: '2.2 Threat vectors: removable media, baiting' },
  missing: { points: 5, what: 'It never came up.', why: 'Dana was still holding it at the end of the day.' },
  outcomes: {
    plugged: {
      outcome: 'bad', points: 0, what: 'You plugged it into your PC.',
      why: 'It was a keystroke injector (a "Rubber Ducky"): that black window was it typing commands that installed a backdoor. Leaving USB sticks around with juicy labels is a classic attack called baiting.',
      cost: { amount: 9000, text: 'Reimage your PC and hunt for the backdoor' },
    },
    trashed: {
      outcome: 'ok', points: 5, what: 'You told Dana to throw it away.',
      why: "Safer than plugging it in, but the SOC should see it: it was evidence, and there was a second one on someone's desk.",
    },
    'handed-to-soc': {
      outcome: 'good', points: 10, what: 'You bagged it and gave it to the SOC.',
      why: 'Right call. Priya analyzed it on an isolated machine: it was a keystroke injector built to install a backdoor. Dana grabbed the second one in time.',
    },
  },
};

export function scoreDay1(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreCase(CASE, st.soc?.cases?.[MAIN_ALERT]),
    scoreConversation(PHONE_SCORE, st.enc?.phone),
    scoreConversation(USB_SCORE, st.enc?.usb),
  ]);
}

// What Priya says in the end-of-day debrief: the biggest consequences first, one line each.
export function debrief1(st) {
  const r = scoreDay1(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ['Long day! Before you go, a few things I found out this afternoon.'];
  if (by.case.outcome !== 'good') lines.push(st.soc?.cases?.[MAIN_ALERT] ? 'That 3 AM alert: it was a real break-in. The attacker read the payroll files before anyone noticed.' : 'Nobody wrote up the 3 AM alert. It was a real break-in. The attacker read the payroll files.');
  else lines.push('Your read on the 3 AM alert was right. We locked j.alvarez out and blocked that IP before lunch. Nice work.');
  if (st.mail?.['it-reset']?.enteredCreds) lines.push('The fake "IT Support" page: your password was used from Russia ten minutes later. We reset it. Lesson learned, right?');
  if (st.mail?.['ceo-giftcards']?.replied) lines.push('Finance asked why you emailed "Mark" about gift cards. Mark never asked for any.');
  if (by.phone.outcome === 'bad') lines.push("The 'Mike' you reset? Not Mike. Someone logged into his mailbox from Lagos at 11:40.");
  else if (st.enc?.phone?.outcome) lines.push('That call from "Mike"? The real Mike was at his desk. Good thing you checked.');
  if (by.usb.outcome === 'bad') lines.push('And that USB stick was a keystroke injector. Your PC gets reimaged tonight.');
  else if (st.enc?.usb?.outcome === 'handed-to-soc') lines.push('That USB stick was a keystroke injector, built to install a backdoor. Thanks for bringing it to me.');
  lines.push("Let's look at your day.");
  return lines;
}

// What carries over to the rest of the week.
export function carry1(st, r) {
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  return {
    d1CaseContained: !!by.case.contained,
    d1MfaRecommended: !!st.soc?.cases?.[MAIN_ALERT]?.actions?.includes('mfa'),
    d1Creds: !!st.mail?.['it-reset']?.enteredCreds,
    d1PhoneReset: by.phone.outcome === 'bad',
    d1UsbPlugged: st.enc?.usb?.outcome === 'plugged',
    d1UsbToSoc: st.enc?.usb?.outcome === 'handed-to-soc',
  };
}
