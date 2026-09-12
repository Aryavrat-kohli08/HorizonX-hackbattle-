# Privacy Nutrition — Chrome MV3 MVP

A hackathon-ready browser extension that makes website tracking visible in real time.

## What it does

- Observes network requests with `chrome.webRequest`.
- Matches requests against a small bundled tracker database.
- Distinguishes known trackers from generic third-party requests.
- Instruments canvas/WebGL APIs to surface possible fingerprinting.
- Surfaces a heuristic WebRTC IP-exposure signal.
- Surfaces an ETag persistence signal.
- Calculates an explainable 0–100 Privacy Score and A–F grade.
- Displays a live activity feed and "Who's Watching" company list.
- Does **not** block requests.

## Project structure

```text
privacy-nutrition-extension/
├── manifest.json
├── service-worker.js
├── content-script.js
├── page-instrumentation.js
├── popup.html
├── popup.css
├── popup.js
├── options.html
├── README.md
├── data/
│   └── trackers.js
└── lib/
    ├── domains.js
    └── scoring.js
```

## Load it in Chrome

1. Save/extract this folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `privacy-nutrition-extension` folder.
6. Open a news/e-commerce site.
7. Click the extension icon.

## Recommended demo

Use a site with substantial third-party activity, then compare it with a relatively clean site.

Watch the popup while refreshing:
- tracker count rises
- the live feed fills
- companies appear
- the score decreases when unique tracker/signal events are observed

## MV3 implementation notes

This MVP uses `webRequest` for **observation**, not request blocking. `declarativeNetRequest` is not required for the core visibility demo.

The page instrumentation is declared in the `MAIN` world so prototype wrappers can observe page JavaScript calls. It forwards only small, non-sensitive signal objects back to the isolated content script through a DOM event.

## Production hardening

Before shipping publicly:

- Replace the tiny tracker list with a maintained, properly licensed dataset.
- Add automated tests for tracker matching and score calculations.
- Add robust public-suffix handling instead of the simple last-two-label heuristic.
- Review Chrome permission minimization.
- Add allowlists/ignore rules for first-party services.
- Reduce duplicate fingerprinting signals with per-page deduplication.
- Treat WebRTC and ETag results explicitly as "possible signals", not proof.
- Add CSP/security review for the extension UI.
- Add an attribution/licensing page for any third-party filter lists.