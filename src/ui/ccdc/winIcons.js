// Small flat 16x16 icons in the look of the Windows 10 / Server 2019 admin tools (folder yellow, user blue, etc.),
// drawn as SVG and installed once as CSS background images (class names `i-*`). No emoji, no image files.

const ICONS = {
  folder: '<path d="M1 3h5l1.5 1.5H15V13.5H1z" fill="#dcb04a"/><path d="M1 6h14v7.5H1z" fill="#f6d778"/>',
  ou: '<path d="M1 3h5l1.5 1.5H15V13.5H1z" fill="#dcb04a"/><path d="M1 6h14v7.5H1z" fill="#f6d778"/><rect x="9" y="8" width="5" height="4" fill="#4a7fc1"/>',
  domain: '<circle cx="8" cy="8" r="6.3" fill="#3f7cc4"/><path d="M1.8 8h12.4M8 1.7c-3 3.4-3 9.2 0 12.6M8 1.7c3 3.4 3 9.2 0 12.6" stroke="#d6e6f7" fill="none" stroke-width="1"/>',
  aduc: '<rect x="1.5" y="2" width="13" height="10" fill="#d5dde8" stroke="#6a7a8c"/><circle cx="8" cy="6" r="2" fill="#3a6db8"/><path d="M4.5 11c0-2 1.5-3 3.5-3s3.5 1 3.5 3z" fill="#3a6db8"/><rect x="5" y="13" width="6" height="1.6" fill="#6a7a8c"/>',
  user: '<circle cx="8" cy="5" r="3.1" fill="#5b8dd6"/><path d="M2 14.5c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6z" fill="#2f63b0"/>',
  userdis: '<circle cx="7" cy="4.8" r="3" fill="#8aa7d4"/><path d="M1.5 14c0-3.4 2.4-5.3 5.5-5.3S12.5 10.6 12.5 14z" fill="#6f8fc4"/><path d="M12.2 8v5.2M9.6 11l2.6 2.8L14.8 11" stroke="#fff" stroke-width="3.4" fill="none"/><path d="M12.2 8v5.2M9.6 11l2.6 2.8L14.8 11" stroke="#111" stroke-width="1.8" fill="none"/>',
  group: '<circle cx="5.4" cy="5.5" r="2.5" fill="#7ea3dc"/><path d="M0.8 13.5c0-3 2-4.6 4.6-4.6s4.6 1.6 4.6 4.6z" fill="#4c7fc4"/><circle cx="10.8" cy="5" r="2.8" fill="#5b8dd6"/><path d="M5.8 14.6c0-3.4 2.3-5.3 5-5.3s5 1.9 5 5.3z" fill="#2f63b0"/>',
  comp: '<rect x="1.5" y="2" width="13" height="9" rx="1" fill="#5d6b7c"/><rect x="2.8" y="3.2" width="10.4" height="6.6" fill="#8ec1ea"/><rect x="6" y="11" width="4" height="2" fill="#5d6b7c"/><rect x="4" y="13" width="8" height="1.5" fill="#7a8796"/>',
  gear: '<circle cx="8" cy="8" r="4.6" fill="none" stroke="#6b7785" stroke-width="3" stroke-dasharray="2.1 1.6"/><circle cx="8" cy="8" r="3.4" fill="none" stroke="#6b7785" stroke-width="1.8"/>',
  task: '<rect x="1.5" y="1.5" width="10" height="12" fill="#f4f6f9" stroke="#8a98ab"/><circle cx="10.5" cy="10.5" r="4.3" fill="#3d7ec9" stroke="#fff"/><path d="M10.5 8v2.7l1.8 1" stroke="#fff" fill="none" stroke-width="1.2"/>',
  evt: '<rect x="2" y="1.5" width="11" height="13" fill="#f4f6f9" stroke="#7d8da3"/><path d="M4 5h7M4 7.5h7M4 10h5" stroke="#7d8da3"/><circle cx="12" cy="12" r="3" fill="#d83b01"/><path d="M12 10.4v2M12 13.3v.3" stroke="#fff" stroke-width="1.1"/>',
  log: '<rect x="2.5" y="1.5" width="11" height="13" fill="#f4f6f9" stroke="#7d8da3"/><path d="M4.5 5h7M4.5 7.5h7M4.5 10h5" stroke="#7d8da3"/>',
  key: '<circle cx="5" cy="8" r="3.2" fill="none" stroke="#c99a1e" stroke-width="1.8"/><path d="M8 8h6.5M12 8v2.4M14.2 8v2" stroke="#c99a1e" stroke-width="1.6" fill="none"/>',
  lock: '<rect x="3.5" y="7" width="9" height="7" rx="1" fill="#c99a1e"/><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" fill="none" stroke="#6f7782" stroke-width="1.6"/>',
  info: '<circle cx="8" cy="8" r="6.3" fill="#2a78c9"/><path d="M8 7v4.6" stroke="#fff" stroke-width="1.8"/><circle cx="8" cy="4.8" r="1" fill="#fff"/>',
  lusr: '<circle cx="5.4" cy="5.5" r="2.5" fill="#7ea3dc"/><path d="M0.8 13.5c0-3 2-4.6 4.6-4.6s4.6 1.6 4.6 4.6z" fill="#4c7fc4"/><rect x="8.5" y="7" width="7" height="5" fill="#5d6b7c"/><rect x="9.4" y="7.8" width="5.2" height="3.2" fill="#8ec1ea"/>',
  drive: '<rect x="1" y="5" width="14" height="7" rx="1" fill="#aab4c0" stroke="#7d8896"/><rect x="2.5" y="9.5" width="8" height="1.2" fill="#6b7785"/><circle cx="12.5" cy="10" r="0.9" fill="#3fb950"/>',
  dvd: '<circle cx="8" cy="8" r="6.3" fill="#d6dce4" stroke="#8793a2"/><circle cx="8" cy="8" r="1.8" fill="#fff" stroke="#8793a2"/>',
  ps: '<rect x="0.8" y="2" width="14.4" height="12" rx="1" fill="#2671be"/><path d="M3.8 5.2l3.6 2.8-3.6 2.8" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M8.6 11.2h3.8" stroke="#fff" stroke-width="1.5"/>',
  sm: '<rect x="2" y="1.5" width="12" height="13" rx="1" fill="#3d4f66"/><rect x="3.5" y="3" width="9" height="2.6" fill="#8ec1ea"/><rect x="3.5" y="6.6" width="9" height="2.6" fill="#8ec1ea"/><rect x="3.5" y="10.2" width="9" height="2.6" fill="#8ec1ea"/><circle cx="11" cy="4.3" r="0.7" fill="#3fb950"/>',
  explorer: '<path d="M1 3h5l1.5 1.5H15V13.5H1z" fill="#e0b13e"/><path d="M1 6.5h14v7H1z" fill="#f7d36a"/><rect x="1" y="12" width="14" height="1.6" fill="#3c8dd8"/>',
  recycle: '<path d="M3.5 4.5h9l-1 10h-7z" fill="#cfe4f5" stroke="#6c93b8"/><path d="M2.5 4h11M6 4V2.5h4V4" stroke="#6c93b8" fill="none"/><path d="M8 7v5M5.8 7l.4 5M10.2 7l-.4 5" stroke="#6c93b8"/>',
  back: '<circle cx="8" cy="8" r="6.3" fill="#3a9a45"/><path d="M12 8H4.8M7.6 4.8L4.4 8l3.2 3.2" stroke="#fff" stroke-width="1.8" fill="none"/>',
  fwd: '<circle cx="8" cy="8" r="6.3" fill="#3a9a45"/><path d="M4 8h7.2M8.4 4.8L11.6 8l-3.2 3.2" stroke="#fff" stroke-width="1.8" fill="none"/>',
  up: '<path d="M1 4h5l1.5 1.5H15V14H1z" fill="#e8c35c"/><path d="M8 12V7M5.6 9.2L8 6.6l2.4 2.6" stroke="#2b7a2b" stroke-width="1.8" fill="none"/>',
  tree: '<rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="#6b7785"/><path d="M6 2.5v11" stroke="#6b7785"/><path d="M2.6 5h2.4M2.6 7.5h2.4M2.6 10h2.4" stroke="#6b7785"/>',
  refresh: '<path d="M13 8a5 5 0 11-1.6-3.7" stroke="#2f9d3a" stroke-width="2" fill="none"/><path d="M13.3 1.8v4h-4z" fill="#2f9d3a"/>',
  props: '<rect x="2.5" y="1.5" width="11" height="13" fill="#fff" stroke="#6b7785"/><path d="M4.6 5h6.8M4.6 7.5h6.8M4.6 10h4" stroke="#6b7785"/><path d="M9 11.2l1.6 1.6 3-3.2" stroke="#2f9d3a" stroke-width="1.6" fill="none"/>',
  help: '<circle cx="8" cy="8" r="6.3" fill="#2a78c9"/><path d="M5.8 6.2a2.2 2.2 0 114.2.9c-.5.9-1.9 1.1-1.9 2.4" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="8.1" cy="11.8" r="0.9" fill="#fff"/>',
  stop: '<rect x="3.5" y="3.5" width="9" height="9" fill="#222"/>',
  play: '<path d="M4 2.5l9 5.5-9 5.5z" fill="#222"/>',
  filter: '<path d="M2 3h12l-4.6 5.6v4.4l-2.8-1.6V8.6z" fill="#8aa0ba" stroke="#5f738b"/>',
  'close-s': '<path d="M4 4l8 8M12 4l-8 8" stroke="#555" stroke-width="1.4"/>',
  flag: '<path d="M4 2v12" stroke="#fff" stroke-width="1.6"/><path d="M4.6 2.6h8l-2 3 2 3h-8z" fill="#fff"/>',
  'sm-dash': '<rect x="2" y="2" width="5" height="5" fill="#d4dae2"/><rect x="9" y="2" width="5" height="5" fill="#d4dae2"/><rect x="2" y="9" width="5" height="5" fill="#d4dae2"/><rect x="9" y="9" width="5" height="5" fill="#d4dae2"/>',
  'sm-local': '<rect x="4" y="1.5" width="8" height="13" fill="#d4dae2"/><rect x="5.4" y="3" width="5.2" height="1.4" fill="#4b5663"/><rect x="5.4" y="5.6" width="5.2" height="1.4" fill="#4b5663"/><circle cx="8" cy="11.5" r="1" fill="#4b5663"/>',
  'sm-all': '<rect x="1" y="3" width="6" height="10" fill="#d4dae2"/><rect x="9" y="3" width="6" height="10" fill="#d4dae2"/><rect x="2.2" y="4.6" width="3.6" height="1.2" fill="#4b5663"/><rect x="10.2" y="4.6" width="3.6" height="1.2" fill="#4b5663"/>',
  'sm-adds': '<rect x="2" y="2" width="12" height="12" fill="#d4dae2"/><path d="M5 6h6M5 8.5h6M5 11h4" stroke="#4b5663" stroke-width="1.2"/>',
  'sm-dns': '<circle cx="8" cy="8" r="6" fill="none" stroke="#d4dae2" stroke-width="1.6"/><path d="M2 8h12M8 2c-2.6 3-2.6 9 0 12M8 2c2.6 3 2.6 9 0 12" stroke="#d4dae2" fill="none"/>',
  'sm-file': '<rect x="2" y="3" width="12" height="4" fill="#d4dae2"/><rect x="2" y="9" width="12" height="4" fill="#d4dae2"/><circle cx="12" cy="5" r="0.8" fill="#4b5663"/><circle cx="12" cy="11" r="0.8" fill="#4b5663"/>',
  'sm-tile': '<rect x="2" y="2" width="12" height="12" fill="#4a8fd8"/><rect x="4" y="4" width="8" height="8" fill="none" stroke="#fff"/>',
};

const toUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${svg}</svg>`)}")`;

let installed = false;
export function installWinIcons() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const css = Object.entries(ICONS).map(([n, svg]) => `.wd .i-${n} { background-image: ${toUrl(svg)}; }`).join('\n');
  const st = document.createElement('style');
  st.setAttribute('data-wd-icons', '');
  st.textContent = css;
  document.head.append(st);
}
export const ICON_NAMES = Object.keys(ICONS);
