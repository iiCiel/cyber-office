// A tiny simulated Unix shell for the in-game Terminal. Pure logic (no DOM), unit tested.
//
// Real commands, real flags, simulated data: the day provides a read-only filesystem
// ({ '/path/file': 'contents' }) plus whois and DNS answers. Pipes work: cmd | cmd | cmd.
//
// Supported: help, ls, cd, pwd, cat, head, tail, grep (-i -v -c -n -E -r -l), wc (-l -w -c), sort (-n -r -k),
//            uniq (-c), cut (-d -f), awk '{print $N}', whois, nslookup, dig, whoami, hostname, date,
//            echo, history, clear

import { jq, awk as awkFull, sed, tr, base64, find } from './shellplus.js';

export const HELP = [
  'Commands you can use (real flags, simulated data):',
  '  ls [dir]              list files            cd <dir>    change directory',
  '  cat <file>            print a file          head / tail -n 20 <file>',
  '  grep [-i -v -c -n -E -r -l] <pattern> [file|dir]   find matching lines (-r: whole folder)',
  '  wc -l                 count lines           sort [-n] [-r]    uniq [-c]',
  "  cut -d ' ' -f 1       pick a column         awk -F'\"' '$9==200 {print $7}'   real awk (END, arrays, sums)",
  "  jq '.Records[] | select(.eventName==\"ListBuckets\")'   read JSON logs (CloudTrail, Okta, Entra)   -r raw  -c compact",
  "  sed 's/a/b/g'  tr 'A-Z' 'a-z'  base64 -d      decode / rewrite text (PowerShell -enc commands are base64)",
  '  find <dir> -name "*.json"                     find files',
  '  whois <ip|domain>     who owns it           nslookup <name>   DNS lookup',
  '  history  clear  whoami  id  hostname  date  uname -a',
  '  aws ...  az ...       cloud CLIs, only on cloud cases (try: aws sts get-caller-identity, az ad user list)',
  '',
  'Pipes work:  cut -d " " -f 1 access.log | sort | uniq -c | sort -rn | head',
].join('\n');

// Split a command line into tokens, honoring single and double quotes.
export function tokenize(line) {
  const out = [];
  let cur = '';
  let q = null;
  let has = false;
  for (const ch of line) {
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
    }
  }
  if (q) throw new Error('unterminated quote');
  if (cur || has) out.push(cur);
  return out;
}

// Split on | outside quotes.
export function splitPipes(line) {
  const parts = [];
  let cur = '';
  let q = null;
  for (const ch of line) {
    if (q) {
      if (ch === q) q = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === '|') {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

const lines = (s) => (s === '' ? [] : s.replace(/\n$/, '').split('\n'));
const joinOut = (arr) => (arr.length ? `${arr.join('\n')}\n` : '');

function resolve(cwd, p) {
  if (!p) return cwd;
  const parts = (p.startsWith('/') ? p : `${cwd}/${p}`).split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return `/${stack.join('/')}`;
}

function isDir(fs, path) {
  if (path === '/') return true;
  return Object.keys(fs).some((f) => f.startsWith(`${path}/`));
}

function parseFlags(args, withValue = []) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      const name = a.slice(1);
      if (withValue.includes(name[0])) {
        flags[name[0]] = name.length > 1 ? name.slice(1) : args[++i];
      } else {
        for (const c of name) flags[c] = true;
      }
    } else if (/^-\d+$/.test(a)) {
      flags.n = a.slice(1);
    } else rest.push(a);
  }
  return { flags, rest };
}

/**
 * Run one full command line. Returns { out, cwd, clear }.
 * ctx: { fs, cwd, whois: {key: text}, dns: {name: text}, history: [...], user, host, date }
 */
export function run(line, ctx) {
  const trimmed = line.trim();
  if (!trimmed) return { out: '', cwd: ctx.cwd };
  let stdin = null;
  let cwd = ctx.cwd;
  try {
    const parts = splitPipes(trimmed);
    if (parts.some((p) => !p)) throw new Error("syntax error near unexpected token `|'");
    for (const part of parts) {
      const [cmd, ...args] = tokenize(part);
      const res = exec(cmd, args, stdin, { ...ctx, cwd });
      if (res.clear) return { out: '', cwd, clear: true };
      if (res.cwd) cwd = res.cwd;
      stdin = res.out;
    }
    return { out: stdin ?? '', cwd };
  } catch (e) {
    return { out: `${e.message}\n`, cwd, error: true };
  }
}

