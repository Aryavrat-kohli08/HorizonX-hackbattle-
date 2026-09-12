export function calculateScore(events) {
  let score = 100;
  const seenTrackers = new Set();
  const seenSignals = new Set();

  for (const event of events) {
    if (event.type === "tracker") {
      if (seenTrackers.has(event.domain)) continue;
      seenTrackers.add(event.domain);
      score -= event.weight ?? 4;
      continue;
    }

    // Fingerprinting/webrtc events are scoped to a single tab/page and carry
    // no `domain` field, so dedupe by technique (signal) only. Persistence
    // events (e.g. ETag) do carry a domain, so include it in the key to keep
    // per-domain signals distinct as more techniques (e.g. localStorage
    // resurrection) are added.
    if (event.type === "fingerprinting" || event.type === "webrtc") {
      const signal = event.technique ?? event.signal;
      const key = `${event.type}::${signal}`;
      if (seenSignals.has(key)) continue;
      seenSignals.add(key);

      if (event.type === "fingerprinting") {
        score -= signal === "canvas" ? 10 : 7;
      } else {
        score -= 15;
      }
      continue;
    }

    if (event.type === "persistence") {
      const key = `persistence::${event.domain}::${event.signal}`;
      if (seenSignals.has(key)) continue;
      seenSignals.add(key);
      score -= 10;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function gradeLabel(score) {
  const g = grade(score);
  return `${g} · ${score}/100`;
}