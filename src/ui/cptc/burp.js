import { h, clear } from '../dom.js';

// Burp Suite Community-style window (reference: docs/reference/burp-proxy-history.png, burp-repeater.png).
// Proxy > HTTP history lists what the browser sent through the proxy; right-click / Ctrl+R sends a row to Repeater,
// where the player edits the raw request and presses Send. The scene decides what Send discovers (onSend).
//   data = { history: [{ host, method, url, params?, status, mime, ext?, title?, ip, req, res }], respond(reqText, hit),
//            intercept?: [{ host, method, url, req }]  (what Firefox sends when the player clicks Open browser),
//            action?(reqText) -> engagement line or null (default: 'burp METHOD URL BODY') }
// Proxy > Intercept (reference: docs/reference/burp-intercept.png): with Intercept on, Open browser makes Firefox's
// requests stop here; the player edits the raw request and Forwards it (or Drops it). Forwarded traffic lands in HTTP history.
const MAIN_TABS = ['Dashboard', 'Target', 'Proxy', 'Intruder', 'Repeater', 'Collaborator', 'Sequencer', 'Decoder', 'Comparer', 'Logger', 'Organizer', 'Extensions'];
const PROXY_TABS = ['Intercept', 'HTTP history', 'WebSockets history', 'Match and replace', 'Proxy settings'];
const LIVE_PROXY_TABS = ['Intercept', 'HTTP history'];

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

/** Burp's default "Update Content-Length" setting: fix the header to the edited body's byte length. */
export function fixLength(raw) {
  let req = String(raw).replace(/\r/g, '');
  if (req.includes('\n\n') && /^Content-Length:/mi.test(req)) {
    const bytes = new TextEncoder().encode(req.slice(req.indexOf('\n\n') + 2)).length;
    req = req.replace(/^Content-Length:.*$/mi, `Content-Length: ${bytes}`);
  }
  return req;
}

/** Split a raw request into the parts the engagement engine and the history table need. */
export function parseReq(req, fallbackHost = '') {
  const [first = ''] = req.split('\n');
  const [method = 'GET', path = '/'] = first.split(' ');
  const host = (req.match(/^Host:\s*(\S+)/mi) || [])[1] || String(fallbackHost).replace(/^https?:\/\//, '');
  const body = req.includes('\n\n') ? req.slice(req.indexOf('\n\n') + 2).trim() : '';
  return { method, path, host, body };
}

const clock = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
};

