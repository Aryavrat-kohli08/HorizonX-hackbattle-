export function calculateScore(events) {
  let score = 100;
  const seenTrackers = new Set();
  const seenSignals = new Set();

  // Persistence (ETag) signals scale with however many distinct third-party
  // hosts a page happens to load — unlike trackers (finite curated list) or
  // fingerprinting (finite technique set), this has no natural ceiling. Cap
  // its total contribution so a very third-party-heavy page can't zero out
  // the score on this signal alone; it's still weak/heuristic evidence per
  // the project's own README notes.
  const MAX_PERSISTENCE_PENALTY = 20;
  let persistencePenalty = 0;

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
      const key = `${event.type}::${event.signal}`;
      if (seenSignals.has(key)) continue;
      seenSignals.add(key);

      if (event.type === "fingerprinting") {
        score -= event.signal === "canvas" ? 10 : 7;
      } else {
        score -= 15;
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

  score -= Math.min(persistencePenalty, MAX_PERSISTENCE_PENALTY);

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