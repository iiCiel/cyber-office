import { h, clear } from '../dom.js';
import { adDate, uacText, whenCreated, UAC } from '../../game/directory.js';

// "Active Directory Users and Computers" (dsa.msc), read-only. The tree, the list, the Properties dialog with its
// real tabs (General, Account, Organization, Member Of, Attribute Editor...) and Find all follow the Windows tool.
// Like the real one, the Attribute Editor tab is hidden until View > Advanced Features is ticked.
// Everything comes from the day's directory model (src/game/directory.js).

const TYPE_LABEL = (o) => (o.type === 'user' ? 'User' : o.type === 'computer' ? 'Computer' : o.type === 'group' ? `${o.category} Group - ${o.scope}` : o.kind === 'ou' ? 'Organizational Unit' : 'Container');
const ICON = { user: '👤', group: '👥', computer: '🖥', ou: '🗂', container: '📁', domain: '🌐' };
const iconOf = (o) => ICON[o.type] || ICON[o.kind] || '📁';

export class AdApp {
  constructor({ state, day, changed }) {
    this.state = state;
    this.day = day;
    this.changed = changed;
    this.selected = null; // container dn
    this.advanced = false;
    this.open = new Set();
    this.sel = null; // selected object in the list
    this.dialog = null;
    this.el = h('div', { class: 'aduc' });
  }

  get dir() {
    return this.day().directory;
  }

  render() {
    const d = this.dir;
    if (!d) {
      clear(this.el).append(h('div', { class: 'quiet' }, 'Active Directory Users and Computers is not available on this machine.'));
      return;
    }
    if (!this.selected) {
      this.selected = d.dn;
      this.open = new Set([d.dn, d.ouByName.get('Users')?.parent]);
    }
    const menu = h('div', { class: 'aduc-menu' },
      h('span', {}, 'File'), h('span', {}, 'Action'),
      h('label', { class: 'view', title: 'View: Advanced Features' }, 'View ▾ ', h('input', { type: 'checkbox', 'data-action': 'advanced', checked: this.advanced, onchange: (e) => { this.advanced = e.target.checked; this.render(); } }), ' Advanced Features'),
      h('span', {}, 'Help'));
    const tool = h('div', { class: 'aduc-tool' },
      h('button', { type: 'button', title: 'Back', 'aria-label': 'Back', onclick: () => this.up() }, '◀'),
      h('button', { type: 'button', title: 'Forward', 'aria-label': 'Forward', disabled: true }, '▶'),
      h('button', { type: 'button', title: 'Up one level', 'aria-label': 'Up one level', onclick: () => this.up() }, '⬆'),
      h('span', { class: 'sep' }),
      h('button', { type: 'button', 'data-action': 'find', title: 'Find objects in Active Directory Domain Services', onclick: () => this.openFind() }, '🔍 Find…'),
      h('button', { type: 'button', title: 'Refresh', 'aria-label': 'Refresh', onclick: () => this.render() }, '⟳'));
    this.tree = h('div', { class: 'aduc-tree', role: 'tree' });
    this.list = h('div', { class: 'aduc-list', role: 'table' });
    this.status = h('div', { class: 'aduc-status' });
    this.dialogHost = h('div', { class: 'aduc-dlg-host' });
    clear(this.el).append(menu, tool, h('div', { class: 'aduc-body' }, this.tree, this.list), this.status, this.dialogHost);
    this.renderTree();
    this.renderList();
    if (this.dialog) this.renderDialog();
  }

  // ---------- tree ----------
  childrenOf(dn) {
    const d = this.dir;
    return d.ous.filter((o) => o.parent === dn).sort((a, b) => a.name.localeCompare(b.name));
  }

