// More of a real analyst's toolbox for the simulated shell: jq, awk (the one-liners people actually write), sed s///,
// tr, base64, find, uname/id. Pure functions over strings; shell.js wires them in. Unit tested.

const lines = (s) => (s === '' ? [] : s.replace(/\n$/, '').split('\n'));
const joinOut = (arr) => (arr.length ? `${arr.join('\n')}\n` : '');

// =============================================================================================== jq
// Supported: . .a.b .a[] .[] .[0] .a? , | select(...) map(...) length keys values sort sort_by(.x) unique first last
//            add join("x") tostring tonumber ascii_downcase ascii_upcase test("re") contains("x") startswith endswith
//            has("k") not  == != < <= > >=  and or  //   {a: .x, b: .y}  [ ... ]  "string"  123  -r -c -e -S
class JqError extends Error {}

function jqTokens(src) {
  const out = [];
  let i = 0;
  const two = ['==', '!=', '<=', '>=', '//', '..'];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') { j++; s += { n: '\n', t: '\t' }[src[j]] ?? src[j]; } else s += src[j];
        j++;
      }
      if (j >= src.length) throw new JqError('jq: error: unterminated string literal');
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = src.slice(i).match(/^\d+(\.\d+)?/);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '.' && /[A-Za-z_]/.test(src[i + 1] || '')) {
      const m = src.slice(i + 1).match(/^[A-Za-z_][\w]*/);
      out.push({ t: 'field', v: m[0] });
      i += 1 + m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_$][\w]*/);
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const d = src.slice(i, i + 2);
    if (two.includes(d)) { out.push({ t: 'op', v: d }); i += 2; continue; }
    out.push({ t: 'op', v: c });
    i++;
  }
  return out;
}

