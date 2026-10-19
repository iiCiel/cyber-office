import { h } from './dom.js';

// Splunk's JSON event viewer: keys on the left, plain values, and { [-] / { [+] toggles on every object and array.
// All text goes through textContent (the h() builder), so log content can never inject markup.

const isObj = (v) => v !== null && typeof v === 'object';

function scalar(v) {
  if (v === null) return h('span', { class: 'jv null' }, 'null');
  if (typeof v === 'string') return h('span', { class: 'jv str' }, v);
  return h('span', { class: `jv ${typeof v}` }, String(v));
}

function node(value, depth, openDepth) {
  const arr = Array.isArray(value);
  const keys = Object.keys(value);
  const [open, close] = arr ? ['[', ']'] : ['{', '}'];
  const wrap = h('span', { class: 'jn' });
  let expanded = depth < openDepth;
  const render = () => {
    wrap.textContent = '';
    const toggle = h('button', { type: 'button', class: 'jt', 'aria-expanded': String(expanded), title: expanded ? 'Collapse' : 'Expand', onclick: (e) => { e.stopPropagation(); expanded = !expanded; render(); } }, `${open} [${expanded ? '-' : '+'}]`);
    wrap.append(toggle);
    if (!keys.length) {
      wrap.append(` ${close}`);
      return;
    }
    if (!expanded) {
      wrap.append(` ${close}`);
      return;
    }
    const body = h('span', { class: 'jb' });
    for (const k of keys) {
      const v = value[k];
      body.append(h('span', { class: 'jl' }, h('span', { class: 'jk' }, arr ? `${k}` : k), ': ', isObj(v) ? node(v, depth + 1, openDepth) : scalar(v)));
    }
    wrap.append(body, h('span', { class: 'jc' }, close));
  };
  render();
  return wrap;
}

/** @param {any} value parsed JSON   @param {{open?: number}} o open = how many levels start expanded (1 = just the top level). */
export function jsonTree(value, { open = 1 } = {}) {
  return h('div', { class: 'json' }, isObj(value) ? node(value, 0, open) : scalar(value));
}
