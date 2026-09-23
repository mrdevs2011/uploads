const modeEl = document.getElementById("mode");
const noteEl = document.getElementById("showNotification");
const saved = document.getElementById("saved");

const DEFAULTS = {
  mode: "replace",
  showNotification: true,
};

function flash() {
  saved.textContent = "Saqlanadi.";
  setTimeout(() => {
    saved.textContent = "";
  }, 900);
}

async function load() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  modeEl.value = data.mode || "replace";
  noteEl.checked = data.showNotification !== false;
}

async function save() {
  await chrome.storage.sync.set({
    mode: modeEl.value,
    showNotification: noteEl.checked,
  });
  flash();
}

modeEl.addEventListener("change", save);
noteEl.addEventListener("change", save);
load();
