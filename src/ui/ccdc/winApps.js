import { h, clear, contextMenu, menuAt, dialog, msgBox, tabStrip, listView, menuBar, toolbar, field, check } from './winWidgets.js';
import { cmd, adRows, adTree, folderPath, typeLabel, serviceRows, taskRows, taskFolders, localUserRows, localAdminRows } from '../../game/winGuiMap.js';

// Windows administration consoles for the remote-desktop view. Each factory takes the desktop's ctx
//   { dev, model(), live(), act(line), events(log), openApp(id), closeWin(), isServer, host }
// and returns { el, refresh(force) }. Every admin action goes through ctx.act(<PowerShell line>), the same path as
// the typed terminal, so grading is identical; the apps never change state themselves.

const NOT_SUPPORTED = 'Not available in this lab';
const mmcMenus = (ctx, action) => [
  { label: 'File', items: () => [{ label: 'New', disabled: true }, { label: 'Open...', disabled: true, shortcut: 'Ctrl+O' }, { label: 'Save', disabled: true, shortcut: 'Ctrl+S' }, { sep: true }, { label: 'Options...', disabled: true }, { sep: true }, { label: 'Exit', onClick: () => ctx.closeWin() }] },
  { label: 'Action', items: action },
  { label: 'View', items: () => [{ label: 'Add/Remove Columns...', disabled: true }, { sep: true }, { label: 'Large Icons', disabled: true }, { label: 'Small Icons', disabled: true }, { label: 'List', disabled: true }, { label: 'Detail', disabled: true }, { sep: true }, { label: 'Customize...', disabled: true }] },
  { label: 'Help', items: () => [{ label: 'Help Topics', disabled: true }, { sep: true }, { label: 'About', disabled: true }] },
];
const dis = (label, extra = {}) => ({ label, disabled: true, ...extra });
const keepScroll = (node, fn) => { const t = node.scrollTop; fn(); node.scrollTop = t; };
const hasDialog = (el) => !!el.querySelector(':scope > .wd-dlgwrap');

// Action pane link list (right-hand "Actions" pane of an MMC console).
function actionsPane(sections) {
  const box = h('div', { class: 'wd-actions' }, h('div', { class: 'wd-actions-h' }, 'Actions'));
  for (const s of sections) {
    box.append(h('div', { class: 'wd-actions-sec' }, h('span', { class: 'wd-twisty open' }), s.title));
    for (const it of s.items) {
      if (it.sep) { box.append(h('div', { class: 'wd-actions-sep' })); continue; }
      box.append(h('div', { class: `wd-actions-it${it.disabled ? ' off' : ''}`, tabindex: it.disabled ? null : '0', onclick: () => { if (!it.disabled) it.onClick?.(); } }, h('span', {}, it.label), it.sub ? h('span', { class: 'wd-actions-more' }, '▸') : null));
    }
  }
  return box;
}

