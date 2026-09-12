# HorizonX-hackbattle-
A real-time browser privacy extension that exposes hidden tracking techniques like canvas fingerprinting, WebRTC IP leaks, font enumeration, and persistent tracking IDs. It visualizes surveillance activity through a live feed and Privacy Score (A-F), making invisible web tracking easy to understand.
# Privacy Nutrition 🥗🔒

> **The Nutrition Label for Websites**

You can see the ingredients in your food. But what are the ingredients in a website?

**Privacy Nutrition** is a Chrome extension that makes invisible web tracking visible in real time. It observes third-party activity, known trackers, fingerprinting signals, and persistence techniques, then turns that activity into a simple **0–100 privacy score**.

**We don't block anything. We give users transparency.**

## 🎯 The Problem

Modern websites can contact many third-party services and use techniques that are difficult for ordinary users to understand.

Users usually see a webpage, but not the privacy activity happening behind it.

Privacy Nutrition answers:

- Who is watching?
- What tracking techniques are being used?
- How much privacy activity is happening?
- Can I understand it without reading network logs?

## 💡 What We Built

Privacy Nutrition is a Manifest V3 Chrome extension with a live popup dashboard.

It detects and visualizes:

- **Known trackers** and their associated companies/categories
- **Third-party requests**
- **Possible fingerprinting signals**
- **WebRTC-related signals**
- **Suspicious localStorage persistence**
- **ETag-based persistence signals**
- A simple **privacy score from 0–100**
- A **live activity feed** showing detected events

## ✨ Key Features

### 🔎 Tracker Detection
The extension maintains a list of known tracker domains and associates detected activity with companies and categories such as advertising, analytics, and behavioral analytics.

### 🖐️ Fingerprinting Signals
The extension watches for possible fingerprinting-related activity including:

- Canvas
- WebRTC
- Font enumeration

These are reported as **possible signals**, rather than claiming that a site definitely created a unique fingerprint.

### 💾 Persistence Detection
The extension can surface persistence-related signals such as:

- ETag activity
- Suspicious localStorage usage

These detections are heuristic and are presented as signals rather than proof of malicious behavior.

### 📊 Privacy Score
Detected activity contributes to a simple 0–100 privacy score.

Higher score = better privacy posture.

The score is designed to give users an immediate, understandable summary instead of forcing them to interpret raw technical logs.

### ⚡ Live Activity
The popup updates while the current tab is active, allowing users to see privacy-related events as they occur.

## 🏗️ Architecture

```text
                         Current Website
                               │
                ┌──────────────┴──────────────┐
                │                             │
        Network Requests                Page Activity
                │                             │
        webRequest API             detector.js / page instrumentation
                │                             │
                └──────────────┬──────────────┘
                               │
                         content-script.js
                               │
                               ▼
                       service-worker.js
                               │
                  ┌────────────┴────────────┐
                  │                         │
             Event Storage              Scoring
                  │                         │
                  └────────────┬────────────┘
                               │
                               ▼
                         popup.js
                               │
                               ▼
                    Privacy Nutrition UI
```

### Main Components

| File | Purpose |
|---|---|
| `manifest.json` | Chrome Manifest V3 configuration |
| `service-worker.js` | Network observation, event handling, per-tab state |
| `content-script.js` | Relays page signals to the extension |
| `detector.js` | Detects fingerprinting/persistence signals in the page |
| `page-instrumentation.js` | Page-level instrumentation |
| `popup.html` / `popup.css` | Extension dashboard UI |
| `popup.js` | Live dashboard rendering |
| `lib/scoring.js` | Privacy score calculation |
| `lib/domains.js` | Domain/company classification helpers |
| `data/trackers.js` | Known tracker database |
| `options.html` | Extension options page |

## 🧮 Scoring

The score starts at **100**.

Detected activity can reduce the score according to its type and severity. Repeated tracker/signal events are deduplicated for scoring so that a tracker making many requests does not unfairly destroy the score simply because of request volume.

The scoring system is intended as a **simple communication layer**, not a scientific measurement of privacy.

## 🛠️ Installation

1. Download or clone this repository.
2. Open Chrome and go to:

   `chrome://extensions`

3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the project folder containing `manifest.json`.
6. Open a website in another tab.
7. Click the Privacy Nutrition extension icon.

## 🎬 Demo

A useful demo flow is:

1. Open a content-heavy website.
2. Open the Privacy Nutrition popup.
3. Show the live third-party/tracker activity.
4. Show company attribution for known trackers.
5. Trigger or observe a fingerprinting signal.
6. Show the privacy score and live activity feed.

The goal is to demonstrate the core idea:

> **You can't protect yourself from what you can't see — we made the invisible visible.**

## ⚠️ Limitations

Privacy Nutrition is a hackathon prototype and uses heuristic detection.

- A detected fingerprinting signal does not prove that a site uniquely identified a user.
- ETag/localStorage activity can have legitimate uses and may produce false positives.
- The known tracker database is not exhaustive.
- Network observation identifies observed requests; it does not prove what a third party ultimately does with the data.
- WebRTC and browser-level behavior can vary between websites and Chrome versions.
- The extension focuses on transparency and **does not block requests**.

## 👥 Team

Built as a four-person hackathon project.

- **Extension Core & Request Interception** — MV3 architecture, service worker, network observation, tracker classification, event engine
- **Fingerprinting Detection** — Canvas, WebRTC, font enumeration, persistence-related signals
- **UI / Frontend** — Popup dashboard, live activity, tracker/fingerprint counters, score presentation
- **Integration / Scoring / Demo** — Scoring algorithm, integration, testing, demo flow, and pitch

## 🔐 Privacy Philosophy

Privacy Nutrition is designed around a simple principle:

> **Transparency before control.**

Instead of silently deciding what users should or shouldn't access, the extension helps users understand what is happening behind the webpage.

---

**Privacy Nutrition — The Nutrition Label for Websites.**
