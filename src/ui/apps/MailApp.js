import { h, clear } from '../dom.js';
import { EMAILS, REPLY_DRAFTS, PLAYER_EMAIL } from '../../data/day1.js';

// Outlook-ish mail client. Every security-relevant action is recorded in GameState
// (read, hover, click, report, delete, reply, view headers) for consequences and the report card.

const fmtTime = (m) => {
  const h24 = Math.floor(m / 60) % 24;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};

export function deliveredEmails(minutes) {
  return EMAILS.filter((e) => e.at <= minutes);
}

export function folderOf(state, id) {
  const s = state.mail[id];
  if (s?.reported) return 'reported';
  if (s?.deleted) return 'deleted';
  return 'inbox';
}

export function unreadCount(state, minutes) {
  return deliveredEmails(minutes).filter((e) => folderOf(state, e.id) === 'inbox' && !state.mail[e.id]?.read).length;
}

export class MailApp {
  /**
   * @param {object} o
   * @param {import('../../game/GameState.js').GameState} o.state
   * @param {() => number} o.minutes  current in-game time
   * @param {(pageId: string, emailId: string) => void} o.openLink
   * @param {(title: string, text: string) => void} o.toast
   * @param {() => void} o.changed  called after anything changes (badge counts, objectives)
   */
  constructor(o) {
    Object.assign(this, o);
    this.folder = 'inbox';
    this.selected = null;
    this.view = 'body'; // body | headers | compose
    this.explain = false;
    this.known = new Set(deliveredEmails(this.minutes()).map((e) => e.id));
    this.el = h('div', { class: 'mail' });
  }

  // Called every second while the mail window is open; shows new arrivals.
  tick() {
    if (this.view === 'compose') return; // don't rebuild the page (and lose the draft) while typing
    const fresh = deliveredEmails(this.minutes()).filter((e) => !this.known.has(e.id));
    if (!fresh.length) return;
    for (const e of fresh) this.known.add(e.id);
    this.freshIds = new Set(fresh.map((e) => e.id));
    this.render();
  }

  emailsIn(folder) {
    return deliveredEmails(this.minutes())
      .filter((e) => folderOf(this.state, e.id) === folder)
      .sort((a, b) => b.at - a.at);
  }

  sentItems() {
    return this.state.events.filter((e) => e.type === 'reply-sent');
  }

  select(id) {
    this.selected = id;
    this.view = 'body';
    const ms = this.state.mailState(id);
    if (!ms.read) {
      ms.read = true;
      this.state.log('mail-read', { id });
    }
    this.changed();
    this.render();
  }

  current() {
    return EMAILS.find((e) => e.id === this.selected) || null;
  }

  // ---------- actions ----------
  report() {
    const e = this.current();
    if (!e) return;
    const ms = this.state.mailState(e.id);
    ms.reported = true;
    ms.deleted = false;
    this.state.log('mail-reported', { id: e.id, phish: e.phish });
    this.toast('Reported to the SOC', `"${e.subject}" was sent for review and removed from your inbox.`);
    this.afterMove();
  }

  remove() {
    const e = this.current();
    if (!e) return;
    const ms = this.state.mailState(e.id);
    ms.deleted = true;
    this.state.log('mail-deleted', { id: e.id, phish: e.phish });
    this.afterMove();
  }

  restore() {
    const e = this.current();
    if (!e) return;
    const ms = this.state.mailState(e.id);
    ms.deleted = false;
    ms.reported = false;
    this.state.log('mail-restored', { id: e.id });
    this.folder = 'inbox';
    this.render();
    this.changed();
  }

  afterMove() {
    // Select the next email in the folder, like a real client.
    const list = this.emailsIn(this.folder);
    this.selected = list[0]?.id ?? null;
    if (this.selected) this.select(this.selected);
    else this.render();
    this.changed();
  }

  showHeaders() {
    const e = this.current();
    if (!e) return;
    this.view = this.view === 'headers' ? 'body' : 'headers';
    if (this.view === 'headers') {
      const ms = this.state.mailState(e.id);
      if (!ms.viewedHeaders) {
        ms.viewedHeaders = true;
        this.state.log('headers-viewed', { id: e.id });
      }
    }
    this.render();
  }

  reply() {
    if (!this.current()) return;
    this.view = 'compose';
    this.render();
  }

  send(to, text) {
    const e = this.current();
    const ms = this.state.mailState(e.id);
    ms.replied = true;
    this.state.log('reply-sent', { id: e.id, to, phish: e.phish, subject: `RE: ${e.subject}`, text: text.slice(0, 300) });
    this.toast('Sent', `Reply sent to ${to}`);
    this.view = 'body';
    this.render();
    this.changed();
  }

