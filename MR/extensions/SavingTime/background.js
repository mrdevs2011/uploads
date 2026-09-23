// ============================================================
// Action tugmasi — sidebar'ni OCHADI / YOPADI (toggle)
// Escape ham yopadi (sidebar-injector.js da)
// ============================================================
chrome.action.onClicked.addListener(function (tab) {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'ST_TOGGLE_SIDEBAR' }, { frameId: 0 }, function () {
    if (chrome.runtime.lastError) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        files: ['sidebar-injector.js']
      }).then(function () {
        setTimeout(function () {
          chrome.tabs.sendMessage(tab.id, { type: 'ST_TOGGLE_SIDEBAR' }, { frameId: 0 }, function () {
            void chrome.runtime.lastError;
          });
        }, 50);
      }).catch(function (e) {
        console.warn('[SavingTime] sidebar ochilmadi', e);
      });
    }
  });
});

// ============================================================
// SIDEBAR BUTUN CHROME BO'YLAB "ERGASHADI":
// sidebar-injector.js har safar ochilganda/yopilganda `stSessionOpen`
// flagini chrome.storage.local'ga yozadi (bu barcha tab/context'larga
// umumiy, hech qanday maxsus ruxsat kerak emas). Bu yerda o'sha flagni
// kuzatib, agar u "true" bo'lsa:
//  - yangi tab ochilsa/yuklansa (onUpdated, status=complete),
//  - yoki foydalanuvchi allaqachon ochiq boshqa tabga o'tsa (onActivated),
// o'sha tabda ham sidebarni avtomatik ochamiz. sidebar-injector.js
// content_scripts sifatida manifest.json orqali HAR bir sahifaga
// avtomatik inject bo'ladi — bizga faqat "och" deb xabar yuborish qoladi.
//
// Bitta tabga qamalib qolgan RUN/PICK muammosining o'zi allaqachon yo'q
// edi (sidepanel.js dagi sendToTab() har safar joriy faol tabni qayta
// so'raydi) — yagona yetishmagan narsa shu UI ergashish edi.
// ============================================================
function stIsInjectableUrl(url) {
  return !!url && /^https?:\/\//.test(url);
}

function stTryOpenSidebar(tabId, attemptsLeft) {
  chrome.tabs.sendMessage(tabId, { type: 'ST_OPEN_SIDEBAR' }, { frameId: 0 }, function () {
    if (chrome.runtime.lastError && attemptsLeft > 0) {
      // Sahifa "complete" bo'lsa ham, content_scripts hali ulanmagan
      // bo'lishi mumkin (juda tez ketma-ket navigatsiya) — bir necha marta
      // qisqa kechikish bilan qayta urinamiz.
      setTimeout(function () { stTryOpenSidebar(tabId, attemptsLeft - 1); }, 150);
    }
  });
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!stIsInjectableUrl(tab.url)) return;
  chrome.storage.local.get(['stSessionOpen'], function (res) {
    if (chrome.runtime.lastError || !res.stSessionOpen) return;
    stTryOpenSidebar(tabId, 4);
  });
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  chrome.storage.local.get(['stSessionOpen'], function (res) {
    if (chrome.runtime.lastError || !res.stSessionOpen) return;
    chrome.tabs.get(activeInfo.tabId, function (tab) {
      if (chrome.runtime.lastError || !tab || !stIsInjectableUrl(tab.url)) return;
      stTryOpenSidebar(activeInfo.tabId, 2);
    });
  });
});

// ============================================================
// SINXRON OCHISH: sidebar bitta tabda ochilganda/yopilganda, buni
// KUTIB O'TIRMASDAN (yangi tab ochilishi yoki tabga o'tishni kutmasdan)
// — hozir OCHIQ TURGAN barcha tablarda BIR VAQTDA ochamiz/yopamiz.
// stSessionOpen o'zgarishini kuzatamiz (chrome.storage.onChanged) va
// chrome.tabs.query({}) bilan BARCHA oynadagi barcha tablarni olib,
// har biriga xabar yuboramiz. Chrome'ning o'z Side Panel API'si ATAYIN
// ishlatilmayapti — hozirgi custom iframe arxitekturasi saqlanadi
// (fixed width talabi shu bilan bog'liq edi), faqat sinxronizatsiya
// qo'shildi.
// ============================================================
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local' || !changes.stSessionOpen) return;
  var shouldOpen = !!changes.stSessionOpen.newValue;
  chrome.tabs.query({}, function (tabs) {
    (tabs || []).forEach(function (tab) {
      if (!tab.id || !stIsInjectableUrl(tab.url)) return;
      if (shouldOpen) {
        stTryOpenSidebar(tab.id, 4);
      } else {
        chrome.tabs.sendMessage(tab.id, { type: 'ST_CLOSE_SIDEBAR' }, { frameId: 0 }, function () {
          void chrome.runtime.lastError;
        });
      }
    });
  });
});

// ============================================================
// CAPTCHA — Groq Vision (qwen/qwen3.8-27b)
// ============================================================

var DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';
var GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

var CAPTCHA_PROMPT =
  'This is a CAPTCHA image. Read the characters shown in the image. ' +
  'Reply with ONLY the captcha text: letters and digits, no spaces, no punctuation, no explanation. ' +
  'If unclear, still give your best guess of the characters only.';

