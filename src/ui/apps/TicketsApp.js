import { h, clear } from '../dom.js';

// Service desk queue that looks and works like a ServiceNow incident list + incident form
// (reference: docs/reference/servicenow-incident-lower.png).
// ticket: { id, num, title, from, via, priority, facts: [[k, v]], body: [lines], options: [{id, text, reply, outcome}] }
// Optional ITSM fields on a ticket override the derived ones: category, subcategory, ci, group, impact, urgency.

const PRIORITY = {
  critical: { p: '1 - Critical', impact: '1 - High', urgency: '1 - High', sla: 'P1 resolution (4h)', used: 0.62 },
  high: { p: '2 - High', impact: '2 - Medium', urgency: '1 - High', sla: 'P2 resolution (8h)', used: 0.41 },
  normal: { p: '3 - Moderate', impact: '2 - Medium', urgency: '2 - Medium', sla: 'P3 resolution (3d)', used: 0.18 },
  medium: { p: '3 - Moderate', impact: '2 - Medium', urgency: '2 - Medium', sla: 'P3 resolution (3d)', used: 0.18 },
  low: { p: '4 - Low', impact: '3 - Low', urgency: '3 - Low', sla: 'P4 resolution (5d)', used: 0.07 },
};

// Keyword -> [category, subcategory, assignment group]. First match wins.
const CATEGORY = [
  [/phish|malware|ransom|suspicious|alert|breach|compromis|attack|exfil|beacon|edr|virus|mfa push|impossible travel/i, ['Security incident', 'Investigation', 'SOC - Tier 1']],
  [/password|locked|lockout|reset|unlock|mfa|authenticator/i, ['Inquiry / Help', 'Password reset', 'Service Desk']],
  [/access|permission|share|group|folder|admin rights|privilege/i, ['Inquiry / Help', 'Access request', 'Service Desk']],
  [/install|software|teamviewer|anydesk|app|excel|outlook|update|license/i, ['Software', 'Installation', 'Desktop Support']],
  [/vpn|wifi|wi-fi|network|internet|firewall|dns|port/i, ['Network', 'Connectivity', 'Network Operations']],
  [/usb|laptop|printer|monitor|phone|hardware|badge/i, ['Hardware', 'Peripheral', 'Desktop Support']],
];

export const incNumber = (t) => `INC${String(t.num ?? 0).padStart(7, '0')}`;