// ============================================================================================================
// Active Directory Users and Computers
// ============================================================================================================
export function createAduc(ctx) {
  const st = { cont: null, key: null, open: new Set(), sig: '' };
  const el = h('div', { class: 'wd-app wd-mmc' });
  const tree = h('div', { class: 'wd-tree', role: 'tree' });
  const pane = h('div', { class: 'wd-listpane' });
  const actions = h('div', { class: 'wd-actionspane' });
  const status = h('div', { class: 'wd-status' });
  let redrawProps = null;

  const info = (text) => msgBox(el, { title: 'Active Directory Domain Services', text, kind: 'info' });
  const m0 = () => ctx.model();

  function selectObjects(title, hint, onPick) {
    const ta = h('textarea', { class: 'wd-textarea', rows: '3', 'aria-label': 'Enter the object names to select' });
    const check_ = () => {
      const names = ta.value.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
      const found = [];
      for (const n of names) {
        const o = m0().find(n);
        if (!o) { msgBox(el, { title: 'Name Not Found', text: `An object named "${n}" cannot be found. Check the selected object types and location for accuracy and ensure that you typed the object name correctly, or remove this object from the selection.`, kind: 'warn' }); return null; }
        found.push(o);
      }
      return found;
    };
    dialog(el, {
      title, width: 420,
      body: h('div', { class: 'wd-select' },
        h('div', {}, 'Select this object type:'), h('div', { class: 'wd-input boxed' }, hint), h('div', {}, 'From this location:'), h('div', { class: 'wd-input boxed' }, m0().domain),
        h('div', {}, 'Enter the object names to select (examples):'), ta,
        h('div', { class: 'wd-select-row' }, h('button', { type: 'button', class: 'wd-btn', onclick: () => { const f = check_(); if (f) ta.value = f.map((o) => o.name).join('; '); } }, 'Check Names'))),
      buttons: [{ label: 'OK', primary: true, onClick: () => { const f = check_(); if (!f || !f.length) return false; onPick(f); } }, { label: 'Cancel' }],
    });
    setTimeout(() => ta.focus(), 0);
  }

  const addToGroup = (obj) => selectObjects('Select Groups', 'Groups', (groups) => {
    for (const g of groups) { if (g.type !== 'group') continue; ctx.act(cmd.addMember(g.name, obj.sam)); }
    info('The Add to Group operation was successfully completed.');
  });
  const toggleEnable = (obj) => {
    ctx.act(obj.enabled === false ? cmd.enableUser(obj.sam) : cmd.disableUser(obj.sam));
    info(`Object ${obj.name} has been ${obj.enabled === false ? 'enabled' : 'disabled'}.`);
  };
  const resetPw = (obj) => {
    const p1 = h('input', { type: 'password', class: 'wd-input', 'aria-label': 'New password', autocomplete: 'off' });
    const p2 = h('input', { type: 'password', class: 'wd-input', 'aria-label': 'Confirm password', autocomplete: 'off' });
    dialog(el, {
      title: 'Reset Password', width: 360,
      body: h('div', { class: 'wd-form' },
        h('label', { class: 'wd-field col' }, h('span', {}, 'New password:'), p1), h('label', { class: 'wd-field col' }, h('span', {}, 'Confirm password:'), p2),
        check('User must change password at next logon', true), check('Unlock the user\'s account', false)),
      buttons: [{
        label: 'OK', primary: true,
        onClick: () => {
          if (!p1.value) { msgBox(el, { title: 'Active Directory Domain Services', text: 'The password does not meet the password policy requirements. Check the minimum password length, password complexity and password history requirements.', kind: 'error' }); return false; }
          if (p1.value !== p2.value) { msgBox(el, { title: 'Active Directory Domain Services', text: 'The password and confirmation do not match. Please try again.', kind: 'error' }); return false; }
          ctx.act(cmd.resetPassword(obj.sam, p1.value));
          info(`The password for ${obj.name} has been changed.`);
        },
      }, { label: 'Cancel' }],
    });
    setTimeout(() => p1.focus(), 0);
  };
  const del = (obj) => msgBox(el, {
    title: 'Active Directory Domain Services', kind: 'question',
    text: `Are you sure you want to delete the ${obj.type === 'group' ? 'Group' : obj.type === 'computer' ? 'Computer' : 'User'} named '${obj.name}'?`,
    yes: () => { ctx.act(cmd.deleteUser(obj.sam)); }, no: () => {},
  });

  function itemsFor(row) {
    const o = row?.obj;
    if (!o) return [dis('Delegate Control...'), dis('Find...'), dis('New', { sub: true }), dis('All Tasks', { sub: true }), { sep: true }, dis('Properties'), { sep: true }, dis('Help')];
    if (o.type === 'user') {
      return [dis('Copy...'), { label: 'Add to a group...', onClick: () => addToGroup(o) }, dis('Name Mappings...'),
        { label: o.enabled === false ? 'Enable Account' : 'Disable Account', onClick: () => toggleEnable(o) },
        { label: 'Reset Password...', onClick: () => resetPw(o) }, dis('Move...'), dis('Open Home Page'), dis('Send Mail'), { sep: true },
        dis('All Tasks', { sub: true }), { sep: true }, dis('Cut'), { label: 'Delete', onClick: () => del(o) }, dis('Rename'), { sep: true },
        { label: 'Properties', bold: true, onClick: () => openProps(o) }, { sep: true }, dis('Help')];
    }
    if (o.type === 'group') {
      return [{ label: 'Add to a group...', onClick: () => addToGroup(o) }, dis('Name Mappings...'), dis('Move...'), dis('Send Mail'), { sep: true }, dis('All Tasks', { sub: true }), { sep: true },
        dis('Cut'), { label: 'Delete', onClick: () => del(o) }, dis('Rename'), { sep: true }, { label: 'Properties', bold: true, onClick: () => openProps(o) }, { sep: true }, dis('Help')];
    }
    return [dis('Add to a group...'), dis('Disable Account'), dis('Reset Account'), dis('Move...'), dis('Manage'), { sep: true }, dis('All Tasks', { sub: true }), { sep: true }, dis('Cut'), dis('Delete'), dis('Rename'), { sep: true }, { label: 'Properties', bold: true, onClick: () => openProps(o) }, { sep: true }, dis('Help')];
  }

  // ---- Properties ----------------------------------------------------------------------------------------
  function openProps(obj, startTab) {
    const isUser = obj.type === 'user'; const isGroup = obj.type === 'group';
    const tabs = isUser ? ['General', 'Address', 'Account', 'Profile', 'Telephones', 'Organization', 'Member Of', 'Dial-in', 'Environment', 'Sessions', 'Remote control']
      : isGroup ? ['General', 'Members', 'Member Of', 'Managed By'] : ['General', 'Operating System', 'Member Of', 'Location', 'Managed By'];
    const ps = { tab: startTab || 'General', sam: obj.sam, disabled: null, memSel: null };
    const content = h('div', { class: 'wd-ps' });
    const live = () => m0().find(ps.sam);
    const applyPending = () => {
      const o = live();
      if (o && isUser && ps.disabled !== null && ps.disabled !== (o.enabled === false)) ctx.act(ps.disabled ? cmd.disableUser(o.sam) : cmd.enableUser(o.sam));
      ps.disabled = null;
    };
    const memberRows = (o) => (isUser ? o.memberOf : (isGroup && ps.tab === 'Member Of' ? o.memberOf || [] : [])).map((g) => ({ key: g, name: g, folder: folderPath(m0(), m0().group(g) || { ou: 'Users' }) }));
    const redraw = () => {
      const o = live();
      if (!o) { holder.close(); return; }
      clear(content).append(tabStrip(tabs, ps.tab, (t) => { ps.tab = t; ps.memSel = null; redraw(); }), body(o));
    };
    const body = (o) => {
      const t = ps.tab;
      const head = h('div', { class: 'wd-ps-head' }, h('i', { class: `wd-ic-l ${o.type === 'user' ? (o.enabled === false ? 'i-userdis' : 'i-user') : o.type === 'group' ? 'i-group' : 'i-comp'}` }), h('span', { class: 'wd-input boxed grow' }, o.name));
      if (t === 'General' && isUser) return h('div', { class: 'wd-ps-body' }, head, field('First name:', o.first), field('Last name:', o.last), field('Display name:', o.display), field('Description:', o.desc), field('Office:', o.office), field('Telephone number:', o.phone), field('E-mail:', o.mail), field('Web page:', ''));
      if (t === 'General' && isGroup) return h('div', { class: 'wd-ps-body' }, head, field('Group name (pre-Windows 2000):', o.sam), field('Description:', o.desc), field('E-mail:', ''),
        h('div', { class: 'wd-grp' }, h('fieldset', {}, h('legend', {}, 'Group scope'), ...['Domain local', 'Global', 'Universal'].map((s) => h('label', { class: 'wd-radio' }, h('input', { type: 'radio', disabled: true, checked: lcEq(s, o.scope) }), s))), h('fieldset', {}, h('legend', {}, 'Group type'), ...['Security', 'Distribution'].map((s) => h('label', { class: 'wd-radio' }, h('input', { type: 'radio', disabled: true, checked: s === o.category }), s)))));
      if (t === 'General') return h('div', { class: 'wd-ps-body' }, head, field('Computer name (pre-Windows 2000):', o.name), field('DNS name:', o.dns), field('Role:', o.role), field('Description:', o.desc));
      if (t === 'Account') {
        const dsb = ps.disabled === null ? o.enabled === false : ps.disabled;
        return h('div', { class: 'wd-ps-body' },
          field('User logon name:', `${o.sam}@${m0().domain}`), field('User logon name (pre-Windows 2000):', `${m0().netbios}\\${o.sam}`),
          h('div', { class: 'wd-grp-row' }, h('button', { type: 'button', class: 'wd-btn', disabled: true }, 'Logon Hours...'), h('button', { type: 'button', class: 'wd-btn', disabled: true }, 'Log On To...')),
          check('Unlock account. This account is currently unlocked.', false, null, true),
          h('div', { class: 'wd-optlabel' }, 'Account options:'),
          h('div', { class: 'wd-optbox' },
            check('User must change password at next logon', false, null, true), check('User cannot change password', false, null, true),
            check('Password never expires', (o.uac & 0x10000) !== 0, null, true), check('Store password using reversible encryption', false, null, true),
            check('Account is disabled', dsb, (v) => { ps.disabled = v; }), check('Smart card is required for interactive logon', false, null, true),
            check('Account is sensitive and cannot be delegated', false, null, true)),
          h('div', { class: 'wd-optlabel' }, 'Account expires'), h('div', { class: 'wd-radio-col' }, h('label', { class: 'wd-radio' }, h('input', { type: 'radio', checked: true, disabled: true }), 'Never'), h('label', { class: 'wd-radio' }, h('input', { type: 'radio', disabled: true }), 'End of:')));
      }
      if (t === 'Organization') return h('div', { class: 'wd-ps-body' }, field('Job Title:', o.title), field('Department:', o.dept), field('Company:', ''), h('div', { class: 'wd-optlabel' }, 'Manager:'), field('Name:', ''));
      if (t === 'Member Of' || t === 'Members') {
        const isMembers = t === 'Members';
        const rows = isMembers
          ? m0().membersOf(o.name).map((x) => ({ key: x.sam, name: x.name, folder: folderPath(m0(), x), obj: x }))
          : (o.memberOf || []).map((g) => ({ key: g, name: g, folder: folderPath(m0(), m0().group(g) || { ou: 'Users' }) }));
        const lv = listView([{ k: 'name', label: 'Name', w: 150 }, { k: 'folder', label: 'Active Directory Domain Services Folder' }], rows, {
          sel: ps.memSel, onSel: (k) => { ps.memSel = k; }, icon: (r) => (isMembers ? (r.obj.type === 'user' ? (r.obj.enabled === false ? 'i-userdis' : 'i-user') : r.obj.type === 'group' ? 'i-group' : 'i-comp') : 'i-group'),
        });
        const remove = () => {
          if (!ps.memSel) return;
          const row = rows.find((r) => r.key === ps.memSel);
          if (!row) return;
          if (!isMembers && lcEq(row.name, 'Domain Users')) { msgBox(el, { title: 'Active Directory Domain Services', text: 'The operation failed because the group is the primary group of the user and cannot be removed.', kind: 'error' }); return; }
          msgBox(el, {
            title: 'Active Directory Domain Services', kind: 'question',
            text: isMembers ? `Do you want to remove ${row.name} from the group ${o.name}?` : `Do you want to remove ${isGroup ? 'group' : 'user'} ${o.name} from the selected group(s)?`,
            yes: () => { ctx.act(isMembers ? cmd.removeMember(o.name, row.obj.sam) : cmd.removeMember(row.name, o.sam)); ps.memSel = null; }, no: () => {},
          });
        };
        const add = () => (isMembers
          ? selectObjects('Select Users, Contacts, Computers, Service Accounts, or Groups', 'Users, Service Accounts, Groups, or Other objects', (objs) => { for (const x of objs) ctx.act(cmd.addMember(o.name, x.sam)); })
          : selectObjects('Select Groups', 'Groups', (gs) => { for (const g of gs) if (g.type === 'group') ctx.act(cmd.addMember(g.name, o.sam)); }));
        return h('div', { class: 'wd-ps-body' }, h('div', { class: 'wd-optlabel' }, isMembers ? 'Members:' : 'Member of:'), h('div', { class: 'wd-lvbox' }, lv),
          h('div', { class: 'wd-grp-row' }, h('button', { type: 'button', class: 'wd-btn', onclick: add }, 'Add...'), h('button', { type: 'button', class: 'wd-btn', onclick: remove }, 'Remove')),
          isMembers ? null : h('div', { class: 'wd-primary' }, h('div', {}, h('b', {}, 'Primary group:'), '  Domain Users'), h('div', { class: 'wd-hint' }, 'There is no need to change Primary group unless you have Macintosh clients or POSIX-compliant applications.'), h('button', { type: 'button', class: 'wd-btn', disabled: true }, 'Set Primary Group')));
      }
      return h('div', { class: 'wd-ps-body wd-empty' }, '');
    };
    const holder = dialog(el, {
      title: `${obj.name} Properties`, width: isUser ? 410 : 400, body: content, onClose: () => { redrawProps = null; },
      buttons: [{ label: 'OK', primary: true, onClick: () => { applyPending(); } }, { label: 'Cancel' }, { label: 'Apply', onClick: () => { applyPending(); redraw(); return false; } }, { label: 'Help', onClick: () => false }],
    });
    redrawProps = redraw;
    redraw();
  }

  // ---- main view ------------------------------------------------------------------------------------------
  function renderTree() {
    const m = m0();
    clear(tree);
    const node = (label, depth, o) => {
      const row = h('div', {
        class: `wd-tn${o.on ? ' on' : ''}`, style: { paddingLeft: `${4 + depth * 16}px` }, role: 'treeitem', tabindex: '0',
        onclick: () => { if (o.dn) { st.cont = o.dn; st.key = null; render(); } },
        onkeydown: (e) => { if (e.key === 'Enter' && o.dn) { st.cont = o.dn; st.key = null; render(); } },
      },
      h('span', { class: `wd-twisty${o.kids ? (o.expanded ? ' open' : '') : ' none'}`, onclick: (e) => { e.stopPropagation(); if (o.dn) { st.open.has(o.dn) ? st.open.delete(o.dn) : st.open.add(o.dn); render(); } } }),
      h('i', { class: `wd-ic ${o.icon}` }), h('span', {}, label));
      tree.append(row);
    };
    node(`Active Directory Users and Computers [${m.dc}.${m.domain}]`, 0, { icon: 'i-aduc', kids: true, expanded: true });
    node('Saved Queries', 1, { icon: 'i-folder', kids: true });
    const walk = (dn, name, depth) => {
      const kids = adTree(m, dn);
      const expanded = st.open.has(dn) || dn === m.dn;
      node(name, depth, { dn, icon: dn === m.dn ? 'i-domain' : 'i-folder', kids: kids.length > 0, expanded, on: st.cont === dn });
      if (expanded) for (const k of kids) walk(k.dn, k.name, depth + 1);
    };
    walk(m.dn, m.domain, 1);
  }
  function renderList() {
    const m = m0();
    const rows = adRows(m, st.cont);
    const rowIcon = (r) => (r.kind === 'user' ? (r.disabled ? 'i-userdis' : (r.obj?.sam && /^svc|\$$/.test(r.obj.sam) ? 'i-user' : 'i-user')) : r.kind === 'group' ? 'i-group' : r.kind === 'computer' ? 'i-comp' : r.kind === 'ou' ? 'i-ou' : 'i-folder');
    const crumb = st.cont === m.dn ? m.domain : (m.ous.find((o) => o.dn === st.cont)?.name || '');
    clear(pane).append(h('div', { class: 'wd-pane-h' }, `${crumb}   ${rows.length} objects`), listView([{ k: 'name', label: 'Name', w: 190 }, { k: 'type', label: 'Type', w: 170 }, { k: 'desc', label: 'Description' }], rows, {
      sel: st.key, icon: rowIcon, cls: (r) => (r.disabled ? 'dim' : ''),
      onSel: (k) => { st.key = k; renderActions(rows); },
      onOpen: (r) => { if (r.obj) openProps(r.obj); else { st.cont = r.key; st.key = null; st.open.add(r.key); render(); } },
      onCtx: (e, r) => menuAt(e, itemsFor(r)),
    }));
    status.textContent = '';
    renderActions(rows);
  }
  function renderActions(rows) {
    const sel = rows.find((r) => r.key === st.key);
    const m = m0();
    const crumb = st.cont === m.dn ? m.domain : (m.ous.find((o) => o.dn === st.cont)?.name || '');
    const sections = [{ title: crumb, items: [{ label: 'More Actions', sub: true, disabled: true }] }];
    if (sel) sections.push({ title: sel.name, items: itemsFor(sel).filter((i) => i.sep || !/^(Help|Cut|Rename)$/.test(i.label)).map((i) => ({ ...i, sub: i.sub || false })) });
    clear(actions).append(actionsPane(sections));
  }
  function render() {
    const m = m0();
    if (!st.cont) { st.cont = m.ouByName.get('Users')?.dn || m.dn; st.open = new Set([m.dn]); }
    const t = pane.scrollTop; const tt = tree.scrollTop;
    renderTree(); renderList();
    pane.scrollTop = t; tree.scrollTop = tt;
  }

  el.append(
    menuBar(mmcMenus(ctx, () => itemsFor(m0() && st.key ? adRows(m0(), st.cont).find((r) => r.key === st.key) : null))),
    toolbar([{ title: 'Back', icon: 'i-back', disabled: true }, { title: 'Forward', icon: 'i-fwd', disabled: true }, { title: 'Up one level', icon: 'i-up', onClick: () => { const o = m0().ous.find((x) => x.dn === st.cont); if (o) { st.cont = o.parent; render(); } } }, null, { title: 'Show/Hide Console Tree', icon: 'i-tree' }, null, { title: 'Refresh', icon: 'i-refresh', onClick: () => render() }, { title: 'Properties', icon: 'i-props', disabled: true }, { title: 'Help', icon: 'i-help', disabled: true }]),
    h('div', { class: 'wd-mmc-body' }, tree, pane, actions), status);
  render();

  return {
    el,
    refresh(force) {
      if (!force && (hasDialog(el))) return;
      if (force) { keepScroll(pane, render); redrawProps?.(); return; }
    },
  };
}
const lcEq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// ============================================================================================================
// Services (services.msc)
// ============================================================================================================
export function createServices(ctx) {
  const st = { key: null, tab: 'Extended', sig: '' };
  const el = h('div', { class: 'wd-app wd-mmc' });
  const tree = h('div', { class: 'wd-tree narrow' });
  const side = h('div', { class: 'wd-svc-side' });
  const pane = h('div', { class: 'wd-listpane' });
  const actions = h('div', { class: 'wd-actionspane' });
  let redrawProps = null;
  const rows = () => serviceRows(ctx.live());
  const find = (id) => rows().find((r) => r.id === id);
  const denied = (r, verb) => msgBox(el, { title: 'Services', kind: 'error', text: `Windows could not ${verb} the ${r.name} service on Local Computer.\n\nError 5: Access is denied.` });

  const doStop = (r) => { if (!r.live) return denied(r, 'stop'); ctx.act(cmd.stopService(r.id)); };
  const doStart = (r) => {
    if (!r.live) return denied(r, 'start');
    if (r.startup === 'Disabled') return msgBox(el, { title: 'Services', kind: 'error', text: `Windows could not start the ${r.name} service on Local Computer.\n\nError 1058: The service cannot be started, either because it is disabled or because it has no enabled devices associated with it.` });
    ctx.act(cmd.startService(r.id));
  };
  const doRestart = (r) => { if (!r.live) return denied(r, 'stop'); ctx.act(cmd.stopService(r.id)); if (r.startup !== 'Disabled') ctx.act(cmd.startService(r.id)); };
  const itemsFor = (r) => (r ? [
    { label: 'Start', disabled: r.running, onClick: () => doStart(r) }, { label: 'Stop', disabled: !r.running, onClick: () => doStop(r) }, dis('Pause'), dis('Resume'),
    { label: 'Restart', disabled: !r.running, onClick: () => doRestart(r) }, { sep: true }, dis('All Tasks', { sub: true }), { sep: true }, { label: 'Refresh', onClick: () => draw() }, { sep: true },
    { label: 'Properties', bold: true, onClick: () => openProps(r) }, { sep: true }, dis('Help')] : [{ label: 'Refresh', onClick: () => draw() }, dis('Help')]);

  function openProps(r0) {
    const ps = { tab: 'General', startup: null };
    const content = h('div', { class: 'wd-ps' });
    const redraw = () => {
      const r = find(r0.id);
      if (!r) { holder.close(); return; }
      const startup = ps.startup || r.startup;
      const sel = h('select', { class: 'wd-select-el', 'aria-label': 'Startup type', onchange: (e) => { ps.startup = e.target.value; } },
        ['Automatic', 'Manual', 'Disabled'].map((o) => h('option', { value: o, selected: o === startup }, o === 'Automatic' ? 'Automatic' : o)));
      clear(content).append(tabStrip(['General', 'Log On', 'Recovery', 'Dependencies'], ps.tab, (t) => { ps.tab = t; redraw(); }),
        ps.tab !== 'General' ? h('div', { class: 'wd-ps-body wd-empty' }) : h('div', { class: 'wd-ps-body' },
          field('Service name:', r.id), field('Display name:', r.name), h('label', { class: 'wd-field col' }, h('span', {}, 'Description:'), h('textarea', { class: 'wd-textarea', rows: '3', readonly: true }, r.desc)),
          field('Path to executable:', `C:\\Windows\\System32\\svchost.exe -k ${r.id}`),
          h('label', { class: 'wd-field' }, h('span', {}, 'Startup type:'), sel),
          h('div', { class: 'wd-optlabel' }, 'Service status:  ', h('b', {}, r.running ? 'Running' : 'Stopped')),
          h('div', { class: 'wd-grp-row' },
            h('button', { type: 'button', class: 'wd-btn', disabled: r.running, onclick: () => { doStart(r); } }, 'Start'),
            h('button', { type: 'button', class: 'wd-btn', disabled: !r.running, onclick: () => { doStop(r); } }, 'Stop'),
            h('button', { type: 'button', class: 'wd-btn', disabled: true }, 'Pause'), h('button', { type: 'button', class: 'wd-btn', disabled: true }, 'Resume')),
          h('div', { class: 'wd-hint' }, 'You can specify the start parameters that apply when you start the service from here.'), field('Start parameters:', '', { readonly: false })));
    };
    const apply = () => {
      const r = find(r0.id);
      if (r && ps.startup && ps.startup !== r.startup) { if (!r.live) denied(r, 'configure'); else ctx.act(cmd.setStartup(r.id, ps.startup)); }
      ps.startup = null;
    };
    const holder = dialog(el, {
      title: `${r0.name} Properties (Local Computer)`, width: 400, body: content, onClose: () => { redrawProps = null; },
      buttons: [{ label: 'OK', primary: true, onClick: apply }, { label: 'Cancel' }, { label: 'Apply', onClick: () => { apply(); redraw(); return false; } }],
    });
    redrawProps = redraw;
    redraw();
  }

  // listView keys rows by `.key`, so give services a key alias.
  const keyed = () => rows().map((r) => ({ ...r, key: r.id }));
  function renderSide(sel) {
    clear(side).append(sel ? h('div', {},
      h('div', { class: 'wd-svc-name' }, sel.name),
      sel.running ? h('a', { class: 'wd-link', tabindex: '0', onclick: () => doStop(sel) }, 'Stop') : h('a', { class: 'wd-link', tabindex: '0', onclick: () => doStart(sel) }, 'Start'), ' the service', h('br'),
      sel.running ? [h('a', { class: 'wd-link', tabindex: '0', onclick: () => doRestart(sel) }, 'Restart'), ' the service'] : null,
      h('div', { class: 'wd-svc-desc' }, h('b', {}, 'Description:'), h('br'), sel.desc)) : h('div', { class: 'wd-hint' }, 'Select an item to view its description.'));
  }
  function draw() {
    const rs = keyed();
    const t = pane.scrollTop;
    const list = h('div', { class: 'wd-svc-list' }, listView(
      [{ k: 'name', label: 'Name', w: 160 }, { k: 'desc', label: 'Description', w: 170 }, { k: 'status', label: 'Status', w: 56 }, { k: 'startup', label: 'Startup Type', w: 84 }, { k: 'logon', label: 'Log On As', w: 140 }], rs, {
        sel: st.key, icon: () => 'i-gear',
        onSel: (k) => { st.key = k; renderSide(rows().find((r) => r.id === k)); },
        onOpen: (r) => openProps(r), onCtx: (e, r) => menuAt(e, itemsFor(r)),
      }));
    renderSide(rows().find((r) => r.id === st.key));
    clear(pane).append(h('div', { class: 'wd-pane-h' }, 'Services (Local)'), h('div', { class: 'wd-svc-wrap' }, side, list), h('div', { class: 'wd-svc-tabs' }, h('span', { class: 'on' }, 'Extended'), h('span', {}, 'Standard')));
    pane.scrollTop = t;
    const lst = pane.querySelector('.wd-svc-list'); if (lst && st.scroll) lst.scrollTop = st.scroll;
    st.sig = JSON.stringify(rs.map((r) => [r.id, r.status, r.startup]));
  }
  tree.append(h('div', { class: 'wd-tn on' }, h('i', { class: 'wd-ic i-gear' }), h('span', {}, 'Services (Local)')));
  el.append(menuBar(mmcMenus(ctx, () => itemsFor(rows().find((r) => r.id === st.key)))), toolbar([{ title: 'Back', icon: 'i-back', disabled: true }, { title: 'Forward', icon: 'i-fwd', disabled: true }, null, { title: 'Refresh', icon: 'i-refresh', onClick: () => draw() }, { title: 'Properties', icon: 'i-props', onClick: () => { const r = find(st.key); if (r) openProps(r); } }, { title: 'Stop service', icon: 'i-stop', onClick: () => { const r = find(st.key); if (r && r.running) doStop(r); } }, { title: 'Start service', icon: 'i-play', onClick: () => { const r = find(st.key); if (r && !r.running) doStart(r); } }]),
    h('div', { class: 'wd-mmc-body' }, tree, pane, actions));
  clear(actions).append(actionsPane([{ title: 'Services', items: [{ label: 'More Actions', sub: true, disabled: true }] }]));
  draw();
  return {
    el,
    refresh(force) {
      const sig = JSON.stringify(rows().map((r) => [r.id, r.status, r.startup]));
      if (!force && (sig === st.sig || hasDialog(el))) return;
      const lst = pane.querySelector('.wd-svc-list'); st.scroll = lst ? lst.scrollTop : 0;
      draw(); redrawProps?.();
    },
  };
}

