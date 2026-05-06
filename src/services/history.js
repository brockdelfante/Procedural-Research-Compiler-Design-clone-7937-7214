const HISTORY_KEY = 'research_history';
const MAX_ENTRIES = 20;

export const HistoryService = {
  save({ query, report, logs }) {
    const history = HistoryService.load();
    const entry = {
      id: Date.now(),
      query,
      date: new Date().toISOString(),
      report,
      logs,
    };
    history.unshift(entry);
    if (history.length > MAX_ENTRIES) history.splice(MAX_ENTRIES);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Storage quota exceeded — drop oldest and retry
      history.pop();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
    return entry;
  },

  load() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  remove(id) {
    const updated = HistoryService.load().filter(e => e.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  },

  clear() {
    localStorage.removeItem(HISTORY_KEY);
  },
};