  hoverLink(e, link) {
    const ms = this.state.mailState(e.id);
    ms.hovered = ms.hovered || [];
    if (!ms.hovered.includes(link.link)) {
      ms.hovered.push(link.link);
      this.state.save();
    }
  }

  clickLink(e, link) {
    const ms = this.state.mailState(e.id);
    if (!ms.clicked.includes(link.link)) ms.clicked.push(link.link);
    this.state.log('link-clicked', { id: e.id, link: link.link, phish: e.phish, hoveredFirst: !!ms.hovered?.includes(link.link) });
    this.openLink(link.link, e.id);
  }

  // ---------- rendering ----------
  render() {
    const e = this.current();
    const inbox = this.emailsIn('inbox');
    const unread = inbox.filter((m) => !this.state.mail[m.id]?.read).length;
    const inMailbox = e && folderOf(this.state, e.id) === this.folder;
    const can = !!e && inMailbox && this.folder !== 'sent';

    const btn = (label, fn, extra = {}) => h('button', { type: 'button', onclick: fn, disabled: !can, ...extra }, label);
    const toolbar = h(
      'div',
      { class: 'toolbar' },
      btn('↩ Reply', () => this.reply(), { 'data-action': 'reply' }),
      btn('🗑 Delete', () => this.remove(), { 'data-action': 'delete', disabled: !can || this.folder === 'deleted' }),
      btn('🎣 Report phishing', () => this.report(), { class: 'report', 'data-action': 'report', disabled: !can || this.folder === 'reported' }),
      h('span', { class: 'sep' }),
      btn(this.view === 'headers' ? '✉ Show message' : '{ } View headers', () => this.showHeaders(), { 'data-action': 'headers' }),
    );

    const folderBtn = (id, label, count) =>
      h(
        'button',
        {
          type: 'button',
          class: `folder${this.folder === id ? ' active' : ''}`,
          'data-folder': id,
          onclick: () => {
            this.folder = id;
            this.selected = null;
            this.view = 'body';
            this.render();
          },
        },
        h('span', {}, label),
        count ? h('span', { class: 'count' }, count) : null,
      );
    const folders = h(
      'div',
      { class: 'folders' },
      folderBtn('inbox', 'Inbox', unread),
      folderBtn('reported', 'Reported', 0),
      folderBtn('deleted', 'Deleted', 0),
      folderBtn('sent', 'Sent', 0),
    );

    let list;
    if (this.folder === 'sent') {
      const sent = this.sentItems();
      list = h(
        'div',
        { class: 'list' },
        sent.length
          ? sent.map((s) =>
              h('div', { class: 'item' }, h('div', { class: 'who' }, h('span', {}, `To: ${s.to}`)), h('div', { class: 'subj' }, s.subject)),
            )
          : h('div', { class: 'empty' }, 'Nothing sent yet.'),
      );
    } else {
      const items = this.emailsIn(this.folder);
      list = h(
        'div',
        { class: 'list', role: 'list' },
        items.length
          ? items.map((m) =>
              h(
                'button',
                {
                  type: 'button',
                  role: 'listitem',
                  class: `item${this.state.mail[m.id]?.read ? '' : ' unread'}${m.id === this.selected ? ' active' : ''}${this.freshIds?.has(m.id) ? ' new' : ''}`,
                  'data-email': m.id,
                  onclick: () => this.select(m.id),
                },
                h('div', { class: 'who' }, h('span', {}, m.from.name), h('span', { class: 'time' }, fmtTime(m.at))),
                h('div', { class: 'subj' }, m.subject),
              ),
            )
          : h('div', { class: 'empty' }, this.folder === 'inbox' ? 'Inbox zero. Nice.' : 'Empty.'),
      );
    }
    this.freshIds = null;

    this.status = h('div', { class: 'status' }, 'Hover over a link to see where it really goes.');
    const reader = h('div', { class: 'reader' }, this.renderReader(e, inMailbox));

    clear(this.el).append(toolbar, folders, list, reader, this.status);
  }

