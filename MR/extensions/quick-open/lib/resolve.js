// Pure functions: raw user input -> something the browser can open.

const KNOWN_SCHEME = /^(https?|ftp|file|chrome|edge|brave|about|chrome-extension|view-source|data|mailto):/i;
const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?([/?#]|$)/i;
const HOST_PORT = /^[^\s/?#.]+:\d+([/?#]|$)/;
const DOMAIN = /^[^\s/?#]+\.[^\s/?#]{2,}([/?#]|$)/;

const stripQuotes = (s) => s.trim().replace(/^["']+|["']+$/g, '');
const encodePath = (p) => encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');

/** "C:\Users\MR\My File.html" -> "file:///C:/Users/MR/My%20File.html" */
export function toFileUrl(raw) {
  let p = stripQuotes(raw);
  if (/^file:\/\//i.test(p)) return p;

  p = p.replace(/\\/g, '/');
  if (p.startsWith('//')) return 'file:' + encodePath(p);          // UNC: \\server\share
  if (/^[a-zA-Z]:$/.test(p)) p += '/';                              // "D:" -> "D:/"
  if (/^[a-zA-Z]:\//.test(p)) return 'file:///' + encodePath(p);    // Windows drive
  if (!p.startsWith('/')) p = '/' + p;                              // Linux / macOS
  return 'file://' + encodePath(p);
}

/** Like the browser omnibox: URL if it looks like one, otherwise a search. */
export function resolveUrl(raw) {
  const t = raw.trim();
  if (!t) return null;
  if (KNOWN_SCHEME.test(t)) return { url: t };
  if (/\s/.test(t)) return { search: t };
  if (LOCAL_HOST.test(t) || HOST_PORT.test(t)) return { url: 'http://' + t };
  if (DOMAIN.test(t)) return { url: 'https://' + t };
  return { search: t };
}

/** Name suggestion when the name field is left empty. */
export function defaultName(type, value) {
  if (type === 'file') {
    const parts = stripQuotes(value).replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts.pop() || value;
  }
  try {
    return new URL(resolveUrl(value).url).hostname || value;
  } catch {
    return value;
  }
}

export function cleanValue(type, value) {
  return type === 'file' ? stripQuotes(value) : value.trim();
}
