// Everything the player has done: the current day (objectives, flags, every security-relevant choice)
// plus the campaign (past days' results and the flags that carry over to later days).
// Saved to localStorage so a refresh doesn't lose progress.

const KEY = 'cyber-office:save:v2';
// Case Files (real-breach recreations) save separately, so playing one never touches the week.
const CASE_KEY = 'cyber-office:case:v1';
const keyFor = (caseMode) => (caseMode ? CASE_KEY : KEY);
const OLD_KEYS = ['cyber-office:day1:v1'];

export class GameState {
  constructor({ caseMode = false } = {}) {
    this.key = keyFor(caseMode);
    this.caseId = null; // set in Case Files mode: which real breach is being replayed
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
    this.term = { history: [], ps: [] };
    this.crisis = null; // Day 5: { startedAt, elapsed, stoppedAt }
    this.dayOver = false;
    this.difficulty = null; // 'trainee' | 'analyst' | 'senior', the level the day was (last) played on
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
    const { day, caseId, campaign, visited, flags, mail, events, minutes, soc, enc, tickets, term, crisis, dayOver, difficulty } = this;
    return { day, caseId, campaign, visited, flags, mail, events, minutes, soc, enc, tickets, term, crisis, dayOver, difficulty };
  }

  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this));
    } catch {
      // Private mode or storage full: the game still works, it just won't survive a refresh.
    }
  }

  /** Returns true if a saved game was restored. */
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return false;
      const obj = (v, def) => (v && typeof v === 'object' && !Array.isArray(v) ? v : def);
      this.day = Number.isInteger(d.day) && d.day >= 1 ? d.day : 1;
      this.caseId = typeof d.caseId === 'string' ? d.caseId : null;
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
      this.term = { history: Array.isArray(d.term?.history) ? d.term.history : [], ps: Array.isArray(d.term?.ps) ? d.term.ps : [] };
      this.crisis = obj(d.crisis, null);
      this.dayOver = !!d.dayOver;
      this.difficulty = typeof d.difficulty === 'string' ? d.difficulty : null;
      return true;
    } catch {
      return false;
    }
  }

  static clearSave(caseMode = false) {
    try {
      localStorage.removeItem(keyFor(caseMode));
      if (!caseMode) for (const k of OLD_KEYS) localStorage.removeItem(k);
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

// Best result per case file, kept across replays (for the Case Files menu).
const BEST_KEY = 'cyber-office:cases:best';
export function caseBests() {
  try {
    const d = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}
export function recordCaseBest(id, result) {
  const all = caseBests();
  const prev = all[id];
  if (!prev || result.pct > prev.pct) all[id] = { grade: result.grade, pct: result.pct, at: new Date().toISOString().slice(0, 10) };
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return all[id];
}
