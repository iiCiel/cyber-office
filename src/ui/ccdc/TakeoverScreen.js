// What the VyOS console showed after the red team overwrote its boot disk (Nov 14, session 1), replaced here by an
// ORIGINAL animation (not the art from the day): the red team's goose waddles across a dead console leaving
// footprints and honking, looping forever while no keys do anything. If the router was rebooted, the SeaBIOS boot menu comes first, matched to the
// team's screenshots (docs/reference/vyos-bootmenu*.png): 1 boots the disk (the animation), 2/4/5 try iPXE and fail.
//   const t = new TakeoverScreen({ menu: true }); host.append(t.el); ... t.destroy();
import { h, clear } from '../dom.js';

const BIOS = ['SeaBIOS (version rel-1.16.3-0-ga6ed6b701f0a-prebuilt.qemu.org)', 'Machine UUID 01bbcf0f-2a42-4341-be23-2879414d9f17', 'Select boot device:', '',
  '1. virtio-scsi Drive QEMU QEMU HARDDISK 2.5+', '2. iPXE (PCI 00:12.0)', '3. Legacy option rom', '4. iPXE (PCI 00:13.0)', '5. iPXE (PCI 00:14.0)', ''];
const IPXE = (pci, net) => ['', 'Booting from ROM...', `iPXE (PCI ${pci}) starting execution...ok`, 'iPXE initialising devices...ok', '', '', '',
  'iPXE 1.20.1+ (g4bd0) -- Open Source Network Boot Firmware -- http://ipxe.org', 'Features: DNS HTTP iSCSI TFTP AoE ELF MBOOT PXE bzImage Menu PXEXT', '',
  `${net}: bc:24:11:c9:e3:3b using virtio-net on 0000:${pci} (open)`, '  [Link:up, TX:0 TXE:0 RX:0 RXE:0]', `Configuring (${net} bc:24:11:c9:e3:3b)................ No configuration methods succeeded (http://ipxe.org/040ee119)`, 'No more network devices', '', 'iPXE> (press any key to go back to the boot menu)'];

// 12x10 pixel goose, facing right: W white, O orange beak/feet, K eye, G grey wing.
const GOOSE = [
  '.......WWW..',
  '......WWKWOO',
  '......WWWW..',
  '......WWW...',
  '.WWW..WWW...',
  'WWWWWWWWW...',
  'WGGGGGWWW...',
  '.WGGGGWWW...',
  '..WWWWWW....',
  '...O..O.....',
];
const PAL = { W: '#ffffff', O: '#ff9a1f', K: '#111111', G: '#c9cfd8' };

export class TakeoverScreen {
  constructor({ menu = false } = {}) {
    this.mode = menu ? 'menu' : 'anim';
    this.el = h('div', { class: 'tk', tabindex: '0', 'aria-label': 'VyOS console', onkeydown: (e) => this.key(e) });
    this.raf = 0;
    this.t0 = 0;
    this.draw();
  }

  draw() {
    cancelAnimationFrame(this.raf);
    clear(this.el);
    if (this.mode === 'anim') {
      this.canvas = h('canvas', { class: 'tk-canvas', width: 640, height: 400, 'data-mode': 'anim', role: 'img', 'aria-label': 'Console replaced by a looping animation; no keys do anything' });
      this.el.append(this.canvas);
      this.loop = (ts) => { this.frame(ts); this.raf = requestAnimationFrame(this.loop); };
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const lines = this.mode === 'menu' ? [...BIOS, '_'] : this.mode;
    this.el.append(h('pre', { class: 'tk-text', 'data-mode': this.mode === 'menu' ? 'menu' : 'ipxe' }, lines.join('\n')));
    if (this.mode === 'menu') {
      this.el.append(h('div', { class: 'tk-keys' }, [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: 'tk-key', 'data-key': n, onclick: () => this.choose(n) }, String(n)))));
    }
  }

  key(e) {
    if (this.mode === 'anim') return; // nothing answers any more
    if (this.mode === 'menu' && /^[1-5]$/.test(e.key)) this.choose(Number(e.key));
    else if (this.mode !== 'menu') { this.mode = 'menu'; this.draw(); }
  }

  choose(n) {
    if (n === 1) { this.mode = 'anim'; this.draw(); return; }
    if (n === 3) { this.mode = [...BIOS, '', 'Booting from ROM...', '(no bootable option ROM)', '', '(press any key to go back to the boot menu)']; this.draw(); return; }
    const pci = n === 2 ? '00:12.0' : n === 4 ? '00:13.0' : '00:14.0';
    this.mode = [...BIOS, ...IPXE(pci, n === 2 ? 'net0' : n === 4 ? 'net1' : 'net2')];
    this.draw();
  }

  frame(ts) {
    const c = this.canvas; if (!c) return;
    const x = c.getContext('2d'); if (!x) return;
    if (!this.t0) this.t0 = ts;
    const t = (ts - this.t0) / 1000;
    const W = c.width; const H = c.height; const P = 8;
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H);
    // the last console lines, frozen and dim
    x.fillStyle = '#4a4a4a'; x.font = '14px monospace';
    ['vyos@EdgeRouter:~$ show interfaces', 'eth0  172.16.101.1/24  u/u  Internal', 'eth2  172.31.34.2/29   u/u  External', 'vyos@EdgeRouter:~$ _'].forEach((l, i) => x.fillText(l, 12, 22 + i * 18));
    // the goose waddles left to right, bobbing, then starts again
    const lap = 7;
    const p = (t % lap) / lap;
    const gx = Math.round(-120 + p * (W + 160));
    const gy = 250 + (Math.floor(t * 6) % 2) * 3;
    // footprints behind it
    x.fillStyle = '#ff9a1f';
    for (let fx = gx - 30; fx > -20; fx -= 34) { const fy = 334 + ((Math.round(fx / 34) % 2) ? 6 : 0); x.fillRect(fx, fy, 6, 3); x.fillRect(fx + 2, fy - 4, 2, 4); }
    const step = Math.floor(t * 6) % 2;
    GOOSE.forEach((row, ry) => [...row].forEach((ch, rx) => {
      if (ch === '.') return;
      if (ry === 9) { if ((rx === 3) !== !!step) return; }
      x.fillStyle = PAL[ch]; x.fillRect(gx + rx * P, gy + ry * P, P, P);
    }));
    // HONK every other second
    if (Math.floor(t) % 2 === 0) {
      x.fillStyle = '#ffffff'; x.fillRect(gx + 100, gy - 34, 74, 26); x.fillRect(gx + 104, gy - 8, 8, 8);
      x.fillStyle = '#0b0b0b'; x.font = 'bold 16px monospace'; x.fillText('HONK', gx + 116, gy - 15);
    }
    x.fillStyle = '#8a8a8a'; x.font = '13px monospace'; x.fillText('you are now the incident.', W - 230, H - 16);
  }

  tick() {}
  destroy() { cancelAnimationFrame(this.raf); this.el.remove(); }
}
