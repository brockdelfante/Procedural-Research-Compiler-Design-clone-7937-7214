import { systemLog } from './logger';

const STORAGE_KEY = 'temp_research_db';

/**
 * Simulates the local temp_research.json file for crash recovery
 */
export const PersistenceService = {
  save: (data) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      systemLog.debug('State persisted to temp_research.json');
    } catch (e) {
      systemLog.error('Persistence failed', e);
    }
  },

  load: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      systemLog.error('Failed to load persistence', e);
      return null;
    }
  },

  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    systemLog.debug('temp_research.json cleared');
  }
};