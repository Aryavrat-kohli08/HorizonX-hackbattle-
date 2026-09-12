(() => {
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

  // Canvas fingerprinting signal.
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    emit({
      type: "fingerprinting",
      signal: "canvas",
      detail: "Canvas.toDataURL() was called."
    });
    return originalToDataURL.apply(this, args);
  };

  const originalGetImageData =
    CanvasRenderingContext2D.prototype.getImageData;

  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    emit({
      type: "fingerprinting",
      signal: "canvas",
      detail: "Canvas pixel data was read."
    });
    return originalGetImageData.apply(this, args);
  };

  // WebGL fingerprinting signal.
  const originalGetParameter =
    WebGLRenderingContext.prototype.getParameter;

  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    const fingerprintParams = new Set([
      0x1F00, // VENDOR
      0x1F01, // RENDERER
      0x1F02, // VERSION
      0x8B8C, // SHADING_LANGUAGE_VERSION
      0x0D33  // MAX_TEXTURE_SIZE
    ]);

    if (fingerprintParams.has(parameter)) {
      emit({
        type: "fingerprinting",
        signal: "webgl",
        detail: "WebGL hardware/renderer information was queried."
      });
    }

    return originalGetParameter.call(this, parameter);
  };

  // WebRTC signal: report candidate strings that visibly contain an IP.
  const OriginalPC = window.RTCPeerConnection;
  if (OriginalPC) {
    window.RTCPeerConnection = function(...args) {
      const pc = new OriginalPC(...args);

      pc.addEventListener("icecandidate", (event) => {
        const candidate = event.candidate?.candidate || "";
        const ipMatch = candidate.match(
          /(?:^| )((?:\d{1,3}\.){3}\d{1,3})(?: |$)/
        );

        if (ipMatch) {
          emit({
            type: "webrtc",
            signal: "candidate-ip",
            detail: "A WebRTC ICE candidate exposed an IP-like address."
          });
        }
      });

      return pc;
    };

    window.RTCPeerConnection.prototype = OriginalPC.prototype;
  }
})();