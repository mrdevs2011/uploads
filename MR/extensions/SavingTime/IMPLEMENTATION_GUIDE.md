# SavingTime MODE SYSTEM - Implementation Guide

## What's New

Yuqorida MODE tugmasi qo'shildi: CENTRAL va THIS CHAT ikkita rejim.

### CENTRAL Mode
- Storage: Chrome Extension Storage (chrome.storage.local)
- Scope: Barcha websaytlarda ishlaydi
- Xususiyatlari:
  - Root kabi - hamma saytda ma'lumotlar saqlanadi
  - Loyihalar boshqa saytlardan ham ochilishi mumkin
  - Yanada tezroq va stable
  - Tavsiya etiladi: asosiy qo'llanish

### THIS CHAT Mode
- Storage: IndexedDB (domain-isolated)
- Scope: Faqat bu sahifada/chatda
- Xususiyatlari:
  - Ma'lumotlar bu domen ichida qoplanadi
  - Boshqa saytlarda shu ma'lumotlar ko'rinmaydi
  - Cursor saytdan chiqa olmaydi
  - Xavfsizlik uchun: ma'lumotlarni bu dialog ichida qoldiradi

---

## Integration Steps

### 1. HTML faylini yangilash (sidepanel.html)

Boshida `<body>` tegidan keyin MODE bar qo'shildi:

```html
<!-- MODE TOGGLE: CENTRAL vs THIS CHAT -->
<div class="mode-bar">
  <div class="mode-buttons">
    <button id="modeBtn-central" class="mode-btn mode-btn-active" data-mode="central">
      <span class="mode-label">CENTRAL</span>
    </button>
    <button id="modeBtn-thischat" class="mode-btn" data-mode="thischat">
      <span class="mode-label">THIS CHAT</span>
    </button>
  </div>
  <div id="modeInfo" class="mode-info">
    <span id="modeInfoText">Chrome storage - barcha saytlarda</span>
  </div>
</div>
```

### 2. CSS faylini yangilash (sidepanel.css)

MODE bar uchun yangi stillar qo'shildi:

```css
.mode-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms ease;
}

.mode-btn.mode-btn-active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.mode-info {
  font-size: 11px;
  color: var(--text-2);
  padding: 4px 8px;
  background: rgba(91, 141, 239, 0.08);
  border-radius: var(--radius);
  white-space: nowrap;
}
```

### 3. JavaScript faylini yangilash (sidepanel.js)

Bu faylda muhim qadamlar:

#### 3.1 sidepanel-mode-logic.js ni ulash

HTML'da script bo'limiga qo'ying, sidepanel.js dan oldin:

```html
<script src="sidepanel-mode-logic.js"></script>
<script src="sidepanel.js"></script>
```

#### 3.2 sidepanel.js ichidagi saveData() va loadData() larni yangilash

Asl kod (o'zgartirish kerak):

```javascript
// ESKI - to'g'rilash kerak
localStorage.setItem('savingtime_projects', JSON.stringify(data.projects));
const saved = localStorage.getItem('savingtime_projects');
```

Yangilangan kod:

```javascript
// YANGI - mode-aware
async function saveData() {
  const toSave = {
    projects: data.projects,
    settings: data.settings,
  };
  await storageSet('savingtime_data', toSave);
}

async function loadData() {
  try {
    const saved = await storageGet('savingtime_data');
    if (!saved) {
      data = {
        projects: [],
        settings: { speed: 45, delay: 3 }
      };
      return;
    }
    data = saved;
  } catch (err) {
    console.error('Load error:', err);
    data = { projects: [], settings: {} };
  }
}
```

#### 3.3 Init funksiyasida loadData() ni async qilish

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderTabs();
  setupListeners();
  initModeButtons(); // sidepanel-mode-logic.js dan
});
```

---

## Data Flow

### CENTRAL Mode
```
UI -> saveData() -> chrome.storage.local.set()
UI <- loadData() <- chrome.storage.local.get()
```

Barcha saytlar shu storage'ga yozadi:

```
Site A: loyiha "Login Automation" saqlanadi
        (chrome.storage.local)
