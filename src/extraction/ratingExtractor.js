// ─────────────────────────────────────────────────────────────────────────────
// ratingExtractor.js  —  TrustLens Stage 2
// Extracts NON-TEXT rating signals from product pages.
//
// Returns a RatingProfile object:
// {
//   platform          : "amazon" | "flipkart" | "unknown"
//   overallRating     : Number   — the displayed aggregate star rating (e.g. 4.1)
//   totalRatings      : Number   — total number of ratings (may differ from reviews)
//   totalReviews      : Number   — total number of text reviews
//   ratingHistogram   : { 5, 4, 3, 2, 1 }  — count or percentage per star band
//   verifiedRatio     : Number   — 0–1, fraction of reviews marked "Verified Purchase"
//   imageReviewCount  : Number   — reviews that contain at least one image
//   videoReviewCount  : Number   — reviews that contain at least one video
//   helpfulVoteTotal  : Number   — sum of all helpful votes across visible reviews
//   topReviewerCount  : Number   — reviewers with a "Top Reviewer" or "Hall of Fame" badge
//   incentivizedCount : Number   — reviews flagged "I received this product for free…"
//   starDistributionSkew : Number — synthetic skew score (see below)
//   extractedAt       : ISO timestamp
// }
//
// starDistributionSkew:
//   A value in [-1, +1].
//   Positive = suspiciously polarised toward 5-star.
//   Negative = suspiciously polarised toward 1-star.
//   Near 0   = natural bell-curve distribution.
//   Formula: (pct5 - pct1) / (pct5 + pct1 + ε)  weighted by total volume.
//   High positive skew (+0.7 and above) combined with low review count → fake risk.
// ─────────────────────────────────────────────────────────────────────────────

