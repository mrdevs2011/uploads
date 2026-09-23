const STORAGE_KEY = 'coworkData';

const viewEmpty = document.getElementById('viewEmpty');
const viewProject = document.getElementById('viewProject');
const viewStep = document.getElementById('viewStep');
const tabsEl = document.getElementById('tabs');
const subtabsEl = document.getElementById('subtabs');
const stepList = document.getElementById('stepList');
const speedEl = document.getElementById('speed');
const countdownEl = document.getElementById('countdown');
const stepGapEl = document.getElementById('stepGap');
const ocrModeEl = document.getElementById('ocrMode');
const ocrScaleEl = document.getElementById('ocrScale');
const ocrThresholdEl = document.getElementById('ocrThreshold');

const stepLabel = document.getElementById('stepLabel');
const stepValue = document.getElementById('stepValue');
const stepValueSelect = document.getElementById('stepValueSelect');
const valueFieldWrap = document.getElementById('valueFieldWrap');
const fieldHint = document.getElementById('fieldHint');
const coordFields = document.getElementById('coordFields');
const pickFields = document.getElementById('pickFields');
const pickStatus = document.getElementById('pickStatus');
const stepTitle = document.getElementById('stepTitle');
const stepX = document.getElementById('stepX');
const stepY = document.getElementById('stepY');

let data = {
  projects: [],
  globalFields: {},
  settings: {
    speed: 45,
    delay: 3,
    ocrMode: 'ocrspace',
    ocrScale: 2,
    ocrThreshold: 140,
    groqApiKey: '',
    groqModel: 'qwen/qwen3.8-27b',
    apiKeyPromptDismissed: false,
    soundClick: true,
    soundType: true,
  },
};
let currentProjectId = null;
let currentStepId = null;
let pendingPick = null;
let pendingPickToken = 0;

// Monoton hisoblagich — Math.random() + Date.now() o'zi ham deyarli
// to'qnashmaydi, lekin "deyarli" yetarli emas: 1000+ recordli importda
// bitta tight loop ichida yuzlab id bir necha millisekundda yaratiladi,
// Date.now() bir xil millisekundda bir necha marta qaytishi mumkin, va
// Math.random() to'qnashuvi ehtimoli nolga teng bo'lsa ham nol emas.
// Bitta to'qnashuv — ikkita loyiha/step bir xil id'ga ega bo'lib qoladi,
// va .find(p => p.id === x) ULARDAN BIRINI (noto'g'risini) qaytarishi
// mumkin — bu real "ma'lumotlar chalkashib ketishi" holati. Monoton
// counter shu ehtimolni butunlay yo'q qiladi (session davomida hech
// qachon takrorlanmaydi).
let _uidCounter = 0;
function uid() {
  _uidCounter += 1;
  return 'id_' + Date.now().toString(36) + '_' + _uidCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function show(view) {
  viewEmpty.hidden = view !== 'empty';
  viewProject.hidden = view !== 'project';
  viewStep.hidden = view !== 'step';
}

function markTabOverflow(tab, titleEl) {
  requestAnimationFrame(() => {
    const overflow = titleEl.scrollWidth > titleEl.clientWidth + 1;
    if (overflow) tab.setAttribute('data-overflow', '1');
    else tab.removeAttribute('data-overflow');
  });
}

function startTabEdit(tab, titleEl, projectId) {
  if (tab.classList.contains('editing')) return;
  tab.classList.add('editing');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-title-input';
  input.value = titleEl.textContent;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const ruler = document.createElement('span');
  ruler.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit;letter-spacing:inherit;';
  document.body.appendChild(ruler);
  const resize = () => {
    ruler.textContent = input.value || input.placeholder || '';
    input.style.width = Math.max(20, ruler.offsetWidth + 4) + 'px';
  };
  resize();
  input.addEventListener('input', resize);

  const finish = (commit) => {
    ruler.remove();
    if (commit) {
      const p = data.projects.find((pr) => pr.id === projectId);
      if (p) {
        p.name = input.value.trim() || 'Untitled';
        saveData();
      }
    }
    renderTabs();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

// Subtab tizimi: har bir loyiha (project) oddiy top-level tab bo'lishi mumkin,
// yoki boshqa loyihaning "farzandi" (child) bo'lishi mumkin — buni p.parentId
// belgilaydi. parentId bo'lmasa — bu "guruh boshi" (group head), top tab
// striped'da o'zi ko'rinadi. parentId bo'lsa — u faqat subtab qatorida ko'rinadi,
// asosiy tab striped'da EMAS. Guruh ichidagi barcha a'zolarni (guruh boshi +
// bolalari) `groupIdOf` orqali bitta id ostida yig'amiz — nested (2-qavat)
// subtab bo'lishini oldini olish uchun har doim eng tepadagi ota id'siga qarab
// ishlaymiz.
function groupIdOf(p) {
  if (!p) return null;
  return p.parentId || p.id;
}
function projectById(id) {
  return data.projects.find((p) => p.id === id) || null;
}

function renderTabs() {
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  const topLevel = data.projects.filter((p) => !p.parentId);
  const cur = currentProject();
  const activeGroupId = cur ? groupIdOf(cur) : null;

  topLevel.forEach((p) => {
    const tab = document.createElement('button');
    tab.className = 'tab' + (p.id === activeGroupId ? ' active' : '');
    tab.type = 'button';
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = p.name || 'Untitled';
    tab.appendChild(title);

    const memberCount = data.projects.filter((x) => x.parentId === p.id).length + 1;
    if (memberCount > 1) {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = String(memberCount);
      tab.appendChild(badge);
    }

    const close = document.createElement('button');
    close.className = 'tab-x';
    close.type = 'button';
    close.title = 'Close';
    close.textContent = '×';
    tab.appendChild(close);

    markTabOverflow(tab, title);

    tab.addEventListener('click', (e) => {
      if (e.target === close) return;
      if (tab.classList.contains('editing')) return;
      const wasActiveGroup = p.id === activeGroupId;
      if (!wasActiveGroup) openProject(p.id);
      const liveTitle = tab.querySelector('.tab-title');
      if (liveTitle) startTabEdit(tab, liveTitle, p.id);
    });
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeProject(p.id);
    });
    tabsEl.appendChild(tab);
  });

  renderSubtabs(activeGroupId);
}

// Subtab qatori faqat shu holatda chiqadi: joriy guruhda 1 tadan ortiq a'zo
// bo'lsa (ya'ni ko'p-recordli JSON tashlangan bo'lsa). Qo'lda "+" bilan
// subtab qo'shib bo'lmaydi — bu ataylab shunday, faqat JSON drop orqali yaratiladi.
function renderSubtabs(groupId) {
  if (!subtabsEl) return;
  subtabsEl.innerHTML = '';
  const children = groupId ? data.projects.filter((p) => p.parentId === groupId) : [];
  if (!groupId || !children.length) {
    subtabsEl.hidden = true;
    return;
  }
  subtabsEl.hidden = false;
  const head = projectById(groupId);
  const members = head ? [head, ...children] : children;

  members.forEach((m) => {
    const sub = document.createElement('button');
    sub.type = 'button';
    sub.className = 'subtab' + (m.id === currentProjectId ? ' active' : '');

    const label = document.createElement('span');
    label.className = 'subtab-title';
    label.textContent = m.name || 'Untitled';
    sub.appendChild(label);

    if (m.parentId) {
      const x = document.createElement('span');
      x.className = 'subtab-x';
      x.textContent = '×';
      x.title = 'Close';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        closeProject(m.id);
      });
      sub.appendChild(x);
    }

    sub.addEventListener('click', () => {
      if (m.id !== currentProjectId) openProject(m.id);
    });
    subtabsEl.appendChild(sub);
  });
}

function currentProject() {
  return data.projects.find((p) => p.id === currentProjectId) || null;
}
function currentStep() {
  const p = currentProject();
  if (!p) return null;
  return p.steps.find((s) => s.id === currentStepId) || null;
}
// ============================================================
// saveData() — ARXITEKTURA ESLATMASI:
// Butun `data` (barcha loyihalar/subtablar) HAR SAFAR bitta yaxlit
// blob sifatida yoziladi (chrome.storage.local kaliti — STORAGE_KEY).
// Bitta maydonni o'zgartirish ham butun datasetni qayta serialize
// qilib yozadi — bu N ta loyiha bo'lganda O(N) xarajat. Kichik/o'rta
// hajmda (bir necha yuzlab subtab) muammo bermaydi, lekin minglab
// subtab bo'lsa, HAR bir kichik o'zgarishda butun datasetni diskka
// yozish sekinlashadi. To'liq yechim — har loyihani alohida
// storage kalitida saqlash (sharding) bo'lardi, lekin bu butun
// business-logikani (2000+ qatorni) qayta yozishni talab qiladi va
// jonli sinovsiz xato chiqarish xavfi katta edi — shuning uchun bu
// yerda ATAYIN qilinmadi (buni MRga ochiq aytdim, bekitmayapman).
// Buning o'rniga ikkita real, past-xavfli tuzatish qilindi:
//  1) unlimitedStorage ruxsati (manifest.json) — 10MB quota
//     to'lib, importdan keyingi ma'lumot "jimgina" yo'qolishining
//     asosiy sababini butunlay yo'q qiladi.
//  2) Yozuvlarni debounce/serialize qilish (pastda) — 1000+ recordli
//     importda har bir record uchun alohida yozuv o'rniga, faqat
//     BITTA yakuniy yozuv bo'ladi (chunki oraliqdagi barcha
//     saveData() chaqiruvlari bitta navbatdagi yozuvga birlashadi).
// ============================================================
let _saveInFlight = false;
let _saveAgainAfter = false;

function saveData() {
  if (_saveInFlight) {
    // Hozir yozuv ketyapti — bu chaqiruvni alohida diskka yozuvga
    // aylantirmaymiz, faqat "joriy yozuv tugagach yana bir marta
    // yoz" deb belgilaymiz. Shu bilan bir zumda kelgan 100ta
    // saveData() chaqiruvi 100ta emas, atigi 1-2ta haqiqiy yozuvga
    // tushadi.
    _saveAgainAfter = true;
    return;
  }
  _saveInFlight = true;
  const clean = {
    ...data,
    projects: (data.projects || []).map((p) => ({
      ...p,
      steps: (p.steps || []).filter((s) => !s.isDraft),
    })),
  };
  chrome.storage.local.set({ [STORAGE_KEY]: clean }, () => {
    _saveInFlight = false;
    if (chrome.runtime.lastError) {
      // Avval bu yerda HECH NARSA qilinmasdi — quota to'lganda yoki
      // boshqa storage xatosida foydalanuvchi HECH QACHON bilmasdi
      // (UI xotirada bor narsani ko'rsatib turaverardi, lekin diskka
      // yozilmagan bo'lardi — brauzer qayta ochilganda hammasi yo'qolardi).
      console.error('[SavingTime] saveData xato:', chrome.runtime.lastError.message);
      showDropToast(
        "Ogohlantirish: Saqlashda xato — oxirgi o'zgarish saqlanmadi! (" + chrome.runtime.lastError.message + ')',
        { warn: true, duration: 6000 }
      );
      return;
    }
    if (_saveAgainAfter) {
      _saveAgainAfter = false;
      saveData();
    }
  });
}

function describeInfo(info) {
  if (!info) return '';
  if (info.pageX != null && info.pageY != null) return `x=${Math.round(info.pageX)}, y=${Math.round(info.pageY)}`;
  if (info.id) return `#${info.id}`;
  if (info.name) return `[name="${info.name}"]`;
  if (info.placeholder) return `"${info.placeholder}"`;
  if (info.text) return `"${info.text}"`;
  return info.tag || '';
}

// ESLATMA (kod sifati, MINOR): Log oynasi UI'dan olib tashlangan, shuning
// uchun bu funksiyalar ATAYIN no-op. Audit ta'kidlaganidek, kod bo'ylab
// 50+ joyda chaqiriladi va har birida (masalan `n + '. ' + Math.round(x)`
// kabi) string birlashtiriladi — bu funksiya ichida hech narsaga
// ishlatilmasa ham. Har bir chaqiruv nihoyatda arzon (bir nechta string
// concat, milliseconds emas, microseconds ham emas — bu extension'ning
// haqiqiy "og'ir" qismlari network so'rov, DOM render va typing simulyatsiyasi),
// shuning uchun 50+ chaqiruv joyini birma-bir "if (DEBUG) addLog(...)"
// bilan o'rab chiqish — real foyda deyarli nol, lekin katta kodni qo'lda
// ko'chirib xato qilish xavfi esa real. Shuning uchun bu joyda ATAYIN
// tegilmadi — agar log oynasi kelajakda qaytarilsa, shu ikkita funksiyani
// to'ldirish kifoya, chaqiruv joylarini o'zgartirish shart emas.
function addLog(text, kind) {
  // Log oynasi olib tashlangan — hech narsa qilmaymiz
}
function clearLog() {}

async function getActiveTab() {
  const queries = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
  ];
  for (const q of queries) {
    const tabs = await chrome.tabs.query(q);
    const tab = (tabs || []).find((t) => t.url && /^https?:/.test(t.url));
    if (tab) return tab;
  }
  const all = await chrome.tabs.query({ lastFocusedWindow: true });
  return (all || []).find((t) => t.active && t.url && /^https?:/.test(t.url)) || null;
}

async function ensureContent(tab) {
  if (!tab || !tab.id) throw new Error('No tab');
  // Avval PING — yangi versiya (ver>=6) javob bersa, tayyor
  try {
    const pong = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }, { frameId: 0 });
    if (pong && pong.ok && pong.ver >= 7) return;
  } catch (_) {}
  // Eski content script flagini tozalab, yangisini inject qilamiz
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      func: () => { window.__brauzerCoworkInjected = 0; },
    });
  } catch (_) {}
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    files: ['content.js'],
  });
  await new Promise((r) => setTimeout(r, 100));
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PING' }, { frameId: 0 });
  } catch (_) {
    await new Promise((r) => setTimeout(r, 150));
    await chrome.tabs.sendMessage(tab.id, { type: 'PING' }, { frameId: 0 });
  }
}

async function sendToTab(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) throw new Error('No tab');
  await ensureContent(tab);
  return chrome.tabs.sendMessage(tab.id, message, { frameId: 0 });
}

function renderHome() {
  currentProjectId = null;
  currentStepId = null;
  renderTabs();
  show('empty');
  updateImportJsonBtnState();
}

let frozenStepNums = null;
let frozenStepNumsTimer = null;

function clearFrozenStepNums() {
  if (frozenStepNumsTimer) {
    clearTimeout(frozenStepNumsTimer);
    frozenStepNumsTimer = null;
  }
  frozenStepNums = null;
}

function scheduleUnfreezeStepNums() {
  if (frozenStepNumsTimer) clearTimeout(frozenStepNumsTimer);
  frozenStepNumsTimer = setTimeout(() => {
    frozenStepNums = null;
    frozenStepNumsTimer = null;
    smoothRenumberCards();
  }, 5000);
}

function smoothRenumberCards() {
  const cards = stepList.querySelectorAll('.card');
  cards.forEach((card, i) => {
    const numEl = card.querySelector('.step-num');
    if (!numEl) return;
    const next = String(i + 1);
    if (numEl.textContent === next) return;
    numEl.classList.add('num-fade');
    setTimeout(() => {
      numEl.textContent = next;
      numEl.classList.remove('num-fade');
      numEl.classList.add('num-pop');
      setTimeout(() => numEl.classList.remove('num-pop'), 280);
    }, 160);
  });
}

