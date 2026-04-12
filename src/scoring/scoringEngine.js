// src/scoring/scoringEngine.js
// Rule-based scoring: assigns a Fake Probability Score (0–1) to each review.

const ScoringEngine = (() => {

  /**
   * Score a single review based on its extracted features.
   * Returns a fakeScore between 0 (trusted) and 1 (likely fake).
   *
   * @param {object} features - output of FeatureEngineer.extract()
   * @returns {number} fakeScore ∈ [0, 1]
   */
  function score(features) {
    let fakeScore = 0;

    // ── Text signals ──────────────────────────────────────────────
    if (features.hasNoText)       fakeScore += 0.40;
    if (features.isTiny)          fakeScore += 0.35;
    else if (features.isShort)    fakeScore += 0.20;

    if (features.repetitionRatio > 0.5)  fakeScore += 0.30;
    else if (features.repetitionRatio > 0.3) fakeScore += 0.15;

    if (features.genericScore > 0.6)  fakeScore += 0.25;
    else if (features.genericScore > 0.3) fakeScore += 0.10;

    if (features.exclamationCount > 3) fakeScore += 0.10;

    // ── Metadata signals ──────────────────────────────────────────
    if (features.isExtreme && features.isShort)   fakeScore += 0.20;
    if (features.hasHighFiveStarRatio)             fakeScore += 0.10;

    // ── User signals ──────────────────────────────────────────────
    if (features.isDuplicateUser) fakeScore += 0.15;

    // Clamp to [0, 1]
    return Math.min(Math.max(fakeScore, 0), 1);
  }

  /**
   * Classify a fakeScore into a human-readable label.
   * @param {number} fakeScore
   * @returns {'trusted' | 'suspicious' | 'fake'}
   */
  function classify(fakeScore) {
    if (fakeScore < 0.3)  return 'trusted';
    if (fakeScore < 0.6)  return 'suspicious';
    return 'fake';
  }

  return { score, classify };
})();


// ─────────────────────────────────────────────────────────────────────────────
// src/trust/trustEngine.js
// Computes the Trust-Adjusted Rating from scored reviews.
// ─────────────────────────────────────────────────────────────────────────────

const TrustEngine = (() => {

  /**
   * Run the full pipeline on raw extracted reviews.
   *
   * @param {Array<{ text, rating, username, timestamp }>} rawReviews
   * @returns {{
   *   originalRating: number,
   *   trustRating: number,
   *   fakeCount: number,
   *   suspiciousCount: number,
   *   trustedCount: number,
   *   fakePercent: number,
   *   reviews: Array<object>
   * }}
   */
  function analyze(rawReviews) {
    if (!rawReviews || rawReviews.length === 0) {
      return null;
    }

    // Step 1 — Preprocess
    const processed = rawReviews.map(r => Preprocessor.process(r));

    // Step 2 — Feature engineering
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

    // Step 4 — Original rating (simple average)
    const ratingsWithValue = scored.filter(r => r.rating > 0);
    const originalRating = ratingsWithValue.length > 0
      ? ratingsWithValue.reduce((sum, r) => sum + r.rating, 0) / ratingsWithValue.length
      : 0;

    // Step 5 — Trust-Adjusted Rating
    // R_adjusted = Σ(rating × (1 − fakeScore)) / Σ(1 − fakeScore)
    const weightedSum   = scored.reduce((sum, r) => sum + r.rating * (1 - r.fakeScore), 0);
    const weightSum     = scored.reduce((sum, r) => sum + (1 - r.fakeScore), 0);
    const trustRating   = weightSum > 0 ? weightedSum / weightSum : originalRating;

    // Step 6 — Summary counts
    const fakeCount       = scored.filter(r => r.label === 'fake').length;
    const suspiciousCount = scored.filter(r => r.label === 'suspicious').length;
    const trustedCount    = scored.filter(r => r.label === 'trusted').length;
    const fakePercent     = Math.round((fakeCount / scored.length) * 100);

    return {
      originalRating: Math.round(originalRating * 10) / 10,
      trustRating:    Math.round(trustRating * 10) / 10,
      fakeCount,
      suspiciousCount,
      trustedCount,
      fakePercent,
      total: scored.length,
      reviews: scored,
    };
  }

  return { analyze };
})();
