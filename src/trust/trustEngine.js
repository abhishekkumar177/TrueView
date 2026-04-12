// src/trust/trustEngine.js
// Runs the full analysis pipeline and computes the Trust-Adjusted Rating.
// Depends on: Preprocessor, FeatureEngineer, ScoringEngine (loaded before this)

const TrustEngine = (() => {

  /**
   * Full pipeline: preprocess → feature extract → score → compute trust rating.
   *
   * @param {Array<{ text, rating, username, timestamp }>} rawReviews
   * @returns {{
   *   originalRating: number,
   *   trustRating: number,
   *   fakeCount: number,
   *   suspiciousCount: number,
   *   trustedCount: number,
   *   fakePercent: number,
   *   total: number,
   *   reviews: Array
   * } | null}
   */
  function analyze(rawReviews) {
    if (!rawReviews || rawReviews.length === 0) {
      console.warn("[TrustLens] No reviews to analyze.");
      return null;
    }

    // Step 1 — Preprocess all reviews
    const processed = rawReviews.map(r => Preprocessor.process(r));

    // Step 2 — Extract features (pass all reviews for context-level signals)
    const withFeatures = processed.map(r => ({
      ...r,
      features: FeatureEngineer.extract(r, processed),
    }));

    // Step 3 — Score each review
    const scored = withFeatures.map(r => {
      const fakeScore = ScoringEngine.score(r.features);
      const label     = ScoringEngine.classify(fakeScore);
      return { ...r, fakeScore, label };
    });

    // Step 4 — Original rating: simple average of reviews that have a rating
    const withRating     = scored.filter(r => r.rating > 0);
    const originalRating = withRating.length > 0
      ? withRating.reduce((sum, r) => sum + r.rating, 0) / withRating.length
      : 0;

    // Step 5 — Trust-Adjusted Rating
    // Formula: R_adjusted = Σ(rating × (1 − fakeScore)) / Σ(1 − fakeScore)
    const weightedSum = scored.reduce((sum, r) => sum + r.rating * (1 - r.fakeScore), 0);
    const weightSum   = scored.reduce((sum, r) => sum + (1 - r.fakeScore), 0);
    const trustRating = weightSum > 0 ? weightedSum / weightSum : originalRating;

    // Step 6 — Summary counts
    const fakeCount       = scored.filter(r => r.label === "fake").length;
    const suspiciousCount = scored.filter(r => r.label === "suspicious").length;
    const trustedCount    = scored.filter(r => r.label === "trusted").length;
    const fakePercent     = Math.round((fakeCount / scored.length) * 100);

    return {
      originalRating: Math.round(originalRating * 10) / 10,
      trustRating:    Math.round(trustRating    * 10) / 10,
      fakeCount,
      suspiciousCount,
      trustedCount,
      fakePercent,
      total:   scored.length,
      reviews: scored,
    };
  }

  return { analyze };
})();
