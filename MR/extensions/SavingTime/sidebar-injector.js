(function () {
  if (window.__savingTimeSidebarLoaded) return;
  window.__savingTimeSidebarLoaded = true;
  if (window !== window.top) return;

  var SIDEBAR_WIDTH = 380;     // umumiy eni (margin bilan birga)
  var MARGIN = 10;             // chetlardan bo'sh joy (px)
  var TOP_OFFSET = 10;         // tepadan masofa (px)
  var RADIUS = 12;             // burchak yumaloqligi (px)
  var ROOT_ID = 'st-root';
  var STYLE_ID = 'st-push-style';
  // Sahifa o'ng tomondan shuncha px "siqiladi"
  var PUSH_WIDTH = SIDEBAR_WIDTH;

  var isOpen = false;
  var root = null;

  // Sidebar eni HECH QACHON o'zgarmasin — bu qattiq qoida. Inline style
  // (root.style.cssText) odatda yetarli, lekin nazariy jihatdan sayt o'zining
  // CSS'ida "#st-root { width: ... !important }" kabi qoida yozsa (atayin
  // yoki tasodifan), inline style'ni bosib o'tishi mumkin. Shuning uchun
  // qo'shimcha himoya sifatida alohida <style> bilan !important qo'yamiz —
  // shu geometriya endi hech qanday sayt CSS'i bilan o'zgartirib bo'lmaydi,
  // window/sayt qanchalik kichraysa ham.
  var LOCK_STYLE_ID = 'st-root-lock-style';
  function injectWidthLock() {
    if (document.getElementById(LOCK_STYLE_ID)) return;
    var styleEl = document.createElement('style');
    styleEl.id = LOCK_STYLE_ID;
    styleEl.textContent = [
      '#' + ROOT_ID + ' {',
      '  width: ' + (SIDEBAR_WIDTH - MARGIN * 2) + 'px !important;',
      '  min-width: ' + (SIDEBAR_WIDTH - MARGIN * 2) + 'px !important;',
      '  max-width: ' + (SIDEBAR_WIDTH - MARGIN * 2) + 'px !important;',
      '  right: ' + MARGIN + 'px !important;',
      '  top: ' + TOP_OFFSET + 'px !important;',
      '  position: fixed !important;',
      '  box-sizing: border-box !important;',
      '}',
      '#' + ROOT_ID + ' > iframe {',
      '  width: 100% !important;',
      '  height: 100% !important;',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function buildSidebar() {
    if (root) return root;
    injectWidthLock();

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText = [
      'position: fixed',
      'top: ' + TOP_OFFSET + 'px',
      'right: ' + MARGIN + 'px',
      'width: ' + (SIDEBAR_WIDTH - MARGIN * 2) + 'px',
      'height: calc(100vh - ' + (TOP_OFFSET + MARGIN) + 'px)',
      'z-index: 2147483646',
      'background: #0e0f12',
      'border: 1px solid #2a2d33',
      'border-radius: ' + RADIUS + 'px',
      'box-shadow: -4px 0 24px rgba(0,0,0,0.45)',
      'display: none',
      'overflow: hidden',
      'box-sizing: border-box',
      'transform: translateX(calc(100% + ' + MARGIN + 'px))',
      'transition: transform 220ms ease'
    ].join(';');

    var iframe = document.createElement('iframe');
    iframe.id = 'st-sidepanel-iframe';
    iframe.src = chrome.runtime.getURL('sidepanel.html');
    iframe.style.cssText =
      'width: 100%; height: 100%; border: 0; display: block;' +
      'background: #0e0f12; border-radius: ' + RADIUS + 'px;';
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
    root.appendChild(iframe);

    document.documentElement.appendChild(root);
    return root;
  }

  // Sayt kontentini o'ngdan siqish — float emas, joy ochadi (responsive)
  function pushPage(on) {
    var styleEl = document.getElementById(STYLE_ID);
    if (on) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(styleEl);
      }
      styleEl.textContent = [
        'html.st-sidebar-open {',
        '  margin-right: ' + PUSH_WIDTH + 'px !important;',
        '  width: auto !important;',
        '  max-width: calc(100% - ' + PUSH_WIDTH + 'px) !important;',
        '  box-sizing: border-box !important;',
        '  transition: margin-right 220ms ease, max-width 220ms ease !important;',
        '}',
        'html.st-sidebar-open body {',
        '  margin-right: 0 !important;',
        '  width: 100% !important;',
        '  max-width: 100% !important;',
        '  box-sizing: border-box !important;',
        '  overflow-x: hidden !important;',
        '}',
        /* fixed/sticky header/footer ham siqilsin — LEKIN #st-root (sidebarning
           o'zi) BUNDAN MUSTASNO. Sabab: bu selector ilgari HAR QANDAY
           position:fixed elementga tegardi, jumladan sidebarning o'z root
           div'iga ham (u ham position:fixed) — natijada window torayganda
           calc(100vw - PUSH_WIDTH) formulasi SIDEBARNING O'ZINI ham
           torayttirib yuborardi (aynan shu bug ekranda ko'rilgan edi). */
        'html.st-sidebar-open [style*="position: fixed"]:not(#' + ROOT_ID + '),',
        'html.st-sidebar-open [style*="position:fixed"]:not(#' + ROOT_ID + '),',
        'html.st-sidebar-open [style*="position: sticky"]:not(#' + ROOT_ID + '),',
        'html.st-sidebar-open [style*="position:sticky"]:not(#' + ROOT_ID + ') {',
        '  max-width: calc(100vw - ' + PUSH_WIDTH + 'px) !important;',
        '}'
      ].join('\n');
      document.documentElement.classList.add('st-sidebar-open');
    } else {
      document.documentElement.classList.remove('st-sidebar-open');
      if (styleEl) {
        // transition tugaguncha biroz kutib olib tashlaymiz
        setTimeout(function () {
          if (!isOpen && styleEl && styleEl.parentNode) {
            styleEl.parentNode.removeChild(styleEl);
          }
        }, 250);
      }
    }
  }

  function showSidebar() {
    if (isOpen) return; // ALLAQACHON OCHIQ — qayta yozib, storage.onChanged'ni
                         // keraksiz qayta qo'zg'atmaymiz (sikl xavfining oldi)
    buildSidebar();
    pushPage(true);
    root.style.display = 'block';
    void root.offsetWidth;
    root.style.transform = 'translateX(0)';
    isOpen = true;
    // Global holat: sidebar HOZIR biror tabda ochiq. background.js buni
    // o'qib, foydalanuvchi boshqa tabga o'tganda yoki yangi tab ochganda
    // ham sidebarni o'sha yerda avtomatik ochadi — "butun Chrome bo'ylab
    // ergashish" shu flag orqali ishlaydi.
    try { chrome.storage.local.set({ stSessionOpen: true }); } catch (_) {}
  }

  function hideSidebar() {
    if (!isOpen) return; // ALLAQACHON YOPIQ — xuddi shu sabab bilan qaytamiz
    root.style.transform = 'translateX(calc(100% + ' + MARGIN + 'px))';
    pushPage(false);
    isOpen = false;
    try { chrome.storage.local.set({ stSessionOpen: false }); } catch (_) {}
    setTimeout(function () {
      if (!isOpen && root) root.style.display = 'none';
    }, 240);
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === 'ST_TOGGLE_SIDEBAR') {
      if (!isOpen) showSidebar();
      else hideSidebar();
      sendResponse({ ok: true, open: isOpen });
      return true;
    }
    if (msg.type === 'ST_OPEN_SIDEBAR') {
      showSidebar();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'ST_CLOSE_SIDEBAR') {
      hideSidebar();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'ST_IS_OPEN') {
      sendResponse({ open: isOpen });
      return true;
    }
    return false;
  });

  // FAQAT Escape — yopish uchun
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      hideSidebar();
    }
  }, true);

  // Sidebar iframe ichidan Escape
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'ST_IFRAME_ESCAPE' && isOpen) {
      hideSidebar();
    }
  }, false);
})();
