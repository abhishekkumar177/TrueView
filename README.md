# TrustLens (TrueView Engine)

### The Intelligence Layer for E-Commerce Trust

---

## Overview

TrustLens is a **browser-based AI engine** that analyzes product reviews in real time and computes a **Trust-Adjusted Rating**, helping users make decisions based on **authentic signals instead of manipulated ratings**.

It operates directly on live e-commerce pages (Amazon, Flipkart), requiring **no backend APIs**, ensuring **privacy-first, high-performance analysis**.

---

## Key Capabilities

* Detects fake and low-quality reviews
* Identifies sentiment-rating mismatches
* Classifies reviewers (Real / Dummy / Fake)
* Computes Trust-Adjusted Rating
* Injects real-time UI overlay on product pages

---

## Installation

```bash
1. Download or clone the repository
2. Extract the project → TrueView/
3. Open Chrome → chrome://extensions
4. Enable Developer Mode
5. Click "Load Unpacked"
6. Select the TrueView/ folder
```

Navigate to any **Amazon.in** or **Flipkart** product page to see TrustLens in action.

---

## Project Structure

```
TrueView/
│
├── manifest.json
├── content.js
├── popup.html
│
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
├── src/
│   │
│   ├── adapters/
│   │   ├── platformAdapter.js
│   │   ├── amazonAdapter.js
│   │   ├── flipkartAdapter.js
│   │   └── genericAdapter.js
│   │
│   ├── extraction/
│   │   ├── reviewExtractor.js
│   │   └── ratingExtractor.js
│   │
│   ├── preprocessing/
│   │   └── preprocessor.js
│   │
│   ├── features/
│   │   └── featureEngineer.js
│   │
│   ├── analysis/
│   │   └── sentimentRatingEngine.js
│   │
│   ├── persona/
│   │   ├── userProfileBuilder.js
│   │   └── personaEngine.js
│   │
│   ├── scoring/
│   │   └── scoringEngine.js
│   │
│   ├── trust/
│   │   └── trustEngine.js
│   │
│   └── ui/
│       ├── overlay.js
│       └── overlay.css
```

---

## Architecture Flow

```
DOM → Adapter → Extraction → Preprocessing → Feature Engineering
→ Sentiment Engine → Persona Engine → Scoring → Trust Engine → UI Overlay
```

---

## Core Pipeline (content.js)

The main execution pipeline follows:

1. Wait for page load
2. Detect product page
3. Extract reviews via platform adapter
4. Preprocess text data
5. Generate features
6. Compute sentiment score
7. Build user profiles
8. Classify personas
9. Compute fake score
10. Calculate Trust Rating
11. Render overlay UI

---

## Module Breakdown

### Adapters Layer

Handles platform-specific DOM extraction.

| File                 | Description                  |
| -------------------- | ---------------------------- |
| `platformAdapter.js` | Base class + adapter factory |
| `amazonAdapter.js`   | Full Amazon parsing          |
| `flipkartAdapter.js` | Handles dynamic class names  |
| `genericAdapter.js`  | schema.org fallback          |

---

### Extraction Layer

Responsible for raw data collection.

| File                 | Description                         |
| -------------------- | ----------------------------------- |
| `reviewExtractor.js` | Page validation + review extraction |
| `ratingExtractor.js` | Histogram + rating distribution     |

---

### Preprocessing

Cleans raw review text:

* Lowercasing
* HTML removal
* Whitespace normalization

---

### Feature Engineering

Generates detection signals:

* Blank reviews
* Repetition patterns
* Spam phrases
* Extreme ratings
* Duplicate users

---

### Sentiment Engine

* Converts text → sentiment polarity
* Maps sentiment → implied rating
* Calculates mismatch score

---

### Persona Engine

Groups users and classifies them:

| Persona | Description               |
| ------- | ------------------------- |
| Real    | Normal behavior           |
| Dummy   | Low activity / suspicious |
| Fake    | Bot-like / burst behavior |

Signals include:

* Review frequency
* Variance in ratings
* Sentiment mismatch patterns

---

### Scoring Engine

Generates:

* `fakeScore` (0 → 1)
* Label: Real / Suspicious / Fake

Based on:

* Feature signals
* Persona classification
* Behavioral anomalies

---

### Trust Engine

Final Trust Rating is computed using:

```
Trust Score = fakeScore + 0.4 × mismatchScore
```

Then applied as a weighted adjustment over ratings.

---

### UI Overlay

* Injected dynamically into page
* 4-tab dashboard:

| Tab       | Description           |
| --------- | --------------------- |
| Overview  | Trust Score + Fake %  |
| Sentiment | Polarity distribution |
| Personas  | User classification   |
| Reviews   | Flagged vs clean      |

---

## Popup Interface

Displays:

* Extension status
* Cached Trust results
* Summary insights

---

## What Was Fixed

The original project had **critical missing dependencies**:

* `src/` folder was not included
* Core modules like:

  * Adapter factory
  * ScoringEngine
  * TrustEngine
  * PersonaEngine

This resulted in:

* `ReferenceError` crashes
* Broken pipeline

Now:

* All **18 files restored**
* Full dependency chain resolved
* Zero runtime errors

---

## Current Status

* 18 Files
* ~2000 Lines of Code
* Fully functional pipeline
* Multi-platform support enabled

---

## Technical Highlights

* Fully client-side execution (no backend)
* Modular architecture
* Platform-agnostic design
* Real-time processing
* Privacy-preserving system

---

## Future Scope

* Mobile integration
* ML-based classification
* Trust API (SaaS model)
* Marketplace partnerships

---

## Contributing

Currently internal development. Open to expansion and scaling contributions.

---

## License

Internal / Prototype Build (Update before public release)

---

## Closing Note

TrustLens transforms unreliable review ecosystems into **data-driven trust systems**.

> Not all reviews are equal — TrustLens ensures the truth stands out.

---
