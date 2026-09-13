import { TRACKERS } from "./data/trackers.js";
import { calculateScore, grade } from "./lib/scoring.js";
import { isThirdParty, matchesDomain } from "./lib/domains.js";

const MAX_EVENTS = 250;
const tabs = new Map();
const etagSeen = new Map();

// ---------------------------------------------------------------------
// Protection mode: "detect" (default, observe + score only) or "block"
// (actually stop trackers/ETag persistence at the network layer, and
// poison/strip fingerprinting + WebRTC signals in the page).
// ---------------------------------------------------------------------
let protectionMode = "detect";

const TRACKER_RULE_ID_START = 1000; // reserved ID range for tracker block rules
const ETAG_STRIP_RULE_ID = 1;       // reserved ID for the ETag-stripping rule

function buildTrackerBlockRules() {
  return Object.keys(TRACKERS).map((domain, i) => ({
    id: TRACKER_RULE_ID_START + i,
    priority: 1,
    action: { type: "block" },
    condition: {
      requestDomains: [domain],
      domainType: "thirdParty",
      resourceTypes: [
        "script", "xmlhttprequest", "image", "sub_frame",
        "ping", "media", "font", "other"
      ]
    }
  }));
}

function buildEtagStripRule() {
  return {
    id: ETAG_STRIP_RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [{ header: "etag", operation: "remove" }]
    },
    condition: {
      domainType: "thirdParty",
      resourceTypes: [
        "script", "xmlhttprequest", "image", "sub_frame",
        "ping", "media", "font", "other"
      ]
    }
  };
}

async function applyProtectionMode(mode) {
  protectionMode = mode;

  const trackerRules = buildTrackerBlockRules();
  const trackerRuleIds = trackerRules.map(r => r.id);

  if (mode === "block") {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [...trackerRuleIds, ETAG_STRIP_RULE_ID],
      addRules: [...trackerRules, buildEtagStripRule()]
    });
  } else {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [...trackerRuleIds, ETAG_STRIP_RULE_ID],
      addRules: []
    });
  }

  // Let every open tab's content script know, so canvas/WebGL/WebRTC
  // poisoning in page-instrumentation.js turns on or off to match.
  const allTabs = await chrome.tabs.query({});
  for (const tab of allTabs) {
    chrome.tabs.sendMessage(tab.id, { type: "PROTECTION_MODE_CHANGED", mode }).catch(() => {});
  }
}

// Restore saved mode on startup (service workers restart often in MV3).
chrome.storage.local.get(["protectionMode"]).then(({ protectionMode: saved }) => {
  applyProtectionMode(saved === "block" ? "block" : "detect");
});

// Live "Blocked" counter. onRuleMatchedDebug only fires for unpacked
// (developer-mode) extensions — exactly our hackathon demo setup.
try {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const tabId = info.request.tabId;
    if (tabId < 0) return;
    const state = getState(tabId);
    state.blockedCount = (state.blockedCount || 0) + 1;
    chrome.runtime.sendMessage({
      type: "STATE_UPDATED",
      tabId,
      state: serializeState(state)
    }).catch(() => {});
  });
} catch {
  // onRuleMatchedDebug unavailable (e.g. packed/store build) — safe to skip.
}

function getState(tabId) {
  if (!tabs.has(tabId)) {
    tabs.set(tabId, {
      tabId,
      url: "",
      host: "",
      events: [],
      score: 100,
      grade: "A",
      blockedCount: 0
    });
  }
  return tabs.get(tabId);
}

function addEvent(tabId, event) {
  const state = getState(tabId);
  state.events.push({
    ...event,
    id: crypto.randomUUID(),
    timestamp: Date.now()
  });

  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }

  state.score = calculateScore(state.events);
  state.grade = grade(state.score);

  chrome.runtime.sendMessage({
    type: "STATE_UPDATED",
    tabId,
    event: state.events.at(-1),
    state: serializeState(state)
  }).catch(() => {});
}

