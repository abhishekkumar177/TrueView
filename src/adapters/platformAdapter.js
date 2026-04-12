// src/adapters/platformAdapter.js
// Base class — all platform adapters extend this

class PlatformAdapter {
  /**
   * Returns true if this adapter can handle the current page.
   * Subclasses must override this.
   * @returns {boolean}
   */
  canHandle() {
    return false;
  }

  /**
   * Returns a NodeList / Array of raw review DOM elements.
   * Subclasses must override this.
   * @returns {Element[]}
   */
  getReviewElements() {
    return [];
  }

  /**
   * Parses a single review DOM element into a structured object.
   * Subclasses must override this.
   * @param {Element} el
   * @returns {{ text: string, rating: number, username: string, timestamp: string }}
   */
  parseReview(el) {
    return { text: '', rating: 0, username: '', timestamp: '' };
  }

  /**
   * Convenience: extract all reviews on the page.
   * @returns {Array<{ text, rating, username, timestamp }>}
   */
  extractAll() {
    return this.getReviewElements().map(el => this.parseReview(el));
  }
}

// ─── Amazon Adapter ────────────────────────────────────────────────────────────
class AmazonAdapter extends PlatformAdapter {
  canHandle() {
    return window.location.hostname.includes('amazon');
  }

  getReviewElements() {
    return Array.from(
      document.querySelectorAll('[data-hook="review"]')
    );
  }

  parseReview(el) {
    const textEl     = el.querySelector('[data-hook="review-body"] span');
    const ratingEl   = el.querySelector('[data-hook="review-star-rating"] span');
    const usernameEl = el.querySelector('.a-profile-name');
    const timeEl     = el.querySelector('[data-hook="review-date"]');

    const ratingText = ratingEl ? ratingEl.textContent.trim() : '0';
    const rating     = parseFloat(ratingText.split(' ')[0]) || 0;

    return {
      text:      textEl      ? textEl.textContent.trim()      : '',
      rating,
      username:  usernameEl  ? usernameEl.textContent.trim()  : 'Unknown',
      timestamp: timeEl      ? timeEl.textContent.trim()      : '',
    };
  }
}

// ─── Flipkart Adapter ──────────────────────────────────────────────────────────
class FlipkartAdapter extends PlatformAdapter {
  canHandle() {
    return window.location.hostname.includes('flipkart');
  }

  getReviewElements() {
    return Array.from(
      document.querySelectorAll('div[class*="col EPCmJX"]')
    );
  }

  parseReview(el) {
    const textEl     = el.querySelector('div[class*="ZmyHeo"]');
    const ratingEl   = el.querySelector('div[class*="XQDdHH"]');
    const usernameEl = el.querySelector('p[class*="MTs2Td"]');
    const timeEl     = el.querySelector('p[class*="_2NsDsT"]');

    return {
      text:      textEl      ? textEl.textContent.trim()      : '',
      rating:    ratingEl    ? parseFloat(ratingEl.textContent) || 0 : 0,
      username:  usernameEl  ? usernameEl.textContent.trim()  : 'Unknown',
      timestamp: timeEl      ? timeEl.textContent.trim()      : '',
    };
  }
}

// ─── Generic Adapter (fallback) ────────────────────────────────────────────────
class GenericAdapter extends PlatformAdapter {
  canHandle() {
    return true; // fallback — always returns true
  }

  getReviewElements() {
    // Heuristic: look for common review containers
    const candidates = [
      '[class*="review"]',
      '[class*="comment"]',
      '[id*="review"]',
      '[itemprop="review"]',
    ];
    for (const sel of candidates) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length > 2) return els;
    }
    return [];
  }

  parseReview(el) {
    // Best-effort text extraction; no structured rating metadata
    return {
      text:      el.textContent.trim().slice(0, 1000),
      rating:    0,
      username:  'Unknown',
      timestamp: '',
    };
  }
}

// ─── Factory: pick the right adapter for the current page ─────────────────────
function getAdapter() {
  const adapters = [new AmazonAdapter(), new FlipkartAdapter(), new GenericAdapter()];
  return adapters.find(a => a.canHandle()) || new GenericAdapter();
}
