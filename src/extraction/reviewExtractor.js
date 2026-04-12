// src/extraction/reviewExtractor.js
// Orchestrates review extraction using the correct platform adapter.

const ReviewExtractor = (() => {

  /**
   * Detects the right adapter and extracts all reviews from the current page.
   * @returns {{ reviews: Array, platform: string }}
   */
  function extract() {
    const adapter  = getAdapter();
    const platform = detectPlatform();

    console.log(`[TrustLens] Using adapter for: ${platform}`);

    let reviews = [];
    try {
      reviews = adapter.extractAll();
    } catch (err) {
      console.warn("[TrustLens] Extraction error:", err);
    }

    console.log(`[TrustLens] Extracted ${reviews.length} reviews.`);
    return { reviews, platform };
  }

  /**
   * Returns a human-readable platform name for logging/display.
   * @returns {string}
   */
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("amazon"))   return "Amazon";
    if (host.includes("flipkart")) return "Flipkart";
    return "Generic";
  }

  /**
   * Checks if the current page is likely a product page with reviews.
   * @returns {boolean}
   */
  function isProductPage() {
    const host = window.location.hostname;
    const path = window.location.pathname;

    if (host.includes("amazon")) {
      return path.includes("/dp/") || path.includes("/gp/product/");
    }
    if (host.includes("flipkart")) {
      return path.includes("/p/") || document.querySelector("[class*='EPCmJX']") !== null;
    }
    // Generic: check if there are any review-like elements
    return document.querySelectorAll("[itemprop='review'], [class*='review']").length > 2;
  }

  return { extract, detectPlatform, isProductPage };
})();
