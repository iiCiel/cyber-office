// Everything the player has done today: objectives, flags, and every security-relevant choice.
// The end-of-day report reads from here. Saved to localStorage so a refresh doesn't lose the day.

const KEY = 'cyber-office:day1:v1';

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.visited = [];
    this.flags = { badgeActive: false };
    this.mail = {}; // emailId -> { read, reported, deleted, replied, clicked: [linkIds], enteredCreds, sentGiftCards }
    this.events = []; // { t: gameMinutes, type, ...details } in order, for the report and consequences
    this.minutes = null;
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

  save() {
    try {
      const { visited, flags, mail, events, minutes } = this;
      localStorage.setItem(KEY, JSON.stringify({ visited, flags, mail, events, minutes }));
    } catch {
      // Private mode or storage full: the game still works, it just won't survive a refresh.
    }
  }

  /** Returns true if a saved day was restored. */
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return false;
      this.visited = Array.isArray(d.visited) ? d.visited : [];
      this.flags = { ...this.flags, ...(d.flags || {}) };
      this.mail = d.mail && typeof d.mail === 'object' ? d.mail : {};
      this.events = Array.isArray(d.events) ? d.events : [];
      this.minutes = typeof d.minutes === 'number' ? d.minutes : null;
      return true;
    } catch {
      return false;
    }
  }

  static clearSave() {
    try {
      localStorage.removeItem(KEY);
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
}
