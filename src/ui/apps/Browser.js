import { h } from '../dom.js';
import { PAGES } from '../../data/day1.js';

// A tiny fake web browser for links clicked in email. The phishing page is a convincing sign-in form;
// typing a password and submitting it is recorded as "credentials entered" (the value itself is never stored).
export function renderBrowser({ pageId, emailId, state, onClose }) {
  const page = PAGES[pageId];
  if (!page) return null;

  const addr = h(
    'div',
    { class: 'addr', title: page.url },
    page.secure ? h('span', { class: 'lock' }, '🔒') : h('span', { class: 'insecure' }, '⚠ Not secure'),
    page.url,
  );
  const chrome = h(
    'div',
    { class: 'chrome' },
    h('button', { type: 'button', 'aria-label': 'Back', disabled: true }, '←'),
    addr,
    h('button', { type: 'button', 'aria-label': 'Close browser', 'data-action': 'close-browser', onclick: onClose }, '✕'),
  );

  let body;
  if (page.kind === 'phish-login') {
    const pw = h('input', { type: 'password', placeholder: 'Password', 'aria-label': 'Password', autocomplete: 'off' });
    const msg = h('div', { class: 'small' }, 'Signing in keeps your current password active for another 90 days.');
    const card = h(
      'form',
      {
        class: 'login-card',
        onsubmit: (ev) => {
          ev.preventDefault();
          if (!pw.value) {
            msg.textContent = 'Please enter your password.';
            return;
          }
          pw.value = ''; // never keep what the player typed
          const ms = state.mailState(emailId);
          ms.enteredCreds = true;
          state.log('creds-entered', { id: emailId, page: pageId });
          card.replaceChildren(
            h('div', { class: 'logo' }, 'HALCYON MUTUAL'),
            h('p', { class: 'done' }, '✓ Thank you. Your password has been confirmed.'),
            h('p', {}, 'You can close this window.'),
          );
        },
      },
      h('div', { class: 'logo' }, 'HALCYON MUTUAL'),
      h('h1', {}, 'Sign in'),
      h('input', { type: 'text', value: 'analyst01@halcyonmutual.com', 'aria-label': 'Email', readonly: true }),
      pw,
      h('button', { type: 'submit', 'data-action': 'sign-in' }, 'Sign in'),
      msg,
    );
    body = h('div', { class: 'page login' }, card);
  } else {
    body = h('div', { class: 'page info' }, h('h1', {}, page.title), page.lines.map((l) => h('p', {}, l)));
  }

  return h('div', { class: 'browser', role: 'dialog', 'aria-label': 'Web browser' }, chrome, body);
}