function jqParse(src) {
  const tk = jqTokens(src);
  let p = 0;
  const peek = () => tk[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const eat = (v) => {
    if (!isOp(v)) throw new JqError(`jq: error: syntax error, unexpected ${peek() ? peek().v : 'end of program'} (expected '${v}')`);
    p++;
  };
  const pipe = () => {
    let l = comma();
    while (isOp('|')) { p++; const r = comma(); const a = l; l = (x) => a(x).flatMap((y) => r(y)); }
    return l;
  };
  const comma = () => {
    let l = alt();
    while (isOp(',')) { p++; const r = alt(); const a = l; l = (x) => [...a(x), ...r(x)]; }
    return l;
  };
  const alt = () => {
    let l = orx();
    while (isOp('//')) {
      p++;
      const r = orx();
      const a = l;
      l = (x) => {
        const v = a(x).filter((y) => y !== null && y !== false && y !== undefined);
        return v.length ? v : r(x);
      };
    }
    return l;
  };
  const truthy = (v) => v !== null && v !== false && v !== undefined;
  const orx = () => {
    let l = andx();
    while (peek() && peek().t === 'id' && peek().v === 'or') { p++; const r = andx(); const a = l; l = (x) => a(x).flatMap((u) => (truthy(u) ? [true] : r(x).map(truthy))); }
    return l;
  };
  const andx = () => {
    let l = cmp();
    while (peek() && peek().t === 'id' && peek().v === 'and') { p++; const r = cmp(); const a = l; l = (x) => a(x).flatMap((u) => (!truthy(u) ? [false] : r(x).map(truthy))); }
    return l;
  };
  const cmp = () => {
    const l = postfix();
    const t = peek();
    if (t && t.t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t.v)) {
      p++;
      const r = postfix();
      const f = { '==': (a, b) => JSON.stringify(a) === JSON.stringify(b), '!=': (a, b) => JSON.stringify(a) !== JSON.stringify(b), '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b }[t.v];
      return (x) => l(x).flatMap((a) => r(x).map((b) => f(a, b)));
    }
    return l;
  };
  const postfix = () => {
    let f = primary();
    for (;;) {
      if (peek() && peek().t === 'field') {
        const k = peek().v; p++;
        const a = f; const opt = isOp('?') && (p++, true);
        f = (x) => a(x).flatMap((y) => (y === null ? [null] : typeof y === 'object' ? [y[k] ?? null] : opt ? [] : fail(`Cannot index ${typeof y} with "${k}"`)));
      } else if (isOp('[')) {
        p++;
        const a = f;
        if (isOp(']')) { p++; const opt = isOp('?') && (p++, true); f = (x) => a(x).flatMap((y) => (Array.isArray(y) ? y : y && typeof y === 'object' ? Object.values(y) : opt ? [] : fail('Cannot iterate over ' + (y === null ? 'null' : typeof y)))); } else {
          const idx = pipe(); eat(']');
          f = (x) => a(x).flatMap((y) => idx(x).map((i) => (y === null ? null : Array.isArray(y) ? (y[i < 0 ? y.length + i : i] ?? null) : typeof i === 'string' ? (y[i] ?? null) : null)));
        }
      } else if (isOp('?')) { p++; const a = f; f = (x) => { try { return a(x); } catch { return []; } }; } else break;
    }
    return f;
  };
  const fail = (m) => { throw new JqError(`jq: error: ${m}`); };
  const primary = () => {
    const t = peek();
    if (!t) throw new JqError('jq: error: syntax error, unexpected end of program');
    if (t.t === 'field') { p++; return postfixFrom(t.v); }
    if (t.t === 'str') { p++; return () => [t.v]; }
    if (t.t === 'num') { p++; return () => [t.v]; }
    if (t.t === 'op' && t.v === '.') { p++; return (x) => [x]; }
    if (t.t === 'op' && t.v === '..') { p++; return (x) => { const out = []; const walk = (v) => { out.push(v); if (v && typeof v === 'object') Object.values(v).forEach(walk); }; walk(x); return out; }; }
    if (t.t === 'op' && t.v === '(') { p++; const f = pipe(); eat(')'); return f; }
    if (t.t === 'op' && t.v === '[') {
      p++;
      if (isOp(']')) { p++; return () => [[]]; }
      const f = pipe(); eat(']');
      return (x) => [f(x)];
    }
    if (t.t === 'op' && t.v === '{') {
      p++;
      const entries = [];
      while (!isOp('}')) {
        const kt = peek(); p++;
        let key;
        if (kt.t === 'id' || kt.t === 'str') key = () => [kt.v];
        else if (kt.t === 'field') key = () => [kt.v];
        else throw new JqError('jq: error: syntax error in object construction');
        let val;
        if (isOp(':')) { p++; val = alt(); } else val = (x) => [x?.[kt.v] ?? null];
        entries.push([key, val]);
        if (isOp(',')) p++;
      }
      eat('}');
      return (x) => {
        let results = [{}];
        for (const [k, v] of entries) results = results.flatMap((o) => v(x).map((val) => ({ ...o, [k()[0]]: val })));
        return results;
      };
    }
    if (t.t === 'id') {
      p++;
      return builtin(t.v);
    }
    throw new JqError(`jq: error: syntax error, unexpected ${t.v}`);
  };
  const postfixFrom = (k) => (x) => (x === null ? [null] : typeof x === 'object' ? [x[k] ?? null] : fail(`Cannot index ${typeof x} with "${k}"`));
  const arg = () => { eat('('); const f = pipe(); eat(')'); return f; };
  const builtin = (name) => {
    switch (name) {
      case 'select': { const f = arg(); return (x) => (f(x).some(truthy) ? [x] : []); }
      case 'map': { const f = arg(); return (x) => [x.flatMap((y) => f(y))]; }
      case 'length': return (x) => [x === null ? 0 : typeof x === 'string' || Array.isArray(x) ? x.length : typeof x === 'object' ? Object.keys(x).length : Math.abs(x)];
      case 'keys': return (x) => [Object.keys(x).sort()];
      case 'values': return (x) => (x === null ? [] : [x]);
      case 'not': return (x) => [!truthy(x)];
      case 'empty': return () => [];
      case 'first': return (x) => [x[0] ?? null];
      case 'last': return (x) => [x[x.length - 1] ?? null];
      case 'sort': return (x) => [[...x].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))];
      case 'unique': return (x) => [[...new Set(x.map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v)).sort()];
      case 'add': return (x) => [x.length ? (typeof x[0] === 'string' ? x.join('') : x.reduce((a, b) => a + b, 0)) : null];
      case 'reverse': return (x) => [[...x].reverse()];
      case 'tostring': return (x) => [typeof x === 'string' ? x : JSON.stringify(x)];
      case 'tonumber': return (x) => [Number(x)];
      case 'ascii_downcase': return (x) => [String(x).toLowerCase()];
      case 'ascii_upcase': return (x) => [String(x).toUpperCase()];
      case 'sort_by': { const f = arg(); return (x) => [[...x].sort((a, b) => { const u = f(a)[0]; const v = f(b)[0]; return u < v ? -1 : u > v ? 1 : 0; })]; }
      case 'group_by': { const f = arg(); return (x) => { const m = new Map(); for (const y of x) { const k = JSON.stringify(f(y)[0]); m.set(k, [...(m.get(k) || []), y]); } return [[...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v)]; }; }
      case 'join': { const f = arg(); return (x) => [x.map((v) => (v === null ? '' : String(v))).join(f(x)[0])]; }
      case 'test': { const f = arg(); return (x) => [new RegExp(f(x)[0]).test(x)]; }
      case 'contains': { const f = arg(); return (x) => [typeof x === 'string' ? x.includes(f(x)[0]) : JSON.stringify(x).includes(JSON.stringify(f(x)[0]))]; }
      case 'startswith': { const f = arg(); return (x) => [String(x).startsWith(f(x)[0])]; }
      case 'endswith': { const f = arg(); return (x) => [String(x).endsWith(f(x)[0])]; }
      case 'has': { const f = arg(); return (x) => [Object.prototype.hasOwnProperty.call(x, f(x)[0])]; }
      case 'to_entries': return (x) => [Object.entries(x).map(([key, value]) => ({ key, value }))];
      case 'true': return () => [true];
      case 'false': return () => [false];
      case 'null': return () => [null];
      default: throw new JqError(`jq: error: ${name}/0 is not defined at <top-level>, line 1:`);
    }
  };
  const f = pipe();
  if (p < tk.length) throw new JqError(`jq: error: syntax error, unexpected ${tk[p].v} at <top-level>, line 1:`);
  return f;
}