function renderProject() {
  const p = currentProject();
  if (!p) { renderHome(); return; }
  show('project');
  renderTabs();
  updateImportJsonBtnState();
  stepList.innerHTML = '';
  const visible = (p.steps || []).filter((s) => !s.isDraft);
  if (!visible.length) {
    stepList.innerHTML = '';
    updateRunBtnState();
    return;
  }
  visible.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.stepId = s.id;
    const fieldKind = s.elementInfo && s.elementInfo.field && s.elementInfo.field.kind;
    const fieldMeta = fieldKind && FIELD_META[fieldKind];
    let kindName = 'Click';
    if (s.kind === 'captcha') kindName = 'Captcha OCR';
    else if (fieldKind && fieldKind !== 'button' && fieldKind !== 'unknown') {
      kindName = (fieldMeta && fieldMeta.label) ? fieldMeta.label : fieldKind;
    }
    const extra = s.pageX != null ? (Math.round(s.pageX) + ', ' + Math.round(s.pageY)) : '';
    let pick = '';
    if (s.kind === 'captcha') {
      pick = s.captchaInputInfo
        ? ('input: ' + (describeInfo(s.captchaInputInfo) || '—'))
        : 'input: (tanlanmagan)';
    } else if (s.value) {
      pick = '→ ' + String(s.value).slice(0, 30);
    }
    if (s.tableField) pick = (pick ? pick + ' · ' : '') + '#' + s.tableField + (s.tableFieldGlobal ? ' (global)' : '');
    const displayNum = (frozenStepNums && frozenStepNums[s.id] != null)
      ? frozenStepNums[s.id]
      : (i + 1);
    card.innerHTML = `
      <div class="card-row">
        <button class="ghost edit icon-btn" title="Edit" type="button"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <div class="card-body">
          <b><span class="step-num">${displayNum}</span>${s.label ? escapeHtml(s.label) : ''}</b>
          <div class="meta">${escapeHtml(kindName)}${extra ? ' · ' + escapeHtml(extra) : ''}${pick ? ' · ' + escapeHtml(pick) : ''}</div>
        </div>
        <button class="ghost danger-text del icon-btn" title="Delete" type="button"><svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      </div>
    `;
    card.querySelector('.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openStep(s.id);
    });
    card.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteStep(s.id);
    });
    card.querySelector('.edit').addEventListener('pointerdown', (e) => e.stopPropagation());
    card.querySelector('.del').addEventListener('pointerdown', (e) => e.stopPropagation());
    stepList.appendChild(card);
  });
  setupVerticalCardDrag();
  updateRunBtnState();
}

function isStepReady(s) {
  if (!s || s.isDraft) return false;
  if (s.kind === 'captcha') return !!s.captchaInputInfo;
  if (s.pageX == null || s.pageY == null || Number.isNaN(Number(s.pageX)) || Number.isNaN(Number(s.pageY))) {
    return false;
  }
  const field = s.elementInfo && s.elementInfo.field;
  const kind = field && field.kind;
  if (kind && kind !== 'button' && kind !== 'unknown' && kind !== 'file') {
    if (s.value == null || String(s.value).trim() === '') return false;
  }
  return true;
}

function updateRunBtnState() {
  const p = currentProject();
  const btn = document.getElementById('runBtn');
  if (!btn) return;
  const ready = p && p.steps ? p.steps.filter(isStepReady) : [];
  const hasReady = ready.length > 0;
  btn.disabled = !hasReady;
  if (!p || !p.steps || !p.steps.length) {
    btn.title = 'Avval operator qo\'shing';
  } else if (!hasReady) {
    btn.title = 'Operatorlar to\'liq emas — Confirm bilan saqlang';
  } else {
    btn.title = 'Execute';
  }
}

function updateSaveStepBtnState() {
  const s = currentStep();
  const btn = document.getElementById('saveStepBtn');
  if (!btn || !s) return;
  let filled = true;

  if (s.kind === 'captcha') {
    filled = !!s.captchaInputInfo;
  } else {
    const x = parseFloat(stepX.value);
    const y = parseFloat(stepY.value);
    if (Number.isNaN(x) || Number.isNaN(y)) filled = false;

    if (filled && valueFieldWrap && !valueFieldWrap.hidden) {
      const isSelect = stepValueSelect && !stepValueSelect.hidden;
      if (isSelect) {
        if (!stepValueSelect.value) filled = false;
      } else if (stepValue && !stepValue.hidden) {
        if (!stepValue.value.trim()) filled = false;
      }
    }
  }

  btn.disabled = !filled;
}

function renderStep() {
  const s = currentStep();
  if (!s) { renderProject(); return; }
  show('step');
  renderTabs();
  stepTitle.textContent = s.label || 'Operator';
  stepLabel.value = s.label || '';
  stepX.value = s.pageX != null ? Math.round(s.pageX) : '';
  stepY.value = s.pageY != null ? Math.round(s.pageY) : '';
  updateStepFields();
  updatePickStatus(s);
  applyFieldUI(s.elementInfo && s.elementInfo.field);
  if (stepValue && !stepValue.hidden) stepValue.value = s.value || '';
  if (stepValueSelect && !stepValueSelect.hidden) stepValueSelect.value = s.value || '';
  updateSaveStepBtnState();
  updateTableFieldBtnState();
}

const FIELD_META = {
  date: { label: 'Sana', hint: 'Bu — sana kiritish maydoni (YYYY-MM-DD).', inputType: 'date' },
  'datetime-local': { label: 'Sana va vaqt', hint: 'Bu — sana va vaqt maydoni.', inputType: 'datetime-local' },
  month: { label: 'Oy', hint: 'Bu — oy tanlash maydoni (YYYY-MM).', inputType: 'month' },
  week: { label: 'Hafta', hint: 'Bu — hafta tanlash maydoni.', inputType: 'week' },
  time: { label: 'Vaqt', hint: 'Bu — vaqt kiritish maydoni (HH:MM).', inputType: 'time' },
  email: { label: 'Email', hint: 'Bu — email maydoni.', inputType: 'email' },
  tel: { label: 'Telefon raqam', hint: 'Bu — telefon maydoni.', inputType: 'tel' },
  number: { label: 'Raqam', hint: 'Bu — raqam maydoni.', inputType: 'number' },
  url: { label: 'Havola (URL)', hint: 'Bu — link maydoni.', inputType: 'url' },
  color: { label: 'Rang', hint: 'Bu — rang maydoni (#RRGGBB).', inputType: 'color' },
  range: { label: 'Qiymat (slider)', hint: 'Bu — slayder. Raqam kiriting.', inputType: 'number' },
  password: { label: 'Parol', hint: 'Bu — parol maydoni.', inputType: 'password' },
  search: { label: 'Qidiruv', hint: 'Bu — qidiruv maydoni.', inputType: 'search' },
  file: { label: 'Fayl', hint: 'File input: brauzer xavfsizligi tufayli avtomatik to\'ldirib bo\'lmaydi.', inputType: 'text' },
  textarea: { label: 'Matn (uzun)', hint: 'Bu — uzun matn maydoni.', inputType: 'text' },
  text: { label: 'Matn', hint: 'Bu — oddiy matn maydoni.', inputType: 'text' },
  select: { label: 'Tanlov', hint: 'Bu — dropdown. Variantni tanlang.' },
  checkbox: { label: 'Belgi (checkbox)', hint: "Checkbox. 'ha' yoki 'yo\\'q' yozing.", inputType: 'text' },
  radio: { label: 'Tanlov (radio)', hint: "Radio. 'ha' yoki 'yo\\'q' yozing.", inputType: 'text' },
  button: { label: null, hint: 'Bu — tugma (qiymat kiritilmaydi).' },
  unknown: { label: 'Qiymat', hint: 'Element turi noma\'lum — matn sifatida kiritiladi.', inputType: 'text' },
};

function applyFieldUI(field) {
  if (!valueFieldWrap) return;
  const kind = (field && field.kind) || null;
  if (!kind || kind === 'unknown') {
    valueFieldWrap.hidden = true;
    return;
  }
  if (kind === 'button') { valueFieldWrap.hidden = true; return; }
  if (kind === 'file') {
    valueFieldWrap.hidden = false;
    if (fieldHint) fieldHint.textContent = FIELD_META.file.hint;
    const labelEl = document.getElementById('stepValueLabel');
    if (labelEl) { labelEl.hidden = true; }
    if (stepValue) stepValue.hidden = true;
    if (stepValueSelect) stepValueSelect.hidden = true;
    return;
  }

  const meta = FIELD_META[kind] || FIELD_META.unknown;
  valueFieldWrap.hidden = false;
  if (fieldHint) fieldHint.textContent = meta.hint;

  const labelEl = document.getElementById('stepValueLabel');
  if (labelEl) { labelEl.hidden = false; labelEl.textContent = meta.label; }

  if (kind === 'select') {
    if (stepValue) stepValue.hidden = true;
    if (stepValueSelect) {
      stepValueSelect.hidden = false;
      const current = stepValueSelect.value || (currentStep() && currentStep().value) || '';
      stepValueSelect.innerHTML = '';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— tanlang —';
      stepValueSelect.appendChild(blank);
      (field.options || []).forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        stepValueSelect.appendChild(o);
      });
      if (current) stepValueSelect.value = current;
    }
    return;
  }

  if (stepValueSelect) stepValueSelect.hidden = true;
  if (stepValue) {
    stepValue.hidden = false;
    stepValue.type = meta.inputType || 'text';
    if (kind === 'checkbox' || kind === 'radio') {
      stepValue.placeholder = "ha / yo'q";
    } else if (kind === 'color') {
      stepValue.placeholder = '#000000';
    } else if (kind === 'range' || kind === 'number') {
      stepValue.placeholder = '0';
    } else {
      stepValue.placeholder = 'Masalan: ' + (meta.label || 'qiymat');
    }
  }
}

function updateStepFields() {
  if (coordFields) coordFields.hidden = false;
  if (pickFields) pickFields.hidden = false;
}

