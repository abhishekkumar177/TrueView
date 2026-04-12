// src/ui/overlay.js
// Injects the TrustLens overlay panel into the page.

const TrustLensUI = (() => {

  const OVERLAY_ID = 'trustlens-overlay';

  /**
   * Render the overlay with analysis results.
   * @param {object} result - output of TrustEngine.analyze()
   */
  function render(result) {
    remove(); // clear any existing overlay

    if (!result) {
      renderError('No reviews found on this page.');
      return;
    }

    const { originalRating, trustRating, fakePercent, fakeCount,
            suspiciousCount, trustedCount, total, reviews } = result;

    const delta      = (trustRating - originalRating).toFixed(1);
    const deltaSign  = delta >= 0 ? `+${delta}` : delta;
    const deltaClass = delta < 0 ? 'tl-negative' : 'tl-positive';

    const overlay = createElement(`
      <div id="${OVERLAY_ID}" class="tl-overlay">
        <div class="tl-header">
          <span class="tl-logo">TrustLens</span>
          <button class="tl-close" id="tl-close-btn" aria-label="Close">✕</button>
        </div>

        <div class="tl-ratings">
          <div class="tl-rating-block tl-original">
            <span class="tl-label">Original Rating</span>
            <span class="tl-value">${originalRating} ★</span>
          </div>
          <div class="tl-arrow">→</div>
          <div class="tl-rating-block tl-trust">
            <span class="tl-label">Trust Rating</span>
            <span class="tl-value">${trustRating} ★
              <span class="tl-delta ${deltaClass}">${deltaSign}</span>
            </span>
          </div>
        </div>

        <div class="tl-stats">
          <div class="tl-stat">
            <span class="tl-stat-num tl-fake-col">${fakePercent}%</span>
            <span class="tl-stat-lbl">Fake</span>
          </div>
          <div class="tl-stat">
            <span class="tl-stat-num tl-sus-col">${suspiciousCount}</span>
            <span class="tl-stat-lbl">Suspicious</span>
          </div>
          <div class="tl-stat">
            <span class="tl-stat-num tl-ok-col">${trustedCount}</span>
            <span class="tl-stat-lbl">Trusted</span>
          </div>
          <div class="tl-stat">
            <span class="tl-stat-num">${total}</span>
            <span class="tl-stat-lbl">Total</span>
          </div>
        </div>

        <div class="tl-review-list">
          <p class="tl-section-title">Review breakdown</p>
          ${reviews.slice(0, 5).map(reviewCard).join('')}
          ${reviews.length > 5
            ? `<p class="tl-more">+ ${reviews.length - 5} more reviews analyzed</p>`
            : ''}
        </div>

        <div class="tl-feedback">
          <p class="tl-section-title">Was this analysis helpful?</p>
          <div class="tl-feedback-btns">
            <button class="tl-fb-btn" data-value="yes">👍 Yes</button>
            <button class="tl-fb-btn" data-value="no">👎 No</button>
          </div>
          <p class="tl-fb-thanks" style="display:none;">Thanks for your feedback!</p>
        </div>
      </div>
    `);

    document.body.appendChild(overlay);
    bindEvents(overlay);
  }

  function reviewCard(review) {
    const label  = review.label;
    const score  = Math.round(review.fakeScore * 100);
    const preview = review.text
      ? review.text.slice(0, 80) + (review.text.length > 80 ? '…' : '')
      : '(no text)';
    return `
      <div class="tl-review-card tl-lbl-${label}">
        <div class="tl-review-top">
          <span class="tl-badge tl-badge-${label}">${label}</span>
          <span class="tl-fake-score">${score}% fake</span>
        </div>
        <p class="tl-review-text">${preview}</p>
      </div>
    `;
  }

  function renderError(msg) {
    const overlay = createElement(`
      <div id="${OVERLAY_ID}" class="tl-overlay">
        <div class="tl-header">
          <span class="tl-logo">TrustLens</span>
          <button class="tl-close" id="tl-close-btn">✕</button>
        </div>
        <p class="tl-error">${msg}</p>
      </div>
    `);
    document.body.appendChild(overlay);
    bindEvents(overlay);
  }

  function bindEvents(overlay) {
    overlay.querySelector('#tl-close-btn').addEventListener('click', remove);

    // Feedback buttons
    overlay.querySelectorAll('.tl-fb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        chrome.storage.local.get(['feedback'], ({ feedback }) => {
          const updated = feedback || [];
          updated.push({ value, time: Date.now() });
          chrome.storage.local.set({ feedback: updated });
        });
        overlay.querySelector('.tl-feedback-btns').style.display = 'none';
        overlay.querySelector('.tl-fb-thanks').style.display = 'block';
      });
    });
  }

  function remove() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
  }

  function createElement(html) {
    const div = document.createElement('div');
    div.innerHTML = html.trim();
    return div.firstChild;
  }

  return { render, remove };
})();
