// Speed Controller - Content Script
// Works across supported anime sites (see content/sites.js).

(function () {
  'use strict';

  const site = window.CSC_getActiveSite ? window.CSC_getActiveSite() : null;
  if (!site) return; // Not a supported site

  // ---- Constants ----
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 4.0;
  const TICK_MS = 1000;         // main loop period
  const STATS_FLUSH_MS = 15000; // how often to persist stats
  const SKIP_COOLDOWN_MS = 4000;
  const SKIP_VERIFY_MS = 500;      // how long to wait before checking the jump
  const SKIP_MIN_JUMP_SEC = 1.5;   // jump beyond natural playback to count as a skip
  const DEAD_TARGET_LIMIT = 3;     // give up on a control after this many no-ops
  const MAX_DAILY_DAYS = 60;
  const MAX_SERIES = 100;

  const DEFAULT_SHORTCUTS = {
    increaseSpeed:   { code: 'Period', shift: true, ctrl: false, alt: false, meta: false },
    decreaseSpeed:   { code: 'Comma',  shift: true, ctrl: false, alt: false, meta: false },
    resetSpeed:      { code: 'Slash',  shift: true, ctrl: false, alt: false, meta: false },
    toggleIndicator: { code: 'KeyV',   shift: true, ctrl: false, alt: false, meta: false }
  };

  // ---- State ----
  let currentSpeed = 1.0;
  let showIndicator = true;
  let speedStep = 0.25;
  let rememberSpeed = true;
  // Per-show memory is always on in v2.1 (the UI toggle is gone); a missing
  // key must never disable it.
  let perSeriesSpeed = true;
  let seriesSpeeds = {};
  // Path whose per-show speed has been applied (or overridden by the user).
  let appliedSeriesPath = null;
  let autoSkip = true;
  let shortcuts = { ...DEFAULT_SHORTCUTS };

  let indicatorElement = null;
  let indicatorTimeout = null;
  let videoElement = null;
  let isVideoFrame = false;
  let lastUrl = location.href;
  let lastSkipAt = 0;
  // Controls that matched the skip heuristics but never moved the video.
  const deadSkipTargets = new WeakMap();

  // In-memory stat accumulators (flushed periodically)
  let stats = { totalTimeSavedSec: 0, totalTimeWatchedSec: 0, introsSkipped: 0, timeSkippedSec: 0 };
  let seriesStats = {};
  let daily = {};
  let lastFlush = Date.now();
  let dirty = false;

  // ---- Init ----
  async function init() {
    const settings = await chrome.storage.sync.get({
      speed: 1.0,
      rememberSpeed: true,
      showIndicator: true,
      speedStep: 0.25,
      perSeriesSpeed: true,
      seriesSpeeds: {},
      autoSkip: true,
      shortcuts: DEFAULT_SHORTCUTS
    });

    showIndicator = settings.showIndicator;
    speedStep = settings.speedStep;
    rememberSpeed = settings.rememberSpeed;
    perSeriesSpeed = settings.perSeriesSpeed;
    seriesSpeeds = settings.seriesSpeeds || {};
    autoSkip = settings.autoSkip;
    shortcuts = { ...DEFAULT_SHORTCUTS, ...(settings.shortcuts || {}) };

    if (settings.rememberSpeed) currentSpeed = settings.speed;

    // Sets currentSpeed if this show has a saved speed; if the series slug
    // hasn't resolved yet, the main loop retries every tick.
    applySeriesSpeedIfReady();

    const local = await chrome.storage.local.get({
      stats: stats, seriesStats: {}, daily: {}
    });
    stats = { ...stats, ...local.stats };
    seriesStats = local.seriesStats || {};
    daily = local.daily || {};

    findAndSetupVideo();
    observeVideoChanges();

    // Main loop: keep speed applied, track time, auto-skip, detect SPA nav.
    setInterval(mainLoop, TICK_MS);

    window.addEventListener('popstate', checkUrlChange);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushStats(true); });
    window.addEventListener('pagehide', () => flushStats(true));

    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.storage.onChanged.addListener(onStorageChanged);

    console.log('[Speed Controller] initialized on', site.label);
  }

  // ---- Main loop ----
  function mainLoop() {
    const videos = document.querySelectorAll('video');
    if (videos.length > 0 && !videoElement) findAndSetupVideo();
    applySeriesSpeedIfReady();

    // Ensure our speed sticks (sites reset playbackRate on segment changes).
    videos.forEach((v) => { if (v.playbackRate !== currentSpeed) v.playbackRate = currentSpeed; });

    checkUrlChange();
    if (autoSkip) tryAutoSkip();

    // Time tracking (only in the frame that owns the video).
    if (isVideoFrame && videoElement && !videoElement.paused && !videoElement.ended) {
      const secs = TICK_MS / 1000;
      const saved = currentSpeed > 1.0 ? secs * (1 - 1 / currentSpeed) : 0;
      stats.totalTimeWatchedSec += secs;
      stats.totalTimeSavedSec += saved;
      addToDaily({ watchedSec: secs, savedSec: saved });
      addToSeries({ watchedSec: secs, savedSec: saved });
      dirty = true;
    }

    if (dirty && Date.now() - lastFlush >= STATS_FLUSH_MS) flushStats();
  }

  // ---- Stats helpers ----
  function todayKey() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function addToDaily(delta) {
    const k = todayKey();
    const entry = daily[k] || { savedSec: 0, watchedSec: 0, skips: 0 };
    entry.savedSec += delta.savedSec || 0;
    entry.watchedSec += delta.watchedSec || 0;
    entry.skips += delta.skips || 0;
    daily[k] = entry;
  }

  function addToSeries(delta) {
    const slug = site.getSeriesSlug();
    if (!slug) return;
    const entry = seriesStats[slug] || { watchedSec: 0, savedSec: 0, skips: 0 };
    entry.watchedSec += delta.watchedSec || 0;
    entry.savedSec += delta.savedSec || 0;
    entry.skips += delta.skips || 0;
    seriesStats[slug] = entry;
  }

  function pruneMaps() {
    const dayKeys = Object.keys(daily).sort();
    while (dayKeys.length > MAX_DAILY_DAYS) delete daily[dayKeys.shift()];

    const seriesKeys = Object.keys(seriesStats);
    if (seriesKeys.length > MAX_SERIES) {
      // Drop least-watched series first.
      seriesKeys
        .sort((a, b) => seriesStats[a].watchedSec - seriesStats[b].watchedSec)
        .slice(0, seriesKeys.length - MAX_SERIES)
        .forEach((k) => delete seriesStats[k]);
    }
  }

  function flushStats(force = false) {
    if (!isVideoFrame) return;      // never let a non-video frame clobber stats
    if (!dirty && !force) return;
    pruneMaps();
    chrome.storage.local.set({
      stats: {
        totalTimeSavedSec: Math.round(stats.totalTimeSavedSec),
        totalTimeWatchedSec: Math.round(stats.totalTimeWatchedSec),
        introsSkipped: stats.introsSkipped,
        timeSkippedSec: Math.round(stats.timeSkippedSec)
      },
      seriesStats,
      daily
    });
    lastFlush = Date.now();
    dirty = false;
  }

  // ---- Auto-skip ----
  function isVisible(el) {
    return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  function findSkipButton() {
    for (const sel of site.skipSelectors) {
      const el = document.querySelector(sel);
      if (isVisible(el) && !el.disabled) return el;
    }
    const candidates = document.querySelectorAll('button, [role="button"], a[role="button"]');
    for (const el of candidates) {
      if (!isVisible(el) || el.disabled) continue;
      const txt = (el.textContent || el.getAttribute('aria-label') || '').trim();
      if (txt && txt.length <= 30 && site.skipTextRe.test(txt)) return el;
    }
    return null;
  }

  function tryAutoSkip() {
    if (Date.now() - lastSkipAt < SKIP_COOLDOWN_MS) return;
    const btn = findSkipButton();
    if (!btn) return;
    // A control we've clicked repeatedly without the video ever moving isn't a
    // skip button. Stop pestering it.
    if ((deadSkipTargets.get(btn) || 0) >= DEAD_TARGET_LIMIT) return;

    lastSkipAt = Date.now();
    const before = videoElement ? videoElement.currentTime : 0;
    btn.click();

    // Confirm the click actually skipped something before reporting it.
    setTimeout(() => {
      if (!isVideoFrame || !videoElement) return;   // can't verify, so don't claim
      const delta = Math.max(0, videoElement.currentTime - before);

      // The video keeps playing while we wait, and faster at higher speeds, so
      // a real skip is a jump clearly beyond that baseline. Without this, normal
      // playback gets reported as "Skipped 1s" every cooldown.
      const natural = (SKIP_VERIFY_MS / 1000) * currentSpeed;
      if (delta <= natural + SKIP_MIN_JUMP_SEC) {
        deadSkipTargets.set(btn, (deadSkipTargets.get(btn) || 0) + 1);
        return;
      }

      deadSkipTargets.delete(btn);
      const jumped = Math.round(delta);
      stats.introsSkipped += 1;
      stats.timeSkippedSec += jumped;
      addToDaily({ skips: 1 });
      addToSeries({ skips: 1 });
      dirty = true;
      showSkipToast(jumped);
    }, SKIP_VERIFY_MS);
  }

  // ---- Indicator ----
  function createIndicator() {
    if (indicatorElement) return;
    indicatorElement = document.createElement('div');
    indicatorElement.id = 'csc-speed-indicator';
    indicatorElement.className = 'csc-indicator';
    indicatorElement.textContent = `${currentSpeed.toFixed(2)}x`;
    document.body.appendChild(indicatorElement);
  }

  function showSpeedIndicator(speed) {
    if (!showIndicator || !indicatorElement) return;
    indicatorElement.textContent = `${speed.toFixed(2)}x`;
    indicatorElement.classList.add('visible');
    indicatorElement.classList.toggle('modified', Math.abs(speed - 1.0) > 0.01);

    if (indicatorTimeout) clearTimeout(indicatorTimeout);
    indicatorTimeout = setTimeout(() => indicatorElement.classList.remove('visible'), 1500);
  }

  function hideIndicator() {
    if (indicatorElement) indicatorElement.classList.remove('visible');
  }

  let skipToastEl = null;
  let skipToastTimeout = null;
  function showSkipToast(delta) {
    if (!showIndicator) return;
    if (!skipToastEl) {
      skipToastEl = document.createElement('div');
      skipToastEl.id = 'csc-skip-toast';
      document.body.appendChild(skipToastEl);
    }
    skipToastEl.textContent = delta > 0 ? `⏭ Skipped ${delta}s` : '⏭ Skipped';
    skipToastEl.classList.add('visible');
    if (skipToastTimeout) clearTimeout(skipToastTimeout);
    skipToastTimeout = setTimeout(() => skipToastEl.classList.remove('visible'), 1600);
  }

  // ---- Video setup ----
  function findAndSetupVideo() {
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      videoElement = videos[0];
      isVideoFrame = true;
      createIndicator();
      setVideoSpeed(currentSpeed, { showUI: false });

      videoElement.addEventListener('loadeddata', () => setVideoSpeed(currentSpeed, { showUI: false }));
      videoElement.addEventListener('play', () => {
        if (videoElement.playbackRate !== currentSpeed) videoElement.playbackRate = currentSpeed;
      });
    } else {
      setTimeout(findAndSetupVideo, 1000);
    }
  }

  function observeVideoChanges() {
    const observer = new MutationObserver(() => {
      const newVideo = document.querySelector('video');
      if (newVideo && newVideo !== videoElement) {
        videoElement = newVideo;
        isVideoFrame = true;
        createIndicator();
        setVideoSpeed(currentSpeed, { showUI: false });
        newVideo.addEventListener('loadeddata', () => setVideoSpeed(currentSpeed, { showUI: false }));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function checkUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    applySeriesSpeedIfReady();
  }

  // Apply this show's saved speed once per page path, as soon as the series
  // slug has resolved. A user speed change on the path also marks it applied,
  // so the user's choice wins over a late per-show apply.
  function applySeriesSpeedIfReady() {
    if (!(rememberSpeed && perSeriesSpeed)) return;
    const info = site.getSeriesInfo();
    if (!info.resolved) return;
    if (appliedSeriesPath === location.pathname) return;
    appliedSeriesPath = location.pathname;
    if (hasSeriesSpeed(info.slug)) setVideoSpeed(seriesSpeeds[info.slug]);
  }

  // Own-property check, so a slug like "constructor" never reads the prototype.
  function hasSeriesSpeed(slug) {
    return !!slug && Object.prototype.hasOwnProperty.call(seriesSpeeds, slug);
  }

  // ---- Speed control ----
  // save: true only for user-initiated changes (popup, commands, shortcuts).
  // Video loads and per-show applies never write to storage.
  function setVideoSpeed(speed, { showUI = true, save = false } = {}) {
    speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
    speed = Math.round(speed * 100) / 100;
    currentSpeed = speed;

    document.querySelectorAll('video').forEach((v) => { v.playbackRate = speed; });
    if (showUI) showSpeedIndicator(speed);

    if (save) appliedSeriesPath = location.pathname;

    const info = site.getSeriesInfo();
    const plan = CSC_LOGIC.planSpeedSave({
      userInitiated: save,
      rememberSpeed,
      hasVideo: isVideoFrame,
      slug: info.slug,
      slugResolved: info.resolved
    });
    if (plan.global) chrome.storage.sync.set({ speed });
    if (plan.series) {
      seriesSpeeds = CSC_LOGIC.withSeriesSpeed(seriesSpeeds, info.slug, speed, CSC_LOGIC.SERIES_SPEED_CAP);
      chrome.storage.sync.set({ seriesSpeeds });
    }
    return speed;
  }

  // ---- Messaging ----
  function speedInfo() {
    const info = site.getSeriesInfo();
    return {
      speed: currentSpeed,
      hasVideo: !!videoElement,
      slug: info.slug,
      slugResolved: info.resolved,
      siteLabel: site.label,
      seriesSaved: hasSeriesSpeed(info.slug)
    };
  }

  // Returns true only when sendResponse will be called asynchronously.
  function handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'setSpeed':
        sendResponse({ success: true, speed: setVideoSpeed(message.speed, { save: true }) });
        break;
      case 'getSpeed':
        // The frame that owns the video answers right away.
        if (videoElement) {
          sendResponse(speedInfo());
          return false;
        }
        // Other frames without a video stay silent.
        if (window !== window.top) return false;
        // Top frame without a video: answer late so a player iframe wins.
        setTimeout(() => sendResponse(speedInfo()), 300);
        return true;
      case 'increaseSpeed':
        sendResponse({ success: true, speed: setVideoSpeed(currentSpeed + speedStep, { save: true }) });
        break;
      case 'decreaseSpeed':
        sendResponse({ success: true, speed: setVideoSpeed(currentSpeed - speedStep, { save: true }) });
        break;
      case 'resetSpeed':
        sendResponse({ success: true, speed: setVideoSpeed(1.0, { save: true }) });
        break;
      case 'toggleIndicator':
        showIndicator = message.show !== undefined ? message.show : !showIndicator;
        if (!showIndicator) hideIndicator();
        sendResponse({ success: true, showIndicator });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return false;
  }

  // Keep in-memory settings in sync with popup/options changes.
  function onStorageChanged(changes, area) {
    if (area !== 'sync') return;
    if (changes.showIndicator) {
      showIndicator = changes.showIndicator.newValue;
      if (!showIndicator) hideIndicator();
    }
    if (changes.speedStep) speedStep = changes.speedStep.newValue;
    if (changes.rememberSpeed) rememberSpeed = changes.rememberSpeed.newValue !== false;
    if (changes.perSeriesSpeed) perSeriesSpeed = changes.perSeriesSpeed.newValue !== false;
    if (changes.autoSkip) autoSkip = changes.autoSkip.newValue;
    if (changes.shortcuts) shortcuts = { ...DEFAULT_SHORTCUTS, ...(changes.shortcuts.newValue || {}) };
    if (changes.seriesSpeeds) seriesSpeeds = changes.seriesSpeeds.newValue || {};
  }

  // ---- Configurable in-page shortcuts ----
  function matchShortcut(e, sc) {
    return !!sc && e.code === sc.code &&
      e.shiftKey === !!sc.shift && e.ctrlKey === !!sc.ctrl &&
      e.altKey === !!sc.alt && e.metaKey === !!sc.meta;
  }

  document.addEventListener('keydown', (e) => {
    if (!isVideoFrame && window.top !== window) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    for (const [action, sc] of Object.entries(shortcuts)) {
      if (!matchShortcut(e, sc)) continue;
      e.preventDefault();
      if (action === 'increaseSpeed') setVideoSpeed(currentSpeed + speedStep, { save: true });
      else if (action === 'decreaseSpeed') setVideoSpeed(currentSpeed - speedStep, { save: true });
      else if (action === 'resetSpeed') setVideoSpeed(1.0, { save: true });
      else if (action === 'toggleIndicator') {
        showIndicator = !showIndicator;
        chrome.storage.sync.set({ showIndicator });
        if (!showIndicator) hideIndicator();
      }
      break;
    }
  });

  // ---- Boot ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