export class BurpWindow {
  /** @param {{ data: object, onSend: (line: string) => ({ discovered?: string }) }} o */
  constructor(o) {
    this.o = o;
    this.data = o.data;
    this.tab = 'Proxy';
    this.ptab = 'HTTP history';
    this.hist = this.data.history.map((r) => ({ ...r }));  // own copy: forwarded requests are appended per game
    this.sel = this.hist.length - 1;
    this.icOn = false;
    this.held = [];           // intercepted requests waiting for Forward / Drop: { host, method, url, req, time }
    this.status = '';
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
    const inEdit = e.target?.tagName === 'TEXTAREA';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && this.tab === 'Proxy') {
      e.preventDefault();
      if (this.ptab === 'Intercept') this.heldToRepeater(); else this.toRepeater(this.sel);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && this.tab === 'Repeater') { e.preventDefault(); this.send(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && this.tab === 'Proxy' && this.ptab === 'Intercept') { e.preventDefault(); this.forward(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't' && this.tab === 'Proxy' && !inEdit) { e.preventDefault(); this.toggleIntercept(); }
  }

  render() {
    clear(this.mainTabs);
    for (const t of MAIN_TABS) {
      const live = t === 'Proxy' || t === 'Repeater';
      this.mainTabs.append(h('button', { type: 'button', role: 'tab', class: `bp-mtab${t === this.tab ? ' on' : ''}`, 'data-tab': t, 'aria-selected': String(t === this.tab), disabled: live ? null : '', onclick: () => { this.tab = t; this.render(); } }, t));
    }
    clear(this.view);
    if (this.tab === 'Repeater') this.view.append(this.repeaterView());
    else this.view.append(this.ptab === 'Intercept' ? this.interceptView() : this.proxyView());
  }

  proxySub() {
    return h('div', { class: 'bp-sub' }, PROXY_TABS.map((t) => {
      const on = t === this.ptab;
      const label = t === 'Intercept' && this.held.length ? `Intercept (${this.held.length})` : t;
      return LIVE_PROXY_TABS.includes(t)
        ? h('button', { type: 'button', class: `bp-stab${on ? ' on' : ''}`, 'data-ptab': t, onclick: () => { this.ptab = t; this.render(); } }, label)
        : h('span', { class: 'bp-stab' }, t);
    }));
  }

  proxyView() {
    const filter = h('div', { class: 'bp-filter' }, h('span', { class: 'bp-funnel', 'aria-hidden': 'true' }, '⧩'), 'Filter settings: Hiding CSS, image and general binary content');
    const cols = ['#', 'Host', 'Method', 'URL', 'Params', 'Edited', 'Status code', 'Length', 'MIME type', 'Extension', 'Title', 'TLS', 'IP'];
    const tbody = h('tbody');
    const rows = this.hist.map((r, i) => ({ ...r, n: i + 1 })).reverse();
    for (const r of rows) {
      const i = r.n - 1;
      tbody.append(h('tr', { class: i === this.sel ? 'sel' : '', 'data-row': String(r.n), onclick: () => { this.sel = i; this.render(); this.el.focus(); },
        oncontextmenu: (e) => { e.preventDefault(); this.sel = i; this.render(); this.ctx(e, i); } },
      h('td', {}, String(r.n)), h('td', {}, r.host), h('td', {}, r.method), h('td', {}, r.url), h('td', { class: 'c' }, r.params ? '✓' : ''), h('td', { class: 'c' }, r.edited ? '✓' : ''),
      h('td', {}, String(r.status)), h('td', {}, String(r.res.length)), h('td', {}, r.mime), h('td', {}, r.ext || ''), h('td', {}, r.title || ''), h('td', { class: 'c' }, r.host.startsWith('https') ? '✓' : ''), h('td', {}, r.ip)));
    }
    const table = h('div', { class: 'bp-tablewrap' }, h('table', { class: 'bp-table' }, h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', {}, i === 0 ? '# ⌄' : c)))), tbody));
    const cur = this.hist[this.sel];
    const rq = pane('Request'); rq.body.append(pretty(cur.req));
    const rs = pane('Response', h('span', { class: 'bp-ptab dim' }, 'Render')); rs.body.append(pretty(cur.res));
    return h('div', { class: 'bp-proxy' }, this.proxySub(), filter, table, h('div', { class: 'bp-split' }, rq.el, rs.el));
  }

  // --- Proxy > Intercept ------------------------------------------------------

  interceptView() {
    const cur = this.held[0];
    const bar = h('div', { class: 'bp-icbar' },
      h('button', { type: 'button', class: `bp-ictoggle${this.icOn ? ' on' : ''}`, 'data-act': 'intercept', 'aria-pressed': String(this.icOn), onclick: () => this.toggleIntercept() },
        h('span', { class: 'bp-sw', 'aria-hidden': 'true' }), this.icOn ? 'Intercept on' : 'Intercept off'),
      h('span', { class: 'bp-fwd' },
        h('button', { type: 'button', class: 'bp-fwdb', 'data-act': 'forward', disabled: cur ? null : '', onclick: () => this.forward() }, '→  Forward'),
        h('span', { class: 'bp-fwdv', 'aria-hidden': 'true' }, '⌄')),
      h('button', { type: 'button', class: 'bp-drop', 'data-act': 'drop', disabled: cur ? null : '', onclick: () => this.drop() }, 'Drop'),
      h('button', { type: 'button', class: 'bp-drop bp-open', 'data-act': 'browser', onclick: () => this.openBrowser() }, 'Open browser'));
    const tbody = h('tbody');
    this.held.forEach((x, i) => tbody.append(h('tr', { class: i === 0 ? 'sel' : '', 'data-held': String(i) },
      h('td', {}, x.time), h('td', {}, 'HTTP'), h('td', {}, '→  Request'), h('td', {}, x.host.replace(/^https?:\/\//, '')), h('td', {}, x.method), h('td', {}, x.url))));
    const table = h('div', { class: 'bp-tablewrap bp-ictable' }, h('table', { class: 'bp-table' },
      h('thead', {}, h('tr', {}, ['Time', 'Type', 'Direction', 'Host', 'Method', 'URL'].map((c) => h('th', {}, c)))), tbody));
    const req = h('div', { class: 'bp-pane bp-icreq' }, h('div', { class: 'bp-phead' }, 'Request'),
      h('div', { class: 'bp-ptabs' }, h('span', { class: 'bp-ptab' }, 'Pretty'), h('span', { class: 'bp-ptab on' }, 'Raw'), h('span', { class: 'bp-ptab' }, 'Hex')));
    if (cur) {
      this.icta = h('textarea', { class: 'bp-edit', spellcheck: 'false', 'aria-label': 'Intercepted request', oninput: (e) => { cur.req = e.target.value; } });
      this.icta.value = cur.req;
      req.append(h('div', { class: 'bp-pbody' }, this.icta));
    } else {
      this.icta = null;
      const msg = this.icOn
        ? 'Intercept is on. Requests sent by Burp\'s browser will be held here so that you can analyze and modify them before forwarding them to the target server.'
        : 'Intercept is off. Requests sent by Burp\'s browser go straight to the target and are logged in HTTP history.';
      req.append(h('div', { class: 'bp-pbody' }, h('div', { class: 'bp-icmsg' }, msg, this.status ? h('div', { class: 'bp-icstat' }, this.status) : null)));
    }
    return h('div', { class: 'bp-proxy bp-ic' }, this.proxySub(), bar, table, req);
  }

  toggleIntercept() { this.icOn = !this.icOn; this.status = ''; this.render(); }

  /** Burp's browser loads the target: with Intercept on its requests stop here, otherwise they go straight through. */
  openBrowser() {
    const reqs = this.data.intercept || [];
    if (!reqs.length) { this.status = 'Burp\'s browser opened. Nothing new to send.'; this.render(); return; }
    if (this.icOn) {
      for (const r of reqs) this.held.push({ ...r, orig: r.req, time: clock() });
      this.status = '';
    } else {
      for (const r of reqs) this.pass(r.req, r.host, false);
      this.status = `${reqs.length} request${reqs.length === 1 ? '' : 's'} went straight to the target (see HTTP history).`;
    }
    this.render();
  }

  forward() {
    const cur = this.held.shift();
    if (!cur) return;
    const req = (this.icta?.value ?? cur.req);
    const edited = req.replace(/\r/g, '').trim() !== String(cur.orig ?? cur.req).replace(/\r/g, '').trim();
    this.pass(req, cur.host, edited);
    this.render();
  }

  drop() { this.held.shift(); this.status = 'Request dropped: the browser shows a "Request was dropped by user" error.'; this.render(); }

  heldToRepeater() {
    const cur = this.held[0];
    if (!cur) return;
    this.rep.push({ req: this.icta?.value ?? cur.req, res: '', n: this.rep.length + 1, host: cur.host });
    this.repSel = this.rep.length - 1;
    this.tab = 'Repeater';
    this.render();
  }

  /** Send one request to the target (Forward, or browsing with Intercept off) and log it in HTTP history. */
  pass(raw, host, edited) {
    const x = this.exchange(raw, host);
    const { method, path } = parseReq(x.req, host);
    const known = this.hist.find((r) => r.host === host);
    const status = (x.res.match(/^HTTP\/[\d.]+ (\d+)/) || [])[1] || '';
    const ctype = (x.res.match(/^Content-Type:\s*([^;\n]+)/mi) || [])[1] || '';
    const title = (x.res.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    this.hist.push({ host, method, url: path, params: method === 'POST' || path.includes('?'), edited, status: Number(status) || status,
      mime: /json/i.test(ctype) ? 'JSON' : /html/i.test(ctype) ? 'HTML' : ctype ? 'text' : '', title, ip: known?.ip || '', req: x.req, res: x.res });
    this.sel = this.hist.length - 1;
    return x;
  }

  /** One request/response round trip. The scene turns the request into an engagement action (onSend). */
  exchange(raw, fallbackHost) {
    const req = fixLength(raw);
    const { method, path, host, body } = parseReq(req, fallbackHost);
    const line = this.data.action ? this.data.action(req) : `burp ${method} https://${host}${path} ${body}`.trim();
    const hit = line ? (this.o.onSend(line) || {}) : {};
    return { req, res: this.data.respond(req, hit), ms: 80 + ((req.length * 7) % 140) };
  }

  // --- HTTP history context menu + Repeater -----------------------------------

  ctx(e, i) {
    clear(this.menu);
    const r = this.hist[i];
    this.menu.append(h('div', { class: 'bp-ctxhead' }, `${r.host}${r.url}`),
      h('button', { type: 'button', class: 'bp-ctxi', 'data-act': 'repeater', onclick: () => { this.menu.hidden = true; this.toRepeater(i); } }, h('span', {}, 'Send to Repeater'), h('kbd', {}, 'Ctrl+R')),
      ...['Send to Intruder', 'Send to Comparer', 'Show response in browser', 'Copy URL', 'Delete item'].map((t) => h('div', { class: 'bp-ctxi dis' }, t)));
    const box = this.el.getBoundingClientRect();
    this.menu.style.left = `${Math.min(e.clientX - box.left, box.width - 230)}px`;
    this.menu.style.top = `${Math.min(e.clientY - box.top, box.height - 200)}px`;
    this.menu.hidden = false;
  }

  toRepeater(i) {
    const r = this.hist[i];
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
    const x = this.exchange(this.ta?.value ?? t.req, t.host);
    t.req = x.req;
    t.res = x.res;
    t.ms = x.ms;
    this.render();
  }
}
