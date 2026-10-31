// Speed Controller - Popup
// Two states: "watching" (supported site with a video) and "idle" (anything
// else), plus a one-time milestone thank-you card. Shared helpers come from
// ../shared/logic.js (CSC_LOGIC) and icons from ../shared/icons.js (CSC_ICONS).

(function () {
  'use strict';

  const L = globalThis.CSC_LOGIC;
  const ICONS = globalThis.CSC_ICONS;

  const MIN_SPEED = 0.25;
  const MAX_SPEED = 4;
  const PROBE_RETRIES = 3;
  const PROBE_DELAY_MS = 400;
  const CONFIRM_MS = 3000;
  const MILESTONE_SEEN_MS = 2000;

  const HINT_DEFAULT = 'Open an episode on Crunchyroll or HIDIVE to change speed';
  const HINT_RELOAD = 'Reload this page to turn on speed controls';

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const sameSpeed = (a, b) => Math.abs(a - b) < 0.001;

  const state = {
    tab: null,
    speed: 1,
    speedStep: 0.25,
    rememberSpeed: true,
    slug: '',
    slugResolved: false,
    showName: '',
    confirmTimer: null,
    milestone: null // { n, shown: number[], done: boolean }
  };

  // ---- Setup ----
  function paintIcons() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const markup = ICONS[el.dataset.icon];
      if (markup) el.innerHTML = markup; // trusted static constants
    });
  }

  function buildPresets() {
    const row = $('presets');
    const last = L.PRESETS.length - 1;
    L.PRESETS.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset';
      btn.dataset.speed = String(p);
      btn.textContent = i === 0 || i === last ? `${L.fmtSpeed(p)}x` : L.fmtSpeed(p);
      btn.setAttribute('aria-label', `${L.fmtSpeed(p)}x`);
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return;
        changeSpeed(p);
      });
      row.append(btn);
    });
  }

  function openTab(url) {
    return chrome.tabs.create({ url });
  }

  function openSettings() {
    return openTab(chrome.runtime.getURL('options/options.html#settings'));
  }

  function bindEvents() {
    $('decreaseBtn').addEventListener('click', () => changeSpeed(state.speed - state.speedStep));
    $('increaseBtn').addEventListener('click', () => changeSpeed(state.speed + state.speedStep));
    $('useForAllBtn').addEventListener('click', useForAll);
    $('statsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
    $('settingsBtn').addEventListener('click', openSettings);
    $('idleSettingsBtn').addEventListener('click', openSettings);
    $('notWorkingLink').addEventListener('click', () =>
      openTab(chrome.runtime.getURL('options/options.html#feedback'))
    );

    document.querySelectorAll('.autoskip-toggle').forEach((box) => {
      box.addEventListener('change', () => {
        setAutoSkip(box.checked);
        chrome.storage.sync.set({ autoSkip: box.checked });
      });
    });

    $('dismissMilestone').addEventListener('click', dismissMilestone);
    $('tipBtn').addEventListener('click', () => finishMilestone(L.paypalUrl()));
    $('rateBtn').addEventListener('click', () => finishMilestone(L.reviewUrl(chrome.runtime.id)));
  }

  // ---- Tab + content script ----
  async function resolveTab() {
    const tabId = new URLSearchParams(location.search).get('tabId');
    try {
      if (tabId) return await chrome.tabs.get(Number(tabId)); // E2E test hook
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch (e) {
      return null;
    }
  }

  async function askSpeed(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'getSpeed' });
      return { response, error: null };
    } catch (error) {
      return { response: null, error };
    }
  }

  // ---- Rendering ----
  function show(mode) {
    const watching = mode === 'watching';
    $('watching').hidden = !watching;
    $('idle').hidden = watching;
    if (!watching) {
      $('idleHint').textContent = mode === 'idle-reload' ? HINT_RELOAD : HINT_DEFAULT;
      $('notWorkingLink').hidden = mode !== 'idle-broken';
    }
    document.body.dataset.mode = mode;
  }

  function setAutoSkip(on) {
    document.querySelectorAll('.autoskip-toggle').forEach((box) => {
      box.checked = !!on;
    });
  }

  function renderStats(local) {
    const daily = isObj(local.daily) ? local.daily : {};
    const stats = isObj(local.stats) ? local.stats : {};
    const now = new Date();

    const week = L.weekTotals(daily, now);
    const weekText = L.fmtDuration(week.savedSec);
    $('weekSaved').textContent = `${weekText} saved this week`;
    $('idleWeekSaved').textContent = weekText;

    const streak = L.computeStreaks(daily, now).current;
    const intros = week.skips === 1 ? 'intro' : 'intros';
    $('idleWeekMeta').textContent = `${week.skips} ${intros} skipped · ${streak}-day streak`;

    $('allTimeSaved').textContent = L.fmtDuration(Number(stats.totalTimeSavedSec) || 0);

    const top = L.topShow(isObj(local.seriesStats) ? local.seriesStats : {});
    $('topShowTile').hidden = !top;
    if (top) {
      const name = L.prettifySlug(top);
      $('topShowName').textContent = name;
      $('topShowName').title = name;
    }
  }

  function renderWatching(response) {
    const site = response.siteLabel || '';
    state.speed = Number(response.speed) || 1;
    state.slug = response.slug || '';
    state.slugResolved = !!response.slugResolved;
    // Until the show is known (Crunchyroll's series link not read yet, a
    // HIDIVE URL with only an id) the slug is an episode title or a number.
    state.showName = (state.slugResolved && L.prettifySlug(state.slug)) || site;

    $('showName').textContent = state.showName;
    $('showName').title = state.showName;
    $('siteLabel').textContent = site;
    renderSpeed();
    renderSeriesLine();
  }

  function renderSpeed() {
    const s = state.speed;
    $('speedValue').textContent = L.fmtSpeed(s);
    $('speedReadout').classList.toggle('is-custom', !sameSpeed(s, 1));
    document.querySelectorAll('.preset').forEach((btn) => {
      const on = sameSpeed(Number(btn.dataset.speed), s);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    $('decreaseBtn').disabled = s <= MIN_SPEED + 0.001;
    $('increaseBtn').disabled = s >= MAX_SPEED - 0.001;
  }

  function renderSeriesLine() {
    if (state.confirmTimer) return; // confirmation text owns the line for now
    const visible = state.rememberSpeed && !!state.slug && state.slugResolved;
    $('seriesLine').hidden = !visible;
    if (!visible) return;
    setSeriesIcon('pin');
    $('seriesText').textContent = `Saved for ${state.showName}`;
    $('useForAllBtn').hidden = false;
  }

  function setSeriesIcon(name) {
    const el = $('seriesIcon');
    el.dataset.icon = name;
    el.innerHTML = ICONS[name];
  }

  function endConfirmation() {
    if (!state.confirmTimer) return;
    clearTimeout(state.confirmTimer);
    state.confirmTimer = null;
    renderSeriesLine();
  }

  // ---- Speed ----
  async function changeSpeed(target) {
    target = Math.round(Math.max(MIN_SPEED, Math.min(MAX_SPEED, target)) * 100) / 100;
    if (sameSpeed(target, state.speed) || !state.tab) return;
    endConfirmation();
    state.speed = target;
    renderSpeed();
    try {
      const res = await chrome.tabs.sendMessage(state.tab.id, { action: 'setSpeed', speed: target });
      if (res && typeof res.speed === 'number') {
        state.speed = res.speed;
        renderSpeed();
      }
    } catch (e) {
      // Tab navigated away or closed; keep the optimistic value.
    }
  }

  async function useForAll() {
    await chrome.storage.sync.set({ seriesSpeeds: {}, speed: state.speed });
    endConfirmation();
    setSeriesIcon('check');
    $('seriesText').textContent = `${L.fmtSpeed(state.speed)}x is now your speed for every show`;
    $('useForAllBtn').hidden = true;
    $('seriesLine').hidden = false;
    state.confirmTimer = setTimeout(() => {
      state.confirmTimer = null;
      renderSeriesLine();
    }, CONFIRM_MS);
  }

  // ---- Milestone prompt ----
  function readMilestonePrompt(raw) {
    const o = isObj(raw) ? raw : {};
    return {
      shown: Array.isArray(o.shown) ? o.shown.filter((h) => Number.isFinite(h)) : [],
      done: o.done === true
    };
  }

  function initMilestone(local) {
    const stats = isObj(local.stats) ? local.stats : {};
    const prompt = readMilestonePrompt(local.milestonePrompt);
    const n = L.nextMilestone(Number(stats.totalTimeSavedSec) || 0, prompt);
    if (n == null) return;
    state.milestone = { n, ...prompt };
    $('milestoneTitle').textContent = `You've saved ${n} hours`;
    $('milestoneCard').hidden = false;
    // Counts as used once it has been on screen for a moment.
    setTimeout(markMilestoneShown, MILESTONE_SEEN_MS);
  }

  function saveMilestone() {
    const { shown, done } = state.milestone;
    return chrome.storage.local.set({ milestonePrompt: { shown, done } });
  }

  function markMilestoneShown() {
    const m = state.milestone;
    if (!m) return Promise.resolve();
    if (!m.shown.includes(m.n)) m.shown = [...m.shown, m.n];
    return saveMilestone();
  }

  async function dismissMilestone() {
    $('milestoneCard').hidden = true;
    await markMilestoneShown();
  }

  async function finishMilestone(url) {
    if (state.milestone) {
      state.milestone.done = true;
      await markMilestoneShown(); // write before the new tab closes the popup
    }
    $('milestoneCard').hidden = true;
    openTab(url);
  }

  // ---- Init ----
  async function init() {
    paintIcons();
    buildPresets();
    bindEvents();

    const [sync, local, tab] = await Promise.all([
      chrome.storage.sync.get({ rememberSpeed: true, speedStep: 0.25, autoSkip: true }),
      chrome.storage.local.get({ stats: {}, seriesStats: {}, daily: {}, milestonePrompt: null }),
      resolveTab()
    ]);

    state.tab = tab;
    state.rememberSpeed = sync.rememberSpeed !== false;
    state.speedStep = Number(sync.speedStep) > 0 ? Number(sync.speedStep) : 0.25;
    setAutoSkip(sync.autoSkip !== false);
    renderStats(local);
    initMilestone(local);

    const url = (tab && tab.url) || '';
    const supported = !!tab && L.isSupportedUrl(url);
    const watchUrl = L.isWatchUrl(url);
    if (!supported) {
      show(L.popupMode({ supported: false }));
      return;
    }

    let probe;
    for (let attempt = 0; ; attempt++) {
      probe = await askSpeed(tab.id);
      const done = probe.error || (probe.response && probe.response.hasVideo);
      if (done || attempt >= PROBE_RETRIES) break;
      // No video yet: show the idle state while we keep listening, instead of
      // a blank popup. The final show(mode) below replaces it (watching hides
      // #idle; idle-broken / idle-reload set the link and hint).
      show('idle');
      await sleep(PROBE_DELAY_MS);
    }

    const mode = L.popupMode({ supported, watchUrl, response: probe.response, error: probe.error });
    if (mode === 'watching') renderWatching(probe.response);
    show(mode);
  }

  init().catch((e) => {
    console.error('Speed Controller popup failed to load', e);
    show('idle');
  });
})();
