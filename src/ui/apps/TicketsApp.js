import { h, clear } from '../dom.js';

// Helpdesk ticket queue. Each ticket offers a few ways to handle it; some are traps.
// ticket: { id, title, from, via, priority, created, body: [lines], facts: [[k, v]], options: [{id, text, reply, ...}] }
export class TicketsApp {
  constructor({ state, day, changed, toast }) {
    Object.assign(this, { state, day, changed, toast });
    this.selected = null;
    this.el = h('div', { class: 'tickets' });
  }

  list() {
    return this.day().tickets || [];
  }

  render() {
    const tickets = this.list();
    if (!this.selected && tickets.length) this.selected = (tickets.find((t) => !this.state.tickets[t.id]) || tickets[0]).id;
    const t = tickets.find((x) => x.id === this.selected);
    const open = tickets.filter((x) => !this.state.tickets[x.id]).length;
    clear(this.el).append(
      h(
        'div',
        { class: 'tlist' },
        h('div', { class: 'thead' }, `Queue · ${open} open`),
        tickets.length
          ? tickets.map((x) =>
              h(
                'button',
                { type: 'button', class: `titem${x.id === this.selected ? ' active' : ''}${this.state.tickets[x.id] ? ' done' : ''}`, 'data-ticket': x.id, onclick: () => { this.selected = x.id; this.render(); } },
                h('div', { class: 'tnum' }, `#${x.num} · ${x.priority}`, this.state.tickets[x.id] ? h('span', { class: 'tstatus' }, 'Closed') : h('span', { class: 'tstatus open' }, 'Open')),
                h('div', { class: 'ttitle' }, x.title),
                h('div', { class: 'tfrom' }, x.from),
              ),
            )
          : h('div', { class: 'empty' }, 'No tickets.'),
      ),
      h('div', { class: 'tdetail' }, t ? this.renderTicket(t) : h('div', { class: 'empty' }, 'Select a ticket.')),
    );
  }

  renderTicket(t) {
    const decided = this.state.tickets[t.id];
    const chosen = t.options.find((o) => o.id === decided);
    return [
      h('h2', {}, `#${t.num}  ${t.title}`),
      h('table', { class: 'tfacts' },
        [['From', t.from], ['Submitted', t.via], ['Priority', t.priority], ...(t.facts || [])].map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))),
      h('div', { class: 'tbody' }, t.body.map((l) => h('p', {}, l))),
      decided
        ? h('div', { class: 'tresolved' }, h('b', {}, 'You: '), chosen?.text, chosen?.reply ? h('p', { class: 'treply' }, chosen.reply) : null)
        : h(
            'div',
            { class: 'toptions' },
            h('div', { class: 'tq' }, 'How do you handle it?'),
            t.options.map((o) =>
              h('button', { type: 'button', class: 'topt', 'data-option': o.id, onclick: () => this.decide(t, o) }, o.text),
            ),
          ),
    ];
  }

  decide(t, o) {
    this.state.tickets[t.id] = o.id;
    this.state.log('ticket-decided', { id: t.id, option: o.id });
    this.toast(`Ticket #${t.num} closed`, o.text);
    const next = this.list().find((x) => !this.state.tickets[x.id]);
    if (next) this.selected = next.id;
    this.render();
    this.changed();
  }
}
