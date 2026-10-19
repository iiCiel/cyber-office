import { Overlay } from './Overlay.js';
import { h, clear } from './dom.js';
import { MailApp, unreadCount } from './apps/MailApp.js';
import { renderBrowser } from './apps/Browser.js';
import { TerminalApp } from './apps/TerminalApp.js';
import { TicketsApp } from './apps/TicketsApp.js';
import { AdApp } from './apps/AdApp.js';

// Your workstation: a small desktop with apps. Mail every day; Tickets and Terminal on the days that use them.
export class ComputerScreen extends Overlay {
  constructor(scene) {
    super(scene, { name: 'workstation' });
    this.mail = new MailApp({
      state: scene.state,
      minutes: () => scene.minutes,
      day: () => scene.day,
      openLink: (pageId, emailId) => this.openBrowser(pageId, emailId),
      toast: (title, text) => this.toast(title, text),
      changed: () => {
        this.renderIcons();
        scene.onStateChanged();
      },
    });
    this.terminal = new TerminalApp({ state: scene.state, day: () => scene.day, changed: () => scene.onStateChanged() });
    this.powershell = new TerminalApp({ state: scene.state, day: () => scene.day, changed: () => scene.onStateChanged(), kind: 'pwsh' });
    this.ad = new AdApp({ state: scene.state, day: () => scene.day, changed: () => scene.onStateChanged() });
    this.ticketsApp = new TicketsApp({
      state: scene.state,
      day: () => scene.day,
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
              `${scene.day.date.name} checklist:`,
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
        title: () => `Terminal - analyst01@${scene.day.terminal?.host || 'soc-jump01'}`,
        size: 'max',
        render: () => {
          if (!scene.day.terminal) {
            return h('pre', { class: 'notes-text mono' }, 'analyst01@HALCYON-WS-0142:~$ _\n\nAccess pending approval (ticket #4471).');
          }
          this.terminal.focus();
          return this.terminal.el;
        },
      },
      {
        id: 'powershell',
        label: 'PowerShell',
        glyph: 'PS>',
        title: 'Windows PowerShell',
        size: 'max',
        visible: () => !!scene.day.powershell,
        render: () => {
          this.powershell.focus();
          return this.powershell.el;
        },
      },
      {
        id: 'ad',
        label: 'AD Users',
        glyph: '👥',
        title: 'Active Directory Users and Computers',
        size: 'max',
        visible: () => !!scene.day.directory,
        render: () => (this.ad.render(), this.ad.el),
      },
      {
        id: 'tickets',
        label: 'Tickets',
        glyph: '#',
        title: 'Helpdesk Tickets',
        size: 'max',
        render: () => {
          if (!scene.day.tickets?.length) return h('pre', { class: 'notes-text' }, 'No tickets assigned to you today.\n\nEnjoy it. It will not last.');
          this.ticketsApp.render();
          return this.ticketsApp.el;
        },
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
    const unread = unreadCount(this.scene.state, this.scene.day, this.scene.minutes);
    clear(this.icons).append(
      ...this.visibleApps().map((app, i) =>
        h(
          'button',
          { type: 'button', class: 'icon', 'data-app': app.id, title: `${app.label} (${i + 1})`, onclick: () => this.openApp(app.id) },
          h('span', { class: 'glyph' }, app.glyph),
          app.label,
          app.id === 'mail' && unread ? h('span', { class: 'badge' }, unread) : null,
          app.id === 'tickets' && this.openTickets() ? h('span', { class: 'badge' }, this.openTickets()) : null,
        ),
      ),
    );
  }

  // Apps a day does not use (PowerShell, AD Users and Computers) are hidden, so the desktop only shows what this day gives you.
  visibleApps() {
    return this.APPS.filter((a) => !a.visible || a.visible());
  }

  openTickets() {
    return (this.scene.day.tickets || []).filter((t) => !this.scene.state.tickets[t.id]).length;
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
          h('span', { class: 'title' }, typeof app.title === 'function' ? app.title() : app.title),
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
    const el = renderBrowser({ pageId, emailId, state: this.scene.state, pages: this.scene.day.pages, onClose: () => this.closeBrowser() });
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
    const apps = this.visibleApps();
    if (n >= 1 && n <= apps.length) this.openApp(apps[n - 1].id);
  }

  tick() {
    this.clock.textContent = this.scene.clockString();
    const before = this.lastUnread;
    this.lastUnread = unreadCount(this.scene.state, this.scene.day, this.scene.minutes);
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
    if (this.openedApp === 'ad' && this.ad.back()) return;
    if (this.openedApp) return this.closeApp();
    this.close();
  }
}
