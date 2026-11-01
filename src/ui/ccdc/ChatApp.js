// Team chat (CCDC teams live in Discord; this is a small Discord-styled channel view). Teammates are scripted by
// seat and react to the game: engine events, scored services flipping red/green, plus timed banter. The player can
// type; a teammate answers when the message touches their area.
//
//   const chat = new ChatApp({ state, clock }); host.append(chat.el); chat.refresh() each second; chat.unreadCount()
import { h, clear } from '../dom.js';
import './chat.css';

export const CHANNELS = ['general', 'linux', 'windows', 'network', 'injects'];

export const TEAMMATES = {
  captain: { name: 'dana.captain', label: 'Dana', role: 'Captain', color: '#f0b132', area: 'general' },
  windows: { name: 'marcus_win', label: 'Marcus', role: 'Windows lead', color: '#5865f2', area: 'windows' },
  linux: { name: 'priya.sh', label: 'Priya', role: 'Linux lead', color: '#3ba55d', area: 'linux' },
  network: { name: 'tomas_net', label: 'Tomas', role: 'Network lead', color: '#eb459e', area: 'network' },
  ir: { name: 'jess.inj', label: 'Jess', role: 'IR / injects', color: '#e67e22', area: 'injects' },
  white: { name: 'whiteteam', label: 'White Team', role: 'Judges', color: '#dbdee1', area: 'general' },
  orange: { name: 'orange-users', label: 'Orange Team', role: 'Users', color: '#f47b67', area: 'general' },
};
const ME = { name: 'you', label: 'You', role: '', color: '#00a8fc' };

const SEAT_RULES = [
  [/edge-?fw|firewall|pfsense|\bnat\b|\brule/i, 'network'],
  [/\bdc01\b|\bws01\b|\bws0?\d\b|active directory|domain|\bad\b|smb|windows|powershell|spooler|\bdns\b/i, 'windows'],
  [/web01|db01|mail01|apache|mysql|postgres|postfix|dovecot|ssh|wordpress|linux|cron|\bdb\b/i, 'linux'],
  [/inject|memo|report|\bpcr\b|change request|policy/i, 'ir'],
];
const seatFor = (text) => { for (const [re, s] of SEAT_RULES) if (re.test(text)) return s; return null; };

const BANTER = [
  { at: 15, who: 'captain', ch: 'general', text: 'ok team, we are live. Everyone log into your boxes and post what OS and version you see.' },
  { at: 40, who: 'linux', ch: 'linux', text: 'web01 is Ubuntu 20.04 with Apache and WordPress. Checking who has shell accounts first.' },
  { at: 75, who: 'windows', ch: 'windows', text: 'dc01 up. Pulling the Domain Admins group before I touch anything.' },
  { at: 110, who: 'network', ch: 'network', text: 'Firewall rule list is wide open. I will not block anything until I know which ports are scored.' },
  { at: 150, who: 'captain', ch: 'general', text: 'Reminder: password changes on scored accounts need a PCR first. Tell Jess before you rotate.' },
  { at: 260, who: 'linux', ch: 'linux', text: 'Anyone seen odd entries in the web logs? I see a lot of POSTs to wp-login.' },
  { at: 330, who: 'windows', ch: 'windows', text: 'Found an account I do not recognise in a privileged group. Do not touch the real backup account.' },
  { at: 520, who: 'captain', ch: 'general', text: 'Halfway. Post status: green / yellow / red for your boxes.' },
  { at: 610, who: 'network', ch: 'network', text: 'Rules are tight now. If something scored goes red after this, tell me and I will check the firewall first.' },
  { at: 780, who: 'captain', ch: 'general', text: 'Last stretch. Do not make big changes now. Verify, do not break.' },
];

const fmtTs = (sec) => {
  const t = 9 * 3600 + Math.floor(sec);
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
};

export class ChatApp {
  constructor({ state, clock }) {
    this.state = state;
    this.clock = clock || (() => state.engine?.clock || 0);
    this.chat = state._chat ||= { msgs: [], evIdx: 0, fired: {}, pending: [], svc: null, read: {} };
    this.current = 'general';
    this.rendered = 0;
    this.el = h('div', { class: 'ch' });
    this.chanBtns = {};
    this.chanBadges = {};
    const list = h('div', { class: 'ch-side' },
      h('div', { class: 'ch-server' }, 'CCDC Blue Team'),
      h('div', { class: 'ch-chtitle' }, 'TEXT CHANNELS'),
      h('div', { class: 'ch-chlist' }, CHANNELS.map((c) => {
        const badge = h('span', { class: 'ch-badge' });
        this.chanBadges[c] = badge;
        const b = h('button', { type: 'button', class: 'ch-chan', onclick: () => this.open(c) }, h('span', { class: 'ch-hash' }, '#'), c, badge);
        this.chanBtns[c] = b;
        return b;
      })),
      h('div', { class: 'ch-me' }, h('span', { class: 'ch-avatar', style: { background: ME.color } }, 'Y'), h('span', { class: 'ch-mename' }, 'you')));
    this.head = h('div', { class: 'ch-head' });
    this.msgs = h('div', { class: 'ch-msgs' });
    this.input = h('input', {
      class: 'ch-input', type: 'text', autocomplete: 'off', 'aria-label': 'Message',
      onkeydown: (e) => { if (e.key === 'Enter') this._send(); e.stopPropagation(); },
    });
    this.el.append(list, h('div', { class: 'ch-main' }, this.head, this.msgs, h('div', { class: 'ch-inputwrap' }, this.input)));
    this.open('general');
    this.refresh();
  }

