// Support Services: the "My applications" launcher Midwest teams land on (docs/reference/support-services-2026.png),
// and the ticket form behind Support Tickets. Tile art is plain lettering, not the products' logos.
import { h, clear } from '../dom.js';
import './netlab.css';

const CATEGORIES = ['Tech Support', 'Scoring Inquiry', 'Password Change Request'];

export class SupportApp {
  constructor({ tiles, vms, onTicket }) {
    Object.assign(this, { tiles, vms, onTicket });
    this.tickets = [];
    this.body = h('div', {});
    this.search = h('input', { class: 'ss-search', placeholder: 'Search for an application by name...', 'aria-label': 'Search applications', oninput: () => this.drawHome(), onkeydown: (e) => e.stopPropagation() });
    this.el = h('div', { class: 'ss' }, this.body);
    this.drawHome();
  }

  drawHome() {
    const q = this.search.value.trim().toLowerCase();
    const list = this.tiles.filter((t) => t.label.toLowerCase().includes(q));
    clear(this.body).append(
      h('div', { class: 'ss-top' }, h('h2', {}, 'My applications'), this.search),
      h('div', { class: 'ss-tiles' }, list.map((t) => h('button', { type: 'button', class: 'ss-tile', 'data-tile': t.id, onclick: () => (t.id === 'tickets' ? this.drawTickets() : t.open()) }, h('span', { class: `ss-glyph ss-g-${t.glyphClass || 'plain'}` }, t.glyph), t.label))));
  }

  drawTickets() {
    const cat = h('select', { 'aria-label': 'Category', onchange: () => show() }, CATEGORIES.map((c) => h('option', {}, c)));
    const vm = h('select', { 'aria-label': 'Virtual machine' }, h('option', { value: '' }, '(none)'), this.vms.map((d) => h('option', { value: d.id }, d.tab)));
    const restore = h('input', { type: 'checkbox', 'data-restore': '' });
    const restoreRow = h('label', {}, restore, ' Restore this VM to its original state (points penalty; your work on it is lost)');
    const text = h('textarea', { 'aria-label': 'Description', onkeydown: (e) => e.stopPropagation() });
    const msg = h('div', {});
    const show = () => { restoreRow.hidden = cat.value !== 'Tech Support'; };
    show();
    const submit = () => {
      if (text.value.trim().length < 8) { msg.textContent = 'Please describe the request.'; return; }
      const r = this.onTicket({ category: cat.value, vm: vm.value, text: text.value, restore: restore.checked });
      this.tickets.unshift({ n: 1000 + this.tickets.length + 1, cat: cat.value, status: r.status, reply: r.reply });
      this.drawTickets();
    };
    clear(this.body).append(
      h('button', { type: 'button', class: 'ss-back', onclick: () => this.drawHome() }, '< My applications'),
      h('div', { class: 'ss-page' }, h('h3', {}, 'Report Issue'),
        h('div', { class: 'ss-form' },
          h('label', {}, 'Category'), cat, h('label', {}, 'Virtual machine'), vm, restoreRow, h('label', {}, 'Description'), text, msg,
          h('button', { type: 'button', 'data-submit': '', onclick: submit }, 'Submit Report')),
        this.tickets.length ? h('table', { class: 'ss-tbl' }, h('thead', {}, h('tr', {}, ['ID', 'Category', 'Status', 'Reply'].map((t) => h('th', {}, t)))), h('tbody', {}, this.tickets.map((t) => h('tr', {}, h('td', {}, String(t.n)), h('td', {}, t.cat), h('td', {}, t.status), h('td', {}, t.reply))))) : null));
  }

  refresh() {}
}

/** A plain file list for the team share (CCDC Docs). */
export class DocsApp {
  constructor({ files }) {
    this.el = h('div', { class: 'ss' }, h('div', { class: 'ss-page' }, h('h3', {}, 'Team files'), h('table', { class: 'ss-tbl' }, h('thead', {}, h('tr', {}, ['Name', 'Notes'].map((t) => h('th', {}, t)))), h('tbody', {}, files.map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))))));
  }
  refresh() {}
}