function updatePickStatus(s) {
  if (!pickStatus) return;
  if (s && s.kind === 'captcha') {
    const parts = [];
    if (s.pageX != null && s.pageY != null) {
      parts.push(Math.round(s.pageX) + ', ' + Math.round(s.pageY));
    }
    if (s.captchaInputInfo) {
      parts.push('input: ' + (describeInfo(s.captchaInputInfo) || 'OK'));
    } else {
      parts.push('input: ?');
    }
    pickStatus.textContent = parts.join(' · ');
    pickStatus.className = s.captchaInputInfo ? 'status ok' : 'status warn';
    return;
  }
  if (s && s.pageX != null && s.pageY != null) {
    pickStatus.textContent = Math.round(s.pageX) + ', ' + Math.round(s.pageY);
    pickStatus.className = 'status ok';
  } else if (s && s.elementInfo) {
    pickStatus.textContent = describeInfo(s.elementInfo);
    pickStatus.className = 'status ok';
  } else {
    pickStatus.textContent = '';
    pickStatus.className = 'status warn';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

function newBlankProject() {
  const n = data.projects.filter((p) => !p.parentId).length + 1;
  const project = { id: uid(), name: 'Untitled ' + n, steps: [] };
  data.projects.push(project);
  data.settings.activeProjectId = project.id;
  saveData();
  openProject(project.id);
}

function closeProject(id) {
  const target = projectById(id);
  if (!target) return;

  // Guruh boshi (parentId yo'q) yopilsa — uning barcha subtab'lari
  // (bolalari) ham birga o'chadi, chunki ular mustaqil yashay olmaydi.
  const idsToRemove = target.parentId
    ? [id]
    : [id, ...data.projects.filter((p) => p.parentId === id).map((p) => p.id)];

  const i = data.projects.findIndex((p) => p.id === id);
  data.projects = data.projects.filter((p) => !idsToRemove.includes(p.id));

  if (idsToRemove.includes(currentProjectId)) {
    // Yopilgan narsa subtab bo'lsa — avval o'z guruhiga qaytaramiz
    // (guruh boshi hali tirik bo'lsa); aks holda navbatdagi top-level tab.
    const fallbackToParent = target.parentId ? projectById(target.parentId) : null;
    const next = fallbackToParent || data.projects[i] || data.projects[i - 1] || null;
    currentProjectId = next ? next.id : null;
    currentStepId = null;
  }
  data.settings.activeProjectId = currentProjectId;
  saveData();
  if (currentProjectId) renderProject();
  else renderHome();
}

function discardDraftSteps(project) {
  if (!project || !project.steps) return false;
  const before = project.steps.length;
  project.steps = project.steps.filter((s) => !s.isDraft);
  return project.steps.length !== before;
}

function openProject(id) {
  if (currentProjectId) {
    const prev = data.projects.find((p) => p.id === currentProjectId);
    if (prev && discardDraftSteps(prev)) saveData();
  }
  currentProjectId = id;
  currentStepId = null;
  data.settings.activeProjectId = id;
  data.settings.activeStepId = null;
  saveData();
  clearLog();
  renderProject();
}

function openStep(id) {
  currentStepId = id;
  data.settings.activeStepId = id;
  saveData();
  // pendingPick ATAYIN bu yerda o'rnatilmaydi — faqat foydalanuvchi haqiqatan
  // "Pick" (yoki captcha input) tugmasini bosganda o'rnatiladi (pastda,
  // pickBtn/askCaptchaInput ichida). Aks holda step ochilishi bilanoq
  // "hot" bo'lib qolib, eskirgan/begona selection natijasi shu stepga
  // tushib ketishi mumkin edi.
  closeTableFieldSection();
  renderStep();
}

function collectStepForm(s) {
  if (s.kind === 'captcha') {
    s.label = stepLabel.value.trim() || s.label || '';
    return;
  }
  s.label = stepLabel.value.trim() || s.label || '';
  const isSelect = stepValueSelect && !stepValueSelect.hidden;
  s.value = isSelect ? stepValueSelect.value : (stepValue ? stepValue.value : '');
  s.wait = s.wait != null ? s.wait : 2;
  const x = parseFloat(stepX.value);
  const y = parseFloat(stepY.value);
  if (!Number.isNaN(x)) s.pageX = x;
  if (!Number.isNaN(y)) s.pageY = y;
}

function fallbackStepLabel(s) {
  if (!s) return 'Click';
  if (s.kind === 'captcha') return 'Captcha';
  const field = s.elementInfo && s.elementInfo.field;
  const kind = field && field.kind;
  if (kind && FIELD_META[kind] && FIELD_META[kind].label) return FIELD_META[kind].label;
  if (s.elementInfo) {
    if (s.elementInfo.placeholder) return String(s.elementInfo.placeholder).slice(0, 28);
    if (s.elementInfo.name) return String(s.elementInfo.name).slice(0, 28);
    if (s.elementInfo.id) return String(s.elementInfo.id).slice(0, 28);
    if (s.elementInfo.text) return String(s.elementInfo.text).slice(0, 28);
    if (s.elementInfo.tag) return s.elementInfo.tag;
  }
  if (s.pageX != null && s.pageY != null) {
    return 'Click ' + Math.round(s.pageX) + ',' + Math.round(s.pageY);
  }
  return 'Click';
}

const TAB_NAME_MAX = 15;

function clipTabName(str) {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, TAB_NAME_MAX);
}

function fallbackProjectName(p) {
  if (!p || !p.steps || !p.steps.length) return 'Project';
  const first = p.steps.find((s) => !s.isDraft && s.label) || p.steps[0];
  if (first && first.label) return clipTabName(first.label);
  return clipTabName('Project ' + p.steps.length);
}

function realSteps(p) {
  return (p.steps || []).filter((s) => !s.isDraft);
}

// Step/Tab nomlash — AI SHART EMAS: elementInfo'da (id, placeholder,
// field turi) barcha kerakli ma'lumot allaqachon bor, shuning uchun
// to'g'ridan-to'g'ri fallbackStepLabel/fallbackProjectName ishlatiladi.
async function ensureStepLabel(s) {
  if (s.label && s.label.trim()) return s.label.trim();
  s.label = fallbackStepLabel(s);
  return s.label;
}

async function refreshProjectTabName(p) {
  if (!p) return;
  const steps = realSteps(p);
  if (!steps.length) return;
  const current = (p.name || '').trim();
  const isDefault = !current || /^untitled(\s+\d+)?$/i.test(current);
  if (isDefault) p.name = fallbackProjectName(p);
}

function stepNeedsValue(s) {
  if (!s || s.kind === 'captcha') return false;
  const field = s.elementInfo && s.elementInfo.field;
  const kind = field && field.kind;
  if (!kind || kind === 'button' || kind === 'unknown' || kind === 'file') return false;
  return true;
}

function stepReadyToFinalize(s) {
  if (!s) return false;
  if (s.kind === 'captcha') return !!s.captchaInputInfo;
  if (s.pageX == null || s.pageY == null) return false;
  if (stepNeedsValue(s) && !(s.value && String(s.value).trim())) return false;
  return true;
}

async function finalizeStep(s) {
  if (!s || !stepReadyToFinalize(s)) return false;
  if (stepLabel && stepLabel.value.trim()) s.label = stepLabel.value.trim();
  await ensureStepLabel(s);
  s.isDraft = false;
  const p = currentProject();
  if (p) await refreshProjectTabName(p);
  saveData();
  currentStepId = null;
  pendingPick = null;
  setPickerActive(false);
  renderProject();
  return true;
}

let _vDrag = null;

function setupVerticalCardDrag() {
  const cards = Array.from(stepList.querySelectorAll('.card'));
  cards.forEach((card) => {
    card.addEventListener('pointerdown', onCardPointerDown);
  });
}

function onCardPointerDown(e) {
  if (e.button !== 0) return;
  if (e.target.closest('button')) return;
  const card = e.currentTarget;
  const list = stepList;
  const cards = Array.from(list.querySelectorAll('.card'));
  const fromIdx = cards.indexOf(card);
  if (fromIdx < 0) return;

  const startY = e.clientY;
  const cardRect = card.getBoundingClientRect();
  const cardH = cardRect.height;
  const gap = 6;
  const step = cardH + gap;

  const origins = cards.map((c) => {
    const r = c.getBoundingClientRect();
    return { el: c, top: r.top, height: r.height };
  });

  card.classList.add('dragging');
  card.style.zIndex = '20';
  card.style.position = 'relative';
  card.setPointerCapture(e.pointerId);

  let currentOffset = 0;
  let targetIdx = fromIdx;

  function onMove(ev) {
    const dy = ev.clientY - startY;
    currentOffset = dy;
    card.style.transform = `translateY(${dy}px)`;

    const centerY = cardRect.top + cardH / 2 + dy;
    let newIdx = fromIdx;
    for (let i = 0; i < origins.length; i++) {
      if (i === fromIdx) continue;
      const mid = origins[i].top + origins[i].height / 2;
      if (centerY < mid && i < fromIdx) { newIdx = i; break; }
      if (centerY > mid && i > fromIdx) { newIdx = i; }
    }
    targetIdx = newIdx;

    cards.forEach((c, i) => {
      if (c === card) return;
      let shift = 0;
      if (fromIdx < targetIdx) {
        if (i > fromIdx && i <= targetIdx) shift = -step;
      } else if (fromIdx > targetIdx) {
        if (i >= targetIdx && i < fromIdx) shift = step;
      }
      c.style.transition = 'transform 120ms ease';
      c.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function onUp(ev) {
    card.releasePointerCapture(ev.pointerId);
    card.removeEventListener('pointermove', onMove);
    card.removeEventListener('pointerup', onUp);
    card.removeEventListener('pointercancel', onUp);

    cards.forEach((c) => {
      c.style.transition = '';
      c.style.transform = '';
      c.style.zIndex = '';
      c.style.position = '';
      c.classList.remove('dragging');
    });

    if (targetIdx !== fromIdx) {
      const p = currentProject();
      if (!p) return;
      const visible = (p.steps || []).filter((s) => !s.isDraft);
      const fromId = visible[fromIdx] && visible[fromIdx].id;
      const toId = visible[targetIdx] && visible[targetIdx].id;
      if (fromId && toId) {
        const prevFrozen = {};
        visible.forEach((s, i) => {
          prevFrozen[s.id] = (frozenStepNums && frozenStepNums[s.id] != null)
            ? frozenStepNums[s.id]
            : (i + 1);
        });
        frozenStepNums = prevFrozen;
        scheduleUnfreezeStepNums();

        const realFrom = p.steps.findIndex((s) => s.id === fromId);
        const realTo = p.steps.findIndex((s) => s.id === toId);
        if (realFrom >= 0 && realTo >= 0) {
          const [item] = p.steps.splice(realFrom, 1);
          p.steps.splice(realTo, 0, item);
          saveData();
          renderProject();
        }
      }
    }
  }

  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
  e.preventDefault();
}

function deleteStep(id) {
  const p = currentProject();
  p.steps = p.steps.filter((s) => s.id !== id);
  saveData();
  renderProject();
}

async function askCaptchaInput(step) {
  const token = ++pendingPickToken;
  pendingPick = { projectId: currentProjectId, stepId: step.id, purpose: 'captcha-input', token };
  try {
    await sendToTab({
      type: 'START_SELECTION',
      mode: 'point',
      reason: 'Captcha inputni bosing',
      pickToken: token,
    });
    setPickerActive(true);
    if (pickStatus) {
      pickStatus.textContent = 'Inputni tanlang...';
      pickStatus.className = 'status warn';
    }
    addLog('Captcha rasm tanlandi — endi inputni bosing', 'warn');
  } catch (e) {
    addLog('Xato: ' + e.message, 'err');
  }
}

let pickerActive = false;
function setPickerActive(active) {
  pickerActive = active;
  const btn = document.getElementById('pickBtn');
  if (btn) btn.classList.toggle('active', active);
}

document.getElementById('addTabBtn').addEventListener('click', () => newBlankProject());
document.querySelector('#viewEmpty .empty-state')?.addEventListener('click', () => newBlankProject());

document.getElementById('backProject').addEventListener('click', () => {
  const s = currentStep();
  const p = currentProject();
  if (s && s.isDraft && p) {
    p.steps = p.steps.filter((x) => x.id !== s.id);
    saveData();
  }
  currentStepId = null;
  pendingPick = null;
  try { sendToTab({ type: 'STOP_SELECTION' }); } catch (_) {}
  setPickerActive(false);
  renderProject();
});

stepX.addEventListener('input', updateSaveStepBtnState);
stepY.addEventListener('input', updateSaveStepBtnState);
if (stepValue) stepValue.addEventListener('input', updateSaveStepBtnState);
if (stepValueSelect) stepValueSelect.addEventListener('change', updateSaveStepBtnState);

document.getElementById('addStepBtn').addEventListener('click', () => {
  const p = currentProject();
  if (!p) return;
  discardDraftSteps(p);
  const step = {
    id: uid(),
    kind: 'coord',
    label: '',
    value: '',
    wait: 2,
    elementInfo: null,
    isDraft: true,
  };
  p.steps.push(step);
  openStep(step.id);
});

document.getElementById('saveStepBtn').addEventListener('click', async () => {
  const s = currentStep();
  if (!s) return;
  if (document.getElementById('saveStepBtn').disabled) return;
  collectStepForm(s);
  const btn = document.getElementById('saveStepBtn');
  if (btn) btn.disabled = true;
  try {
    await ensureStepLabel(s);
    s.isDraft = false;
    const p = currentProject();
    if (p) await refreshProjectTabName(p);
    saveData();
    currentStepId = null;
    pendingPick = null;
    renderProject();
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.getElementById('pickBtn').addEventListener('click', async () => {
  const s = currentStep();
  if (!s) return;

  if (pickerActive) {
    setPickerActive(false);
    pendingPick = null;
    try { await sendToTab({ type: 'STOP_SELECTION' }); } catch (_) {}
    return;
  }

  collectStepForm(s);
  if (s.kind === 'captcha' && s.captchaMarkerInfo && !s.captchaInputInfo) {
    await askCaptchaInput(s);
    return;
  }

  const pickToken = ++pendingPickToken;
  pendingPick = { projectId: currentProjectId, stepId: s.id, token: pickToken };
  try {
    await sendToTab({ type: 'START_SELECTION', mode: 'point', reason: s.label || 'Capture', pickToken });
    setPickerActive(true);
    if (pickStatus) {
      pickStatus.textContent = 'Sahifadan nuqtani bosing…';
      pickStatus.className = 'status warn';
    }
  } catch (err) {
    pendingPick = null;
    setPickerActive(false);
    if (pickStatus) {
      pickStatus.textContent = 'Error: sahifa ochiq emas yoki content script yuklanmadi';
      pickStatus.className = 'status warn';
    }
    addLog('Capture xato: ' + (err && err.message ? err.message : String(err)), 'err');
  }
});

const PLAY_ICON = '<polygon points="6 3 20 12 6 21 6 3"/>';
const STOP_ICON = '<rect width="14" height="14" x="5" y="5" rx="1"/>';
let isRunning = false;

function setRunningState(running) {
  isRunning = running;
  const btn = document.getElementById('runBtn');
  const icon = document.getElementById('runBtnIcon');
  icon.innerHTML = running ? STOP_ICON : PLAY_ICON;
  btn.title = running ? 'Abort' : 'Execute';
  btn.classList.toggle('danger', running);
  btn.classList.toggle('primary', !running);
}

document.getElementById('runBtn').addEventListener('click', async () => {
  if (isRunning) {
    try { await sendToTab({ type: 'STOP_COWORK' }); } catch (_) {}
    addLog('Aborted', 'warn');
    setRunningState(false);
    return;
  }
  const p = currentProject();
  if (!p) return;
  const readySteps = (p.steps || []).filter(isStepReady);
  if (!readySteps.length) {
    addLog('No operators', 'err');
    updateRunBtnState();
    return;
  }
  if (!getGroqApiKey()) {
    const hasCaptcha = readySteps.some((s) => s.kind === 'captcha');
    if (hasCaptcha) {
      addLog('Groq API key yo\'q — Settings → API', 'err');
      openSettings('api');
      return;
    }
  }
  clearLog();
  addLog(p.name, 'ok');
  setRunningState(true);
  try {
    const res = await sendToTab({
      type: 'RUN_PROJECT',
      projectId: p.id,
      steps: readySteps,
      speed: parseInt(speedEl.value, 10) || 45,
      delay: Math.max(0, parseInt(countdownEl.value, 10) || 0),
      stepGap: Math.max(0, parseFloat(stepGapEl.value) || 0),
      groqApiKey: getGroqApiKey(),
      groqModel: getGroqModel(),
      soundClick: data.settings.soundClick !== false,
      soundType: data.settings.soundType !== false,
    });
    if (res && res.ok === false) {
      addLog(res.error || 'Failed', 'err');
      setRunningState(false);
    }
  } catch {
    addLog('Error', 'err');
    setRunningState(false);
  }
});

speedEl.addEventListener('input', () => {
  data.settings.speed = parseInt(speedEl.value, 10) || 45;
  saveData();
});
countdownEl.addEventListener('input', () => {
  data.settings.delay = Math.max(0, parseInt(countdownEl.value, 10) || 0);
  saveData();
});
stepGapEl.addEventListener('input', () => {
  data.settings.stepGap = Math.max(0, parseFloat(stepGapEl.value) || 0);
  saveData();
});
// ============================================================
// ESLATMA (kod sifati, MINOR): ocrMode/ocrScale/ocrThreshold — bular
// eski, OCR.space asosidagi captcha yechuvchidan qolgan. Captcha hozir
// 100% Groq Vision AI orqali yechiladi (background.js), bu sozlamalar
// captcha sifatiga HECH TA'SIR QILMAYDI. LEKIN: bu inputlar
// `#hiddenSettings` konteynerida — foydalanuvchiga umuman ko'rinmaydi
// (hidden), shuning uchun "foydalanuvchini chalg'itadigan yolg'on UI"
// xavfi yo'q — bu shunchaki ko'rinmas, zararsiz eski kod. Butunlay olib
// tashlash `data.settings` sxemasini eski foydalanuvchilar uchun
// o'zgartirish xavfini keltirib chiqaradi, foyda esa deyarli nol
// (hech kim ko'rmaydigan narsani "tozalash"), shuning uchun ATAYIN
// tegilmadi.
// ============================================================
ocrModeEl.addEventListener('change', () => {
  data.settings.ocrMode = ocrModeEl.value;
  saveData();
});
ocrScaleEl.addEventListener('input', () => {
  data.settings.ocrScale = Math.max(1, Math.min(5, parseInt(ocrScaleEl.value, 10) || 2));
  saveData();
});
ocrThresholdEl.addEventListener('input', () => {
  data.settings.ocrThreshold = Math.max(0, Math.min(255, parseInt(ocrThresholdEl.value, 10) || 0));
  saveData();
});

// pendingPick har bir "pick" so'rovida o'ziga xos token bilan o'rnatiladi
// (qarang: pickBtn/askCaptchaInput). Kelayotgan natija shu tokenni olib
// kelmasa — bu eskirgan yoki boshqa so'rovga tegishli javob, rad etamiz.
function pickTokenMatches(msg) {
  return !!pendingPick && msg.pickToken === pendingPick.token;
}

function handlePanelMessage(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'ELEMENT_SELECTED' || msg.type === 'CLICK_SELECTED') {
    if (!pickTokenMatches(msg)) return;
    const target = pendingPick && data.projects.find((p) => p.id === pendingPick.projectId);
    const step = target && target.steps.find((s) => s.id === pendingPick.stepId);
    if (step) {
      if (pendingPick.purpose === 'captcha-input') {
        step.captchaInputInfo = msg.info;
        step.kind = 'captcha';
        addLog('Captcha input: ' + describeInfo(msg.info), 'ok');
        pendingPick = null;
        saveData();
        if (!viewProject.hidden) renderProject();
        if (!viewStep.hidden && currentStepId === step.id) renderStep();
        return;
      }
      step.elementInfo = msg.info;
      saveData();
      if (!viewStep.hidden && currentStepId === step.id) updatePickStatus(step);
      if (!viewProject.hidden) renderProject();
      addLog(describeInfo(msg.info), 'ok');
    }
  }
  if (msg.type === 'COORD_SELECTED') {
    if (!pickTokenMatches(msg)) { setPickerActive(false); return; }
    const target = pendingPick && data.projects.find((p) => p.id === pendingPick.projectId);
    const step = target && target.steps.find((s) => s.id === pendingPick.stepId);
    if (step && msg.info) {
      if (pendingPick && pendingPick.purpose === 'captcha-input') {
        const identity = msg.info.elIdentity || null;
        if (identity && msg.info.field && !identity.field) identity.field = msg.info.field;
        // Identity + koordinata — keyin topish ishonchliroq
        step.captchaInputInfo = Object.assign({}, identity || { tag: 'input' }, {
          pageX: msg.info.pageX,
          pageY: msg.info.pageY,
          clientX: msg.info.clientX,
          clientY: msg.info.clientY,
          field: (identity && identity.field) || msg.info.field || null,
        });
        step.kind = 'captcha';
        pendingPick = null;
        saveData();
        addLog('Captcha input tanlandi: ' + (describeInfo(step.captchaInputInfo) || Math.round(msg.info.pageX) + ', ' + Math.round(msg.info.pageY)), 'ok');
        if (!viewStep.hidden && currentStepId === step.id) {
          updatePickStatus(step);
          updateSaveStepBtnState();
        }
        if (!viewProject.hidden) renderProject();
        return;
      }

      step.pageX = msg.info.pageX;
      step.pageY = msg.info.pageY;
      const identity = msg.info.elIdentity || null;
      if (identity && msg.info.field && !identity.field) {
        identity.field = msg.info.field;
      }
      step.elementInfo = identity;
      if (stepX) stepX.value = Math.round(msg.info.pageX);
      if (stepY) stepY.value = Math.round(msg.info.pageY);
      if (step.value && identity && identity.field) {
        const k = identity.field.kind;
        if (k === 'button' || k === 'file') step.value = '';
      }
      saveData();
      if (!viewStep.hidden && currentStepId === step.id) {
        updatePickStatus(step);
        applyFieldUI(identity && identity.field ? identity.field : msg.info.field);
        if (stepValue && !stepValue.hidden) stepValue.value = step.value || '';
        updateSaveStepBtnState();
      }
      if (!viewProject.hidden) renderProject();
      const fieldLabel = (msg.info.field && msg.info.field.kind && FIELD_META[msg.info.field.kind])
        ? FIELD_META[msg.info.field.kind].label
        : null;
      addLog(
        Math.round(msg.info.pageX) + ', ' + Math.round(msg.info.pageY) +
        (fieldLabel ? ' · ' + fieldLabel : ''),
        'ok'
      );

      if (msg.info.captchaMarker) {
        step.kind = 'captcha';
        // Rasm joyini ham saqlaymiz — keyin AI uchun topish oson
        step.captchaMarkerInfo = Object.assign({}, msg.info.captchaMarker, {
          pageX: msg.info.pageX,
          pageY: msg.info.pageY,
          clientX: msg.info.clientX,
          clientY: msg.info.clientY,
        });
        step.pageX = msg.info.pageX;
        step.pageY = msg.info.pageY;
        saveData();
        addLog('Captcha aniqlandi (' + msg.info.captchaMarker.level + ') — inputni tanlang', 'warn');
        askCaptchaInput(step);
      } else {
        pendingPick = null;
        updateSaveStepBtnState();
      }
    }
  }
  if (msg.type === 'SELECTION_CANCELLED') {
    if (!pickTokenMatches(msg)) { setPickerActive(false); return; }
    const target = pendingPick && data.projects.find((p) => p.id === pendingPick.projectId);
    const step = target && target.steps.find((s) => s.id === pendingPick.stepId);
    pendingPick = null;
    if (step && !viewStep.hidden && currentStepId === step.id) updatePickStatus(step);
    addLog('Tanlov bekor qilindi', 'warn');
  }
  if (msg.type === 'COWORK_LOG') addLog(msg.text, msg.kind || '');
  if (msg.type === 'COWORK_DONE') {
    setRunningState(false);
    addLog(msg.ok ? 'Done' : (msg.error || 'Stopped'), msg.ok ? 'ok' : 'warn');
  }
  if (msg.type === 'STEP_ELEMENT_SAVED' && msg.projectId && msg.stepId) {
    const p = data.projects.find((x) => x.id === msg.projectId);
    const s = p && p.steps.find((x) => x.id === msg.stepId);
    if (s) {
      if (msg.info && msg.info.pageX != null) {
        s.pageX = msg.info.pageX;
        s.pageY = msg.info.pageY;
      }
      s.elementInfo = msg.info;
      saveData();
    }
  }
}

// ============================================================
// XAVFSIZLIK: bu iframe <all_urls> bo'yicha HAR BIR saytga inject
// qilinadi. window.postMessage orqali kelgan xabar sayt bilan BIR
// XIL originda yotadi (content script sahifaning o'z window'idan
// postMessage chaqiradi) — shuning uchun har qanday 3-tomon skript
// (reklama, boshqa extension, attacker) COORD_SELECTED/ELEMENT_SELECTED
// kabi xabarlarni soxtalashtirib, foydalanuvchi bilmagan joyga
// bosish/yozishga majburlashi mumkin edi (real step-hijacking).
//
// Yagona ishonchli kanal — chrome.runtime.onMessage: bu faqat SHU
// extension'ning o'z content scriptlaridan keladi, oddiy sahifa JS'i
// (externally_connectable e'lon qilinmagani uchun) bunga umuman
// kira olmaydi. content.js allaqachon har bir xabarni shu kanal
// orqali ham yuboradi (notifyPanel), shuning uchun window.postMessage
// endi umuman kerak emas — soxtalashtirib bo'lmaydigan yagona yo'l
// sifatida FAQAT shu qoldirildi.
chrome.runtime.onMessage.addListener((msg) => {
  handlePanelMessage(msg);
});

// ============================================================
// Table field (Get Json uchun key nomlari)
// ============================================================
const tableFieldBtn = document.getElementById('tableFieldBtn');
const tableFieldSection = document.getElementById('tableFieldSection');
const tableFieldInput = document.getElementById('tableFieldInput');
const tableFieldError = document.getElementById('tableFieldError');
const tableFieldSaveBtn = document.getElementById('tableFieldSaveBtn');
const tableFieldOverwriteBtn = document.getElementById('tableFieldOverwriteBtn');
const tableFieldModeTabs = document.getElementById('tableFieldModeTabs');
const tableFieldGlobalValueWrap = document.getElementById('tableFieldGlobalValueWrap');
const tableFieldGlobalValue = document.getElementById('tableFieldGlobalValue');
const getJsonBtn = document.getElementById('getJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importJsonModal = document.getElementById('importJsonModal');
const importJsonDropzone = document.getElementById('importJsonDropzone');
const importJsonBrowseBtn = document.getElementById('importJsonBrowseBtn');
const importJsonFileInput = document.getElementById('importJsonFileInput');
const importJsonCancelBtn = document.getElementById('importJsonCancelBtn');
let tableFieldMode = 'normal';

// Kalit nomida ruxsat etilgan belgilar: harf (istalgan til), raqam, "_" va "-".
// Bo'sh joy, tirnoq, ":" kabi belgilar taqiqlangan — chunki JSON'da kalit
// endi tirnoqsiz (bare) yoziladi, shu belgilar bo'lsa format buzilib qoladi.
const TABLE_FIELD_KEY_RE = /^[\p{L}\p{N}_-]+$/u;

function updateTableFieldBtnState() {
  if (!tableFieldBtn) return;
  const s = currentStep();
  const has = !!(s && s.tableField);
  tableFieldBtn.classList.toggle('active', has);
  tableFieldBtn.title = has
    ? ('Table field: ' + s.tableField + (s.tableFieldGlobal ? ' (global)' : ''))
    : 'Table field';
}

function setTableFieldMode(mode) {
  tableFieldMode = mode === 'global' ? 'global' : 'normal';
  if (tableFieldModeTabs) {
    tableFieldModeTabs.querySelectorAll('.settings-tab').forEach((t) => {
      const active = t.dataset.mode === tableFieldMode;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }
  if (tableFieldGlobalValueWrap) tableFieldGlobalValueWrap.hidden = tableFieldMode !== 'global';
}

// Joriy step'dan boshqa qaysi step shu key nomini shu scope'da (global/oddiy)
// band qilib turganini topadi. Topilsa — duplicate deb hisoblanadi.
function findConflictingStep(key, isGlobal) {
  const p = currentProject();
  const s = currentStep();
  if (!p || !s || !key) return null;
  return realSteps(p).find((st) => st.id !== s.id && st.tableField === key && !!st.tableFieldGlobal === isGlobal) || null;
}

// Kiritilgan kalit nomi bilan bog'liq muammoni qaytaradi:
// null — muammo yo'q, 'invalid' — taqiqlangan belgi bor, 'duplicate' — band.
function tableFieldKeyIssue(val, isGlobal) {
  if (!val) return null;
  if (!TABLE_FIELD_KEY_RE.test(val)) return 'invalid';
  if (findConflictingStep(val, isGlobal)) return 'duplicate';
  return null;
}

// Input'ga yozilayotganda (yoki tab almashtirilganda) chaqiriladi:
// noto'g'ri belgi yoki duplicate bo'lsa input qizaradi va mos xabar chiqadi;
// duplicate holida "Ustidan yozish" tugmasi ham ko'rinadi. Har chaqirilganda
// xato qutisi to'liq qayta hisoblanadi — shuning uchun eski xabarlar ham
// foydalanuvchi tuzata boshlashi bilan o'zi tozalanadi.
function checkTableFieldDuplicate() {
  if (!tableFieldInput) return null;
  const val = tableFieldInput.value.trim();
  const isGlobal = tableFieldMode === 'global';
  tableFieldInput.classList.remove('input-error');
  if (tableFieldOverwriteBtn) tableFieldOverwriteBtn.hidden = true;
  if (!val) {
    if (tableFieldError) { tableFieldError.hidden = true; tableFieldError.textContent = ''; }
    return null;
  }
  const issue = tableFieldKeyIssue(val, isGlobal);
  if (issue === 'invalid') {
    tableFieldInput.classList.add('input-error');
    if (tableFieldError) {
      tableFieldError.textContent = "Kalit nomida faqat harf, raqam, _ va - bo'lishi mumkin (bo'sh joy, tirnoq, : bo'lmasin)";
      tableFieldError.hidden = false;
    }
  } else if (issue === 'duplicate') {
    tableFieldInput.classList.add('input-error');
    if (tableFieldOverwriteBtn) tableFieldOverwriteBtn.hidden = false;
    if (tableFieldError) {
      tableFieldError.textContent = "Bu kalit nomi shu scope'da band — ustidan yozish uchun tugmani bosing";
      tableFieldError.hidden = false;
    }
  } else if (tableFieldError) {
    tableFieldError.hidden = true;
    tableFieldError.textContent = '';
  }
  return issue;
}

function fillTableFieldSection() {
  const s = currentStep();
  if (!s) return;
  if (tableFieldInput) tableFieldInput.value = s.tableField || '';
  setTableFieldMode(s.tableFieldGlobal ? 'global' : 'normal');
  if (tableFieldGlobalValue) {
    const name = (s.tableField || '').trim();
    tableFieldGlobalValue.value = (name && data.globalFields && data.globalFields[name]) || '';
  }
  if (tableFieldInput) tableFieldInput.classList.remove('input-error');
  if (tableFieldOverwriteBtn) tableFieldOverwriteBtn.hidden = true;
  if (tableFieldError) { tableFieldError.hidden = true; tableFieldError.textContent = ''; }
}

function openTableFieldSection() {
  if (!tableFieldSection) return;
  fillTableFieldSection();
  tableFieldSection.hidden = false;
  setTimeout(() => tableFieldInput && tableFieldInput.focus(), 50);
}

function closeTableFieldSection() {
  if (!tableFieldSection) return;
  // Save bosilmagan bo'lsa — input/mode/qiymatlarni haqiqiy saqlangan holatga
  // qaytaramiz, shunda ekranda "osilib qolgan" saqlanmagan matn qolmaydi va
  // u hech qachon Get Json'ga chiqmaydi (chunki u allaqachon s.tableField'dan o'qiydi).
  fillTableFieldSection();
  tableFieldSection.hidden = true;
}

function toggleTableFieldSection() {
  if (!tableFieldSection) return;
  if (tableFieldSection.hidden) openTableFieldSection();
  else closeTableFieldSection();
}

function saveTableField() {
  const s = currentStep();
  if (!s || !tableFieldInput) return;
  const val = tableFieldInput.value.trim();
  if (!val) {
    if (tableFieldError) {
      tableFieldError.textContent = "Field nomini kiriting";
      tableFieldError.hidden = false;
    }
    return;
  }
  const isGlobal = tableFieldMode === 'global';
  if (tableFieldKeyIssue(val, isGlobal)) {
    // Noto'g'ri belgi yoki duplicate — jim saqlamaymiz, faqat
    // input'ni qizartirib mos xabarni ko'rsatamiz.
    checkTableFieldDuplicate();
    return;
  }
  if (tableFieldMode === 'global') {
    const gv = tableFieldGlobalValue ? tableFieldGlobalValue.value.trim() : '';
    if (!gv) {
      if (tableFieldError) {
        tableFieldError.textContent = "Global qiymatni kiriting";
        tableFieldError.hidden = false;
      }
      return;
    }
    data.globalFields = data.globalFields || {};
    data.globalFields[val] = gv;
    s.tableFieldGlobal = true;
  } else {
    s.tableFieldGlobal = false;
  }
  s.tableField = val;
  saveData();
  updateTableFieldBtnState();
  closeTableFieldSection();
}

if (tableFieldBtn) tableFieldBtn.addEventListener('click', toggleTableFieldSection);
if (tableFieldSaveBtn) tableFieldSaveBtn.addEventListener('click', saveTableField);
if (tableFieldOverwriteBtn) {
  tableFieldOverwriteBtn.addEventListener('click', () => {
    const val = tableFieldInput ? tableFieldInput.value.trim() : '';
    const isGlobal = tableFieldMode === 'global';
    // Avval qolgan shartlarni (masalan, Global qiymat bo'sh emasligini)
    // tekshiramiz — aks holda eski step'dan keyni olib tashlab,
    // keyin saqlash boshqa sababdan to'xtab qolsa, key hech kimga
    // tegishli bo'lmay yo'qolib qoladi.
    if (isGlobal) {
      const gv = tableFieldGlobalValue ? tableFieldGlobalValue.value.trim() : '';
      if (!gv) {
        if (tableFieldError) {
          tableFieldError.textContent = "Global qiymatni kiriting";
          tableFieldError.hidden = false;
        }
        return;
      }
    }
    const conflict = findConflictingStep(val, isGlobal);
    if (conflict) {
      // Eski step'dan key'ni tortib olamiz — endi u yerda duplicate qolmaydi.
      delete conflict.tableField;
      delete conflict.tableFieldGlobal;
    }
    tableFieldOverwriteBtn.hidden = true;
    if (tableFieldInput) tableFieldInput.classList.remove('input-error');
    if (tableFieldError) { tableFieldError.hidden = true; tableFieldError.textContent = ''; }
    saveTableField();
  });
}
if (tableFieldModeTabs) {
  tableFieldModeTabs.querySelectorAll('.settings-tab').forEach((t) => {
    t.addEventListener('click', () => { setTableFieldMode(t.dataset.mode); checkTableFieldDuplicate(); });
  });
}
if (tableFieldInput) {
  tableFieldInput.addEventListener('input', checkTableFieldDuplicate);
  tableFieldInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && tableFieldMode === 'normal') { e.preventDefault(); saveTableField(); }
  });
}
if (tableFieldGlobalValue) {
  tableFieldGlobalValue.addEventListener('input', () => {
    if (tableFieldError && tableFieldError.textContent === 'Global qiymatni kiriting') {
      tableFieldError.hidden = true;
      tableFieldError.textContent = '';
    }
  });
  tableFieldGlobalValue.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveTableField(); }
  });
}

// ============================================================
// Get Json — loyihadagi operatorlardan HAQIQIY, standart JSON shablon
// yasaydi (JSON.stringify orqali) — maxsus (bare-key, "*{ }" kabi)
// format emas, shuning uchun har qanday brauzer, JSON validator yoki
// muharrirda xatosiz ochiladi. Global field'lar "_global" degan maxsus
// kalit ostidagi obyektda, ularga bog'langan oddiy maydonlar esa qiymati
// sifatida tirnoqli "*" bilan belgilanadi (bu — to'liq legal JSON string).
// ============================================================
const RESERVED_JSON_KEYS = ['_global', 'records'];

function buildProjectJsonTemplate(p) {
  const bodyKeys = [];
  const globalKeySet = new Set();
  const globalObj = {};
  realSteps(p).forEach((s) => {
    if (s.kind === 'captcha') return;
    const key = s.tableField && s.tableField.trim();
    if (!key) return;
    if (!bodyKeys.includes(key)) bodyKeys.push(key);
    if (s.tableFieldGlobal) {
      globalKeySet.add(key);
      if (!(key in globalObj)) {
        globalObj[key] = (data.globalFields && data.globalFields[key]) || '';
      }
    }
  });

  const out = {};
  if (Object.keys(globalObj).length) out._global = globalObj;
  bodyKeys.forEach((key) => {
    out[key] = globalKeySet.has(key) ? '*' : '';
  });

  const text = JSON.stringify(out, null, 2);
  return { text, hasFields: bodyKeys.length > 0 };
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Import Json tugmasi FAQAT loyihada tableField'lar allaqachon
// belgilangan bo'lsa ko'rinadi/yoqiladi — bo'lmasa qayerga nima
// yozilishi noaniq bo'ladi, shuning uchun tugma umuman ko'rinmaydi.
function updateImportJsonBtnState() {
  if (!importJsonBtn) return;
  const p = currentProject();
  if (!p) { importJsonBtn.hidden = true; importJsonBtn.disabled = true; return; }
  const hasFields = realSteps(p).some((s) => s.kind !== 'captcha' && s.tableField && s.tableField.trim());
  importJsonBtn.hidden = !hasFields;
  importJsonBtn.disabled = !hasFields;
  importJsonBtn.title = hasFields ? "JSON fayl import qilish" : "Avval table field belgilang";
}

// ============================================================
// Import Json — float modal: drag&drop / fayl tanlash / Ctrl+V.
// Sahifaning istalgan joyiga tashlab import qilish OLIB TASHLANDI —
// import endi FAQAT shu oyna orqali, foydalanuvchi ataylab ochganda.
// Fayl qanday yo'l bilan kelishidan qat'iy nazar (drop / tanlash /
// paste), natija (muvaffaqiyatli yoki xato) aniqlangach oyna DARHOL
// yopiladi — keyingi xabar (toast/mismatch panel) alohida chiqadi.
// ============================================================
function openImportJsonModal() {
  if (!importJsonModal || importJsonBtn.disabled) return;
  importJsonModal.hidden = false;
}
function closeImportJsonModal() {
  if (!importJsonModal) return;
  importJsonModal.hidden = true;
  importJsonDropzone && importJsonDropzone.classList.remove('dragover');
}
function handleImportJsonResolved(file) {
  closeImportJsonModal();
  handleDroppedJsonFile(file);
}
function handleImportJsonText(text) {
  closeImportJsonModal();
  const parsed = parseDroppedFile(text);
  if (!parsed) { showDropToast("JSON o'qib bo'lmadi"); return; }
  if (parsed.type === 'error') { showJsonErrorPanel(text, parsed); return; }
  applyParsedJsonToProject(parsed);
}

if (importJsonBtn) importJsonBtn.addEventListener('click', openImportJsonModal);
if (importJsonCancelBtn) importJsonCancelBtn.addEventListener('click', closeImportJsonModal);
if (importJsonModal) {
  importJsonModal.addEventListener('click', (e) => { if (e.target === importJsonModal) closeImportJsonModal(); });
}

// 1) Faylni tanlash (fayl tizimidan)
if (importJsonBrowseBtn && importJsonFileInput) {
  importJsonBrowseBtn.addEventListener('click', () => importJsonFileInput.click());
  importJsonFileInput.addEventListener('change', () => {
    const file = importJsonFileInput.files && importJsonFileInput.files[0];
    importJsonFileInput.value = '';
    if (file) handleImportJsonResolved(file);
  });
}

// 2) Drag & drop — endi FAQAT shu modal ichida ishlaydi
if (importJsonDropzone) {
  ['dragenter', 'dragover'].forEach((evt) => {
    importJsonDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      importJsonDropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'dragend'].forEach((evt) => {
    importJsonDropzone.addEventListener(evt, () => importJsonDropzone.classList.remove('dragover'));
  });
  importJsonDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    importJsonDropzone.classList.remove('dragover');
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const file = Array.from(files).find((f) => /\.json$/i.test(f.name)) || files[0];
    if (file) handleImportJsonResolved(file);
  });
}

// 3) Ctrl+V — modal ochiq bo'lsa, joylashtirilgan matn (yoki fayl) qabul qilinadi
document.addEventListener('paste', (e) => {
  if (!importJsonModal || importJsonModal.hidden) return;
  const cd = e.clipboardData;
  if (!cd) return;
  const pastedFile = Array.from(cd.files || []).find((f) => /\.json$/i.test(f.name) || f.type === 'application/json');
  if (pastedFile) { e.preventDefault(); handleImportJsonResolved(pastedFile); return; }
  const text = cd.getData('text/plain');
  if (text && text.trim()) { e.preventDefault(); handleImportJsonText(text); }
});

if (getJsonBtn) {
  getJsonBtn.addEventListener('click', () => {
    const p = currentProject();
    if (!p) return;
    const { text, hasFields } = buildProjectJsonTemplate(p);
    if (!hasFields) {
      const prev = getJsonBtn.textContent;
      getJsonBtn.textContent = "Table field yo'q";
      setTimeout(() => { getJsonBtn.textContent = prev; }, 1400);
      return;
    }
    const safeName = (p.name || 'template').trim().replace(/[^\w\-]+/g, '_') || 'template';
    downloadTextFile(text, safeName + '.json');
    const prev = getJsonBtn.textContent;
    getJsonBtn.textContent = 'Yuklandi';
    setTimeout(() => { getJsonBtn.textContent = prev; }, 1400);
  });
}

// ============================================================
// Drag & drop: to'ldirilgan JSON faylni tashlab, qiymatlarni
// operatorlarga joylab, avtomatik ishga tushirish.
// Ko'rinadigan "shu yerga tashlang" qutisi yo'q — butun panelga tashlash yetarli.
// ============================================================
function showDropToast(msg, opts) {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'drop-toast' + (opts.warn ? ' warn' : '');
  el.textContent = msg; // CSS'dagi white-space:pre-line orqali \n qator boshiga o'tadi
  document.body.appendChild(el);
  el._hideTimer = setTimeout(() => { el.remove(); }, opts.duration || 1800);
  return el;
}

// Mavjud toast'ning matnini almashtiradi (masalan, avval tez local
// tashxis ko'rsatib, keyin AI'ning aniqroq javobi kelganda o'sha yerning
// o'zida yangilash uchun) — yangi toast qo'shib, ustma-ust chiqib
// ketishining oldini oladi.
function updateDropToast(el, msg, opts) {
  opts = opts || {};
  if (!el || !el.isConnected) { showDropToast(msg, opts); return; }
  el.textContent = msg;
  el.classList.toggle('warn', !!opts.warn);
  if (el._hideTimer) clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.remove(); }, opts.duration || 1800);
}

// Buzilgan JSON faylni background.js orqali AI (arzon matn model) bilan
// tahlil qildiradi — qaysi qatorda, nima sabab va nima qilish kerakligini
// aniq aytadi. Groq API key bo'lmasa yoki so'rov muvaffaqiyatsiz bo'lsa,
// null qaytaradi va chaqiruvchi tomon oddiy (local) tashxis bilan qoladi.
// Ba'zi qurilma/dastur (telefon klaviaturasi, Word) oddiy to'g'ri tirnoq (")
// o'rniga "qiya" tirnoq qo'yib yuboradi (" " « » „) — bular JSON
// standartida umuman tanilmaydi va JSON.parse darrov xato beradi. Shuning
// uchun parse qilishdan oldin ularni oddiy tirnoqqa almashtiramiz. Yakka
// tirnoq (' ' va apostrof) ATAYIN tegilmaydi — o'zbekcha so'zlarda ("o'g'li"
// kabi) juda ko'p uchraydi va JSON'da baribir string chegarasi bo'lmaydi.
function normalizeJsonQuotes(text) {
  return text.replace(/[\u201C\u201D\u00AB\u00BB\u201E]/g, '"');
}

// JSON.parse xatosidan pozitsiyani o'qib, qaysi qator/ustunda ekanini
// odam tushunadigan qilib chiqaradi — brauzerning xom "Unexpected token"
// xabaridan ko'ra aniqroq va foydalanuvchiga tushunarli.
function describeJsonError(text, err) {
  const msg = (err && err.message) || '';
  const m = /position (\d+)/.exec(msg);
  if (!m) return msg || "noma'lum xato";
  const pos = parseInt(m[1], 10);
  const head = text.slice(0, pos);
  const line = head.split('\n').length;
  const col = pos - head.lastIndexOf('\n');
  return line + '-qator, ' + col + "-ustunda — qavs, vergul yoki tirnoq noto'g'ri qo'yilgan bo'lishi mumkin";
}

// ============================================================
// JSON AVTO-TUZATISH (AI'SIZ, 0 TOKEN) — buzilgan JSON'ni deterministik
// yo'l bilan tuzatishga harakat qiladi. MUHIM PRINSIP: har bir tuzatish
// FAQAT strukturaga (qavs, vergul, tirnoq) tegadi, qatorlar ICHIDAGI
// matnga (ism, familiya va h.k.) HECH QACHON tegmaydi — buning uchun
// pastda qatorlarni "maskalab" (vaqtincha almashtirib) qo'yamiz. Oxirida
// natija albatta HAQIQIY JSON.parse bilan tekshiriladi — agar tuzatish
// muvaffaqiyatsiz bo'lsa, buzilgan ma'lumot HECH QACHON qo'llanilmaydi,
// shunchaki "tuzata olmadim" deb qaytariladi. Shu bilan 100% xato
// ma'lumot yozib qo'yish xavfi YO'Q — yoki to'liq to'g'ri JSON, yoki hech narsa.
// ============================================================

// JSON'dan oldin/keyin tasodifan tushib qolgan matnni (masalan odam JSON'ni
// biror xabar ichiga yopishtirib yuborgan bo'lsa) kesib tashlaydi.
function trimToJsonBounds(text) {
  const first = text.search(/[{[]/);
  if (first === -1) return text;
  let last = -1;
  for (let k = text.length - 1; k >= 0; k--) {
    if (text[k] === '}' || text[k] === ']') { last = k; break; }
  }
  // Yopuvchi qavs umuman topilmadi — demak fayl oxiri ham buzilgan
  // (masalan qavs yopilmagan). Bu holatda faqat BOSHIDAGI ortiqcha
  // matnni kesib tashlaymiz, oxirini balanceBrackets keyinroq tuzatadi.
  if (last === -1) return text.slice(first);
  if (last < first) return text;
  return text.slice(first, last + 1);
}

// // va /* */ uslubidagi izohlarni olib tashlaydi — lekin tirnoq ICHIDAGI
// "//" yoki "/*" matnga tegmaydi (masalan URL yoki izoh so'zi qiymat bo'lsa).
function stripJsonComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let inStr = false, strQuote = '"', escaped = false;
  while (i < n) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === strQuote) { inStr = false; }
      i++; continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; strQuote = ch; out += ch; i++; continue; }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2; continue;
    }
    out += ch; i++;
  }
  return out;
}

