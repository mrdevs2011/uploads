# SavingTime Enhanced - Tez Boshlash Gida

## 5 Daqiqada O'rnatish

### 1. Zip faylni ochib oling

```
SavingTime-Enhanced.zip
     -> extract
SavingTime-Enhanced/
```

### 2. Brauzerga yuklang

Chrome/Edge:
1. chrome://extensions -> Developer mode yoqing
2. Load unpacked -> SavingTime-Enhanced papkasini tanlang

Brave:
1. brave://extensions -> Developer mode yoqing
2. Load unpacked -> SavingTime-Enhanced papkasini tanlang

### 3. Sidepanelni oching

- Extension iconni bosing (toolbar'da)
- Sidepanel ochildi

---

## Birinchi Qo'llanish

### MODE ni Tanlang

Sidepanel boshida ko'rinadi:

```
[ CENTRAL ]  [ THIS CHAT ]
Chrome storage - barcha saytlarda
```

CENTRAL (Default)
- Qo'llanish: barcha saytda birgalikda
- Storage: Chrome Extension Storage
- Misol: "Avtomatik kirish" loyihasi barcha saytlarda

THIS CHAT
- Qo'llanish: faqat bu sahifada
- Storage: domain-isolated IndexedDB
- Misol: ma'lumotlarni bu chat ichida qoplash

### Loyiha Yarating

1. Sidepanel'da "+" tugmasini bosing
2. Loyihaga nom bering: "Avtomatik Login"
3. Add operator bosing
4. Operator turini tanlang:
   - Click - elementni bosish
   - Type - matn yozish
   - Select - dropdown tanlash
   - Checkbox/Radio - checkmark qo'yish
5. Capture bosib, element yoki koordinata tanlang
6. Qiymat kiriting (agar kerak)
7. Save bosing

### Loyihani Ishga Tushiring

1. Execute tugmasini bosing
2. 3 soniya kutiladi (countdown)
3. Loyiha avtomatik:
   - Elementlarga bosadi
   - Matnlarni yozadi
   - Formalarni to'ldiradi

### Ma'lumotlarni Saqlab Oling

Get Json: loyihalarni .json faylga yuklab oling
Import Json: oldin yuklagan .json'ni ichiga oling

---

## CENTRAL vs THIS CHAT - Taqqoslash

| Xususiyat | CENTRAL | THIS CHAT |
|-----------|---------|-----------|
| Storage | Chrome Storage | IndexedDB |
| Qamrovi | Barcha sayt | Faqat bu domen |
| Boshqa saytda | Ko'rinadi | Ko'rinmaydi |
| Cursor confinement | Yo'q | Bor |
| Tavsiya | Asosiy qo'llanish | Xavfsizlik |

---

## Sozlamalar (Settings)

Sidepanel footerida Settings tugmasini bosing:

Run
- Yozish tezligi (ms): kichik = tezroq (default: 45)
- Boshlash oldidan kutish: countdown soniya (default: 3)
- Harakatlar orasidagi masofa: step gap (default: 0.3s)

Sound
- Click tovushi - har bosishda
- Type tovushi - yozish paytida

API
- Groq API Key: captcha uchun (ixtiyoriy)
- Console: console.groq.com

---

## Tips

Tip 1: Tez o'zgartiradigan ma'lumot
```
Loyiha -> Table Field -> Global mode
Global qiymatni o'zgartirsangiz, barcha takrorlanishda ishlatiladi
```

Tip 2: Koordinatalar osongina
```
Click operator -> Capture bosing
Sahifadan element tanlang
Avtomatik koordinatalarni qo'yadi
```

Tip 3: JSON saqla
```
Loyiha yaratgandan so'ng:
Sidepanel footer -> Get Json
Barcha ma'lumotlar .json sifatida
```

Tip 4: Mode almashtirish
```
THIS CHAT -> CENTRAL o'tmoqchimisiz?
Confirm dialog chiqadi
Ma'lumotlar ko'chmaydi - har rejim o'z storage'iga ega
```

---

## Ogohlantirishlar

Extension o'chirilsa data yo'qoladi
- Oldin Get Json bilan saqlab oling

Private browsing mode
- Chrome: limited storage
- Brave: ma'lumotlar privatlik rejimida saqlanmasligi mumkin

---

## Tez Yechimlar

| Muammo | Yechimi |
|--------|---------|
| Sidepanel ko'rinmaydi | Extension iconni toolbar'da toping, bosing |
| MODE tugmasi yo'q | Sahifani yangilang (F5) |
| Data yo'q bo'ldi | Get Json orqali backup bor-yo'qligini tekshiring |
| Cursor g'alati harakatlanmoqda | CENTRAL mode'ga o'tib ko'ring |

Batafsil: IMPLEMENTATION_GUIDE.md, Troubleshooting bo'limi

---

## Keyingi Qadamlar

1. IMPLEMENTATION_GUIDE.md - to'liq technical hujjat
2. README.md - barcha xususiyatlar

---

## Misol: Login Automation

Stsenariy: example.com ga avtomatik kirish

Qadamlar:

1. MODE tanlang: CENTRAL (barcha saytda)
2. Loyiha: "Example Login"
3. Operator 1 - Email Input:
   - Type: Type
   - Capture: email input elementi
   - Value: test@example.com
4. Operator 2 - Password Input:
   - Type: Type
   - Capture: password elementi
   - Value: parol
5. Operator 3 - Login Button:
   - Type: Click
   - Capture: "Login" tugmasi

Ishga tushirish:
- Execute bosing
- 3 soniya kutiladi
- Avtomatik kiradi

THIS CHAT mode'da qo'llash:
- Mode: THIS CHAT
- Xuddi shunday qadamlar
- Faqat bu sahifada ishlaydi
- Sichqoncha confinement

---

## Checklist

- Zip extract qildi
- Brauzerga yuklab oldi
- Sidepanel ochildi
- MODE tugmasini ko'rdi
- Birinchi loyiha yaratdi
- Execute bosib ishga tushirdi
- JSON export qildi (backup)

Endi SavingTime Enhanced'dan foydalana boshlaysiz.

Savollari bo'lsa - README.md yoki IMPLEMENTATION_GUIDE.md oching.