  _post(ch, who, text, at) { this.chat.msgs.push({ ch, who, text, at: Math.floor(at ?? this.clock()), id: this.chat.msgs.length }); }

  _send() {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    const now = this.clock();
    this._post(this.current, 'me', text, now);
    // Who answers: the seat named in the text, else the channel's owner, else the captain.
    let seat = seatFor(text);
    if (!seat) seat = { linux: 'linux', windows: 'windows', network: 'network', injects: 'ir' }[this.current] || null;
    const lower = text.toLowerCase();
    const replies = {
      network: 'Got it, I am checking the firewall rules now. Will post what I change.',
      windows: 'Copy. I will look at the domain controller and the workstation and report back.',
      linux: 'On it. I will check the Linux boxes and tell you before I restart anything.',
      ir: 'Noted. I will pick that up in the inject queue and keep the deadline in view.',
    };
    if (seat) this.chat.pending.push({ at: now + 5, ch: this.current, who: seat, text: replies[seat] });
    else this.chat.pending.push({ at: now + 5, ch: this.current, who: 'captain', text: /status/.test(lower) ? 'Thanks. Keep posting what you touch so we do not collide.' : 'Copy that. Keep the channel updated.' });
    this.refresh();
  }

  open(ch) {
    this.current = ch;
    this.chat.read[ch] = this.chat.msgs.filter((m) => m.ch === ch).length;
    for (const [c, b] of Object.entries(this.chanBtns)) b.classList.toggle('active', c === ch);
    clear(this.head);
    this.head.append(h('span', { class: 'ch-hash ch-hashlg' }, '#'), h('b', {}, ch), h('span', { class: 'ch-topic' }, {
      general: 'Team coordination. Post what you touch.', linux: 'web01, db01, mail01', windows: 'dc01, ws01', network: 'edge-fw', injects: 'Business tasks from white team',
    }[ch]));
    this.input.placeholder = `Message #${ch}`;
    this.rendered = 0;
    clear(this.msgs);
    this.refresh();
  }

  _ingest() {
    const eng = this.state.engine;
    const c = this.chat;
    const now = this.clock();
    for (const b of BANTER) {
      if (now >= b.at && !c.fired[b.at + b.who]) { c.fired[b.at + b.who] = 1; this._post(b.ch, b.who, b.text, b.at); }
    }
    for (let k = 0; k < c.pending.length; k++) {
      const p = c.pending[k];
      if (now >= p.at) { this._post(p.ch, p.who, p.text, p.at); c.pending.splice(k, 1); k--; }
    }
    if (eng) {
      while (c.evIdx < eng.events.length) {
        const e = eng.events[c.evIdx++];
        this._fromEvent(e);
      }
      // Scored service flips.
      const board = {};
      for (const s of this.state.serviceList) {
        const st = this.state.services[s.id];
        const pcrBreak = eng.pcr?.breaking && eng.pcr.service === s.id;
        board[s.id] = st.state === 'up' && !pcrBreak;
      }
      if (c.svc) {
        for (const s of this.state.serviceList) {
          if (c.svc[s.id] && !board[s.id]) {
            const seat = seatFor(`${s.host} ${s.name}`) || 'captain';
            this._post('general', 'captain', `${s.id} just went red on the scoreboard. Who touched ${/web/.test(s.id) ? 'apache' : s.name.toLowerCase()}?`, now);
            this._post(TEAMMATES[seat].area, seat, `Looking at ${s.host} now. I will say if it was one of my changes.`, now + 0);
          } else if (!c.svc[s.id] && board[s.id]) {
            this._post('general', 'captain', `${s.id} is green again. Nice. Please write down what fixed it.`, now);
          }
        }
      }
      c.svc = board;
    }
  }

