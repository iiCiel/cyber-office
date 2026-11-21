import { h, clear } from '../dom.js';

// Burp Suite Community-style window (reference: docs/reference/burp-proxy-history.png, burp-repeater.png).
// Proxy > HTTP history lists what the browser sent through the proxy; right-click / Ctrl+R sends a row to Repeater,
// where the player edits the raw request and presses Send. The scene decides what Send discovers (onSend).
//   data = { history: [{ host, method, url, params?, status, mime, ext?, title?, ip, req, res }], respond(reqText, hit) }
const MAIN_TABS = ['Dashboard', 'Target', 'Proxy', 'Intruder', 'Repeater', 'Collaborator', 'Sequencer', 'Decoder', 'Comparer', 'Logger', 'Organizer', 'Extensions'];
const PROXY_TABS = ['Intercept', 'HTTP history', 'WebSockets history', 'Match and replace', 'Proxy settings'];

/** Colour one raw HTTP message like Burp's Pretty view: header names navy, cookie/param values red. */
function pretty(text) {
  const out = h('div', { class: 'bp-code' });
  const rows = String(text).split('\n');
  let inBody = false;
  rows.forEach((row, i) => {
    const line = h('div', { class: 'bp-ln' }, h('span', { class: 'bp-no' }, String(i + 1)));
    const code = h('span', { class: 'bp-tx' });
    if (i === 0) code.append(row);
    else if (!inBody && row === '') { inBody = true; }
    else if (!inBody) {
      const c = row.indexOf(':');
      if (c > 0) code.append(h('b', { class: 'bp-hn' }, row.slice(0, c + 1)), h('span', { class: /^cookie$/i.test(row.slice(0, c)) ? 'bp-hv' : '' }, row.slice(c + 1)));
      else code.append(row);
    } else if (/^[\w%.-]+=/.test(row) && row.includes('=')) {
      row.split('&').forEach((p, j) => { const [k, ...v] = p.split('='); if (j) code.append('&'); code.append(h('span', { class: 'bp-pk' }, k), '=', h('span', { class: 'bp-hv' }, v.join('='))); });
    } else code.append(row);
    line.append(code);
    out.append(line);
  });
  return out;
}

function pane(label, extra) {
  const tabs = h('div', { class: 'bp-ptabs' }, ['Pretty', 'Raw', 'Hex'].map((t, i) => h('span', { class: i === 0 ? 'bp-ptab on' : 'bp-ptab' }, t)), extra || null);
  const body = h('div', { class: 'bp-pbody' });
  return { el: h('div', { class: 'bp-pane' }, h('div', { class: 'bp-phead' }, label), tabs, body), body };
}

export class BurpWindow {
  /** @param {{ data: object, onSend: (line: string) => ({ discovered?: string }) }} o */
  constructor(o) {
    this.o = o;
    this.data = o.data;
    this.tab = 'Proxy';
    this.sel = this.data.history.length - 1;
    this.rep = [];            // Repeater tabs: { req, res, n }
    this.repSel = -1;
    this.mainTabs = h('div', { class: 'bp-main', role: 'tablist' });
    this.view = h('div', { class: 'bp-view' });
    this.menu = h('div', { class: 'bp-ctx', hidden: '' });
    this.el = h('div', { class: 'bp', tabindex: '-1', onkeydown: (e) => this.key(e), onpointerdown: (e) => { if (!this.menu.contains(e.target)) this.menu.hidden = true; } },
      h('div', { class: 'bp-menubar', 'aria-hidden': 'true' }, ['Burp', 'Project', 'Intruder', 'Repeater', 'View', 'Help'].map((m) => h('span', {}, m))),
      this.mainTabs, this.view, this.menu);
    this.render();
  }