function jqPretty(v, indent = 2, level = 0) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const pad = ' '.repeat(indent * (level + 1));
  const end = ' '.repeat(indent * level);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + jqPretty(x, indent, level + 1)).join(',\n')}\n${end}]` : '[]';
  const keys = Object.keys(v);
  return keys.length ? `{\n${keys.map((k) => `${pad}${JSON.stringify(k)}: ${jqPretty(v[k], indent, level + 1)}`).join(',\n')}\n${end}}` : '{}';
}

/** jq [-r -c -S -e] <filter> [file...]. `input` is the concatenated text of the files (or stdin). */
export function jq(flags, filter, input) {
  let prog;
  try { prog = jqParse(filter || '.'); } catch (e) { if (e instanceof JqError) throw new Error(`${e.message}\njq: 1 compile error`); throw e; }
  const docs = [];
  const text = input.trim();
  if (!text) return '';
  try {
    docs.push(JSON.parse(text));
  } catch {
    // JSON lines (one object per line), like CloudTrail via the CLI or Okta exports
    for (const l of lines(text)) {
      try { docs.push(JSON.parse(l)); } catch { throw new Error(`jq: error (at <stdin>:${docs.length + 1}): Invalid JSON text`); }
    }
  }
  const out = [];
  try {
    for (const d of docs) for (const r of prog(d)) {
      if (flags.r && typeof r === 'string') out.push(r);
      else out.push(flags.c ? JSON.stringify(r) : jqPretty(r));
    }
  } catch (e) {
    if (e instanceof JqError) throw new Error(`${e.message}${out.length ? '' : ''}`);
    throw e;
  }
  return joinOut(out);
}

// =============================================================================================== awk
// A working subset: -F sep, patterns (/re/, $N==x, NR>1, expr), { print a, b; s+=$3; c[$1]++ }, BEGIN {}, END {},
// for (k in arr), variables, NR NF $0 $N $NF, + - * / %, comparisons, ~ !~, && ||, string and number literals.
function awkTokens(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') { s += src[j] === '\\' ? { n: '\n', t: '\t' }[src[++j]] ?? src[j] : src[j]; j++; }
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (c === '/') {
      const prev = out[out.length - 1];
      const regexOk = !prev || (prev.t === 'op' && ![')', ']'].includes(prev.v)) ;
      if (regexOk) {
        let j = i + 1;
        let s = '';
        while (j < src.length && src[j] !== '/') { s += src[j] === '\\' && src[j + 1] === '/' ? (j++, '/') : src[j]; j++; }
        out.push({ t: 're', v: s });
        i = j + 1;
        continue;
      }
    }
    if (/[0-9.]/.test(c) && /^\d|^\.\d/.test(src.slice(i))) {
      const m = src.slice(i).match(/^\d*\.?\d+/);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '$') {
      const m = src.slice(i + 1).match(/^(NF|\d+|[A-Za-z_]\w*)/);
      out.push({ t: 'field', v: m ? m[0] : '0' });
      i += 1 + (m ? m[0].length : 0);
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_]\w*/);
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const three = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '++', '--', '!~'].includes(three)) { out.push({ t: 'op', v: three }); i += 2; continue; }
    out.push({ t: 'op', v: c });
    i++;
  }
  return out;
}

export function awk(args, text) {
  let sep = null;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-F') sep = args[++i];
    else if (args[i].startsWith('-F')) sep = args[i].slice(2);
    else rest.push(args[i]);
  }
  const prog = rest[0];
  if (!prog) throw new Error('usage: awk [-F fs] \'program\' [file]');
  const tk = awkTokens(prog);
  let p = 0;
  const peek = () => tk[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const isId = (v) => peek() && peek().t === 'id' && peek().v === v;
  const err = (m) => new Error(`awk: syntax error: ${m}`);
  const rules = [];
  const parseBlock = () => {
    if (!isOp('{')) throw err('expected {');
    p++;
    const stmts = [];
    while (!isOp('}')) {
      if (!peek()) throw err('missing }');
      if (isOp(';')) { p++; continue; }
      stmts.push(parseStmt());
    }
    p++;
    return stmts;
  };
  const parseStmt = () => {
    if (isId('print')) {
      p++;
      const exprs = [];
      while (peek() && !isOp(';') && !isOp('}')) {
        exprs.push(parseExpr());
        if (isOp(',')) p++;
      }
      return { k: 'print', exprs };
    }
    if (isId('for')) {
      p++;
      if (!isOp('(')) throw err('expected (');
      p++;
      const v = peek().v; p++;
      if (!isId('in')) throw err('only for (k in arr) is supported');
      p++;
      const arr = peek().v; p++;
      if (!isOp(')')) throw err('expected )');
      p++;
      const body = isOp('{') ? parseBlock() : [parseStmt()];
      return { k: 'forin', v, arr, body };
    }
    if (isId('if')) {
      p++;
      p++;
      const cond = parseExpr();
      p++;
      const body = isOp('{') ? parseBlock() : [parseStmt()];
      return { k: 'if', cond, body };
    }
    // assignment / increment / bare expression
    const startP = p;
    if (peek().t === 'id') {
      const name = peek().v;
      p++;
      let idx = null;
      if (isOp('[')) { p++; idx = parseExpr(); p++; }
      const t = peek();
      if (t && t.t === 'op' && ['=', '+=', '-=', '*=', '/='].includes(t.v)) { p++; return { k: 'assign', name, idx, op: t.v, e: parseExpr() }; }
      if (t && t.t === 'op' && ['++', '--'].includes(t.v)) { p++; return { k: 'assign', name, idx, op: t.v === '++' ? '+=' : '-=', e: { k: 'num', v: 1 } }; }
      p = startP;
    }
    return { k: 'expr', e: parseExpr() };
  };
  const parseExpr = () => parseOr();
  const bin = (next, ops) => () => {
    let l = next();
    while (peek() && peek().t === 'op' && ops.includes(peek().v)) { const op = peek().v; p++; l = { k: 'bin', op, l, r: next() }; }
    return l;
  };
  const parsePrimary = () => {
    const t = peek();
    if (!t) throw err('unexpected end');
    p++;
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 're') return { k: 're', v: t.v };
    if (t.t === 'field') return { k: 'field', v: t.v };
    if (t.t === 'op' && t.v === '(') { const e = parseExpr(); p++; return e; }
    if (t.t === 'op' && t.v === '!') return { k: 'not', e: parsePrimary() };
    if (t.t === 'op' && t.v === '-') return { k: 'bin', op: '-', l: { k: 'num', v: 0 }, r: parsePrimary() };
    if (t.t === 'id') {
      if (t.v === 'length') { if (isOp('(')) { p++; const e = isOp(')') ? { k: 'field', v: '0' } : parseExpr(); p++; return { k: 'call', fn: 'length', e }; } return { k: 'call', fn: 'length', e: { k: 'field', v: '0' } }; }
      if (['tolower', 'toupper', 'int'].includes(t.v)) { p++; const e = parseExpr(); p++; return { k: 'call', fn: t.v, e }; }
      if (isOp('[')) { p++; const idx = parseExpr(); p++; return { k: 'index', name: t.v, idx }; }
      return { k: 'var', name: t.v };
    }
    throw err(`unexpected ${t.v}`);
  };
  const mul = bin(parsePrimary, ['*', '/', '%']);
  const add = bin(mul, ['+', '-']);
  const cmpx = bin(add, ['<', '>', '<=', '>=', '==', '!=', '~', '!~']);
  const parseAnd = bin(cmpx, ['&&']);
  const parseOr = bin(parseAnd, ['||']);

  // rules: [pattern] { action }   |  BEGIN { } | END { }
  while (p < tk.length) {
    if (isOp(';')) { p++; continue; }
    if (isId('BEGIN')) { p++; rules.push({ type: 'begin', body: parseBlock() }); continue; }
    if (isId('END')) { p++; rules.push({ type: 'end', body: parseBlock() }); continue; }
    let pattern = null;
    if (!isOp('{')) pattern = parseExpr();
    const body = isOp('{') ? parseBlock() : [{ k: 'print', exprs: [] }];
    rules.push({ type: 'main', pattern, body });
  }

  const vars = {};
  const arrs = {};
  const out = [];
  let rec = { f: [], line: '', NR: 0 };
  const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? 0 : n; };
  const str = (v) => (typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : v === undefined || v === null ? '' : String(v));
  const ev = (e) => {
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 're': return new RegExp(e.v).test(rec.line) ? 1 : 0;
      case 'field': {
        if (e.v === 'NF') return rec.f.length;
        if (e.v === '0') return rec.line;
        const n = /^\d+$/.test(e.v) ? Number(e.v) : Math.round(num(vars[e.v]));
        return rec.f[n - 1] ?? '';
      }
      case 'var': return e.name === 'NR' ? rec.NR : e.name === 'NF' ? rec.f.length : (vars[e.name] ?? '');
      case 'index': return arrs[e.name]?.[str(ev(e.idx))] ?? '';
      case 'not': return ev(e.e) ? 0 : 1;
      case 'call': {
        const v = ev(e.e);
        if (e.fn === 'length') return str(v).length;
        if (e.fn === 'tolower') return str(v).toLowerCase();
        if (e.fn === 'toupper') return str(v).toUpperCase();
        return Math.trunc(num(v));
      }
      case 'bin': {
        if (e.op === '&&') return ev(e.l) && ev(e.r) ? 1 : 0;
        if (e.op === '||') return ev(e.l) || ev(e.r) ? 1 : 0;
        if (e.op === '~' || e.op === '!~') {
          const rhs = e.r.k === 're' ? new RegExp(e.r.v) : new RegExp(str(ev(e.r)));
          const hit = rhs.test(str(ev(e.l)));
          return (e.op === '~' ? hit : !hit) ? 1 : 0;
        }
        const a = ev(e.l);
        const b = ev(e.r);
        const numeric = (x) => typeof x === 'number' || (x !== '' && !Number.isNaN(Number(x)));
        if (['<', '>', '<=', '>=', '==', '!='].includes(e.op)) {
          const both = numeric(a) && numeric(b);
          const x = both ? Number(a) : str(a);
          const y = both ? Number(b) : str(b);
          return ({ '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y, '==': x === y, '!=': x !== y })[e.op] ? 1 : 0;
        }
        const x = num(a);
        const y = num(b);
        return e.op === '+' ? x + y : e.op === '-' ? x - y : e.op === '*' ? x * y : e.op === '/' ? (y === 0 ? 0 : x / y) : x % y;
      }
      default: return '';
    }
  };
  const exec = (stmts) => {
    for (const s of stmts) {
      if (s.k === 'print') out.push(s.exprs.length ? s.exprs.map((x) => str(ev(x))).join(' ') : rec.line);
      else if (s.k === 'expr') ev(s.e);
      else if (s.k === 'assign') {
        const cur = s.idx ? arrs[s.name]?.[str(ev(s.idx))] ?? '' : vars[s.name] ?? '';
        const v = ev(s.e);
        const next = s.op === '=' ? v : s.op === '+=' ? num(cur) + num(v) : s.op === '-=' ? num(cur) - num(v) : s.op === '*=' ? num(cur) * num(v) : num(cur) / (num(v) || 1);
        if (s.idx) (arrs[s.name] ||= {})[str(ev(s.idx))] = next;
        else vars[s.name] = next;
      } else if (s.k === 'forin') {
        for (const key of Object.keys(arrs[s.arr] || {})) { vars[s.v] = key; exec(s.body); }
      } else if (s.k === 'if') {
        if (ev(s.cond)) exec(s.body);
      }
    }
  };
  for (const r of rules) if (r.type === 'begin') exec(r.body);
  const sepRe = sep === null ? /\s+/ : sep.length === 1 && !/[.|*+?()[\]\\^$]/.test(sep) ? sep : new RegExp(sep === '\\t' ? '\t' : sep);
  let n = 0;
  for (const l of lines(text)) {
    n++;
    rec = { line: l, f: sep === null ? l.trim().split(/\s+/).filter(Boolean) : l.split(sepRe), NR: n };
    for (const r of rules) if (r.type === 'main' && (!r.pattern || ev(r.pattern))) exec(r.body);
  }
  for (const r of rules) if (r.type === 'end') exec(r.body);
  return joinOut(out);
}

// =============================================================================================== sed / tr / base64 / find
/** sed 's/a/b/[gI]' and sed -n '/re/p' / '5p' / '1,3p', plus -E and -e. */
export function sed(args, text) {
  const exprs = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-e') exprs.push(args[++i]);
    else if (a.startsWith('-') && a.length > 1 && !a.startsWith('--')) for (const c of a.slice(1)) flags[c] = true;
    else exprs.push(a);
  }
  if (!exprs.length) throw new Error('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...');
  let ls = lines(text);
  for (const e of exprs) {
    let m = e.match(/^s(.)(.*?)(?<!\\)\1(.*?)(?<!\\)\1([gIi]*)$/);
    if (m) {
      const [, , pat, rep, fl] = m;
      let re;
      try { re = new RegExp(flags.E || flags.r ? pat : pat.replace(/[+?(){}|]/g, '\\$&'), (fl.includes('g') ? 'g' : '') + (/[Ii]/.test(fl) ? 'i' : '')); } catch { throw new Error(`sed: -e expression #1, char ${e.length}: unterminated \`s' command`); }
      const r = rep.replace(/\\(\d)/g, '$$$1').replace(/&/g, '$$&');
      ls = ls.map((l) => (flags.n ? (re.test(l) ? l.replace(re, r) : null) : l.replace(re, r))).filter((l) => l !== null || !flags.n);
      continue;
    }
    m = e.match(/^(?:\/(.*)\/|(\d+)(?:,(\d+|\$))?)(p|d)$/);
    if (m) {
      const [, re, a, b, cmd] = m;
      const test = (l, i) => (re !== undefined ? new RegExp(re).test(l) : b === undefined ? i + 1 === Number(a) : i + 1 >= Number(a) && (b === '$' || i + 1 <= Number(b)));
      if (cmd === 'p') ls = flags.n ? ls.filter(test) : ls.flatMap((l, i) => (test(l, i) ? [l, l] : [l]));
      else ls = ls.filter((l, i) => !test(l, i));
      continue;
    }
    throw new Error(`sed: -e expression #1, char 1: unknown command: \`${e[0]}'`);
  }
  return joinOut(ls);
}

