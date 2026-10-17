import { h } from '../dom.js';

// A tiny fake web browser / document viewer for links and attachments clicked in email.
//   phish-login: a convincing sign-in form. Submitting a password is recorded as "credentials entered"
//                (the value itself is never stored).
//   macro-doc:   a Word document with the yellow "Enable Content" bar. Enabling it runs the macro.
//   doc:         a harmless document (PDF statement, letter).
//   info:        a normal web page.
export function renderBrowser({ pageId, emailId, state, pages, onClose }) {
  const page = pages?.[pageId];
  if (!page) return null;

  const isFile = page.url.startsWith('file:') || page.kind === 'macro-doc' || page.kind === 'doc';
  const addr = h(
    'div',
    { class: 'addr', title: page.url },
    isFile ? h('span', { class: 'lock' }, '📁') : page.secure ? h('span', { class: 'lock' }, '🔒') : h('span', { class: 'insecure' }, '⚠ Not secure'),
    page.url,
  );
  const chrome = h(
    'div',
    { class: 'chrome' },
    h('button', { type: 'button', 'aria-label': 'Back', disabled: true }, '←'),
    addr,
    h('button', { type: 'button', 'aria-label': 'Close', 'data-action': 'close-browser', onclick: onClose }, '✕'),
  );

  let body;
  if (page.kind === 'phish-login') body = phishLogin(page, pageId, emailId, state);
  else if (page.kind === 'macro-doc') body = macroDoc(page, pageId, emailId, state);
  else if (page.kind === 'doc') body = h('div', { class: 'page docpage' }, h('div', { class: 'paper' }, h('h1', {}, page.title), page.lines.map((l) => h('p', {}, l))));
  else body = h('div', { class: 'page info' }, h('h1', {}, page.title), page.lines.map((l) => h('p', {}, l)));

  return h('div', { class: 'browser', role: 'dialog', 'aria-label': page.kind === 'macro-doc' || page.kind === 'doc' ? 'Document viewer' : 'Web browser' }, chrome, body);
}

function phishLogin(page, pageId, emailId, state) {
  const pw = h('input', { type: 'password', placeholder: 'Password', 'aria-label': 'Password', autocomplete: 'off' });
  const msg = h('div', { class: 'small' }, page.small || 'Signing in keeps your current password active for another 90 days.');
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
          h('div', { class: 'logo' }, page.brand || 'HALCYON MUTUAL'),
          h('p', { class: 'done' }, `✓ ${page.done || 'Thank you. Your password has been confirmed.'}`),
          h('p', {}, 'You can close this window.'),
        );
      },
    },
    h('div', { class: 'logo' }, page.brand || 'HALCYON MUTUAL'),
    h('h1', {}, page.heading || 'Sign in'),
    h('input', { type: 'text', value: 'analyst01@halcyonmutual.com', 'aria-label': 'Email', readonly: true }),
    pw,
    h('button', { type: 'submit', 'data-action': 'sign-in' }, 'Sign in'),
    msg,
  );
  return h('div', { class: 'page login' }, card);
}

function macroDoc(page, pageId, emailId, state) {
  const ms = state.mailState(emailId);
  const content = h('div', { class: 'paper blurred' }, h('h1', {}, page.title), page.lines.map((l) => h('p', {}, l)));
  const bar = h(
    'div',
    { class: 'macrobar' },
    h('b', {}, 'SECURITY WARNING'),
    ' Macros have been disabled.',
    h(
      'button',
      {
        type: 'button',
        'data-action': 'enable-content',
        onclick: () => {
          if (ms.macroEnabled) return;
          ms.macroEnabled = true;
          state.log('macro-enabled', { id: emailId, page: pageId });
          bar.replaceChildren(h('span', {}, 'Content enabled.'));
          content.classList.remove('blurred');
          content.replaceChildren(
            h('h1', {}, page.title),
            h('p', { class: 'flash' }, '(A blue PowerShell window flashes open and closes. The document stays blank.)'),
            h('p', {}, page.afterEnable || 'Nothing else seems to happen.'),
          );
        },
      },
      'Enable Content',
    ),
  );
  if (ms.macroEnabled) {
    bar.replaceChildren(h('span', {}, 'Content enabled.'));
    content.classList.remove('blurred');
  }
  return h('div', { class: 'page docpage' }, bar, h('div', { class: 'docnote' }, page.note || 'This document is protected. Enable content to view it.'), content);
}