export function itsmFields(t) {
  const pr = PRIORITY[String(t.priority || 'normal').toLowerCase()] || PRIORITY.normal;
  const text = `${t.title} ${(t.body || []).join(' ')} ${(t.facts || []).map((f) => f.join(' ')).join(' ')}`;
  const [category, subcategory, group] = (CATEGORY.find(([re]) => re.test(text)) || [null, ['Inquiry / Help', 'General', 'Service Desk']])[1];
  const m = /^([^(]+?)\s*\(([^)]+)\)/.exec(t.from || '');
  const via = String(t.via || '');
  const contact = /portal/i.test(via) ? 'Self-service' : /phone|call/i.test(via) ? 'Phone' : /e-?mail/i.test(via) ? 'Email' : /walk|in person|stopped by/i.test(via) ? 'Walk-in' : /chat|teams|slack/i.test(via) ? 'Chat' : /siem|alert|edr|monitor/i.test(via) ? 'Monitoring' : 'Self-service';
  const ws = /\b((?:WS|LT|SRV|DC|PC)-?[A-Z0-9]{2,})\b/.exec(`${via} ${text}`);
  const when = /((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\.?\s+\d{1,2}:\d{2}\s*[AP]M)/i.exec(via);
  return {
    number: incNumber(t),
    caller: m ? m[1].trim() : t.from || '',
    dept: m ? m[2].trim() : '',
    contact,
    category: t.category || category,
    subcategory: t.subcategory || subcategory,
    ci: t.ci || (ws ? ws[1] : '(empty)'),
    group: t.group || group,
    priority: pr.p,
    impact: t.impact || pr.impact,
    urgency: t.urgency || pr.urgency,
    sla: pr.sla,
    slaUsed: pr.used,
    opened: when ? when[1] : 'Today',
  };
}

const CLOSE_CODE = { good: 'Solved (Permanently)', ok: 'Solved (Work Around)', bad: 'Solved (Not Reproducible)' };

export class TicketsApp {
  constructor({ state, day, changed, toast }) {
    Object.assign(this, { state, day, changed, toast });
    this.selected = null;
    this.tab = 'notes';
    this.el = h('div', { class: 'tickets snow' });
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
      h('div', { class: 'sn-top' },
        h('span', { class: 'sn-brand' }, 'Halcyon IT Service Management'),
        h('span', { class: 'sn-nav' }, 'Incident  >  Assigned to me'),
        h('span', { class: 'sn-user' }, 'analyst01'),
      ),
      h(
        'div',
        { class: 'tlist sn-list' },
        h('div', { class: 'thead sn-listhead' }, h('b', {}, 'Incidents'), h('span', {}, ` [Assigned to me]  ·  ${open} active  ·  ${tickets.length} total`)),
        tickets.length
          ? h('table', { class: 'sn-table' },
              h('thead', {}, h('tr', {}, ['Number', 'Opened', 'Short description', 'Caller', 'Priority', 'State', 'Assignment group'].map((c) => h('th', {}, c)))),
              h('tbody', {}, tickets.map((x) => {
                const f = itsmFields(x);
                const done = this.state.tickets[x.id];
                return h('tr', { class: `titem${x.id === this.selected ? ' active' : ''}${done ? ' done' : ''}`, 'data-ticket': x.id, onclick: () => { this.selected = x.id; this.tab = 'notes'; this.render(); } },
                  h('td', {}, h('a', { class: 'tnum sn-link' }, f.number)),
                  h('td', { class: 'sn-dim' }, f.opened),
                  h('td', { class: 'ttitle' }, x.title),
                  h('td', { class: 'tfrom' }, f.caller),
                  h('td', {}, h('span', { class: `sn-pri p${f.priority[0]}` }), f.priority),
                  h('td', {}, done ? h('span', { class: 'tstatus' }, 'Resolved') : h('span', { class: 'tstatus open' }, 'In Progress')),
                  h('td', { class: 'sn-dim' }, f.group));
              })))
          : h('div', { class: 'empty' }, 'No tickets.'),
      ),
      h('div', { class: 'tdetail sn-form' }, t ? this.renderTicket(t) : h('div', { class: 'empty' }, 'Select a ticket.')),
    );
  }

  field(label, value, opts = {}) {
    return h('div', { class: `sn-field${opts.wide ? ' wide' : ''}` },
      h('label', {}, opts.req ? h('span', { class: 'sn-req' }, '*') : null, label),
      h('div', { class: `sn-input${opts.ref ? ' ref' : ''}${opts.ro ? ' ro' : ''}${opts.select ? ' select' : ''}` }, value || ''),
    );
  }

  renderTicket(t) {
    const f = itsmFields(t);
    const decided = this.state.tickets[t.id];
    const chosen = t.options.find((o) => o.id === decided);
    const state = decided ? 'Resolved' : 'In Progress';
    const slaPct = Math.round((decided ? Math.min(1, f.slaUsed + 0.04) : f.slaUsed) * 100);
    const activity = [
      ...(decided
        ? [
            { who: 'analyst01', kind: 'Field changes', ts: 'just now', lines: [`State: ${state} was In Progress`, `Close code: ${CLOSE_CODE[chosen?.outcome] || 'Solved (Permanently)'}`] },
            { who: 'analyst01', kind: 'Work notes', ts: 'just now', note: true, lines: [chosen?.text] },
            ...(chosen?.reply ? [{ who: f.caller, kind: 'Additional comments', ts: 'just now', lines: [chosen.reply] }] : []),
          ]
        : []),
      { who: 'System', kind: 'Field changes', ts: f.opened, lines: [`Assignment group: ${f.group}`, 'Assigned to: analyst01', 'State: In Progress was New'] },
      { who: f.caller, kind: 'Additional comments', ts: f.opened, lines: t.body },
    ];
    return [
      h('div', { class: 'sn-formhead' },
        h('span', { class: 'sn-back' }, '<'),
        h('span', { class: 'sn-rectype' }, 'Incident'),
        h('h2', {}, f.number),
        h('span', { class: 'sn-btns' },
          h('button', { type: 'button', class: 'sn-btn' }, 'Follow'),
          h('button', { type: 'button', class: 'sn-btn' }, 'Update'),
          h('button', { type: 'button', class: 'sn-btn primary', onclick: () => this.el.querySelector('.toptions')?.scrollIntoView({ block: 'nearest' }) }, 'Resolve'),
        ),
      ),
      h('div', { class: 'sn-flow' }, ['New', 'In Progress', 'On Hold', 'Resolved', 'Closed'].map((s) => h('span', { class: s === state ? 'on' : (s === 'New' || (decided && s === 'In Progress')) ? 'past' : '' }, s))),
      h('div', { class: 'sn-grid' },
        h('div', {},
          this.field('Number', f.number, { ro: true }),
          this.field('Caller', f.caller, { req: true, ref: true }),
          this.field('Department', f.dept, { ro: true }),
          this.field('Category', f.category, { select: true }),
          this.field('Subcategory', f.subcategory, { select: true }),
          this.field('Configuration item', f.ci, { ref: true }),
        ),
        h('div', {},
          this.field('Opened', f.opened, { ro: true }),
          this.field('Channel', f.contact, { select: true }),
          this.field('State', state, { select: true }),
          this.field('Impact', f.impact, { select: true }),
          this.field('Urgency', f.urgency, { select: true }),
          this.field('Priority', f.priority, { ro: true }),
          this.field('Assignment group', f.group, { ref: true }),
          this.field('Assigned to', 'analyst01', { ref: true }),
        ),
      ),
      this.field('Short description', t.title, { req: true, wide: true }),
      h('div', { class: 'sn-field wide' }, h('label', {}, 'Description'), h('div', { class: 'sn-input sn-area tbody' }, t.body.map((l) => h('p', {}, l)), h('p', { class: 'sn-dim' }, `Source: ${t.via}`))),
      t.facts?.length
        ? h('div', { class: 'sn-section' }, h('div', { class: 'sn-sechead' }, 'Request details'),
            h('table', { class: 'tfacts' }, t.facts.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))))
        : null,
      h('div', { class: 'sn-sla' },
        h('span', {}, 'Task SLA'), h('b', {}, f.sla),
        h('span', { class: 'sn-slabar' }, h('i', { style: `width:${slaPct}%` })),
        h('span', {}, `${slaPct}% elapsed`), h('span', { class: decided ? 'sn-ok' : '' }, decided ? 'Completed' : 'In progress'),
      ),
      decided
        ? h('div', { class: 'sn-section tresolved' },
            h('div', { class: 'sn-sechead' }, 'Resolution Information'),
            this.field('Close code', CLOSE_CODE[chosen?.outcome] || 'Solved (Permanently)', { select: true, ro: true }),
            h('div', { class: 'sn-field wide' }, h('label', {}, 'Close notes'), h('div', { class: 'sn-input sn-area ro' }, h('b', {}, 'You: '), chosen?.text, chosen?.reply ? h('p', { class: 'treply' }, chosen.reply) : null)))
        : h('div', { class: 'sn-section toptions' },
            h('div', { class: 'sn-sechead tq' }, 'Resolution Information: how do you handle it?'),
            h('div', { class: 'sn-hint' }, 'Pick the resolution. It is posted to the work notes and the caller is told.'),
            t.options.map((o) => h('button', { type: 'button', class: 'topt', 'data-option': o.id, onclick: () => this.decide(t, o) }, h('span', { class: 'sn-radio' }), o.text))),
      h('div', { class: 'sn-tabs' },
        [['notes', 'Notes'], ['related', 'Related Records'], ['sla', 'Task SLAs']].map(([id, label]) =>
          h('button', { type: 'button', class: this.tab === id ? 'on' : '', onclick: () => { this.tab = id; this.render(); } }, label))),
      this.tab === 'notes'
        ? h('div', { class: 'sn-tabbody' },
            h('div', { class: 'sn-field wide' }, h('label', {}, 'Watch list'), h('div', { class: 'sn-iconbtn' }, '🔒')),
            h('div', { class: 'sn-field wide' }, h('label', {}, 'Additional comments', h('br'), '(Customer visible)'), h('div', { class: 'sn-input sn-area sn-empty' }, '')),
            h('div', { class: 'sn-field wide' }, h('label', {}, 'Work notes'), h('div', { class: 'sn-input sn-area sn-worknote' }, '')),
            h('div', { class: 'sn-post' }, h('button', { type: 'button', class: 'sn-btn' }, 'Post')),
            h('div', { class: 'sn-activity' },
              h('div', { class: 'sn-acthead' }, `Activity: ${activity.length}`),
              activity.map((a) => h('div', { class: `sn-act${a.note ? ' note' : ''}` },
                h('div', { class: 'sn-acttop' }, h('span', { class: 'sn-avatar' }, a.who.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()), h('b', {}, a.who), h('span', { class: 'sn-dim' }, ` ${a.kind}  ·  ${a.ts}`)),
                a.lines.filter(Boolean).map((l) => h('div', { class: 'sn-actline' }, l))))))
        : this.tab === 'related'
          ? h('div', { class: 'sn-tabbody' }, h('table', { class: 'sn-table' }, h('thead', {}, h('tr', {}, ['Type', 'Record', 'Detail'].map((c) => h('th', {}, c)))),
              h('tbody', {}, h('tr', {}, h('td', {}, 'Configuration item'), h('td', {}, h('a', { class: 'sn-link' }, f.ci)), h('td', {}, f.dept || '-')),
                h('tr', {}, h('td', {}, 'Caller'), h('td', {}, h('a', { class: 'sn-link' }, f.caller)), h('td', {}, f.contact)))))
          : h('div', { class: 'sn-tabbody' }, h('table', { class: 'sn-table' }, h('thead', {}, h('tr', {}, ['SLA definition', 'Stage', 'Elapsed', 'Has breached'].map((c) => h('th', {}, c)))),
              h('tbody', {}, h('tr', {}, h('td', {}, f.sla), h('td', {}, decided ? 'Completed' : 'In progress'), h('td', {}, `${slaPct}%`), h('td', {}, 'false'))))),
    ];
  }

  decide(t, o) {
    this.state.tickets[t.id] = o.id;
    this.state.log('ticket-decided', { id: t.id, option: o.id });
    this.toast(`${incNumber(t)} resolved`, o.text);
    const next = this.list().find((x) => !this.state.tickets[x.id]);
    if (next) this.selected = next.id;
    this.render();
    this.changed();
  }
}
