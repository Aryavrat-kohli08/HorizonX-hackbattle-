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

function render(state) {
  $("host").textContent = state.host || "This page";
  $("score").textContent = state.score;
  $("grade").textContent = state.grade;

  const ring = $("scoreRing");
  ring.className = "score-ring " + scoreClass(state.score);

  const events = state.events || [];
  const trackers = events.filter(e => e.type === "tracker");
  const fingerprints = events.filter(e => e.type === "fingerprinting");
  const thirdParty = events.filter(e =>
    e.type === "third-party" || e.type === "tracker"
  );

  $("trackerCount").textContent =
    new Set(trackers.map(e => e.domain)).size;
  $("fingerprintCount").textContent =
    new Set(fingerprints.map(e => e.signal)).size;
  $("thirdPartyCount").textContent =
    new Set(thirdParty.map(e => e.domain)).size;

  $("feed").innerHTML = events.slice(-35).reverse().map(e => `
    <div class="event">
      <div class="event-top">
        <div class="domain">${escapeHtml(e.domain || e.signal || "Page signal")}</div>
        <div class="badge">${escapeHtml(e.category || e.type)}</div>
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

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE_UPDATED" &&
      message.tabId === activeTabId) {
    render(message.state);
  }
});

load();