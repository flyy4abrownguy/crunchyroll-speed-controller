// Speed Controller - Options page: stats, settings, shortcuts, feedback

const L = globalThis.CSC_LOGIC;
const ICONS = globalThis.CSC_ICONS;
const { fmtDuration, dateKey, computeStreaks, prettifySlug, paypalUrl } = L;

const $ = (id) => document.getElementById(id);

const DEFAULT_SHORTCUTS = {
  increaseSpeed:   { code: 'Period', shift: true, ctrl: false, alt: false, meta: false },
  decreaseSpeed:   { code: 'Comma',  shift: true, ctrl: false, alt: false, meta: false },
  resetSpeed:      { code: 'Slash',  shift: true, ctrl: false, alt: false, meta: false },
  toggleIndicator: { code: 'KeyV',   shift: true, ctrl: false, alt: false, meta: false }
};

const DEFAULT_STATS = { totalTimeSavedSec: 0, totalTimeWatchedSec: 0, introsSkipped: 0, timeSkippedSec: 0 };
const FEEDBACK_COOLDOWN_MS = 5 * 60 * 1000;

let shortcuts = { ...DEFAULT_SHORTCUTS };

function paintIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const markup = ICONS[el.dataset.icon];
    if (markup) el.innerHTML = markup; // trusted static constants
  });
}

// ---- Render ----
function renderCards(stats) {
  $('timeSaved').textContent = fmtDuration(stats.totalTimeSavedSec);
  $('timeSkipped').textContent = fmtDuration(stats.timeSkippedSec);
  $('introsSkipped').textContent = stats.introsSkipped || 0;
  $('timeWatched').textContent = fmtDuration(stats.totalTimeWatchedSec);
}

function renderChart(daily) {
  const chart = $('chart');
  const empty = $('chartEmpty');
  chart.innerHTML = '';

  const days = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dateKey(d);
    days.push({ key: k, saved: (daily[k] && daily[k].savedSec) || 0, isToday: i === 0 });
  }

  const max = Math.max(...days.map((d) => d.saved), 1);
  const anyData = days.some((d) => d.saved > 0);
  empty.hidden = anyData;
  chart.style.display = anyData ? 'flex' : 'none';

  for (const d of days) {
    const bar = document.createElement('div');
    bar.className = 'chart-bar' + (d.saved > 0 ? ' has-data' : '') + (d.isToday ? ' today' : '');
    bar.style.height = `${Math.max(3, (d.saved / max) * 140)}px`;
    bar.title = `${d.key}: ${fmtDuration(d.saved)} saved`;
    chart.appendChild(bar);
  }
}

function renderSeries(seriesStats) {
  const list = $('seriesList');
  const empty = $('seriesEmpty');
  list.innerHTML = '';

  const rows = Object.entries(seriesStats)
    .map(([slug, s]) => ({ slug, ...s }))
    .sort((a, b) => b.watchedSec - a.watchedSec)
    .slice(0, 6);

  empty.hidden = rows.length > 0;
  if (rows.length === 0) return;

  const max = Math.max(...rows.map((r) => r.watchedSec), 1);
  rows.forEach((r, i) => {
    const pct = Math.max(0, Math.min(100, (r.watchedSec / max) * 100));
    const row = document.createElement('div');
    row.className = 'series-row';
    // Structure via innerHTML, but inject the URL-derived name via textContent
    // so a crafted series slug can never become markup.
    row.innerHTML = `
      <span class="series-rank">${i + 1}</span>
      <span class="series-name"></span>
      <span class="series-bar-track"><span class="series-bar-fill" style="width:${pct}%"></span></span>
      <span class="series-time">${fmtDuration(r.savedSec)} saved</span>`;
    row.querySelector('.series-name').textContent = prettifySlug(r.slug);
    list.appendChild(row);
  });
}

