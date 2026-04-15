// ─────────────────────────────────────────────────────────────────────────────
// userProfileBuilder.js  —  TrustLens Stage 2
//
// PURPOSE
// -------
// Before we can classify a user as Real / Dummy / Fake, we need to assemble
// everything we know about them into a single UserProfile object.
//
// Amazon does NOT expose email addresses to the page — this is by design and
// cannot be bypassed from a content script without breaking ToS. What we CAN
// extract is a stable Reviewer ID embedded in the profile link URL, which
// serves as the user's unique identifier for this session.
//
// UserProfile fields:
// {
//   reviewerId        : String   — extracted from profile link, e.g. "ABCDE12345"
//                                  Falls back to a normalised username hash if not found
//   username          : String   — display name as shown on page
//   profileUrl        : String   — full URL to reviewer profile (if present)
//   reviewCount       : Number   — how many reviews this user has on this product page
//   ratings           : Number[] — array of star values given by this user
//   avgRating         : Number   — mean of ratings
//   ratingVariance    : Number   — variance of ratings (0 = all same stars)
//   reviewLengths     : Number[] — word counts of each review
//   avgReviewLength   : Number
//   timestamps        : String[] — ISO or raw date strings extracted from reviews
//   reviewDates       : Date[]   — parsed Date objects (where parseable)
//   burstScore        : Number   — 0–1, how clustered the review dates are
//                                  High burst = many reviews in short window
//   allSameRating     : Boolean  — all reviews gave the exact same star value
//   verifiedCount     : Number   — how many of their reviews are "Verified Purchase"
//   hasProfileLink    : Boolean
//   mismatchScores    : Number[] — sentimentMismatch scores (from sentimentRatingEngine)
//   avgMismatchScore  : Number
// }
// ─────────────────────────────────────────────────────────────────────────────

