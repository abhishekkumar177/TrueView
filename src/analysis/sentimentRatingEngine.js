// ─────────────────────────────────────────────────────────────────────────────
// sentimentRatingEngine.js  —  TrustLens Stage 2
//
// PURPOSE
// -------
// A review's given star rating and its text content should agree.
// A 5-star review that says "terrible product, broke instantly" is a red flag.
// A 1-star review that says "amazing quality, love it" is equally suspicious.
//
// This engine operates in two passes per review:
//
//  Pass 1 — Lexicon scoring
//    Score every word against a polarity lexicon:
//      positive words  → +weight
//      negative words  → -weight
//      intensifiers    → multiply next word's weight
//      negators        → flip next word's polarity
//    Produce a raw sentiment score, then normalise to [1, 5].
//    This is the "impliedRating".
//
//  Pass 2 — Mismatch analysis
//    Compare impliedRating to the actual givenRating.
//    Compute:
//      mismatchDelta     : Math.abs(impliedRating - givenRating)
//      mismatchDirection : "inflated" | "deflated" | "none"
//      mismatchScore     : 0–1  (feeds into fake probability)
//
// OUTPUT per review  (new fields added to existing review objects)
// -------
//  sentimentScore   : Number  raw normalised score in [1, 5]
//  impliedRating    : Number  rounded to 1 decimal, e.g. 3.7
//  mismatchDelta    : Number  absolute difference, 0–4
//  mismatchDirection: String  "inflated" | "deflated" | "none"
//  mismatchScore    : Number  0–1, used by scoringEngine
//  sentimentTokens  : Number  how many scoreable tokens were found (confidence proxy)
// ─────────────────────────────────────────────────────────────────────────────

