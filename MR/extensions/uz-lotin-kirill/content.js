(() => {
  let ctrlDown = false;
  let shiftDown = false;
  let extraKey = false;
  let armed = false;

  function getSelectedText() {
    const ae = document.activeElement;
    if (ae && (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT") && typeof ae.selectionStart === "number") {
      if (ae.selectionEnd > ae.selectionStart) {
        return ae.value.slice(ae.selectionStart, ae.selectionEnd);
      }
    }
    const sel = window.getSelection && window.getSelection();
    return sel ? sel.toString() : "";
  }

  function copyText(text) {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    el.remove();
    if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => false
      );
    }
    return Promise.resolve(ok);
  }

  async function convertNow() {
    const text = getSelectedText();
    if (!text) return;
    const settings = await chrome.storage.sync.get({ mode: "replace" });
    const converted = UZ_CONVERTER.convert(text, settings.mode || "replace");
    if (!converted) return;
    const ok = await copyText(converted);
    chrome.runtime.sendMessage({
      type: "COPIED",
      ok,
      converted,
    });
  }

  function isExtraKey(e) {
    return e.key !== "Control" && e.key !== "Shift" && e.key !== "Meta" && e.key !== "Alt";
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "COPY_TEXT" && message.text) {
      copyText(message.text).then((ok) => sendResponse({ ok }));
      return true;
    }
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Control") ctrlDown = true;
      if (e.key === "Shift") shiftDown = true;
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        armed = true;
        if (isExtraKey(e)) extraKey = true;
      }
    },
    true
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "Control" || e.key === "Shift") {
        if (armed && !extraKey && getSelectedText()) {
          e.preventDefault();
          convertNow();
        }
        armed = false;
        extraKey = false;
      }
      if (e.key === "Control") ctrlDown = false;
      if (e.key === "Shift") shiftDown = false;
      if (!e.ctrlKey && !e.shiftKey) {
        armed = false;
        extraKey = false;
      }
    },
    true
  );

  window.addEventListener("blur", () => {
    ctrlDown = false;
    shiftDown = false;
    extraKey = false;
    armed = false;
  });
})();