function renderBadges(stats) {
  const savedH = (stats.totalTimeSavedSec || 0) / 3600;
  const skips = stats.introsSkipped || 0;
  const defs = [
    { icon: 'clock', title: 'First hour', desc: '1h saved', earned: savedH >= 1 },
    { icon: 'chart', title: 'Time bender', desc: '5h saved', earned: savedH >= 5 },
    { icon: 'plus', title: 'Speed demon', desc: '10h saved', earned: savedH >= 10 },
    { icon: 'trophy', title: 'Marathoner', desc: '25h saved', earned: savedH >= 25 },
    { icon: 'star', title: 'Time lord', desc: '50h saved', earned: savedH >= 50 },
    { icon: 'heart', title: 'Legend', desc: '100h saved', earned: savedH >= 100 },
    { icon: 'skip', title: 'Skipper', desc: '10 skips', earned: skips >= 10 },
    { icon: 'check', title: 'No filler', desc: '100 skips', earned: skips >= 100 }
  ];

  const el = $('badges');
  el.innerHTML = '';
  for (const b of defs) {
    const div = document.createElement('div');
    div.className = 'badge ' + (b.earned ? 'earned' : 'locked');
    // Icon markup is a trusted constant from shared/icons.js; text is static.
    div.innerHTML = `
      <span class="badge-icon icon">${ICONS[b.icon] || ''}</span>
      <span class="badge-text">
        <span class="badge-title">${b.title}</span>
        <span class="badge-desc">${b.desc}</span>
      </span>`;
    el.appendChild(div);
  }
}

