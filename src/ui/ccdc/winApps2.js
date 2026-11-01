import { h, clear, dialog, msgBox, tabStrip, listView, menuBar, toolbar, check, contextMenu, menuAt } from './winWidgets.js';
import { filterEvents, fmtDate, stoppedAutoServices, serviceRows } from '../../game/winGuiMap.js';

// Event Viewer and Server Manager for the remote-desktop view (see winApps.js for the ctx contract).

const dis = (label, extra = {}) => ({ label, disabled: true, ...extra });
const hasDialog = (el) => !!el.querySelector(':scope > .wd-dlgwrap');

// ============================================================================================================
// Event Viewer
// ============================================================================================================
export function createEvents(ctx) {
  const st = { log: 'Security', sel: null, filter: { ids: '', keywords: null }, tab: 'General', sig: '', tick: -1 };
  const el = h('div', { class: 'wd-app wd-mmc wd-evt' });
  const tree = h('div', { class: 'wd-tree' });
  const center = h('div', { class: 'wd-evt-center' });
  const actions = h('div', { class: 'wd-actionspane' });
  const LOGS = ['Application', 'Security', 'Setup', 'System', 'Forwarded Events'];
  const logEvents = () => (['Application', 'Security', 'System'].includes(st.log) ? ctx.events(st.log) : []);
  const shown = () => filterEvents(logEvents(), st.filter);
  const isSec = () => st.log === 'Security';
  const filtered = () => !!(st.filter.ids || st.filter.keywords);

  function openFilter() {
    const ids = h('input', { type: 'text', class: 'wd-input', value: st.filter.ids, placeholder: '<All Event IDs>', 'aria-label': 'Includes/Excludes Event IDs' });
    const kws = { 'Audit Success': !st.filter.keywords || st.filter.keywords.includes('Audit Success'), 'Audit Failure': !st.filter.keywords || st.filter.keywords.includes('Audit Failure') };
    dialog(el, {
      title: 'Filter Current Log', width: 400,
      body: h('div', { class: 'wd-form' },
        h('div', { class: 'wd-hint' }, 'Logged:  Any time'),
        h('div', { class: 'wd-optlabel' }, 'Event level:'), h('div', { class: 'wd-radio-col' }, ['Critical', 'Warning', 'Verbose', 'Error', 'Information'].map((l) => check(l, false, null, true))),
        h('div', { class: 'wd-optlabel' }, 'Includes/Excludes Event IDs: Enter ID numbers and/or ID ranges separated by commas. To exclude criteria, type a minus sign first. For example 1,3,5-99,-76'), ids,
        isSec() ? [h('div', { class: 'wd-optlabel' }, 'Keywords:'), check('Audit Success', kws['Audit Success'], (v) => { kws['Audit Success'] = v; }), check('Audit Failure', kws['Audit Failure'], (v) => { kws['Audit Failure'] = v; })] : null),
      buttons: [{
        label: 'OK', primary: true,
        onClick: () => { st.filter = { ids: ids.value.trim() === '<All Event IDs>' ? '' : ids.value.trim(), keywords: isSec() && !(kws['Audit Success'] && kws['Audit Failure']) ? Object.keys(kws).filter((k) => kws[k]) : null }; st.sel = null; render(); },
      }, { label: 'Clear', onClick: () => { st.filter = { ids: '', keywords: null }; st.sel = null; render(); } }, { label: 'Cancel' }],
    });
    setTimeout(() => ids.focus(), 0);
  }

  function renderTree() {
    clear(tree);
    const n = (label, depth, on, icon, onclick, open) => tree.append(h('div', { class: `wd-tn${on ? ' on' : ''}`, style: { paddingLeft: `${4 + depth * 16}px` }, tabindex: '0', onclick }, h('span', { class: `wd-twisty${open === undefined ? ' none' : open ? ' open' : ''}` }), h('i', { class: `wd-ic ${icon}` }), h('span', {}, label)));
    n('Event Viewer (Local)', 0, false, 'i-evt', null, true);
    n('Custom Views', 1, false, 'i-folder', null, false);
    n('Windows Logs', 1, false, 'i-folder', null, true);
    for (const l of LOGS) n(l, 2, st.log === l, 'i-log', () => { st.log = l; st.sel = null; st.filter = { ids: '', keywords: null }; render(); });
    n('Applications and Services Logs', 1, false, 'i-folder', null, false);
    n('Subscriptions', 1, false, 'i-folder', null);
  }

  function renderActions(ev) {
    const secs = [{ title: st.log, items: [dis('Open Saved Log...'), dis('Create Custom View...'), dis('Import Custom View...'), { sep: true }, dis('Clear Log...'), { label: 'Filter Current Log...', onClick: openFilter }, { label: 'Clear Filter', disabled: !filtered(), onClick: () => { st.filter = { ids: '', keywords: null }; render(); } }, dis('Properties'), dis('Find...'), dis('Save All Events As...'), dis('Attach a Task To this Log...'), dis('View', { sub: true }), { label: 'Refresh', onClick: () => render() }, dis('Help')] }];
    if (ev) secs.push({ title: 'Event', items: [dis('Event Properties'), dis('Attach Task To This Event...'), dis('Copy', { sub: true }), dis('Save Selected Events...'), { label: 'Refresh', onClick: () => render() }, dis('Help')] });
    clear(actions).append(actionsList(secs));
  }

  function actionsList(sections) {
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

  function preview(ev) {
    if (!ev) return h('div', { class: 'wd-hint pad' }, 'Select an event to view its details.');
    const kv = (k, v, k2, v2) => h('div', { class: 'wd-evt-kv' }, h('b', {}, k), h('span', {}, v), k2 ? h('b', {}, k2) : null, k2 ? h('span', {}, v2) : null);
    return h('div', { class: 'wd-evt-prev' },
      h('div', { class: 'wd-evt-prev-h' }, `Event ${ev.id}, ${ev.source}`, h('i', { class: 'wd-ic i-close-s' })),
      tabStrip(['General', 'Details'], st.tab, (t) => { st.tab = t; renderPreview(); }),
      h('div', { class: 'wd-evt-prev-b' },
        st.tab === 'General' ? [h('pre', { class: 'wd-evt-text' }, ev.text),
          h('div', { class: 'wd-evt-props' },
            kv('Log Name:', ev.log, 'Source:', ev.source), kv('Logged:', fmtDate(ev.ts), 'Event ID:', String(ev.id)),
            kv('Task Category:', ev.cat, 'Level:', ev.level), kv('Keywords:', ev.kw, 'User:', ev.user), kv('Computer:', ev.computer, 'OpCode:', 'Info'))]
          : h('pre', { class: 'wd-evt-text' }, `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">\n  <System>\n    <Provider Name="${ev.source}" />\n    <EventID>${ev.id}</EventID>\n    <Level>0</Level>\n    <TimeCreated SystemTime="${new Date(ev.ts).toISOString()}" />\n    <EventRecordID>${ev.rec}</EventRecordID>\n    <Channel>${ev.log}</Channel>\n    <Computer>${ev.computer}</Computer>\n  </System>\n</Event>`)));
  }
  let prevHost = null;
  function renderPreview() { if (!prevHost) return; clear(prevHost).append(preview(shown().find((e) => e.rec === st.sel))); }

  function render() {
    renderTree();
    const evs = shown();
    const t = center.querySelector('.wd-evt-list')?.scrollTop || 0;
    const sec = isSec();
    const rows = evs.map((e) => ({ ...e, key: e.rec, when: fmtDate(e.ts), idc: String(e.id) }));
    const list = h('div', { class: 'wd-evt-list' }, listView(
      [{ k: sec ? 'kw' : 'level', label: sec ? 'Keywords' : 'Level', w: 120 }, { k: 'when', label: 'Date and Time', w: 160 }, { k: 'source', label: 'Source', w: 210 }, { k: 'idc', label: 'Event ID', w: 66 }, { k: 'cat', label: 'Task Category' }], rows, {
        sel: st.sel, icon: (r) => (r.kw === 'Audit Success' ? 'i-key' : r.kw === 'Audit Failure' ? 'i-lock' : 'i-info'),
        onSel: (k) => { st.sel = k; renderPreview(); renderActions(evs.find((e) => e.rec === k)); },
        onOpen: (r) => { st.sel = r.key; renderPreview(); },
        onCtx: (e, r) => menuAt(e, [dis('Event Properties'), dis('Attach Task To This Event...'), dis('Copy', { sub: true }), dis('Save Selected Events...'), { label: 'Refresh', onClick: () => render() }, dis('Help')]),
      }));
    prevHost = h('div', { class: 'wd-evt-prevhost' });
    const label = filtered() ? `Filtered: Log: ${st.log}; Source: ; Event ID: ${st.filter.ids || '<All Event IDs>'}${st.filter.keywords ? `; Keywords: ${st.filter.keywords.join(', ')}` : ''}. Number of events: ${evs.length}` : `${st.log}   Number of events: ${evs.length}`;
    clear(center).append(h('div', { class: 'wd-pane-h' }, label), list, prevHost);
    list.scrollTop = t;
    renderPreview();
    renderActions(evs.find((e) => e.rec === st.sel));
    st.sig = `${st.log}:${logEvents().length}`;
  }

  el.append(menuBar([
    { label: 'File', items: () => [dis('Open Saved Log...'), dis('Create Custom View...'), { sep: true }, dis('Options...'), { sep: true }, { label: 'Exit', onClick: () => ctx.closeWin() }] },
    { label: 'Action', items: () => [{ label: 'Filter Current Log...', onClick: openFilter }, { label: 'Refresh', onClick: () => render() }, dis('Help')] },
    { label: 'View', items: () => [dis('Add/Remove Columns...'), dis('Customize...')] }, { label: 'Help', items: () => [dis('Event Viewer Help')] }]),
  toolbar([{ title: 'Back', icon: 'i-back', disabled: true }, { title: 'Forward', icon: 'i-fwd', disabled: true }, null, { title: 'Refresh', icon: 'i-refresh', onClick: () => render() }, { title: 'Filter Current Log', icon: 'i-filter', onClick: openFilter }]),
  h('div', { class: 'wd-mmc-body' }, tree, center, actions));
  render();
  return {
    el,
    refresh(force) {
      const sig = `${st.log}:${logEvents().length}`;
      if (!force && (sig === st.sig || hasDialog(el))) return;
      render();
    },
  };
}

// ============================================================================================================
// Server Manager
// ============================================================================================================
const SM_EVENTS = {
  dc: [['10016', 'Error', 'Microsoft-Windows-DistributedCOM', 'System', 9 * 3600 - 0], ['4013', 'Warning', 'Microsoft-Windows-DNS-Server-Service', 'DNS Server', 3 * 3600], ['2886', 'Warning', 'ActiveDirectory_DomainService', 'Directory Service', 26 * 3600], ['1014', 'Warning', 'Microsoft-Windows-DNS-Client', 'System', 5 * 3600]],
  other: [['10016', 'Error', 'Microsoft-Windows-DistributedCOM', 'System', 9 * 3600], ['1014', 'Warning', 'Microsoft-Windows-DNS-Client', 'System', 5 * 3600]],
};

export function createServerManager(ctx) {
  const st = { page: 'Dashboard', welcome: true, sig: '' };
  const el = h('div', { class: 'wd-app wd-sm' });
  const nav = h('div', { class: 'wd-sm-nav' });
  const main = h('div', { class: 'wd-sm-main' });
  const isDc = !!ctx.dev.ctx?.dir && /domain controller/i.test(ctx.dev.name || '');
  const NAV = [['Dashboard', 'i-sm-dash'], ['Local Server', 'i-sm-local'], ['All Servers', 'i-sm-all'], ...(isDc ? [['AD DS', 'i-sm-adds'], ['DNS', 'i-sm-dns']] : []), ['File and Storage Services', 'i-sm-file']];
  const sevColor = (s) => (s === 'Error' ? 'err' : s === 'Warning' ? 'warn' : '');

  function dot(n, bad) { return h('span', { class: `wd-sm-pill ${bad ? 'bad' : 'ok'}` }, bad ? String(n) : '', bad ? null : h('i', { class: 'wd-sm-tick' })); }
  function tile(title, count, kinds) {
    const live = ctx.live();
    const stopped = stoppedAutoServices(live).length;
    const evs = (isDc ? SM_EVENTS.dc : SM_EVENTS.other).length;
    const rows = [];
    rows.push(['Manageability', 0, false]);
    if (kinds.includes('events')) rows.push(['Events', evs, true]);
    if (kinds.includes('services')) rows.push(['Services', stopped, stopped > 0]);
    rows.push(['Performance', 0, false]);
    rows.push(['BPA results', 0, false]);
    const anyBad = rows.some((r) => r[2]);
    return h('div', { class: `wd-sm-tile${anyBad ? ' bad' : ''}`, tabindex: '0', onclick: () => { st.page = title === 'Local Server' ? 'Local Server' : title === 'All Servers' ? 'All Servers' : title; render(); } },
      h('div', { class: 'wd-sm-tile-h' }, h('i', { class: 'wd-ic i-sm-tile' }), h('span', { class: 'wd-sm-tile-t' }, title), h('span', { class: 'wd-sm-tile-n' }, String(count))),
      rows.map(([l, n, bad]) => h('div', { class: 'wd-sm-tile-r' }, h('span', {}, l), bad ? h('span', { class: 'wd-sm-pill bad' }, String(n)) : h('span', { class: 'wd-sm-pill ok' }, h('i', { class: 'wd-sm-tick' })))));
  }

  function dashboard() {
    const roles = [...(isDc ? [['AD DS', ['events', 'services']], ['DNS', ['events', 'services']]] : []), ['File and Storage Services', ['events']]];
    return h('div', { class: 'wd-sm-page' },
      st.welcome ? h('div', { class: 'wd-sm-welcome' },
        h('div', { class: 'wd-sm-wh' }, 'WELCOME TO SERVER MANAGER'),
        h('div', { class: 'wd-sm-wb' },
          h('div', { class: 'wd-sm-wq' }, h('div', { class: 'wd-sm-wbig' }, 'QUICK START'),
            ['Configure this local server', 'Add roles and features', 'Add other servers to manage', 'Create a server group', 'Connect this server to cloud services'].map((t, i) => h('div', { class: 'wd-sm-wstep' }, h('b', {}, String(i + 1)), h('a', { class: 'wd-link-w', tabindex: '0', onclick: () => { if (i === 0) { st.page = 'Local Server'; render(); } } }, t)))),
          h('div', { class: 'wd-sm-wn' }, h('div', { class: 'wd-sm-wbig' }, 'WHAT\'S NEW')), h('div', { class: 'wd-sm-wl' }, h('div', { class: 'wd-sm-wbig' }, 'LEARN MORE'))),
        h('button', { type: 'button', class: 'wd-sm-hide', title: 'Hide', onclick: () => { st.welcome = false; render(); } }, 'Hide')) : null,
      h('div', { class: 'wd-sm-rs-h' }, 'ROLES AND SERVER GROUPS', h('span', {}, `Roles: ${roles.length}  |  Server groups: 1  |  Servers total: 1`)),
      h('div', { class: 'wd-sm-tiles' }, ...roles.map(([n, k]) => tile(n, 1, k)), tile('Local Server', 1, ['events', 'services']), tile('All Servers', 1, ['events', 'services'])));
  }

  function servicesTable() {
    const rows = serviceRows(ctx.live()).filter((r) => r.live).map((r) => ({ key: r.id, server: ctx.host, name: r.name, id: r.id, status: r.running ? 'Running' : 'Stopped', startup: r.startup }));
    return h('div', { class: 'wd-sm-sec' }, h('div', { class: 'wd-sm-sec-h' }, 'SERVICES', h('span', {}, `All services | ${rows.length} total`)),
      h('div', { class: 'wd-sm-grid' }, listView([{ k: 'server', label: 'Server Name', w: 90 }, { k: 'name', label: 'Display Name', w: 200 }, { k: 'id', label: 'Service Name', w: 100 }, { k: 'status', label: 'Status', w: 70 }, { k: 'startup', label: 'Start Type' }], rows, { cls: (r) => (r.status === 'Stopped' && r.startup === 'Automatic' ? 'bad' : '') })));
  }
  function eventsTable() {
    const now = ctx.nowMs();
    const rows = (isDc ? SM_EVENTS.dc : SM_EVENTS.other).map((e, i) => ({ key: String(i), server: ctx.host, id: e[0], sev: e[1], source: e[2], log: e[3], when: fmtDate(now - e[4] * 1000) }));
    return h('div', { class: 'wd-sm-sec' }, h('div', { class: 'wd-sm-sec-h' }, 'EVENTS', h('span', {}, `All events | ${rows.length} total`)),
      h('div', { class: 'wd-sm-grid' }, listView([{ k: 'server', label: 'Server Name', w: 80 }, { k: 'id', label: 'ID', w: 50 }, { k: 'sev', label: 'Severity', w: 66 }, { k: 'source', label: 'Source', w: 220 }, { k: 'log', label: 'Log', w: 110 }, { k: 'when', label: 'Date and Time' }], rows, { cls: (r) => sevColor(r.sev) })));
  }
  function localServer() {
    const fmt = (rows) => h('div', { class: 'wd-sm-props-col' }, rows.map(([k, v, link]) => h('div', { class: 'wd-sm-prop' }, h('span', { class: 'k' }, k), link ? h('a', { class: 'wd-link', tabindex: '0' }, v) : h('span', { class: 'v' }, v))));
    const d = ctx.dev; const dir = d.ctx?.dir;
    return h('div', { class: 'wd-sm-page' },
      h('div', { class: 'wd-sm-sec' }, h('div', { class: 'wd-sm-sec-h' }, 'PROPERTIES', h('span', {}, 'For ' + ctx.host)),
        h('div', { class: 'wd-sm-props' },
          fmt([['Computer name', ctx.host, 0], ['Domain', dir ? dir.domain : 'WORKGROUP', 1], ['', '', 0], ['Windows Defender Firewall', 'Domain: On', 1], ['Remote management', 'Enabled', 1], ['Remote Desktop', 'Enabled', 1], ['NIC Teaming', 'Disabled', 1], ['Ethernet', `IPv4 address assigned by DHCP, IPv6 enabled`, 1]]),
          fmt([['Last installed updates', 'Never', 1], ['Windows Update', 'Download updates only, using Windows Update', 1], ['Last checked for updates', 'Today at 3:12 AM', 1], ['', '', 0], ['Windows Defender Antivirus', 'Real-Time Protection: On', 1], ['Feedback & Diagnostics', 'Settings', 1], ['IE Enhanced Security Configuration', 'On', 1], ['Time zone', '(UTC-05:00) Eastern Time (US & Canada)', 1], ['Product ID', '00429-70000-00000-AA582 (activated)', 1]]))),
      eventsTable(), servicesTable());
  }
  function allServers() {
    const rows = [{ key: 'a', name: ctx.host, ip: ctx.dev.ip || '', mg: 'Online - Performance counters not started', upd: fmtDate(ctx.nowMs() - 4 * 60000), act: '00429-70000-00000-AA582 (activated)' }];
    return h('div', { class: 'wd-sm-page' }, h('div', { class: 'wd-sm-sec' }, h('div', { class: 'wd-sm-sec-h' }, 'SERVERS', h('span', {}, 'All servers | 1 total')),
      h('div', { class: 'wd-sm-grid' }, listView([{ k: 'name', label: 'Server Name', w: 90 }, { k: 'ip', label: 'IPv4 Address', w: 100 }, { k: 'mg', label: 'Manageability', w: 250 }, { k: 'upd', label: 'Last Update', w: 150 }, { k: 'act', label: 'Windows Activation' }], rows))), eventsTable(), servicesTable());
  }

  function render() {
    const t = main.querySelector('.wd-sm-scroll')?.scrollTop || 0;
    clear(nav).append(h('div', { class: 'wd-sm-nav-h' }), ...NAV.map(([n, ic]) => h('div', { class: `wd-sm-nav-i${st.page === n ? ' on' : ''}`, tabindex: '0', onclick: () => { st.page = n; render(); } }, h('i', { class: `wd-ic ${ic}` }), h('span', {}, n))));
    const toolsItems = () => [
      ...(isDc ? [{ label: 'Active Directory Users and Computers', onClick: () => ctx.openApp('aduc') }] : []),
      { label: 'Event Viewer', onClick: () => ctx.openApp('events') }, { label: 'Services', onClick: () => ctx.openApp('services') }, { label: 'Task Scheduler', onClick: () => ctx.openApp('tasks') }, { label: 'Windows PowerShell', onClick: () => ctx.openApp('ps') }, { label: 'System Information', disabled: true }, { label: 'Windows Defender Firewall with Advanced Security', disabled: true },
    ];
    const menu = (label, items) => h('span', { class: 'wd-sm-mi', tabindex: '0', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); contextMenu(e.currentTarget, r.left, r.bottom, items()); } }, label);
    const body = st.page === 'Dashboard' ? dashboard() : st.page === 'Local Server' ? localServer() : st.page === 'All Servers' ? allServers() : h('div', { class: 'wd-sm-page' }, h('div', { class: 'wd-sm-sec' }, h('div', { class: 'wd-sm-sec-h' }, 'SERVERS', h('span', {}, `All servers | 1 total`)),
      h('div', { class: 'wd-sm-grid' }, listView([{ k: 'name', label: 'Server Name', w: 90 }, { k: 'ip', label: 'IPv4 Address', w: 100 }, { k: 'mg', label: 'Manageability' }], [{ key: 'a', name: ctx.host, ip: ctx.dev.ip || '', mg: 'Online - Performance counters not started' }]))), eventsTable(), servicesTable());
    clear(main).append(
      h('div', { class: 'wd-sm-top' }, h('div', { class: 'wd-sm-crumb' }, 'Server Manager', h('i', { class: 'wd-sm-sep' }), h('b', {}, st.page)),
        h('div', { class: 'wd-sm-menus' }, h('i', { class: 'wd-ic i-refresh' }), h('i', { class: 'wd-ic i-flag' }), menu('Manage', () => [{ label: 'Add Roles and Features', disabled: true }, { label: 'Server Manager Properties', disabled: true }]), menu('Tools', toolsItems), menu('View', () => [{ label: 'Show Welcome Tile', onClick: () => { st.welcome = true; st.page = 'Dashboard'; render(); } }]), menu('Help', () => [{ label: 'Server Manager Help', disabled: true }]))),
      h('div', { class: 'wd-sm-scroll' }, body));
    main.querySelector('.wd-sm-scroll').scrollTop = t;
    st.sig = JSON.stringify([ctx.live()?.winServices?.map((s) => [s.Name, s.Status, s.StartType]), st.page]);
  }
  el.append(nav, main);
  render();
  return {
    el,
    refresh(force) {
      const sig = JSON.stringify([ctx.live()?.winServices?.map((s) => [s.Name, s.Status, s.StartType]), st.page]);
      if (!force && sig === st.sig) return;
      render();
    },
  };
}
