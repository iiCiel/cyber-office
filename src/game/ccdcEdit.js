// Config-file editing for the CCDC Linux terminals. The read-only inspection shell (shell.js) lets the player
// LOOK at files; this lets them actually CHANGE them. A per-device filesystem is cloned into the game at start,
// and these commands mutate it, so `cat` afterwards shows the real, edited result — the player edits a config,
// then reads it back to confirm the change took, exactly like working on a box.
//
// Supported (the common ways an admin edits a file from the shell):
//   rm [-r|-rf] <path...>                 delete a file (or a folder with -r)
//   sed -i 's/PATTERN/REPLACEMENT/[g]' F  in-place search/replace (also -i.bak)
//   echo TEXT >> FILE                     append a line
//   echo TEXT  > FILE                     overwrite
//   printf ... >> FILE / > FILE           same, printf form
//   tee [-a] FILE                         write stdin (from an echo pipe) to a file
//   truncate -s 0 FILE  /  : > FILE       empty a file
//   nano/vi/vim FILE                      interactive editors aren't available here — prints how to edit instead
//
// Pure logic over a plain { '/path': 'contents' } map; unit tested. Nothing is executed.

import { tokenize } from './shell.js';

const isDir = (fs, p) => fs[p] === undefined && Object.keys(fs).some((k) => k.startsWith(`${p}/`));

// Unescape the bits of a double/single-quoted echo argument we care about.
const unq = (s) => {
  let v = String(s ?? '');
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
};