// ---- Shortcuts ----
function codeToLabel(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'",
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
    Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`'
  };
  return map[code] || code;
}

function shortcutLabel(sc) {
  if (!sc || !sc.code) return 'None';
  const parts = [];
  if (sc.ctrl) parts.push('Ctrl');
  if (sc.alt) parts.push('Alt');
  if (sc.shift) parts.push('Shift');
  if (sc.meta) parts.push('Cmd');
  parts.push(codeToLabel(sc.code));
  return parts.join(' + ');
}

let capturingAction = null;
function renderShortcuts() {
  document.querySelectorAll('.shortcut-key').forEach((btn) => {
    const action = btn.dataset.action;
    btn.textContent = capturingAction === action ? 'Press keys…' : shortcutLabel(shortcuts[action]);
    btn.classList.toggle('capturing', capturingAction === action);
  });
}

// ---- Settings ----
const SPEED_STEP_FALLBACK = 0.25;

function setSpeedStepControl(value) {
  const select = $('speedStep');
  let step = Number(value);
  if (!Number.isFinite(step) || step <= 0) step = SPEED_STEP_FALLBACK;
  let match = [...select.options].find((o) => Math.abs(Number(o.value) - step) < 1e-9);
  if (!match) {
    // A stored value outside the three presets (older versions or manual
    // edits): show it as its own option rather than silently rewriting it.
    match = document.createElement('option');
    match.value = String(step);
    match.textContent = `${L.fmtSpeed(step)}x`;
    select.appendChild(match);
  }
  select.value = match.value;
}

function wireSettings() {
  for (const key of ['rememberSpeed', 'showIndicator', 'autoSkip']) {
    $(key).addEventListener('change', (e) => {
      chrome.storage.sync.set({ [key]: e.target.checked });
    });
  }
  $('speedStep').addEventListener('change', (e) => {
    chrome.storage.sync.set({ speedStep: parseFloat(e.target.value) });
  });
}

// ---- Feedback ----
function setFeedbackStatus(text, kind) {
  const el = $('feedbackStatus');
  el.textContent = text;
  el.className = 'feedback-status' + (kind ? ` ${kind}` : '');
}

async function submitFeedback() {
  const msgEl = $('feedbackMsg');
  const button = $('feedbackSubmit');
  const message = msgEl.value.trim();
  if (!message) {
    setFeedbackStatus('Write a message first', 'error');
    return;
  }

  const { lastFeedbackTime } = await chrome.storage.local.get({ lastFeedbackTime: 0 });
  if (Date.now() - lastFeedbackTime < FEEDBACK_COOLDOWN_MS) {
    setFeedbackStatus('You just sent one. Try again in a few minutes.', 'error');
    return;
  }

  const type = document.querySelector('input[name="fbType"]:checked').value;
  const version = chrome.runtime.getManifest().version;

  button.disabled = true;
  setFeedbackStatus('Sending…', '');
  try {
    const { speed } = await chrome.storage.sync.get({ speed: 1 });
    const response = await chrome.runtime.sendMessage({
      action: 'submitFeedback',
      data: { type, message, version, speed, timestamp: new Date().toISOString() }
    });
    if (response && response.success) {
      setFeedbackStatus("Thanks, it's on its way.", 'success');
      msgEl.value = '';
      await chrome.storage.local.set({ lastFeedbackTime: Date.now() });
    } else {
      setFeedbackStatus("Couldn't send. Try again later.", 'error');
    }
  } catch (e) {
    setFeedbackStatus("Couldn't send. Try again later.", 'error');
  } finally {
    button.disabled = false;
  }
}

// ---- Init ----
function renderStats(local) {
  renderCards(local.stats);
  renderChart(local.daily);
  renderSeries(local.seriesStats);
  renderBadges(local.stats);

  const streaks = computeStreaks(local.daily, new Date());
  $('streakNum').textContent = streaks.current;
  $('streakBadge').classList.toggle('active', streaks.current > 0);
  $('longestStreak').textContent = `Longest streak: ${streaks.longest} day${streaks.longest === 1 ? '' : 's'}`;
}

async function loadStats() {
  const local = await chrome.storage.local.get({ stats: DEFAULT_STATS, seriesStats: {}, daily: {} });
  renderStats(local);
}

// The page is built from static sections, but the stats above #settings and
// #feedback change height once they render. Re-assert the anchor afterwards so
// a deep link from the popup lands on its section.
function scrollToHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id && $(id);
  if (target) target.scrollIntoView();
}

async function init() {
  paintIcons();
  wireSettings();

  const sync = await chrome.storage.sync.get({
    shortcuts: DEFAULT_SHORTCUTS,
    rememberSpeed: true,
    showIndicator: true,
    speedStep: SPEED_STEP_FALLBACK,
    autoSkip: true
  });
  $('rememberSpeed').checked = sync.rememberSpeed !== false;
  $('showIndicator').checked = sync.showIndicator !== false;
  $('autoSkip').checked = sync.autoSkip !== false;
  setSpeedStepControl(sync.speedStep);

  shortcuts = { ...DEFAULT_SHORTCUTS, ...(sync.shortcuts || {}) };
  renderShortcuts();

  await loadStats();
  scrollToHash();
}

document.querySelectorAll('.shortcut-key').forEach((btn) => {
  btn.addEventListener('click', () => {
    capturingAction = capturingAction === btn.dataset.action ? null : btn.dataset.action;
    renderShortcuts();
  });
});

document.addEventListener('keydown', (e) => {
  if (!capturingAction) return;
  const mods = ['Shift', 'Control', 'Alt', 'Meta', 'ShiftLeft', 'ShiftRight',
    'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];
  e.preventDefault();
  if (e.key === 'Escape') { capturingAction = null; renderShortcuts(); return; }
  if (mods.includes(e.code)) return;
  shortcuts[capturingAction] = {
    code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey
  };
  capturingAction = null;
  chrome.storage.sync.set({ shortcuts });
  renderShortcuts();
});

$('openGlobalShortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

$('tipLink').href = paypalUrl();

$('feedbackSubmit').addEventListener('click', submitFeedback);
$('feedbackMsg').addEventListener('input', () => setFeedbackStatus('', ''));
document.querySelectorAll('input[name="fbType"]').forEach((r) => {
  r.addEventListener('change', () => setFeedbackStatus('', ''));
});

$('resetStats').addEventListener('click', async () => {
  if (!confirm('Reset all watch stats? This cannot be undone.')) return;
  const cleared = { stats: { ...DEFAULT_STATS }, seriesStats: {}, daily: {} };
  await chrome.storage.local.set(cleared);
  renderStats(cleared);
});

window.addEventListener('hashchange', scrollToHash);

init();
