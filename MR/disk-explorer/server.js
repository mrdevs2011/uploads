// ============================================================
// Disk Explorer — server.js
// Zero dependencies. Faqat Node.js o'zining built-in modullari.
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const PORT = 4321;
const DEFAULT_MIN_BYTES = 100 * 1024 * 1024; // 100MB

// ------------------------------------------------------------
// 1) PAPKA HAJMINI HISOBLASH — RECURSION
// ------------------------------------------------------------
// Mantiq: papkaning o'z "hajmi" yo'q. Uning hajmi = ichidagi
// barcha fayl va sub-papkalar yig'indisi. Shuning uchun har bir
// sub-papka uchun bu funksiyaning o'zini qayta chaqiramiz —
// eng chuqur ichkaridan boshlab, tashqariga qarab yig'iladi.
function getDirSize(dirPath) {
  let total = 0;
  let entries;

  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    // Ruxsat yo'q (Permission denied) yoki papka o'chib ketgan —
    // shu yerni o'tkazib yuboramiz, butun scan'ni to'xtatmaymiz.
    return 0;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      const lstat = fs.lstatSync(fullPath);

      // Symlink'larni o'tkazib yuboramiz — aks holda cheksiz
      // aylanish (infinite loop) xavfi bor, masalan symlink
      // o'zining ota-papkasiga ishora qilsa.
      if (lstat.isSymbolicLink()) continue;

      if (lstat.isDirectory()) {
        total += getDirSize(fullPath); // <-- RECURSION SHU YERDA
      } else {
        total += lstat.size;
      }
    } catch (err) {
      continue; // bitta fayl o'qib bo'lmasa, davom etamiz
    }
  }

  return total;
}

// ------------------------------------------------------------
// 2) BITTA DARAJANI (level) SKAN QILISH
// ------------------------------------------------------------
// Berilgan papkaning ICHIDAGI birinchi qatlamini o'qiydi (fayl +
// sub-papkalar), har birining hajmini hisoblaydi, minBytes dan
// kichiklarini tashlab yuboradi, kattadan-kichikka saralaydi.
function scanLevel(dirPath, minBytes) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) continue;

      let size, type;
      if (lstat.isDirectory()) {
        size = getDirSize(fullPath);
        type = 'dir';
      } else {
        size = lstat.size;
        type = 'file';
      }

      if (size >= minBytes) {
        results.push({ name: entry.name, path: fullPath, size, type });
      }
    } catch (err) {
      continue;
    }
  }

  results.sort((a, b) => b.size - a.size); // kattadan kichikka
  return results;
}

// ------------------------------------------------------------
// 3) STATIK FAYLLARNI BERISH (HTML/CSS/JS)
// ------------------------------------------------------------
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': STATIC_TYPES[ext] || 'text/plain' });
    res.end(data);
  });
}

// ------------------------------------------------------------
// 4) HTTP SERVER — ROUTE'LAR
// ------------------------------------------------------------
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // --- Statik fayllar ---
  if (req.method === 'GET' && pathname === '/') {
    return serveStatic(res, path.join(__dirname, 'public', 'index.html'));
  }
  if (req.method === 'GET' && (pathname === '/app.js' || pathname === '/style.css')) {
    return serveStatic(res, path.join(__dirname, 'public', pathname.slice(1)));
  }

  // --- Uy papkasini olish (birinchi ochilishda default yo'l) ---
  if (req.method === 'GET' && pathname === '/api/home') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ home: os.homedir() }));
  }

  // --- Scan endpoint — SSE (Server-Sent Events) orqali PROGRESS bilan ---
  // Oddiy JSON javob o'rniga, server ochiq ulanish orqali har bir
  // papka hisoblanganida darhol bitta "progress" xabar yuboradi,
  // oxirida esa bitta "done" xabar bilan yakuniy ro'yxatni beradi.
  if (req.method === 'GET' && pathname === '/api/scan') {
    const dir = parsed.query.dir || os.homedir();
    const minMB = parseFloat(parsed.query.minMB) || 100;
    const minBytes = Math.round(minMB * 1024 * 1024);

    let dirEntries;
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Bu papkani ochib bo\'lmadi: ' + err.message }));
    }

    // SSE header'lari — ulanishni "ochiq" ushlab turamiz
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    function sendEvent(payload) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    // Avval symlink bo'lmagan, o'qiladigan itemlarni filtrlaymiz
    const candidates = [];
    for (const entry of dirEntries) {
      const fullPath = path.join(dir, entry.name);
      try {
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink()) continue;
        candidates.push({ name: entry.name, path: fullPath, isDir: lstat.isDirectory(), quickSize: lstat.size });
      } catch (err) {
        continue;
      }
    }

    const total = candidates.length;
    const results = [];

    async function runScan() {
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const size = c.isDir ? getDirSize(c.path) : c.quickSize;
        const type = c.isDir ? 'dir' : 'file';

        if (size >= minBytes) {
          results.push({ name: c.name, path: c.path, size, type });
        }

        // Har bir item tugagach — darhol progress yuboramiz
        sendEvent({ kind: 'progress', index: i + 1, total, name: c.name });

        // Event loop'ga "nafas" beramiz — shu yozuv darhol
        // brauzerga yetib borishi uchun (aks holda katta papkalarda
        // hammasi oxirida birdan yuborilib qolishi mumkin edi).
        await new Promise(resolve => setImmediate(resolve));
      }

      results.sort((a, b) => b.size - a.size);
      const parent = path.dirname(dir);
      sendEvent({
        kind: 'done',
        dir,
        parent: parent === dir ? null : parent,
        entries: results,
      });
      res.end();
    }

    runScan().catch(err => {
      sendEvent({ kind: 'error', message: err.message });
      res.end();
    });

    return;
  }

  // --- O'chirish endpoint ---
  if (req.method === 'DELETE' && pathname === '/api/delete') {
    const target = parsed.query.path;

    // XAVFSIZLIK TEKSHIRUVI — bu bo'lmasa katastrofa bo'lishi mumkin
    const home = os.homedir();
    const forbidden = ['/', home, path.dirname(home)];
    if (!target || target.length < 5 || forbidden.includes(target)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Bu yo\'lni o\'chirish taqiqlangan (juda xavfli).' }));
    }

    try {
      fs.rmSync(target, { recursive: true, force: true });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n📁 Disk Explorer ishga tushdi!`);
  console.log(`   Brauzerda och: http://localhost:${PORT}\n`);
});
