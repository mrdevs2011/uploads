// All data lives in chrome.storage.local (stays in this browser profile).
// Shape: { tab: 'url' | 'file', items: [{ id, type, name, value }] }

const KEY = 'quickopen';
const DEFAULT_STATE = { tab: 'url', items: [] };

export async function load() {
  const data = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_STATE, ...(data[KEY] || {}) };
}

export function save(state) {
  return chrome.storage.local.set({ [KEY]: state });
}
