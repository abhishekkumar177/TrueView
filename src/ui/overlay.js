// ─────────────────────────────────────────────────────────────────────────────
// overlay.js  —  TrustLens Stage 2 UI
//
// Renders a fixed overlay panel on the product page with 4 tabs:
//   [Overview]  [Sentiment]  [Personas]  [Reviews]
//
// Reads the full result object assembled by content.js.
// ─────────────────────────────────────────────────────────────────────────────

const TrustLensUI = (() => {

  const ID = 'trustlens-overlay';

  // ── Colour helpers ────────────────────────────────────────────────────────

  function ratingColor(rating) {
    if (rating >= 4.0) return '#4ade80';
    if (rating >= 3.0) return '#facc15';
    return '#f87171';
  }

  function fakeColor(pct) {
    if (pct >= 40) return '#f87171';
    if (pct >= 20) return '#fb923c';
    return '#4ade80';
  }

  function personaLabelColor(label) {
    if (label === 'fake')  return '#f87171';
    if (label === 'dummy') return '#fb923c';
    return '#4ade80';
  }

  function stars(n) {
    const full  = Math.round(n);
    return '★'.repeat(Math.max(0, full)) + '☆'.repeat(Math.max(0, 5 - full));
  }

  // ── Tab renderer helpers ──────────────────────────────────────────────────

  function pill(text, color) {
    return `<span class="tl-pill" style="background:${color}22;color:${color};border:1px solid ${color}44">${text}</span>`;
  }

  function statCard(label, value, color) {
    return `<div class="tl-stat-card">
      <span class="tl-stat-val" style="color:${color}">${value}</span>
      <span class="tl-stat-label">${label}</span>
    </div>`;
  }

  function progressBar(pct, color) {
    return `<div class="tl-bar-bg"><div class="tl-bar-fill" style="width:${Math.min(100,pct)}%;background:${color}"></div></div>`;
  }

  // ── Tab 1: Overview ───────────────────────────────────────────────────────

  function tabOverview(r) {
    const delta = (r.originalRating - r.trustRating).toFixed(2);
    const deltaSign = delta > 0 ? `−${delta}` : `+${Math.abs(delta)}`;

    return `
    <div class="tl-section">
      <div class="tl-rating-hero">
        <div>
          <div class="tl-hero-label">Trust Rating</div>
          <div class="tl-hero-val" style="color:${ratingColor(r.trustRating)}">${r.trustRating} ★</div>
          <div class="tl-hero-sub">${stars(r.trustRating)}</div>
        </div>
        <div class="tl-hero-divider"></div>
        <div>
          <div class="tl-hero-label">Original</div>
          <div class="tl-hero-val tl-dim">${r.originalRating} ★</div>
          <div class="tl-hero-sub" style="color:${delta > 0 ? '#f87171' : '#4ade80'}">${deltaSign} adjusted</div>
        </div>
      </div>
    </div>

    <div class="tl-stat-row">
      ${statCard('Fake Reviews',   r.fakePercent + '%',        fakeColor(r.fakePercent))}
      ${statCard('Suspicious',     r.suspiciousCount,           '#fb923c')}
      ${statCard('Trusted',        r.trustedCount,              '#4ade80')}
      ${statCard('Total Analysed', r.total,                     '#94a3b8')}
    </div>

    <div class="tl-section">
      <div class="tl-section-title">Page-level Signals</div>
      <div class="tl-row"><span>Verified Purchase %</span><span>${r.verifiedPercent}%</span></div>
      <div class="tl-row"><span>Reviews with Media</span><span>${r.mediaPercent}%</span></div>
      <div class="tl-row"><span>Avg Review Length</span><span>${r.avgWordCount} words</span></div>
      <div class="tl-row"><span>Helpful Votes Total</span><span>${r.ratingProfile?.helpfulVoteTotal ?? '–'}</span></div>
      <div class="tl-row"><span>Star Skew Score</span><span>${r.ratingProfile?.starDistributionSkew ?? '–'}</span></div>
    </div>

    ${r.ratingProfile?.ratingHistogram ? renderHistogram(r.ratingProfile.ratingHistogram) : ''}
    `;
  }

  function renderHistogram(h) {
    const max = Math.max(...Object.values(h), 1);
    const rows = [5,4,3,2,1].map(star => {
      const val = h[star] || 0;
      const pct = Math.round((val / max) * 100);
      const color = star >= 4 ? '#4ade80' : star === 3 ? '#facc15' : '#f87171';
      return `<div class="tl-hist-row">
        <span class="tl-hist-star">${star}★</span>
        <div class="tl-bar-bg tl-hist-bar"><div class="tl-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="tl-hist-val">${val}%</span>
      </div>`;
    }).join('');
    return `<div class="tl-section"><div class="tl-section-title">Rating Distribution</div>${rows}</div>`;
  }

  // ── Tab 2: Sentiment ──────────────────────────────────────────────────────

  function tabSentiment(r) {
    const s = r.sentimentSummary || {};
    const mismatchPct = r.mismatchPercent || 0;

    return `
    <div class="tl-stat-row">
      ${statCard('Text Implied Rating', (s.avgImpliedRating || 0) + ' ★', ratingColor(s.avgImpliedRating || 0))}
      ${statCard('Given Rating',        (s.avgGivenRating  || 0) + ' ★', ratingColor(s.avgGivenRating  || 0))}
    </div>

    <div class="tl-section">
      <div class="tl-section-title">Mismatch Analysis</div>
      <div class="tl-row"><span>Text vs Star Mismatch</span><span style="color:${fakeColor(mismatchPct)}">${mismatchPct}%</span></div>
      ${progressBar(mismatchPct, fakeColor(mismatchPct))}
      <div class="tl-row tl-mt"><span>Inflated Stars</span><span style="color:#f87171">${s.inflatedCount ?? 0} reviews</span></div>
      <div class="tl-row"><span>Deflated Stars</span><span style="color:#fb923c">${s.deflatedCount ?? 0} reviews</span></div>
      <div class="tl-row"><span>Low Confidence Text</span><span style="color:#64748b">${s.lowConfidenceCount ?? 0} reviews</span></div>
    </div>

    <div class="tl-section">
      <div class="tl-section-title">What This Means</div>
      <p class="tl-explain">
        ${mismatchPct >= 30
          ? '⚠️ A high proportion of reviews have text that <strong>disagrees</strong> with their star rating — a strong signal of coordinated fake reviews.'
          : mismatchPct >= 15
          ? '⚡ Some reviews show star/text disagreement. This could indicate a mix of genuine and planted reviews.'
          : '✅ Most reviews have text that matches their star rating — a good sign of authenticity.'}
      </p>
    </div>
    `;
  }

  // ── Tab 3: Personas ───────────────────────────────────────────────────────

  function tabPersonas(r) {
    const ps = r.personaSummary || {};
    const profiles = (r.personaProfiles || [])
      .sort((a, b) => b.personaScore - a.personaScore)
      .slice(0, 12);

    const donut = renderDonut(ps.real || 0, ps.dummy || 0, ps.fake || 0);

    const profileCards = profiles.map(p => {
      const color = personaLabelColor(p.personaLabel);
      const reasons = (p.personaReasons || []).slice(0, 2).map(reason =>
        `<li class="tl-reason">${reason}</li>`
      ).join('');
      return `
      <div class="tl-persona-card" style="border-left:3px solid ${color}">
        <div class="tl-persona-top">
          <span class="tl-persona-name">${escHtml(p.username)}</span>
          ${pill(p.personaLabel.toUpperCase(), color)}
          <span class="tl-persona-score">${Math.round(p.personaScore * 100)}%</span>
        </div>
        <div class="tl-persona-meta">
          ${p.reviewCount} review${p.reviewCount > 1 ? 's' : ''}
          &nbsp;·&nbsp; avg ${p.avgRating}★
          &nbsp;·&nbsp; ${p.verifiedCount > 0 ? '✓ verified' : '✗ unverified'}
        </div>
        ${reasons ? `<ul class="tl-reasons">${reasons}</ul>` : ''}
      </div>`;
    }).join('');

    return `
    ${donut}

    <div class="tl-stat-row">
      ${statCard('Real Users',    (ps.realPercent  || 0) + '%', '#4ade80')}
      ${statCard('Dummy Accounts',(ps.dummyPercent || 0) + '%', '#fb923c')}
      ${statCard('Fake Accounts', (ps.fakePercent  || 0) + '%', '#f87171')}
    </div>

    <div class="tl-section">
      <div class="tl-section-title">User Breakdown (top ${profiles.length})</div>
      ${profileCards || '<p class="tl-dim tl-small">No user profiles extracted.</p>'}
    </div>
    `;
  }

  function renderDonut(real, dummy, fake) {
    const total = real + dummy + fake || 1;
    const rP = (real  / total) * 100;
    const dP = (dummy / total) * 100;
    const fP = (fake  / total) * 100;

    // SVG donut via stroke-dasharray on a circle r=40, circumference=251.2
    const C = 251.2;
    const rDash  = (rP  / 100) * C;
    const dDash  = (dP  / 100) * C;
    const fDash  = (fP  / 100) * C;
    const rOff   = 0;
    const dOff   = -(rDash);
    const fOff   = -(rDash + dDash);

    return `
    <div class="tl-donut-wrap">
      <svg viewBox="0 0 100 100" class="tl-donut">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" stroke-width="14"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="#4ade80" stroke-width="14"
          stroke-dasharray="${rDash} ${C - rDash}" stroke-dashoffset="${rOff}"
          transform="rotate(-90 50 50)"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="#fb923c" stroke-width="14"
          stroke-dasharray="${dDash} ${C - dDash}" stroke-dashoffset="${dOff}"
          transform="rotate(-90 50 50)"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="#f87171" stroke-width="14"
          stroke-dasharray="${fDash} ${C - fDash}" stroke-dashoffset="${fOff}"
          transform="rotate(-90 50 50)"/>
        <text x="50" y="46" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="bold">${Math.round(rP)}%</text>
        <text x="50" y="58" text-anchor="middle" fill="#64748b" font-size="7">Real</text>
      </svg>
      <div class="tl-donut-legend">
        <div class="tl-legend-item"><span class="tl-legend-dot" style="background:#4ade80"></span>Real (${real})</div>
        <div class="tl-legend-item"><span class="tl-legend-dot" style="background:#fb923c"></span>Dummy (${dummy})</div>
        <div class="tl-legend-item"><span class="tl-legend-dot" style="background:#f87171"></span>Fake (${fake})</div>
      </div>
    </div>`;
  }

  // ── Tab 4: Reviews ────────────────────────────────────────────────────────

  function tabReviews(r) {
    const reviews = (r.scoredReviews || [])
      .sort((a, b) => (b.fakeScore || 0) - (a.fakeScore || 0))
      .slice(0, 20);

    const cards = reviews.map(rev => {
      const label = rev.label || 'trusted';
      const color = label === 'fake' ? '#f87171' : label === 'suspicious' ? '#fb923c' : '#4ade80';
      const fakePct = Math.round((rev.combinedFakeScore || rev.fakeScore || 0) * 100);
      const mismatch = rev.mismatchDirection !== 'none' && rev.mismatchDirection
        ? `<span class="tl-tag" style="color:#fb923c">↕ ${rev.mismatchDirection}</span>` : '';
      const verified = rev.verified
        ? `<span class="tl-tag" style="color:#4ade80">✓ verified</span>` : '';
      const snippet = escHtml((rev.text || '').slice(0, 100)) + ((rev.text || '').length > 100 ? '…' : '');

      return `
      <div class="tl-review-card" style="border-left:3px solid ${color}">
        <div class="tl-review-top">
          <span class="tl-review-user">${escHtml(rev.username || 'Anonymous')}</span>
          <span class="tl-review-rating">${rev.rating}★</span>
          ${pill(label.toUpperCase(), color)}
          <span class="tl-review-score" style="color:${color}">${fakePct}%</span>
        </div>
        <div class="tl-review-tags">${verified}${mismatch}</div>
        <div class="tl-review-text">${snippet}</div>
        <div class="tl-review-meta">
          ${rev.impliedRating ? `implied: ${rev.impliedRating}★` : ''}
          ${rev.wordCount ? `· ${rev.wordCount}w` : ''}
          ${rev.timestamp ? `· ${escHtml(rev.timestamp.replace(/Reviewed in .+ on /i,''))}` : ''}
        </div>
      </div>`;
    }).join('');

    return `
    <div class="tl-section-title tl-mb">Showing top ${reviews.length} by fake score</div>
    ${cards || '<p class="tl-dim">No reviews to display.</p>'}
    `;
  }

  // ── Main render ───────────────────────────────────────────────────────────

  function render(result) {
    // Remove old overlay if any
    const old = document.getElementById(ID);
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = ID;
    overlay.innerHTML = buildHTML(result);
    document.body.appendChild(overlay);

    // Wire close button
    overlay.querySelector('#tl-close').addEventListener('click', () => overlay.remove());

    // Wire tabs
    overlay.querySelectorAll('.tl-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.tl-tab').forEach(t => t.classList.remove('active'));
        overlay.querySelectorAll('.tl-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        overlay.querySelector('#tl-panel-' + tab.dataset.tab).classList.add('active');
      });
    });

    // Wire feedback
    overlay.querySelector('#tl-thumb-up')?.addEventListener('click', () => saveFeedback('up'));
    overlay.querySelector('#tl-thumb-down')?.addEventListener('click', () => saveFeedback('down'));

    // Slide-in animation
    requestAnimationFrame(() => overlay.classList.add('tl-visible'));
  }

  function buildHTML(r) {
    const trustColor = ratingColor(r.trustRating);
    return `
    <div id="tl-panel">
      <div id="tl-header">
        <div id="tl-logo">
          <span id="tl-logo-mark">T</span>
          <span id="tl-logo-text">TrustLens</span>
          <span id="tl-badge" style="background:${trustColor}22;color:${trustColor};border:1px solid ${trustColor}44">
            ${r.trustRating}★ Trust
          </span>
        </div>
        <button id="tl-close" title="Close">✕</button>
      </div>

      <div id="tl-tabs">
        <button class="tl-tab active" data-tab="overview">Overview</button>
        <button class="tl-tab" data-tab="sentiment">Sentiment</button>
        <button class="tl-tab" data-tab="personas">Personas</button>
        <button class="tl-tab" data-tab="reviews">Reviews</button>
      </div>

      <div id="tl-body">
        <div class="tl-tab-panel active" id="tl-panel-overview">${tabOverview(r)}</div>
        <div class="tl-tab-panel"        id="tl-panel-sentiment">${tabSentiment(r)}</div>
        <div class="tl-tab-panel"        id="tl-panel-personas">${tabPersonas(r)}</div>
        <div class="tl-tab-panel"        id="tl-panel-reviews">${tabReviews(r)}</div>
      </div>

      <div id="tl-footer">
        <span id="tl-footer-text">Was this analysis helpful?</span>
        <button class="tl-thumb" id="tl-thumb-up">👍</button>
        <button class="tl-thumb" id="tl-thumb-down">👎</button>
      </div>
    </div>`;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function saveFeedback(val) {
    try {
      chrome.storage.local.get(['trustlens_feedback'], data => {
        const fb = data.trustlens_feedback || [];
        fb.push({ val, url: window.location.href, ts: Date.now() });
        chrome.storage.local.set({ trustlens_feedback: fb });
      });
    } catch (_) {}
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render };

})();
