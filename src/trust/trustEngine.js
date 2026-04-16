// ─────────────────────────────────────────────────────────────────────────────
// trustEngine.js  —  TrustLens Stage 2 (updated)
//
// CHANGES FROM STAGE 1
// ─────────────────────
// The trust formula now factors in mismatchScore from SentimentRatingEngine.
// A review where the text contradicts the star is discounted further —
// beyond what the rule-based fakeScore alone would do.
//
// Updated formula:
//   combinedFakeScore = clamp(fakeScore + 0.4 * mismatchScore, 0, 1)
//   effectiveWeight   = 1 − combinedFakeScore
//   R_adjusted        = Σ(rating × effectiveWeight) / Σ(effectiveWeight)
//
// All other Stage 1 outputs are preserved.
// ─────────────────────────────────────────────────────────────────────────────

const TrustEngine = (() => {

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function analyze(scoredReviews) {
    if (!Array.isArray(scoredReviews) || scoredReviews.length === 0) {
      return _empty();
    }

    let weightedRatingSum = 0;
    let weightSum         = 0;
    let rawRatingSum      = 0;
    let fakeCount         = 0;
    let suspiciousCount   = 0;
    let trustedCount      = 0;

    const annotated = scoredReviews.map(review => {
      const fakeScore     = clamp(review.fakeScore     || 0, 0, 1);
      const mismatchScore = clamp(review.mismatchScore || 0, 0, 1);

      // Blend: mismatch score adds up to 40% extra fake weight
      const combinedFakeScore = clamp(fakeScore + 0.4 * mismatchScore, 0, 1);
      const effectiveWeight   = 1 - combinedFakeScore;

      const rating = parseFloat(review.rating) || 0;
      weightedRatingSum += rating * effectiveWeight;
      weightSum         += effectiveWeight;
      rawRatingSum      += rating;

      const label = review.label || ScoringEngine.classify(fakeScore);
      if (label === 'fake')       fakeCount++;
      else if (label === 'suspicious') suspiciousCount++;
      else                        trustedCount++;

      return { ...review, combinedFakeScore, effectiveWeight, label };
    });

    const n = scoredReviews.length;
    const originalRating = parseFloat((rawRatingSum / n).toFixed(2));
    const trustRating    = weightSum > 0
      ? parseFloat((weightedRatingSum / weightSum).toFixed(2))
      : originalRating;

    return {
      originalRating,
      trustRating,
      fakeCount,
      suspiciousCount,
      trustedCount,
      fakePercent    : parseFloat(((fakeCount / n) * 100).toFixed(1)),
      total          : n,
      scoredReviews  : annotated,
    };
  }

  function _empty() {
    return {
      originalRating: 0, trustRating: 0,
      fakeCount: 0, suspiciousCount: 0, trustedCount: 0,
      fakePercent: 0, total: 0, scoredReviews: [],
    };
  }

  return { analyze };

})();
