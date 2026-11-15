// The PAN-OS 11.0 web interface of the Palo Alto firewall (PA-VM), opened in a browser on the team workstation at
// the firewall's management IP, the way it was reached at the MWCCDC Invitational (Nov 14, 2026). This first
// screen is Policies > Security, matched to the team's own screenshot from that day (docs/reference/panos-
// policies-security.png): dark header with the PA-VM name and the top tabs, the policy tree on the left, the
// rulebase table with grouped Source / Destination columns and the two predefined rules shaded at the bottom.
//   const app = new PanOsApp({ dev });  parent.append(app.el);
import { h } from '../dom.js';

const TABS = ['Dashboard', 'ACC', 'Monitor', 'Policies', 'Objects', 'Network', 'Device'];
const POLICY_TREE = ['Security', 'NAT', 'QoS', 'Policy Based Forwarding', 'Decryption', 'Tunnel Inspection', 'Application Override', 'Authentication', 'DoS Protection', 'SD-WAN'];
const OPTIMIZER = [['New App Viewer', '1+'], ['Rules Without App Controls', '1'], ['Unused Apps', '0'], ['Log Forwarding for Security Services', '']];

// Rules as found on Nov 14: two allow-everything rules plus the predefined intrazone / interzone defaults.
export const PAN_RULES_AS_FOUND = [
  { name: 'Permit Outbound', type: 'interzone', srcZone: 'any', dstZone: 'any', app: 'any', service: 'any', action: 'allow' },
  { name: 'Permit Inbound', type: 'interzone', srcZone: 'external', dstZone: 'any', app: 'any', service: 'application-default', action: 'allow' },
  { name: 'intrazone-default', type: 'intrazone', srcZone: 'any', dstZone: '(intrazone)', app: 'any', service: 'any', action: 'allow', predefined: true },
  { name: 'interzone-default', type: 'interzone', srcZone: 'any', dstZone: 'any', app: 'any', service: 'any', action: 'deny', predefined: true },
];

const link = (text) => h('span', { class: 'pan-link' }, text);
const zone = (z) => (z === 'external' || z === 'internal' ? h('span', { class: 'pan-link pan-zone' }, h('i', { class: 'pan-zone-ic', 'aria-hidden': 'true' }), z) : link(z));

export class PanOsApp {
  constructor(o = {}) {
    this.o = o;
    this.rules = (o.dev?.pan?.rules || PAN_RULES_AS_FOUND).map((r) => ({ ...r }));
    this.el = h('div', { class: 'pan' }, this.header(), h('div', { class: 'pan-subbar' }, h('span', { class: 'pan-sub-ic', title: 'Refresh' }, '⟳'), h('span', { class: 'pan-sub-ic', title: 'Help' }, '?')),
      h('div', { class: 'pan-main' }, this.nav(), this.table()));
  }

  header() {
    return h('header', { class: 'pan-top' },
      h('div', { class: 'pan-brand' }, h('i', { class: 'pan-brand-mark', 'aria-hidden': 'true' }), h('span', {}, this.o.dev?.panHost || 'PA-VM')),
      h('nav', { class: 'pan-tabs' }, TABS.map((t) => h('span', { class: `pan-tab${t === 'Policies' ? ' on' : ''}` }, t.toUpperCase()))),
      h('div', { class: 'pan-right' }, h('button', { type: 'button', class: 'pan-commit', title: 'Commit' }, '⛁ Commit ⌄'), h('span', { class: 'pan-hic' }, '▢'), h('span', { class: 'pan-hic' }, '▣⌄'), h('span', { class: 'pan-hic' }, '⌕')));
  }

  nav() {
    return h('aside', { class: 'pan-nav' },
      h('ul', { class: 'pan-tree' }, POLICY_TREE.map((n) => h('li', { class: n === 'Security' ? 'on' : '' }, h('i', { class: `pan-tree-ic pan-ti-${n.split(' ')[0].toLowerCase()}`, 'aria-hidden': 'true' }), n))),
      h('div', { class: 'pan-opt' }, h('div', { class: 'pan-opt-h' }, h('span', {}, 'Policy Optimizer'), h('span', {}, '—')),
        h('ul', {}, OPTIMIZER.map(([n, c]) => h('li', {}, h('i', { class: 'pan-tree-ic pan-ti-opt', 'aria-hidden': 'true' }), h('span', {}, n), h('b', {}, c))))));
  }

  table() {
    const cols = ['NAME', 'TAGS', 'TYPE', 'ZONE', 'ADDRESS', 'USER', 'DEVICE', 'ZONE', 'ADDRESS', 'DEVICE', 'APPLICATION', 'SERVICE', 'ACTION', 'PROFILE', 'OPTIONS'];
    return h('section', { class: 'pan-content' },
      h('div', { class: 'pan-filter' }, h('span', { class: 'pan-f-ic' }, '⌕'), h('div', { class: 'pan-f-box' }, h('span', {}, `${this.rules.length} items`)), h('span', { class: 'pan-f-ic' }, '→'), h('span', { class: 'pan-f-ic' }, '✕')),
      h('div', { class: 'pan-grid-wrap' }, h('table', { class: 'pan-grid' },
        h('thead', {},
          h('tr', { class: 'pan-grp' }, h('th', { rowspan: 2, class: 'pan-num' }, ''), h('th', { rowspan: 2 }, 'NAME'), h('th', { rowspan: 2 }, 'TAGS'), h('th', { rowspan: 2 }, 'TYPE'),
            h('th', { colspan: 4, class: 'pan-grp-h' }, 'Source'), h('th', { colspan: 3, class: 'pan-grp-h' }, 'Destination'),
            h('th', { rowspan: 2 }, 'APPLICATION'), h('th', { rowspan: 2 }, 'SERVICE'), h('th', { rowspan: 2 }, 'ACTION'), h('th', { rowspan: 2 }, 'PROFILE'), h('th', { rowspan: 2 }, 'OPTIONS')),
          h('tr', {}, cols.slice(3, 10).map((c) => h('th', {}, c)))),
        h('tbody', {}, this.rules.map((r, i) => h('tr', { class: `${r.predefined ? 'pan-pre' : ''}${i % 2 ? ' pan-alt' : ''}`, 'data-rule': r.name },
          h('td', { class: 'pan-num' }, String(i + 1)),
          h('td', {}, h('span', { class: 'pan-link' }, r.name), r.predefined ? h('i', { class: `pan-gear${r.action === 'deny' ? ' pan-gear-o' : ''}`, 'aria-hidden': 'true' }) : null),
          h('td', {}, link('none')), h('td', {}, r.type),
          h('td', {}, zone(r.srcZone)), h('td', {}, link('any')), h('td', {}, link('any')), h('td', {}, link('any')),
          h('td', {}, zone(r.dstZone)), h('td', {}, link('any')), h('td', {}, link('any')),
          h('td', {}, link(r.app)), h('td', {}, link(r.service)),
          h('td', {}, h('span', { class: `pan-act pan-act-${r.action}` }, h('i', { 'aria-hidden': 'true' }), r.action === 'allow' ? 'Allow' : 'Deny')),
          h('td', {}, link('none')), h('td', {}, h('i', { class: 'pan-opt-ic', 'aria-hidden': 'true' }))))))));
  }

  refresh() {}
  destroy() {}
}