export function tr(args, text) {
  const del = args[0] === '-d';
  const squeeze = args[0] === '-s';
  const set = (s) => s.replace(/\[:upper:\]/g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ').replace(/\[:lower:\]/g, 'abcdefghijklmnopqrstuvwxyz').replace(/\[:digit:\]/g, '0123456789').replace(/\[:space:\]/g, ' \t\n').replace(/(.)-(.)/g, (_, a, b) => { let o = ''; for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) o += String.fromCharCode(c); return o; }).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const rest = args.filter((a) => a !== '-d' && a !== '-s');
  if (!rest.length) throw new Error("tr: missing operand\nTry 'tr --help' for more information.");
  const a = set(rest[0]);
  if (del) return [...text].filter((c) => !a.includes(c)).join('');
  if (squeeze) return text.replace(new RegExp(`([${a.replace(/[\]\\^-]/g, '\\$&')}])\\1+`, 'g'), '$1');
  if (rest[1] === undefined) throw new Error(`tr: missing operand after '${rest[0]}'\nTry 'tr --help' for more information.`);
  const b = set(rest[1]);
  return [...text].map((c) => { const i = a.indexOf(c); return i < 0 ? c : (b[Math.min(i, b.length - 1)] ?? c); }).join('');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(args, text) {
  const dec = args.includes('-d') || args.includes('--decode') || args.includes('-D');
  if (dec) {
    const clean = text.replace(/\s+/g, '');
    if (/[^A-Za-z0-9+/=]/.test(clean)) throw new Error('base64: invalid input');
    let bits = '';
    for (const c of clean.replace(/=+$/, '')) bits += B64.indexOf(c).toString(2).padStart(6, '0');
    let s = '';
    for (let i = 0; i + 8 <= bits.length; i += 8) s += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
    // PowerShell -EncodedCommand is UTF-16LE: show it readable the way analysts do (the NULs are noise)
    return `${s.includes('\u0000') ? s.replace(/\u0000/g, '') : s}${s.endsWith('\n') ? '' : '\n'}`.replace(/\n\n$/, '\n');
  }
  const src = text.replace(/\n$/, '');
  let bits = '';
  for (const c of src) bits += c.charCodeAt(0).toString(2).padStart(8, '0');
  let o = '';
  for (let i = 0; i < bits.length; i += 6) o += B64[parseInt(bits.slice(i, i + 6).padEnd(6, '0'), 2)];
  while (o.length % 4) o += '=';
  return `${o}\n`;
}

/** find <dir> [-name 'glob'] [-type f|d] over the read-only file system. */
export function find(args, fs, cwd, resolve) {
  let dir = '.';
  const flags = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-name' || args[i] === '-iname') { flags.name = args[++i]; flags.i = args[i - 1] === '-iname'; } else if (args[i] === '-type') flags.type = args[++i];
    else if (args[i] === '-mtime' || args[i] === '-size') i++;
    else pos.push(args[i]);
  }
  if (pos[0]) dir = pos[0];
  const base = resolve(cwd, dir);
  const files = Object.keys(fs).filter((f) => f === base || f.startsWith(base === '/' ? '/' : `${base}/`)).sort();
  if (!files.length) throw new Error(`find: '${dir}': No such file or directory`);
  const re = flags.name ? new RegExp(`^${flags.name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, flags.i ? 'i' : '') : null;
  const dirs = new Set();
  for (const f of files) {
    const parts = f.split('/');
    for (let i = 2; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const show = (p) => (dir === '.' || !dir.startsWith('/') ? `.${p.slice(base === '/' ? 0 : base.length)}`.replace(/^\.$/, '.') : p);
  const out = [];
  if (flags.type !== 'f' && base !== '/' && !flags.name) out.push(show(base) || '.');
  for (const d of [...dirs].filter((x) => x.startsWith(`${base}/`)).sort()) if (flags.type !== 'f' && (!re || re.test(d.split('/').pop()))) out.push(show(d));
  if (flags.type !== 'd') for (const f of files) if (!re || re.test(f.split('/').pop())) out.push(show(f));
  return joinOut([...new Set(out)].sort());
}
