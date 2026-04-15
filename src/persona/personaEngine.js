// ─────────────────────────────────────────────────────────────────────────────
// personaEngine.js  —  TrustLens Stage 2
//
// PURPOSE
// -------
// Takes UserProfile objects (from userProfileBuilder.js) and classifies
// each user into one of three persona categories:
//
//   REAL  — Genuine shopper. Behaviour is consistent with organic reviewing:
//           varied text length, ratings that match sentiment, reviews spread
//           over time, profile link present, not always 5-stars.
//
//   DUMMY — Likely a low-effort planted account. Account exists but shows
//           suspicious patterns: always same star, very short reviews,
//           no profile link, or reviews bursting in a short window.
//           May be human but coordinated, or a lightly-operated bot.
//
//   FAKE  — High-confidence inorganic. Multiple strong signals converge:
//           extreme star bias + text/star mismatch + burst timing +
//           near-zero review length + no verified purchases, etc.
//
// Each profile receives:
//   personaLabel      : "real" | "dummy" | "fake"
//   personaScore      : Number 0–1  (0 = clearly real, 1 = clearly fake)
//   personaReasons    : String[]  — human-readable explanations
//   personaConfidence : "high" | "medium" | "low"
//
// SCORING APPROACH
// ----------------
// We use an additive penalty model (same philosophy as the existing
// scoringEngine.js so the two systems are conceptually unified):
//
//   personaScore = Σ penalties, capped at 1.0
//
// Thresholds:
//   personaScore < 0.30  → real
//   0.30 ≤ score < 0.60  → dummy
//   score ≥ 0.60         → fake
//
// Confidence:
//   Derived from how many independent signals fired.
//   3+ signals → high, 2 signals → medium, 1 signal → low
// ─────────────────────────────────────────────────────────────────────────────

