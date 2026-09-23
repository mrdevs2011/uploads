// ============================================================
// Disk Explorer — app.js
// ============================================================

const pathInput = document.getElementById('pathInput');
const minSizeInput = document.getElementById('minSize');
const scanBtn = document.getElementById('scanBtn');
const breadcrumbEl = document.getElementById('breadcrumb');
const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');

const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');

const overlay = document.getElementById('confirmOverlay');
const confirmPathEl = document.getElementById('confirmPath');
const cancelDeleteBtn = document.getElementById('cancelDelete');
const okDeleteBtn = document.getElementById('okDelete');

let pendingDeletePath = null;

// ---------------- Yordamchi funksiyalar ----------------

function formatBytes(bytes) {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (bytes >= GB) return (bytes / GB).toFixed(1) + 'G';
  return (bytes / MB).toFixed(0) + 'M';
}

function sizeTier(bytes) {
  const GB = 1024 * 1024 * 1024;
  if (bytes >= GB) return 'tier-high';
  if (bytes >= 300 * 1024 * 1024) return 'tier-mid';
  return 'tier-low';
}

// ---------------- Breadcrumb ----------------

function renderBreadcrumb(currentDir) {
  const parts = currentDir.split('/').filter(Boolean);
  let acc = '';
  breadcrumbEl.innerHTML = '';

  const rootCrumb = document.createElement('span');
  rootCrumb.className = 'crumb';
  rootCrumb.textContent = '/';
  rootCrumb.onclick = () => loadDir('/');
  breadcrumbEl.appendChild(rootCrumb);

  parts.forEach((part, i) => {
    acc += '/' + part;
    const isLast = i === parts.length - 1;

    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '/';
    breadcrumbEl.appendChild(sep);

    const crumb = document.createElement('span');
    crumb.className = 'crumb' + (isLast ? ' current' : '');
    crumb.textContent = part;
    const target = acc;
    if (!isLast) crumb.onclick = () => loadDir(target);
    breadcrumbEl.appendChild(crumb);
  });
}

// ---------------- Rows ----------------

function renderRows(entries) {
  rowsEl.innerHTML = '';

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Bu chegaradan katta fayl/papka topilmadi. "min MB" qiymatini kamaytirib ko\'r.';
    rowsEl.appendChild(li);
    return;
  }

  const maxSize = entries[0].size; // saralangan, birinchisi eng katta

  entries.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'row' + (entry.type === 'dir' ? ' is-dir' : '');

    const icon = document.createElement('span');
    icon.className = 'row-icon';
    icon.textContent = entry.type === 'dir' ? '📁' : '📄';
    li.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = entry.name;
    if (entry.type === 'dir') {
      name.onclick = () => loadDir(entry.path);
    }
    li.appendChild(name);

    const barWrap = document.createElement('span');
    barWrap.className = 'row-bar-wrap';
    const bar = document.createElement('span');
    bar.className = 'row-bar ' + sizeTier(entry.size);
    bar.style.width = Math.max(3, (entry.size / maxSize) * 100) + '%';
    barWrap.appendChild(bar);
    li.appendChild(barWrap);

    const size = document.createElement('span');
    size.className = 'row-size';
    size.textContent = formatBytes(entry.size);
    li.appendChild(size);

    const del = document.createElement('button');
    del.className = 'row-delete';
    del.textContent = "O'chirish";
    del.onclick = () => openConfirm(entry.path);
    li.appendChild(del);

    rowsEl.appendChild(li);
  });
}

// ---------------- Scan / navigate ----------------

let activeStream = null; // eski ulanishni to'xtatish uchun

function loadDir(dir) {
  const minMB = parseFloat(minSizeInput.value) || 100;
  pathInput.value = dir;
  rowsEl.innerHTML = '';

  // Agar oldingi scan hali tugamagan bo'lsa — uni to'xtatamiz,
  // aks holda ikkita scan aralashib ketishi mumkin.
  if (activeStream) activeStream.close();

  progressWrap.classList.remove('hidden');
  progressBar.style.width = '0%';
  statusEl.textContent = 'Skan boshlanmoqda...';

  const url = `/api/scan?dir=${encodeURIComponent(dir)}&minMB=${minMB}`;
  const stream = new EventSource(url);
  activeStream = stream;

  stream.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.kind === 'progress') {
      const pct = Math.round((data.index / data.total) * 100);
      progressBar.style.width = pct + '%';
      statusEl.textContent = `Hisoblanmoqda (${data.index}/${data.total}): ${data.name}`;
      return;
    }

    if (data.kind === 'done') {
      progressWrap.classList.add('hidden');
      renderBreadcrumb(data.dir);
      renderRows(data.entries);
      statusEl.textContent = `${data.entries.length} ta natija — ${minMB}MB dan katta`;
      stream.close();
      activeStream = null;
      return;
    }

    if (data.kind === 'error') {
      progressWrap.classList.add('hidden');
      statusEl.textContent = '⚠ ' + data.message;
      stream.close();
      activeStream = null;
    }
  };

  stream.onerror = () => {
    progressWrap.classList.add('hidden');
    statusEl.textContent = '⚠ Server bilan bog\'lanib bo\'lmadi.';
    stream.close();
    activeStream = null;
  };
}

// ---------------- Delete flow ----------------

function openConfirm(targetPath) {
  pendingDeletePath = targetPath;
  confirmPathEl.textContent = targetPath;
  overlay.classList.remove('hidden');
}

function closeConfirm() {
  pendingDeletePath = null;
  overlay.classList.add('hidden');
}

cancelDeleteBtn.onclick = closeConfirm;

okDeleteBtn.onclick = async () => {
  if (!pendingDeletePath) return;
  const target = pendingDeletePath;
  closeConfirm();
  statusEl.textContent = `O'chirilmoqda: ${target} ...`;

  try {
    const res = await fetch(`/api/delete?path=${encodeURIComponent(target)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) {
      statusEl.textContent = '⚠ ' + data.error;
    } else {
      statusEl.textContent = "O'chirildi ✓";
      loadDir(pathInput.value.trim()); // ro'yxatni yangilaymiz
    }
  } catch (err) {
    statusEl.textContent = '⚠ O\'chirishda xatolik yuz berdi.';
  }
};

// ---------------- Init ----------------

scanBtn.onclick = () => {
  const dir = pathInput.value.trim();
  if (dir) loadDir(dir);
};

pathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') scanBtn.onclick();
});

minSizeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') scanBtn.onclick();
});

(async function init() {
  try {
    const res = await fetch('/api/home');
    const data = await res.json();
    loadDir(data.home);
  } catch (err) {
    statusEl.textContent = '⚠ Server bilan bog\'lanib bo\'lmadi.';
  }
})();
