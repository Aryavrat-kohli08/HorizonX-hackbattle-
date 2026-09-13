console.log("%c[Fingerprint Detector] Loaded on: " + location.hostname, "color: lime; font-weight: bold;");

// This function now builds the shared event shape AND sends it to the background script
function logEvent(technique, extra = {}) {
  const event = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: technique === "localStorage" ? "persistence" : "fingerprinting",
    domain: location.hostname,
    company: null,
    category: "Fingerprinting",
    technique: technique,
    thirdParty: false,
    severity: technique === "fonts" ? 6 : 10,
    detail: `Possible ${technique} fingerprinting signal detected`,
    ...extra
  };

    console.log("%c🚨 FINGERPRINT DETECTED: " + technique, "color: red; font-weight: bold;", event);

  // Send to relay script (chrome.runtime isn't available in MAIN world)
  window.postMessage({ source: "fingerprint-detector", payload: event }, "*");

}

// 1. Canvas fingerprinting detection
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function (...args) {
  logEvent("canvas");
  return origToDataURL.apply(this, args);
};

const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
CanvasRenderingContext2D.prototype.getImageData = function (...args) {
  logEvent("canvas");
  return origGetImageData.apply(this, args);
};

// 2. WebRTC IP leak detection
if (window.RTCPeerConnection) {
  const OrigRTC = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...args) {
    logEvent("webrtc");
    return new OrigRTC(...args);
  };
}

// 3. Font enumeration detection
const origMeasureText = CanvasRenderingContext2D.prototype.measureText;
let measureCount = 0;
CanvasRenderingContext2D.prototype.measureText = function (...args) {
  measureCount++;
  if (measureCount === 20) {
    logEvent("fonts");
  }
  return origMeasureText.apply(this, args);
};

// 4. Suspicious localStorage writes
const origSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (key, value) {
  if (typeof value === "string" && value.length > 20 && /^[a-zA-Z0-9+/=]+$/.test(value)) {
    logEvent("localStorage", { detail: `Suspicious localStorage ID: ${key}` });
  }
  return origSetItem.apply(this, arguments);
};