const UserProfileBuilder = (() => {

  // ── Reviewer ID extraction ────────────────────────────────────────────────
  // Amazon embeds the reviewer ID in the profile link:
  //   /gp/profile/amzn1.account.XXXXXX  or  /profile/amzn1.account.XXXXXX
  // We extract the opaque account token as the stable ID.

  function extractReviewerId(profileUrl) {
    if (!profileUrl) return null;
    // amzn1.account.XXXXX or AXXXXXXXXXXXXXX legacy format
    const m = profileUrl.match(/amzn1\.account\.[A-Z0-9]+/i) ||
              profileUrl.match(/\/([A-Z0-9]{13,20})\/?(?:\?|$)/i);
    return m ? m[0] : null;
  }

  // ── Username normalisation ────────────────────────────────────────────────
  // Produces a deterministic string key from a raw display name.

  function normaliseUsername(raw) {
    return (raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  // ── Simple string hash (FNV-1a 32-bit, base36) ───────────────────────────
  // Used as fallback ID when no reviewer link is present.

  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  // ── Date parsing ──────────────────────────────────────────────────────────

  function parseDate(raw) {
    if (!raw) return null;
    // Amazon: "Reviewed in India on 12 March 2024" or "March 12, 2024"
    // Flipkart: "12 Mar, 2024" or "Mar 2024"
    const cleaned = raw
      .replace(/Reviewed in .+ on /i, '')
      .replace(/,/g, '')
      .trim();
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  }

  // ── Burst score ───────────────────────────────────────────────────────────
  // Measures how temporally clustered a user's reviews are.
  // 0 = evenly spread; 1 = all on same day.
  // Only meaningful if reviewCount > 1 and dates are parsed.

  function calcBurstScore(dates) {
    const valid = dates.filter(Boolean).sort((a, b) => a - b);
    if (valid.length < 2) return 0;

    const spanMs = valid[valid.length - 1] - valid[0];
    if (spanMs === 0) return 1; // all same moment

    // median gap
    const gaps = [];
    for (let i = 1; i < valid.length; i++) gaps.push(valid[i] - valid[i - 1]);
    gaps.sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)];

    // If median gap < 1 day among multiple reviews → very bursty
    const ONE_DAY = 86400000;
    const score = Math.max(0, 1 - (medianGap / ONE_DAY));
    return parseFloat(score.toFixed(4));
  }

  // ── Variance ─────────────────────────────────────────────────────────────

  function variance(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sq = arr.map(x => (x - mean) ** 2);
    return parseFloat((sq.reduce((a, b) => a + b, 0) / arr.length).toFixed(4));
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {

    /**
     * buildProfiles(reviews)
     *
     * @param  {Array}  reviews  — enriched review objects, each with at minimum:
     *   { username, profileUrl, rating, wordCount, timestamp, verified,
     *     mismatchScore }
     *   (wordCount and mismatchScore may be absent — handled gracefully)
     *
     * @returns {Map<String, UserProfile>}
     *   Keys are reviewerId (stable) or username hash (fallback).
     *   Values are UserProfile objects.
     */
    buildProfiles(reviews) {
      const profileMap = new Map();

      if (!Array.isArray(reviews) || reviews.length === 0) return profileMap;

      reviews.forEach(review => {
        const rawUsername  = (review.username || 'anonymous').trim();
        const profileUrl   = review.profileUrl || null;
        const reviewerId   = extractReviewerId(profileUrl)
                           || hashString(normaliseUsername(rawUsername));

        if (!profileMap.has(reviewerId)) {
          profileMap.set(reviewerId, {
            reviewerId,
            username       : rawUsername,
            profileUrl     : profileUrl || '',
            hasProfileLink : !!profileUrl,
            reviewCount    : 0,
            ratings        : [],
            avgRating      : 0,
            ratingVariance : 0,
            reviewLengths  : [],
            avgReviewLength: 0,
            timestamps     : [],
            reviewDates    : [],
            burstScore     : 0,
            allSameRating  : true,
            verifiedCount  : 0,
            mismatchScores : [],
            avgMismatchScore: 0,
          });
        }

        const p = profileMap.get(reviewerId);

        p.reviewCount++;

        // Ratings
        const rating = parseFloat(review.rating);
        if (!isNaN(rating)) p.ratings.push(rating);

        // Review length (word count)
        const wc = review.wordCount || (review.cleanedText || review.text || '').split(/\s+/).filter(Boolean).length;
        p.reviewLengths.push(wc);

        // Timestamps
        const ts = review.timestamp || review.date || '';
        if (ts) {
          p.timestamps.push(ts);
          const parsed = parseDate(ts);
          p.reviewDates.push(parsed);
        }

        // Verified
        if (review.verified || review.isVerified) p.verifiedCount++;

        // Mismatch score from sentimentRatingEngine
        if (typeof review.mismatchScore === 'number') {
          p.mismatchScores.push(review.mismatchScore);
        }
      });

      // ── Second pass: compute derived fields ──────────────────────────────
      profileMap.forEach(p => {
        p.avgRating       = mean(p.ratings);
        p.ratingVariance  = variance(p.ratings);
        p.avgReviewLength = Math.round(mean(p.reviewLengths));
        p.burstScore      = calcBurstScore(p.reviewDates);
        p.avgMismatchScore= parseFloat(mean(p.mismatchScores).toFixed(4));

        // allSameRating: true if user gave identical stars to all reviews
        const uniqueRatings = new Set(p.ratings.map(r => Math.round(r)));
        p.allSameRating = uniqueRatings.size <= 1 && p.reviewCount > 1;
      });

      return profileMap;
    },

    /**
     * profilesAsArray(profileMap)
     * Convenience: convert the Map to a plain array for iteration / JSON.
     */
    profilesAsArray(profileMap) {
      return Array.from(profileMap.values());
    },

    // Exposed for unit tests
    _extractReviewerId: extractReviewerId,
    _hashString: hashString,
    _calcBurstScore: calcBurstScore,
  };

})();