// JS/Python uslubida yakka tirnoq bilan yozilgan qatorlarni ({'ism': 'Ali'})
// standart qo'sh tirnoqqa o'tkazadi. Allaqachon qo'sh tirnoq ICHIDAGI
// apostroflarga (masalan "o'g'li") HECH QACHON tegmaydi — chunki ular
// inStr=true holatda oddiy belgi sifatida o'tkazib yuboriladi.
function convertSingleQuotedStrings(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let inDq = false, escaped = false;
  while (i < n) {
    const ch = text[i];
    if (inDq) {
      out += ch;
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === '"') { inDq = false; }
      i++; continue;
    }
    if (ch === '"') { inDq = true; out += ch; i++; continue; }
    if (ch === "'") {
      let j = i + 1;
      let inner = '';
      let esc = false;
      while (j < n) {
        const c = text[j];
        if (esc) { inner += c; esc = false; j++; continue; }
        if (c === '\\') { inner += c; esc = true; j++; continue; }
        if (c === "'") { j++; break; }
        inner += c; j++;
      }
      out += '"' + inner.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"';
      i = j; continue;
    }
    out += ch; i++;
  }
  return out;
}

// Matndagi barcha "..." qatorlarni vaqtincha \u0000N\u0001 ko'rinishidagi
// belgiga almashtiradi. Shundan keyin qolgan matnda (structure) hech qanday
// qator MATNI qolmaydi — shu bilan keyingi regex-tuzatishlar 100% xavfsiz,
// ism/familiya kabi qiymatlarga tegib ketish MUMKIN EMAS.
function maskJsonStrings(text) {
  const strings = [];
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      let buf = '"';
      let esc = false;
      while (j < n) {
        const c = text[j];
        buf += c;
        if (esc) { esc = false; }
        else if (c === '\\') { esc = true; }
        else if (c === '"') { j++; break; }
        j++;
      }
      strings.push(buf);
      out += '\u0000' + (strings.length - 1) + '\u0001';
      i = j; continue;
    }
    out += ch; i++;
  }
  return { masked: out, strings };
}

