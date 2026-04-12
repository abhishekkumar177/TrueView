// src/adapters/amazonAdapter.js

class AmazonAdapter {
  canHandle() {
    return window.location.hostname.includes("amazon");
  }

  getReviewElements() {
    return Array.from(
      document.querySelectorAll('[data-hook="review"]')
    );
  }

  parseReview(el) {
    const textEl     = el.querySelector('[data-hook="review-body"] span');
    const ratingEl   = el.querySelector('[data-hook="review-star-rating"] span, [data-hook="cmps-review-star-rating"] span');
    const usernameEl = el.querySelector('.a-profile-name');
    const timeEl     = el.querySelector('[data-hook="review-date"]');

    const ratingText = ratingEl ? ratingEl.textContent.trim() : "0";
    const rating     = parseFloat(ratingText.split(" ")[0]) || 0;

    return {
      text:      textEl      ? textEl.textContent.trim()      : "",
      rating,
      username:  usernameEl  ? usernameEl.textContent.trim()  : "Unknown",
      timestamp: timeEl      ? timeEl.textContent.trim()      : "",
    };
  }

  extractAll() {
    return this.getReviewElements().map(el => this.parseReview(el));
  }
}
