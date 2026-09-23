import { load, save } from '../lib/storage.js';
import { openItem } from '../lib/open.js';
import { defaultName, cleanValue } from '../lib/resolve.js';
import { createPicker } from './picker.js';

const $ = (sel) => document.querySelector(sel);
const el = {
  main:   $('#view-main'),
  tabs:   document.querySelectorAll('.tab'),
  btnNew: $('#btn-new'),
  form:   $('#form'),
  value:  $('#f-value'),
  name:   $('#f-name'),
  cancel: $('#f-cancel'),
  list:   $('#list'),
  empty:  $('#empty'),
  msg:    $('#msg'),
  close:  $('#btn-close'),
};

const NEW_LABEL   = { url: '+ new bookmark', file: '+ pick file' };
const EMPTY_TEXT  = {
  url:  'No URLs yet. Add one with "new bookmark".',
  file: 'No files yet. Choose one with "pick file".',
};
const URL_PLACEHOLDER = 'google.com  |  localhost:3000  |  any text to search';

let state;
let picker;
let editingId = null;

/* ---------- render ---------- */

function render() {
  el.tabs.forEach((t) => {
    const on = t.dataset.tab === state.tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });

  el.btnNew.textContent = NEW_LABEL[state.tab];
  el.value.placeholder = URL_PLACEHOLDER;

  const items = state.items.filter((i) => i.type === state.tab);
  el.list.replaceChildren(...items.map(renderRow));
  el.empty.hidden = items.length > 0;
  el.empty.textContent = EMPTY_TEXT[state.tab];
}

function renderRow(item) {
  const li = document.createElement('li');
  li.className = 'row';

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'open';
  open.title = item.value;
  open.innerHTML = '<span class="name"></span><span class="path"></span>';
  open.querySelector('.name').textContent = item.name;
  open.querySelector('.path').textContent = item.value;
  open.addEventListener('click', () => launch(item));

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    actionBtn(item.type === 'file' ? 'rename' : 'edit', 'act', () => openForm(item)),
    actionBtn('del', 'act del', () => remove(item.id)),
  );

  li.append(open, actions);
  return li;
}

function actionBtn(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- actions ---------- */

async function launch(item) {
  try {
    await openItem(item);
    window.close();
  } catch (err) {
    showMsg(`Could not open: ${err.message}`);
  }
}

async function remove(id) {
  state.items = state.items.filter((i) => i.id !== id);
  await save(state);
  render();
}

async function submit(e) {
  e.preventDefault();
  const value = cleanValue(state.tab, el.value.value);
  if (!value) return el.value.focus();
  const name = el.name.value.trim() || defaultName(state.tab, value);

  if (editingId) {
    const item = state.items.find((i) => i.id === editingId);
    if (item) Object.assign(item, { name, value });
  } else {
    state.items.push({ id: crypto.randomUUID(), type: state.tab, name, value });
  }

  await save(state);
  closeForm();
  render();
}

/* ---------- form ---------- */

// url tab: path field is editable. file tab: path comes from the file manager (readonly), only the name is typed.
function openForm(item = null, pickedPath = '') {
  const isFile = state.tab === 'file';
  editingId = item ? item.id : null;

  el.value.readOnly = isFile;
  el.value.value = item ? item.value : pickedPath;
  el.name.value = item ? item.name : pickedPath ? defaultName('file', pickedPath) : '';

  el.form.hidden = false;
  el.btnNew.hidden = true;
  hideMsg();

  if (isFile) { el.name.focus(); el.name.select(); }
  else el.value.focus();
}

function closeForm() {
  editingId = null;
  el.form.reset();
  el.form.hidden = true;
  el.btnNew.hidden = false;
}

/* ---------- file manager ---------- */

function startDir() {
  // Always start (and stay) inside /home/muhamad/
  return '/home/muhamad/';
}

function openPicker() {
  hideMsg();
  el.main.hidden = true;
  picker.open(startDir());
}

function closePicker() {
  picker.hide();
  el.main.hidden = false;
}

function onPick(path) {
  closePicker();
  openForm(null, path);
}

async function onNavigate(dir) {
  state.lastDir = dir;
  await save(state);
}

/* ---------- messages ---------- */

function showMsg(text) { el.msg.textContent = text; el.msg.hidden = false; }
function hideMsg()     { el.msg.hidden = true; }

/* ---------- wiring ---------- */

el.tabs.forEach((t) =>
  t.addEventListener('click', async () => {
    if (state.tab === t.dataset.tab) return;
    state.tab = t.dataset.tab;
    closePicker();
    closeForm();
    hideMsg();
    await save(state);
    render();
  }),
);

el.btnNew.addEventListener('click', () => (state.tab === 'file' ? openPicker() : openForm()));
el.cancel.addEventListener('click', closeForm);
el.form.addEventListener('submit', submit);
el.close.addEventListener('click', () => window.close());

// Esc closes. Ctrl+, closes too (toggle) — e.code, so it works on any keyboard layout.
document.addEventListener('keydown', (e) => {
  const toggle = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'Comma';
  if (e.key === 'Escape' || toggle) {
    e.preventDefault();
    window.close();
  }
});

(async function init() {
  state = await load();
  picker = createPicker({ onPick, onCancel: closePicker, onNavigate });
  render();
})();