  renderReader(e, inMailbox) {
    if (!e || !inMailbox) return h('div', { class: 'empty' }, this.folder === 'sent' ? '' : 'Select an email to read it.');

    if (this.view === 'headers') return this.renderHeaders(e);
    if (this.view === 'compose') return this.renderCompose(e);

    const folderNote =
      this.folder !== 'inbox'
        ? h(
            'div',
            { class: 'folder-note' },
            this.folder === 'reported' ? 'You reported this email.' : 'This email is in Deleted.',
            h('button', { type: 'button', onclick: () => this.restore(), 'data-action': 'restore' }, 'Move back to Inbox'),
          )
        : null;

    const banner = e.external
      ? h('div', { class: 'banner' }, '⚠ CAUTION: This email came from outside your organization. Be careful with links and attachments.')
      : null;

    const body = e.body.map((b) => {
      if (typeof b === 'string') return h('p', {}, b);
      const isButton = !/^https?:|\./.test(b.text) || b.text.includes(' ');
      const link = h(
        'button',
        {
          type: 'button',
          class: `link${isButton ? ' button' : ''}`,
          'data-link': b.link,
          onmouseenter: () => {
            this.status.replaceChildren('Link goes to: ', h('span', { class: 'url' }, b.href));
            this.hoverLink(e, b);
          },
          onfocus: () => {
            this.status.replaceChildren('Link goes to: ', h('span', { class: 'url' }, b.href));
            this.hoverLink(e, b);
          },
          onmouseleave: () => this.status.replaceChildren('Hover over a link to see where it really goes.'),
          onclick: () => this.clickLink(e, b),
        },
        b.text,
      );
      return h('p', {}, link);
    });

    return [
      folderNote,
      banner,
      h(
        'div',
        { class: 'head' },
        h('h2', {}, e.subject),
        h('div', { class: 'from' }, h('span', { class: 'name' }, e.from.name), h('span', { class: 'addr' }, `<${e.from.address}>`)),
        h('div', { class: 'meta' }, h('b', {}, 'To: '), e.to, '   ', h('b', {}, 'Sent: '), `Mon 10/19/2026 ${fmtTime(e.at)}`),
        e.replyTo ? h('div', { class: 'meta' }, h('b', {}, 'Reply-To: '), e.replyTo) : null,
      ),
      h('div', { class: 'body' }, body),
    ];
  }

  renderHeaders(e) {
    // Group each header field with its indented continuation lines, then add the note after the field.
    const fields = [];
    for (const line of e.headers) {
      if (line.startsWith('  ') && fields.length) fields[fields.length - 1].push(line);
      else fields.push([line]);
    }
    const lines = [];
    for (const field of fields) {
      const key = Object.keys(e.notes || {}).find((k) => field[0].startsWith(k));
      const mark = this.explain && key;
      for (const line of field) lines.push(h('span', { class: `line${mark ? ' key' : ''}` }, `${line}\n`));
      if (mark) lines.push(h('span', { class: 'note' }, e.notes[key]));
    }
    return h(
      'div',
      { class: 'headers' },
      h(
        'div',
        { class: 'bar' },
        h('b', {}, 'Message headers'),
        h(
          'button',
          {
            type: 'button',
            class: this.explain ? 'on' : '',
            'data-action': 'explain',
            onclick: () => {
              this.explain = !this.explain;
              if (this.explain) this.state.log('headers-explained', { id: e.id });
              this.render();
            },
          },
          this.explain ? '✓ Explaining' : '? Explain these',
        ),
      ),
      h('pre', { class: 'mono' }, lines),
    );
  }

  renderCompose(e) {
    const to = e.replyTo || e.from.address;
    const text = h('textarea', { 'aria-label': 'Message' });
    text.value = `${REPLY_DRAFTS[e.id] || ''}\n\n----- Original message -----\nFrom: ${e.from.name} <${e.from.address}>\nSubject: ${e.subject}`;
    return h(
      'div',
      { class: 'compose' },
      h('div', { class: 'field' }, h('label', {}, 'From'), h('span', { class: 'val' }, PLAYER_EMAIL)),
      h('div', { class: 'field' }, h('label', {}, 'To'), h('span', { class: 'val', 'data-field': 'to' }, to)),
      h('div', { class: 'field' }, h('label', {}, 'Subject'), h('span', {}, `RE: ${e.subject}`)),
      text,
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'send', 'data-action': 'send', onclick: () => this.send(to, text.value) }, 'Send'),
        h('button', { type: 'button', 'data-action': 'discard', onclick: () => { this.view = 'body'; this.render(); } }, 'Discard'),
      ),
    );
  }

  /** Esc inside mail: leave headers/compose first. Returns true if handled. */
  back() {
    if (this.view !== 'body') {
      this.view = 'body';
      this.render();
      return true;
    }
    return false;
  }
}
