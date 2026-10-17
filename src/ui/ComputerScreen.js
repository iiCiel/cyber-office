import { Overlay } from './Overlay.js';
import { h, clear } from './dom.js';
import { MailApp, unreadCount } from './apps/MailApp.js';
import { renderBrowser } from './apps/Browser.js';

// Your workstation: a small desktop with apps. Mail is real (M3); Terminal and Tickets come later.
export class ComputerScreen extends Overlay {
  constructor(scene) {
    super(scene, { name: 'workstation' });
    this.mail = new MailApp({
      state: scene.state,
      minutes: () => scene.minutes,
      openLink: (pageId, emailId) => this.openBrowser(pageId, emailId),
      toast: (title, text) => this.toast(title, text),
      changed: () => {
        this.renderIcons();
        scene.onStateChanged();
      },
    });

    this.APPS = [
      { id: 'mail', label: 'Mail', glyph: '✉', title: 'Mail - analyst01@halcyonmutual.com', size: 'max', render: () => (this.mail.render(), this.mail.el) },
      {
        id: 'notes',
        label: 'welcome.txt',
        glyph: '≡',
        title: 'welcome.txt - Notepad',
        size: 'small',
        render: () =>
          h(
            'pre',
            { class: 'notes-text mono' },
            [
              'Welcome to Halcyon Mutual!',
              '',
              'Day 1 checklist:',
              ...scene.objectiveList().map((o) => `  [${o.done ? 'x' : ' '}] ${o.text}`),
              '',
              'Tip: never click a link before you hover it.',
            ].join('\n'),
          ),
      },
      {
        id: 'terminal',
        label: 'Terminal',
        glyph: '>_',
        title: 'Terminal',
        size: 'small',
        render: () =>
          h('pre', { class: 'notes-text mono' }, 'analyst01@HALCYON-WS-0142:~$ _\n\nAccess pending approval (ticket #4471).\nComing later: whois, nslookup, grep.'),
      },
      {
        id: 'tickets',
        label: 'Tickets',
        glyph: '#',
        title: 'Helpdesk Tickets',
        size: 'small',
        render: () => h('pre', { class: 'notes-text' }, 'No tickets assigned to you yet.\n\nEnjoy it. It will not last.'),
      },
    ];

    this.icons = h('div', { class: 'icons' });
    this.winHost = h('div');
    this.browserHost = h('div');
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.clock = h('span');
    this.root.append(
      h(
        'div',
        { class: 'desktop' },
        h('div', { class: 'brand' }, 'HALCYON MUTUAL', h('small', {}, 'Protecting what matters')),
        this.icons,
        this.winHost,
        this.browserHost,
        this.toasts,
        h(
          'div',
          { class: 'taskbar' },
          h('span', {}, '⊞ Start'),
          h('span', { class: 'hint' }, 'Keys 1-4 open apps · Esc goes back'),
          h('span', { class: 'spacer' }),
          h('span', { class: 'user' }, 'analyst01'),
          this.clock,
        ),
      ),
    );
    this.renderIcons();
  }

  renderIcons() {
    const unread = unreadCount(this.scene.state, this.scene.minutes);
    clear(this.icons).append(
      ...this.APPS.map((app, i) =>
        h(
          'button',
          { type: 'button', class: 'icon', 'data-app': app.id, title: `${app.label} (${i + 1})`, onclick: () => this.openApp(app.id) },
          h('span', { class: 'glyph' }, app.glyph),
          app.label,
          app.id === 'mail' && unread ? h('span', { class: 'badge' }, unread) : null,
        ),
      ),
    );
  }

  openApp(id) {
    const app = this.APPS.find((a) => a.id === id);
    if (!app) return;
    this.openedApp = id;
    this.closeBrowser();
    clear(this.winHost).append(
      h(
        'div',
        { class: `window ${app.size}`, 'data-window': id },
        h(
          'div',
          { class: 'titlebar' },
          h('span', { class: 'title' }, app.title),
          h('button', { type: 'button', 'aria-label': 'Close window', 'data-action': 'close-window', onclick: () => this.closeApp() }, '✕'),
        ),
        h('div', { class: 'content' }, app.render()),
      ),
    );
    if (id === 'mail') this.scene.state.log('mail-opened');
  }

  closeApp() {
    this.openedApp = null;
    clear(this.winHost);
  }

  openBrowser(pageId, emailId) {
    const el = renderBrowser({ pageId, emailId, state: this.scene.state, onClose: () => this.closeBrowser() });
    if (el) clear(this.browserHost).append(el);
  }

  closeBrowser() {
    const had = !!this.browserHost.firstChild;
    clear(this.browserHost);
    if (had) this.scene.onStateChanged();
    return had;
  }

  toast(title, text) {
    const t = h('div', { class: 'toast' }, h('b', {}, title), text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 4500);
  }

  onKeyDown(e) {
    if (e.target.matches?.('input, textarea')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= this.APPS.length) this.openApp(this.APPS[n - 1].id);
  }

  tick() {
    this.clock.textContent = this.scene.clockString();
    const before = this.lastUnread;
    this.lastUnread = unreadCount(this.scene.state, this.scene.minutes);
    if (before !== undefined && this.lastUnread > before) {
      this.toast('New email', 'You have new mail.');
      this.renderIcons();
    }
    if (this.openedApp === 'mail') this.mail.tick();
  }

  onOpen() {
    this.closeBrowser();
    this.renderIcons();
    this.lastUnread = undefined;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
    // First time at the desk: open mail straight away, so new players see their inbox.
    if (!this.scene.state.hasEvent('mail-opened')) this.openApp('mail');
    else if (this.openedApp) this.openApp(this.openedApp);
  }

  onCloseInternal() {
    clearInterval(this.timer);
  }

  back() {
    if (this.closeBrowser()) return;
    if (this.openedApp === 'mail' && this.mail.back()) return;
    if (this.openedApp) return this.closeApp();
    this.close();
  }
}
