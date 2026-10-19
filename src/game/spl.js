// A small subset of Splunk's Search Processing Language (SPL), enough to feel like the real thing:
//
//   Search:   index=aws sourcetype=aws:cloudtrail eventName=ListBuckets NOT userIdentity.type=Root
//             "failed password"   4625   src_ip=10.0.4.* OR src_ip=203.0.113.17   bytes>1000000   (a OR b) c
//             a word with no field is matched anywhere in the event (case-insensitive, * is a wildcard);
//             -word still works as "NOT word".
//   Pipes:    | stats count by user, src_ip     | stats dc(src_ip) as ips values(user) by host
//             | top limit=5 Account_Name        | rare eventName      | table _time host user
//             | sort - count   | head 10   | tail 5   | dedup user   | where count>5   | rename a as b   | fields a b
//
// Pure logic (no DOM), unit tested. Errors read like Splunk's own: Error in 'foo' command: ...

import { searchText } from './siemfmt.js';

export class SplError extends Error {}

// ---------- tokenizing ----------
function tokenize(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
    let j = i;
    let quoted = false;
    let buf = '';
    while (j < str.length && !/\s/.test(str[j]) && str[j] !== ')' && !(str[j] === '(' && j > i)) {
      if (str[j] === '"') {
        quoted = true;
        j++;
        while (j < str.length && str[j] !== '"') buf += str[j++];
        if (j >= str.length) throw new SplError("Unbalanced quotes.");
        j++;
      } else buf += str[j++];
    }
    out.push({ t: 'word', v: buf, quoted });
    i = j;
  }
  return out;
}

