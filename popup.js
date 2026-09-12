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
    new Set(fingerprints.map(e => e.technique)).size;
  $("etagCount").textContent =
  events.filter(e => e.signal === "etag").length;
  $("thirdPartyCount").textContent =
    new Set(thirdParty.map(e => e.domain)).size;

  $("feed").innerHTML = events.slice(-35).reverse().map(e => `
    <div class="event">
      <div class="event-top">
        <div class="domain">${escapeHtml(e.domain || e.signal || "Page signal")}</div>
        <div class="badge">${escapeHtml(e.category || e.type)}</div>
      </div>
      ${e.company ? `<div class="detail">${escapeHtml(e.company)}</div>` : ""}
      ${e.signal === "etag"
  ? `<div class="detail">
      <strong>🏷️ Persistent Tracking</strong><br>
      ETag detected — this can help a site recognize your browser across visits.<br><br>
      <strong>Potentially exposed:</strong><br>
      • Persistent browser identifier<br>
      • Visit continuity<br><br>
      <strong>Why it matters:</strong><br>
      An identifier may help recognize your browser when you return.
    </div>`
  : e.technique === "canvas"
    ? `<div class="detail">
        <strong>🎨 Canvas Fingerprinting</strong><br>
        This site used browser graphics features in a way that can contribute to identifying your device or browser.<br><br>
        <strong>Potentially exposed:</strong><br>
        • Browser/device characteristics<br>
        • Graphics rendering characteristics<br>
        • Fingerprint information<br><br>
        <strong>Why it matters:</strong><br>
        These characteristics can be combined to help distinguish your browser from others.
      </div>`
    : e.technique === "webrtc"
  ? `<div class="detail">
      <strong>🌐 WebRTC Network Signal</strong><br>
      This site used WebRTC, a browser feature that can reveal network-related information depending on how it is used.<br><br>
      <strong>Potentially exposed:</strong><br>
      • Network/IP-related information<br>
      • Connection characteristics<br><br>
      <strong>Why it matters:</strong><br>
      WebRTC activity can provide network information that may contribute to identifying or profiling a user.
    </div>`
    : e.technique === "fonts"
  ? `<div class="detail">
      <strong>🔤 Font Fingerprinting</strong><br>
      This site repeatedly measured text rendering in the browser, which can be used as a signal for identifying browser or software characteristics.<br><br>
      <strong>Potentially exposed:</strong><br>
      • Installed font characteristics<br>
      • Browser/software characteristics<br>
      • Fingerprint information<br><br>
      <strong>Why it matters:</strong><br>
      Font characteristics can contribute to a fingerprint that helps distinguish your browser from others.
    </div>` 
    : e.technique === "localStorage"
  ? `<div class="detail">
      <strong>🆔 Persistent Identifier Signal</strong><br>
      This site stored a long identifier-like value in local storage that can persist across visits.<br><br>
      <strong>Potentially exposed:</strong><br>
      • Persistent browser identifier<br>
      • Visit/session association<br>
      • Return-visit recognition<br><br>
      <strong>Why it matters:</strong><br>
      A persistent identifier can help recognize the same browser across visits.
    </div>`

     : e.detail
      ? `<div class="detail">${escapeHtml(e.detail)}</div>`
      : ""}
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