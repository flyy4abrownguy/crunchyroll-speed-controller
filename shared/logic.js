// Speed Controller - Shared pure logic
// DOM-free helpers used by the popup, options page, content script and service
// worker. Exposed as globalThis.CSC_LOGIC (and module.exports for unit tests).

(function () {
  'use strict';

  const PAYPAL_USERNAME = 'AkilRajpariLLC';
  const MILESTONE_HOURS = [5, 25, 100];
  const SERIES_SPEED_CAP = 50;
  const PRESETS = [1, 1.25, 1.5, 1.75, 2];

  function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // 1 -> '1', 1.5 -> '1.5', 1.25 -> '1.25' (no trailing zeros, max 2 decimals)
  function fmtSpeed(speed) {
    return String(Number(Number(speed).toFixed(2)));
  }

  // Local-time YYYY-MM-DD
  function dateKey(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function prettifySlug(slug) {
    if (!slug) return '';
    return slug
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }

  function computeStreaks(daily, today = new Date()) {
    const active = new Set(
      Object.keys(daily).filter((k) => (daily[k].watchedSec || 0) > 0)
    );
    if (active.size === 0) return { current: 0, longest: 0 };

    // Current streak: walk back from today (or yesterday if today is empty).
    let current = 0;
    const d = new Date(today);
    if (!active.has(dateKey(d))) d.setDate(d.getDate() - 1);
    while (active.has(dateKey(d))) {
      current++;
      d.setDate(d.getDate() - 1);
    }

    // Longest streak across all recorded days.
    const sorted = [...active].sort();
    let longest = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + 'T00:00:00');
      const cur = new Date(sorted[i] + 'T00:00:00');
      const diff = Math.round((cur - prev) / 86400000);
      run = diff === 1 ? run + 1 : 1;
      if (run > longest) longest = run;
    }
    return { current, longest };
  }

  // Sum of the 7 local days ending today (inclusive).
  function weekTotals(daily, today = new Date()) {
    let savedSec = 0;
    let skips = 0;
    const d = new Date(today);
    for (let i = 0; i < 7; i++) {
      const day = daily[dateKey(d)];
      if (day) {
        savedSec += day.savedSec || 0;
        skips += day.skips || 0;
      }
      d.setDate(d.getDate() - 1);
    }
    return { savedSec, skips };
  }

  // Slug with the highest watchedSec (> 0), or null.
  function topShow(seriesStats) {
    let best = null;
    let bestSec = 0;
    for (const [slug, s] of Object.entries(seriesStats || {})) {
      const sec = (s && s.watchedSec) || 0;
      if (sec > bestSec) {
        best = slug;
        bestSec = sec;
      }
    }
    return best;
  }

  // Highest milestone reached that hasn't been shown yet, or null.
  function nextMilestone(totalSavedSec, state) {
    const { shown = [], done = false } = state || {};
    if (done) return null;
    const hours = totalSavedSec / 3600;
    const reached = MILESTONE_HOURS.filter((h) => h <= hours);
    if (reached.length === 0) return null;
    const highest = reached[reached.length - 1];
    return shown.includes(highest) ? null : highest;
  }

  function planSpeedSave({ userInitiated, rememberSpeed, hasVideo, slug, slugResolved }) {
    const global = !!(userInitiated && rememberSpeed && hasVideo);
    return { global, series: global && !!slug && !!slugResolved };
  }

  // Returns a new map with slug set to speed as the newest entry, trimmed to cap.
  function withSeriesSpeed(map, slug, speed, cap = SERIES_SPEED_CAP) {
    const out = { ...map };
    delete out[slug];
    out[slug] = speed;
    const keys = Object.keys(out);
    for (let i = 0; i < keys.length - cap; i++) delete out[keys[i]];
    return out;
  }

  function paypalUrl(amount) {
    const base = `https://www.paypal.me/${PAYPAL_USERNAME}`;
    return amount ? `${base}/${amount}USD` : base;
  }

  function reviewUrl(extensionId) {
    return `https://chromewebstore.google.com/detail/${extensionId}/reviews`;
  }

  function parseUrl(url) {
    try {
      return new URL(url);
    } catch (e) {
      return null;
    }
  }

  function isWatchUrl(url) {
    const u = parseUrl(url);
    if (!u) return false;
    if (u.hostname.includes('crunchyroll.com')) return u.pathname.includes('/watch/');
    if (u.hostname.includes('hidive.com')) return u.pathname.includes('/video/');
    return false;
  }

  function isSupportedUrl(url) {
    const u = parseUrl(url);
    return !!u && (u.hostname.includes('crunchyroll.com') || u.hostname.includes('hidive.com'));
  }

  function popupMode({ supported, watchUrl, response, error }) {
    if (!supported) return 'idle';
    if (response && response.hasVideo) return 'watching';
    if (watchUrl) return error ? 'idle-reload' : 'idle-broken';
    return 'idle';
  }

  function isFeedbackSuccess(status, body) {
    if (status < 200 || status >= 300) return false;
    body = body || '';
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed.ok === true;
    } catch (e) {
      // not JSON
    }
    if (/did not return anything/i.test(body)) return true;
    if (/<html|<!doctype/i.test(body)) return false;
    return true;
  }

  // Keys to write: defaults missing from existing, plus perSeriesSpeed forced on.
  function migrateSyncSettings(existing, defaults) {
    const out = {};
    for (const key of Object.keys(defaults)) {
      if (!(key in existing)) out[key] = defaults[key];
    }
    if (existing.perSeriesSpeed !== true) out.perSeriesSpeed = true;
    return out;
  }

  const api = {
    PAYPAL_USERNAME,
    MILESTONE_HOURS,
    SERIES_SPEED_CAP,
    PRESETS,
    fmtDuration,
    fmtSpeed,
    dateKey,
    prettifySlug,
    computeStreaks,
    weekTotals,
    topShow,
    nextMilestone,
    planSpeedSave,
    withSeriesSpeed,
    paypalUrl,
    reviewUrl,
    isWatchUrl,
    isSupportedUrl,
    popupMode,
    isFeedbackSuccess,
    migrateSyncSettings
  };

  if (typeof module !== 'undefined') module.exports = api;
  globalThis.CSC_LOGIC = api;
})();
