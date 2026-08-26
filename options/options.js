// Speed Controller - Stats dashboard

// Your PayPal.me username (the part after paypal.me/).
const PAYPAL_USERNAME = 'AkilRajpariLLC';

function paypalUrl(amount) {
  const base = `https://www.paypal.me/${PAYPAL_USERNAME}`;
  return amount ? `${base}/${amount}USD` : base;
}

const DEFAULT_SHORTCUTS = {
  increaseSpeed:   { code: 'Period', shift: true, ctrl: false, alt: false, meta: false },
  decreaseSpeed:   { code: 'Comma',  shift: true, ctrl: false, alt: false, meta: false },
  resetSpeed:      { code: 'Slash',  shift: true, ctrl: false, alt: false, meta: false },
  toggleIndicator: { code: 'KeyV',   shift: true, ctrl: false, alt: false, meta: false }
};

let shortcuts = { ...DEFAULT_SHORTCUTS };

// ---- Formatting ----
function fmtDuration(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ---- Streaks ----
function computeStreaks(daily) {
  const active = new Set(
    Object.keys(daily).filter((k) => (daily[k].watchedSec || 0) > 0)
  );
  if (active.size === 0) return { current: 0, longest: 0 };

  // Current streak: walk back from today (or yesterday if today is empty).
  let current = 0;
  const d = new Date();
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

// ---- Render ----
function renderCards(stats) {
  document.getElementById('timeSaved').textContent = fmtDuration(stats.totalTimeSavedSec);
  document.getElementById('timeSkipped').textContent = fmtDuration(stats.timeSkippedSec);
  document.getElementById('introsSkipped').textContent = stats.introsSkipped || 0;
  document.getElementById('timeWatched').textContent = fmtDuration(stats.totalTimeWatchedSec);
}

function renderChart(daily) {
  const chart = document.getElementById('chart');
  const empty = document.getElementById('chartEmpty');
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

function prettifySlug(slug) {
  return slug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderSeries(seriesStats) {
  const list = document.getElementById('seriesList');
  const empty = document.getElementById('seriesEmpty');
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
    { icon: '☕', title: 'First hour', desc: '1h saved', earned: savedH >= 1 },
    { icon: '⏱️', title: 'Time bender', desc: '5h saved', earned: savedH >= 5 },
    { icon: '🚀', title: 'Speed demon', desc: '10h saved', earned: savedH >= 10 },
    { icon: '🏆', title: 'Marathoner', desc: '25h saved', earned: savedH >= 25 },
    { icon: '💎', title: 'Time lord', desc: '50h saved', earned: savedH >= 50 },
    { icon: '👑', title: 'Legend', desc: '100h saved', earned: savedH >= 100 },
    { icon: '⏭️', title: 'Skipper', desc: '10 skips', earned: skips >= 10 },
    { icon: '⚡', title: 'No filler', desc: '100 skips', earned: skips >= 100 }
  ];

  const el = document.getElementById('badges');
  el.innerHTML = '';
  for (const b of defs) {
    const div = document.createElement('div');
    div.className = 'badge ' + (b.earned ? 'earned' : 'locked');
    div.innerHTML = `
      <span class="badge-icon">${b.icon}</span>
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
  if (sc.meta) parts.push('⌘');
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

// ---- Init ----
async function init() {
  const local = await chrome.storage.local.get({
    stats: { totalTimeSavedSec: 0, totalTimeWatchedSec: 0, introsSkipped: 0, timeSkippedSec: 0 },
    seriesStats: {},
    daily: {}
  });
  const sync = await chrome.storage.sync.get({ shortcuts: DEFAULT_SHORTCUTS });
  shortcuts = { ...DEFAULT_SHORTCUTS, ...(sync.shortcuts || {}) };

  renderCards(local.stats);
  renderChart(local.daily);
  renderSeries(local.seriesStats);
  renderBadges(local.stats);
  renderShortcuts();

  const streaks = computeStreaks(local.daily);
  document.getElementById('streakNum').textContent = streaks.current;
  document.getElementById('longestStreak').textContent = `Longest streak: ${streaks.longest} day${streaks.longest === 1 ? '' : 's'}`;
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

document.getElementById('openGlobalShortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

document.querySelectorAll('.tip-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: paypalUrl(btn.dataset.amount) });
  });
});

document.getElementById('resetStats').addEventListener('click', async () => {
  if (!confirm('Reset all watch stats? This cannot be undone.')) return;
  await chrome.storage.local.set({
    stats: { totalTimeSavedSec: 0, totalTimeWatchedSec: 0, introsSkipped: 0, timeSkippedSec: 0 },
    seriesStats: {},
    daily: {}
  });
  init();
});

init();
