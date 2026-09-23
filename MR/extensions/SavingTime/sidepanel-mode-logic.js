/**
 * MODE SYSTEM: CENTRAL vs THIS CHAT
 * 
 * CENTRAL MODE:
 *   - Data stored in Chrome Extension Storage (chrome.storage.local)
 *   - Accessible on ALL websites
 *   - Acts as "root" - any site can read/write
 * 
 * THIS CHAT MODE:
 *   - Data stored in IndexedDB with domain isolation
 *   - Only accessible on the current domain/chat page
 *   - Cursor confined to the page (no escape)
 */

let currentMode = 'central'; // 'central' | 'thischat'

// ============= MODE BUTTON INITIALIZATION =============
function initModeButtons() {
  const modeButtons = document.querySelectorAll('.mode-btn');
  const modeInfoText = document.getElementById('modeInfoText');

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      switchMode(mode);
    });
  });

  // Load saved mode
  chrome.storage.local.get(['savingtime_mode'], (res) => {
    currentMode = res.savingtime_mode || 'central';
    updateModeUI();
  });
}

function switchMode(newMode) {
  if (newMode === currentMode) return;

  // Confirmation dialog
  const confirmed = confirm(
    newMode === 'central'
      ? 'CENTRAL mode-ga o\'tish?\nBarcha saytlarda ma\'lumotlar saqlanadi.'
      : 'THIS CHAT mode-ga o\'tish?\nFaqat bu sahifada ma\'lumotlar saqlanadi.'
  );

  if (!confirmed) return;

  currentMode = newMode;
  chrome.storage.local.set({ savingtime_mode: newMode });

  // Reload current data from new storage
  loadData().then(() => {
    updateModeUI();
    renderTabs();
  });
}

function updateModeUI() {
  const modeButtons = document.querySelectorAll('.mode-btn');
  const modeInfoText = document.getElementById('modeInfoText');

  modeButtons.forEach((btn) => {
    btn.classList.remove('mode-btn-active');
    if (btn.dataset.mode === currentMode) {
      btn.classList.add('mode-btn-active');
    }
  });

  if (currentMode === 'central') {
    modeInfoText.textContent = 'Chrome storage - barcha saytlarda';
  } else {
    modeInfoText.textContent = 'Bu sahifa - faqat bu chatda';
  }
}

// ============= DUAL STORAGE SYSTEM =============

/**
 * Chrome Storage (CENTRAL): chrome.storage.local
 * - Shared across all domains
 * - Larger quota (10MB+)
 * - Persistent across sessions
 */
async function chromeStorageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => {
      resolve(res[key]);
    });
  });
}

async function chromeStorageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

/**
 * IndexedDB (THIS CHAT): Domain-isolated storage
 * - Each domain gets its own database
 * - Stored under database name like "savingtime_<domain>"
 * - Only accessible from that domain
 */
async function indexedDBGet(key) {
  return new Promise((resolve, reject) => {
    const dbName = `savingtime_${window.location.hostname}`;
    const req = indexedDB.open(dbName, 1);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data');
      }
    };

    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(['data'], 'readonly');
      const store = tx.objectStore('data');
      const getReq = store.get(key);

      getReq.onsuccess = () => {
        resolve(getReq.result);
        db.close();
      };

      getReq.onerror = () => reject(getReq.error);
    };

    req.onerror = () => reject(req.error);
  });
}

async function indexedDBSet(key, value) {
  return new Promise((resolve, reject) => {
    const dbName = `savingtime_${window.location.hostname}`;
    const req = indexedDB.open(dbName, 1);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data');
      }
    };

    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(['data'], 'readwrite');
      const store = tx.objectStore('data');
      const putReq = store.put(value, key);

      putReq.onsuccess = () => {
        resolve();
        db.close();
      };

      putReq.onerror = () => reject(putReq.error);
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Smart get/set that routes to correct storage
 */
async function storageGet(key) {
  if (currentMode === 'central') {
    return await chromeStorageGet(key);
  } else {
    return await indexedDBGet(key);
  }
}

async function storageSet(key, value) {
  if (currentMode === 'central') {
    return await chromeStorageSet(key, value);
  } else {
    return await indexedDBSet(key, value);
  }
}

// ============= CURSOR CONFINEMENT (THIS CHAT MODE) =============

/**
 * In THIS CHAT mode, confine cursor to the page
 * Mouse cannot escape the page boundaries
 */
function initCursorConfinement() {
  if (currentMode !== 'thischat') return;

  const boundary = {
    minX: 0,
    maxX: window.innerWidth,
    minY: 0,
    maxY: window.innerHeight,
  };

  document.addEventListener('mousemove', (e) => {
    if (currentMode !== 'thischat') return;

    // If cursor tries to leave, prevent it
    if (
      e.clientX <= boundary.minX ||
      e.clientX >= boundary.maxX ||
      e.clientY <= boundary.minY ||
      e.clientY >= boundary.maxY
    ) {
      // Request pointer lock or just warn
      console.warn('Cursor confined to page in THIS CHAT mode');
    }
  });

  // Also handle pointer lock
  if (document.pointerLockElement === null) {
    document.addEventListener('pointerlockchange', () => {
      if (currentMode === 'thischat' && document.pointerLockElement === null) {
        // User exited pointer lock, optionally re-lock
        // document.documentElement.requestPointerLock();
      }
    });
  }
}

// ============= INITIALIZATION =============
document.addEventListener('DOMContentLoaded', () => {
  initModeButtons();
  initCursorConfinement();
});