function unmaskJsonStrings(text, strings) {
  return text.replace(/\u0000(\d+)\u0001/g, (m, idx) => strings[Number(idx)]);
}

// Maskalangan (qatorlarsiz) matnni tokenlarga bo'ladi — faqat struktura qoladi:
// qavslar, vergul, ikki nuqta va "qiymat" bloklari (raqam/true/false/null/maska).
function tokenizeMaskedJson(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    if (ch === '{' || ch === '[') { tokens.push({ type: 'open', text: ch }); i++; continue; }
    if (ch === '}' || ch === ']') { tokens.push({ type: 'close', text: ch }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', text: ch }); i++; continue; }
    if (ch === ':') { tokens.push({ type: 'colon', text: ch }); i++; continue; }
    if (ch === '\u0000') {
      let j = i + 1;
      while (j < n && text[j] !== '\u0001') j++;
      tokens.push({ type: 'value', text: text.slice(i, j + 1) });
      i = j + 1; continue;
    }
    let j = i;
    while (j < n && ' \t\n\r{}[],:'.indexOf(text[j]) === -1 && text[j] !== '\u0000') j++;
    if (j === i) j = i + 1;
    tokens.push({ type: 'value', text: text.slice(i, j) });
    i = j;
  }
  return tokens;
}

// Tokenlardan qaytadan matn yig'adi: (1) keraksiz vergullarni (qavs boshida
// yoki yopuvchi qavsdan oldin) olib tashlaydi, (2) ikkita qiymat orasida
// vergul yetishmasa — qo'shadi. Ikkalasi ham eng ko'p uchraydigan JSON xatosi.
function rebuildJsonFromTokens(tokens) {
  const cleaned = [];
  tokens.forEach((t, idx) => {
    if (t.type === 'comma') {
      const prev = cleaned[cleaned.length - 1];
      const next = tokens[idx + 1];
      if (!prev || prev.type === 'open' || prev.type === 'comma') return;
      if (!next || next.type === 'close') return;
    }
    cleaned.push(t);
  });
  let out = '';
  for (let k = 0; k < cleaned.length; k++) {
    const prev = cleaned[k - 1];
    const cur = cleaned[k];
    if (prev) {
      const prevEndsValue = prev.type === 'value' || prev.type === 'close';
      const curStartsValue = cur.type === 'value' || cur.type === 'open';
      if (prevEndsValue && curStartsValue) out += ',';
    }
    out += cur.text;
  }
  return out;
}

// Yopilmagan qavslarni ({ yoki [) hisoblab, oxiriga yetishmaganlarini
// to'g'ri tartibda qo'shib qo'yadi. Faqat "yopish unutilgan" holatini
// tuzatadi — ortiqcha yopuvchi qavs holatini emas (bu kamroq uchraydi
// va AI fallback'ga qoldiriladi).
function balanceBrackets(text) {
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === '\\') { esc = true; }
      else if (ch === '"') { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }
  if (!stack.length) return text;
  let closers = '';
  for (let i = stack.length - 1; i >= 0; i--) closers += (stack[i] === '{' ? '}' : ']');
  return text + closers;
}

