let activeTabId = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function scoreClass(score) {
  if (score >= 80) return "";
  if (score >= 60) return "warn";
  return "bad";
}
function calculateScoreBreakdown(events) {
  const seenTrackers = new Set();
  const seenSignals = new Set();

  let trackerPenalty = 0;
  let fingerprintPenalty = 0;
  let webrtcPenalty = 0;
  let persistencePenalty = 0;

  for (const event of events) {
    if (event.type === "tracker") {
      if (seenTrackers.has(event.domain)) continue;

      seenTrackers.add(event.domain);
      trackerPenalty += event.weight ?? 4;
      continue;
    }

    if (
  event.type === "fingerprinting" ||
  event.type === "webrtc" ||
  event.signal === "webrtc"
) {
      const key = `${event.type}::${event.signal}`;

      if (seenSignals.has(key)) continue;
      seenSignals.add(key);

      if (event.type === "fingerprinting") {
        fingerprintPenalty += event.signal === "canvas" ? 10 : 7;
      } else {
        webrtcPenalty += 15;
      }

      continue;
    }

    if (event.type === "persistence") {
      const key = `persistence::${event.domain}::${event.signal}`;

      if (seenSignals.has(key)) continue;
      seenSignals.add(key);

      persistencePenalty += 10;
    }
  }

  persistencePenalty = Math.min(persistencePenalty, 20);

  return {
    trackerPenalty,
    fingerprintPenalty,
    webrtcPenalty,
    persistencePenalty,
    total:
      trackerPenalty +
      fingerprintPenalty +
      webrtcPenalty +
      persistencePenalty
  };
}
function render(state) {
  $("host").textContent = state.host || "This page";
  $("score").textContent = state.score;
  $("grade").textContent = state.grade;

  const ring = $("scoreRing");
  ring.className = "score-ring " + scoreClass(state.score);

  const events = state.events || [];
  const trackers = events.filter(e => e.type === "tracker");
  const fingerprints = events.filter(e => e.type === "fingerprinting");
  const etags = events.filter(e => e.type === "persistence" && e.signal === "etag");
  const thirdParty = events.filter(e =>
    e.type === "third-party" || e.type === "tracker"
  );
  const breakdown = calculateScoreBreakdown(events);

$("trackerPenalty").textContent =
  `−${breakdown.trackerPenalty}`;

$("fingerprintPenalty").textContent =
  `−${breakdown.fingerprintPenalty}`;

$("webrtcPenalty").textContent =
  `−${breakdown.webrtcPenalty}`;

$("persistencePenalty").textContent =
  `−${breakdown.persistencePenalty}`;

$("totalPenalty").textContent =
  `−${breakdown.total}`;

  $("trackerCount").textContent =
    new Set(trackers.map(e => e.domain)).size;
  $("fingerprintCount").textContent =
    new Set(fingerprints.map(e => e.signal)).size;
  $("etagCount").textContent =
    new Set(etags.map(e => e.domain)).size;
  $("thirdPartyCount").textContent =
    new Set(thirdParty.map(e => e.domain)).size;
  $("blockedCount").textContent = state.blockedCount || 0;

  const isBlocking = state.protectionMode === "block";
  $("protectionToggle").checked = isBlocking;
  $("protectionSub").textContent = isBlocking
    ? "Blocking trackers, ETags, and poisoning fingerprints"
    : "Detect only — nothing is blocked";
  $("footerNote").textContent = isBlocking
    ? "Protection is on. Trackers and ETags are blocked; fingerprints are poisoned."
    : "Detection is heuristic. No requests are blocked.";

  $("feed").innerHTML = events.slice(-35).reverse().map(e => `
    <div class="event">
      <div class="event-top">
        <div class="domain">${escapeHtml(e.domain || e.signal || "Page signal")}</div>
        <div class="badge">${e.blocked ? "🛡 Blocked · " : ""}${escapeHtml(e.category || e.type)}</div>
      </div>
      ${e.company ? `<div class="detail">${escapeHtml(e.company)}</div>` : ""}
      ${e.detail ? `<div class="detail">${escapeHtml(e.detail)}</div>` : ""}
    </div>
  `).join("") || `<div class="event"><div class="detail">Waiting for activity…</div></div>`;

  const companies = {};
  trackers.forEach(e => {
    if (!e.company) return;
    companies[e.company] = (companies[e.company] || 0) + 1;
  });

  $("companies").innerHTML = Object.entries(companies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([company, count]) => `
      <div class="company">
        <strong>${escapeHtml(company)}</strong>
        <span>${count} signal${count === 1 ? "" : "s"}</span>
      </div>
    `).join("") || `<div class="company"><span>No known tracker companies yet.</span></div>`;
}

async function load() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  activeTabId = tab?.id;
  if (!activeTabId) return;

  chrome.runtime.sendMessage({
    type: "GET_STATE",
    tabId: activeTabId
  }, render);
}

$("reset").addEventListener("click", async () => {
  if (!activeTabId) return;

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  chrome.runtime.sendMessage({
    type: "RESET_STATE",
    tabId: activeTabId,
    url: tab?.url || ""
  }, load);
});

$("protectionToggle").addEventListener("change", (e) => {
  chrome.runtime.sendMessage({
    type: "SET_PROTECTION_MODE",
    mode: e.target.checked ? "block" : "detect"
  }, load);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE_UPDATED" &&
      message.tabId === activeTabId) {
    render(message.state);
  }
});

load();