// Pipe arguments: whitespace-separated, quotes honored, parentheses kept inside words (dc(src_ip)).
function words(str) {
  const out = [];
  let cur = '';
  let quote = false;
  let has = false;
  for (const ch of str) {
    if (ch === '"') { quote = !quote; has = true; } else if (/\s/.test(ch) && !quote) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

// ---------- field access ----------
const norm = (s) => String(s).toLowerCase();

/** All values of a field on an event (always an array). Case-insensitive on the field name. */
export function getField(e, name) {
  const n = norm(name);
  if (n === 'host') return [e.host];
  if (n === 'index') return [e.index];
  if (n === 'sourcetype') return [e.sourcetype];
  if (n === 'source') return [e.srcpath];
  if (n === '_raw') return [e.raw];
  if (n === '_time') return [e.splunkTime];
  if (n === 'linecount') return [String(e.linecount)];
  if (n === 'splunk_server') return ['splunk-idx01'];
  if (e._fl === undefined) {
    e._fl = {};
    for (const [k, v] of Object.entries(e.fields || {})) e._fl[norm(k)] = [].concat(v);
  }
  return e._fl[n] || [];
}

const wild = (pat) => new RegExp(`^${String(pat).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');

function compare(op, a, b) {
  const x = parseFloat(a);
  const y = parseFloat(b);
  const numeric = !Number.isNaN(x) && !Number.isNaN(y);
  switch (op) {
    case '=': return wild(b).test(String(a));
    case '!=': return !wild(b).test(String(a));
    case '>': return numeric ? x > y : String(a) > String(b);
    case '<': return numeric ? x < y : String(a) < String(b);
    case '>=': return numeric ? x >= y : String(a) >= String(b);
    case '<=': return numeric ? x <= y : String(a) <= String(b);
    default: return false;
  }
}

// ---------- the search expression ----------
function parseExpr(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const orExpr = () => {
    const parts = [andExpr()];
    while (peek() && peek().t === 'word' && !peek().quoted && peek().v === 'OR') { pos++; parts.push(andExpr()); }
    return parts.length === 1 ? parts[0] : (e) => parts.some((p) => p(e));
  };
  const andExpr = () => {
    const parts = [];
    while (peek() && peek().t !== ')' && !(peek().t === 'word' && !peek().quoted && peek().v === 'OR')) parts.push(unary());
    if (!parts.length) throw new SplError("Unable to parse the search: missing search term.");
    return parts.length === 1 ? parts[0] : (e) => parts.every((p) => p(e));
  };
  const unary = () => {
    const tk = peek();
    if (tk.t === '(') {
      pos++;
      const inner = orExpr();
      if (!peek() || peek().t !== ')') throw new SplError('Unbalanced parentheses.');
      pos++;
      return inner;
    }
    pos++;
    if (!tk.quoted && tk.v === 'NOT') {
      if (!peek()) throw new SplError("Unable to parse the search: NOT needs a term.");
      const inner = unary();
      return (e) => !inner(e);
    }
    if (!tk.quoted && tk.v.length > 1 && tk.v.startsWith('-')) {
      const w = norm(tk.v.slice(1));
      return (e) => !searchText(e).includes(w);
    }
    const m = !tk.quoted && tk.v.match(/^([A-Za-z_][\w.{}:-]*?)(!=|>=|<=|=|>|<)(.*)$/);
    if (m) {
      const [, field, op, value] = m;
      const literal = norm(`${field}=${value}`);
      return (e) => {
        const vals = getField(e, field);
        if (op === '!=') return vals.length === 0 || vals.every((v) => compare(op, v, value));
        if (vals.some((v) => compare(op, v, value))) return true;
        // Forgiving beyond real Splunk: text like reason=USER_APPROVED also matches the compact line "reason=USER_APPROVED_PUSH".
        return op === '=' && !value.includes('*') && searchText(e).includes(literal);
      };
    }
    const word = norm(tk.v);
    if (word.includes('*')) {
      const re = new RegExp(word.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
      return (e) => re.test(searchText(e));
    }
    return (e) => searchText(e).includes(word);
  };
  if (!tokens.length) return () => true;
  const fn = orExpr();
  if (pos < tokens.length) throw new SplError('Unbalanced parentheses.');
  return fn;
}

// ---------- pipes ----------
const asTable = (columns, rows) => ({ columns, rows });
const cell = (v) => (Array.isArray(v) ? v.join('\n') : v == null ? '' : String(v));

function evVal(e, f) {
  const v = getField(e, f);
  return v.length ? v : [];
}

function stats(args, input) {
  // stats <agg> [as name] [<agg> ...] [by f1,f2]
  const byIdx = args.findIndex((a, i) => a.toLowerCase() === 'by' && i > 0);
  const aggArgs = byIdx < 0 ? args : args.slice(0, byIdx);
  const by = byIdx < 0 ? [] : args.slice(byIdx + 1).join(' ').split(/[\s,]+/).filter(Boolean);
  const aggs = [];
  for (let i = 0; i < aggArgs.length; i++) {
    const a = aggArgs[i].replace(/,$/, '');
    if (!a) continue;
    const m = a.match(/^(count|dc|sum|avg|min|max|values|list|first|last|distinct_count)(?:\(([^)]*)\))?$/i);
    if (!m) throw new SplError(`Error in 'stats' command: The argument '${a}' is invalid.`);
    let name = m[2] ? `${m[1].toLowerCase()}(${m[2]})` : m[1].toLowerCase();
    if (aggArgs[i + 1]?.toLowerCase() === 'as' && aggArgs[i + 2]) { name = aggArgs[i + 2].replace(/,$/, ''); i += 2; }
    aggs.push({ fn: m[1].toLowerCase().replace('distinct_count', 'dc'), field: m[2], name });
  }
  if (!aggs.length) throw new SplError("Error in 'stats' command: The argument list must have at least one aggregate.");
  const groups = new Map();
  for (const e of input) {
    const keyVals = by.map((f) => evVal(e, f)[0]);
    if (by.length && keyVals.some((v) => v === undefined)) continue; // like Splunk: events missing the by-field are dropped
    const key = keyVals.join('\u0001');
    if (!groups.has(key)) groups.set(key, { keyVals, evs: [] });
    groups.get(key).evs.push(e);
  }
  const rows = [...groups.values()].map((g) => {
    const row = Object.fromEntries(by.map((f, i) => [f, g.keyVals[i]]));
    for (const a of aggs) {
      const vals = a.field ? g.evs.flatMap((e) => evVal(e, a.field)) : [];
      const nums = vals.map(parseFloat).filter((n) => !Number.isNaN(n));
      switch (a.fn) {
        case 'count': row[a.name] = a.field ? vals.length : g.evs.length; break;
        case 'dc': row[a.name] = new Set(vals).size; break;
        case 'sum': row[a.name] = nums.reduce((x, y) => x + y, 0); break;
        case 'avg': row[a.name] = nums.length ? Math.round((nums.reduce((x, y) => x + y, 0) / nums.length) * 1e6) / 1e6 : ''; break;
        case 'min': row[a.name] = nums.length ? Math.min(...nums) : ''; break;
        case 'max': row[a.name] = nums.length ? Math.max(...nums) : ''; break;
        case 'values': row[a.name] = [...new Set(vals)].sort(); break;
        case 'list': row[a.name] = vals; break;
        case 'first': row[a.name] = vals[0] ?? ''; break;
        case 'last': row[a.name] = vals[vals.length - 1] ?? ''; break;
        default: break;
      }
    }
    return row;
  });
  return asTable([...by, ...aggs.map((a) => a.name)], rows);
}

function top(args, input, rare) {
  let limit = 10;
  const fields = [];
  for (const a of args) {
    const m = a.match(/^limit=(\d+)$/i);
    if (m) limit = Number(m[1]);
    else if (!/^(showperc|showcount|countfield|percentfield)=/i.test(a)) fields.push(...a.split(',').filter(Boolean));
  }
  if (!fields.length) throw new SplError(`Error in '${rare ? 'rare' : 'top'}' command: Missing a field list.`);
  const counts = new Map();
  let total = 0;
  for (const e of input) {
    const vals = fields.map((f) => evVal(e, f)[0]);
    if (vals.some((v) => v === undefined)) continue;
    const k = vals.join('\u0001');
    counts.set(k, { vals, n: (counts.get(k)?.n || 0) + 1 });
    total++;
  }
  let list = [...counts.values()].sort((a, b) => (rare ? a.n - b.n : b.n - a.n));
  if (limit) list = list.slice(0, limit);
  return asTable([...fields, 'count', 'percent'], list.map((g) => ({ ...Object.fromEntries(fields.map((f, i) => [f, g.vals[i]])), count: g.n, percent: Math.round((g.n / total) * 1e6) / 1e4 })));
}

const toRows = (input) => input; // events are rows too (see runPipe)

function tableOf(input, fields) {
  return asTable(fields, input.map((e) => Object.fromEntries(fields.map((f) => [f, cell(evVal(e, f))]))));
}

function sortCmd(args, input) {
  const keys = [];
  const rest = args.join(' ').split(',').flatMap((s) => s.trim().split(/\s+/)).filter(Boolean);
  for (let i = 0; i < rest.length; i++) {
    let a = rest[i];
    let desc = false;
    if (a === '-' || a === '+') { desc = a === '-'; a = rest[++i]; } else if (a.startsWith('-') || a.startsWith('+')) { desc = a.startsWith('-'); a = a.slice(1); }
    if (rest[i + 1]?.toLowerCase() === 'desc') { desc = true; i++; } else if (rest[i + 1]?.toLowerCase() === 'asc') i++;
    if (!a) throw new SplError("Error in 'sort' command: Missing a field list.");
    keys.push({ f: a, desc });
  }
  if (!keys.length) throw new SplError("Error in 'sort' command: Missing a field list.");
  const val = (row, f) => (row._isEvent ? evVal(row, f)[0] : row[f]);
  return [...input].sort((a, b) => {
    for (const { f, desc } of keys) {
      const x = val(a, f);
      const y = val(b, f);
      const nx = parseFloat(x);
      const ny = parseFloat(y);
      const c = !Number.isNaN(nx) && !Number.isNaN(ny) && String(nx) === String(x).trim() ? nx - ny : String(x ?? '').localeCompare(String(y ?? ''));
      if (c) return desc ? -c : c;
    }
    return 0;
  });
}

function whereCmd(args, rows) {
  const m = args.join(' ').match(/^(\S+?)\s*(!=|>=|<=|=|>|<)\s*"?([^"]*)"?$/);
  if (!m) throw new SplError("Error in 'where' command: only 'field <op> value' is supported here.");
  const [, f, op, v] = m;
  return rows.filter((r) => (r._isEvent ? evVal(r, f) : [r[f]]).some((x) => compare(op === '=' ? '=' : op, x, v)));
}

/**
 * Run a full search string over events.
 * @returns {{ events: object[], table: null|{columns:string[], rows:object[]}, error: string|null, commands: string[] }}
 *   events = the events after the search part (and any event-preserving pipes); table = set when a pipe made statistics.
 */
export function runSearch(query, all) {
  const q = String(query || '').trim().replace(/^search\s+/i, '');
  const pipes = splitPipes(q);
  const base = pipes.shift();
  const out = { events: [], table: null, error: null, commands: [] };
  let events;
  try {
    const match = parseExpr(tokenize(base));
    events = all.filter(match);
  } catch (err) {
    if (err instanceof SplError) return { ...out, error: err.message };
    throw err;
  }
  let table = null;
  try {
    for (const raw of pipes) {
      const toks = words(raw);
      const cmd = (toks.shift() || '').toLowerCase();
      if (!cmd) throw new SplError("Error in 'SearchParser': Missing a search command before '|'.");
      out.commands.push(cmd);
      const rows = table ? table.rows : events.map((e) => Object.assign(e, { _isEvent: true }));
      switch (cmd) {
        case 'stats': table = stats(toks, table ? tableToPseudoEvents(table) : events); break;
        case 'top': table = top(toks, table ? tableToPseudoEvents(table) : events, false); break;
        case 'rare': table = top(toks, table ? tableToPseudoEvents(table) : events, true); break;
        case 'table': {
          const fields = toks.join(' ').split(/[\s,]+/).filter(Boolean);
          if (!fields.length) throw new SplError("Error in 'table' command: Missing a field list.");
          table = table ? asTable(fields, table.rows.map((r) => Object.fromEntries(fields.map((f) => [f, cell(r[f])])))) : tableOf(events, fields);
          break;
        }
        case 'fields': {
          const fields = toks.join(' ').split(/[\s,]+/).filter((f) => f && f !== '-' && f !== '+');
          if (table) table = asTable(table.columns.filter((c) => (toks[0] === '-' ? !fields.includes(c) : fields.includes(c))), table.rows);
          else table = tableOf(events, fields);
          break;
        }
        case 'head':
        case 'tail': {
          const n = toks[0] && /^\d+$/.test(toks[0]) ? Number(toks[0]) : 10;
          if (table) table = asTable(table.columns, cmd === 'head' ? table.rows.slice(0, n) : table.rows.slice(-n));
          else events = cmd === 'head' ? events.slice(0, n) : events.slice(-n);
          break;
        }
        case 'sort': {
          if (table) table = asTable(table.columns, sortCmd(toks.filter((a) => !/^limit=/i.test(a)), rows));
          else events = sortCmd(toks.filter((a) => !/^limit=/i.test(a)), rows);
          break;
        }
        case 'dedup': {
          const fields = toks.filter((a) => !/^\d+$/.test(a)).join(' ').split(/[\s,]+/).filter(Boolean);
          const seen = new Set();
          const keep = (r) => {
            const k = fields.map((f) => (r._isEvent ? evVal(r, f)[0] : r[f])).join('\u0001');
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          };
          if (table) table = asTable(table.columns, table.rows.filter(keep));
          else events = events.filter(keep);
          break;
        }
        case 'where': {
          if (table) table = asTable(table.columns, whereCmd(toks, rows));
          else events = whereCmd(toks, rows);
          break;
        }
        case 'rename': {
          if (!table) throw new SplError("Error in 'rename' command: only works after a statistics command here.");
          const pairs = [];
          for (let i = 0; i < toks.length; i += 3) pairs.push([toks[i], toks[i + 2]]);
          const map = Object.fromEntries(pairs);
          table = asTable(table.columns.map((c) => map[c] || c), table.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [map[k] || k, v]))));
          break;
        }
        default:
          throw new SplError(`Error in 'SearchParser': Unknown search command '${cmd}'.`);
      }
    }
  } catch (err) {
    if (err instanceof SplError) return { ...out, events, error: err.message };
    throw err;
  } finally {
    for (const e of events) delete e._isEvent;
  }
  return { ...out, events, table };
}

// stats/top over a table: treat rows as events with one field per column
function tableToPseudoEvents(table) {
  return table.rows.map((r) => ({ fields: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [].concat(v)])), host: r.host, index: r.index, sourcetype: r.sourcetype, srcpath: r.source, raw: '', splunkTime: '' }));
}

function splitPipes(q) {
  const out = [];
  let cur = '';
  let quote = false;
  for (const ch of q) {
    if (ch === '"') quote = !quote;
    if (ch === '|' && !quote) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// ---------- the sidebar and the timeline ----------

/** Field summary for the sidebar: [{ name, count, distinct, pct, top: [{value, count}] }], most common first. */
export function fieldSummary(events, { skip = ['host', 'source', 'sourcetype'], limit = 60 } = {}) {
  const map = new Map();
  for (const e of events) {
    const entries = Object.entries(e.fields || {});
    entries.push(['index', [e.index]], ['linecount', [String(e.linecount)]]);
    for (const [name, vals] of entries) {
      if (skip.includes(name)) continue;
      let f = map.get(name);
      if (!f) map.set(name, (f = { name, count: 0, values: new Map() }));
      f.count++;
      for (const v of new Set([].concat(vals))) f.values.set(v, (f.values.get(v) || 0) + 1);
    }
  }
  return [...map.values()]
    .map((f) => ({
      name: f.name,
      count: f.count,
      distinct: f.values.size,
      pct: Math.round((f.count / events.length) * 100),
      top: [...f.values.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, 10).map(([value, count]) => ({ value, count })),
    }))
    .filter((f) => !/^(Security_ID|Logon_GUID|Process_ID|Logon_ID|Linked_Logon_ID|RecordNumber|id|requestID|eventID|.*\.id|.*[Ii]d)$/.test(f.name) || f.distinct <= 40)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Count events per time bucket between the first and last event. Returns { buckets: [{from, to, count}], label }. */
export function histogram(events, columns = 40) {
  if (!events.length) return { buckets: [], label: '' };
  const at = (e) => e.abs ?? e.t;
  const lo = Math.min(...events.map(at));
  const hi = Math.max(...events.map(at));
  const STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400];
  const span = Math.max(hi - lo, 60);
  const step = STEPS.find((s) => span / s <= columns) || 86400;
  const start = Math.floor(lo / step) * step;
  const n = Math.max(1, Math.floor((hi - start) / step) + 1);
  const buckets = Array.from({ length: n }, (_, i) => ({ from: start + i * step, to: start + (i + 1) * step, count: 0 }));
  for (const e of events) buckets[Math.min(n - 1, Math.floor((at(e) - start) / step))].count++;
  const label = step >= 3600 ? `${step / 3600} hour${step > 3600 ? 's' : ''} per column` : `${step / 60} minute${step > 60 ? 's' : ''} per column`;
  return { buckets, label, step };
}