// Asosiy pipeline. Har bir bosqichdan keyin natija saqlanadi va oxirida
// HAQIQIY JSON.parse bilan tasdiqlanadi. Muvaffaqiyatli bo'lsa — chiroyli
// formatlangan (2-bo'sh joy bilan) JSON qaytariladi. Muvaffaqiyatsiz bo'lsa —
// qaysi tuzatishlar sinab ko'rilgani va oxirgi xato haqida ma'lumot qaytadi,
// shunda chaqiruvchi (AI fallback yoki foydalanuvchiga xabar) davom etadi.
function autoFixJsonText(rawText) {
  const fixes = [];
  let text = String(rawText || '').replace(/^\uFEFF/, '');

  try {
    JSON.parse(normalizeJsonQuotes(text));
    return { ok: true, text: JSON.stringify(JSON.parse(normalizeJsonQuotes(text)), null, 2), fixes: [] };
  } catch (e) { /* davom etamiz */ }

  let step = normalizeJsonQuotes(text);
  if (step !== text) fixes.push("Qiya tirnoqlar (\u201C \u201D) oddiy tirnoqqa almashtirildi");
  text = step;

  step = trimToJsonBounds(text);
  if (step !== text) fixes.push("JSON atrofidagi ortiqcha matn olib tashlandi");
  text = step;

  step = stripJsonComments(text);
  if (step !== text) fixes.push('Izohlar (// yoki /* */) olib tashlandi');
  text = step;

  step = convertSingleQuotedStrings(text);
  if (step !== text) fixes.push("Yakka tirnoqli qatorlar qo'sh tirnoqqa o'tkazildi");
  text = step;

  const { masked, strings } = maskJsonStrings(text);
  let m = masked;

  let mStep = m.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  if (mStep !== m) fixes.push("Tirnoqsiz kalitlar (masalan ism:) tirnoqqa olindi");
  m = mStep;

  mStep = m.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null').replace(/\bNaN\b/g, 'null').replace(/\bundefined\b/g, 'null');
  if (mStep !== m) fixes.push("Python/JS uslubidagi qiymatlar (True/False/None) ga o'tkazildi");
  m = mStep;

  const tokens = tokenizeMaskedJson(m);
  mStep = rebuildJsonFromTokens(tokens);
  if (mStep !== m) fixes.push("Yetishmagan yoki ortiqcha vergullar tuzatildi");
  m = mStep;

  text = unmaskJsonStrings(m, strings);

  step = balanceBrackets(text);
  if (step !== text) fixes.push("Yopilmagan qavs(lar) avtomatik yopildi");
  text = step;

  try {
    const obj = JSON.parse(text);
    return { ok: true, text: JSON.stringify(obj, null, 2), fixes };
  } catch (err) {
    return { ok: false, text, fixes, error: describeJsonError(text, err) };
  }
}

// Record ichidagi "*" (tirnoqli, demak oddiy JSON string) qiymatlarni
// globalMap'dagi haqiqiy qiymat bilan almashtiradi.
function applyGlobalPlaceholders(obj, globalMap) {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    const v = obj[k];
    out[k] = (v === '*') ? (globalMap[k] != null ? globalMap[k] : '') : v;
  });
  return out;
}

// Faylni to'liq o'qiydi. Endi HAQIQIY JSON.parse ishlatiladi — o'z qo'lda
// yozilgan qavs-hisoblovchi parser emas. Shu bilan Get Json orqali olingan
// fayl HAR QANDAY brauzer, JSON validator yoki muharrirda xatosiz ochiladi,
// chunki biz ham aynan o'sha standart formatni o'qiymiz — maxsus qoidalar
// (bare kalit, "*{ }" bloki) endi umuman yo'q.
// Qo'llab-quvvatlanadigan shakllar:
//  - { "ism": "", "familiya": "" }                      → bitta yozuv
//  - { "_global": {...}, "ism": "", "manzil": "*" }      → global default bilan
//  - { "_global": {...}, "records": [ {...}, {...} ] }   → bir nechta yozuv
//  - [ {...}, {...} ]                                    → bir nechta yozuv (global'siz)
// Natija:
//  - { type: 'single', record: {...}, warnings: [...] }
//  - { type: 'multi', records: [...], recordNums: [...], warnings: [...] }
//  - { type: 'error', warnings: [...] }
function parseDroppedFile(text) {
  // Ba'zi dasturlar (Notepad, Excel) faylni "UTF-8 BOM" bilan saqlaydi —
  // bu ko'rinmas belgi qatorning boshida turib JSON.parse'ni buzib
  // qo'yishi mumkin edi. Avtomatik olib tashlanadi.
  text = String(text || '').replace(/^\uFEFF/, '');

  let json;
  try {
    json = JSON.parse(normalizeJsonQuotes(text));
  } catch (err) {
    return {
      type: 'error',
      warnings: ["JSON o'qilmadi — " + describeJsonError(text, err)],
      rawError: (err && err.message) || '',
    };
  }
  if (json === null || typeof json !== 'object') {
    return { type: 'error', warnings: ['Fayl JSON obyekt yoki massiv emas'] };
  }

  if (Array.isArray(json)) {
    if (!json.length) return { type: 'error', warnings: ["Massiv bo'sh"] };
    const records = json.map((r) => applyGlobalPlaceholders(r && typeof r === 'object' ? r : {}, {}));
    return { type: 'multi', records, recordNums: records.map((_, i) => i + 1), warnings: [] };
  }

  const globalMap = (json._global && typeof json._global === 'object') ? json._global : {};

  if (Array.isArray(json.records)) {
    if (!json.records.length) return { type: 'error', warnings: ["'records' massivi bo'sh"] };
    const records = json.records.map((r) => applyGlobalPlaceholders(r && typeof r === 'object' ? r : {}, globalMap));
    return { type: 'multi', records, recordNums: records.map((_, i) => i + 1), warnings: [] };
  }

  const flat = {};
  Object.keys(json).forEach((k) => { if (!RESERVED_JSON_KEYS.includes(k)) flat[k] = json[k]; });
  if (!Object.keys(flat).length) return { type: 'error', warnings: ['Hech qanday maydon topilmadi'] };
  return { type: 'single', record: applyGlobalPlaceholders(flat, globalMap), warnings: [] };
}

// Loyihaning tableField'lari bilan JSON'dan kelgan kalitlarni solishtiradi:
//  - loyihada bor, JSON'da yo'q maydon  → ehtimol JSON'da unutilgan
//  - JSON'da bor, loyihaga mos kelmagan kalit → ehtimol TYPO (masalan
//    "ismi" deb yozib, loyihada "ism" bo'lishi)
// Bularning ikkalasi ham ilgari SIZ HECH NARSA bilmasdan jim o'tkazib
// yuborilardi — endi ochiq ogohlantiramiz.
function diagnoseFieldMismatch(target, recordsArr) {
  const tableFieldKeys = Array.from(new Set(
    realSteps(target)
      .filter((s) => s.kind !== 'captcha' && s.tableField && s.tableField.trim())
      .map((s) => s.tableField.trim())
  ));
  const jsonKeys = new Set();
  recordsArr.forEach((r) => Object.keys(r || {}).forEach((k) => jsonKeys.add(k)));

  const missing = tableFieldKeys.filter((k) => !jsonKeys.has(k));
  const unknown = Array.from(jsonKeys).filter((k) => !tableFieldKeys.includes(k));

  const warnings = [];
  if (missing.length) warnings.push("Loyihada bor, JSON'da yo'q: " + missing.join(', '));
  if (unknown.length) warnings.push("JSON'dagi noma'lum kalit(lar): " + unknown.join(', '));
  return warnings;
}

function projectHasFilledTableFieldValues(p) {
  return realSteps(p).some((s) => s.tableField && s.value != null && String(s.value).trim() !== '');
}

// --- Dublikat import himoyasi ---
// Bir xil JSON faylni ikki marta tashlab yuborish (tasodifiy ikki marta
// drag&drop yoki Ctrl+V) — audit aynan shu holatni topgan: hech qanday
// tekshiruv yo'q edi, har safar TO'LIQ YANGI subtablar to'plami
// yaratilardi, ya'ni bitta odamning ma'lumoti saytga ikki marta
// yuborilishi mumkin edi. Quyidagi ikkita funksiya — mavjud subtabning
// "joriy holati" bilan yangi record "qo'llanilganda qanday bo'lishi"ni
// solishtiradi (faqat tableField'ga bog'langan qadamlar bo'yicha).
function projectTableFieldSnapshot(p) {
  const out = {};
  realSteps(p).forEach((s) => {
    if (s.kind === 'captcha') return;
    const key = s.tableField && s.tableField.trim();
    if (!key) return;
    out[key] = s.value != null ? String(s.value) : '';
  });
  return out;
}
function recordSnapshotForTarget(target, record) {
  const out = {};
  realSteps(target).forEach((s) => {
    if (s.kind === 'captcha') return;
    const key = s.tableField && s.tableField.trim();
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const v = record[key];
      out[key] = v == null ? '' : String(v);
    } else {
      out[key] = '';
    }
  });
  return out;
}
function snapshotsEqual(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

function cloneProjectForFill(p) {
  return {
    id: uid(),
    name: (p.name || 'Project') + ' (copy)',
    steps: realSteps(p).map((s) => ({ ...s, id: uid() })),
  };
}

// Yozuvdan ("ism"/"familiya" kabi mos keladigan kalitlardan) tab uchun
// o'qishga qulay nom yasaydi. Mos keladigan kalit topilmasa, "fallback N"
// ko'rinishida raqamlangan nom qaytaradi.
function recordDisplayName(record, fallback, index) {
  const nameKeys = ['ism', 'ismi', 'name', 'first_name'];
  const surnameKeys = ['familiya', 'familya', 'surname', 'last_name'];
  const nameKey = nameKeys.find((k) => record[k] != null && String(record[k]).trim());
  const surnameKey = surnameKeys.find((k) => record[k] != null && String(record[k]).trim());
  const parts = [];
  if (nameKey) parts.push(String(record[nameKey]).trim());
  if (surnameKey) parts.push(String(record[surnameKey]).trim());
  if (parts.length) return parts.join(' ');
  return (fallback || 'Yozuv') + ' ' + index;
}

function applyParsedValuesToProject(p, parsedObj) {
  let applied = 0;
  realSteps(p).forEach((s) => {
    if (s.kind === 'captcha') return;
    const key = s.tableField && s.tableField.trim();
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(parsedObj, key)) {
      const v = parsedObj[key];
      // JSON'da qiymat null/undefined bo'lsa — bo'sh string sifatida
      // ishlatamiz. Oldin String(null) === "null" bo'lib, bu so'z
      // haqiqiy saytning formasiga LITERAL "null" deb yozilib qolardi
      // (masalan "familiya: null") — jiddiy data-corruption edi.
      s.value = (v == null) ? '' : String(v);
      applied += 1;
    }
  });
  return applied;
}

function runCurrentProjectSoon() {
  setTimeout(() => {
    const btn = document.getElementById('runBtn');
    if (btn && !btn.disabled) btn.click();
  }, 300);
}

// Xato panelini chizadi: chapda "Yopish", o'ngda "Avto tuzatish" tugmasi.
// Orqa fonda (agar Groq key bo'lsa) AI'dan tushunarli tashxis ham so'raladi
// va xabar matni o'sha yerning o'zida yangilanadi — tugmalarga taalluqli emas.
function showJsonErrorPanel(rawText, parsed) {
  const el = document.createElement('div');
  el.className = 'drop-toast warn fixable';

  const msgEl = document.createElement('div');
  msgEl.className = 'drop-toast-msg';
  msgEl.textContent = 'Ogohlantirish: ' + parsed.warnings.join('\nOgohlantirish: ');
  el.appendChild(msgEl);

  const actions = document.createElement('div');
  actions.className = 'drop-toast-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dt-btn dt-btn-close';
  closeBtn.textContent = 'Yopish';
  closeBtn.addEventListener('click', () => {
    if (el._hideTimer) clearTimeout(el._hideTimer);
    el.remove();
  });

  const fixBtn = document.createElement('button');
  fixBtn.type = 'button';
  fixBtn.className = 'dt-btn dt-btn-fix';
  fixBtn.textContent = 'Avto tuzatish';
  fixBtn.addEventListener('click', () => handleAutoFixClick(el, rawText, fixBtn, msgEl));

  actions.appendChild(closeBtn);
  actions.appendChild(fixBtn);
  el.appendChild(actions);

  document.body.appendChild(el);
  // Tugmali panel — foydalanuvchi o'zi yopmaguncha uzoqroq turadi,
  // lekin abadiy osilib qolmasligi uchun xavfsizlik muddati bor.
  el._hideTimer = setTimeout(() => { el.remove(); }, 30000);

  return el;
}

// "Avto tuzatish" bosilganda: avval 0-token deterministik fixer ishlaydi.
// U yeta olmasa (juda og'ir buzilgan bo'lsa) va Groq API key bor bo'lsa,
// AI'dan tuzatilgan JSON so'raladi — lekin AI javobi HAM albatta JSON.parse
// bilan tekshiriladi, ko'r-ko'rona ishonilmaydi.
function handleAutoFixClick(panelEl, rawText, fixBtn, msgEl) {
  fixBtn.disabled = true;
  fixBtn.textContent = 'Tuzatilmoqda…';

  const local = autoFixJsonText(rawText);
  if (local.ok) {
    finishAutoFix(panelEl, local.text, local.fixes, 'local');
    return;
  }

  const apiKey = getGroqApiKey();
  if (!apiKey) {
    fixBtn.disabled = false;
    fixBtn.textContent = 'Avto tuzatish';
    msgEl.textContent = "Ogohlantirish: Avtomatik tuzatib bo'lmadi — qo'lda tekshiring:\n" + (local.error || '');
    return;
  }

  // local.text — bizning autoFixJsonText funksiyamiz allaqachon tozalab
  // bergan versiya (izohlar, ortiqcha matn, noto'g'ri tirnoqlar olib
  // tashlangan) — rawText emas. Shu bilan AI'ga KAMROQ token (arzonroq,
  // tezroq) boradi va uning vazifasi ham osonlashadi (faqat qolgan kichik
  // sintaksis xatosini tuzatadi) — natija ham sifatliroq bo'ladi.
  chrome.runtime.sendMessage(
    { type: 'FIX_JSON', text: local.text, error: local.error, apiKey },
    (r) => {
      void chrome.runtime.lastError;
      if (r && r.ok && r.text) {
        let candidate = String(r.text).trim()
          .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
        try {
          const obj = JSON.parse(normalizeJsonQuotes(candidate));
          finishAutoFix(panelEl, JSON.stringify(obj, null, 2), ['AI (Groq) orqali tuzatildi'], 'ai');
          return;
        } catch (e) { /* AI javobi ham buzilgan — pastga tushamiz */ }
      }
      fixBtn.disabled = false;
      fixBtn.textContent = 'Avto tuzatish';
      msgEl.textContent = "Ogohlantirish: Avtomatik tuzatib bo'lmadi — qo'lda tekshiring:\n" + (local.error || '');
    }
  );
}

