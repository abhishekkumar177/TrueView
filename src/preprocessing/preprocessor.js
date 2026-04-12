// src/preprocessing/preprocessor.js
// Cleans raw review text before feature extraction.

const Preprocessor = (() => {

  /**
   * Full pipeline: clean a single review object.
   * @param {{ text: string, rating: number, username: string, timestamp: string }} review
   * @returns {object} same shape, with cleaned text + derived fields
   */
  function process(review) {
    const cleaned = cleanText(review.text);
    return {
      ...review,
      text:       cleaned,
      wordCount:  wordCount(cleaned),
      isBlank:    cleaned.length === 0,
    };
  }

  /** Strip HTML tags, special characters, and normalize whitespace. */
  function cleanText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .replace(/<[^>]*>/g, ' ')         // strip HTML
      .replace(/[^a-zA-Z0-9\s.,'!?-]/g, ' ') // remove special chars
      .replace(/\s+/g, ' ')             // collapse whitespace
      .trim()
      .toLowerCase();
  }

  /** Count words in a string. */
  function wordCount(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  return { process, cleanText, wordCount };
})();