function serializeState(state) {
  return {
    tabId: state.tabId,
    url: state.url,
    host: state.host,
    score: state.score,
    grade: state.grade,
    events: state.events.slice(-100),
    blockedCount: state.blockedCount || 0,
    protectionMode
  };
}

function getTracker(hostname) {
  for (const [domain, meta] of Object.entries(TRACKERS)) {
    if (matchesDomain(hostname, domain)) return { domain, ...meta };
  }
  return null;
}

function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const target = safeUrl(details.url);
    if (!target) return;

    const state = getState(details.tabId);
    const page = safeUrl(state.url);
    if (!page) return;

    const tracker = getTracker(target.hostname);
    const thirdParty = isThirdParty(page.hostname, target.hostname);

    // Even in "block" mode, DNR cancels the request at the network layer —
    // this listener still fires (it's purely observational), so tracker
    // events keep showing up in the feed with an explicit "blocked" flag.
    if (tracker) {
      addEvent(details.tabId, {
        type: "tracker",
        domain: tracker.domain,
        company: tracker.company,
        category: tracker.category,
        weight: tracker.weight,
        requestType: details.type,
        thirdParty,
        blocked: protectionMode === "block"
      });
      return;
    }

    if (thirdParty) {
      addEvent(details.tabId, {
        type: "third-party",
        domain: target.hostname,
        category: "Third-party request",
        requestType: details.type
      });
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const target = safeUrl(details.url);
    if (!target) return;

    const state = getState(details.tabId);
    const page = safeUrl(state.url);
    if (!page) return;

    // First-party ETags (your own CDN caching static assets) are normal
    // HTTP behavior, not tracking. Only third-party ETags are a
    // meaningful persistence signal.
    if (!isThirdParty(page.hostname, target.hostname)) return;

    // In "block" mode our DNR rule already stripped the ETag header before
    // it got here, so this will correctly stop firing — that's the point.
    const etag = details.responseHeaders?.find(
      h => h.name.toLowerCase() === "etag"
    );

    if (etag?.value) {
      etagSeen.set(details.tabId, etag.value);
      addEvent(details.tabId, {
        type: "persistence",
        signal: "etag",
        domain: target.hostname,
        category: "ETag persistence signal",
        detail: "Response included an ETag that can participate in cache-based identification."
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    tabs.set(tabId, {
      tabId,
      url: tab.url || "",
      host: safeUrl(tab.url || "")?.hostname || "",
      events: [],
      score: 100,
      grade: "A",
      blockedCount: 0
    });
  } else if (tab.url) {
    const state = getState(tabId);
    state.url = tab.url;
    state.host = safeUrl(tab.url)?.hostname || "";
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
  etagSeen.delete(tabId);
});

// TEMP TESTING HOOK — used by test-sites.mjs to pull state for automated
// site testing. Safe to leave in for the hackathon; remove before any
// public/production build.
globalThis.__debugGetState = (tabId) => serializeState(getState(tabId));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? message.tabId;

  if (message.type === "GET_STATE") {
    sendResponse(serializeState(getState(tabId)));
    return true;
  }

  if (message.type === "PAGE_SIGNAL" && tabId >= 0) {
    const allowed = ["fingerprinting", "webrtc", "persistence"];
    if (allowed.includes(message.signal?.type)) {
      addEvent(tabId, message.signal);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SET_PROTECTION_MODE") {
    const mode = message.mode === "block" ? "block" : "detect";
    chrome.storage.local.set({ protectionMode: mode });
    applyProtectionMode(mode).then(() => sendResponse({ ok: true, mode }));
    return true;
  }

  if (message.type === "RESET_STATE" && tabId >= 0) {
    tabs.set(tabId, {
      tabId,
      url: message.url || "",
      host: safeUrl(message.url || "")?.hostname || "",
      events: [],
      score: 100,
      grade: "A",
      blockedCount: 0
    });
    sendResponse({ ok: true });
    return true;
  }
});