  key(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && this.tab === 'Proxy') { e.preventDefault(); this.toRepeater(this.sel); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && this.tab === 'Repeater') { e.preventDefault(); this.send(); }
  }

  render() {
    clear(this.mainTabs);
    for (const t of MAIN_TABS) {
      const live = t === 'Proxy' || t === 'Repeater';
      this.mainTabs.append(h('button', { type: 'button', role: 'tab', class: `bp-mtab${t === this.tab ? ' on' : ''}`, 'data-tab': t, 'aria-selected': String(t === this.tab), disabled: live ? null : '', onclick: () => { this.tab = t; this.render(); } }, t));
    }
    clear(this.view);
    this.view.append(this.tab === 'Proxy' ? this.proxyView() : this.repeaterView());
  }

  proxyView() {
    const d = this.data;
    const sub = h('div', { class: 'bp-sub' }, PROXY_TABS.map((t) => h('span', { class: `bp-stab${t === 'HTTP history' ? ' on' : ''}` }, t)));
    const filter = h('div', { class: 'bp-filter' }, h('span', { class: 'bp-funnel', 'aria-hidden': 'true' }, '⧩'), 'Filter settings: Hiding CSS, image and general binary content');
    const cols = ['#', 'Host', 'Method', 'URL', 'Params', 'Edited', 'Status code', 'Length', 'MIME type', 'Extension', 'Title', 'TLS', 'IP'];
    const tbody = h('tbody');
    const rows = d.history.map((r, i) => ({ ...r, n: i + 1 })).reverse();
    for (const r of rows) {
      const i = r.n - 1;
      tbody.append(h('tr', { class: i === this.sel ? 'sel' : '', 'data-row': String(r.n), onclick: () => { this.sel = i; this.render(); this.el.focus(); },
        oncontextmenu: (e) => { e.preventDefault(); this.sel = i; this.render(); this.ctx(e, i); } },
      h('td', {}, String(r.n)), h('td', {}, r.host), h('td', {}, r.method), h('td', {}, r.url), h('td', { class: 'c' }, r.params ? '✓' : ''), h('td', {}, ''),
      h('td', {}, String(r.status)), h('td', {}, String(r.res.length)), h('td', {}, r.mime), h('td', {}, r.ext || ''), h('td', {}, r.title || ''), h('td', { class: 'c' }, r.host.startsWith('https') ? '✓' : ''), h('td', {}, r.ip)));
    }
    const table = h('div', { class: 'bp-tablewrap' }, h('table', { class: 'bp-table' }, h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', {}, i === 0 ? '# ⌄' : c)))), tbody));
    const cur = d.history[this.sel];
    const rq = pane('Request'); rq.body.append(pretty(cur.req));
    const rs = pane('Response', h('span', { class: 'bp-ptab dim' }, 'Render')); rs.body.append(pretty(cur.res));
    return h('div', { class: 'bp-proxy' }, sub, filter, table, h('div', { class: 'bp-split' }, rq.el, rs.el));
  }

  ctx(e, i) {
    clear(this.menu);
    const r = this.data.history[i];
    this.menu.append(h('div', { class: 'bp-ctxhead' }, `${r.host}${r.url}`),
      h('button', { type: 'button', class: 'bp-ctxi', 'data-act': 'repeater', onclick: () => { this.menu.hidden = true; this.toRepeater(i); } }, h('span', {}, 'Send to Repeater'), h('kbd', {}, 'Ctrl+R')),
      ...['Send to Intruder', 'Send to Comparer', 'Show response in browser', 'Copy URL', 'Delete item'].map((t) => h('div', { class: 'bp-ctxi dis' }, t)));
    const box = this.el.getBoundingClientRect();
    this.menu.style.left = `${Math.min(e.clientX - box.left, box.width - 230)}px`;
    this.menu.style.top = `${Math.min(e.clientY - box.top, box.height - 200)}px`;
    this.menu.hidden = false;
  }

  toRepeater(i) {
    const r = this.data.history[i];
    if (!r) return;
    this.rep.push({ req: r.req, res: '', n: this.rep.length + 1, host: r.host });
    this.repSel = this.rep.length - 1;
    this.tab = 'Repeater';
    this.render();
  }

  repeaterView() {
    if (this.repSel < 0) return h('div', { class: 'bp-empty' }, 'Send a request here from Proxy > HTTP history (right-click a row, Send to Repeater, or press Ctrl+R).');
    const t = this.rep[this.repSel];
    const tabs = h('div', { class: 'bp-sub bp-rtabs' }, this.rep.map((x, i) => h('button', { type: 'button', class: `bp-stab${i === this.repSel ? ' on' : ''}`, onclick: () => { this.repSel = i; this.render(); } }, `${x.n} ×`)), h('span', { class: 'bp-stab' }, '+'));
    this.ta = h('textarea', { class: 'bp-edit', spellcheck: 'false', 'aria-label': 'Repeater request', oninput: (e) => { t.req = e.target.value; } });
    this.ta.value = t.req;
    const bar = h('div', { class: 'bp-rbar' },
      h('button', { type: 'button', class: 'bp-send', onclick: () => this.send() }, 'Send'),
      h('button', { type: 'button', class: 'bp-btn', disabled: '' }, 'Cancel'),
      h('span', { class: 'bp-nav' }, h('button', { type: 'button', class: 'bp-btn', disabled: '' }, '<'), h('button', { type: 'button', class: 'bp-btn', disabled: '' }, '>')),
      h('span', { class: 'bp-target' }, 'Target: ', h('b', {}, t.host)));
    const rq = h('div', { class: 'bp-pane' }, h('div', { class: 'bp-phead bp-or' }, 'Request'), h('div', { class: 'bp-ptabs' }, h('span', { class: 'bp-ptab' }, 'Pretty'), h('span', { class: 'bp-ptab on' }, 'Raw'), h('span', { class: 'bp-ptab' }, 'Hex')), h('div', { class: 'bp-pbody' }, this.ta));
    const rs = pane('Response', h('span', { class: 'bp-ptab dim' }, 'Render'));
    rs.el.querySelector('.bp-phead').classList.add('bp-or');
    if (t.res) rs.body.append(pretty(t.res));
    const foot = h('div', { class: 'bp-rfoot' }, t.res ? `Done    ${t.res.length} bytes | ${t.ms} millis` : 'Ready');
    return h('div', { class: 'bp-rep' }, tabs, bar, h('div', { class: 'bp-split' }, rq, rs.el), foot);
  }

  /** Repeater Send: the scene turns the request into an engagement action and tells us if it proved something. */
  send() {
    const t = this.rep[this.repSel];
    if (!t) return;
    let req = (this.ta?.value ?? t.req).replace(/\r/g, '');
    // Burp's default "Update Content-Length" setting: fix the header to the edited body's byte length.
    if (req.includes('\n\n') && /^Content-Length:/mi.test(req)) {
      const bytes = new TextEncoder().encode(req.slice(req.indexOf('\n\n') + 2)).length;
      req = req.replace(/^Content-Length:.*$/mi, `Content-Length: ${bytes}`);
    }
    t.req = req;
    const [first = ''] = req.split('\n');
    const [method = 'GET', path = '/'] = first.split(' ');
    const host = (req.match(/^Host:\s*(\S+)/mi) || [])[1] || t.host.replace(/^https?:\/\//, '');
    const body = req.includes('\n\n') ? req.slice(req.indexOf('\n\n') + 2).trim() : '';
    const r = this.o.onSend(`burp ${method} https://${host}${path} ${body}`.trim()) || {};
    t.res = this.data.respond(req, r);
    t.ms = 80 + ((req.length * 7) % 140);
    this.render();
  }
}
