// content.js — TrustLens entry point (injected into product pages)

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the Amazon ASIN from the current URL.
 * Works for: /dp/ASIN/, /gp/product/ASIN/, /product-reviews/ASIN/
 * @returns {string|null}
 */
function getASIN() {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/gp\/product\/([A-Z0-9]{10})/,
    /\/product-reviews\/([A-Z0-9]{10})/,
  ];
  for (const p of patterns) {
    const m = window.location.pathname.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Fetches one page of reviews from Amazon's product-reviews endpoint.
 * Parses the returned HTML with DOMParser and extracts reviews using AmazonAdapter.
 * @param {string} asin
 * @param {number} pageNumber
 * @returns {Promise<Array>}
 */
async function fetchReviewPage(asin, pageNumber) {
  try {
    const url = `https://www.amazon.in/product-reviews/${asin}?pageNumber=${pageNumber}&pageSize=10&sortBy=recent`;
    const res  = await fetch(url, { credentials: 'include' });

    if (!res.ok) {
      console.warn(`[TrustLens] Page ${pageNumber} fetch failed: ${res.status}`);
      return [];
    }

    const html   = await res.text();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');

    // Use AmazonAdapter logic directly on the fetched document
    const elements = Array.from(doc.querySelectorAll('[data-hook="review"]'));
    const adapter  = new AmazonAdapter();

    return elements.map(el => adapter.parseReview(el)).filter(r => r.text || r.rating > 0);
  } catch (err) {
    console.warn(`[TrustLens] Error fetching page ${pageNumber}:`, err);
    return [];
  }
}

/**
 * Fetches reviews across multiple pages (up to maxPages).
 * Falls back to DOM extraction if fetch returns 0 results.
 * @param {number} maxPages - how many pages to fetch (10 reviews per page)
 * @returns {Promise<Array>}
 */
async function fetchMultiPageReviews(maxPages = 8) {
  const asin = getASIN();

  // Not an Amazon page or ASIN not found — fall back to DOM
  if (!asin) {
    console.log('[TrustLens] No ASIN found — using DOM extraction.');
    const adapter = getAdapter();
    return adapter.extractAll();
  }

  console.log(`[TrustLens] ASIN: ${asin} — fetching up to ${maxPages} pages...`);

  const allReviews = [];

  for (let page = 1; page <= maxPages; page++) {
    const reviews = await fetchReviewPage(asin, page);
    console.log(`[TrustLens] Page ${page}: ${reviews.length} reviews`);

    if (reviews.length === 0) {
      // Amazon returned no reviews — stop early
      console.log(`[TrustLens] No reviews on page ${page}, stopping.`);
      break;
    }

    allReviews.push(...reviews);

    // Small delay between requests to avoid rate limiting
    if (page < maxPages) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // If multi-page fetch got nothing, fall back to DOM
  if (allReviews.length === 0) {
    console.log('[TrustLens] Multi-page fetch got 0 results — falling back to DOM.');
    const adapter = getAdapter();
    return adapter.extractAll();
  }

  console.log(`[TrustLens] Total reviews fetched: ${allReviews.length}`);
  return allReviews;
}

/**
 * Scroll the page to trigger lazy-loaded review sections (non-Amazon fallback).
 */
async function scrollToLoadReviews() {
  return new Promise((resolve) => {
    let scrolled = 0;
    const limit  = Math.min(document.body.scrollHeight * 0.75, 6000);
    const interval = setInterval(() => {
      window.scrollBy(0, 350);
      scrolled += 350;
      if (scrolled >= limit) {
        clearInterval(interval);
        setTimeout(resolve, 700);
      }
    }, 100);
  });
}

// ── Auto-run on page load ─────────────────────────────────────────────────────

(async () => {
  // Wait for DOM to fully settle
  await new Promise(r => setTimeout(r, 1500));

  try {
    let rawReviews = [];
    const isAmazon = window.location.hostname.includes('amazon');

    if (isAmazon) {
      // Multi-page fetch for Amazon (gets up to 80 reviews across 8 pages)
      rawReviews = await fetchMultiPageReviews(8);
    } else {
      // For other sites: scroll to load lazy content, then extract from DOM
      await scrollToLoadReviews();
      const adapter = getAdapter();
      rawReviews = adapter.extractAll();
    }

    if (rawReviews.length === 0) {
      console.log('[TrustLens] No reviews detected on this page.');
      return;
    }

    const result = TrustEngine.analyze(rawReviews);
    TrustLensUI.render(result);
    console.log(`[TrustLens] Analysis complete (${rawReviews.length} reviews):`, result);

  } catch (err) {
    console.error('[TrustLens] Error during analysis:', err);
  }
})();

// ── Manual trigger from popup ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'runAnalysis') {
    (async () => {
      try {
        let rawReviews = [];
        const isAmazon = window.location.hostname.includes('amazon');

        if (isAmazon) {
          // Allow popup to override how many pages to fetch
          const pages = message.pages || 8;
          rawReviews  = await fetchMultiPageReviews(pages);
        } else {
          await scrollToLoadReviews();
          const adapter = getAdapter();
          rawReviews    = adapter.extractAll();
        }

        const result = TrustEngine.analyze(rawReviews);
        TrustLensUI.render(result);
        sendResponse({ success: true, result });

      } catch (err) {
        console.error('[TrustLens] runAnalysis error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // keep message channel open for async response
  }
});