function finishAutoFix(panelEl, fixedText, fixes, source) {
  if (panelEl._hideTimer) clearTimeout(panelEl._hideTimer);
  panelEl.remove();
  const label = source === 'ai' ? 'AI tuzatdi' : 'Avtomatik tuzatildi';
  showDropToast(label + (fixes && fixes.length ? ':\n' + fixes.join('\n') : ''), { duration: 2600 + (fixes ? fixes.length * 700 : 0) });

  const parsedAgain = parseDroppedFile(fixedText);
  if (parsedAgain.type === 'error') {
    showDropToast("Tuzatilgan fayl baribir noto'g'ri: " + parsedAgain.warnings.join('; '), { warn: true, duration: 2600 });
    return;
  }
  applyParsedJsonToProject(parsedAgain);
}

function handleDroppedJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rawText = String(reader.result || '');
    const parsed = parseDroppedFile(rawText);
    if (!parsed) { showDropToast("JSON o'qib bo'lmadi"); return; }
    if (parsed.type === 'error') {
      showJsonErrorPanel(rawText, parsed);
      return;
    }
    applyParsedJsonToProject(parsed);
  };
  reader.readAsText(file);
}

// Ikki so'z orasidagi "tahrirlash masofasi" (Levenshtein distance) —
// nechta harf almashtirish/qo'shish/o'chirish orqali bir so'zdan
// ikkinchisiga o'tish mumkinligini hisoblaydi. Kichik son = so'zlar
// bir-biriga juda o'xshash (ehtimol typo). Standart dinamik dasturlash
// algoritmi — AI SHART EMAS, bu sof matematik/matn hisob-kitobi.
function levenshteinDistance(a, b) {
  a = String(a || ''); b = String(b || '');
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        prev[j] + 1,      // o'chirish
        cur[j - 1] + 1,   // qo'shish
        prev[j - 1] + cost // almashtirish
      );
    }
    prev = cur;
  }
  return prev[n];
}

// Har bir "notanish" kalit uchun loyihadagi tableField'lar orasidan eng
// yaqinini (typo bo'lishi ehtimoli yuqori bo'lganini) topadi. Masofa juda
// katta bo'lsa (so'zlar aslida boshqa-boshqa narsa) hech narsa taklif
// qilinmaydi — noto'g'ri taxmin berishdan ko'ra jim turgan afzal.
function closestTableFieldKey(unknownKey, tableFieldKeys) {
  let best = null, bestDist = Infinity;
  tableFieldKeys.forEach((k) => {
    const d = levenshteinDistance(unknownKey.toLowerCase(), k.toLowerCase());
    if (d < bestDist) { bestDist = d; best = k; }
  });
  // Masofa so'z uzunligining ~40% dan oshsa — bu ehtimol typo emas,
  // mutlaqo boshqa maydon, shuning uchun taklif qilmaymiz.
  const maxLen = Math.max(unknownKey.length, best ? best.length : 0);
  if (best && bestDist > 0 && bestDist <= Math.max(1, Math.ceil(maxLen * 0.4))) return best;
  return null;
}

// Maydon mos kelmasligi uchun ANIQ, RAQAMLANGAN qadamlar bilan tushuntirish
// yasaydi — AI SHART EMAS, chunki qaysi kalit yetishmayapti va qaysisi
// notanish ekani allaqachon diagnoseFieldMismatch orqali ANIQ hisoblab
// chiqilgan. Bu yerda faqat o'sha ma'lumotni odam o'qiydigan, aniq
// qadamlarga aylantiramiz — typo bo'lsa, eng yaqin nomni ham taklif qilamiz.
function buildFieldMismatchAdviceText(tableFieldKeys, jsonKeys, missing, unknown) {
  const steps = [];
  let n = 1;

  // Har bir notanish kalit uchun avval typo ekanligini tekshiramiz.
  const unresolvedUnknown = [];
  unknown.forEach((uk) => {
    const guess = closestTableFieldKey(uk, missing.length ? missing : tableFieldKeys);
    if (guess) {
      steps.push(n++ + ". JSON'dagi \u201C" + uk + "\u201D kalitini \u201C" + guess + "\u201D deb o'zgartiring (ehtimol yozuv xatosi — harflari juda o'xshash).");
      unresolvedUnknown.push(null); // shu unknown "izohlandi", missing ro'yxatidan olib tashlanadi (pastda)
    } else {
      unresolvedUnknown.push(uk);
    }
  });

  // Typo sifatida "izohlangan" nomlarni missing ro'yxatidan chiqaramiz,
  // aks holda "yo'q" deb HAM, "notanish" deb HAM ikki marta ko'rsatiladi.
  const guessedTargets = new Set();
  unknown.forEach((uk) => {
    const guess = closestTableFieldKey(uk, missing.length ? missing : tableFieldKeys);
    if (guess) guessedTargets.add(guess);
  });
  const stillMissing = missing.filter((k) => !guessedTargets.has(k));
  const stillUnknown = unresolvedUnknown.filter(Boolean);

  if (stillMissing.length) {
    steps.push(n++ + '. JSON faylingizga quyidagi kalit(lar)ni qo\'shing: ' + stillMissing.map((k) => '\u201C' + k + '\u201D').join(', ') + '.');
  }
  if (stillUnknown.length) {
    steps.push(n++ + '. JSON\'dagi quyidagi nom(lar) loyihada yo\'q, tekshirib to\'g\'irlang yoki olib tashlang: ' + stillUnknown.map((k) => '\u201C' + k + '\u201D').join(', ') + '.');
  }
  if (!steps.length) {
    steps.push('1. Kalit nomlarini solishtirib chiqing — katta-kichik harf va bo\'sh joy ham farq qiladi.');
  }
  return steps.join('\n');
}

// Field mismatch panel — MA'LUMOT HALI QO'LLANILMAGAN holatda ko'rsatiladi.
// Faqat "Yopish" tugmasi bor — bu yerda avto-tuzatish yo'q, chunki qaysi
// kalitni nimaga o'zgartirish kerakligi ANIQ EMAS (ehtimollik bilan
// taxmin qilish xato ma'lumot yozib qo'yish xavfini tug'diradi). Tushuntirish
// matni AI'SIZ, to'g'ridan-to'g'ri hisoblanadi (buildFieldMismatchAdviceText)
// — shuning uchun darhol, kutmasdan ko'rsatiladi.
function showFieldMismatchPanel(target, records, warnings) {
  const el = document.createElement('div');
  el.className = 'drop-toast warn fixable';

  const tableFieldKeys = Array.from(new Set(
    realSteps(target)
      .filter((s) => s.kind !== 'captcha' && s.tableField && s.tableField.trim())
      .map((s) => s.tableField.trim())
  ));
  const jsonKeySet = new Set();
  records.forEach((r) => Object.keys(r || {}).forEach((k) => jsonKeySet.add(k)));
  const jsonKeys = Array.from(jsonKeySet);
  const missing = tableFieldKeys.filter((k) => !jsonKeySet.has(k));
  const unknown = jsonKeys.filter((k) => !tableFieldKeys.includes(k));
  const adviceText = buildFieldMismatchAdviceText(tableFieldKeys, jsonKeys, missing, unknown);

  const msgEl = document.createElement('div');
  msgEl.className = 'drop-toast-msg';
  msgEl.textContent = "Xato: JSON yuklanmadi — maydonlar mos kelmadi:\n\n" + adviceText;
  el.appendChild(msgEl);

  const actions = document.createElement('div');
  actions.className = 'drop-toast-actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dt-btn dt-btn-close';
  closeBtn.style.flex = '1';
  closeBtn.textContent = 'Yopish';
  closeBtn.addEventListener('click', () => {
    if (el._hideTimer) clearTimeout(el._hideTimer);
    el.remove();
  });
  actions.appendChild(closeBtn);
  el.appendChild(actions);

  document.body.appendChild(el);
  el._hideTimer = setTimeout(() => { el.remove(); }, 30000);
}

function applyParsedJsonToProject(parsed) {
    const target = currentProject();
    if (!target) { showDropToast('Avval loyiha oching'); return; }
    if (!realSteps(target).some((s) => s.tableField)) {
      showDropToast("Bu loyihada table field yo'q");
      return;
    }

    // ============================================================
    // QATTIQ TEKSHIRUV DARVOZASI — MUHIM: bu yerda solishtirish FAQAT
    // HOZIR OCHIQ TURGAN "katta" tab (target) bilan qilinadi — chunki
    // aynan shu tabdagi tableField'lar "qayerga nima yozilishi"ni
    // belgilaydi. Subtablar bu tekshiruvda ISHTIROK ETMAYDI — ular
    // faqat keyinchalik har bir record'ni alohida KO'RISH uchun
    // yaratiladigan nusxalar, o'zlarining alohida "sxemasi" yo'q.
    //
    // Agar JSON'dagi kalitlar loyihaning tableField'lariga ANIQ mos
    // kelmasa (nimadir yetishmayapti yoki notanish kalit bor) — bu
    // "qayerga nima kirishi noaniq" degani, shuning uchun MA'LUMOT
    // UMUMAN QO'LLANILMAYDI. Foydalanuvchi buni ko'rib, JSON faylini
    // yoki loyihadagi tableField nomlarini tuzatib, qayta tashlashi kerak.
    // ============================================================
    const recordsForCheck = parsed.type === 'multi' ? parsed.records : [parsed.record];
    const mismatchWarnings = diagnoseFieldMismatch(target, recordsForCheck);
    if (mismatchWarnings.length) {
      showFieldMismatchPanel(target, recordsForCheck, mismatchWarnings);
      return;
    }

    if (parsed.type === 'multi') {
      // Bir nechta yozuv (masalan bir nechta bola) — YANGI TOP-LEVEL TAB
      // OCHMAYMIZ. Buning o'rniga bitta guruh (joriy tab / uning ota-tabi)
      // ostida SUBTAB sifatida qo'shamiz. Subtab faqat shu yo'l bilan —
      // dasturiy ravishda, JSON'da bir nechta record bo'lganda — yaratiladi.
      // Qo'lda "+" tugmasi bilan subtab qo'shib bo'lmaydi.
      //
      // groupId — joriy ochilgan tab ALLAQACHON subtab bo'lsa ham, u yerdan
      // ota-guruhning id'sini olamiz. Shu bilan ikkinchi qavat (subtab ichida
      // subtab) hosil bo'lishining oldi olinadi — hammasi bitta guruhga tushadi.
      const records = parsed.records;

      // Katta import himoyasi — audit shu chegarani taklif qilgan: 300+
      // recordni bitta bosishda subtabga aylantirish, storage hajmini
      // sezilarli oshiradi va agar bu tasodifiy (masalan noto'g'ri fayl)
      // bo'lsa, foydalanuvchi buni orqaga qaytarishga qiynaladi. Shuning
      // uchun katta hajmda ANIQ tasdiq so'raymiz.
      const LARGE_IMPORT_THRESHOLD = 300;
      if (records.length > LARGE_IMPORT_THRESHOLD) {
        const ok = confirm(
          records.length + " ta yozuv topildi — bu " + records.length +
          " ta subtab yaratadi va xotira hajmini sezilarli oshiradi.\n\n" +
          "Davom etasizmi?"
        );
        if (!ok) {
          showDropToast('Import bekor qilindi', { warn: true });
          return;
        }
      }

      const recordNums = parsed.recordNums || records.map((_, i) => i + 1);
      const targetIsEmpty = !projectHasFilledTableFieldValues(target);
      const groupId = groupIdOf(target);
      let firstOpenedId = null;
      let skippedDuplicates = 0;

      // Guruhda ALLAQACHON mavjud bo'lgan subtablarning "joriy holati" —
      // shu import davomida qo'shilgan yangi subtablar ham shu ro'yxatga
      // qo'shiladi, shunda BITTA fayl ICHIDAGI takrorlangan recordlar ham
      // (nafaqat ikki marta tashlangan fayllar) ushlanadi.
      const existingSnapshots = data.projects
        .filter((p) => p.id === groupId || p.parentId === groupId)
        .map((p) => projectTableFieldSnapshot(p));

      records.forEach((record, i) => {
        const snap = recordSnapshotForTarget(target, record);
        const isDup = existingSnapshots.some((s) => snapshotsEqual(s, snap));
        if (isDup) { skippedDuplicates += 1; return; }

        let proj;
        if (i === 0 && targetIsEmpty && firstOpenedId == null) {
          // Joriy (ochiq) tab hali bo'sh — 1-recordni shu yerga joylaymiz,
          // ortiqcha subtab yaratmaymiz. Bu guruhning "boshi" bo'lib qoladi.
          proj = target;
        } else {
          proj = cloneProjectForFill(target);
          proj.parentId = groupId; // <-- subtab sifatida belgilaymiz
          data.projects.push(proj);
        }
        proj.name = recordDisplayName(record, target.name, recordNums[i]);
        applyParsedValuesToProject(proj, record);
        existingSnapshots.push(projectTableFieldSnapshot(proj));
        if (firstOpenedId == null) firstOpenedId = proj.id;
      });

      if (firstOpenedId == null) {
        // Hammasi dublikat bo'lib chiqdi — hech narsa yaratilmadi.
        showDropToast(
          "Barcha " + records.length + " ta yozuv allaqachon mavjud (dublikat) — hech narsa qo'shilmadi",
          { warn: true, duration: 2600 }
        );
        return;
      }

      saveData();
      openProject(firstOpenedId);

      // Field mismatch allaqachon yuqorida tekshirilib, bo'sh (aks holda
      // shu yerga yetib kelmagan bo'lardik) — endi faqat parse vaqtidagi
      // ogohlantirishlar (bo'sh yozuv va h.k.) qoladi.
      const allWarnings = parsed.warnings || [];
      const createdCount = records.length - skippedDuplicates;
      let msg = createdCount + " ta subtab yaratildi — birma-bir Execute bosing";
      if (skippedDuplicates > 0) msg += '\nOgohlantirish: ' + skippedDuplicates + " ta dublikat yozuv o'tkazib yuborildi";
      if (allWarnings.length) msg += '\nOgohlantirish: ' + allWarnings.join('\nOgohlantirish: ');
      showDropToast(msg, { warn: allWarnings.length > 0 || skippedDuplicates > 0, duration: 1800 + (allWarnings.length + (skippedDuplicates > 0 ? 1 : 0)) * 1100 });
      return;
    }

    // type === 'single' — bitta yozuv, avvalgidek xatti-harakat.
    const record = parsed.record;
    const fieldWarnings = parsed.warnings || [];
    const warnSuffix = fieldWarnings.length ? '\nOgohlantirish: ' + fieldWarnings.join('\nOgohlantirish: ') : '';
    const toastOpts = { warn: fieldWarnings.length > 0, duration: 1800 + fieldWarnings.length * 1100 };

    if (projectHasFilledTableFieldValues(target)) {
      // Bu tab allaqachon to'ldirilgan (shablon) — asl nusxani buzmaslik uchun yangi tab ochamiz
      const clone = cloneProjectForFill(target);
      data.projects.push(clone);
      applyParsedValuesToProject(clone, record);
      saveData();
      openProject(clone.id);
      showDropToast('Yangi tab ochildi, ishga tushmoqda…' + warnSuffix, toastOpts);
    } else {
      // Bu tab hali bo'sh (ma'lumot yo'q) — to'g'ridan-to'g'ri shu yerga joylaymiz
      applyParsedValuesToProject(target, record);
      saveData();
      renderProject();
      showDropToast("Ma'lumot joylandi, ishga tushmoqda…" + warnSuffix, toastOpts);
    }
    runCurrentProjectSoon();
}

