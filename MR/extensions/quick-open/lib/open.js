import { toFileUrl, resolveUrl } from './resolve.js';

/** Opens a bookmark in a NEW tab (target=_blank behaviour). */
export async function openItem(item) {
  if (item.type === 'file') {
    return chrome.tabs.create({ url: toFileUrl(item.value) });
  }
  const r = resolveUrl(item.value);
  if (!r) return;
  if (r.search) {
    return chrome.search.query({ text: r.search, disposition: 'NEW_TAB' });
  }
  return chrome.tabs.create({ url: r.url });
}
