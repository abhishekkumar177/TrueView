// src/adapters/flipkartAdapter.js

class FlipkartAdapter {
  canHandle() {
    return window.location.hostname.includes("flipkart");
  }

  getReviewElements() {
    // Flipkart uses hashed class names that change — try multiple known patterns
    const selectors = [
      "div.col.EPCmJX",
      "div[class*='EPCmJX']",
      "div[class*='_27M-vq']",
      "div.review-container",
    ];
    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length > 0) return els;
    }
    return [];
  }

  parseReview(el) {
    const textSelectors     = ["div[class*='ZmyHeo']", "div[class*='qwjRop']", "div.review-text"];
    const ratingSelectors   = ["div[class*='XQDdHH']", "div[class*='_3LWZlK']", "span[class*='_1lRcqv']"];
    const usernameSelectors = ["p[class*='MTs2Td']",   "p[class*='_2V5EHH']",   "p.reviewer-name"];
    const timeSelectors     = ["p[class*='_2NsDsT']",  "p[class*='_3n8db7']",   "p.review-date"];

    const findText = (selList) => {
      for (const sel of selList) {
        const el2 = el.querySelector(sel);
        if (el2) return el2.textContent.trim();
      }
      return "";
    };

    const ratingText = findText(ratingSelectors);
    const rating     = parseFloat(ratingText) || 0;

    return {
      text:      findText(textSelectors),
      rating,
      username:  findText(usernameSelectors) || "Unknown",
      timestamp: findText(timeSelectors),
    };
  }

  extractAll() {
    return this.getReviewElements().map(el => this.parseReview(el));
  }
}
