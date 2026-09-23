# Disk Explorer

Katta fayl va papkalarni topib beruvchi disk skaner. Hech qanday `npm install`
kerak emas — faqat Node.js'ning o'zi ishlatiladi (`fs`, `http`, `path`, `os`).

## Ishga tushirish

```bash
cd disk-explorer
node server.js
```

Keyin brauzerda och: **http://localhost:4321**

## Qanday ishlaydi

- **server.js** — backend. `getDirSize()` funksiyasi **recursion** orqali
  har bir papkaning haqiqiy hajmini hisoblaydi (ichidagi sub-papkalarni
  chuqurlikda aylanib chiqib, pastdan yuqoriga yig'ib chiqadi).
  `scanLevel()` esa berilgan papkaning bitta qatlamini o'qiydi, `minMB`
  chegarasidan kichiklarini tashlab, kattadan-kichikka saralaydi.
- **public/index.html + app.js + style.css** — frontend. Breadcrumb orqali
  papkalar ichiga kirib-chiqish, har bir qator yonida nisbiy hajm bar'i
  (yashil → amber → qizil, hajmiga qarab), va har bir fayl/papka yonida
  **O'chirish** tugmasi (tasdiqlash oynasi bilan, xato bosib yubormaslik
  uchun).

## Xavfsizlik eslatmasi

`/api/delete` endpoint'i `fs.rmSync(..., { recursive: true })` ishlatadi —
bu **qaytarib bo'lmaydigan** amal (Trash'ga bormaydi, to'g'ridan-to'g'ri
o'chib ketadi). Shuning uchun:
- Uy papkasi (`$HOME`) va root (`/`) papkalarini o'chirish server tomonida
  bloklangan.
- Frontend har doim tasdiqlash oynasini ko'rsatadi, to'g'ridan-to'g'ri
  o'chirmaydi.

Baribir — nozik joylarda (`.config`, tizim papkalari) ehtiyot bo'l.
