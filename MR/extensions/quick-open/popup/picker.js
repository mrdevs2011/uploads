import { listDir, hasFileAccess, normalizeDir, enterDir, filePath, parentDir } from '../lib/fs.js';

/**
 * Small file manager. Folders are only for navigating; only FILES can be picked.
 * Locked to /home/muhamad/ — cannot go above it, path is read-only (gray),
 * UI shows only "/" (root is hidden from user), and dotfiles are hidden.
 * onPick(path) -> file chosen | onCancel() -> closed | onNavigate(dir) -> remember last folder
 */
export function createPicker({ onPick, onCancel, onNavigate }) {
  const $ = (s) => document.querySelector(s);
  const root = $('#picker');
  const pathInput = $('#pk-path');
  const filterInput = $('#pk-filter');
  const list = $('#pk-list');
  const note = $('#pk-note');
  const access = $('#pk-access');
  const upBtn = $('#pk-up');

  // Fixed root — never leave this folder tree
  const ROOT = '/home/muhamad/';
  let dir = ROOT;
  let entries = [];

  // Path input is always gray + read-only
  pathInput.readOnly = true;
  pathInput.classList.add('locked');
  pathInput.placeholder = '/';

  function isInsideRoot(p) {
    const n = normalizeDir(p);
    return n === ROOT || n.startsWith(ROOT);
  }

  /** Real path -> what user sees in the UI (ROOT becomes "/") */
  function toDisplayPath(real) {
    const n = normalizeDir(real);
    if (n === ROOT) return '/';
    if (n.startsWith(ROOT)) return '/' + n.slice(ROOT.length);
    return '/';
  }

  function render() {
    const q = filterInput.value.trim().toLowerCase();
    const rows = entries
      .filter((e) => !e.name.startsWith('.'))                 // hide dotfiles
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .map(renderEntry);
    list.replaceChildren(...rows);
  }

  function renderEntry(entry) {
    const li = document.createElement('li');
    li.className = 'row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'open entry' + (entry.isDir ? ' dir' : '');
    btn.textContent = entry.isDir ? entry.name.replace(/\/+$/, '') + '/' : entry.name;
    btn.title = entry.name;
    btn.addEventListener('click', () =>
      entry.isDir ? go(enterDir(dir, entry.name)) : onPick(filePath(dir, entry.name)),
    );
    li.append(btn);
    return li;
  }

  async function go(target) {
    let next = normalizeDir(target);

    // Never allow leaving the locked root
    if (!isInsideRoot(next)) {
      next = ROOT;
    }

    note.hidden = true;
    try {
      entries = await listDir(next);
    } catch (err) {
      pathInput.value = toDisplayPath(dir);
      note.textContent = `Cannot open ${toDisplayPath(next)} (${err.message}).`;
      note.hidden = false;
      return;
    }
    dir = next;
    pathInput.value = toDisplayPath(dir);   // show only "/" to the user
    filterInput.value = '';
    // Disable ".." when already at root
    upBtn.disabled = (dir === ROOT);
    onNavigate(dir);
    render();
    list.scrollTop = 0;
  }

  async function open(startDir) {
    root.hidden = false;
    access.hidden = true;
    note.hidden = true;
    list.replaceChildren();
    if (!(await hasFileAccess())) {
      access.hidden = false;
      return;
    }
    // Force start inside locked root
    await go(isInsideRoot(startDir) ? startDir : ROOT);
    filterInput.focus();
  }

  function hide() { root.hidden = true; }

  upBtn.addEventListener('click', () => {
    if (dir === ROOT) return;          // already at locked root
    go(parentDir(dir));
  });
  $('#pk-cancel').addEventListener('click', onCancel);
  $('#pk-cancel2').addEventListener('click', onCancel);
  $('#pk-settings').addEventListener('click', () =>
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }),
  );
  filterInput.addEventListener('input', render);

  // Path is read-only — ignore Enter / typing
  pathInput.addEventListener('keydown', (e) => e.preventDefault());

  return { open, hide };
}
