const input = document.getElementById("input");
const output = document.getElementById("output");
const status = document.getElementById("status");
const copyBtn = document.getElementById("copyBtn");
const swapBtn = document.getElementById("swapBtn");
const openOptions = document.getElementById("openOptions");

const MODE_LABEL = {
  replace: "Replace",
  lat2cyr: "Lotin → Kirill",
  cyr2lat: "Kirill → Lotin",
};

let mode = "replace";

function render() {
  output.value = UZ_CONVERTER.convert(input.value, mode);
}

async function loadMode() {
  const data = await chrome.storage.sync.get({ mode: "replace" });
  mode = data.mode || "replace";
  status.textContent = MODE_LABEL[mode] || "Replace";
  render();
}

input.addEventListener("input", render);

copyBtn.addEventListener("click", async () => {
  const text = output.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Nusxalandi";
    setTimeout(() => {
      copyBtn.textContent = "Nusxalash";
    }, 1200);
  } catch (e) {
    output.select();
    document.execCommand("copy");
  }
});

swapBtn.addEventListener("click", () => {
  input.value = output.value;
  render();
});

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.mode) {
    mode = changes.mode.newValue || "replace";
    status.textContent = MODE_LABEL[mode] || "Replace";
    render();
  }
});

loadMode();
