// Mini file-system layer. The browser cannot hand us real paths from a file dialog,
// so we read Chrome's own "Index of ..." page for a folder (file:///C:/Users/...)
// and parse its rows. Needs host permission file:///* AND the per-extension
// "Allow access to file URLs" switch.

import { toFileUrl } from './resolve.js';

const STR = String.raw`"(?:[^"\\]|\\.)*"`;                                  // a JSON string literal
const ROW_RE = new RegExp(String.raw`addRow\((${STR}),${STR},(\d)`, 'g');    // addRow(name, url, isDir, ...)
const DRIVE = /^[A-Za-z]:\/?$/;

export function hasFileAccess() {
  return new Promise((resolve) => {
    try { chrome.extension.isAllowedFileSchemeAccess(resolve); }
    catch { resolve(false); }
  });
}

/** Any user input -> folder path with forward slashes and a trailing slash. */
export function normalizeDir(raw) {
  let p = raw.trim().replace(/^["']+|["']+$/g, '');
  if (!p) return '/';
  if (/^file:\/\//i.test(p)) {
    try { p = decodeURIComponent(new URL(p).pathname); } catch { /* keep as is */ }
    p = p.replace(/^\/([A-Za-z]:)/, '$1');
  }
  p = p.replace(/\\/g, '/');
  return p.endsWith('/') ? p : p + '/';
}

export const filePath = (dir, name) => dir + name;

export function enterDir(dir, name) {
  const n = name.replace(/\/+$/, '');
  if (dir === '/' && DRIVE.test(n)) return n + '/';   // "C:" -> "C:/"
  return dir + n + '/';
}

export function parentDir(dir) {
  if (dir === '/' || DRIVE.test(dir)) return '/';
  const trimmed = dir.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  return i <= 0 ? '/' : trimmed.slice(0, i + 1);
}

/** -> [{ name, isDir }] folders first, then files, natural sort. */
export async function listDir(dir) {
  const res = await fetch(toFileUrl(dir));
  const html = await res.text();
  if (!/start\(|addRow\(/.test(html)) throw new Error('Not a folder');

  const entries = [];
  for (const m of html.matchAll(ROW_RE)) {
    try {
      const name = JSON.parse(m[1]);
      if (name === '..' || name === '.') continue;      // parent link, we have our own ".." button
      const isDir = m[2] === '1' || (dir === '/' && DRIVE.test(name));
      entries.push({ name, isDir });
    } catch { /* skip unreadable row */ }
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return entries.sort((a, b) => (a.isDir === b.isDir ? collator.compare(a.name, b.name) : a.isDir ? -1 : 1));
}
