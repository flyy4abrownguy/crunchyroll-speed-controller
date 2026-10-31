// Speed Controller - Site Registry
// Defines per-site behavior so the content script stays generic across
// multiple streaming sites. Loaded before content.js and exposed as a global.

(function () {
  'use strict';

  // Matches the WHOLE label of a "skip" control (intro / outro / recap / credits).
  // Anchored on both ends so we never click things like "Skip to next episode".
  const SKIP_TEXT_RE = /^skip(\s+(intro|opening|op|outro|ending|ed|recap|credits|preview))?(\s+button)?[\s.!›»→]*$/i;

  // Resolved series slug for the current watch page (see crunchyrollSeriesInfo).
  let crSlugCache = { path: null, slug: null };
  // Link-derived slug seen on a watch path but not yet confirmed: {path, slug, at}.
  let crCandidate = { path: null, slug: null, at: 0 };
  // After an in-page navigation the DOM can still be the previous page's for a
  // moment (Back/Forward fires before React re-renders), and a home or browse
  // page is full of other shows' /series/ links. So once the path has changed,
  // a link slug only counts after two reads at least about one main-loop tick
  // (1 s) apart. The page's own first path is trusted on the first read.
  const CR_CONFIRM_MS = 900;
  const crInitialPath = location.pathname;
  let crNavigated = false;
  window.addEventListener('popstate', () => { crNavigated = true; });

  // Series identity on Crunchyroll.
  //
  // Series pages are /series/{id}/{series-slug} — the slug is the show.
  // Watch pages are /watch/{id}/{episode-slug}, where the slug is the
  // EPISODE title ("maomao", "the-garden-party"), NOT the series. Keying
  // off it would give every episode its own bucket, so on watch pages we
  // read the one /series/ link the page renders instead, and only fall
  // back to the episode slug while that link has yet to render (or, after
  // an in-page navigation, has yet to be confirmed). The fallback is
  // reported as resolved: false so callers never persist it.
  function crunchyrollSeriesInfo() {
    const path = location.pathname;
    if (path !== crInitialPath) crNavigated = true;
    const LANG = '(?:[a-z]{2}(?:-[a-zA-Z]{2})?\\/)?';

    const seriesMatch = path.match(new RegExp(`^\\/${LANG}series\\/([^/]+)(?:\\/([^/]+))?`));
    if (seriesMatch) return { slug: seriesMatch[2] || seriesMatch[1], resolved: true };

    const watchMatch = path.match(new RegExp(`^\\/${LANG}watch\\/[^/]+\\/([^/]+)`));
    if (!watchMatch) return { slug: null, resolved: false };

    // Cached per path so the 1 Hz main loop doesn't re-query the DOM.
    if (crSlugCache.path === path && crSlugCache.slug) return { slug: crSlugCache.slug, resolved: true };

    const unresolved = { slug: watchMatch[1].replace(/-episode-\d+.*$/, '') || null, resolved: false };

    const link = document.querySelector('a[href*="/series/"]');
    const href = link ? link.getAttribute('href') || '' : '';
    const fromLink = href.match(/\/series\/([^/?#]+)(?:\/([^/?#]+))?/);
    if (!fromLink) {
      // Series link not rendered yet — don't cache, retry next tick.
      crCandidate = { path: null, slug: null, at: 0 };
      return unresolved;
    }

    const slug = fromLink[2] || fromLink[1];
    const now = Date.now();
    const confirmed = !crNavigated ||
      (crCandidate.path === path && crCandidate.slug === slug && now - crCandidate.at >= CR_CONFIRM_MS);
    if (confirmed) {
      crSlugCache = { path, slug };
      crCandidate = { path: null, slug: null, at: 0 };
      return { slug, resolved: true };
    }
    if (crCandidate.path !== path || crCandidate.slug !== slug) crCandidate = { path, slug, at: now };
    return unresolved;
  }

  // HIDIVE watch URLs vary; fall back to the first meaningful path segment.
  // A bare number (/video/412345) is an episode id, not a show: unresolved.
  function hidiveSeriesInfo() {
    const parts = location.pathname.split('/').filter(Boolean);
    // e.g. /video/12345/my-series-title or /season/1234/my-series
    const idx = parts.findIndex((p) => /^\d+$/.test(p));
    let slug;
    if (idx >= 0 && parts[idx + 1]) {
      slug = parts[idx + 1].replace(/-e(pisode)?-?\d+.*$/i, '');
    } else {
      slug = parts[parts.length - 1] || null;
    }
    if (!slug || /^\d+$/.test(slug)) return { slug: null, resolved: false };
    return { slug, resolved: true };
  }

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
      getSeriesInfo: crunchyrollSeriesInfo,
      getSeriesSlug: () => crunchyrollSeriesInfo().slug
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
      getSeriesInfo: hidiveSeriesInfo,
      getSeriesSlug: () => hidiveSeriesInfo().slug
    }
  ];

  function getActiveSite() {
    const host = location.hostname;
    return SITES.find((s) => s.test(host)) || null;
  }

  window.CSC_SITES = SITES;
  window.CSC_getActiveSite = getActiveSite;
})();