function readInput(files, stdin, ctx, cmd) {
  if (!files.length) {
    if (stdin === null) throw new Error(`${cmd}: missing file operand (try: ${cmd} <file>, or pipe into it)`);
    return stdin;
  }
  return files
    .map((f) => {
      const p = resolve(ctx.cwd, f);
      if (ctx.fs[p] === undefined) throw new Error(isDir(ctx.fs, p) ? `${cmd}: ${f}: Is a directory` : `${cmd}: ${f}: No such file or directory`);
      return ctx.fs[p];
    })
    .join('');
}

function exec(cmd, args, stdin, ctx) {
  const fs = ctx.fs;
  switch (cmd) {
    case 'help':
      return { out: `${HELP}\n` };
    case 'clear':
      return { clear: true };
    case 'pwd':
      return { out: `${ctx.cwd}\n` };
    case 'whoami':
      return { out: `${ctx.user || 'analyst01'}\n` };
    case 'hostname':
      return { out: `${ctx.host || 'HALCYON-WS-0142'}\n` };
    case 'date':
      return { out: `${ctx.date || 'Wed Oct 21 2026'}\n` };
    case 'echo':
      return { out: `${args.join(' ')}\n` };
    case 'history':
      return { out: joinOut((ctx.history || []).map((h, i) => `${String(i + 1).padStart(4)}  ${h}`)) };
    case 'cd': {
      const target = resolve(ctx.cwd, args[0] || '/home/analyst01');
      if (!isDir(fs, target)) throw new Error(`cd: ${args[0]}: No such file or directory`);
      return { out: '', cwd: target };
    }
    case 'ls': {
      const { rest, flags } = parseFlags(args);
      const target = resolve(ctx.cwd, rest[0]);
      if (fs[target] !== undefined) return { out: `${rest[0]}\n` };
      if (!isDir(fs, target)) throw new Error(`ls: cannot access '${rest[0]}': No such file or directory`);
      const prefix = target === '/' ? '/' : `${target}/`;
      const names = new Set();
      for (const f of Object.keys(fs)) {
        if (!f.startsWith(prefix)) continue;
        const rest2 = f.slice(prefix.length);
        names.add(rest2.includes('/') ? `${rest2.split('/')[0]}/` : rest2);
      }
      const list = [...names].sort();
      if (flags.l) {
        return {
          out: joinOut(list.map((n) => {
            const full = prefix + n.replace(/\/$/, '');
            const size = fs[full] !== undefined ? fs[full].length : 4096;
            return `${n.endsWith('/') ? 'drwxr-xr-x' : '-rw-r-----'} 1 root adm ${String(size).padStart(9)} Oct 21 09:12 ${n}`;
          })),
        };
      }
      return { out: joinOut(list) };
    }
    case 'cat':
      return { out: readInput(args, stdin, ctx, 'cat') };
    case 'head':
    case 'tail': {
      const { flags, rest } = parseFlags(args, ['n']);
      const n = parseInt(flags.n ?? '10', 10);
      if (Number.isNaN(n)) throw new Error(`${cmd}: invalid number of lines`);
      const ls = lines(readInput(rest, stdin, ctx, cmd));
      return { out: joinOut(cmd === 'head' ? ls.slice(0, n) : ls.slice(Math.max(0, ls.length - n))) };
    }
    case 'grep': {
      const { flags, rest } = parseFlags(args);
      if (!rest.length) throw new Error('usage: grep [-i -v -c -n -E -r -l] <pattern> [file|dir]');
      const [pattern, ...files] = rest;
      let re;
      try {
        // Basic regex (no -E): . * [ ] ^ $ keep their meaning; + ? { } ( ) | are plain characters.
        const src = flags.E ? pattern : pattern.replace(/[+?{}()|]/g, (c) => `\\${c}`);
        re = new RegExp(src, flags.i ? 'i' : '');
      } catch {
        throw new Error(`grep: invalid pattern '${pattern}'`);
      }
      const matched = [];
      // grep -r (or several files): search every file, prefix each hit with its path; -l lists files only.
      if (flags.r || flags.R || files.length > 1) {
        const targets = files.length ? files : ['.'];
        const found = [];
        for (const f of targets) {
          const p = resolve(ctx.cwd, f);
          if (fs[p] !== undefined) found.push([f, p]);
          else if (isDir(fs, p) && (flags.r || flags.R)) {
            for (const q of Object.keys(fs).filter((k) => k.startsWith(p === '/' ? '/' : `${p}/`)).sort()) {
              found.push([f === '.' ? q.slice(p.length + 1) : `${f.replace(/\/$/, '')}${q.slice(p.length)}`, q]);
            }
          } else if (isDir(fs, p)) throw new Error(`grep: ${f}: Is a directory`);
          else throw new Error(`grep: ${f}: No such file or directory`);
        }
        let count = 0;
        for (const [shown, p] of found) {
          let hit = false;
          lines(fs[p]).forEach((l, i) => {
            if (re.test(l) === !!flags.v) return;
            hit = true;
            count++;
            if (!flags.l && !flags.c) matched.push(`${shown}:${flags.n ? `${i + 1}:` : ''}${l}`);
          });
          if (hit && flags.l) matched.push(shown);
        }
        return { out: flags.c ? `${count}\n` : joinOut(matched) };
      }
      lines(readInput(files, stdin, ctx, 'grep')).forEach((l, i) => {
        if (re.test(l) !== !!flags.v) matched.push(flags.n ? `${i + 1}:${l}` : l);
      });
      return { out: flags.c ? `${matched.length}\n` : joinOut(matched) };
    }
    case 'wc': {
      const { flags, rest } = parseFlags(args);
      const text = readInput(rest, stdin, ctx, 'wc');
      const l = lines(text).length;
      const w = text.split(/\s+/).filter(Boolean).length;
      if (flags.l) return { out: `${l}\n` };
      if (flags.w) return { out: `${w}\n` };
      if (flags.c) return { out: `${text.length}\n` };
      return { out: `${String(l).padStart(7)} ${String(w).padStart(7)} ${String(text.length).padStart(7)}\n` };
    }
    case 'sort': {
      const { flags, rest } = parseFlags(args, ['k', 't']);
      const ls = lines(readInput(rest, stdin, ctx, 'sort'));
      const key = (l) => {
        if (!flags.k) return l;
        const f = l.trim().split(flags.t || /\s+/);
        return f[parseInt(flags.k, 10) - 1] ?? '';
      };
      ls.sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        if (flags.n) return (parseFloat(ka) || 0) - (parseFloat(kb) || 0);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      if (flags.r) ls.reverse();
      return { out: joinOut(flags.u ? ls.filter((l, i) => i === 0 || l !== ls[i - 1]) : ls) };
    }
    case 'uniq': {
      const { flags, rest } = parseFlags(args);
      const out = [];
      let prev = null;
      let count = 0;
      const flush = () => prev !== null && out.push(flags.c ? `${String(count).padStart(7)} ${prev}` : prev);
      for (const l of lines(readInput(rest, stdin, ctx, 'uniq'))) {
        if (l === prev) count++;
        else {
          flush();
          prev = l;
          count = 1;
        }
      }
      flush();
      return { out: joinOut(out) };
    }
    case 'cut': {
      const { flags, rest } = parseFlags(args, ['d', 'f']);
      if (!flags.f) throw new Error("cut: you must specify a list of fields (e.g. cut -d ' ' -f 1)");
      const d = flags.d ?? '\t';
      const fields = String(flags.f).split(',').flatMap((x) => {
        const [a, b] = x.split('-').map((n) => parseInt(n, 10));
        return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
      });
      return { out: joinOut(lines(readInput(rest, stdin, ctx, 'cut')).map((l) => fields.map((f) => l.split(d)[f - 1] ?? '').join(d))) };
    }
    case 'awk': {
      const a = [...args];
      const fs2 = [];
      while (a[0] && a[0].startsWith('-F')) {
        fs2.push(a.shift());
        if (fs2[fs2.length - 1] === '-F') fs2.push(a.shift());
      }
      const prog = a.shift();
      if (!prog) throw new Error("usage: awk [-F fs] 'program' [file ...]");
      return { out: awkFull([...fs2, prog], readInput(a, stdin, ctx, 'awk')) };
    }
    case 'jq': {
      const { flags, rest } = parseFlags(args);
      const [filter, ...files] = rest;
      if (!filter) throw new Error('Usage:\tjq [OPTIONS] FILTER [FILES...]');
      return { out: jq(flags, filter, readInput(files, stdin, ctx, 'jq')) };
    }
    case 'sed': {
      const files = [];
      const prog = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-e') prog.push(args[i], args[++i]);
        else if (args[i].startsWith('-') && args[i].length > 1) prog.push(args[i]);
        else if (!prog.some((x) => !x.startsWith('-')) && prog.every((x) => x.startsWith('-') && x !== '-e')) prog.push(args[i]);
        else files.push(args[i]);
      }
      return { out: sed(prog, readInput(files, stdin, ctx, 'sed')) };
    }
    case 'tr': {
      if (stdin === null) throw new Error('tr: reads standard input (pipe something into it)');
      return { out: tr(args, stdin) };
    }
    case 'base64':
    case 'b64': {
      const files = args.filter((a) => !a.startsWith('-'));
      return { out: base64(args, files.length || stdin !== null ? readInput(files, stdin, ctx, 'base64') : '') };
    }
    case 'find':
      return { out: find(args, fs, ctx.cwd, resolve) };
    case 'less':
    case 'more':
      return { out: readInput(args, stdin, ctx, cmd) };
    case 'uname':
      return { out: args.includes('-a') ? 'Linux soc-jump01 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux\n' : 'Linux\n' };
    case 'id':
      return { out: 'uid=1001(analyst01) gid=1001(analyst01) groups=1001(analyst01),4(adm),999(soc-readonly)\n' };
    case 'which':
      return { out: args[0] && ['ls', 'cat', 'grep', 'awk', 'sed', 'jq', 'tr', 'sort', 'uniq', 'whois', 'aws', 'az'].includes(args[0]) ? `/usr/bin/${args[0]}\n` : '' };
    case 'curl':
    case 'wget':
    case 'ping':
      return { out: `${cmd}: (6) Could not resolve host: ${args.find((a) => !a.startsWith('-')) || 'host'}. This jump host has no internet access, which is how it should be on a SOC network.\n` };
    case 'man':
      return { out: args[0] ? `No manual entry for ${args[0]}\n` : 'What manual page do you want?\n' };
    case 'whois': {
      if (!args[0]) throw new Error('usage: whois <ip or domain>');
      const ans = ctx.whois?.[args[0].toLowerCase()];
      return { out: ans ? `${ans}\n` : `No match for "${args[0]}".\n` };
    }
    case 'nslookup':
    case 'dig':
    case 'host': {
      if (!args[0]) throw new Error(`usage: ${cmd} <name>`);
      const ans = ctx.dns?.[args[0].toLowerCase()];
      if (!ans) return { out: `** server can't find ${args[0]}: NXDOMAIN\n` };
      return { out: `Server:\t\t10.0.3.10\nAddress:\t10.0.3.10#53\n\nNon-authoritative answer:\n${ans}\n` };
    }
    case 'ssh':
      return { out: `ssh: ${args[0] || 'host'}: you don't need to ssh. Logs from our servers are mirrored under /var/log/remote/.\n` };
    case 'sudo':
      return { out: `${ctx.user || 'analyst01'} is not in the sudoers file. This incident will be reported.\n` };
    case 'rm':
      return { out: 'rm: read-only file system (and deleting evidence is a bad idea anyway)\n' };
    default: {
      // Commands a case supplies itself: aws, az, kubectl, ... (see src/game/cloudcli.js)
      const custom = ctx.commands?.[cmd];
      if (custom) {
        const res = custom(args, stdin, ctx);
        return typeof res === 'string' ? { out: res } : res;
      }
      throw new Error(`${cmd}: command not found (type 'help')`);
    }
  }
}
