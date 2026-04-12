// content.js — TrustLens entry point (injected into product pages)

(async () => {
  // Give the page DOM time to fully settle
  await new Promise(r => setTimeout(r, 1200));

  try {
    const adapter    = getAdapter();
    const rawReviews = adapter.extractAll();

    if (rawReviews.length === 0) {
      console.log('[TrustLens] No reviews detected on this page.');
      return;
    }

    const result = TrustEngine.analyze(rawReviews);
    TrustLensUI.render(result);

    console.log('[TrustLens] Analysis complete:', result);
  } catch (err) {
    console.error('[TrustLens] Error during analysis:', err);
  }
})();

// Listen for manual trigger from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'runAnalysis') {
    try {
      const adapter = getAdapter();
      const raw     = adapter.extractAll();
      const result  = TrustEngine.analyze(raw);
      TrustLensUI.render(result);
      sendResponse({ success: true, result });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  return true;
});
