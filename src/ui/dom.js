// Tiny DOM builder. All text goes in through textContent, never innerHTML, so email bodies,
// log lines and anything else from data files can't inject markup.
//
//   h('div', { class: 'row', onclick: fn, dataset: { id: 'x' } }, 'text', h('b', {}, 'child'))
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Place an HTML screen over the game canvas. `area` is the screen's rectangle in the game's logical
// 960x720 space. Normally the screen is laid out at that size and scaled with the canvas, so it lines
// up with the pixel art. When the canvas is small (a phone in landscape, a narrow window) that makes
// text tiny, so instead the screen fills the whole viewport at close to 1:1 ("compact" mode) and is
// laid out at whatever logical size that gives. Returns true when compact.
export function placeOnCanvas(el, canvas, area, { minW = 700, viewW = 960, reserveBottom = 0 } = {}) {
  const r = canvas.getBoundingClientRect();
  const k = r.width / viewW;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const kc = Math.min(1, vw / minW);
  const compact = kc > k * 1.15;
  if (compact) {
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.width = `${vw / kc}px`;
    el.style.height = `${(vh - reserveBottom) / kc}px`;
    el.style.transform = `scale(${kc})`;
  } else {
    el.style.left = `${r.left + area.x * k}px`;
    el.style.top = `${r.top + area.y * k}px`;
    el.style.width = `${area.w}px`;
    el.style.height = `${area.h}px`;
    el.style.transform = `scale(${k})`;
  }
  el.classList.toggle('compact', compact);
  return compact;
}
