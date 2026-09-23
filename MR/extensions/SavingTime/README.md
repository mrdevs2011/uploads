# SavingTime - Enhanced Edition

## MODE System bilan Yangilangan Versiya

Endi ikkita rejim bilan ishlaydigan SavingTime.

```
+-------------------------------------------+
| MODE TUGMASI                               |
+--------------+------------------------------+
| CENTRAL      | Chrome storage               |
|              | Barcha saytlarda              |
+--------------+------------------------------+
| THIS CHAT    | IndexedDB (domain)           |
|              | Faqat bu sahifada              |
+--------------+------------------------------+
```

---

## Asosiy Xususiyatlar

### 1. CENTRAL Mode

Ma'lumotlar saqlanadi: Chrome Extension Storage
- Barcha websaytlarda ishlaydi
- Projeksiyalarni boshqa saytdan ham ochish mumkin
- Root kabi - hamma sahifada ulash
- Yanada xavfsiz va tezroq

Qo'llanish:
- Asosiy qo'llanish uchun
- Loyihalar ko'p saytlarda takrorlanmoqchi bo'lsa

### 2. THIS CHAT Mode

Ma'lumotlar saqlanadi: Domain-isolated IndexedDB
- Faqat bu sahifada/domenda ishlaydi
- Boshqa saytlarda ko'rinmaydi
- Sichqoncha saytdan chiqa olmaydi (cursor confinement)
- Ma'lumotlarni bu dialog ichida qoplash

Qo'llanish:
- Xavfsizlik uchun
- Shaxsiy ma'lumotlar
- Testlash/eksperiment

---

## Fayllar Tuzilishi

```
SavingTime-Enhanced/
  manifest.json              Extension metadata
  sidepanel.html             UI (MODE bar qo'shildi)
  sidepanel.css              Stillar (MODE bar css)
  sidepanel.js               Asosiy logic
  sidepanel-mode-logic.js    MODE system (yangi)
  background.js              Service worker
  content.js                 Content script
  sidebar-injector.js        Sidebar injector
  click.mp3                  Click sound
  type.mp3                   Type sound
  mouse.svg                  Mouse cursor icon
  icon16.png                 16px icon
  icon32.png                 32px icon
  icon48.png                 48px icon
  icon128.png                128px icon
  IMPLEMENTATION_GUIDE.md    Integratsiya gida (yangi)
  README.md                  Bu fayl
```

---

## Qo'llanish

### 1. O'rnatish

Chrome/Edge:
1. chrome://extensions oching
2. Developer mode yoqing (o'ng yuqori)
3. Load unpacked bosing
4. SavingTime-Enhanced papkasini tanlang

Brave:
1. brave://extensions oching
2. Developer mode yoqing
3. Load unpacked bosing
4. SavingTime-Enhanced papkasini tanlang

Sidepanel oching:
- Extension iconni bosing
- Sidepanel ochildi

### 2. MODE Tanlang

Sidepanel boshida MODE bar ko'rinadi:

```
[ CENTRAL ]  [ THIS CHAT ]
Chrome storage - barcha saytlarda
```

- CENTRAL - default, barcha saytda
- THIS CHAT - bu sahifada qoplamoq

### 3. Loyiha Yarating

1. "+" tugmasini bosing
2. Loyihaga nom bering
3. Operator qo'shing (Click, Type va h.k.)
4. Capture bosib, element/koordinata tanlang
5. Execute bosib, loyihani ishga tushiring

### 4. Ma'lumotlarni Saqlab/Yuklang

Get Json: barcha ma'lumotlarni .json sifatida yuklab oling
Import Json: .json faylni ichiga oling (drag va drop yoki tanlash)

---

## Yangi Kod - MODE System

### sidepanel-mode-logic.js - Asosiy Logic

Ikkita rejim uchun:

```javascript
// CENTRAL MODE
currentMode = 'central'
// chrome.storage.local.get/set()
// Barcha saytlarda ulash

// THIS CHAT MODE
currentMode = 'thischat'
// IndexedDB (domain-isolated)
// Faqat bu saytda ulash
```

### Storage Sistem

```javascript
// Mode-independent API
await storageGet(key)   // Avtomatik tanlash
await storageSet(key, value)
```

Ichida:
- CENTRAL: chrome.storage.local.get/set()
- THIS CHAT: IndexedDB.open() + objectStore

### Cursor Confinement

THIS CHAT mode'da sichqoncha saytdan chiqa olmaydi:

```javascript
initCursorConfinement()
// Mouse event'larini tekshiradi
// Boundary orqali confine qiladi
```

---

## Integration (Developers)

Agar siz sidepanel.js ni customize qilsangiz:

### 1. Saqlash

Eski:
```javascript
localStorage.setItem('savingtime_projects', JSON.stringify(projects));
```

Yangi:
```javascript
async function saveData() {
  const data = { projects, settings };
  await storageSet('savingtime_data', data);
}
```

### 2. Yuklash

Eski:
```javascript
const saved = JSON.parse(localStorage.getItem('savingtime_projects'));
```

Yangi:
```javascript
async function loadData() {
  const data = await storageGet('savingtime_data');
  // use data...
}
```

### 3. Init

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderTabs();
  initModeButtons(); // yangi
});
```

Batafsil: IMPLEMENTATION_GUIDE.md oching.

---

## Xavfsizlik

CENTRAL Mode
- Chrome storage - taxtada xavfsiz
- Barcha saytdan ulashan - ehtiyot bo'ling

THIS CHAT Mode
- Domain-isolated IndexedDB
- Sichqoncha confinement
- Maxsus ma'lumotlar uchun ideal

Tavsiya:
- Shaxsiy ma'lumotlar - THIS CHAT
- Umum qo'llanish - CENTRAL

---

## Xatolar

| Muammo | Yechimi |
|--------|---------|
| MODE tugmasi ko'rinmaydi | HTML'da MODE bar qismini tekshiring |
| Data saqlanmaydi | loadData()/saveData() async bo'lishini tekshiring |
| Ikkita rejim arasida o'tib bolin | Mode o'zgartirganda confirm dialoq bosing |
| Cursor confinement ishlamaydi | initCursorConfinement() console'da tekshiring |

Batafsil: IMPLEMENTATION_GUIDE.md, Troubleshooting bo'limiga o'ting.

---

## Versiya Tarixi

v4.0.0 (Enhancement)
- CENTRAL vs THIS CHAT MODE qo'shildi
- Domain-isolated IndexedDB storage
- Cursor confinement (THIS CHAT mode)
- IMPLEMENTATION_GUIDE.md dokumentatsiya

v3.1.0 (Original)
- Loyihalar va operatorlar
- JSON export/import
- Click/Type/Select operatorlari

---

## Hissa Qo'shish

Xatolar yoki taklif: github/issues yoki IMPLEMENTATION_GUIDE.md oching.

---

## Lisenziya

MIT License - Bepul qo'llanish

---

Sidepanelni oching, MODE tugmasini ko'ring, va ishlatishni boshlang.

Savollari bo'lsa - IMPLEMENTATION_GUIDE.md
