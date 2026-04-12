# TrueView


# Project Structure :


trustview/

├── manifest.json               ← MV3, permissions, content_scripts
├── content.js                  ← entry point + message listener
├── popup.html                  ← toolbar popup UI
└── src/
    ├── adapters/
    
    │   ├── amazonAdapter.js      ← Amazon DOM selectors
    │   ├── flipkartAdapter.js    ← Flipkart DOM selectors (multi-selector fallback)
    │   ├── genericAdapter.js     ← Fallback for any other site
    │   └── platformAdapter.js   ← Base class + getAdapter() factory
    ├── extraction/
    │   └── reviewExtractor.js   ← Calls getAdapter(), returns {reviews, platform}
    ├── preprocessing/
    │   └── preprocessor.js      ← Cleans text (already given earlier)
    ├── features/
    │   └── featureEngineer.js   ← Extracts scoring signals (already given)
    ├── scoring/
    │   └── scoringEngine.js     ← Fake score (0–1) + label per review
    ├── trust/
    │   └── trustEngine.js       ← Trust-Adjusted Rating formula
    └── ui/
        ├── overlay.js            ← Injects result panel into page
        └── overlay.css           ← Overlay styles