  _fromEvent(e) {
    const t = e.text;
    const at = e.at;
    const seat = seatFor(t);
    if (e.cls === 'inject') {
      const m = t.match(/from (.+?): "(.+?)"/);
      this._post('injects', 'ir', m ? `New inject from ${m[1]}: "${m[2]}". I am reading it now, who can help with the technical details?` : t, at);
      this._post('general', 'captain', m ? `Inject from ${m[1]} is in the portal. Jess has it, answer her questions in #injects.` : 'New inject is in the portal.', at);
    } else if (e.cls === 'red') {
      this._post('general', 'captain', 'Red team just started a wave. Check your boxes for new accounts, cron jobs and listeners.', at);
      this._post('network', 'network', 'Seeing a spike in connections at the edge. Logging it.', at);
    } else if (e.cls === 'warn' && /Foothold/.test(t)) {
      const s = seat || 'linux';
      this._post(TEAMMATES[s].area, s, 'Something got a foothold on one of my boxes. Hunting it down before the next wave.', at);
    } else if (e.cls === 'warn' && /rotated/.test(t)) {
      this._post('injects', 'ir', 'Heads up: the scored account password was changed. The PCR has to be filed or that check will fail.', at);
    } else if (e.cls === 'ok' && /PCR/.test(t)) {
      this._post('injects', 'white', 'PCR accepted. Scoring credential updated.', at);
    } else if (e.cls === 'bad' && /SLA violation/.test(t)) {
      this._post('general', 'captain', `${t.replace('SLA violation: ', '')} That is an SLA hit, -points each time. Fix it now, explain later.`, at);
    } else if (e.cls === 'bad' && /Compromise confirmed/.test(t)) {
      this._post('general', 'captain', 'Red team confirmed a compromise. Someone write the incident report in #injects, it can recover part of the loss.', at);
    } else if (e.cls === 'bad' && /overdue/.test(t)) {
      this._post('injects', 'ir', 'We missed an inject deadline. Late submissions score zero, but submit anyway so the judges see it.', at);
    } else if (e.cls === 'team') {
      const m = t.match(/^\[(.+?)\]\s*(.*)$/);
      if (!m) return;
      const who = /white/i.test(m[1]) ? 'white' : /orange/i.test(m[1]) ? 'orange' : 'captain';
      this._post('general', who, m[2], at);
    }
  }

  unreadCount() {
    const other = this.chat._readOther || {};
    let n = 0;
    for (const c of CHANNELS) {
      const total = this.chat.msgs.filter((m) => m.ch === c && m.who !== 'me' && m.at <= this.clock() + 1).length;
      n += Math.max(0, total - (c === this.current ? total : other[c] || 0));
    }
    return n;
  }

  refresh() {
    this._ingest();
    const all = this.chat.msgs.filter((m) => m.ch === this.current && m.at <= this.clock() + 1).sort((a, b) => a.at - b.at || a.id - b.id);
    // Re-render only when the visible list changed (sorted order may shift if a reply is stamped earlier).
    const sig = all.map((m) => m.id).join(',');
    if (sig !== this._sig) {
      const atBottom = this.msgs.scrollHeight - this.msgs.scrollTop - this.msgs.clientHeight < 40;
      this._sig = sig;
      clear(this.msgs);
      let prev = null;
      for (const m of all) {
        const u = m.who === 'me' ? ME : TEAMMATES[m.who];
        const cont = prev && prev.who === m.who && m.at - prev.at < 120;
        this.msgs.append(cont
          ? h('div', { class: 'ch-msg ch-cont' }, h('span', { class: 'ch-ts' }, fmtTs(m.at)), h('div', { class: 'ch-text' }, m.text))
          : h('div', { class: 'ch-msg' },
            h('span', { class: 'ch-avatar', style: { background: u.color === '#dbdee1' ? '#4e5058' : u.color } }, u.label[0]),
            h('div', { class: 'ch-body' }, h('div', { class: 'ch-line' }, h('span', { class: 'ch-user', style: { color: u.color } }, u.name), u.role ? h('span', { class: 'ch-role' }, u.role) : null, h('span', { class: 'ch-time' }, `Today at ${fmtTs(m.at)}`)), h('div', { class: 'ch-text' }, m.text))));
        prev = m;
      }
      if (!all.length) this.msgs.append(h('div', { class: 'ch-empty' }, `This is the start of #${this.current}.`));
      if (atBottom || all.length < 4) this.msgs.scrollTop = this.msgs.scrollHeight;
    }
    // Unread bookkeeping per channel (messages from others the player has not seen yet).
    const other = (this.chat._readOther ||= {});
    for (const c of CHANNELS) {
      const n = this.chat.msgs.filter((m) => m.ch === c && m.who !== 'me' && m.at <= this.clock() + 1).length;
      if (c === this.current) other[c] = n;
      const un = Math.max(0, n - (other[c] || 0));
      const b = this.chanBadges[c];
      b.textContent = un ? String(un) : '';
      b.style.display = un ? '' : 'none';
      this.chanBtns[c].classList.toggle('ch-unread', !!un);
    }
  }

  destroy() { this.el.remove(); }
}