const PersonaEngine = (() => {

  // ── Thresholds ────────────────────────────────────────────────────────────

  const FAKE_THRESHOLD  = 0.60;
  const DUMMY_THRESHOLD = 0.30;

  // ── Individual signal evaluators ─────────────────────────────────────────
  // Each returns { penalty: Number, reason: String | null }
  // reason is non-null only when the signal fired.

  const signals = [

    // ── S1: No profile link ──────────────────────────────────────────────
    // Real users almost always have a linked reviewer profile on Amazon.
    // An anonymous reviewer with no link is a weak but consistent flag.
    {
      id: 'no_profile_link',
      weight: 0.10,
      evaluate(profile) {
        if (!profile.hasProfileLink) {
          return { penalty: this.weight, reason: 'No reviewer profile link found' };
        }
        return { penalty: 0, reason: null };
      }
    },

    // ── S2: Extremely short reviews ──────────────────────────────────────
    // Fake reviewers often post 1–5 word reviews like "good product" or "★★★★★".
    // avgReviewLength < 6 words is suspicious, < 3 is very suspicious.
    {
      id: 'short_reviews',
      weight: 0.20,
      evaluate(profile) {
        if (profile.avgReviewLength < 3) {
          return { penalty: this.weight, reason: `Reviews are extremely short (avg ${profile.avgReviewLength} words)` };
        }
        if (profile.avgReviewLength < 6) {
          return { penalty: this.weight * 0.6, reason: `Reviews are very short (avg ${profile.avgReviewLength} words)` };
        }
        return { penalty: 0, reason: null };
      }
    },

    // ── S3: Always same star rating ──────────────────────────────────────
    // A reviewer who posted multiple reviews and gave identical stars every time
    // (especially all-5 or all-1) is behaving like a script, not a shopper.
    {
      id: 'all_same_rating',
      weight: 0.25,
      evaluate(profile) {
        if (profile.allSameRating && profile.reviewCount >= 2) {
          const star = profile.ratings[0];
          const extreme = (star === 5 || star === 1);
          const penalty = extreme ? this.weight : this.weight * 0.6;
          return {
            penalty,
            reason: `All ${profile.reviewCount} reviews gave identical ${star}-star rating`
          };
        }
        return { penalty: 0, reason: null };
      }
    },

    // ── S4: Burst timing ─────────────────────────────────────────────────
    // A user who posted all their reviews in a very short window (same day,
    // same hour) is suspicious — real shoppers spread reviews over time.
    {
      id: 'burst_timing',
      weight: 0.25,
      evaluate(profile) {
        if (profile.reviewCount < 2) return { penalty: 0, reason: null };
        if (profile.burstScore >= 0.90) {
          return { penalty: this.weight, reason: `All reviews posted in an extremely tight time window (burst score ${profile.burstScore})` };
        }
        if (profile.burstScore >= 0.70) {
          return { penalty: this.weight * 0.6, reason: `Reviews clustered in a short time window (burst score ${profile.burstScore})` };
        }
        return { penalty: 0, reason: null };
      }
    },

    // ── S5: High text/star mismatch ──────────────────────────────────────
    // From sentimentRatingEngine: if a user consistently gives 5 stars but
    // writes neutral or negative text, that's a strong inauthenticity signal.
    {
      id: 'sentiment_mismatch',
      weight: 0.30,
      evaluate(profile) {
        const avg = profile.avgMismatchScore;
        if (avg >= 0.55) {
          return { penalty: this.weight, reason: `Text sentiment strongly disagrees with star rating (mismatch score ${avg})` };
        }
        if (avg >= 0.35) {
          return { penalty: this.weight * 0.55, reason: `Text sentiment moderately disagrees with star rating (mismatch score ${avg})` };
        }
        return { penalty: 0, reason: null };
      }
    },

    // ── S6: No verified purchases ────────────────────────────────────────
    // Real buyers who received a product typically get a "Verified Purchase" badge.
    // Zero verified reviews across multiple reviews from one user is suspicious.
    {
      id: 'no_verified',
      weight: 0.15,
      evaluate(profile) {
        if (profile.reviewCount >= 2 && profile.verifiedCount === 0) {
          return { penalty: this.weight, reason: 'No reviews are marked Verified Purchase' };
        }
        return { penalty: 0, reason: null };
      }
    },

    // ── S7: Extreme rating bias + no text variety ────────────────────────
    // Combination signal: always gives 5 stars AND reviews are short AND
    // no verified purchase. Each alone is weak; together they're compelling.
    {
      id: 'combined_extreme_bias',
      weight: 0.20,
      evaluate(profile) {
        const avgRatingNearExtreme = profile.avgRating >= 4.8 || profile.avgRating <= 1.2;
        const shortText = profile.avgReviewLength < 10;
        const noVerified = profile.verifiedCount === 0;

        if (avgRatingNearExtreme && shortText && noVerified) {
          return {
            penalty: this.weight,
            reason: `Combined: extreme avg rating (${profile.avgRating}★), short text, no verified purchase`
          };
        }
        return { penalty: 0, reason: null };
      }
    },

    // ── S8: Rating variance suspiciously zero for multi-review users ─────
    // A user with 3+ reviews all with exactly 0 variance in ratings.
    // Real shoppers rate products differently; bots repeat.
    {
      id: 'zero_rating_variance',
      weight: 0.15,
      evaluate(profile) {
        if (profile.reviewCount >= 3 && profile.ratingVariance === 0) {
          return {
            penalty: this.weight,
            reason: `Zero rating variance across ${profile.reviewCount} reviews — all identical stars`
          };
        }
        return { penalty: 0, reason: null };
      }
    },

  ];

  // ── Classification ────────────────────────────────────────────────────────

  function classify(profile) {
    let totalPenalty = 0;
    const firedReasons = [];
    let signalsFired = 0;

    signals.forEach(signal => {
      const result = signal.evaluate(profile);
      if (result.penalty > 0) {
        totalPenalty += result.penalty;
        firedReasons.push(result.reason);
        signalsFired++;
      }
    });

    // Cap at 1.0
    const personaScore = parseFloat(Math.min(1, totalPenalty).toFixed(4));

    // Label
    let personaLabel;
    if (personaScore >= FAKE_THRESHOLD)  personaLabel = 'fake';
    else if (personaScore >= DUMMY_THRESHOLD) personaLabel = 'dummy';
    else personaLabel = 'real';

    // Confidence
    let personaConfidence;
    if (signalsFired >= 3)     personaConfidence = 'high';
    else if (signalsFired >= 2) personaConfidence = 'medium';
    else                        personaConfidence = 'low';

    return {
      ...profile,
      personaLabel,
      personaScore,
      personaReasons    : firedReasons,
      personaConfidence,
      signalsFired,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {

    /**
     * classifyAll(profileMap)
     * @param  {Map} profileMap  — from UserProfileBuilder.buildProfiles()
     * @returns PersonaResult
     * {
     *   profiles     : ClassifiedProfile[]  — all profiles with personaLabel etc.
     *   summary      : PersonaSummary
     * }
     *
     * PersonaSummary:
     *   real         : Number
     *   dummy        : Number
     *   fake         : Number
     *   total        : Number
     *   fakePercent  : Number  0–100
     *   dummyPercent : Number  0–100
     *   realPercent  : Number  0–100
     *   topFakeUsers : ClassifiedProfile[]  — top 3 by personaScore
     */
    classifyAll(profileMap) {
      const profiles = Array.from(profileMap.values()).map(classify);

      let real = 0, dummy = 0, fake = 0;
      profiles.forEach(p => {
        if (p.personaLabel === 'real')  real++;
        if (p.personaLabel === 'dummy') dummy++;
        if (p.personaLabel === 'fake')  fake++;
      });

      const total = profiles.length || 1;
      const topFakeUsers = profiles
        .filter(p => p.personaLabel === 'fake')
        .sort((a, b) => b.personaScore - a.personaScore)
        .slice(0, 3);

      const summary = {
        real,
        dummy,
        fake,
        total         : profiles.length,
        realPercent   : parseFloat(((real  / total) * 100).toFixed(1)),
        dummyPercent  : parseFloat(((dummy / total) * 100).toFixed(1)),
        fakePercent   : parseFloat(((fake  / total) * 100).toFixed(1)),
        topFakeUsers,
      };

      return { profiles, summary };
    },

    /**
     * classifyOne(profile)
     * Classify a single UserProfile. Useful for real-time incremental use.
     */
    classifyOne(profile) {
      return classify(profile);
    },

    // Signals exposed for testing / future extension
    _signals: signals,
    FAKE_THRESHOLD,
    DUMMY_THRESHOLD,
  };

})();