// ============================================================================================================
// Task Scheduler
// ============================================================================================================
export function createTasks(ctx) {
  const st = { folder: '\\', key: null, sig: '', tab: 'General' };
  const el = h('div', { class: 'wd-app wd-mmc' });
  const tree = h('div', { class: 'wd-tree' });
  const center = h('div', { class: 'wd-tasks-center' });
  const actions = h('div', { class: 'wd-actionspane' });
  const all = () => taskRows(ctx.live()).map((r) => ({ ...r, key: `${r.path}${r.name}` }));
  const folderTree = () => {
    const set = new Set(['\\Microsoft\\', '\\Microsoft\\Windows\\', ...taskFolders(all())]);
    for (const f of [...set]) { const parts = f.split('\\').filter(Boolean); for (let i = 1; i <= parts.length; i++) set.add(`\\${parts.slice(0, i).join('\\')}\\`); }
    return [...set].filter((f) => f !== '\\').sort();
  };
  const del = (r) => msgBox(el, {
    title: 'Task Scheduler', kind: 'question', text: `Are you sure you want to delete the task '${r.name}'?`,
    yes: () => { ctx.act(cmd.deleteTask(r.name)); st.key = null; }, no: () => {},
  });
  const itemsFor = (r) => (r ? [
    dis('Run'), dis('End'), { label: 'Disable', disabled: r.status === 'Disabled', onClick: () => ctx.act(cmd.disableTask(r.name)) }, dis('Export...'), { sep: true },
    { label: 'Properties', bold: true, onClick: () => openProps(r) }, { label: 'Delete', onClick: () => del(r) }] : [dis('Create Basic Task...'), dis('Create Task...'), dis('Import Task...')]);
  function openProps(r) {
    const ps = { tab: 'General' };
    const content = h('div', { class: 'wd-ps' });
    const redraw = () => clear(content).append(tabStrip(['General', 'Triggers', 'Actions', 'Conditions', 'Settings', 'History (disabled)'], ps.tab, (t) => { ps.tab = t; redraw(); }),
      h('div', { class: 'wd-ps-body' }, ps.tab === 'General' ? [field('Name:', r.name), field('Location:', r.path), field('Author:', r.author), field('Description:', r.desc)]
        : ps.tab === 'Triggers' ? h('div', { class: 'wd-lvbox' }, listView([{ k: 'a', label: 'Trigger' }, { k: 'b', label: 'Details' }, { k: 'c', label: 'Status' }], [{ key: 'x', a: r.trigger, b: '', c: 'Enabled' }]))
          : ps.tab === 'Actions' ? h('div', { class: 'wd-lvbox' }, listView([{ k: 'a', label: 'Action' }, { k: 'b', label: 'Details' }], [{ key: 'x', a: r.action.split(': ')[0], b: r.action.split(': ').slice(1).join(': ') }])) : ''));
    dialog(el, { title: `${r.name} Properties (Local Computer)`, width: 420, body: content, buttons: [{ label: 'OK', primary: true }, { label: 'Cancel' }] });
    redraw();
  }
  function render() {
    const rs = all().filter((r) => r.path === st.folder);
    const sel = all().find((r) => r.key === st.key) || null;
    const ft = folderTree();
    clear(tree);
    const node = (label, depth, on, icon, onclick) => tree.append(h('div', { class: `wd-tn${on ? ' on' : ''}`, style: { paddingLeft: `${4 + depth * 16}px` }, tabindex: '0', onclick }, h('span', { class: 'wd-twisty open' }), h('i', { class: `wd-ic ${icon}` }), h('span', {}, label)));
    node('Task Scheduler (Local)', 0, false, 'i-task');
    node('Task Scheduler Library', 1, st.folder === '\\', 'i-folder', () => { st.folder = '\\'; st.key = null; render(); });
    for (const f of ft) { const parts = f.split('\\').filter(Boolean); node(parts[parts.length - 1], 1 + parts.length, st.folder === f, 'i-folder', () => { st.folder = f; st.key = null; render(); }); }
    const t = center.scrollTop;
    const list = h('div', { class: 'wd-tasks-list' }, listView(
      [{ k: 'name', label: 'Name', w: 160 }, { k: 'status', label: 'Status', w: 64 }, { k: 'trigger', label: 'Triggers', w: 150 }, { k: 'next', label: 'Next Run Time', w: 130 }, { k: 'last', label: 'Last Run Time', w: 130 }, { k: 'result', label: 'Last Run Result', w: 190 }, { k: 'author', label: 'Author', w: 120 }, { k: 'created', label: 'Created' }], rs, {
        sel: st.key, icon: () => 'i-task', cls: (r) => (r.status === 'Disabled' ? 'dim' : ''),
        onSel: (k) => { st.key = k; renderDetail(); renderActions(); }, onOpen: (r) => openProps(r), onCtx: (e, r) => menuAt(e, itemsFor(r)),
      }));
    detail = h('div', { class: 'wd-tasks-detail' });
    clear(center).append(h('div', { class: 'wd-pane-h' }, `Task Scheduler Library${st.folder === '\\' ? '' : st.folder.replace(/\\/g, ' > ').trimEnd()}   (${rs.length})`), list, detail);
    renderDetail(); renderActions();
    center.scrollTop = t;
    st.sig = JSON.stringify(all().map((r) => [r.key, r.status]));
  }
  let detail = null;
  function renderDetail() {
    const r = all().find((x) => x.key === st.key);
    if (!detail) return;
    clear(detail).append(tabStrip(['General', 'Triggers', 'Actions', 'Conditions', 'Settings', 'History'], st.tab, (t) => { st.tab = t; renderDetail(); }),
      h('div', { class: 'wd-tasks-det-body' }, !r ? h('div', { class: 'wd-hint' }, 'Select a task to view its details.') : st.tab === 'General'
        ? [h('div', { class: 'kv' }, h('b', {}, 'Name:'), h('span', {}, r.name)), h('div', { class: 'kv' }, h('b', {}, 'Location:'), h('span', {}, r.path)), h('div', { class: 'kv' }, h('b', {}, 'Author:'), h('span', {}, r.author)), h('div', { class: 'kv' }, h('b', {}, 'Description:'), h('span', {}, r.desc)),
          h('div', { class: 'kv' }, h('b', {}, 'Security options'), h('span', {}, ''))]
        : st.tab === 'Triggers' ? h('div', {}, r.trigger) : st.tab === 'Actions' ? h('div', {}, r.action) : h('div', { class: 'wd-hint' }, '')));
  }
  function renderActions() {
    const r = all().find((x) => x.key === st.key);
    const secs = [{ title: 'Actions', items: [dis('Connect to Another Computer...'), { sep: true }, dis('Create Basic Task...'), dis('Create Task...'), dis('Import Task...'), dis('Display All Running Tasks'), dis('Enable All Tasks History'), dis('AT Service Account Configuration'), { sep: true }, dis('New Folder...'), dis('Delete Folder'), { sep: true }, { label: 'Refresh', onClick: () => render() }, dis('Help')] }];
    if (r) secs.push({ title: 'Selected Item', items: [dis('Run'), dis('End'), { label: 'Disable', disabled: r.status === 'Disabled', onClick: () => ctx.act(cmd.disableTask(r.name)) }, dis('Export...'), { label: 'Properties', onClick: () => openProps(r) }, { label: 'Delete', onClick: () => del(r) }, dis('Help')] });
    clear(actions).append(actionsPane(secs));
  }
  el.append(menuBar(mmcMenus(ctx, () => itemsFor(all().find((r) => r.key === st.key)))), toolbar([{ title: 'Back', icon: 'i-back', disabled: true }, { title: 'Forward', icon: 'i-fwd', disabled: true }, null, { title: 'Refresh', icon: 'i-refresh', onClick: () => render() }, { title: 'Help', icon: 'i-help', disabled: true }]),
    h('div', { class: 'wd-mmc-body' }, tree, center, actions));
  render();
  return {
    el,
    refresh(force) {
      const sig = JSON.stringify(all().map((r) => [r.key, r.status]));
      if (!force && (sig === st.sig || hasDialog(el))) return;
      render();
    },
  };
}