  renderTree() {
    const d = this.dir;
    const row = (label, icon, dn, depth, hasKids, obj) => {
      const select = () => { this.selected = dn; this.sel = null; this.renderTree(); this.renderList(); this.focusTree(dn); };
      return h('div', { class: `tn${this.selected === dn ? ' on' : ''}`, role: 'treeitem', tabindex: '0', 'aria-selected': this.selected === dn ? 'true' : 'false', 'aria-expanded': hasKids ? (this.open.has(dn) ? 'true' : 'false') : undefined, 'data-dn': dn, style: { paddingLeft: `${6 + depth * 14}px` }, onclick: select,
          onkeydown: (e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
            else if (e.key === 'ArrowRight' && hasKids && !this.open.has(dn)) { e.preventDefault(); this.open.add(dn); this.renderTree(); this.focusTree(dn); }
            else if (e.key === 'ArrowLeft' && hasKids && this.open.has(dn)) { e.preventDefault(); this.open.delete(dn); this.renderTree(); this.focusTree(dn); }
          } },
        h('span', { class: 'tw', 'aria-hidden': 'true', onclick: (e) => { if (!hasKids) return; e.stopPropagation(); this.open.has(dn) ? this.open.delete(dn) : this.open.add(dn); this.renderTree(); } }, hasKids ? (this.open.has(dn) ? '▾' : '▸') : ''),
        h('span', { class: 'ti' }, icon), label);
    };
    const out = [];
    out.push(row(`Active Directory Users and Computers [${d.dc}.${d.domain}]`, '🖥', '#root', 0, false));
    out.push(row('Saved Queries', '📁', '#queries', 1, false));
    const walk = (dn, depth, label, icon) => {
      const kids = this.childrenOf(dn);
      out.push(row(label, icon, dn, depth, kids.length > 0));
      if (this.open.has(dn)) for (const k of kids) walk(k.dn, depth + 1, k.name, iconOf(k));
    };
    walk(d.dn, 1, d.domain, ICON.domain);
    clear(this.tree).append(...out);
  }

  focusTree(dn) {
    const el = [...this.tree.children].find((n) => n.dataset.dn === dn);
    el?.focus();
  }

  // ---------- list ----------
  itemsIn(dn) {
    const d = this.dir;
    if (dn === d.dn) return d.ous.filter((o) => o.parent === dn).sort((a, b) => a.name.localeCompare(b.name));
    if (dn === '#root' || dn === '#queries') return [];
    const container = d.ous.find((o) => o.dn === dn);
    if (!container) return [];
    const kids = d.ous.filter((o) => o.parent === dn);
    const objs = d.all.filter((o) => o.dn.endsWith(`,${dn}`) && o.dn.split(',')[0].startsWith('CN=') && o.dn.slice(o.dn.indexOf(',') + 1) === dn);
    return [...kids, ...objs].sort((a, b) => a.name.localeCompare(b.name));
  }

