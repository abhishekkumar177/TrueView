// src/features/featureEngineer.js
// Extracts text, metadata, and user-level signals from a processed review.

const FeatureEngineer = (() => {

  // ── Common generic/spam phrases ──────────────────────────────────────────────
  const GENERIC_PHRASES = [
    'good product', 'nice product', 'great product', 'very good', 'best product',
    'highly recommend', 'worth the money', 'value for money', 'five stars',
    'must buy', 'awesome', 'love it', 'perfect', 'excellent quality',
    'no complaints', 'good quality', 'works as expected', 'as described',
  ];

  /**
   * Extract all features from a preprocessed review.
   * @param {object} review - preprocessed review object
   * @param {object[]} allReviews - all preprocessed reviews (for context features)
   * @returns {object} feature map
   */
  function extract(review, allReviews = []) {
    return {
      // A. Text features
      ...textFeatures(review),
      // B. Metadata features
      ...metadataFeatures(review, allReviews),
      // C. User features
      ...userFeatures(review, allReviews),
    };
  }

  // ── A. Text Features ─────────────────────────────────────────────────────────
  function textFeatures(review) {
    const { text, wordCount } = review;

    // Repetition ratio: count duplicate bigrams / total bigrams
    const bigrams    = getBigrams(text);
    const uniqueRatio = bigrams.length > 0
      ? new Set(bigrams).size / bigrams.length
      : 1;
    const repetitionRatio = 1 - uniqueRatio;

    // Generic content score: how many generic phrases appear?
    const genericHits = GENERIC_PHRASES.filter(p => text.includes(p)).length;
    const genericScore = Math.min(genericHits / 3, 1); // cap at 1

    // Exclamation overuse
    const exclamationCount = (review.text.match(/!/g) || []).length;

    return {
      wordCount,
      isShort:          wordCount < 10,
      isTiny:           wordCount < 4,
      repetitionRatio,
      genericScore,
      exclamationCount,
      hasNoText:        review.isBlank,
    };
  }

  // ── B. Metadata Features ─────────────────────────────────────────────────────
  function metadataFeatures(review, allReviews) {
    const { rating } = review;

    // Extreme rating (1 or 5 with very short text) → suspicious
    const isExtreme = rating === 5 || rating === 1;

    // Compute 5-star ratio across all reviews
    const fiveStarCount = allReviews.filter(r => r.rating === 5).length;
    const fiveStarRatio = allReviews.length > 0
      ? fiveStarCount / allReviews.length
      : 0;

    return {
      rating,
      isExtreme,
      fiveStarRatio,
      hasHighFiveStarRatio: fiveStarRatio > 0.7,
    };
  }

  // ── C. User Features ─────────────────────────────────────────────────────────
  function userFeatures(review, allReviews) {
    const { username } = review;

    // Count how many reviews share the same username
    const sameUserCount = allReviews.filter(
      r => r.username && r.username === username
    ).length;

    return {
      username,
      isDuplicateUser: sameUserCount > 1,
      sameUserCount,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function getBigrams(text) {
    const words = text.split(/\s+/);
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
    return bigrams;
  }

  return { extract };
})();