// ============================================================================================================
// Local Users and Groups (lusrmgr.msc)
// ============================================================================================================
export function createLusr(ctx) {
  const st = { node: 'Users', key: null, sig: '' };
  const el = h('div', { class: 'wd-app wd-mmc' });
  const tree = h('div', { class: 'wd-tree narrow' });
  const pane = h('div', { class: 'wd-listpane' });
  const actions = h('div', { class: 'wd-actionspane' });
  const users = () => localUserRows(ctx.live()).map((u) => ({ ...u, key: u.name }));
  const admins = () => localAdminRows(ctx.live());
  const short = (n) => String(n).split('\\').pop();
  const del = (u) => msgBox(el, { title: 'Local Users and Groups', kind: 'question', text: `Each user account has a unique identifier, and deleting this account would remove it for good.\n\nAre you sure you want to delete the user ${u.name}?`, yes: () => { ctx.act(cmd.removeLocalUser(u.name)); st.key = null; }, no: () => {} });
  const memberships = (u) => [...(admins().some((a) => lcEq(short(a.name), u.name) && a.source === 'Local') ? ['Administrators'] : []), 'Users'];
  function userProps(u0) {
    const ps = { tab: 'General', disabled: null, sel: null };
    const content = h('div', { class: 'wd-ps' });
    const redraw = () => {
      const u = users().find((x) => x.name === u0.name);
      if (!u) { holder.close(); return; }
      const dsb = ps.disabled === null ? !u.enabled : ps.disabled;
      const groups = memberships(u).map((g) => ({ key: g, name: g }));
      clear(content).append(tabStrip(['General', 'Member Of', 'Profile'], ps.tab, (t) => { ps.tab = t; redraw(); }),
        ps.tab === 'General' ? h('div', { class: 'wd-ps-body' }, h('div', { class: 'wd-ps-head' }, h('i', { class: `wd-ic-l ${dsb ? 'i-userdis' : 'i-user'}` }), h('b', {}, u.name)), field('Full name:', u.full), field('Description:', u.desc),
          check('User must change password at next logon', false, null, true), check('User cannot change password', false, null, true), check('Password never expires', true, null, true), check('Account is disabled', dsb, (v) => { ps.disabled = v; }), check('Account is locked out', false, null, true))
          : ps.tab === 'Member Of' ? h('div', { class: 'wd-ps-body' }, h('div', { class: 'wd-optlabel' }, 'Member of:'), h('div', { class: 'wd-lvbox' }, listView([{ k: 'name', label: 'Name' }], groups, { sel: ps.sel, onSel: (k) => { ps.sel = k; }, icon: () => 'i-group' })),
            h('div', { class: 'wd-grp-row' }, h('button', { type: 'button', class: 'wd-btn', disabled: true }, 'Add...'), h('button', { type: 'button', class: 'wd-btn', onclick: () => {
              if (ps.sel !== 'Administrators') return;
              msgBox(el, { title: 'Local Users and Groups', kind: 'question', text: `Remove ${u.name} from the Administrators group?`, yes: () => { ctx.act(cmd.removeLocalAdmin(u.name)); ps.sel = null; }, no: () => {} });
            } }, 'Remove'))) : h('div', { class: 'wd-ps-body wd-empty' }));
    };
    const apply = () => { const u = users().find((x) => x.name === u0.name); if (u && ps.disabled !== null && ps.disabled !== !u.enabled) ctx.act(ps.disabled ? cmd.disableLocalUser(u.name) : cmd.enableLocalUser(u.name)); ps.disabled = null; };
    const holder = dialog(el, { title: `${u0.name} Properties`, width: 380, body: content, onClose: () => { redrawP = null; }, buttons: [{ label: 'OK', primary: true, onClick: apply }, { label: 'Cancel' }, { label: 'Apply', onClick: () => { apply(); redraw(); return false; } }, { label: 'Help', onClick: () => false }] });
    redrawP = redraw; redraw();
  }
  let redrawP = null;
  function groupProps(name) {
    const ps = { sel: null };
    const content = h('div', { class: 'wd-ps' });
    const redraw = () => {
      const rows = (name === 'Administrators' ? admins() : [{ name: `${ctx.host}\\${ctx.dev.user || 'user'}` }]).map((a) => ({ key: a.name, name: a.name }));
      clear(content).append(h('div', { class: 'wd-ps-body' }, h('div', { class: 'wd-ps-head' }, h('i', { class: 'wd-ic-l i-group' }), h('b', {}, name)), field('Description:', name === 'Administrators' ? 'Administrators have complete and unrestricted access to the computer/domain' : ''),
        h('div', { class: 'wd-optlabel' }, 'Members:'), h('div', { class: 'wd-lvbox' }, listView([{ k: 'name', label: 'Name' }], rows, { sel: ps.sel, onSel: (k) => { ps.sel = k; }, icon: () => 'i-user' })),
        h('div', { class: 'wd-grp-row' }, h('button', { type: 'button', class: 'wd-btn', disabled: true }, 'Add...'), h('button', { type: 'button', class: 'wd-btn', onclick: () => {
          if (!ps.sel || name !== 'Administrators') return;
          msgBox(el, { title: 'Local Users and Groups', kind: 'question', text: `Remove ${ps.sel} from the ${name} group?`, yes: () => { ctx.act(cmd.removeLocalAdmin(short(ps.sel))); ps.sel = null; }, no: () => {} });
        } }, 'Remove'))));
    };
    dialog(el, { title: `${name} Properties`, width: 380, body: content, onClose: () => { redrawP = null; }, buttons: [{ label: 'OK', primary: true }, { label: 'Cancel' }, { label: 'Apply', onClick: () => false }, { label: 'Help', onClick: () => false }] });
    redrawP = redraw; redraw();
  }
  const itemsFor = (u) => (u ? [dis('Set Password...'), { sep: true }, dis('All Tasks', { sub: true }), { sep: true }, { label: 'Delete', onClick: () => del(u) }, dis('Rename'), { sep: true }, { label: 'Properties', bold: true, onClick: () => userProps(u) }, { sep: true }, dis('Help')] : []);
  function render() {
    const t = pane.scrollTop;
    clear(tree).append(h('div', { class: 'wd-tn', style: { paddingLeft: '4px' } }, h('i', { class: 'wd-ic i-lusr' }), h('span', {}, 'Local Users and Groups (Local)')),
      ...['Users', 'Groups'].map((n) => h('div', { class: `wd-tn${st.node === n ? ' on' : ''}`, style: { paddingLeft: '20px' }, tabindex: '0', onclick: () => { st.node = n; st.key = null; render(); } }, h('i', { class: 'wd-ic i-folder' }), h('span', {}, n))));
    const isUsers = st.node === 'Users';
    const rows = isUsers ? users() : [{ key: 'Administrators', name: 'Administrators', full: '', desc: 'Administrators have complete and unrestricted access to the computer/domain' }, { key: 'Remote Desktop Users', name: 'Remote Desktop Users', full: '', desc: 'Members in this group are granted the right to logon remotely' }, { key: 'Users', name: 'Users', full: '', desc: 'Users are prevented from making accidental or intentional system-wide changes' }];
    clear(pane).append(h('div', { class: 'wd-pane-h' }, `${st.node}   ${rows.length}`), listView([{ k: 'name', label: 'Name', w: 180 }, { k: 'full', label: 'Full Name', w: 120 }, { k: 'desc', label: 'Description' }], rows, {
      sel: st.key, icon: (r) => (isUsers ? (r.enabled === false ? 'i-userdis' : 'i-user') : 'i-group'),
      onSel: (k) => { st.key = k; actionsFor(rows); }, onOpen: (r) => (isUsers ? userProps(r) : groupProps(r.name)), onCtx: (e, r) => menuAt(e, isUsers ? itemsFor(r) : [{ label: 'Properties', bold: true, onClick: () => groupProps(r.name) }]),
    }));
    actionsFor(rows);
    pane.scrollTop = t;
    st.sig = JSON.stringify([users(), admins()]);
  }
  function actionsFor(rows) {
    const sel = rows.find((r) => r.key === st.key);
    const secs = [{ title: st.node, items: [dis(st.node === 'Users' ? 'New User...' : 'New Group...'), dis('Refresh'), dis('Help')] }];
    if (sel) secs.push({ title: sel.name, items: st.node === 'Users' ? itemsFor(sel).filter((i) => !i.sep && !/^(Help|Rename)$/.test(i.label)) : [{ label: 'Properties', onClick: () => groupProps(sel.name) }] });
    clear(actions).append(actionsPane(secs));
  }
  el.append(menuBar(mmcMenus(ctx, () => [])), toolbar([{ title: 'Back', icon: 'i-back', disabled: true }, { title: 'Forward', icon: 'i-fwd', disabled: true }, null, { title: 'Refresh', icon: 'i-refresh', onClick: () => render() }]), h('div', { class: 'wd-mmc-body' }, tree, pane, actions));
  render();
  return {
    el,
    refresh(force) {
      const sig = JSON.stringify([users(), admins()]);
      if (!force && (sig === st.sig || hasDialog(el))) return;
      render(); redrawP?.();
    },
  };
}

