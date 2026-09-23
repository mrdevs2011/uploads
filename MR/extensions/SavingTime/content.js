(function () {
  // Versiya — extension yangilanganda eski content script qayta inject bo'lishi uchun
  // Versiya oshirildi (6 -> 7): xavfsizlik/mantiq tuzatishlari kiritildi
  // (postMessage kanali olib tashlandi, runProject try/catch bilan
  // o'ralgan, pickToken qo'shildi). Eski ochiq tablarda hali eski (6-versiya)
  // content.js ishlab turgan bo'lishi mumkin — ensureContent() PING orqali
  // versiyani tekshiradi va mos kelmasa qayta inject qiladi, shuning uchun
  // bu raqam MUHIM: oshirilmasa, foydalanuvchi extension'ni yangilagandan
  // keyin ham eski (zaif) content.js sahifada ishlab qolaveradi.
  var CONTENT_VER = 7;
  if (window.__brauzerCoworkInjected === CONTENT_VER) return;
  // Eski listenerlarni tozalash uchun avvalgi holatni bekor qilamiz
  window.__brauzerCoworkInjected = CONTENT_VER;

  let selectionMode = null;
  let hoveredEl = null;
  let dragBox = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let isDragging = false;
  let stopRequested = false;
  let running = false;
  let selectionResolver = null;
  const DRAG_THRESHOLD = 4;
  // Sidepanel har bir "pick" so'rovida o'ziga xos token yuboradi (START_SELECTION
  // orqali). Natijani (COORD_SELECTED va h.k.) qaytarganda shu tokenni orqaga
  // qo'shib yuboramiz — shu bilan sidepanel "bu javob aynan MEN so'ragan step
  // uchunmi" deb tekshira oladi va eskirgan/kechikkan natija boshqa stepga
  // tushib ketmaydi (race condition — bir nechta stepni tez almashtirganda).
  let currentPickToken = null;

  // Sichqoncha oxirgi pozitsiyasi — crosshair markazdan emas, shu yerdan boshlansin
  let lastMouseX = Math.round(window.innerWidth / 2);
  let lastMouseY = Math.round(window.innerHeight / 2);
  document.addEventListener('mousemove', function (e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }, true);

  // --- Click sound effect ---
  // Pool qilamiz, bitta Audio obyekt yetmaydi: agar clicklar tez-tez ketma-ket
  // kelsa (masalan forma to'ldirishda), bitta obyekt oldingi tovushni "cut" qilib,
  // qaytadan boshidan boshlaydi — natija stakato/uzilgan tovush bo'ladi.
  // Pool - navbat bilan bir nechta Audio nusxasini ishlatib, overlap bo'lsa ham
  // har biri o'z tovushini to'liq tugatadi.
  const CLICK_SOUND_POOL_SIZE = 5;
  let clickSoundPool = [];
  let clickSoundPoolIdx = 0;

  function initClickSoundPool() {
    if (clickSoundPool.length) return;
    const url = chrome.runtime.getURL('click.mp3');
    for (let i = 0; i < CLICK_SOUND_POOL_SIZE; i++) {
      const a = new Audio(url);
      a.volume = 0.5;
      a.preload = 'auto';
      clickSoundPool.push(a);
    }
  }

  let soundClickEnabled = true;
  let soundTypeEnabled = true;

  function playClickSound() {
    if (!soundClickEnabled) return;
    try {
      initClickSoundPool();
      const a = clickSoundPool[clickSoundPoolIdx];
      clickSoundPoolIdx = (clickSoundPoolIdx + 1) % clickSoundPool.length;
      a.currentTime = 0;
      const p = a.play();
      // Ba'zi saytlarda autoplay siyosati promise reject qilishi mumkin —
      // sessiz tarzda yutamiz, chunki bu faqat feedback tovushi, kritik funksiya emas.
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_e) {
      // Tovush ishlamasa ham, real click bajarilishi to'xtamasligi kerak.
    }
  }

  // --- Typing sound effect (yozish boshida 1 marta start, yozish tugaguncha loop) ---
  // Fayl uzunligi ~6 soniya. Agar yozish undan uzoq davom etsa, `loop = true`
  // tufayli fayl oxiriga yetganda o'zi boshidan qayta boshlanadi (browser-native loop).
  let typeSoundAudio = null;

  function initTypeSound() {
    if (typeSoundAudio) return;
    const url = chrome.runtime.getURL('type.mp3');
    typeSoundAudio = new Audio(url);
    typeSoundAudio.volume = 0.5;
    typeSoundAudio.preload = 'auto';
    typeSoundAudio.loop = true; // yozish 6 soniyadan uzun bo'lsa, boshidan qayta ketadi
  }

  function startTypeSound() {
    if (!soundTypeEnabled) return;
    try {
      initTypeSound();
      typeSoundAudio.currentTime = 0;
      const p = typeSoundAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_e) {
      // Tovush ishlamasa ham, matn kiritish to'xtamasligi kerak.
    }
  }

  function stopTypeSound() {
    try {
      if (!typeSoundAudio) return;
      typeSoundAudio.pause();
      typeSoundAudio.currentTime = 0;
    } catch (_e) {}
  }

  // FAQAT chrome.runtime.sendMessage — bu sidepanel iframe'ga yetadigan
  // yagona soxtalashtirib bo'lmaydigan kanal (qarang: sidepanel.js dagi
  // xavfsizlik izohi). window.postMessage ORQALI YUBORISH ATAYIN OLIB
  // TASHLANDI — chunki u sahifaning o'z origin'idan chiqadi va har qanday
  // 3-tomon skript xuddi shunday xabar yasab, real step-hijacking qila
  // olardi.
  function notifyPanel(payload) {
    try {
      chrome.runtime.sendMessage(payload, () => { void chrome.runtime.lastError; });
    } catch (_) {}
  }

  function logToPanel(text, kind) {
    notifyPanel({ type: 'COWORK_LOG', text, kind });
  }
  function doneToPanel(ok, error) {
    running = false;
    hideHud();
    try { removeAgentCursor(); } catch (_) {}
    notifyPanel({ type: 'COWORK_DONE', ok, error });
  }

  function isTypeable(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!el.isContentEditable;
  }
  function isSelect(el) { return el && el.tagName === 'SELECT'; }
  function isClickable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'LABEL' || tag === 'SUMMARY') return true;
    // Captcha / interactive visual widgets — canvas, img, svg, video
    // (ko'p captcha widgetlar aynan shu teglarda chiziladi, cursor:pointer ham bo'lmasligi mumkin)
    if (tag === 'CANVAS' || tag === 'IMG' || tag === 'SVG' || tag === 'VIDEO') return true;
    if (tag === 'INPUT') {
      const t = (el.type || '').toLowerCase();
      return t === 'button' || t === 'submit' || t === 'reset' || t === 'image' || t === 'checkbox' || t === 'radio';
    }
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'button' || role === 'link' || role === 'tab' || role === 'checkbox' || role === 'menuitem' || role === 'img') return true;
    if (el.getAttribute('onclick') != null) return true;
    // data-* yoki class/id da captcha/verify/challenge so'zlari bo'lsa — interaktiv deb hisoblaymiz
    try {
      const id = (el.id || '').toLowerCase();
      const cls = (typeof el.className === 'string' ? el.className : (el.className?.baseVal || '')).toLowerCase();
      if (/captcha|verify|challenge|recaptcha|hcaptcha|turnstile|geetest/.test(id + ' ' + cls)) return true;
    } catch (_) { /* ignore */ }
    try {
      const st = window.getComputedStyle(el);
      if (st.cursor === 'pointer') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  function closestClickable(el) {
    let cur = el;
    // Chuqurroq qidiramiz — captcha widgetlar ko'pincha 8+ qavat ichida bo'ladi
    for (let i = 0; i < 14 && cur; i++) {
      if (isClickable(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  // Random/hashed id'larni (masalan "r4x9k2", har renderda o'zgaradigan) chiqarib tashlaydi —
  // faqat barqaror, inson yozgan id'larni CSS path'da ishlatamiz.
  function looksStableId(id) {
    if (!id) return false;
    if (id.length > 30) return false;
    if (/^[a-z0-9_-]{1,4}$/i.test(id) === false && /[0-9a-f]{6,}/i.test(id)) return false; // hex-hash shubhali
    if (/^(react|radix|headlessui|mui|ember|vue)[-_:]/i.test(id)) return false; // framework auto-gen
    if (/^:[rR]\d/.test(id)) return false; // React useId format ":r0:"
    return true;
  }

  // DOM tree bo'yicha barqaror yo'l quradi (tag + nth-of-type zanjiri, root'gacha).
  // Bu screen o'lchami/scroll'dan mustaqil va sahifa refresh bo'lganda ham DOM strukturasi
  // o'zgarmasa ishlaydi (chunki index'lar HTML manbaga, not layout'ga bog'liq).
  function getCssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement && depth < 12) {
      let selector = cur.tagName.toLowerCase();
      if (cur.id && looksStableId(cur.id)) {
        selector += '#' + CSS.escape(cur.id);
        parts.unshift(selector);
        break; // stable id topilsa, undan yuqoriga chiqish shart emas — anchor sifatida yetadi
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((s) => s.tagName === cur.tagName);
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(cur) + 1) + ')';
        }
      }
      parts.unshift(selector);
      cur = parent;
      depth++;
    }
    return parts.length ? parts.join(' > ') : null;
  }

  function elementInfo(el) {
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || '')
      .trim().replace(/\s+/g, ' ').slice(0, 60);
    const className = (typeof el.className === 'string' && el.className.trim()) ? el.className.trim() : null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.name || null,
      className,
      placeholder: el.placeholder || null,
      text: text || null,
      cssPath: getCssPath(el),
      field: detectFieldType(el),
    };
  }
  function visible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findElementFromInfo(info, clickable) {
    if (!info || !info.tag) return null;
    // Tezkor yo'l: cssPath orqali to'g'ridan-to'g'ri qidirish. Bu selector ro'yxatiga
    // (button/a/role=button...) bog'liq emas — icon-only <svg>/<div cursor:pointer>
    // kabi "yashirin clickable" elementlar ham shu orqali topiladi.
    if (info.cssPath) {
      try {
        const direct = document.querySelector(info.cssPath);
        if (direct && visible(direct) && direct.tagName.toLowerCase() === info.tag) return direct;
      } catch (e) { /* noto'g'ri selector - pastdagi fallback'ga o'tamiz */ }
    }
    const selector = clickable
      ? 'button, a, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], [role="link"]'
      : 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
    const candidates = document.querySelectorAll(selector);
    let best = null;
    let bestScore = 0;
    candidates.forEach((el) => {
      if (el.tagName.toLowerCase() !== info.tag) return;
      if (el.type === 'hidden') return;
      if (!visible(el)) return;
      let score = 0;
      if (info.id && el.id === info.id) score += 100;
      if (info.name && el.name === info.name) score += 50;
      if (info.placeholder && el.placeholder === info.placeholder) score += 20;
      if (info.text) {
        const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
        if (text === info.text) score += 40;
        else if (text.toLowerCase().includes(String(info.text).toLowerCase())) score += 15;
      }
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });
    return bestScore >= 20 ? best : null;
  }

  // ------------------------------------------------------------
  // Koordinata + identifikator (id/name/class) birgalikda tekshirish
  // ------------------------------------------------------------
  function classOverlapScore(elClassName, infoClassName) {
    if (!infoClassName) return 0;
    const elSet = new Set(String(elClassName || '').split(/\s+/).filter(Boolean));
    const infoSet = new Set(String(infoClassName).split(/\s+/).filter(Boolean));
    if (!infoSet.size) return 0;
    let inter = 0;
    infoSet.forEach((c) => { if (elSet.has(c)) inter++; });
    return inter / infoSet.size; // 0..1
  }

  // Element haqiqatan saqlangan info'ga (id/name/class/text) mos kelishini ballash
  function scoreIdentity(el, info) {
    if (!el || !info || !info.tag) return 0;
    if (el.tagName.toLowerCase() !== info.tag) return 0;
    let score = 0;
    if (info.id && el.id === info.id) score += 100;
    // cssPath eng ishonchli signal — DOM tuzilishi refresh/resize'dan keyin ham
    // o'zgarmasa (odatiy holat), aniq shu elementga ishora qiladi.
    if (info.cssPath && getCssPath(el) === info.cssPath) score += 90;
    if (info.name && el.name === info.name) score += 50;
    if (info.className) score += classOverlapScore(el.className, info.className) * 40;
    if (info.placeholder && el.placeholder === info.placeholder) score += 20;
    if (info.text) {
      const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
      if (text === info.text) score += 40;
      else if (text && info.text && text.toLowerCase().includes(String(info.text).toLowerCase())) score += 15;
    }
    return score;
  }

  // Butun sahifadan (faqat input/tugma emas) tag + identifikator bo'yicha element qidiradi.
  // Element joyi o'zgargan bo'lsa ham (masalan sahifa qayta render bo'lsa) shu orqali topiladi.
  function findAnyElementByIdentity(info) {
    if (!info || !info.tag) return null;
    // Tezkor yo'l: agar cssPath aniq shu ko'rinishda mavjud bo'lsa (refresh'dan keyin ham
    // DOM strukturasi bir xil bo'lgan holatlarda), to'g'ridan-to'g'ri topamiz.
    if (info.cssPath) {
      try {
        const direct = document.querySelector(info.cssPath);
        if (direct && visible(direct) && direct.tagName.toLowerCase() === info.tag) return direct;
      } catch (e) { /* noto'g'ri selector bo'lsa - pastdagi scoring fallback'ga o'tamiz */ }
    }
    const candidates = document.getElementsByTagName(info.tag);
    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      if (!visible(el)) continue;
      const s = scoreIdentity(el, info);
      if (s > bestScore) { bestScore = s; best = el; }
    }
    return bestScore >= 20 ? best : null;
  }

  function createDragBox() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;border:2px dashed #22c55e;background:rgba(34,197,94,.15);z-index:2147483647;pointer-events:none;left:0;top:0;width:0;height:0;';
    document.documentElement.appendChild(box);
    return box;
  }
  function updateDragBox(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    dragBox.style.left = left + 'px';
    dragBox.style.top = top + 'px';
    dragBox.style.width = width + 'px';
    dragBox.style.height = height + 'px';
    return { left, top, width, height };
  }
  function rectsIntersect(r, elRect) {
    return !(elRect.right < r.left || elRect.left > r.left + r.width || elRect.bottom < r.top || elRect.top > r.top + r.height);
  }
  function findInRect(rect, clickable) {
    const selector = clickable
      ? 'button, a, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]'
      : 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
    let best = null;
    let bestArea = 0;
    document.querySelectorAll(selector).forEach((el) => {
      if (!visible(el) || el.type === 'hidden') return;
      const elRect = el.getBoundingClientRect();
      if (!rectsIntersect(rect, elRect)) return;
      const overlapLeft = Math.max(rect.left, elRect.left);
      const overlapTop = Math.max(rect.top, elRect.top);
      const overlapRight = Math.min(rect.left + rect.width, elRect.right);
      const overlapBottom = Math.min(rect.top + rect.height, elRect.bottom);
      const area = Math.max(0, overlapRight - overlapLeft) * Math.max(0, overlapBottom - overlapTop);
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    });
    return best;
  }

  function flash(el, color) {
    if (!el) return;
    const prev = el.style.outline;
    el.style.outline = '3px solid ' + color;
    setTimeout(() => { el.style.outline = prev || ''; }, 700);
  }

  function finishSelection(el) {
    if (!el) return;
    const clickable = selectionMode === 'click';
    const info = elementInfo(el);
    const r = el.getBoundingClientRect();
    info.pageX = Math.round(r.left + r.width / 2 + window.scrollX);
    info.pageY = Math.round(r.top + r.height / 2 + window.scrollY);
    if (hoveredEl) hoveredEl.style.outline = '';
    stopSelectionMode();
    flash(el, '#2563eb');
    notifyPanel({ type: clickable ? 'CLICK_SELECTED' : 'ELEMENT_SELECTED', info, pickToken: currentPickToken });
    if (selectionResolver) {
      const resolve = selectionResolver;
      selectionResolver = null;
      resolve({ el, info });
    }
  }

  function detectFieldType(el) {
    if (!el) return { kind: 'unknown' };
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      return {
        kind: 'select',
        options: Array.from(el.options).slice(0, 50).map((o) => {
          const t = (o.textContent || '').trim();
          const v = (o.value || '').trim();
          return t || v;
        }).filter(Boolean),
      };
    }
    if (tag === 'textarea') return { kind: 'textarea' };
    if (tag === 'input') {
      const type = (el.type || 'text').toLowerCase();
      // HTML5 date/time oilasi — har birini alohida kind qilib saqlaymiz
      if (['date', 'datetime-local', 'month', 'week', 'time'].includes(type)) {
        return { kind: type, inputType: type };
      }
      // Maxsus input turlari
      if (['email', 'tel', 'number', 'url', 'color', 'range', 'password', 'search', 'file'].includes(type)) {
        return { kind: type, inputType: type };
      }
      if (['checkbox', 'radio'].includes(type)) return { kind: type, inputType: type };
      if (['button', 'submit', 'reset', 'image'].includes(type)) return { kind: 'button' };
      if (type === 'hidden') return { kind: 'unknown' };
      // text, yoki noma'lum type
      return { kind: 'text', inputType: type || 'text' };
    }
    if (el.isContentEditable) return { kind: 'text' };
    if (tag === 'button' || el.getAttribute('role') === 'button') return { kind: 'button' };
    return { kind: 'unknown' };
  }

  // ============================================================
  // CAPTCHA ANIQLASH
  // ============================================================
  const CAPTCHA_ATTRS = ['class', 'id', 'alt', 'src', 'name', 'placeholder', 'aria-label', 'title', 'data-testid', 'data-role'];

  function elementHasCaptchaHint(el) {
    if (!el || !el.getAttribute) return null;
    const attrs = {};
    CAPTCHA_ATTRS.forEach((a) => { attrs[a] = (el.getAttribute(a) || '').toLowerCase(); });

    // 1) "captcha" so'zi
    for (const a of CAPTCHA_ATTRS) {
      if (attrs[a] && attrs[a].includes('captcha')) {
        return { level: 'captcha', attr: a, value: attrs[a] };
      }
    }
    // 2) "cp" so'zi (so'z chegarasi)
    for (const a of CAPTCHA_ATTRS) {
      const v = attrs[a];
      if (v && /(^|[^a-z0-9])cp([^a-z0-9]|$)/.test(v)) {
        return { level: 'cp', attr: a, value: v };
      }
    }
    // 3) "c" so'zi (faqat class/id/name/alt/src)
    const cAttrs = ['class', 'id', 'name', 'alt', 'src'];
    for (const a of cAttrs) {
      const v = attrs[a];
      if (v && /(^|[^a-z0-9])c([^a-z0-9]|$)/.test(v)) {
        return { level: 'c', attr: a, value: v };
      }
    }
    return null;
  }

  function findCaptchaMarker(el) {
    let cur = el;
    for (let i = 0; i < 8 && cur && cur !== document.documentElement; i++) {
      const hit = elementHasCaptchaHint(cur);
      if (hit) return { el: cur, hit };
      cur = cur.parentElement;
    }
    return null;
  }

  function isCaptchaPoint(clientX, clientY) {
    const els = document.elementsFromPoint(clientX, clientY) || [];
    for (const el of els) {
      const marker = findCaptchaMarker(el);
      if (marker) return marker;
    }
    // Atrofdagi 120px radiusda captcha bo'lsa ham ushlaymiz
    const r = 120;
    const rect = { left: clientX - r, top: clientY - r, right: clientX + r, bottom: clientY + r };
    const candidates = document.querySelectorAll('img, canvas, input');
    for (const el of candidates) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      const inter = !(b.right < rect.left || b.left > rect.right || b.bottom < rect.top || b.top > rect.bottom);
      if (!inter) continue;
      const marker = findCaptchaMarker(el);
      if (marker) return marker;
    }
    return null;
  }

  function showClickMarker(pageX, pageY) {
    try {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;left:' + (pageX - 14) + 'px;top:' + (pageY - 14) + 'px;' +
        'width:28px;height:28px;border-radius:50%;border:2px solid #e11d48;' +
        'background:rgba(225,29,72,0.25);pointer-events:none;z-index:2147483647;' +
        'box-sizing:border-box;transition:opacity 400ms ease, transform 400ms ease;' +
        'transform:scale(0.6);opacity:1;';
      document.documentElement.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform = 'scale(1.4)';
        el.style.opacity = '0';
      });
      setTimeout(() => { try { el.remove(); } catch (_) {} }, 450);
    } catch (_) { /* visual only */ }
  }

  function finishPoint(info) {
    stopSelectionMode();
    try { showClickMarker(info.pageX, info.pageY); } catch (_) {}
    try {
      const marker = isCaptchaPoint(info.clientX, info.clientY);
      info.captchaMarker = marker ? {
        tag: marker.el.tagName.toLowerCase(),
        level: marker.hit.level,
        attr: marker.hit.attr,
        value: marker.hit.value,
      } : null;
    } catch (_) {
      info.captchaMarker = null;
    }
    // Eng muhimi — koordinata sidepanelga yetib borsin (chrome.runtime kanali)
    notifyPanel({ type: 'COORD_SELECTED', info, pickToken: currentPickToken });
    if (selectionResolver) {
      const resolve = selectionResolver;
      selectionResolver = null;
      try { resolve({ el: null, info }); } catch (_) {}
    }
  }

  let pointOverlay = null;
  function startPointMode() {
    // Eski overlay qolgan bo'lsa — olib tashlaymiz
    if (pointOverlay) {
      try { pointOverlay.remove(); } catch (_) {}
      pointOverlay = null;
    }
    selectionMode = 'point';
    try {
      document.documentElement.style.cursor = 'none';
      document.body.style.cursor = 'none';
    } catch (_) {}

    pointOverlay = document.createElement('div');
    pointOverlay.id = 'st-point-overlay';
    // Sidebar (2147483646) dan yuqori, yorqin chiziqlar — qorong'i/yorug' fonda ko'rinadi
    pointOverlay.setAttribute('style',
      'position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;' +
      'width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;' +
      'z-index:2147483647!important;cursor:none!important;background:transparent!important;' +
      'pointer-events:auto!important;display:block!important;opacity:1!important;'
    );

    // Primary color (sidepanel.css --accent: #5b8def)
    const LINE =
      'position:fixed!important;pointer-events:none!important;z-index:1!important;' +
      'background:#5b8def!important;box-shadow:0 0 0 1px rgba(0,0,0,0.7),0 0 6px rgba(91,141,239,0.9)!important;';

    // Avval yashirin — birinchi mousemove da sichqoncha turgan joyda paydo bo'ladi
    // (markazda chiqib keyin sakrashning oldini olish)
    const vLine = document.createElement('div');
    vLine.setAttribute('style', LINE + 'top:0!important;bottom:0!important;width:2px!important;left:0!important;opacity:0!important;');
    const hLine = document.createElement('div');
    hLine.setAttribute('style', LINE + 'left:0!important;right:0!important;height:2px!important;top:0!important;opacity:0!important;');

    pointOverlay.appendChild(vLine);
    pointOverlay.appendChild(hLine);

    let linesVisible = false;
    function moveLines(e) {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      vLine.style.left = e.clientX + 'px';
      hLine.style.top = e.clientY + 'px';
      if (!linesVisible) {
        vLine.style.opacity = '1';
        hLine.style.opacity = '1';
        linesVisible = true;
      }
    }

    function onOverlayClick(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const x = e.clientX;
      const y = e.clientY;
      // Overlay ostidagi elementni o'qish
      pointOverlay.style.pointerEvents = 'none';
      const under = document.elementFromPoint(x, y);
      pointOverlay.style.pointerEvents = 'auto';
      const identity = under ? elementInfo(under) : null;
      finishPoint({
        tag: 'coord',
        pageX: e.pageX,
        pageY: e.pageY,
        clientX: x,
        clientY: y,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        vw: window.innerWidth,
        vh: window.innerHeight,
        field: detectFieldType(under),
        elIdentity: identity,
      });
    }

    pointOverlay.addEventListener('mousemove', moveLines, true);
    pointOverlay.addEventListener('click', onOverlayClick, true);
    pointOverlay.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, true);

    // documentElement ga qo'shamiz — eng yuqori qavat
    (document.documentElement || document.body).appendChild(pointOverlay);
  }

  function onDragMouseDown(e) {
    if (!selectionMode) return;
    e.preventDefault();
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragBox = createDragBox();
    document.addEventListener('mousemove', onDragMouseMove, true);
    document.addEventListener('mouseup', onDragMouseUp, true);
  }
  function onDragMouseMove(e) {
    if (!dragBox) return;
    if (!isDragging && (Math.abs(e.clientX - dragStartX) > DRAG_THRESHOLD || Math.abs(e.clientY - dragStartY) > DRAG_THRESHOLD)) {
      isDragging = true;
    }
    if (isDragging) updateDragBox(dragStartX, dragStartY, e.clientX, e.clientY);
  }
  function onDragMouseUp(e) {
    document.removeEventListener('mousemove', onDragMouseMove, true);
    document.removeEventListener('mouseup', onDragMouseUp, true);
    const wasDragging = isDragging;
    const rect = dragBox ? updateDragBox(dragStartX, dragStartY, e.clientX, e.clientY) : null;
    if (dragBox) { dragBox.remove(); dragBox = null; }
    isDragging = false;
    if (!wasDragging || !rect || (rect.width < DRAG_THRESHOLD && rect.height < DRAG_THRESHOLD)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const found = findInRect(rect, selectionMode === 'click');
    if (found) finishSelection(found);
  }
  function onMouseOver(e) {
    if (!selectionMode) return;
    let target = selectionMode === 'click' ? closestClickable(e.target) : (isTypeable(e.target) ? e.target : null);
    // Fallback — canvas/img/captcha kabi elementlar uchun ham highlight beramiz
    if (!target && selectionMode === 'click' && e.target && e.target.nodeType === 1) {
      target = e.target;
    }
    if (!target) return;
    hoveredEl = target;
    hoveredEl.style.outline = '2px solid #3b82f6';
    hoveredEl.style.outlineOffset = '1px';
  }
  function onMouseOut() {
    if (!selectionMode || !hoveredEl) return;
    hoveredEl.style.outline = '';
    hoveredEl = null;
  }
  function onClick(e) {
    if (!selectionMode) return;
    let target = selectionMode === 'click' ? closestClickable(e.target) : (isTypeable(e.target) ? e.target : null);
    // Fallback: agar "clickable" topilmasa ham, bosilgan elementni o'zini olamiz
    // (canvas/img/captcha kabi maxsus widgetlar uchun isClickable qamrab olmagan holatlar)
    if (!target && selectionMode === 'click' && e.target && e.target.nodeType === 1) {
      target = e.target;
    }
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    // Bosilganda to'qroq ko'k rang bilan chaqnab (flash) tanlangani bildiriladi
    finishSelection(target);
  }

  let prevUserSelect = '';
  function startSelectionMode(mode) {
    if (mode === 'point') {
      startPointMode();
      return;
    }
    selectionMode = mode === 'click' ? 'click' : 'input';
    document.body.style.cursor = 'crosshair';
    prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousedown', onDragMouseDown, true);
  }
  function stopSelectionMode() {
    selectionMode = null;
    try {
      document.body.style.cursor = '';
      document.documentElement.style.cursor = '';
      document.body.style.userSelect = prevUserSelect;
    } catch (_) {}
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mousedown', onDragMouseDown, true);
    document.removeEventListener('mousemove', onDragMouseMove, true);
    document.removeEventListener('mouseup', onDragMouseUp, true);
    if (dragBox) { try { dragBox.remove(); } catch (_) {} dragBox = null; }
    if (hoveredEl) { try { hoveredEl.style.outline = ''; } catch (_) {} hoveredEl = null; }
    if (pointOverlay) { try { pointOverlay.remove(); } catch (_) {} pointOverlay = null; }
    // Qoldiq overlay bo'lsa ham tozalaymiz
    try {
      const leftover = document.getElementById('st-point-overlay');
      if (leftover) leftover.remove();
    } catch (_) {}
  }

  function waitForSelection(mode, label) {
    return new Promise((resolve) => {
      selectionResolver = resolve;
      startSelectionMode(mode);
      showHud(label || 'Capture');
      logToPanel(label || '...', 'warn');
    });
  }

  function setNativeValue(element, value) {
    const proto = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(element, value);
    else element.value = value;
  }
  function placeCaretAtEnd(el) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function pressEnterKey(el) {
    if (!el) return;
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
  }
  function typeIntoSelect(el, text) {
    el.focus();
    const target = String(text || '').trim().toLowerCase();
    for (let i = 0; i < el.options.length; i++) {
      const opt = el.options[i];
      const bag = ((opt.value || '') + ' ' + (opt.textContent || '')).trim().toLowerCase();
      if (bag === target || bag.includes(target)) {
        el.selectedIndex = i;
        break;
      }
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    flash(el, '#16a34a');
  }

  // "ha" / "yes" / "1" / "true" / "on" → true; "yo'q" / "no" / "0" / "false" / "off" → false
  function parseBoolValue(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    if (['ha', 'yes', '1', 'true', 'on', 'checked', 'belgilash', '+'].includes(t)) return true;
    if (["yo'q", 'yoq', 'no', '0', 'false', 'off', 'unchecked', '-'].includes(t)) return false;
    return null;
  }

  // Qiymatni to'g'ridan-to'g'ri o'rnatish (date/color/range/number va h.k. uchun)
  function setValueDirect(el, text) {
    el.focus();
    setNativeValue(el, String(text == null ? '' : text));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    flash(el, '#16a34a');
  }

  function typeIntoElement(el, text, speed) {
    return new Promise((resolve) => {
      if (!el || !document.body.contains(el)) { resolve(false); return; }
      if (isSelect(el)) { typeIntoSelect(el, text); resolve(true); return; }

      const tag = el.tagName.toLowerCase();
      const inputType = (tag === 'input' ? (el.type || 'text') : '').toLowerCase();

      // Checkbox / radio — belgilash yoki olib tashlash
      if (inputType === 'checkbox' || inputType === 'radio') {
        const want = parseBoolValue(text);
        if (want === null) {
          // Qiymat berilmasa — oddiy click (toggle)
          el.click();
          flash(el, '#16a34a');
          resolve(true);
          return;
        }
        if (el.checked !== want) el.click();
        else {
          // Holat allaqachon to'g'ri — baribir change event yuboramiz
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        flash(el, '#16a34a');
        resolve(true);
        return;
      }

      // File — brauzer xavfsizligi tufayli dasturiy o'rnatib bo'lmaydi
      if (inputType === 'file') {
        logToPanel('File input: brauzer xavfsizligi tufayli avtomatik to\'ldirib bo\'lmaydi', 'warn');
        flash(el, '#f5b942');
        resolve(false);
        return;
      }

      // Date/time/color/range/number — to'g'ridan-to'g'ri value
      const directTypes = ['date', 'datetime-local', 'month', 'week', 'time', 'color', 'range', 'number'];
      if (directTypes.includes(inputType)) {
        setValueDirect(el, text);
        resolve(true);
        return;
      }

      // Matnli maydonlar (text, password, email, tel, url, search, textarea, contenteditable)
      el.focus();
      const isEditable = el.isContentEditable;
      if (isEditable) el.textContent = '';
      else {
        setNativeValue(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const str = String(text == null ? '' : text);
      // Bo'sh qiymat — faqat tozalash
      if (!str) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
        flash(el, '#16a34a');
        resolve(true);
        return;
      }
      let index = 0;
      startTypeSound(); // yozish boshlandi — tovushni 1 marta ishga tushiramiz, kerak bo'lsa o'zi loop bo'ladi
      const interval = setInterval(() => {
        if (stopRequested) { clearInterval(interval); stopTypeSound(); resolve(false); return; }
        if (index >= str.length) {
          clearInterval(interval);
          stopTypeSound(); // yozish tugadi — tovushni to'xtatamiz
          el.dispatchEvent(new Event('change', { bubbles: true }));
          flash(el, '#16a34a');
          resolve(true);
          return;
        }
        const nextChar = str[index];
        if (isEditable) {
          el.textContent += nextChar;
          placeCaretAtEnd(el);
        } else setNativeValue(el, el.value + nextChar);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        index++;
      }, speed);
    });
  }

  // Element to'ldiriladigan maydonmi?
  function isFillableField(el) {
    if (!el) return false;
    if (isSelect(el) || el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      return !['button', 'submit', 'reset', 'image', 'hidden'].includes(t);
    }
    return false;
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function dispatchClick(el, clientX, clientY) {
    if (!el) return;
    const x = clientX != null ? clientX : (el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2);
    const y = clientY != null ? clientY : (el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2);
    const down = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
    const up = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons: 0 };
    try { el.dispatchEvent(new PointerEvent('pointerdown', down)); } catch (_) {}
    el.dispatchEvent(new MouseEvent('mousedown', down));
    try { el.dispatchEvent(new PointerEvent('pointerup', up)); } catch (_) {}
    el.dispatchEvent(new MouseEvent('mouseup', up));
    el.dispatchEvent(new MouseEvent('click', up));
    if (typeof el.click === 'function') el.click();
    playClickSound();
  }

  // ========== Agent cursor (soxta, lekin real ko'rinish) ==========
  // mouse.svg fayli root'dan (web_accessible_resources) yuklanadi.
  // Fetch tugagunicha ishlatiladigan zaxira (fallback) belgi — xuddi shu shakl.
  let AGENT_CURSOR_SVG =
    '<svg viewBox="0 0 100 100" width="28" height="28" xmlns="http://www.w3.org/2000/svg">' +
    '<path style="stroke:#111;stroke-width:4;fill:#ddd;" d="M 5,5 90,30 65,50 95,80 80,95 50,65 30,90 z"/>' +
    '</svg>';
  try {
    fetch(chrome.runtime.getURL('mouse.svg'))
      .then(function (r) { return r.text(); })
      .then(function (svgText) { if (svgText) AGENT_CURSOR_SVG = svgText; })
      .catch(function () {});
  } catch (_) {}

  let agentCursor = null;
  let agentPos = { x: 40, y: 40 }; // client coords
  let agentHoverEl = null;

  function ensureAgentCursor() {
    if (agentCursor && document.documentElement.contains(agentCursor)) return agentCursor;
    agentCursor = document.createElement('div');
    agentCursor.id = '__savingtime_agent_cursor';
    agentCursor.style.cssText =
      'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;' +
      'pointer-events:none;transform:translate(40px,40px);' +
      'transition:none;will-change:transform;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));';
    agentCursor.innerHTML = AGENT_CURSOR_SVG;
    document.documentElement.appendChild(agentCursor);
    agentPos = { x: 40, y: 40 };
    return agentCursor;
  }

  function removeAgentCursor() {
    if (agentHoverEl) {
      try {
        agentHoverEl.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window }));
        agentHoverEl.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true, view: window }));
      } catch (_) {}
      agentHoverEl = null;
    }
    if (agentCursor) {
      agentCursor.remove();
      agentCursor = null;
    }
  }

  function setAgentClientPos(x, y, scale) {
    const cur = ensureAgentCursor();
    agentPos = { x, y };
    const s = scale != null ? scale : 1;
    cur.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function dispatchHoverAt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    if (el === agentHoverEl) {
      el.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, view: window,
        clientX, clientY,
      }));
      return el;
    }
    if (agentHoverEl) {
      try {
        agentHoverEl.dispatchEvent(new MouseEvent('mouseout', {
          bubbles: true, cancelable: true, view: window,
          clientX, clientY, relatedTarget: el,
        }));
        agentHoverEl.dispatchEvent(new MouseEvent('mouseleave', {
          bubbles: true, cancelable: true, view: window,
          clientX, clientY, relatedTarget: el,
        }));
      } catch (_) {}
    }
    try {
      el.dispatchEvent(new MouseEvent('mouseover', {
        bubbles: true, cancelable: true, view: window,
        clientX, clientY, relatedTarget: agentHoverEl,
      }));
      el.dispatchEvent(new MouseEvent('mouseenter', {
        bubbles: true, cancelable: true, view: window,
        clientX, clientY, relatedTarget: agentHoverEl,
      }));
      el.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, view: window,
        clientX, clientY,
      }));
    } catch (_) {}
    agentHoverEl = el;
    return el;
  }

  async function agentMoveTo(pageX, pageY, durationMs) {
    if (stopRequested) return;
    ensureAgentCursor();
    // Maqsad viewport ichida bo'lsin
    try {
      window.scrollTo({
        left: Math.max(0, pageX - window.innerWidth / 2),
        top: Math.max(0, pageY - window.innerHeight / 2),
        behavior: 'smooth',
      });
    } catch (_) {
      window.scrollTo(pageX - window.innerWidth / 2, Math.max(0, pageY - window.innerHeight / 2));
    }
    await sleep(Math.min(280, durationMs || 400));

    const targetX = pageX - window.scrollX;
    const targetY = pageY - window.scrollY;
    const startX = agentPos.x;
    const startY = agentPos.y;
    const dist = Math.hypot(targetX - startX, targetY - startY);
    const dur = durationMs != null ? durationMs : Math.min(900, Math.max(280, dist * 0.55));
    const t0 = performance.now();

    await new Promise((resolve) => {
      function frame(now) {
        if (stopRequested) { resolve(); return; }
        const t = Math.min(1, (now - t0) / dur);
        const e = easeInOutCubic(t);
        const x = startX + (targetX - startX) * e;
        const y = startY + (targetY - startY) * e;
        setAgentClientPos(x, y, 1);
        // Cursor ostidagi elementga hover (pointer-events:none — elementFromPoint ishlaydi)
        dispatchHoverAt(x, y);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  async function agentClickAt(pageX, pageY) {
    await agentMoveTo(pageX, pageY);
    if (stopRequested) return null;

    const clientX = pageX - window.scrollX;
    const clientY = pageY - window.scrollY;
    // Click animatsiya (bosish)
    setAgentClientPos(clientX, clientY, 0.88);
    await sleep(70);

    const el = document.elementFromPoint(clientX, clientY) || document.body;
    dispatchHoverAt(clientX, clientY);
    flash(el, '#22c55e');
    playClickSound();
    dispatchClick(el, clientX, clientY);

    setAgentClientPos(clientX, clientY, 1);
    await sleep(120);
    return el;
  }

  function clickAtPage(pageX, pageY) {
    // Sync fallback (eski chaqiriqlar) — agent bilan
    const clientX = pageX - window.scrollX;
    const clientY = pageY - window.scrollY;
    const el = document.elementFromPoint(clientX, clientY) || document.body;
    setAgentClientPos(clientX, clientY, 1);
    flash(el, '#22c55e');
    playClickSound();
    dispatchClick(el, clientX, clientY);
    return el;
  }

  // Sahifada status yozuvlari ko'rsatilmaydi
  function showHud(_text) { /* no-op */ }
  function hideHud() { /* no-op */ }

  async function ensureElement(step, projectId) {
    let el = findElementFromInfo(step.elementInfo, false);
    if (el) return el;
    logToPanel((step.label || 'Operator') + ': ?', 'warn');
    const picked = await waitForSelection('input', step.label);
    if (!picked || !picked.el) return null;
    notifyPanel({
      type: 'STEP_ELEMENT_SAVED',
      projectId,
      stepId: step.id,
      info: picked.info,
    });
    return picked.el;
  }

  // ============================================================
  // CAPTCHA + OCR
  // ============================================================

  function findCaptchaImage() {
    const selectors = [
      'img[src*="captcha" i]',
      'img[id*="captcha" i]',
      'img[class*="captcha" i]',
      'img[alt*="captcha" i]',
      'img[src*="verify" i]',
      'img[src*="security" i]',
      'canvas[id*="captcha" i]',
      'canvas[class*="captcha" i]',
      '[class*="captcha" i] img',
      '[id*="captcha" i] img',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && visible(el)) return el;
    }
    let best = null;
    document.querySelectorAll('img, canvas').forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width >= 60 && r.width <= 400 && r.height >= 20 && r.height <= 120) {
        const src = ((el.src || '') + ' ' + (el.alt || '') + ' ' + (el.className || '')).toLowerCase();
        if (/captcha|verify|code|security|kod/.test(src)) best = el;
      }
    });
    return best;
  }

  function findCaptchaInput() {
    const selectors = [
      'input[name*="captcha" i]',
      'input[id*="captcha" i]',
      'input[placeholder*="captcha" i]',
      'input[placeholder*="kod" i]',
      'input[placeholder*="code" i]',
      'input[aria-label*="captcha" i]',
      'input[name*="verify" i]',
      'input[id*="verify" i]',
      'input[name*="security" i]',
      'input[placeholder*="belgi" i]',
      'input[placeholder*="harf" i]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && visible(el)) return el;
    }
    return null;
  }

  function elementToDataURL(el) {
    return new Promise((resolve, reject) => {
      if (el.tagName === 'CANVAS') {
        try { resolve(el.toDataURL('image/png')); } catch (e) { reject(e); }
        return;
      }
      const img = el;
      if (!img.complete || !img.naturalWidth) { reject(new Error('Image not loaded')); return; }
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    });
  }

  async function preprocessImage(dataUrl, scale, threshold) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width * scale;
        c.height = img.height * scale;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        if (threshold) {
          const d = ctx.getImageData(0, 0, c.width, c.height);
          const px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            const v = lum < threshold ? 0 : 255;
            px[i] = px[i + 1] = px[i + 2] = v;
          }
          ctx.putImageData(d, 0, 0);
        }
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Screenshot orqali elementni olish — CORS muammosini hal qiladi.
  // chrome.tabs.captureVisibleTab() background'dan chaqiriladi,
  // keyin element bounding rect bo'yicha crop qilinadi.
  async function captureElementViaScreenshot(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) throw new Error('Element not visible');

    // Elementni ko'rinadigan joyga scroll qilamiz
    try {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch (_) {}
    await sleep(150);

    const freshRect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' }, (r) => {
        void chrome.runtime.lastError;
        resolve(r || { ok: false, error: 'no-response' });
      });
    });

    if (!resp || !resp.ok || !resp.dataUrl) {
      throw new Error((resp && resp.error) || 'Screenshot failed');
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          const sx = Math.round(freshRect.left * dpr);
          const sy = Math.round(freshRect.top * dpr);
          const sw = Math.round(freshRect.width * dpr);
          const sh = Math.round(freshRect.height * dpr);
          // Chegaradan chiqmasligini ta'minlaymiz
          const clampedSx = Math.max(0, Math.min(sx, img.width - 1));
          const clampedSy = Math.max(0, Math.min(sy, img.height - 1));
          const clampedSw = Math.min(sw, img.width - clampedSx);
          const clampedSh = Math.min(sh, img.height - clampedSy);
          c.width = clampedSw;
          c.height = clampedSh;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, clampedSx, clampedSy, clampedSw, clampedSh, 0, 0, clampedSw, clampedSh);
          resolve(c.toDataURL('image/png'));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Screenshot decode failed'));
      img.src = resp.dataUrl;
    });
  }

  // Sahifada "noto'g'ri captcha" turidagi xabar chiqganini aniqlaydi (uz/ru/en variantlar).
  // inputEl atrofidagi konteyner (eng yaqin <form> yoki 4 ota-elementgacha) ichidan qidiradi.
  const WRONG_CAPTCHA_RE = /noto['`ʻʼ’]?g['`ʻʼ’]?ri|xato\s|xato$|incorrect|invalid\s*(code|captcha|answer)?|wrong\s*(code|captcha|answer)?|неверн|ошибоч/i;
  function findCaptchaErrorText(inputEl) {
    let scope = inputEl.closest('form');
    if (!scope) {
      let p = inputEl;
      for (let i = 0; i < 4 && p.parentElement; i++) p = p.parentElement;
      scope = p;
    }
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node === inputEl || node.contains(inputEl)) continue;
      if (!visible(node)) continue;
      const t = (node.textContent || '').trim();
      if (t && t.length < 200 && WRONG_CAPTCHA_RE.test(t)) return t;
    }
    return null;
  }

  // Koordinata orqali eng yaqin fillable inputni topish
  function findInputNearPoint(pageX, pageY) {
    if (pageX == null || pageY == null) return null;
    const cx = pageX - (window.scrollX || 0);
    const cy = pageY - (window.scrollY || 0);
    // Avval to'g'ridan-to'g'ri nuqtadagi element
    let el = document.elementFromPoint(cx, cy);
    if (el) {
      if (isFillableField(el)) return el;
      // ota-elementlarda qidirish
      let cur = el;
      for (let d = 0; d < 6 && cur; d++) {
        if (isFillableField(cur)) return cur;
        if (cur.tagName === 'LABEL' && cur.htmlFor) {
          const linked = document.getElementById(cur.htmlFor);
          if (linked && isFillableField(linked)) return linked;
        }
        cur = cur.parentElement;
      }
    }
    // Atrofdagi inputlar orasidan eng yaqinini
    let best = null;
    let bestDist = Infinity;
    document.querySelectorAll('input, textarea, [contenteditable="true"]').forEach((inp) => {
      if (!visible(inp) || inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button') return;
      if (!isFillableField(inp)) return;
      const r = inp.getBoundingClientRect();
      const ix = r.left + r.width / 2;
      const iy = r.top + r.height / 2;
      const dist = Math.hypot(ix - cx, iy - cy);
      if (dist < bestDist && dist < 250) {
        bestDist = dist;
        best = inp;
      }
    });
    return best;
  }

  // inputInfo — foydalanuvchi tanlangan input
  // markerInfo — captcha rasmini topish uchun belgi (pageX/pageY)
  // Groq Vision (qwen/qwen3.8-27b) orqali o'qiladi
  async function attemptCaptchaOnce(opts) {
    // 1) Inputni topish: identity → koordinata → auto-detect
    let inputEl = null;
    if (opts.captchaInputInfo) {
      inputEl = findElementFromInfo(opts.captchaInputInfo, false);
      if (inputEl && !isFillableField(inputEl)) {
        inputEl = null; // tanlangan element input bo'lmasa, uni bekor qilib koordinata bo'yicha izlaymiz
      }
      if (!inputEl && opts.captchaInputInfo.pageX != null) {
        inputEl = findInputNearPoint(opts.captchaInputInfo.pageX, opts.captchaInputInfo.pageY);
      }
    }
    if (!inputEl) inputEl = findCaptchaInput();

    if (!inputEl) {
      logToPanel('Captcha input topilmadi', 'warn');
      return { ok: false, error: 'no-input' };
    }

    // 2) Rasmni topish: marker koordinata → auto-detect
    let imgEl = null;
    if (opts.markerInfo && opts.markerInfo.pageX != null) {
      const px = opts.markerInfo.pageX - (window.scrollX || 0);
      const py = opts.markerInfo.pageY - (window.scrollY || 0);
      // Avval nuqtadagi element
      const atPoint = document.elementFromPoint(px, py);
      if (atPoint) {
        if (atPoint.tagName === 'IMG' || atPoint.tagName === 'CANVAS') imgEl = atPoint;
        else {
          const inner = atPoint.querySelector && atPoint.querySelector('img, canvas');
          if (inner) imgEl = inner;
          else if (atPoint.closest) {
            const wrap = atPoint.closest('[class*="captcha" i], [id*="captcha" i]');
            if (wrap) {
              const wImg = wrap.querySelector('img, canvas');
              if (wImg) imgEl = wImg;
            }
          }
        }
      }
      if (!imgEl) {
        const r = 220;
        const rect = { left: px - r, top: py - r, right: px + r, bottom: py + r };
        let best = null, bestArea = 0;
        document.querySelectorAll('img, canvas').forEach((el) => {
          if (!visible(el)) return;
          const b = el.getBoundingClientRect();
          const inter = !(b.right < rect.left || b.left > rect.right || b.bottom < rect.top || b.top > rect.bottom);
          if (!inter) return;
          const area = b.width * b.height;
          if (area > bestArea) { bestArea = area; best = el; }
        });
        imgEl = best;
      }
    }
    if (!imgEl) imgEl = findCaptchaImage();

    if (!imgEl) {
      logToPanel('Captcha rasmi topilmadi', 'warn');
      return { ok: false, error: 'no-captcha' };
    }

    let rawImageData = null;
    try {
      rawImageData = await elementToDataURL(imgEl);
    } catch (e) {
      logToPanel('CORS xatosi, screenshot orqali olinmoqda...', 'warn');
      try {
        rawImageData = await captureElementViaScreenshot(imgEl);
      } catch (err2) {
        logToPanel('Rasm olishda xato: ' + err2.message, 'err');
        return { ok: false, error: 'image-capture' };
      }
    }

    if (!rawImageData) {
      logToPanel('Captcha rasm bo\'sh', 'warn');
      return { ok: false, error: 'empty-image' };
    }

    flash(imgEl, '#f5b942');
    logToPanel('Captcha Groq AI ga yuborilmoqda...', 'warn');

    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'GROQ_CAPTCHA',
          imageData: rawImageData,
          apiKey: opts.apiKey || null,
          model: opts.model || null,
        },
        (r) => { void chrome.runtime.lastError; resolve(r || { ok: false, error: 'no-response' }); }
      );
    });

    if (!resp || !resp.ok || !resp.text) {
      const err = (resp && resp.error) || 'unknown';
      logToPanel('Groq xato: ' + err, 'err');
      return { ok: false, error: err };
    }

    let text = String(resp.text).trim().replace(/[^A-Za-z0-9]/g, '');

    // maxLength qat'iy talab emas — faqat qisqartiramiz
    const maxLen = inputEl.maxLength && inputEl.maxLength > 0 ? inputEl.maxLength : null;
    if (maxLen && text.length > maxLen) {
      text = text.slice(0, maxLen);
      logToPanel('AI natija maxLength ga qisqartirildi: "' + text + '"', 'warn');
    }
    if (!text) {
      return { ok: false, error: 'empty-after-clean' };
    }

    logToPanel('AI natija: ' + text, 'ok');

    const errBefore = findCaptchaErrorText(inputEl);

    // Inputga yozish — focus + native value + eventlar
    try {
      inputEl.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch (_) {}
    await sleep(80);
    inputEl.focus();
    await sleep(40);
    setNativeValue(inputEl, '');
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Tez yozish (captcha uchun character-by-character)
    for (let i = 0; i < text.length; i++) {
      setNativeValue(inputEl, text.slice(0, i + 1));
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: text[i], bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent('keypress', { key: text[i], bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: text[i], bubbles: true }));
      await sleep(25);
    }
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
    flash(inputEl, '#16a34a');

    await sleep(350);
    // Qiymat haqiqatan yozildimi?
    const written = (inputEl.value || inputEl.textContent || '').trim();
    if (!written) {
      logToPanel('Inputga yozilmadi — qayta urinish (direct)', 'warn');
      setNativeValue(inputEl, text);
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const errAfter = findCaptchaErrorText(inputEl);
    if (errAfter && errAfter !== errBefore) {
      logToPanel('Captcha noto\'g\'ri deb belgilandi: "' + errAfter + '"', 'warn');
      return { ok: false, error: 'wrong-answer', wrongAnswer: true, text };
    }

    return { ok: true, text };
  }

  // Bitta urinish — refresh/rerandom olib tashlangan
  async function solveCaptchaInPage(opts) {
    opts = opts || {};
    const result = await attemptCaptchaOnce(opts);
    if (!result.ok) {
      logToPanel('Captcha yechilmadi: ' + result.error, 'err');
    }
    return result;
  }

  async function runProject(msg) {
    if (running) return { ok: false, error: 'Busy' };
    running = true;
    try {
      return await runProjectInner(msg);
    } catch (e) {
      const errText = String((e && e.message) || e);
      try { doneToPanel(false, errText); } catch (_) {}
      return { ok: false, error: errText };
    } finally {
      // doneToPanel() running'ni allaqachon false qiladi, lekin agar u
      // chaqirilmasdan xato tashlansa ham (masalan doneToPanel ichida xato
      // bo'lsa), running ABADIY "true" bo'lib qolib, extension butunlay
      // ishlamay qolishining oldi shu yerda olinadi — hech qanday chiqish
      // yo'li running'ni true holda qoldirmaydi.
      running = false;
    }
  }

  async function runProjectInner(msg) {
    stopRequested = false;
    soundClickEnabled = msg.soundClick !== false;
    soundTypeEnabled = msg.soundType !== false;
    ensureAgentCursor();
    // Boshlang'ich pozitsiya — ekran o'rtasi
    setAgentClientPos(window.innerWidth / 2, window.innerHeight / 2, 1);
    const steps = msg.steps || [];
    const delay = Math.max(0, parseInt(msg.delay, 10) || 0);
    // Har bir harakatdan keyin keyingisigacha kutish — Settings → Run'da
    // soniyada sozlanadi (masalan 0.3 => 300ms). Belgilanmagan bo'lsa,
    // avvalgi standart qiymat (300ms) ishlatiladi.
    const stepGapMs = msg.stepGap != null
      ? Math.max(0, Math.round((parseFloat(msg.stepGap) || 0) * 1000))
      : 300;
    if (delay > 0) {
      for (let i = delay; i >= 1; i--) {
        if (stopRequested) { doneToPanel(false, 'Aborted'); return { ok: false }; }
        showHud(String(i));
        logToPanel(String(i), 'warn');
        await sleep(1000);
      }
    }
    for (let i = 0; i < steps.length; i++) {
      if (stopRequested) { doneToPanel(false, 'Aborted'); return { ok: false }; }
      const step = steps[i];
      const n = i + 1 + '/' + steps.length;
      showHud(n + ': ' + (step.label || 'Click'));

      // CAPTCHA — Groq Vision AI
      if (step.kind === 'captcha') {
        logToPanel(n + '. Captcha AI (Groq)', 'warn');
        // markerInfo da pageX bo'lmasa — step koordinatasidan to'ldiramiz
        let markerInfo = step.captchaMarkerInfo || null;
        if (markerInfo && markerInfo.pageX == null && step.pageX != null) {
          markerInfo = Object.assign({}, markerInfo, { pageX: step.pageX, pageY: step.pageY });
        } else if (!markerInfo && step.pageX != null) {
          markerInfo = { pageX: step.pageX, pageY: step.pageY };
        }
        const res = await solveCaptchaInPage({
          apiKey: msg.groqApiKey || null,
          model: msg.groqModel || null,
          captchaInputInfo: step.captchaInputInfo || null,
          markerInfo: markerInfo,
        });
        if (!res.ok) {
          if (step.optional) {
            logToPanel('Captcha o\'tkazib yuborildi (optional)', 'warn');
            continue;
          }
          doneToPanel(false, 'Captcha: ' + res.error);
          return { ok: false };
        }
        await sleep(stepGapMs);
        continue;
      }

      let pageX = Number(step.pageX);
      let pageY = Number(step.pageY);
      if (Number.isNaN(pageX) || Number.isNaN(pageY)) {
        logToPanel(n + '. Capture', 'warn');
        const picked = await waitForSelection('point', step.label || 'Click');
        if (!picked || !picked.info) { doneToPanel(false, 'No target'); return { ok: false }; }
        pageX = picked.info.pageX;
        pageY = picked.info.pageY;
        notifyPanel({
          type: 'STEP_ELEMENT_SAVED',
          projectId: msg.projectId,
          stepId: step.id,
          info: picked.info,
        });
      }

      // Koordinata + identifikator (id/name/class) tekshiruvi: ikkisi ham to'g'ri bo'lgandagina
      // aniq shu elementga bosiladi. Element boshqa joyga ko'chgan bo'lsa ham, identifikator
      // orqali topib bosadi. Identifikator bo'lmasa (eski steplar), faqat koordinata ishlatiladi.
      let targetEl = null;
      if (step.elementInfo && step.elementInfo.tag) {
        const clientX = pageX - (window.scrollX || 0);
        const clientY = pageY - (window.scrollY || 0);
        const atPoint = document.elementFromPoint(clientX, clientY);
        const atPointMatches = atPoint && scoreIdentity(atPoint, step.elementInfo) >= 20;

        if (atPointMatches) {
          targetEl = atPoint;
        } else {
          const found = findAnyElementByIdentity(step.elementInfo);
          if (found) {
            targetEl = found;
            const r = found.getBoundingClientRect();
            pageX = Math.round(r.left + r.width / 2 + window.scrollX);
            pageY = Math.round(r.top + r.height / 2 + window.scrollY);
            logToPanel(n + '. Element joyi o\'zgargan — id/name/class bo\'yicha topildi', 'warn');
          } else {
            logToPanel(n + '. Diqqat: identifikator (id/name/class) mos kelmadi, faqat koordinata bo\'yicha bosiladi', 'warn');
          }
        }
      }

      // Agar stepda qiymat bor va maqsad to'ldiriladigan maydon bo'lsa — yozamiz
      const hasValue = step.value != null && String(step.value).length > 0;
      const fieldKind = (step.elementInfo && step.elementInfo.field && step.elementInfo.field.kind) || null;
      const shouldFill = hasValue && fieldKind && fieldKind !== 'button' && fieldKind !== 'unknown';

      if (shouldFill) {
        // Elementni topish (koordinata yoki identity orqali)
        if (!targetEl) {
          const clientX = pageX - (window.scrollX || 0);
          const clientY = pageY - (window.scrollY || 0);
          targetEl = document.elementFromPoint(clientX, clientY);
        }
        // Eng yaqin to'ldiriladigan ota-elementni qidirish (label ustiga bosilgan bo'lishi mumkin)
        if (targetEl && !isFillableField(targetEl)) {
          let cur = targetEl;
          for (let d = 0; d < 5 && cur; d++) {
            if (isFillableField(cur)) { targetEl = cur; break; }
            // label[for] orqali bog'langan input
            if (cur.tagName === 'LABEL' && cur.htmlFor) {
              const linked = document.getElementById(cur.htmlFor);
              if (linked && isFillableField(linked)) { targetEl = linked; break; }
            }
            cur = cur.parentElement;
          }
        }

        if (targetEl && isFillableField(targetEl)) {
          const speed = Math.max(5, parseInt(msg.speed, 10) || 45);
          logToPanel(n + '. Fill: ' + (fieldKind || 'text') + ' → "' + String(step.value).slice(0, 40) + '"');
          const r = targetEl.getBoundingClientRect();
          const fillPageX = Math.round(r.left + r.width / 2 + window.scrollX);
          const fillPageY = Math.round(r.top + r.height / 2 + window.scrollY);
          await agentClickAt(fillPageX, fillPageY);
          if (stopRequested) { removeAgentCursor(); doneToPanel(false, 'Aborted'); return { ok: false }; }
          const ok = await typeIntoElement(targetEl, step.value, speed);
          if (!ok && !stopRequested) {
            logToPanel(n + '. Fill muvaffaqiyatsiz — qayta click', 'warn');
            await agentClickAt(pageX, pageY);
          }
          await sleep(stepGapMs);
          continue;
        }
      }

      logToPanel(n + '. ' + Math.round(pageX) + ', ' + Math.round(pageY));
      await agentClickAt(pageX, pageY);
      await sleep(stepGapMs);
    }
    removeAgentCursor();
    doneToPanel(true);
    return { ok: true };
  }

  function onSelectionKeyDown(e) {
    if (e.key !== 'Escape' || !selectionMode) return;
    e.preventDefault();
    e.stopPropagation();
    const resolver = selectionResolver;
    selectionResolver = null;
    stopSelectionMode();
    notifyPanel({ type: 'SELECTION_CANCELLED', pickToken: currentPickToken });
    if (resolver) resolver(null);
  }
  document.addEventListener('keydown', onSelectionKeyDown, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'PING') {
      sendResponse({ ok: true, ver: CONTENT_VER });
      return;
    }
    if (msg.type === 'START_SELECTION') {
      // Selection UI faqat top-level frame'da — iframe ichida overlay chalkashtiradi
      if (window !== window.top) {
        sendResponse({ ok: false, error: 'iframe-skip' });
        return;
      }
      currentPickToken = (msg.pickToken != null) ? msg.pickToken : null;
      // Avvalgi selectionni tozalab, keyin yangisini boshlaymiz
      if (selectionResolver) {
        const r = selectionResolver;
        selectionResolver = null;
        try { r(null); } catch (_) {}
      }
      stopSelectionMode();
      if (msg.mode === 'captcha-input') {
        startSelectionMode('input');
        showHud(msg.reason || 'Captcha inputni tanlang');
        sendResponse({ ok: true });
        return;
      }
      // captcha-refresh — bu bosiladigan tugma (↻), 'input' rejimga tushib ketsa
      // isTypeable() hech qachon true bo'lmaydi va selectionMode abadiy ochiq qolib,
      // cursor "yopishib qolgan" holatda ko'rinadi (click hech narsani tugatolmaydi).
      startSelectionMode(
        msg.mode === 'point' ? 'point'
          : (msg.mode === 'click' || msg.mode === 'captcha-refresh') ? 'click'
          : 'input'
      );
      if (msg.reason) showHud(msg.reason || 'Capture');
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'STOP_SELECTION') {
      if (selectionResolver) {
        const r = selectionResolver;
        selectionResolver = null;
        r(null);
      }
      stopSelectionMode();
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'STOP_COWORK') {
      stopRequested = true;
      if (selectionResolver) {
        const r = selectionResolver;
        selectionResolver = null;
        r(null);
      }
      stopSelectionMode();
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'SOLVE_CAPTCHA') {
      solveCaptchaInPage({
        apiKey: msg.apiKey || msg.groqApiKey || null,
        model: msg.model || msg.groqModel || null,
        captchaInputInfo: msg.captchaInputInfo || null,
        markerInfo: msg.markerInfo || null,
      }).then((r) => sendResponse(r)).catch((e) => {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      });
      return true;
    }
    if (msg.type === 'RUN_PROJECT') {
      // runProject() ichida allaqachon try/catch/finally bor va u hech qachon
      // reject qilmaydi — lekin .catch() shu yerda ham qoldiriladi, chunki
      // "hech qachon" real kodda kafolat emas, faqat ehtimollik: agar biror
      // kelajakdagi o'zgarish shu kafolatni buzsa ham, sendResponse baribir
      // chaqiriladi va `running` flag stuck bo'lib qolmaydi.
      runProject(msg).then((res) => sendResponse(res || { ok: true })).catch((e) => {
        running = false;
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      });
      return true;
    }
    // Noma'lum message type — async javob va'da qilinmayapti, shuning uchun
    // "false" qaytariladi. Oldin bu yerda ham "true" qaytardi, natijada
    // sendResponse hech qachon chaqirilmagani uchun konsolda "message port
    // closed before a response was received" xatosi chiqib, debugni
    // qiyinlashtirar edi.
    return false;
  });
})();