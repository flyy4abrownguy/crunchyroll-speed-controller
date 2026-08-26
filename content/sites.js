// Speed Controller - Site Registry
// Defines per-site behavior so the content script stays generic across
// multiple streaming sites. Loaded before content.js and exposed as a global.

(function () {
  'use strict';

  // Matches the WHOLE label of a "skip" control (intro / outro / recap / credits).
  // Anchored on both ends so we never click things like "Skip to next episode".
  const SKIP_TEXT_RE = /^skip(\s+(intro|opening|op|outro|ending|ed|recap|credits|preview))?(\s+button)?[\s.!›»→]*$/i;

  // Resolved series slug for the current watch page (see getSeriesSlug below).
  let crSlugCache = { path: null, slug: null };

  const SITES = [
    {
      id: 'crunchyroll',
      label: 'Crunchyroll',
      test: (host) => host.includes('crunchyroll.com'),
      // Known Crunchyroll skip-button hooks. Classes are hashed, so these are
      // best-effort; the text fallback in content.js covers the rest.
      skipSelectors: [
        '[data-testid="skipIntroButton"]',
        '[data-testid="skipButton"]',
        '.skip-intro__button',
        '.skip-button'
      ],
      skipTextRe: SKIP_TEXT_RE,
      // Series identity.
      //
      // Series pages are /series/{id}/{series-slug} — the slug is the show.
      // Watch pages are /watch/{id}/{episode-slug}, where the slug is the
      // EPISODE title ("maomao", "the-garden-party"), NOT the series. Keying
      // off it would give every episode its own bucket, so on watch pages we
      // read the one /series/ link the page renders instead, and only fall
      // back to the episode slug while that link has yet to render.
      getSeriesSlug: () => {
        const path = location.pathname;
        const LANG = '(?:[a-z]{2}(?:-[a-zA-Z]{2})?\\/)?';

        const seriesMatch = path.match(new RegExp(`^\\/${LANG}series\\/([^/]+)(?:\\/([^/]+))?`));
        if (seriesMatch) return seriesMatch[2] || seriesMatch[1];

        const watchMatch = path.match(new RegExp(`^\\/${LANG}watch\\/[^/]+\\/([^/]+)`));
        if (!watchMatch) return null;

        // Cached per path so the 1 Hz main loop doesn't re-query the DOM.
        if (crSlugCache.path === path && crSlugCache.slug) return crSlugCache.slug;

        const link = document.querySelector('a[href*="/series/"]');
        const href = link ? link.getAttribute('href') || '' : '';
        const fromLink = href.match(/\/series\/([^/?#]+)(?:\/([^/?#]+))?/);
        if (fromLink) {
          const slug = fromLink[2] || fromLink[1];
          crSlugCache = { path, slug };
          return slug;
        }

        // Series link not rendered yet — don't cache, retry next tick.
        return watchMatch[1].replace(/-episode-\d+.*$/, '');
      }
    },
    {
      id: 'hidive',
      label: 'HIDIVE',
      test: (host) => host.includes('hidive.com'),
      skipSelectors: [
        '[data-testid="skip-button"]',
        '.skip-button',
        'button[aria-label*="skip" i]'
      ],
      skipTextRe: SKIP_TEXT_RE,
      // HIDIVE watch URLs vary; fall back to the first meaningful path segment.
      getSeriesSlug: () => {
        const parts = location.pathname.split('/').filter(Boolean);
        // e.g. /video/12345/my-series-title or /season/1234/my-series
        const idx = parts.findIndex((p) => /^\d+$/.test(p));
        if (idx >= 0 && parts[idx + 1]) {
          return parts[idx + 1].replace(/-e(pisode)?-?\d+.*$/i, '');
        }
        return parts[parts.length - 1] || null;
      }
    }
  ];

  function getActiveSite() {
    const host = location.hostname;
    return SITES.find((s) => s.test(host)) || null;
  }

  window.CSC_SITES = SITES;
  window.CSC_getActiveSite = getActiveSite;
})();
