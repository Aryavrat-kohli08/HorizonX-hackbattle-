import { TRACKERS } from "./data/trackers.js";
import { calculateScore, grade } from "./lib/scoring.js";
import { isThirdParty, matchesDomain } from "./lib/domains.js";

const MAX_EVENTS = 250;
const tabs = new Map();
const etagSeen = new Map();

function getState(tabId) {
  if (!tabs.has(tabId)) {
    tabs.set(tabId, {
      tabId,
      url: "",
      host: "",
      events: [],
      score: 100,
      grade: "A"
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
    events: state.events.slice(-100)
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

    if (tracker) {
      addEvent(details.tabId, {
        type: "tracker",
        domain: tracker.domain,
        company: tracker.company,
        category: tracker.category,
        weight: tracker.weight,
        requestType: details.type,
        thirdParty
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
  ["responseHeaders"]
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    tabs.set(tabId, {
      tabId,
      url: tab.url || "",
      host: safeUrl(tab.url || "")?.hostname || "",
      events: [],
      score: 100,
      grade: "A"
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

  if (message.type === "RESET_STATE" && tabId >= 0) {
    tabs.set(tabId, {
      tabId,
      url: message.url || "",
      host: safeUrl(message.url || "")?.hostname || "",
      events: [],
      score: 100,
      grade: "A"
    });
    sendResponse({ ok: true });
    return true;
  }
});
chrome.runtime.onMessage.addListener((message) => {
  console.log("[PN] Received event:", message);
});