  renderList() {
    const d = this.dir;
    const items = this.itemsIn(this.selected);
    const label = this.selected === d.dn ? d.domain : (d.ous.find((o) => o.dn === this.selected)?.name || '');
    clear(this.list).append(
      h('div', { class: 'lh' }, h('span', { class: 'c-name' }, 'Name'), h('span', { class: 'c-type' }, 'Type'), h('span', { class: 'c-desc' }, 'Description')),
      ...items.map((o) =>
        h('div', { class: `li${this.sel === o ? ' on' : ''}`, role: 'row', 'aria-selected': this.sel === o ? 'true' : 'false', 'data-name': o.sam || o.name, tabindex: '0',
          onclick: () => { this.sel = o; this.renderList(); },
          ondblclick: () => this.openObject(o),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openObject(o); } } },
          h('span', { class: 'c-name' }, h('span', { class: 'ti' }, iconOf(o)), o.name),
          h('span', { class: 'c-type' }, TYPE_LABEL(o)),
          h('span', { class: 'c-desc' }, o.desc || ''))),
      items.length ? null : h('div', { class: 'quiet' }, 'There are no items to show in this view.'),
    );
    this.status.textContent = `${items.length} object${items.length === 1 ? '' : 's'} · ${label}`;
  }

  up() {
    const d = this.dir;
    const c = d.ous.find((o) => o.dn === this.selected);
    this.selected = c ? c.parent : d.dn;
    this.sel = null;
    this.renderTree();
    this.renderList();
  }

  // ---------- dialogs ----------
  openObject(o) {
    if (o.kind) {
      // containers: double-click opens them
      this.selected = o.dn;
      this.open.add(o.parent);
      this.sel = null;
      this.renderTree();
      this.renderList();
      return;
    }
    this.dialog = { kind: 'props', obj: o, tab: 'General' };
    this.state.log('ad-open', { sam: o.sam, type: o.type });
    this.renderDialog();
    this.changed?.();
  }

  openFind() {
    this.dialog = { kind: 'find', name: '', desc: '', results: null, scope: 'Users, Contacts, and Groups' };
    this.renderDialog();
  }

  closeDialog() {
    this.dialog = null;
    clear(this.dialogHost);
  }

  /** Esc closes the open dialog first. Returns true if it handled the key. */
  back() {
    if (this.dialog) {
      this.closeDialog();
      return true;
    }
    return false;
  }

  renderDialog() {
    const dlg = this.dialog;
    if (!dlg) return;
    const body = dlg.kind === 'find' ? this.findBody(dlg) : this.propsBody(dlg);
    const title = dlg.kind === 'find' ? 'Find Users, Contacts, and Groups' : `${dlg.obj.name} Properties`;
    clear(this.dialogHost).append(
      h('div', { class: 'aduc-dlg', role: 'dialog', 'aria-label': title },
        h('div', { class: 'dlg-title' }, h('span', {}, title), h('button', { type: 'button', 'aria-label': 'Close', 'data-action': 'close-dialog', onclick: () => this.closeDialog() }, '✕')),
        body,
        h('div', { class: 'dlg-btns' }, h('button', { type: 'button', onclick: () => this.closeDialog() }, 'OK'), h('button', { type: 'button', onclick: () => this.closeDialog() }, 'Cancel'), h('button', { type: 'button', disabled: true }, 'Apply'), h('button', { type: 'button', disabled: true }, 'Help'))),
    );
  }

  tabsFor(o) {
    if (o.type === 'user') return ['General', 'Address', 'Account', 'Profile', 'Telephones', 'Organization', 'Member Of', 'Dial-in', 'Environment', 'Sessions', 'Remote control', ...(this.advanced ? ['Attribute Editor'] : [])];
    if (o.type === 'group') return ['General', 'Members', 'Member Of', ...(this.advanced ? ['Attribute Editor'] : [])];
    return ['General', 'Operating System', 'Member Of', ...(this.advanced ? ['Attribute Editor'] : [])];
  }

  field(label, value, { wide = false } = {}) {
    return h('div', { class: `fld${wide ? ' wide' : ''}` }, h('label', {}, label), h('input', { type: 'text', readonly: true, value: value ?? '', 'aria-label': label }));
  }

  propsBody(dlg) {
    const o = dlg.obj;
    const d = this.dir;
    const tabs = this.tabsFor(o);
    if (!tabs.includes(dlg.tab)) dlg.tab = 'General';
    const bar = h('div', { class: 'dlg-tabs', role: 'tablist' }, tabs.map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': dlg.tab === t ? 'true' : 'false', class: dlg.tab === t ? 'on' : '', 'data-ptab': t, onclick: () => { dlg.tab = t; this.renderDialog(); } }, t)));
    let page;
    const folder = (x) => `${d.domain}/${x.dn.split(',').slice(1).filter((p) => /^(OU|CN)=/.test(p)).map((p) => p.slice(3)).reverse().join('/')}`;
    const memberTable = (names, label) => h('table', { class: 'dlg-table' }, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Active Directory Domain Services Folder')),
      names.map((n) => { const g = d.lookup(n); return h('tr', {}, h('td', {}, h('span', { class: 'ti' }, g ? iconOf(g) : '👥'), n), h('td', {}, g ? folder(g) : '')); }));
    if (dlg.tab === 'General' && o.type === 'user') {
      page = h('div', { class: 'dlg-page' },
        h('div', { class: 'who' }, h('span', { class: 'big' }, '👤'), h('b', {}, o.display)),
        this.field('First name:', o.first), this.field('Last name:', o.last), this.field('Display name:', o.display), this.field('Description:', o.desc), this.field('Office:', o.office), this.field('Telephone number:', o.phone), this.field('E-mail:', o.mail), this.field('Web page:', ''));
    } else if (dlg.tab === 'Account' && o.type === 'user') {
      const opt = (label, on) => h('label', { class: 'opt' }, h('input', { type: 'checkbox', disabled: true, checked: on }), ` ${label}`);
      page = h('div', { class: 'dlg-page' },
        h('div', { class: 'fld wide' }, h('label', {}, 'User logon name:'), h('input', { type: 'text', readonly: true, value: o.sam }), h('span', {}, `@${d.domain}`)),
        this.field('User logon name (pre-Windows 2000):', `${d.netbios}\\${o.sam}`, { wide: true }),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', disabled: true }, 'Logon Hours...'), h('button', { type: 'button', disabled: true }, 'Log On To...')),
        opt('Unlock account. This account is currently unlocked.', false),
        h('div', { class: 'optlist' },
          opt('User must change password at next logon', false), opt('User cannot change password', false),
          opt('Password never expires', !!(o.uac & UAC.DONT_EXPIRE_PASSWORD)), opt('Store password using reversible encryption', false),
          opt('Account is disabled', !(o.enabled)), opt('Smart card is required for interactive logon', !!(o.uac & UAC.SMARTCARD_REQUIRED)),
          opt('Account is sensitive and cannot be delegated', !!(o.uac & UAC.NOT_DELEGATED)), opt('This account supports Kerberos AES 256 bit encryption', false),
          opt('Do not require Kerberos preauthentication', !!(o.uac & UAC.DONT_REQ_PREAUTH))),
        h('div', { class: 'fld wide' }, h('label', {}, 'Account expires'), h('span', {}, '⦿ Never   ○ End of:')));
    } else if (dlg.tab === 'Organization' && o.type === 'user') {
      page = h('div', { class: 'dlg-page' }, this.field('Job Title:', o.title), this.field('Department:', o.dept), this.field('Company:', 'Halcyon Mutual Insurance'), h('div', { class: 'sub' }, 'Manager'), this.field('Name:', ''), h('div', { class: 'sub' }, 'Direct reports:'));
    } else if (dlg.tab === 'Member Of') {
      const names = o.memberOf;
      page = h('div', { class: 'dlg-page' }, h('div', { class: 'sub' }, 'Member of:'), memberTable(names),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', disabled: true }, 'Add...'), h('button', { type: 'button', disabled: true }, 'Remove')),
        o.type === 'user' || o.type === 'computer' ? this.field('Primary group:', o.type === 'computer' ? (o.role === 'Domain Controller' ? 'Domain Controllers' : 'Domain Computers') : 'Domain Users') : null);
    } else if (dlg.tab === 'General' && o.type === 'group') {
      page = h('div', { class: 'dlg-page' }, h('div', { class: 'who' }, h('span', { class: 'big' }, '👥'), h('b', {}, o.name)),
        this.field('Group name (pre-Windows 2000):', `${d.netbios}\\${o.name}`, { wide: true }), this.field('Description:', o.desc, { wide: true }), this.field('E-mail:', ''),
        h('div', { class: 'radios' }, h('div', {}, h('b', {}, 'Group scope'), ...['Domain local', 'Global', 'Universal'].map((s) => h('label', { class: 'opt' }, h('input', { type: 'radio', disabled: true, checked: s.toLowerCase() === o.scope.toLowerCase() }), ` ${s}`))),
          h('div', {}, h('b', {}, 'Group type'), ...['Security', 'Distribution'].map((s) => h('label', { class: 'opt' }, h('input', { type: 'radio', disabled: true, checked: s === o.category }), ` ${s}`)))));
    } else if (dlg.tab === 'Members') {
      page = h('div', { class: 'dlg-page' }, h('div', { class: 'sub' }, 'Members:'), memberTable(d.groupMembers(o.name)?.map((m) => m.display || m.name) ?? []));
    } else if (dlg.tab === 'General' && o.type === 'computer') {
      page = h('div', { class: 'dlg-page' }, h('div', { class: 'who' }, h('span', { class: 'big' }, '🖥'), h('b', {}, o.name)),
        this.field('Computer name (pre-Windows 2000):', o.name.toUpperCase(), { wide: true }), this.field('DNS name:', o.dns, { wide: true }), this.field('DC Type:', o.role === 'Domain Controller' ? 'Global Catalog' : ''), this.field('Site:', o.role === 'Domain Controller' ? 'Default-First-Site-Name' : ''), this.field('Description:', o.desc, { wide: true }), this.field('Role:', o.role));
    } else if (dlg.tab === 'Operating System') {
      page = h('div', { class: 'dlg-page' }, this.field('Name:', o.os, { wide: true }), this.field('Version:', o.osVersion, { wide: true }), this.field('Service pack:', ''));
    } else if (dlg.tab === 'Attribute Editor') {
      page = h('div', { class: 'dlg-page attr' }, h('div', { class: 'sub' }, 'Attributes:'),
        h('div', { class: 'attr-scroll' }, h('table', { class: 'dlg-table' }, h('tr', {}, h('th', {}, 'Attribute'), h('th', {}, 'Value')),
          this.attributes(o).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'mono' }, v))))));
    } else page = h('div', { class: 'dlg-page' }, h('div', { class: 'quiet' }, 'Nothing to show on this tab.'));
    return h('div', { class: 'dlg-body' }, bar, page);
  }

  // The Attribute Editor rows, alphabetical, with values formatted the way ADUC prints them.
  attributes(o) {
    const d = this.dir;
    const dn = (n) => d.lookup(n)?.dn || n;
    const rows = [];
    const set = (k, v) => rows.push([k, v === undefined || v === null || v === '' ? '<not set>' : Array.isArray(v) ? (v.length ? v.join('; ') : '<not set>') : String(v)]);
    set('accountExpires', '9223372036854775807 (never)');
    if (o.type === 'user') {
      set('adminCount', o.adminCount || '<not set>');
      set('badPwdCount', o.badPwdCount);
      set('cn', o.name);
      set('countryCode', 0);
      set('description', o.desc);
      set('displayName', o.display);
      set('distinguishedName', o.dn);
      set('givenName', o.first);
      set('instanceType', '0x4 = ( WRITE )');
      set('lastLogon', adDate(o.lastLogon, { time: '8:47:11 AM' }));
      set('lastLogonTimestamp', adDate(o.lastLogon, { time: '8:47:11 AM' }));
      set('logonCount', o.logonCount);
      set('memberOf', o.memberOf.filter((g) => g !== 'Domain Users').map(dn));
      set('name', o.name);
      set('objectCategory', `CN=Person,CN=Schema,CN=Configuration,${d.dn}`);
      set('objectClass', 'top; person; organizationalPerson; user');
      set('objectGUID', o.guid);
      set('objectSid', o.sid);
      set('primaryGroupID', '513 = ( GROUP_RID_USERS )');
      set('pwdLastSet', adDate(o.pwdLastSet));
      set('sAMAccountName', o.sam);
      set('sAMAccountType', '805306368 = ( NORMAL_USER_ACCOUNT )');
      set('servicePrincipalName', o.spn);
      set('sn', o.last);
      set('title', o.title);
      set('userAccountControl', uacText(o.uac));
      set('userPrincipalName', o.upn);
      set('whenChanged', whenCreated(o.pwdLastSet));
      set('whenCreated', whenCreated(o.created));
      set('department', o.dept);
      set('mail', o.mail);
    } else if (o.type === 'group') {
      set('adminCount', o.sam === 'Domain Admins' || o.sam === 'Enterprise Admins' || o.sam === 'Administrators' ? 1 : '<not set>');
      set('cn', o.name);
      set('description', o.desc);
      set('distinguishedName', o.dn);
      set('groupType', o.scope === 'Global' ? '-2147483646 = ( GLOBAL_SCOPE | SECURITY_ENABLED )' : o.scope === 'Universal' ? '-2147483640 = ( UNIVERSAL_SCOPE | SECURITY_ENABLED )' : '-2147483644 = ( DOMAIN_LOCAL_SCOPE | SECURITY_ENABLED )');
      set('member', o.members.map(dn));
      set('memberOf', (o.memberOf || []).map(dn));
      set('name', o.name);
      set('objectClass', 'top; group');
      set('objectGUID', o.guid);
      set('objectSid', o.sid);
      set('sAMAccountName', o.sam);
      set('whenCreated', whenCreated(o.created));
    } else {
      set('cn', o.name);
      set('description', o.desc);
      set('distinguishedName', o.dn);
      set('dNSHostName', o.dns);
      set('lastLogonTimestamp', adDate(o.lastLogon));
      set('memberOf', o.memberOf.map(dn));
      set('name', o.name);
      set('objectClass', 'top; person; organizationalPerson; user; computer');
      set('objectGUID', o.guid);
      set('objectSid', o.sid);
      set('operatingSystem', o.os);
      set('operatingSystemVersion', o.osVersion);
      set('primaryGroupID', o.role === 'Domain Controller' ? '516 = ( GROUP_RID_CONTROLLERS )' : '515 = ( GROUP_RID_COMPUTERS )');
      set('sAMAccountName', o.sam);
      set('servicePrincipalName', o.spn);
      set('userAccountControl', uacText(o.uac));
      set('whenCreated', whenCreated(o.created));
    }
    return rows.sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
  }

  findBody(dlg) {
    const nameIn = h('input', { type: 'text', 'aria-label': 'Name', value: dlg.name, class: 'q', 'data-field': 'find-name' });
    const descIn = h('input', { type: 'text', 'aria-label': 'Description', value: dlg.desc, 'data-field': 'find-desc' });
    const go = () => {
      dlg.name = nameIn.value.trim().toLowerCase();
      dlg.desc = descIn.value.trim().toLowerCase();
      const d = this.dir;
      dlg.results = d.all.filter((o) => (!dlg.name || `${o.name} ${o.sam}`.toLowerCase().includes(dlg.name)) && (!dlg.desc || (o.desc || '').toLowerCase().includes(dlg.desc)));
      this.state.log('ad-find', { q: `${dlg.name}|${dlg.desc}`.slice(0, 60) });
      this.renderDialog();
      this.changed?.();
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    descIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => nameIn.focus(), 0);
    return h('div', { class: 'dlg-body' },
      h('div', { class: 'dlg-page' },
        h('div', { class: 'fld' }, h('label', {}, 'Find:'), h('span', {}, dlg.scope)),
        h('div', { class: 'fld' }, h('label', {}, 'In:'), h('span', {}, `${this.dir.domain}`)),
        h('div', { class: 'fld' }, h('label', {}, 'Name:'), nameIn),
        h('div', { class: 'fld' }, h('label', {}, 'Description:'), descIn),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', 'data-action': 'find-now', onclick: go }, 'Find Now'), h('button', { type: 'button', onclick: () => { dlg.results = null; dlg.name = ''; dlg.desc = ''; this.renderDialog(); } }, 'Clear All')),
        dlg.results
          ? h('div', { class: 'find-res' }, h('div', { class: 'sub' }, `${dlg.results.length} item(s) found`),
            h('table', { class: 'dlg-table' }, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Type'), h('th', {}, 'Description'), h('th', {}, 'In Folder')),
              dlg.results.slice(0, 80).map((o) => h('tr', { class: 'clk', 'data-name': o.sam, ondblclick: () => { this.closeDialog(); this.openObject(o); } },
                h('td', {}, h('span', { class: 'ti' }, iconOf(o)), o.name), h('td', {}, TYPE_LABEL(o)), h('td', {}, o.desc || ''), h('td', {}, o.dn.split(',').slice(1).filter((p) => /^(OU|CN)=/.test(p)).map((p) => p.slice(3)).reverse().join('/'))))))
          : null));
  }
}