Site B: shu loyihani ochadi - "Login Automation"
```

### THIS CHAT Mode
```
UI -> saveData() -> IndexedDB (domain-isolated)
UI <- loadData() <- IndexedDB
```

Har bir domain o'ziga xos IndexedDB'ga ega:

```
chat.site.com: loyihalar "savingtime_chat.site.com" ostida
other.com:      loyihalar "savingtime_other.com" ostida
```

---

## Cursor Confinement (THIS CHAT Mode)

sidepanel-mode-logic.js ichida initCursorConfinement() avtomatik chaqiriladi:

```javascript
function initCursorConfinement() {
  if (currentMode !== 'thischat') return;
  // Cursor saytdan chiqa olmaydi
  // MouseEvent koordinatalarini tekshirib, warning beradi
}
```

Agar sichqoncha sahifadan tashqariga chiqmoqchi bo'lsa:
- Browser konsolida warning chiqadi
- Sichqoncha bloklangan bo'ladi (tavsiya)

---

## Testing Checklist

- Birinchi o'rnatish: CENTRAL mode default bo'lishi kerak
- Mode almashtirish: tasdiqlash so'ralishi kerak
- CENTRAL data: Chrome'da barcha saytlarda shu loyihalar ko'rinishi kerak
- THIS CHAT data: bu saytni o'zgartirganda boshqa saytga ta'sir qilmasligi kerak
- Cursor confinement: THIS CHAT mode'da sichqoncha saytdan chiqa olmasligi kerak
- Persistence: sidepanel yopib-ochilganda ma'lumotlar saqlanib qolishi kerak

---

## Deployment

1. .zip o'rnatish: manifest.json, HTML/CSS/JS, media fayllar
2. Chrome: Load unpacked - folder tanlash
3. Brave va boshqa Chromium asosidagilar - xuddi shunday

---

## Notes

- Mode har doim chrome.storage.local da saqlanadi (meta-ma'lumot sifatida)
- Boshqa loyihalar shu mode'da ochiladi:
  - CENTRAL: Chrome storage dan
  - THIS CHAT: bu saytning IndexedDB'idan
- JSON export/import hali ham qo'llanadi, ammo faqat joriy mode'ning storage'iga saqlanadi

---

## FAQ

Savol: CENTRAL mode'dan THIS CHAT mode'ga o'tsam, eski ma'lumotlar yo'q bo'ladimi?
Javob: Yo'q. Eski Chrome storage saqlanib qoladi. Faqat yangi ma'lumotlar IndexedDB'ga saqlanadi.

Savol: THIS CHAT mode'da veb-saytni o'zgartirsam nima bo'ladi?
Javob: Boshqa saytga saqlangan ma'lumotlar ta'sir qilmaydi - har bir domain o'ziga xos IndexedDB'ga ega.

Savol: Cursor confinement'ni o'chirish mumkinmi?
Javob: Ha, initCursorConfinement() ni sidepanel-mode-logic.js da o'chirib qo'yishingiz mumkin.

---

## Troubleshooting

Muammo: Sidepanelda MODE tugmasi ko'rinmaydi
Yechim: sidepanel.html boshida MODE bar qismini tekshiring, CSS klasslarini tekshiring (.mode-bar, .mode-btn)

Muammo: Data qayta ochilganda saqlanmaydi
Yechim: loadData() va saveData() ga async/await qo'shib, storageGet()/storageSet() ishlatilganini tekshiring, konsolda xatolarni ko'ring

Muammo: Ikkita rejim orasida o'tishda muammo
Yechim: mode almashtirganda confirm() dialogini bosish kerak, tasdiq bermasangiz mode saqlanmaydi

---

Bu implementatsiya ikkita rejimni qo'llab-quvvatlaydi.
