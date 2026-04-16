(async () => {
  // 1. Wait for DOM to settle
  await new Promise(r => setTimeout(r, 2000));

  function isAmazon() { return window.location.hostname.includes('amazon'); }

  function getASIN() {
    const m = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
    return m ? m[1] : null;
  }

  async function fetchReviewPage(asin, pageNumber) {
    try {
      const url = `https://www.amazon.in/product-reviews/${asin}?pageNumber=${pageNumber}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      
      // Use the global factory to get the Amazon adapter
      const adapter = getAdapter(); 
      const elements = Array.from(doc.querySelectorAll('[data-hook="review"]'));
      return elements.map(el => adapter.parseReview(el));
    } catch (err) {
      console.warn('[TrustLens] fetchReviewPage error:', err);
      return [];
    }
  }

  async function fetchMultiPageReviews(maxPages = 5) {
    const asin = getASIN();
    if (!asin) return getAdapter().extractAll();
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      const reviews = await fetchReviewPage(asin, page);
      if (reviews.length === 0) break;
      all.push(...reviews);
      await new Promise(r => setTimeout(r, 500)); // Throttling
    }
    return all.length > 0 ? all : getAdapter().extractAll();
  }

  async function runAnalysis() {
    try {
      const ratingProfile = RatingExtractor.extract();
      let rawReviews = isAmazon() ? await fetchMultiPageReviews(5) : getAdapter().extractAll();

      if (!rawReviews || rawReviews.length === 0) return null;

      // STEP 3 FIX: Use Preprocessor.process instead of .clean
      const preprocessed = rawReviews.map(r => {
        const processed = Preprocessor.process(r);
        return { ...processed, features: FeatureEngineer.extract(processed, rawReviews) };
      });

      // STEP 4: Sentiment
      const { reviews: sentimentReviews, summary: sentimentSummary } = 
        SentimentRatingEngine.analyseAll(preprocessed);

      // STEP 5: Profiles
      const profileMap = UserProfileBuilder.buildProfiles(sentimentReviews);

      // STEP 6: Persona
      const personaResult = PersonaEngine.classifyAll(profileMap);

      // STEP 7: Scoring
      const scoredReviews = sentimentReviews.map(r => ({
        ...r,
        fakeScore: ScoringEngine.score(r.features)
      }));

      // STEP 8: Trust Engine
      const trustResult = TrustEngine.analyze(scoredReviews);

      const fullResult = {
        ...trustResult,
        ratingProfile,
        sentimentSummary,
        personaSummary: personaResult.summary,
        personaProfiles: personaResult.profiles,
        verifiedPercent: Math.round((ratingProfile.verifiedRatio || 0) * 100),
        mediaPercent: Math.round(((ratingProfile.imageReviewCount + ratingProfile.videoReviewCount) / rawReviews.length) * 100),
        avgWordCount: Math.round(sentimentReviews.reduce((s, r) => s + (r.wordCount || 0), 0) / sentimentReviews.length),
        mismatchPercent: Math.round((sentimentSummary.mismatchedCount / sentimentReviews.length) * 100),
        fakeUsers: personaResult.summary.fakePercent,
        dummyUsers: personaResult.summary.dummyPercent,
        realUsers: personaResult.summary.realPercent,
      };

      chrome.storage.local.set({ trustlens_last_result: fullResult });
      TrustLensUI.render(fullResult);
      return fullResult;
    } catch (err) {
      console.error('[TrustLens] Pipeline error:', err);
      return null;
    }
  }

  runAnalysis();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'ping') sendResponse({ alive: true });
    if (msg.action === 'runAnalysis') {
      runAnalysis().then(res => sendResponse({ success: !!res, result: res }));
      return true;
    }
  });
})();
