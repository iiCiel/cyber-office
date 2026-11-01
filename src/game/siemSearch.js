// Chunked, cancellable, streaming search over the procedural SIEM (siemGen.js). Pure logic, no DOM.
//
//   const h = startSearch(siem, 'sourcetype=linux_secure Accepted | stats count by src_ip', {
//     from, to,                // epoch seconds (optional); maxIndex = how many events exist right now
//     onProgress(h), onDone(h) // h.scanned / h.total / h.matched while it runs
//   });
//   h.cancel();  h.mode === 'events' | 'table';  h.indices(k0, k1);  h.table = { columns, rows };
//   h.timeline = { t0, bw, counts };  h.fieldSummary() -> [{ name, count, distinct, top: [{ v, c }] }]
//
// Search terms: key=value (wildcards *), key!=v, key>n, "quoted phrase", bare words (matched in the raw text,
// case-insensitive), NOT, OR, ( ). Pipes: stats, top, rare, head, dedup, table, fields, sort, where, rename.
// Events are scanned newest-first like Splunk, so `head 10` returns the ten most recent matches.

import { fmtLocal } from './siemGen.js';

export class SearchError extends Error {}

// ---------- field access ----------
const KNOWN = ['src_ip', 'user', 'action', 'dest_port', 'dest_ip', 'src_port', 'status', 'method', 'uri', 'useragent', 'referer', 'bytes', 'EventCode', 'Account_Name', 'Logon_Type', 'Workstation_Name', 'Group_Name', 'Task_Name', 'Target_Account_Name', 'Subject_Account_Name', 'Service_Name', 'dest', 'app', 'process', 'proto', 'dir', 'iface', 'rule', 'statement', 'database', 'command', 'pwd', 'tty', 'site', 'message', 'fp', 'New_Process_Name', 'Process_Command_Line', 'Module', 'Account_Domain'];
const ALIAS = {};
for (const k of KNOWN) ALIAS[k.toLowerCase()] = k;

export function fieldValue(ev, name) {
  switch (name) {
    case 'host': return ev.host;
    case 'index': return ev.index;
    case 'source': return ev.source;
    case 'sourcetype': return ev.sourcetype;
    case '_time': return ev.t;
    case '_raw': return ev.raw;
    default: break;
  }
  const f = ev.fields;
  let v = f[name];
  if (v === undefined) { const a = ALIAS[name.toLowerCase()]; if (a) v = f[a]; }
  return v === '' ? undefined : v;
}
const PROP_FIELDS = new Set(['host', 'index', 'source', 'sourcetype', '_time']);

// ---------- tokenizer / parser ----------
function tokenize(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
    let j = i; let buf = ''; const phrase = c === '"';
    while (j < str.length && !/\s/.test(str[j]) && str[j] !== ')') {
      if (str[j] === '"') {
        j++;
        while (j < str.length && str[j] !== '"') buf += str[j++];
        if (j >= str.length) throw new SearchError('Unbalanced quotes.');
        j++;
      } else buf += str[j++];
    }
    out.push({ t: 'w', v: buf, phrase });
    i = j;
  }
  return out;
}

const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const wildRe = (pat) => new RegExp('^' + esc(pat).replace(/\*/g, '.*') + '$', 'i');

let lastEv = null; let lastLow = '';
const low = (ev) => { if (ev !== lastEv) { lastEv = ev; lastLow = ev.raw.toLowerCase(); } return lastLow; };

function fieldPred(field, op, value) {
  const num = parseFloat(value);
  const lv = value.toLowerCase();
  const wild = value.includes('*');
  const re = wild ? wildRe(value) : null;
  const eq = (v) => { const s = String(v); return re ? re.test(s) : (s === value || s.toLowerCase() === lv); };
  let fn;
  switch (op) {
    case '=': fn = (ev) => { const v = fieldValue(ev, field); return v !== undefined && eq(v); }; break;
    case '!=': fn = (ev) => { const v = fieldValue(ev, field); return v === undefined || !eq(v); }; break;
    default: fn = (ev) => {
      const v = fieldValue(ev, field); if (v === undefined) return false;
      const x = typeof v === 'number' ? v : parseFloat(v); if (Number.isNaN(x) || Number.isNaN(num)) return false;
      return op === '>' ? x > num : op === '<' ? x < num : op === '>=' ? x >= num : x <= num;
    };
  }
  fn.cost = PROP_FIELDS.has(field) ? 0 : 1;
  return fn;
}
function rawPred(word) {
  const w = word.toLowerCase();
  let fn;
  if (w.includes('*')) { const re = new RegExp(esc(w).replace(/\*/g, '.*'), 'i'); fn = (ev) => re.test(ev.raw); } else fn = (ev) => low(ev).includes(w);
  fn.cost = 2;
  return fn;
}

