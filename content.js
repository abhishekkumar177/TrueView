// ─────────────────────────────────────────────────────────────────────────────
// content.js  —  TrustLens Stage 2  (entry point)
//
// PIPELINE ORDER
// ──────────────
//  1. Wait for DOM + extract rating profile (non-text signals)
//  2. Fetch up to 8 pages of reviews (multi-page, Stage 1 logic kept)
//  3. Preprocess + feature-engineer every review (Stage 1 modules)
//  4. Run SentimentRatingEngine on every review  (Stage 2 — mismatch)
//  5. Build per-user profiles                    (Stage 2 — userProfileBuilder)
//  6. Run PersonaEngine to classify users         (Stage 2 — personaEngine)
//  7. Score each review with ScoringEngine        (mismatchScore now feeds in)
//  8. Calculate the TrustEngine result
//  9. Render full overlay (Stage 2 UI)
// 10. Store result for popup retrieval
// ─────────────────────────────────────────────────────────────────────────────

(async () => {

  // ── 1. Wait for DOM ───────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 1500));

  // ── Helpers ───────────────────────────────────────────────────────────────

  function isAmazon() {
    return window.location.hostname.includes('amazon');
  }

  function getASIN() {
    const m = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
    return m ? m[1] : null;
  }

  // ── 2. Multi-page review fetch (Amazon only) ──────────────────────────────

  async function fetchReviewPage(asin, pageNumber) {
    try {
      const url = `https://www.amazon.in/product-reviews/${asin}?pageNumber=${pageNumber}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');
      // Use the Stage 2 AmazonAdapter which extracts all new fields
      return new AmazonAdapter().parseFromDoc(doc);
    } catch (err) {
      console.warn('[TrustLens] fetchReviewPage error:', err);
      return [];
    }
  }

  async function fetchMultiPageReviews(maxPages = 8) {
    const asin = getASIN();
    if (!asin) return getAdapter().extractAll();

    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      const reviews = await fetchReviewPage(asin, page);
      if (reviews.length === 0) break;
      all.push(...reviews);
      await new Promise(r => setTimeout(r, 400));
    }
    return all.length > 0 ? all : getAdapter().extractAll();
  }

  // ── Main analysis function ────────────────────────────────────────────────

  async function runAnalysis() {
    try {
      // ── Step 1: Rating profile (non-text signals) ──────────────────────
      const ratingProfile = RatingExtractor.extract();

      // ── Step 2: Fetch reviews ──────────────────────────────────────────
      let rawReviews;
      if (isAmazon()) {
        rawReviews = await fetchMultiPageReviews(8);
      } else {
        // Non-Amazon: scroll to trigger lazy load then extract
        window.scrollTo(0, document.body.scrollHeight / 2);
        await new Promise(r => setTimeout(r, 800));
        rawReviews = getAdapter().extractAll();
      }

      if (!rawReviews || rawReviews.length === 0) {
        console.warn('[TrustLens] No reviews found.');
        return null;
      }

      // ── Step 3: Preprocess + feature engineering (Stage 1) ────────────
      const preprocessed = rawReviews.map(r => {
        const cleaned = Preprocessor.clean(r);
        return FeatureEngineer.extract(cleaned, rawReviews);
      });

      // ── Step 4: Sentiment + mismatch analysis (Stage 2) ───────────────
      const { reviews: sentimentReviews, summary: sentimentSummary } =
        SentimentRatingEngine.analyseAll(preprocessed);

      // ── Step 5: Build user profiles (Stage 2) ─────────────────────────
      const profileMap = UserProfileBuilder.buildProfiles(sentimentReviews);

      // ── Step 6: Persona classification (Stage 2) ──────────────────────
      const personaResult = PersonaEngine.classifyAll(profileMap);

      // ── Step 7: Score each review (mismatchScore now wired in) ────────
      const scoredReviews = sentimentReviews.map(r => ScoringEngine.score(r));

      // ── Step 8: Trust engine ───────────────────────────────────────────
      const trustResult = TrustEngine.analyze(scoredReviews);

      // ── Step 9: Assemble full result ───────────────────────────────────
      const fullResult = {
        // Stage 1 core
        ...trustResult,

        // Stage 2 — rating profile
        ratingProfile,

        // Stage 2 — sentiment
        sentimentSummary,

        // Stage 2 — persona
        personaSummary : personaResult.summary,
        personaProfiles: personaResult.profiles,

        // Convenience fields for popup
        verifiedPercent : Math.round((ratingProfile.verifiedRatio || 0) * 100),
        mediaPercent    : rawReviews.length
          ? Math.round(((ratingProfile.imageReviewCount + ratingProfile.videoReviewCount) / rawReviews.length) * 100)
          : 0,
        avgWordCount    : Math.round(
          sentimentReviews.reduce((s, r) => s + (r.wordCount || 0), 0) / (sentimentReviews.length || 1)
        ),
        mismatchPercent : Math.round((sentimentSummary.mismatchedCount / (sentimentReviews.length || 1)) * 100),
        fakeUsers       : personaResult.summary.fakePercent,
        dummyUsers      : personaResult.summary.dummyPercent,
        realUsers       : personaResult.summary.realPercent,
      };

      // ── Step 10: Persist for popup ────────────────────────────────────
      try {
        chrome.storage.local.set({ trustlens_last_result: fullResult });
      } catch (_) {}

      // ── Step 11: Render overlay ───────────────────────────────────────
      TrustLensUI.render(fullResult);

      return fullResult;

    } catch (err) {
      console.error('[TrustLens] Pipeline error:', err);
      return null;
    }
  }

  // ── Auto-run on page load ─────────────────────────────────────────────────
  runAnalysis();

  // ── Message listener (popup triggers) ────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'ping') {
      sendResponse({ alive: true });
      return true;
    }

    if (msg.action === 'runAnalysis') {
      runAnalysis().then(result => {
        if (result) {
          sendResponse({ success: true, result });
        } else {
          sendResponse({ success: false });
        }
      });
      return true; // keep channel open for async
    }
  });

})();
