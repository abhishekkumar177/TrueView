// src/adapters/amazonAdapter.js

class AmazonAdapter {
  canHandle() {
    return window.location.hostname.includes("amazon");
  }

  // ─────────────────────────────────────────────
  // MAIN PARSER
  // ─────────────────────────────────────────────
  parseReview(el) {
    const text = this._getText(el);

    const review = {
      username: this._getUsername(el),
      profileUrl: this._getProfileUrl(el),
      rating: this._getRating(el),
      title: this._getTitle(el),
      text: text,
      timestamp: this._getTimestamp(el),
      verified: this._isVerified(el),
      helpfulVotes: this._getHelpfulVotes(el),
      imageCount: this._getImageCount(el),
      hasVideo: this._hasVideo(el),
      wordCount: this._countWords(text),
      source: "dom",
    };

    return review;
  }

  // ─────────────────────────────────────────────
  // EXTRACT ALL REVIEWS FROM PAGE
  // ─────────────────────────────────────────────
  extractAll() {
    const elements = document.querySelectorAll('[data-hook="review"]');
    const reviews = [];

    elements.forEach(el => {
      try {
        const review = this.parseReview(el);
        if (review.text && review.text.length > 0) {
          reviews.push(review);
        }
      } catch (err) {
        console.warn("[AmazonAdapter] Error parsing review:", err);
      }
    });

    return reviews;
  }

  // ─────────────────────────────────────────────
  // FIELD EXTRACTORS
  // ─────────────────────────────────────────────

  _getUsername(el) {
    return (
      el.querySelector(".a-profile-name")?.textContent.trim() ||
      el.querySelector('[data-hook="review-author"]')?.textContent.trim() ||
      "Anonymous"
    );
  }

  _getProfileUrl(el) {
    const link =
      el.querySelector(".a-profile") ||
      el.querySelector('a[href*="/profile/"]') ||
      el.querySelector('a[href*="/gp/profile/"]');

    if (!link) return "";

    const href = link.getAttribute("href") || "";

    if (href.startsWith("/")) {
      return window.location.origin + href;
    }

    return href;
  }

  _getRating(el) {
    const starEl =
      el.querySelector('[data-hook="review-star-rating"]') ||
      el.querySelector('[data-hook="cmps-review-star-rating"]');

    if (starEl) {
      const label =
        starEl.getAttribute("aria-label") || starEl.textContent;

      const match = label.match(/([\d.]+)/);
      if (match) return parseFloat(match[1]);
    }

    return 0;
  }

  _getTitle(el) {
    return (
      el.querySelector('[data-hook="review-title"] span:not(.a-icon-alt)')
        ?.textContent.trim() ||
      el.querySelector('[data-hook="review-title"]')?.textContent.trim() ||
      ""
    );
  }

  _getText(el) {
    const body =
      el.querySelector('[data-hook="review-body"]') ||
      el.querySelector('[data-hook="review-collapsed-text"]');

    if (!body) return "";

    const clone = body.cloneNode(true);

    // Remove "Read more" junk
    clone
      .querySelectorAll('[data-hook="review-collapsed-text"]')
      .forEach(n => n.remove());

    return clone.textContent.trim();
  }

  _getTimestamp(el) {
    return (
      el.querySelector('[data-hook="review-date"]')?.textContent.trim() ||
      ""
    );
  }

  _isVerified(el) {
    const badge =
      el.querySelector('[data-hook="avp-badge"]') ||
      el.querySelector(".a-color-state");

    return !!(badge && /verified/i.test(badge.textContent));
  }

  _getHelpfulVotes(el) {
    const hv =
      el.querySelector('[data-hook="helpful-vote-statement"]')
        ?.textContent;

    if (!hv) return 0;

    const match = hv.match(/([\d,]+)/);
    return match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
  }

  _getImageCount(el) {
    return el.querySelectorAll(
      '[data-hook="review-image-tile"], .review-image-container img'
    ).length;
  }

  _hasVideo(el) {
    return !!(
      el.querySelector('[data-hook="review-video-widget"]') ||
      el.querySelector(".cr-video-widget") ||
      el.querySelector("[data-video-url]")
    );
  }

  _countWords(text) {
    return (text || "").split(/\s+/).filter(Boolean).length;
  }
}