// ============================================================================================================
// File Explorer (This PC), read-only
// ============================================================================================================
export function createExplorer(ctx) {
  const el = h('div', { class: 'wd-app wd-explorer' });
  const folders = ['Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Videos', '3D Objects'];
  el.append(
    h('div', { class: 'wd-ex-ribbon' }, ['File', 'Computer', 'View'].map((t, i) => h('span', { class: i === 1 ? 'on' : '' }, t))),
    h('div', { class: 'wd-ex-addr' }, h('span', { class: 'wd-ex-nav' }, '←  →  ↑'), h('div', { class: 'wd-input boxed grow' }, 'This PC'), h('div', { class: 'wd-input boxed search' }, 'Search This PC')),
    h('div', { class: 'wd-ex-body' },
      h('div', { class: 'wd-ex-nav-pane' }, ['Quick access', 'OneDrive', 'This PC', 'Network'].map((n) => h('div', { class: `wd-tn${n === 'This PC' ? ' on' : ''}` }, h('i', { class: 'wd-ic i-folder' }), h('span', {}, n)))),
      h('div', { class: 'wd-ex-main' },
        h('div', { class: 'wd-ex-sec' }, `Folders (${folders.length})`),
        h('div', { class: 'wd-ex-grid' }, folders.map((f) => h('div', { class: 'wd-ex-item' }, h('i', { class: 'wd-ic-xl i-folder' }), h('span', {}, f)))),
        h('div', { class: 'wd-ex-sec' }, 'Devices and drives (2)'),
        h('div', { class: 'wd-ex-grid' },
          h('div', { class: 'wd-ex-drive' }, h('i', { class: 'wd-ic-xl i-drive' }), h('div', {}, h('div', {}, 'Local Disk (C:)'), h('div', { class: 'wd-bar' }, h('i', { style: { width: '48%' } })), h('div', { class: 'wd-hint' }, '41.2 GB free of 79.4 GB'))),
          h('div', { class: 'wd-ex-drive' }, h('i', { class: 'wd-ic-xl i-dvd' }), h('div', {}, h('div', {}, 'DVD Drive (D:)'), h('div', { class: 'wd-hint' }, ''))))),
    ),
    h('div', { class: 'wd-status' }, '9 items'));
  void ctx;
  return { el, refresh() {} };
}

export { typeLabel, NOT_SUPPORTED };
