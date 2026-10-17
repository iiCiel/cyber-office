// Everything the player has done: the current day (objectives, flags, every security-relevant choice)
// plus the campaign (past days' results and the flags that carry over to later days).
// Saved to localStorage so a refresh doesn't lose progress.

const KEY = 'cyber-office:save:v2';
const OLD_KEYS = ['cyber-office:day1:v1'];

export class GameState {
  constructor() {
    this.day = 1;
    this.campaign = { history: [], carry: {} };
    this.reset();
  }

  // Per-day state. startDay() calls this; the campaign survives.
  reset() {
    this.visited = [];
    this.flags = { badgeActive: false };
    this.mail = {}; // emailId -> { read, reported, deleted, replied, clicked, hovered, enteredCreds, macroEnabled, ... }
    this.events = []; // { t: gameMinutes, type, ...details }
    this.minutes = null;
    this.soc = { alerts: {}, flagged: [], cases: {}, viewed: [], lookups: [] }; // alerts: id -> minute fired
    this.enc = {}; // encounters: id -> { ringingAt, answered, outcome, done, ... }
    this.tickets = {}; // ticketId -> chosen option id
    this.term = { history: [] };
    this.crisis = null; // Day 5: { startedAt, elapsed, stoppedAt }
    this.dayOver = false;
  }

  startDay(n) {
    this.day = n;
    this.reset();
    this.save();
  }

  /** Record the finished day in the campaign (called once, when the report is shown). */
  recordDay(result, carry) {
    const h = this.campaign.history.filter((d) => d.day !== this.day);
    h.push({
      day: this.day,
      grade: result.grade,
      pct: result.pct,
      cost: result.cost,
      points: result.points,
      max: result.max,
      items: result.items.map((i) => ({ id: i.id, title: i.title, outcome: i.outcome, area: i.area })),
      skills: result.skills,
    });
    this.campaign.history = h.sort((a, b) => a.day - b.day);
    this.campaign.carry = { ...this.campaign.carry, ...carry };
    this.save();
  }

  /** In-game minute the player typed their password into a phishing page today, or null. */
  phishedAt() {
    return this.events.find((e) => e.type === 'creds-entered')?.t ?? null;
  }

  mailState(id) {
    if (!this.mail[id]) this.mail[id] = { read: false, reported: false, deleted: false, replied: false, clicked: [] };
    return this.mail[id];
  }

  log(type, details = {}) {
    this.events.push({ t: this.minutes, type, ...details });
    this.save();
  }

  hasEvent(type, match = {}) {
    return this.events.some((e) => e.type === type && Object.entries(match).every(([k, v]) => e[k] === v));
  }

  toJSON() {
    const { day, campaign, visited, flags, mail, events, minutes, soc, enc, tickets, term, crisis, dayOver } = this;
    return { day, campaign, visited, flags, mail, events, minutes, soc, enc, tickets, term, crisis, dayOver };
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this));
    } catch {
      // Private mode or storage full: the game still works, it just won't survive a refresh.
    }
  }

  /** Returns true if a saved game was restored. */
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return false;
      const obj = (v, def) => (v && typeof v === 'object' && !Array.isArray(v) ? v : def);
      this.day = Number.isInteger(d.day) && d.day >= 1 ? d.day : 1;
      this.campaign = {
        history: Array.isArray(d.campaign?.history) ? d.campaign.history : [],
        carry: obj(d.campaign?.carry, {}),
      };
      this.visited = Array.isArray(d.visited) ? d.visited : [];
      this.flags = { ...this.flags, ...obj(d.flags, {}) };
      this.mail = obj(d.mail, {});
      this.events = Array.isArray(d.events) ? d.events : [];
      this.minutes = typeof d.minutes === 'number' ? d.minutes : null;
      this.soc = { ...this.soc, ...obj(d.soc, {}) };
      for (const k of ['flagged', 'viewed', 'lookups']) if (!Array.isArray(this.soc[k])) this.soc[k] = [];
      for (const k of ['alerts', 'cases']) this.soc[k] = obj(this.soc[k], {});
      this.enc = obj(d.enc, {});
      this.tickets = obj(d.tickets, {});
      this.term = { history: Array.isArray(d.term?.history) ? d.term.history : [] };
      this.crisis = obj(d.crisis, null);
      this.dayOver = !!d.dayOver;
      return true;
    } catch {
      return false;
    }
  }

  static clearSave() {
    try {
      localStorage.removeItem(KEY);
      for (const k of OLD_KEYS) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  static hasSave() {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  }

  /** Peek at the saved day number without loading everything (for the title screen). */
  static savedSummary() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return d ? { day: d.day || 1, dayOver: !!d.dayOver, history: d.campaign?.history || [] } : null;
    } catch {
      return null;
    }
  }
}