// Parse a trailing redirect (`>> file` or `> file`) out of a raw line. Returns { body, file, append } or null.
function splitRedirect(line) {
  const m = line.match(/\s(>>|>)\s*("[^"]+"|'[^']+'|\S+)\s*$/);
  if (!m) return null;
  return { body: line.slice(0, m.index), file: unq(m[2]), append: m[1] === '>>' };
}

// Translate one `s/a/b/flags` sed script into a JS replace on the text.
function applySed(script, text) {
  // `/pattern/d` — delete every line matching pattern.
  const del = script.match(/^\/(.*)\/d$/s);
  if (del) {
    let re;
    try { re = new RegExp(del[1]); } catch { return { error: `sed: bad regex: ${del[1]}` }; }
    const kept = text.split('\n').filter((ln) => !re.test(ln));
    return { text: kept.join('\n') };
  }
  const m = script.match(/^s(.)(.*)$/s);
  if (!m) return { error: `sed: unsupported script: ${script}` };
  const delim = m[1];
  // split on the (unescaped) delimiter into pat / rep / flags
  const parts = [];
  let cur = '';
  for (let i = 0; i < m[2].length; i++) {
    const c = m[2][i];
    if (c === '\\' && m[2][i + 1] === delim) { cur += delim; i++; continue; }
    if (c === delim) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  const [pat, rep = '', flags = ''] = parts;
  let re;
  try { re = new RegExp(pat, flags.includes('g') ? 'gm' : 'm'); } catch (e) { return { error: `sed: bad regex: ${pat}` }; }
  return { text: text.replace(re, rep.replace(/\\\//g, '/')) };
}

/**
 * If `rawLine` is a file-editing command, apply it to `fs` (mutating it) and return { handled:true, lines, error? }.
 * Otherwise returns { handled:false } so the caller falls through to the read-only inspection engine.
 */
export function applyEdit(fs, rawLine, { stdin } = {}) {
  const line = String(rawLine || '').trim();
  const toks = tokenize(line);
  const cmd = toks[0];
  const out = (text, error = false) => ({ handled: true, lines: text ? [{ cls: error ? 'err' : 'ok', text }] : [], error });

  // --- rm --------------------------------------------------------------------
  if (cmd === 'rm') {
    const flags = toks.slice(1).filter((t) => t.startsWith('-')).join('');
    const recursive = /r/i.test(flags);
    const targets = toks.slice(1).filter((t) => !t.startsWith('-'));
    if (!targets.length) return out('rm: missing operand', true);
    const removed = [];
    for (const t of targets) {
      if (fs[t] !== undefined) { delete fs[t]; removed.push(t); }
      else if (recursive && isDir(fs, t)) { for (const k of Object.keys(fs)) if (k === t || k.startsWith(`${t}/`)) { delete fs[k]; } removed.push(t); }
      else if (isDir(fs, t)) return out(`rm: cannot remove '${t}': Is a directory`, true);
      else return out(`rm: cannot remove '${t}': No such file or directory`, true);
    }
    return out(removed.map((t) => `removed ‘${t}’`).join('\n'));
  }

  // --- sed -i ----------------------------------------------------------------
  if (cmd === 'sed' && toks.some((t) => t === '-i' || t.startsWith('-i'))) {
    const args = toks.slice(1).filter((t) => t !== '-e');
    const nonflag = args.filter((t) => !t.startsWith('-'));
    const script = nonflag[0];
    const file = nonflag[1];
    if (!script || !file) return out("sed: usage: sed -i 's/old/new/' <file>", true);
    if (fs[file] === undefined) return out(`sed: can't read ${file}: No such file or directory`, true);
    const r = applySed(unq(script), fs[file]);
    if (r.error) return out(r.error, true);
    fs[file] = r.text;
    return out('');
  }

  // --- tee -------------------------------------------------------------------
  if (cmd === 'tee') {
    const append = toks.includes('-a');
    const file = toks.slice(1).find((t) => !t.startsWith('-'));
    if (!file) return out('tee: missing file operand', true);
    const data = stdin != null ? String(stdin) : '';
    fs[file] = append ? (fs[file] || '') + data : data;
    return out(data.replace(/\n$/, ''));
  }

  // --- truncate / : > file ---------------------------------------------------
  if (cmd === 'truncate') {
    const file = toks.slice(1).find((t) => !t.startsWith('-') && !/^\d+$/.test(t));
    if (file && fs[file] !== undefined) { fs[file] = ''; return out(''); }
    return out(`truncate: cannot open '${file}' for writing`, true);
  }

  // --- echo / printf / `:` with a redirect -----------------------------------
  const redir = splitRedirect(line);
  if (redir) {
    const btoks = tokenize(redir.body.trim());
    const bcmd = btoks[0];
    let data = '';
    if (bcmd === 'echo') data = `${btoks.slice(1).map(unq).join(' ')}\n`;
    else if (bcmd === 'printf') data = unq(btoks[1] || '');
    else if (bcmd === ':' || bcmd === undefined) data = '';
    else return { handled: false }; // a redirect off some other command — let the inspection engine try
    if (fs[redir.file] === undefined && !redir.append) fs[redir.file] = '';
    fs[redir.file] = redir.append ? (fs[redir.file] || '') + data : data;
    return out('');
  }

  // --- interactive editors: unavailable, point at the scriptable way ---------
  if (cmd === 'nano' || cmd === 'vi' || cmd === 'vim' || cmd === 'emacs') {
    return out(`${cmd}: no interactive editor in this terminal. Edit in place with:  sed -i 's/old/new/' <file>   (or append with:  echo 'line' >> <file>). Read it back with cat.`);
  }

  return { handled: false };
}

/** Is this line one `applyEdit` would handle? (lets callers decide whether to clone/mutate.) */
export function isEdit(rawLine) {
  const line = String(rawLine || '').trim();
  const toks = tokenize(line);
  const cmd = toks[0];
  if (['rm', 'tee', 'truncate'].includes(cmd)) return true;
  if (cmd === 'sed' && toks.some((t) => t === '-i' || t.startsWith('-i'))) return true;
  if (['nano', 'vi', 'vim', 'emacs'].includes(cmd)) return true;
  if (/\s(>>|>)\s*\S+\s*$/.test(line) && /^(echo|printf|:)\b/.test(line)) return true;
  return false;
}