export function parseSearch(str) {
  const tokens = tokenize(str);
  let pos = 0;
  const peek = () => tokens[pos];
  const isW = (tk, v) => tk && tk.t === 'w' && !tk.phrase && tk.v === v;
  const orExpr = () => {
    const parts = [unary()];
    while (isW(peek(), 'OR')) { pos++; parts.push(unary()); }
    if (parts.length === 1) return parts[0];
    const fn = (ev) => { for (let k = 0; k < parts.length; k++) if (parts[k](ev)) return true; return false; };
    fn.cost = Math.max(...parts.map((p) => p.cost));
    return fn;
  };
  const andExpr = (stopAtParen) => {
    const parts = [];
    while (peek() && !(peek().t === ')' && stopAtParen)) {
      if (peek().t === ')') throw new SearchError('Unbalanced parentheses.');
      if (isW(peek(), 'AND')) { pos++; continue; }
      parts.push(orExpr());
    }
    if (!parts.length) return Object.assign(() => true, { cost: 0 });
    parts.sort((a, b) => a.cost - b.cost);
    if (parts.length === 1) return parts[0];
    const fn = (ev) => { for (let k = 0; k < parts.length; k++) if (!parts[k](ev)) return false; return true; };
    fn.cost = parts[parts.length - 1].cost;
    return fn;
  };
  const unary = () => {
    const tk = peek();
    if (!tk) throw new SearchError('Unable to parse the search: missing search term.');
    if (tk.t === '(') {
      pos++;
      const inner = andExpr(true);
      if (!peek() || peek().t !== ')') throw new SearchError('Unbalanced parentheses.');
      pos++;
      return inner;
    }
    pos++;
    if (isW(tk, 'NOT')) {
      if (!peek()) throw new SearchError('Unable to parse the search: NOT needs a term.');
      const inner = unary();
      const fn = (ev) => !inner(ev); fn.cost = inner.cost; return fn;
    }
    if (!tk.phrase) {
      const m = tk.v.match(/^([A-Za-z_][\w.]*)(!=|>=|<=|=|>|<)(.*)$/);
      if (m) return fieldPred(m[1], m[2], m[3]);
    }
    return rawPred(tk.v);
  };
  const fn = andExpr(false);
  if (pos < tokens.length) throw new SearchError('Unbalanced parentheses.');
  return fn;
}