// Eslatma: sahifaning istalgan joyiga tashlab import qilish endi yo'q —
// import faqat "Import Json" tugmasi orqali ochiladigan modal ichida
// (yuqoridagi importJsonDropzone bo'limiga qarang).

// ============================================================
// Groq API Key + Settings
// ============================================================
const apiKeyPrompt = document.getElementById('apiKeyPrompt');
const apiKeyPromptInput = document.getElementById('apiKeyPromptInput');
const apiKeyPromptError = document.getElementById('apiKeyPromptError');
const apiKeyNotNowBtn = document.getElementById('apiKeyNotNowBtn');
const apiKeySaveBtn = document.getElementById('apiKeySaveBtn');
const settingsPanel = document.getElementById('settingsPanel');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsApiKey = document.getElementById('settingsApiKey');
const settingsApiKeySave = document.getElementById('settingsApiKeySave');
const settingsApiKeyClear = document.getElementById('settingsApiKeyClear');
const settingsApiKeyStatus = document.getElementById('settingsApiKeyStatus');
const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');

function getGroqApiKey() {
  return (data.settings && data.settings.groqApiKey) ? String(data.settings.groqApiKey).trim() : '';
}

function getGroqModel() {
  return (data.settings && data.settings.groqModel) || 'qwen/qwen3.8-27b';
}

function isValidGroqKeyFormat(key) {
  const k = String(key || '').trim();
  return k.length >= 20;
}

async function verifyGroqApiKey(key) {
  const k = String(key || '').trim();
  if (!isValidGroqKeyFormat(k)) {
    return { ok: false, error: 'API key noto\'g\'ri yoki juda qisqa' };
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + k },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'API key noto\'g\'ri yoki ruxsat yo\'q' };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body && body.error && body.error.message) || ('HTTP ' + res.status);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Tarmoq xatosi: ' + (err.message || String(err)) };
  }
}

async function saveApiKeyFromPrompt() {
  const key = (apiKeyPromptInput && apiKeyPromptInput.value || '').trim();
  if (apiKeyPromptError) {
    apiKeyPromptError.hidden = true;
    apiKeyPromptError.textContent = '';
  }
  if (!isValidGroqKeyFormat(key)) {
    if (apiKeyPromptError) {
      apiKeyPromptError.textContent = 'API key noto\'g\'ri yoki juda qisqa';
      apiKeyPromptError.hidden = false;
    }
    return;
  }
  if (apiKeySaveBtn) {
    apiKeySaveBtn.disabled = true;
    apiKeySaveBtn.textContent = 'Tekshirilmoqda...';
  }
  if (apiKeyNotNowBtn) apiKeyNotNowBtn.disabled = true;
  const result = await verifyGroqApiKey(key);
  if (apiKeySaveBtn) {
    apiKeySaveBtn.disabled = false;
    apiKeySaveBtn.textContent = 'Save';
  }
  if (apiKeyNotNowBtn) apiKeyNotNowBtn.disabled = false;
  if (!result.ok) {
    if (apiKeyPromptError) {
      apiKeyPromptError.textContent = result.error || 'Tekshiruv muvaffaqiyatsiz';
      apiKeyPromptError.hidden = false;
    }
    return;
  }
  data.settings.groqApiKey = key;
  data.settings.apiKeyPromptDismissed = true;
  saveData();
  hideApiKeyPrompt();
}

async function saveApiKeyFromSettings() {
  const key = (settingsApiKey && settingsApiKey.value || '').trim();
  if (!key) {
    data.settings.groqApiKey = '';
    saveData();
    if (settingsApiKeyStatus) {
      settingsApiKeyStatus.textContent = 'Kalit o\'chirildi';
      settingsApiKeyStatus.className = 'status warn';
    }
    return;
  }
  if (!isValidGroqKeyFormat(key)) {
    if (settingsApiKeyStatus) {
      settingsApiKeyStatus.textContent = 'API key noto\'g\'ri yoki juda qisqa';
      settingsApiKeyStatus.className = 'status err';
    }
    return;
  }
  if (settingsApiKeySave) {
    settingsApiKeySave.disabled = true;
    settingsApiKeySave.textContent = 'Tekshirilmoqda...';
  }
  if (settingsApiKeyStatus) {
    settingsApiKeyStatus.textContent = 'Tekshirilmoqda...';
    settingsApiKeyStatus.className = 'status warn';
  }
  const result = await verifyGroqApiKey(key);
  if (settingsApiKeySave) {
    settingsApiKeySave.disabled = false;
    settingsApiKeySave.textContent = 'Save';
  }
  if (!result.ok) {
    if (settingsApiKeyStatus) {
      settingsApiKeyStatus.textContent = result.error || 'Tekshiruv muvaffaqiyatsiz';
      settingsApiKeyStatus.className = 'status err';
    }
    return;
  }
  data.settings.groqApiKey = key;
  data.settings.apiKeyPromptDismissed = true;
  saveData();
  if (settingsApiKeyStatus) {
    settingsApiKeyStatus.textContent = 'Saqlandi — kalit tasdiqlandi';
    settingsApiKeyStatus.className = 'status ok';
  }
}

function showApiKeyPrompt() {
  if (!apiKeyPrompt) return;
  if (apiKeyPromptInput) apiKeyPromptInput.value = '';
  if (apiKeyPromptError) {
    apiKeyPromptError.hidden = true;
    apiKeyPromptError.textContent = '';
  }
  apiKeyPrompt.hidden = false;
  setTimeout(() => apiKeyPromptInput && apiKeyPromptInput.focus(), 50);
}

function hideApiKeyPrompt() {
  if (apiKeyPrompt) apiKeyPrompt.hidden = true;
}

function maybeShowApiKeyPrompt() {
  if (!getGroqApiKey() && !data.settings.apiKeyPromptDismissed) {
    showApiKeyPrompt();
  }
}

function switchSettingsTab(tab) {
  const name = tab || 'run';
  document.querySelectorAll('.settings-tab').forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const map = { run: 'settingsTabRun', sound: 'settingsTabSound', api: 'settingsTabApi' };
  document.querySelectorAll('.settings-tab-panel').forEach((p) => {
    p.hidden = p.id !== map[name];
  });
}

function openSettings(tab) {
  if (!settingsPanel) return;
  hideApiKeyPrompt();
  switchSettingsTab(tab || 'run');

  // Run
  const settingsSpeed = document.getElementById('settingsSpeed');
  const settingsDelay = document.getElementById('settingsDelay');
  const settingsStepGap = document.getElementById('settingsStepGap');
  if (settingsSpeed) settingsSpeed.value = data.settings.speed || 45;
  if (settingsDelay) settingsDelay.value = data.settings.delay != null ? data.settings.delay : 3;
  if (settingsStepGap) settingsStepGap.value = data.settings.stepGap != null ? data.settings.stepGap : 0.3;

  // Sound
  const settingsSoundClick = document.getElementById('settingsSoundClick');
  const settingsSoundType = document.getElementById('settingsSoundType');
  if (settingsSoundClick) settingsSoundClick.checked = data.settings.soundClick !== false;
  if (settingsSoundType) settingsSoundType.checked = data.settings.soundType !== false;

  // API
  if (settingsApiKey) {
    settingsApiKey.value = getGroqApiKey();
    settingsApiKey.type = 'password';
  }
  const modelEl = document.getElementById('settingsGroqModel');
  if (modelEl) modelEl.value = getGroqModel();
  if (settingsApiKeyStatus) {
    settingsApiKeyStatus.textContent = getGroqApiKey()
      ? 'Kalit saqlangan'
      : 'Kalit kiritilmagan';
    settingsApiKeyStatus.className = getGroqApiKey() ? 'status ok' : 'status warn';
  }
  settingsPanel.hidden = false;
}

function closeSettings() {
  if (settingsPanel) settingsPanel.hidden = true;
}

if (apiKeyNotNowBtn) {
  apiKeyNotNowBtn.addEventListener('click', () => {
    data.settings.apiKeyPromptDismissed = true;
    saveData();
    hideApiKeyPrompt();
  });
}

if (apiKeySaveBtn) {
  apiKeySaveBtn.addEventListener('click', () => { saveApiKeyFromPrompt(); });
}

if (apiKeyPromptInput) {
  apiKeyPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveApiKeyFromPrompt();
    }
  });
}

if (openSettingsBtn) {
  openSettingsBtn.addEventListener('click', () => openSettings('run'));
}
if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener('click', closeSettings);
}
if (settingsPanel) {
  settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) closeSettings();
  });
}

document.querySelectorAll('.settings-tab').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => {
    switchSettingsTab(tabBtn.dataset.tab);
  });
});

// Run settings save
const settingsRunSave = document.getElementById('settingsRunSave');
if (settingsRunSave) {
  settingsRunSave.addEventListener('click', () => {
    const settingsSpeed = document.getElementById('settingsSpeed');
    const settingsDelay = document.getElementById('settingsDelay');
    const settingsStepGap = document.getElementById('settingsStepGap');
    const sp = Math.max(5, Math.min(500, parseInt(settingsSpeed && settingsSpeed.value, 10) || 45));
    const dl = Math.max(0, Math.min(30, parseInt(settingsDelay && settingsDelay.value, 10) || 0));
    const gap = Math.max(0, Math.min(10, parseFloat(settingsStepGap && settingsStepGap.value) || 0));
    data.settings.speed = sp;
    data.settings.delay = dl;
    data.settings.stepGap = gap;
    if (speedEl) speedEl.value = sp;
    if (countdownEl) countdownEl.value = dl;
    if (stepGapEl) stepGapEl.value = gap;
    saveData();
    settingsRunSave.textContent = 'Saved';
    setTimeout(() => { settingsRunSave.textContent = 'Save'; }, 1200);
  });
}

// Sound settings save
const settingsSoundSave = document.getElementById('settingsSoundSave');
if (settingsSoundSave) {
  settingsSoundSave.addEventListener('click', () => {
    const settingsSoundClick = document.getElementById('settingsSoundClick');
    const settingsSoundType = document.getElementById('settingsSoundType');
    data.settings.soundClick = !!(settingsSoundClick && settingsSoundClick.checked);
    data.settings.soundType = !!(settingsSoundType && settingsSoundType.checked);
    saveData();
    settingsSoundSave.textContent = 'Saved';
    setTimeout(() => { settingsSoundSave.textContent = 'Save'; }, 1200);
  });
}

if (toggleApiKeyVisibility && settingsApiKey) {
  toggleApiKeyVisibility.addEventListener('click', () => {
    settingsApiKey.type = settingsApiKey.type === 'password' ? 'text' : 'password';
  });
}

if (settingsApiKeySave) {
  settingsApiKeySave.addEventListener('click', () => { saveApiKeyFromSettings(); });
}

if (settingsApiKey) {
  settingsApiKey.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveApiKeyFromSettings();
    }
  });
}

if (settingsApiKeyClear) {
  settingsApiKeyClear.addEventListener('click', () => {
    if (settingsApiKey) settingsApiKey.value = '';
    data.settings.groqApiKey = '';
    saveData();
    if (settingsApiKeyStatus) {
      settingsApiKeyStatus.textContent = 'Kalit o\'chirildi';
      settingsApiKeyStatus.className = 'status warn';
    }
  });
}

(async () => {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    if (chrome.runtime.lastError) {
      // Masalan extension yangilangan payt "context invalidated" bo'lishi
      // mumkin — oldin bu holatda sidepanel hech qanday xabarsiz bo'sh
      // qolardi. Endi kamida ko'rinadigan xato beramiz va bo'sh (lekin
      // ishlaydigan) holatda davom etamiz — mavjud saqlangan ma'lumot
      // xavf ostida qolmaydi, chunki hech narsa qayta yozilmaydi.
      console.error('[SavingTime] Yuklashda xato:', chrome.runtime.lastError.message);
      showDropToast(
        "Ogohlantirish: Ma'lumot yuklanmadi (" + chrome.runtime.lastError.message + "). Sahifani yangilab ko'ring.",
        { warn: true, duration: 6000 }
      );
    } else if (res && res[STORAGE_KEY] && Array.isArray(res[STORAGE_KEY].projects)) {
      data = res[STORAGE_KEY];
      data.settings = data.settings || {};
    }
    data.settings.speed = data.settings.speed || 45;
    if (data.settings.delay == null) data.settings.delay = 3;
    if (data.settings.stepGap == null) data.settings.stepGap = 0.3;
    if (!data.settings.ocrMode) data.settings.ocrMode = 'ocrspace';
    if (!data.settings.ocrScale) data.settings.ocrScale = 2;
    if (data.settings.ocrThreshold == null) data.settings.ocrThreshold = 140;
    if (data.settings.groqApiKey == null) data.settings.groqApiKey = '';
    if (!data.settings.groqModel) data.settings.groqModel = 'qwen/qwen3.8-27b';
    if (data.settings.apiKeyPromptDismissed == null) data.settings.apiKeyPromptDismissed = false;
    if (data.settings.soundClick == null) data.settings.soundClick = true;
    if (data.settings.soundType == null) data.settings.soundType = true;
    if (!data.globalFields || typeof data.globalFields !== 'object') data.globalFields = {};

    speedEl.value = data.settings.speed;
    countdownEl.value = data.settings.delay;
    stepGapEl.value = data.settings.stepGap;
    ocrModeEl.value = data.settings.ocrMode;
    ocrScaleEl.value = data.settings.ocrScale;
    ocrThresholdEl.value = data.settings.ocrThreshold;

    const active = data.settings.activeProjectId;
    const topLevelFirst = data.projects.find((p) => !p.parentId) || data.projects[0];
    if (active && data.projects.some((p) => p.id === active)) {
      openProject(active);
      // openProject() currentStepId'ni har doim null qiladi (yangi loyihaga
      // o'tish odatiy holati) — lekin bu FAQAT resume emas, boshqa tabga
      // "ergashish" holati. Shuning uchun agar saqlangan step hali ham shu
      // loyihada mavjud bo'lsa, aynan o'sha stepga qaytamiz.
      const savedStepId = data.settings.activeStepId;
      if (savedStepId) {
        const proj = data.projects.find((p) => p.id === active);
        if (proj && proj.steps.some((s) => s.id === savedStepId)) openStep(savedStepId);
      }
    } else if (topLevelFirst) openProject(topLevelFirst.id);
    else renderHome();

    maybeShowApiKeyPrompt();
  });
})();
// ============================================================
// Escape — iframe ichida bosilsa, parent window'ga xabar yuboramiz
// ============================================================
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    try {
      window.parent.postMessage({ type: 'ST_IFRAME_ESCAPE' }, '*');
    } catch (_) {}
  }
}, true);