const SentimentRatingEngine = (() => {

  // ── Lexicons ──────────────────────────────────────────────────────────────
  // Weights are relative. Kept compact but coverage-optimised for product reviews.

  const POSITIVE = {
    // Strong positive (weight 3)
    excellent:3, outstanding:3, exceptional:3, flawless:3, superb:3,
    perfect:3, amazing:3, fantastic:3, brilliant:3, magnificent:3,
    incredible:3, phenomenal:3, unbeatable:3, masterpiece:3, immaculate:3,

    // Good positive (weight 2)
    great:2, good:2, love:2, loved:2, wonderful:2, awesome:2, solid:2,
    impressive:2, reliable:2, sturdy:2, durable:2, smooth:2, premium:2,
    delighted:2, satisfied:2, pleased:2, recommend:2, recommended:2,
    worth:2, value:2, quality:2, genuine:2, authentic:2, accurate:2,
    fast:2, quick:2, prompt:2, efficient:2, responsive:2,

    // Mild positive (weight 1)
    ok:1, okay:1, fine:1, decent:1, works:1, working:1, arrived:1,
    nice:1, neat:1, clean:1, easy:1, simple:1, convenient:1, handy:1,
    useful:1, helpful:1, functional:1, expected:1, happy:1, glad:1,
  };

  const NEGATIVE = {
    // Strong negative (weight 3)
    terrible:3, horrible:3, awful:3, dreadful:3, atrocious:3,
    useless:3, worthless:3, broken:3, defective:3, fraud:3, scam:3,
    fake:3, counterfeit:3, dangerous:3, hazardous:3, pathetic:3,
    disgusting:3, appalling:3, abysmal:3, catastrophic:3, disaster:3,

    // Moderate negative (weight 2)
    bad:2, poor:2, worst:2, waste:2, disappointed:2, disappointing:2,
    damaged:2, scratched:2, cracked:2, leaking:2, stopped:2, failed:2,
    failure:2, broke:2, breaks:2, breaking:2, dead:2, wrong:2,
    incorrect:2, missing:2, incomplete:2, cheap:2, flimsy:2, weak:2,
    slow:2, delayed:2, late:2, stuck:2, overheating:2, melted:2,
    return:2, returning:2, refund:2, complaint:2,

    // Mild negative (weight 1)
    issue:1, problem:1, trouble:1, concern:1, doubt:1, unsure:1,
    average:1, mediocre:1, ordinary:1, basic:1, lacking:1, limited:1,
    confusing:1, unclear:1, difficult:1, hard:1, annoying:1, noisy:1,
  };

  const NEGATORS = new Set([
    'not','no','never','nothing','neither','nor','nobody','none',
    "isn't","aren't","wasn't","weren't","doesn't","don't","didn't",
    'cannot','can\'t','won\'t','wouldn\'t','shouldn\'t','couldn\'t',
    'hardly','barely','scarcely',
  ]);

  const INTENSIFIERS = {
    very:1.5, extremely:2.0, absolutely:2.0, completely:1.8,
    totally:1.6, utterly:2.0, incredibly:1.8, highly:1.5,
    really:1.4, truly:1.5, so:1.3, such:1.3, quite:1.2,
    rather:1.1, fairly:1.1, pretty:1.2,
  };

  // ── Tokeniser ─────────────────────────────────────────────────────────────

  function tokenise(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z\s']/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  // ── Raw sentiment scorer ──────────────────────────────────────────────────
  // Returns { score, tokenCount }
  // score: unbounded float, positive = good sentiment, negative = bad

  function rawScore(tokens) {
    let score = 0;
    let tokenCount = 0;
    let multiplier = 1.0;
    let polarityFlip = 1;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Handle intensifiers — they boost the NEXT scored word
      if (INTENSIFIERS[token]) {
        multiplier = INTENSIFIERS[token];
        continue;
      }

      // Handle negators — they flip the polarity of the NEXT scored word
      if (NEGATORS.has(token)) {
        polarityFlip = -1;
        continue;
      }

      // Score the word
      const posW = POSITIVE[token];
      const negW = NEGATIVE[token];

      if (posW !== undefined) {
        score += polarityFlip * posW * multiplier;
        tokenCount++;
        multiplier = 1.0;
        polarityFlip = 1;
      } else if (negW !== undefined) {
        score -= polarityFlip * negW * multiplier;
        tokenCount++;
        multiplier = 1.0;
        polarityFlip = 1;
      } else {
        // Unscored word — reset modifiers so they don't drift
        if (multiplier !== 1.0 || polarityFlip !== 1) {
          // Keep modifiers for one more word — natural language often has gap words
          // e.g. "not at all good" — but reset after 2 missed words
          const lookahead = tokens[i + 1];
          if (!lookahead || (!POSITIVE[lookahead] && !NEGATIVE[lookahead])) {
            multiplier = 1.0;
            polarityFlip = 1;
          }
        }
      }
    }

    return { score, tokenCount };
  }

  // ── Normalise raw score to [1, 5] ─────────────────────────────────────────
  // We use a sigmoid-like mapping:
  //   score per token is the key signal
  //   scorePerToken of +1.5 maps roughly to 5 stars
  //   scorePerToken of -1.5 maps roughly to 1 star
  //   0 maps to 3 stars (neutral)

  function normalise(score, tokenCount) {
    if (tokenCount === 0) return 3.0; // no evidence → neutral

    const perToken = score / tokenCount;
    // Clamp to [-2, +2] then map to [1, 5]
    const clamped = Math.max(-2, Math.min(2, perToken));
    // Linear map: [-2,+2] → [1,5]
    return 1 + ((clamped + 2) / 4) * 4;
  }

  // ── Mismatch calculator ───────────────────────────────────────────────────

  function calcMismatch(impliedRating, givenRating) {
    const delta = Math.abs(impliedRating - givenRating);

    let direction = 'none';
    if (delta >= 1.0) {
      direction = givenRating > impliedRating ? 'inflated' : 'deflated';
    }

    // mismatchScore: 0 = perfect agreement, 1 = extreme mismatch
    // Non-linear: delta of 1 = 0.25, delta of 2 = 0.55, delta of 3 = 0.80, delta of 4 = 1.0
    const mismatchScore = parseFloat(Math.min(1, (delta / 4) ** 0.7).toFixed(4));

    return { mismatchDelta: parseFloat(delta.toFixed(2)), mismatchDirection: direction, mismatchScore };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {

    /**
     * analyseReview(review)
     * Takes a review object with at minimum: { text: String, rating: Number }
     * Returns the same object with sentiment fields added.
     */
    analyseReview(review) {
      const text = (review.cleanedText || review.text || '').trim();
      const givenRating = parseFloat(review.rating) || 3;

      const tokens = tokenise(text);
      const { score, tokenCount } = rawScore(tokens);
      const sentimentScore = normalise(score, tokenCount);
      const impliedRating  = parseFloat(sentimentScore.toFixed(1));
      const mismatch       = calcMismatch(impliedRating, givenRating);

      return Object.assign({}, review, {
        sentimentScore   : parseFloat(sentimentScore.toFixed(3)),
        impliedRating,
        mismatchDelta    : mismatch.mismatchDelta,
        mismatchDirection: mismatch.mismatchDirection,
        mismatchScore    : mismatch.mismatchScore,
        sentimentTokens  : tokenCount,
      });
    },

    /**
     * analyseAll(reviews)
     * Runs analyseReview on every review in the array.
     * Also appends a corpus-level sentimentSummary.
     *
     * Returns:
     *   { reviews: [...enrichedReviews], summary: SentimentSummary }
     *
     * SentimentSummary:
     *   avgImpliedRating   : Number
     *   avgGivenRating     : Number
     *   corpusMismatch     : Number  — average mismatchScore across all reviews
     *   inflatedCount      : Number  — reviews where stars are too HIGH for text
     *   deflatedCount      : Number  — reviews where stars are too LOW for text
     *   mismatchedCount    : Number  — delta >= 1.0
     *   totalReviews       : Number
     *   lowConfidenceCount : Number  — reviews with < 3 scoreable tokens
     */
    analyseAll(reviews) {
      if (!Array.isArray(reviews) || reviews.length === 0) {
        return { reviews: [], summary: _emptySummary() };
      }

      const enriched = reviews.map(r => this.analyseReview(r));

      let sumImplied = 0, sumGiven = 0, sumMismatch = 0;
      let inflated = 0, deflated = 0, mismatched = 0, lowConf = 0;

      enriched.forEach(r => {
        sumImplied  += r.impliedRating;
        sumGiven    += (parseFloat(r.rating) || 3);
        sumMismatch += r.mismatchScore;
        if (r.mismatchDirection === 'inflated')  inflated++;
        if (r.mismatchDirection === 'deflated')  deflated++;
        if (r.mismatchDelta >= 1.0)              mismatched++;
        if (r.sentimentTokens < 3)               lowConf++;
      });

      const n = enriched.length;
      const summary = {
        avgImpliedRating   : parseFloat((sumImplied  / n).toFixed(2)),
        avgGivenRating     : parseFloat((sumGiven    / n).toFixed(2)),
        corpusMismatch     : parseFloat((sumMismatch / n).toFixed(4)),
        inflatedCount      : inflated,
        deflatedCount      : deflated,
        mismatchedCount    : mismatched,
        totalReviews       : n,
        lowConfidenceCount : lowConf,
      };

      return { reviews: enriched, summary };
    },

    // Exposed for unit testing
    _tokenise: tokenise,
    _rawScore: rawScore,
    _normalise: normalise,
  };

  function _emptySummary() {
    return {
      avgImpliedRating:0, avgGivenRating:0, corpusMismatch:0,
      inflatedCount:0, deflatedCount:0, mismatchedCount:0,
      totalReviews:0, lowConfidenceCount:0,
    };
  }

})();