// ---------- pipe parsing ----------
export function splitPipes(q) {
  const out = []; let cur = ''; let quote = false;
  for (const ch of q) {
    if (ch === '"') quote = !quote;
    if (ch === '|' && !quote) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function words(str) {
  const out = []; let cur = ''; let quote = false; let has = false;
  for (const ch of str) {
    if (ch === '"') { quote = !quote; has = true; } else if ((/\s/.test(ch) || ch === ',') && !quote) { if (cur || has) out.push(cur); cur = ''; has = false; } else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

function parseAgg(args) {
  const m = args.match(/^(.*?)(?:\s+by\s+(.*))?$/i);
  const aggStr = m[1].trim(); const by = m[2] ? words(m[2]) : [];
  const aggs = [];
  const re = /(count|dc|sum|avg|min|max|values)(?:\(([^)]*)\))?(?:\s+as\s+(\w+))?/gi;
  let mm; let any = false;
  while ((mm = re.exec(aggStr))) {
    any = true;
    const fn = mm[1].toLowerCase(); const f = mm[2] ? mm[2].trim() : null;
    if (fn !== 'count' && !f) throw new SearchError(`Error in 'stats' command: The function '${fn}' needs a field.`);
    aggs.push({ fn, field: f, name: mm[3] || (fn === 'count' && !f ? 'count' : `${fn}(${f || ''})`) });
  }
  if (!any) throw new SearchError("Error in 'stats' command: You must specify a statistical function (count, dc, sum, avg, min, max, values).");
  return { aggs, by };
}

function parsePipes(stages) {
  const events = []; // streaming per-event stages
  let terminal = { type: 'events' };
  const post = []; // table stages
  for (const s of stages) {
    const sp = s.indexOf(' ');
    const cmd = (sp < 0 ? s : s.slice(0, sp)).toLowerCase();
    const args = sp < 0 ? '' : s.slice(sp + 1).trim();
    const inTable = terminal.type !== 'events';
    switch (cmd) {
      case 'head': {
        const n = parseInt(args.replace(/^limit=/i, ''), 10); const lim = Number.isNaN(n) ? 10 : n;
        if (inTable || terminal.type === 'tablecmd') post.push({ cmd: 'head', n: lim }); else events.push({ cmd: 'head', n: lim });
        break;
      }
      case 'dedup': if (inTable) throw new SearchError("Error in 'dedup' command: dedup must come before stats/top/table."); events.push({ cmd: 'dedup', fields: words(args) }); break;
      case 'stats': if (inTable) throw new SearchError("Error in 'stats' command: only one stats/top/rare/table is supported per search."); terminal = { type: 'stats', ...parseAgg(args) }; break;
      case 'top': case 'rare': {
        if (inTable) throw new SearchError(`Error in '${cmd}' command: only one stats/top/rare/table is supported per search.`);
        let limit = 10; const w = words(args).filter((x) => { const m = x.match(/^limit=(\d+)$/i); if (m) { limit = +m[1]; return false; } return !/^(showperc|showcount)=/i.test(x); });
        if (!w.length) throw new SearchError(`Error in '${cmd}' command: a field name is required.`);
        terminal = { type: cmd, field: w[0], limit };
        break;
      }
      case 'table': case 'fields': {
        const cols = words(args).filter((x) => x !== '-' && x !== '+');
        if (!cols.length) throw new SearchError(`Error in '${cmd}' command: at least one field is required.`);
        if (inTable) post.push({ cmd: 'columns', cols }); else terminal = { type: 'table', cols };
        break;
      }
      case 'sort': {
        if (!inTable && terminal.type === 'events') throw new SearchError("Error in 'sort' command: sort works on a table. Aggregate first with stats, top or table.");
        const keys = []; let limit = Infinity;
        for (const w of words(args)) {
          const lm = w.match(/^limit=(\d+)$/i); if (lm) { limit = +lm[1] || Infinity; continue; }
          if (/^\d+$/.test(w)) { limit = +w || Infinity; continue; }
          if (w === '-' || w === '+') { keys.push({ f: null, desc: w === '-' }); continue; }
          let desc = false; let f = w;
          if (keys.length && keys[keys.length - 1].f === null) { desc = keys.pop().desc; } else if (w[0] === '-') { desc = true; f = w.slice(1); } else if (w[0] === '+') f = w.slice(1);
          keys.push({ f, desc });
        }
        if (!keys.length) throw new SearchError("Error in 'sort' command: a field is required.");
        post.push({ cmd: 'sort', keys, limit });
        break;
      }
      case 'where': {
        if (!inTable && terminal.type === 'events') throw new SearchError("Error in 'where' command: where works on a table here. Aggregate first with stats, top or table.");
        post.push({ cmd: 'where', test: parseWhere(args) });
        break;
      }
      case 'rename': {
        const m = args.match(/^(\S+)\s+as\s+(\S+)$/i);
        if (!m) throw new SearchError("Error in 'rename' command: usage is rename <field> as <new>.");
        post.push({ cmd: 'rename', from: m[1], to: m[2].replace(/"/g, '') });
        break;
      }
      default:
        throw new SearchError(`Error in '${cmd}' command: Unknown search command '${cmd}'.`);
    }
  }
  return { events, terminal, post };
}

function parseWhere(str) {
  const ors = str.split(/\s+OR\s+/i).map((o) => o.split(/\s+AND\s+/i).map((c) => {
    const m = c.trim().match(/^(\S+?)\s*(!=|>=|<=|=|>|<)\s*"?(.*?)"?$/);
    if (!m) throw new SearchError(`Error in 'where' command: cannot parse "${c}".`);
    return { f: m[1], op: m[2], v: m[3] };
  }));
  return (row, cols) => ors.some((ands) => ands.every(({ f, op, v }) => {
    const idx = cols.indexOf(f); if (idx < 0) return false;
    const a = row[idx]; const x = parseFloat(a); const y = parseFloat(v);
    const numeric = !Number.isNaN(x) && !Number.isNaN(y);
    switch (op) {
      case '=': return numeric ? x === y : String(a).toLowerCase() === v.toLowerCase();
      case '!=': return numeric ? x !== y : String(a).toLowerCase() !== v.toLowerCase();
      case '>': return numeric ? x > y : String(a) > v;
      case '<': return numeric ? x < y : String(a) < v;
      case '>=': return numeric ? x >= y : String(a) >= v;
      default: return numeric ? x <= y : String(a) <= v;
    }
  }));
}

// ---------- aggregation ----------
class Group {
  constructor(aggs, key) { this.key = key; this.n = 0; this.st = aggs.map((a) => (a.fn === 'dc' || a.fn === 'values' ? new Set() : a.fn === 'min' ? Infinity : a.fn === 'max' ? -Infinity : 0)); this.cnt = aggs.map(() => 0); }
}
function statsAdd(t, ev) {
  let key;
  if (t.by.length === 1) { const v = fieldValue(ev, t.by[0]); if (v === undefined) return; key = String(v); } else if (t.by.length) {
    key = '';
    for (let k = 0; k < t.by.length; k++) { const v = fieldValue(ev, t.by[k]); if (v === undefined) return; key += (k ? '\u0001' : '') + v; }
  } else key = '';
  let g = t.groups.get(key);
  if (!g) { g = new Group(t.aggs, key); t.groups.set(key, g); }
  g.n++;
  for (let a = 0; a < t.aggs.length; a++) {
    const ag = t.aggs[a]; if (ag.fn === 'count') continue;
    const v = fieldValue(ev, ag.field); if (v === undefined) continue;
    switch (ag.fn) {
      case 'dc': g.st[a].add(String(v)); break;
      case 'values': if (g.st[a].size < 200) g.st[a].add(String(v)); break;
      case 'sum': case 'avg': { const x = typeof v === 'number' ? v : parseFloat(v); if (!Number.isNaN(x)) { g.st[a] += x; g.cnt[a]++; } break; }
      case 'min': { const x = parseFloat(v); if (!Number.isNaN(x) && x < g.st[a]) g.st[a] = x; break; }
      case 'max': { const x = parseFloat(v); if (!Number.isNaN(x) && x > g.st[a]) g.st[a] = x; break; }
      default: break;
    }
  }
}
function statsTable(t) {
  const columns = [...t.by, ...t.aggs.map((a) => a.name)];
  let groups = [...t.groups.values()];
  if (!t.by.length && !groups.length) groups = [new Group(t.aggs, '')];
  const numeric = t.by.length === 1 && groups.every((g) => /^-?\d+(\.\d+)?$/.test(g.key));
  groups.sort((a, b) => (numeric ? a.key - b.key : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const rows = groups.map((g) => {
    const keyParts = t.by.length > 1 ? g.key.split('\u0001') : t.by.length ? [g.key] : [];
    const vals = t.aggs.map((a, i) => {
      switch (a.fn) {
        case 'count': return g.n;
        case 'dc': return g.st[i].size;
        case 'values': return [...g.st[i]].sort().join(' ');
        case 'sum': return Math.round(g.st[i] * 1000) / 1000;
        case 'avg': return g.cnt[i] ? Math.round((g.st[i] / g.cnt[i]) * 1000) / 1000 : '';
        default: return Number.isFinite(g.st[i]) ? g.st[i] : '';
      }
    });
    return [...keyParts, ...vals];
  });
  return { columns, rows };
}

function applyPost(table, post) {
  let { columns, rows } = table;
  for (const st of post) {
    if (st.cmd === 'head') rows = rows.slice(0, st.n);
    else if (st.cmd === 'columns') { const idx = st.cols.map((c) => columns.indexOf(c)); rows = rows.map((r) => idx.map((x) => (x < 0 ? '' : r[x]))); columns = st.cols; } else if (st.cmd === 'rename') { columns = columns.map((c) => (c === st.from ? st.to : c)); } else if (st.cmd === 'where') { const cols = columns; rows = rows.filter((r) => st.test(r, cols)); } else if (st.cmd === 'sort') {
      const ks = st.keys.map((k) => ({ i: columns.indexOf(k.f), desc: k.desc })).filter((k) => k.i >= 0);
      rows = rows.slice().sort((a, b) => {
        for (const k of ks) {
          const x = a[k.i]; const y = b[k.i]; const nx = parseFloat(x); const ny = parseFloat(y);
          const c = !Number.isNaN(nx) && !Number.isNaN(ny) && String(nx) === String(x).trim() ? nx - ny : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
          if (c) return k.desc ? -c : c;
        }
        return 0;
      });
      if (Number.isFinite(st.limit)) rows = rows.slice(0, st.limit);
    }
  }
  return { columns, rows };
}

// ---------- the search job ----------
const schedule = (fn) => {
  if (typeof MessageChannel !== 'undefined') {
    const c = new MessageChannel();
    c.port1.onmessage = () => { c.port1.onmessage = null; c.port1.close(); fn(); };
    c.port2.postMessage(0);
  } else setTimeout(fn, 0);
};
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const CHUNK = 65536;

export function startSearch(siem, query, opts = {}) {
  const { onProgress = () => {}, onDone = () => {}, sync = false, sliceMs = 24, buckets = 60, sampleSize = 4000 } = opts;
  const maxIndex = Math.min(opts.maxIndex ?? siem.total, siem.total + 100000000);
  const lo = opts.from != null ? Math.max(0, siem.indexAtTime(opts.from)) : 0;
  const hi = Math.min(maxIndex, opts.to != null ? siem.indexAtTime(opts.to) : maxIndex);
  const h = {
    query, state: 'running', mode: 'events', scanned: 0, total: Math.max(0, hi - lo), matched: 0, error: null, table: null, timeline: null,
    startedAt: nowMs(), elapsedMs: 0, lo, hi, chunks: [], limitReached: false,
    cancel() { if (h.state === 'running') { h.state = 'canceled'; h.elapsedMs = nowMs() - h.startedAt; } },
    indices(k0, k1) { const out = []; const end = Math.min(k1, h.collected); for (let k = k0; k < end; k++) out.push(h.chunks[(k / CHUNK) | 0][k % CHUNK]); return out; },
    event(k) { return siem.get(h.chunks[(k / CHUNK) | 0][k % CHUNK]); },
    fieldSummary: () => summarize(h),
    collected: 0, fields: new Map(), sampled: 0,
  };
  let pred; let plan; let pipes;
  try {
    pipes = splitPipes(String(query || '').trim());
    let first = pipes.shift();
    first = first.replace(/^search\s+/i, '');
    pred = parseSearch(first);
    plan = parsePipes(pipes.filter((p) => p));
  } catch (e) {
    if (!(e instanceof SearchError)) throw e;
    h.state = 'error'; h.error = e.message;
    Promise.resolve().then(() => onDone(h));
    return h;
  }
  const term = plan.terminal;
  h.mode = term.type === 'events' ? 'events' : 'table';
  const stages = plan.events;
  const dedups = stages.map((s) => (s.cmd === 'dedup' ? new Set() : null));
  const heads = stages.map(() => 0);
  const bw = Math.max(1, Math.ceil(Math.max(1, (siem.tOf(Math.max(lo, hi - 1)) - siem.tOf(lo)) + 1) / buckets));
  const t0 = siem.tOf(lo);
  const counts = new Array(Math.ceil((siem.tOf(Math.max(lo, hi - 1)) - t0 + 1) / bw) || 1).fill(0);
  h.timeline = { t0, bw, counts };
  let cursor = hi; // descending
  const st = { groups: new Map(), by: term.by || [], aggs: term.aggs || [] };
  const tally = new Map(); const rows = [];
  const tcols = term.cols;

  const pass = (ev) => {
    for (let s = 0; s < stages.length; s++) {
      const sg = stages[s];
      if (sg.cmd === 'head') { if (++heads[s] > sg.n) return false; } else {
        let key = '';
        for (const f of sg.fields) { const v = fieldValue(ev, f); if (v === undefined) return false; key += v + '\u0001'; }
        if (dedups[s].has(key)) return false;
        dedups[s].add(key);
      }
    }
    return true;
  };
  const headLimit = stages.reduce((m, sg) => (sg.cmd === 'head' ? Math.min(m, sg.n) : m), Infinity);
  const onlyHeads = stages.every((sg) => sg.cmd === 'head');

  const sample = (ev) => {
    if (h.sampled >= sampleSize) return;
    h.sampled++;
    const add = (name, v) => {
      let e = h.fields.get(name); if (!e) { e = { count: 0, vals: new Map() }; h.fields.set(name, e); }
      e.count++;
      const s = String(v); const c = e.vals.get(s);
      if (c !== undefined) e.vals.set(s, c + 1); else if (e.vals.size < 400) e.vals.set(s, 1);
    };
    add('host', ev.host); add('source', ev.source); add('sourcetype', ev.sourcetype);
    for (const k in ev.fields) { const v = ev.fields[k]; if (v !== '' && v !== undefined) add(k, v); }
  };

  const finish = () => {
    if (h.state !== 'running') return;
    if (term.type === 'stats') h.table = applyPost(statsTable(st), plan.post);
    else if (term.type === 'top' || term.type === 'rare') {
      let totalN = 0; for (const c of tally.values()) totalN += c;
      let arr = [...tally.entries()].sort((a, b) => (term.type === 'top' ? b[1] - a[1] : a[1] - b[1]) || (a[0] < b[0] ? -1 : 1));
      if (term.limit) arr = arr.slice(0, term.limit);
      h.table = applyPost({ columns: [term.field, 'count', 'percent'], rows: arr.map(([v, c]) => [v, c, ((c * 100) / totalN).toFixed(6)]) }, plan.post);
    } else if (term.type === 'table') h.table = applyPost({ columns: tcols, rows }, plan.post);
    h.state = 'done'; h.elapsedMs = nowMs() - h.startedAt;
    h.scanned = h.total - Math.max(0, cursor - lo) > h.total ? h.total : h.scanned;
    onProgress(h);
    onDone(h);
  };

  const slice = () => {
    if (h.state !== 'running') return;
    const stop = nowMs() + sliceMs;
    let n = 0;
    while (cursor > lo) {
      const ev = siem.get(--cursor);
      h.scanned++;
      if (pred(ev)) {
        h.matched++;
        const b = ((ev.t - t0) / bw) | 0; if (b >= 0 && b < counts.length) counts[b]++;
        if (h.sampled < sampleSize) sample(ev);
        if (pass(ev)) {
          switch (term.type) {
            case 'events': {
              const c = h.collected; let ch = h.chunks[(c / CHUNK) | 0]; if (!ch) { ch = new Int32Array(CHUNK); h.chunks.push(ch); }
              ch[c % CHUNK] = ev.i; h.collected = c + 1; break;
            }
            case 'stats': statsAdd(st, ev); break;
            case 'top': case 'rare': { const v = fieldValue(ev, term.field); if (v !== undefined) { const k = String(v); tally.set(k, (tally.get(k) || 0) + 1); } break; }
            case 'table': if (rows.length < 10000) rows.push(tcols.map((c) => { const v = fieldValue(ev, c); return c === '_time' ? fmtLocal(v) : v === undefined ? '' : v; })); break;
            default: break;
          }
          if (onlyHeads && headLimit !== Infinity && h.matched >= headLimit) { h.limitReached = true; cursor = lo; break; }
        } else if (onlyHeads && headLimit !== Infinity) { h.limitReached = true; cursor = lo; break; }
      }
      if ((++n & 1023) === 0 && !sync && nowMs() > stop) break;
    }
    if (cursor <= lo) { if (h.limitReached) h.scanned = h.total; finish(); return; }
    h.elapsedMs = nowMs() - h.startedAt;
    onProgress(h);
    schedule(slice);
  };
  if (sync) { slice(); } else schedule(slice);
  return h;
}

function summarize(h) {
  const rowsOut = [];
  for (const [name, e] of h.fields) {
    const top = [...e.vals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v, c]) => ({ v, c }));
    rowsOut.push({ name, count: e.count, distinct: e.vals.size, capped: e.vals.size >= 400, top, sampled: h.sampled });
  }
  const sel = { host: 0, source: 1, sourcetype: 2 };
  rowsOut.sort((a, b) => ((a.name in sel ? sel[a.name] : 9) - (b.name in sel ? sel[b.name] : 9)) || b.count - a.count || (a.name < b.name ? -1 : 1));
  return rowsOut;
}
