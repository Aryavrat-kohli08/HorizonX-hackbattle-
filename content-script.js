(() => {
  function forward(signal) {
    chrome.runtime.sendMessage({
      type: "PAGE_SIGNAL",
      signal
    }).catch(() => {});
  }

  // Existing page instrumentation
  window.addEventListener("privacy-nutrition-signal", (event) => {
    if (event.source !== window) return;
    if (!event.detail || typeof event.detail !== "object") return;

    forward(event.detail);
  });

  // Fingerprint detector relay
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const data = event.data;

    if (!data || data.source !== "fingerprint-detector") return;
    if (!data.payload || typeof data.payload !== "object") return;

    forward(data.payload);
  });

  chrome.runtime.sendMessage({ type: "GET_STATE" }).catch(() => {});
})();