(() => {
  function forward(signal) {
    chrome.runtime.sendMessage({
      type: "PAGE_SIGNAL",
      signal
    }).catch((err) => {
      console.error("[content-script] sendMessage failed:", err);
    });
  }

  function broadcastMode(mode) {
    window.dispatchEvent(
      new CustomEvent("privacy-nutrition-mode", { detail: { mode } })
    );
  }

  window.addEventListener("privacy-nutrition-signal", (event) => {
    if (!event.detail || typeof event.detail !== "object") return;
    forward(event.detail);
  });

  // Tell page-instrumentation.js (MAIN world) whether to poison/block or
  // just detect. MAIN world scripts have no chrome.* access, so this is
  // the only way that information can reach it.
  chrome.storage.local.get(["protectionMode"]).then(({ protectionMode }) => {
    broadcastMode(protectionMode === "block" ? "block" : "detect");
  });

  // Live toggle while the page is already open.
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "PROTECTION_MODE_CHANGED") {
      broadcastMode(message.mode);
    }
  });

  chrome.runtime.sendMessage({ type: "GET_STATE" }).catch(() => {});
})();