const RatingExtractor = (() => {

  // ── Helpers ──────────────────────────────────────────────────────────────

  function safeInt(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
  }

  function safeFloat(str) {
    if (!str) return 0;
    const m = str.match(/[\d.]+/);
    return m ? parseFloat(m[0]) : 0;
  }

  function firstMatch(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (_) { /* invalid selector — skip */ }
    }
    return null;
  }

  function allMatches(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const els = root.querySelectorAll(sel);
        if (els && els.length > 0) return Array.from(els);
      } catch (_) { /* skip */ }
    }
    return [];
  }

  // ── Platform Detection ────────────────────────────────────────────────────

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('amazon')) return 'amazon';
    if (host.includes('flipkart')) return 'flipkart';
    return 'unknown';
  }

  // ── Amazon Extraction ─────────────────────────────────────────────────────

  function extractAmazon() {
    const profile = _blankProfile('amazon');

    // ── Overall star rating ──────────────────────────────────────────────
    const ratingEl = firstMatch([
      '[data-hook="rating-out-of-text"]',
      '#acrPopover .a-size-base.a-color-base',
      '#averageCustomerReviews .a-size-base',
      'span[data-hook="rating-out-of-text"]',
    ]);
    if (ratingEl) profile.overallRating = safeFloat(ratingEl.textContent);

    // ── Total ratings count ──────────────────────────────────────────────
    const totalRatingsEl = firstMatch([
      '#acrCustomerReviewText',
      '[data-hook="total-review-count"]',
      '#ratings-count-text',
    ]);
    if (totalRatingsEl) profile.totalRatings = safeInt(totalRatingsEl.textContent);

    // ── Total reviews count (may differ from ratings if some left no text)
    const totalReviewsEl = firstMatch([
      '[data-hook="cr-filter-info-review-count"]',
      '#filter-info-section [data-hook="cr-filter-info-review-count"]',
    ]);
    if (totalReviewsEl) {
      profile.totalReviews = safeInt(totalReviewsEl.textContent);
    } else {
      profile.totalReviews = profile.totalRatings; // fallback
    }

    // ── Rating histogram ─────────────────────────────────────────────────
    // Amazon renders histogram rows as table cells with aria-label="X stars represent Y%"
    const histogramRows = allMatches([
      '#histogramTable tr',
      '.a-histogram-row',
      '[data-hook="rating-histogram"] tr',
    ]);

    histogramRows.forEach(row => {
      // Try to read the star label (5 star, 4 star…)
      const labelEl = row.querySelector('.a-text-right') || row.querySelector('td:first-child');
      const pctEl   = row.querySelector('.a-text-left')  || row.querySelector('td:last-child');
      if (!labelEl || !pctEl) return;
      const star = safeInt(labelEl.textContent);
      const pct  = safeFloat(pctEl.textContent);
      if (star >= 1 && star <= 5) profile.ratingHistogram[star] = pct;
    });

    // ── Per-review signals ───────────────────────────────────────────────
    const reviewEls = allMatches(['[data-hook="review"]']);

    reviewEls.forEach(r => {
      // Verified Purchase
      const vp = r.querySelector('[data-hook="avp-badge"]') ||
                 r.querySelector('.a-color-state');
      if (vp && /verified/i.test(vp.textContent)) profile._verifiedCount++;

      // Images
      if (r.querySelector('[data-hook="review-image-tile"]') ||
          r.querySelector('.review-image-container')) {
        profile.imageReviewCount++;
      }

      // Videos
      if (r.querySelector('[data-hook="review-video-widget"]') ||
          r.querySelector('.cr-video-widget')) {
        profile.videoReviewCount++;
      }

      // Helpful votes — "X people found this helpful"
      const helpfulEl = r.querySelector('[data-hook="helpful-vote-statement"]');
      if (helpfulEl) {
        profile.helpfulVoteTotal += safeInt(helpfulEl.textContent);
      }

      // Top Reviewer / Hall of Fame badge
      const badges = r.querySelectorAll('.a-badge-text, .a-badge-label');
      badges.forEach(b => {
        if (/top.*reviewer|hall.*fame|vine/i.test(b.textContent)) {
          profile.topReviewerCount++;
        }
      });

      // Incentivized review disclosure
      const bodyEl = r.querySelector('[data-hook="review-body"]');
      if (bodyEl && /received.*free|discount.*exchange|complimentary/i.test(bodyEl.textContent)) {
        profile.incentivizedCount++;
      }
    });

    // Derive verifiedRatio from reviewEls count
    if (reviewEls.length > 0) {
      profile.verifiedRatio = profile._verifiedCount / reviewEls.length;
    }

    return _finalise(profile);
  }

  // ── Flipkart Extraction ───────────────────────────────────────────────────

  function extractFlipkart() {
    const profile = _blankProfile('flipkart');

    // Overall rating — Flipkart uses a plain div with just the number
    const ratingEl = firstMatch([
      'div._3LWZlK',
      'div._2d4LTz',
      '[class*="rating"] > div:first-child',
    ]);
    if (ratingEl) profile.overallRating = safeFloat(ratingEl.textContent);

    // Total ratings + reviews — Flipkart shows "X Ratings & Y Reviews"
    const summaryEl = firstMatch([
      'span._2_R_DZ',
      'span._13vcmD',
      '[class*="ratingsCount"]',
    ]);
    if (summaryEl) {
      const text = summaryEl.textContent;
      const ratingMatch = text.match(/([\d,]+)\s*[Rr]ating/);
      const reviewMatch = text.match(/([\d,]+)\s*[Rr]eview/);
      if (ratingMatch) profile.totalRatings = safeInt(ratingMatch[1]);
      if (reviewMatch) profile.totalReviews = safeInt(reviewMatch[1]);
    }

    // Rating histogram — rows with star count and bar
    const histRows = allMatches([
      'div._3LWZlK + div div',
      '[class*="histogram"] div',
      'div._1b2kPl',
    ]);
    // Flipkart histogram is harder — try reading aria or sibling text
    histRows.forEach((row, i) => {
      const starLabel = row.querySelector('[class*="label"]');
      const pctText   = row.querySelector('[class*="count"]') || row;
      if (starLabel) {
        const star = safeInt(starLabel.textContent);
        if (star >= 1 && star <= 5) {
          profile.ratingHistogram[star] = safeFloat(pctText.textContent);
        }
      }
    });

    // Per-review signals
    const reviewEls = allMatches([
      'div._1AtVbE div._1nAT6l',
      'div[class*="review"]',
      'div._27M-vq',
    ]);

    reviewEls.forEach(r => {
      // Certified buyer badge
      const certified = r.querySelector('[class*="certified"]') ||
                        r.querySelector('[class*="buyer"]');
      if (certified) profile._verifiedCount++;

      // Images
      if (r.querySelector('img[class*="review"]') ||
          r.querySelector('[class*="reviewImage"]')) {
        profile.imageReviewCount++;
      }

      // Helpful votes
      const helpfulEl = r.querySelector('[class*="helpful"]');
      if (helpfulEl) profile.helpfulVoteTotal += safeInt(helpfulEl.textContent);
    });

    if (reviewEls.length > 0) {
      profile.verifiedRatio = profile._verifiedCount / reviewEls.length;
    }

    return _finalise(profile);
  }

  // ── Generic Extraction ────────────────────────────────────────────────────

  function extractGeneric() {
    const profile = _blankProfile('unknown');

    // schema.org AggregateRating
    const aggRating = document.querySelector('[itemprop="aggregateRating"]');
    if (aggRating) {
      const rv = aggRating.querySelector('[itemprop="ratingValue"]');
      const rc = aggRating.querySelector('[itemprop="reviewCount"]') ||
                 aggRating.querySelector('[itemprop="ratingCount"]');
      if (rv) profile.overallRating  = safeFloat(rv.textContent || rv.getAttribute('content') || '');
      if (rc) profile.totalRatings   = safeInt(rc.textContent   || rc.getAttribute('content') || '');
      profile.totalReviews = profile.totalRatings;
    }

    return _finalise(profile);
  }

  // ── Blank profile factory ────────────────────────────────────────────────

  function _blankProfile(platform) {
    return {
      platform,
      overallRating     : 0,
      totalRatings      : 0,
      totalReviews      : 0,
      ratingHistogram   : { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      verifiedRatio     : 0,
      imageReviewCount  : 0,
      videoReviewCount  : 0,
      helpfulVoteTotal  : 0,
      topReviewerCount  : 0,
      incentivizedCount : 0,
      starDistributionSkew: 0,
      extractedAt       : new Date().toISOString(),
      // private working field, stripped before return
      _verifiedCount    : 0,
    };
  }

  // ── Finalise: compute derived metrics, strip private fields ─────────────

  function _finalise(profile) {
    const h = profile.ratingHistogram;

    // starDistributionSkew
    // Uses percentage values if available, otherwise raw counts
    const total = h[5] + h[4] + h[3] + h[2] + h[1];
    if (total > 0) {
      const p5 = h[5] / total;
      const p1 = h[1] / total;
      const eps = 0.001;
      profile.starDistributionSkew = parseFloat(
        ((p5 - p1) / (p5 + p1 + eps)).toFixed(4)
      );
    }

    // Clean private fields
    delete profile._verifiedCount;

    return profile;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    /**
     * extract()
     * Auto-detects platform and returns a RatingProfile.
     * Safe to call at any DOM state — returns zeroed profile on failure.
     */
    extract() {
      try {
        const platform = detectPlatform();
        if (platform === 'amazon')   return extractAmazon();
        if (platform === 'flipkart') return extractFlipkart();
        return extractGeneric();
      } catch (err) {
        console.warn('[TrustLens][RatingExtractor] Extraction failed:', err);
        return _finalise(_blankProfile('unknown'));
      }
    },

    /**
     * extractFromParsedDoc(doc, platform)
     * Same as extract() but operates on a DOMParser-produced document.
     * Used by content.js when processing fetched review pages.
     */
    extractFromParsedDoc(doc, platform = 'amazon') {
      try {
        // Temporarily point helpers at the external doc
        const _first = (sels) => {
          for (const sel of sels) {
            try { const el = doc.querySelector(sel); if (el) return el; } catch (_) {}
          }
          return null;
        };
        const _all = (sels) => {
          for (const sel of sels) {
            try { const els = doc.querySelectorAll(sel); if (els.length) return Array.from(els); } catch (_) {}
          }
          return [];
        };

        const profile = _blankProfile(platform);

        if (platform === 'amazon') {
          const ratingEl = _first(['[data-hook="rating-out-of-text"]', '#acrPopover .a-size-base.a-color-base']);
          if (ratingEl) profile.overallRating = safeFloat(ratingEl.textContent);

          const reviewEls = _all(['[data-hook="review"]']);
          reviewEls.forEach(r => {
            const vp = r.querySelector('[data-hook="avp-badge"]');
            if (vp && /verified/i.test(vp.textContent)) profile._verifiedCount++;
            if (r.querySelector('[data-hook="review-image-tile"]')) profile.imageReviewCount++;
            if (r.querySelector('[data-hook="review-video-widget"]')) profile.videoReviewCount++;
            const hv = r.querySelector('[data-hook="helpful-vote-statement"]');
            if (hv) profile.helpfulVoteTotal += safeInt(hv.textContent);
          });
          if (reviewEls.length > 0) profile.verifiedRatio = profile._verifiedCount / reviewEls.length;
        }

        return _finalise(profile);
      } catch (err) {
        console.warn('[TrustLens][RatingExtractor] extractFromParsedDoc failed:', err);
        return _finalise(_blankProfile(platform));
      }
    },
  };

})();
