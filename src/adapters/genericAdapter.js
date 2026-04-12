// src/adapters/genericAdapter.js
// Fallback adapter for any e-commerce site not explicitly supported.

class GenericAdapter {
  canHandle() {
    return true; // always true — used as last resort
  }

  getReviewElements() {
    // Try common review container patterns across unknown sites
    const selectors = [
      "[itemprop='review']",
      "[class*='review-item']",
      "[class*='review-card']",
      "[class*='review-block']",
      "[class*='user-review']",
      "[id*='review']",
      "[class*='comment-item']",
      "[class*='testimonial']",
    ];

    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length > 2) return els; // need at least 3 to be meaningful
    }

    return [];
  }

  parseReview(el) {
    // Try to find a numeric rating via schema.org or common class names
    const ratingEl = el.querySelector(
      "[itemprop='ratingValue'], [class*='rating'], [class*='stars'], [class*='score']"
    );
    const ratingRaw = ratingEl ? parseFloat(ratingEl.textContent.trim()) : 0;
    const rating    = isNaN(ratingRaw) ? 0 : Math.min(ratingRaw, 5);

    // Try to find review text
    const textEl = el.querySelector(
      "[itemprop='reviewBody'], [class*='review-text'], [class*='review-body'], [class*='comment-text'], p"
    );

    // Try to find username
    const userEl = el.querySelector(
      "[itemprop='author'], [class*='author'], [class*='username'], [class*='reviewer']"
    );

    return {
      text:      textEl ? textEl.textContent.trim().slice(0, 1000) : el.textContent.trim().slice(0, 500),
      rating,
      username:  userEl ? userEl.textContent.trim() : "Unknown",
      timestamp: "",
    };
  }

  extractAll() {
    return this.getReviewElements().map(el => this.parseReview(el));
  }
}