function getGroqSettings() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(['coworkData'], function (res) {
      var settings = (res.coworkData && res.coworkData.settings) || {};
      resolve({
        apiKey: String(settings.groqApiKey || '').trim(),
        model: String(settings.groqModel || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL
      });
    });
  });
}

function normalizeCaptchaText(raw) {
  if (!raw) return '';
  var t = String(raw).trim();
  var match = t.match(/[A-Za-z0-9]{3,12}/);
  if (match) return match[0];
  return t.replace(/[^A-Za-z0-9]/g, '');
}

function solveCaptchaViaGroq(imageData, apiKey, model) {
  if (!apiKey) return Promise.reject(new Error("Groq API key yo'q"));
  if (!imageData) return Promise.reject(new Error("image yo'q"));

  var dataUrl = imageData.indexOf(',') >= 0
    ? imageData
    : ('data:image/png;base64,' + imageData);

  var body = {
    model: model || DEFAULT_GROQ_MODEL,
    temperature: 0,
    max_tokens: 20,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: CAPTCHA_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  };

  return fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify(body)
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) {
        var msg = (data && data.error && data.error.message) || ('Groq HTTP ' + res.status);
        throw new Error(msg);
      }
      var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      var text = normalizeCaptchaText(content);
      if (!text) throw new Error('empty');
      return text;
    });
  });
}

var CHEAP_TEXT_MODEL = 'llama-3.1-8b-instant';

// ============================================================
// JSON AVTO-TUZATISH — AI FALLBACK. Bu FAQAT deterministik (sidepanel.js
// ichidagi autoFixJsonText) fixer o'zi tuza olmagan, juda og'ir buzilgan
// fayllar uchun ishlatiladi — shuning uchun kamdan-kam chaqiriladi va
// token sarfi umumiy hisobda past bo'ladi. Modelga qat'iy aytilgan: FAQAT
// sintaksisni tuzat, ma'lumotni o'zgartirma, faqat JSON qaytar. Baribir
// sidepanel.js tomonda javob albatta JSON.parse bilan tekshiriladi —
// bu yerdagi model javobiga ko'r-ko'rona ishonilmaydi.
// ============================================================
var JSON_FIX_SYSTEM_PROMPT =
  "Siz JSON tuzatuvchisiz. Foydalanuvchi buzilgan (JSON.parse xato beradigan) matn yubordi. " +
  "Vazifangiz: FAQAT sintaksis xatolarini tuzating (vergul, tirnoq, qavs va h.k.). Hech qanday " +
  "MA'LUMOTNI (kalit yoki qiymatlarni) o'zgartirmang, o'chirmang yoki qo'shmang — faqat mavjud " +
  "narsani to'g'ri JSON shakliga keltiring. Javobingiz FAQAT to'g'ri JSON matni bo'lsin — hech " +
  "qanday tushuntirish, izoh yoki ``` belgilarisiz.";

function fixJsonViaGroq(fileText, errorMessage, apiKey, model) {
  if (!apiKey) return Promise.reject(new Error('no-key'));
  if (!fileText) return Promise.reject(new Error('no-text'));
  var input = String(fileText);
  if (input.length > 6000) input = input.slice(0, 6000);
  var body = {
    model: model || CHEAP_TEXT_MODEL,
    temperature: 0,
    max_tokens: Math.min(4000, Math.ceil(input.length / 2) + 300),
    messages: [
      { role: 'system', content: JSON_FIX_SYSTEM_PROMPT },
      {
        role: 'user',
        content: "JavaScript xato xabari: " + String(errorMessage || "noma'lum") +
          '\n\nBuzilgan JSON:\n' + input
      }
    ]
  };
  return fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify(body)
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) {
        var m = (data && data.error && data.error.message) || ('HTTP ' + res.status);
        throw new Error(m);
      }
      var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      text = String(text || '').trim();
      if (!text) throw new Error('empty');
      return text;
    });
  });
}

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg.type === 'CAPTURE_TAB') {
    var wId = (_sender && _sender.tab && _sender.tab.windowId) || null;
    chrome.tabs.captureVisibleTab(wId, { format: 'png' }, function (dataUrl) {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, dataUrl: dataUrl });
      }
    });
    return true;
  }

  if (msg.type === 'OCR_CAPTCHA' || msg.type === 'GROQ_CAPTCHA') {
    getGroqSettings().then(function (settings) {
      var apiKey = (msg.apiKey && String(msg.apiKey).trim()) || settings.apiKey;
      var model = (msg.model && String(msg.model).trim()) || settings.model;
      return solveCaptchaViaGroq(msg.imageData, apiKey, model);
    }).then(function (text) {
      sendResponse({ ok: true, text: text });
    }).catch(function (err) {
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    });
    return true;
  }

  if (msg.type === 'FIX_JSON') {
    getGroqSettings().then(function (settings) {
      var apiKey = (msg.apiKey && String(msg.apiKey).trim()) || settings.apiKey;
      return fixJsonViaGroq(msg.text, msg.error, apiKey, CHEAP_TEXT_MODEL);
    }).then(function (text) {
      sendResponse({ ok: true, text: text });
    }).catch(function (err) {
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    });
    return true;
  }

  return false;
});
