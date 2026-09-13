(() => {
  // "detect" (default, safe) or "block" (poison/strip signals too).
  // MAIN world has no chrome.* API access, so content-script.js relays
  // this to us over a DOM CustomEvent instead.
  let mode = "detect";
  window.addEventListener("privacy-nutrition-mode", (event) => {
    if (event.detail && (event.detail.mode === "block" || event.detail.mode === "detect")) {
      mode = event.detail.mode;
    }
  });

  const emit = (signal) => {
    window.dispatchEvent(
      new CustomEvent("privacy-nutrition-signal", {
        detail: {
          ...signal,
          source: "page-instrumentation"
        }
      })
    );
  };

  // A per-page-load seed so noise is consistent within one session (the
  // canvas still looks/works normally) but differs between sessions —
  // the same technique Brave/Tor Browser use for canvas poisoning,
  // rather than breaking toDataURL()/getImageData() outright.
  const noiseSeed = Math.floor(Math.random() * 4294967296);
  function seededRandom(x, y) {
    let h = (noiseSeed ^ (x * 374761393) ^ (y * 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  const originalPutImageData = CanvasRenderingContext2D.prototype.putImageData;

  function poisonCanvas(ctx, canvas) {
    try {
      const w = canvas.width, h = canvas.height;
      if (!w || !h) return;
      const imgData = originalGetImageData.call(ctx, 0, 0, w, h);
      const data = imgData.data;
      // Flip the least-significant bit on a small, deterministic subset
      // of pixels — invisible to the eye, but changes the pixel hash
      // that fingerprinting scripts rely on.
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const i = (y * w + x) * 4;
          if (seededRandom(x, y) > 0.5) {
            data[i] = data[i] ^ 1;
          }
        }
      }
      originalPutImageData.call(ctx, imgData, 0, 0);
    } catch {
      // Cross-origin-tainted canvases throw on getImageData — nothing to
      // poison there anyway (the page couldn't read it either).
    }
  }

  // Canvas fingerprinting.
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    emit({ type: "fingerprinting", signal: "canvas", detail: "Canvas.toDataURL() was called.", blocked: mode === "block" });
    if (mode === "block") {
      const ctx = this.getContext && this.getContext("2d");
      if (ctx) poisonCanvas(ctx, this);
    }
    return originalToDataURL.apply(this, args);
  };

  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    emit({ type: "fingerprinting", signal: "canvas", detail: "Canvas pixel data was read.", blocked: mode === "block" });
    if (mode === "block") {
      poisonCanvas(this, this.canvas);
    }
    return originalGetImageData.apply(this, args);
  };

  // WebGL fingerprinting — spoofed with generic values when blocking,
  // since these are just descriptive strings (safe to fake outright,
  // unlike canvas pixels which real rendering may depend on).
  const SPOOFED_WEBGL = {
    0x1F00: "Generic Renderer",       // VENDOR
    0x1F01: "Generic GL Renderer",    // RENDERER
    0x1F02: "WebGL 1.0",              // VERSION
    0x8B8C: "WebGL GLSL ES 1.0",      // SHADING_LANGUAGE_VERSION
  };

  const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    const fingerprintParams = new Set([0x1F00, 0x1F01, 0x1F02, 0x8B8C, 0x0D33]);

    if (fingerprintParams.has(parameter)) {
      emit({ type: "fingerprinting", signal: "webgl", detail: "WebGL hardware/renderer information was queried.", blocked: mode === "block" && parameter in SPOOFED_WEBGL });
      if (mode === "block" && parameter in SPOOFED_WEBGL) {
        return SPOOFED_WEBGL[parameter];
      }
    }

    return originalGetParameter.call(this, parameter);
  };

  // Font enumeration — detect only. Blocking measureText() outright
  // breaks legitimate text layout on many sites; the false-positive
  // cost of blocking here is worse than the tracking risk of not.
  const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
  let measureCount = 0;
  CanvasRenderingContext2D.prototype.measureText = function(...args) {
    measureCount++;
    if (measureCount === 10) {
      emit({ type: "fingerprinting", signal: "fonts", detail: "Repeated measureText() calls suggest font enumeration." });
    }
    return originalMeasureText.apply(this, args);
  };

  // Suspicious localStorage writes — detect only, same reasoning as
  // fonts: blocking arbitrary localStorage writes risks breaking real
  // login/session state, which is worse than the tracking risk.
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (
      typeof value === "string" &&
      value.length > 20 &&
      /^[a-zA-Z0-9+/=]+$/.test(value)
    ) {
      emit({ type: "persistence", signal: "localStorage", detail: `Suspicious localStorage ID written for key "${key}".` });
    }
    return originalSetItem.apply(this, arguments);
  };

  // WebRTC IP leak — strip the raw local IP out of ICE candidates before
  // the page's own handlers see them, without breaking the connection.
  function sanitizeCandidate(candidate) {
    if (!candidate) return candidate;
    const ipRegex = /(?:^| )((?:\d{1,3}\.){3}\d{1,3})(?: |$)/;
    if (!ipRegex.test(candidate.candidate || "")) return candidate;
    return new RTCIceCandidate({
      ...candidate.toJSON ? candidate.toJSON() : candidate,
      candidate: (candidate.candidate || "").replace(ipRegex, " 0.0.0.0 ")
    });
  }

  const OriginalPC = window.RTCPeerConnection;
  if (OriginalPC) {
    window.RTCPeerConnection = function(...args) {
      const pc = new OriginalPC(...args);
      const origAddEventListener = pc.addEventListener.bind(pc);

      // Our own detection listener always sees the real candidate.
      origAddEventListener("icecandidate", (event) => {
        const candidateStr = event.candidate?.candidate || "";
        const ipMatch = candidateStr.match(/(?:^| )((?:\d{1,3}\.){3}\d{1,3})(?: |$)/);
        if (ipMatch) {
          emit({ type: "webrtc", signal: "candidate-ip", detail: "A WebRTC ICE candidate exposed an IP-like address.", blocked: mode === "block" });
        }
      });

      if (mode === "block") {
        // Sanitize candidates for any listener the PAGE itself registers.
        pc.addEventListener = function(type, listener, options) {
          if (type === "icecandidate" && typeof listener === "function") {
            const wrapped = (event) => {
              try {
                const sanitized = Object.create(event, {
                  candidate: { value: sanitizeCandidate(event.candidate), enumerable: true }
                });
                listener.call(pc, sanitized);
              } catch {
                listener.call(pc, event);
              }
            };
            return origAddEventListener(type, wrapped, options);
          }
          return origAddEventListener(type, listener, options);
        };

        let onIceCandidateHandler = null;
        Object.defineProperty(pc, "onicecandidate", {
          configurable: true,
          get() { return onIceCandidateHandler; },
          set(fn) {
            onIceCandidateHandler = fn;
            origAddEventListener("icecandidate", (event) => {
              if (typeof fn !== "function") return;
              try {
                const sanitized = Object.create(event, {
                  candidate: { value: sanitizeCandidate(event.candidate), enumerable: true }
                });
                fn.call(pc, sanitized);
              } catch {
                fn.call(pc, event);
              }
            });
          }
        });
      }

      return pc;
    };

    window.RTCPeerConnection.prototype = OriginalPC.prototype;
  }
})();
