// Crunchyroll Speed Controller - Service Worker

// Supported streaming sites (keep in sync with manifest + content/sites.js).
const SUPPORTED_HOSTS = ['crunchyroll.com', 'hidive.com'];

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !SUPPORTED_HOSTS.some((h) => tab.url.includes(h))) {
    return; // Only work on supported sites
  }

  let action;
  switch (command) {
    case 'increase-speed':
      action = 'increaseSpeed';
      break;
    case 'decrease-speed':
      action = 'decreaseSpeed';
      break;
    case 'reset-speed':
      action = 'resetSpeed';
      break;
    case 'toggle-indicator':
      action = 'toggleIndicator';
      break;
    default:
      return;
  }

  // Send message to content script
  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch (e) {
    console.log('Could not send command to content script:', e.message);
  }
});

const DEFAULT_SHORTCUTS = {
  increaseSpeed:   { code: 'Period', shift: true, ctrl: false, alt: false, meta: false },
  decreaseSpeed:   { code: 'Comma',  shift: true, ctrl: false, alt: false, meta: false },
  resetSpeed:      { code: 'Slash',  shift: true, ctrl: false, alt: false, meta: false },
  toggleIndicator: { code: 'KeyV',   shift: true, ctrl: false, alt: false, meta: false }
};

const DEFAULT_SETTINGS = {
  speed: 1.0,
  rememberSpeed: true,
  showIndicator: true,
  speedStep: 0.25,
  perSeriesSpeed: false,
  seriesSpeeds: {},
  autoSkip: true,
  shortcuts: DEFAULT_SHORTCUTS
};

const DEFAULT_STATS = {
  totalTimeSavedSec: 0,
  totalTimeWatchedSec: 0,
  introsSkipped: 0,
  timeSkippedSec: 0
};

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULT_SETTINGS);
    chrome.storage.local.set({ stats: DEFAULT_STATS, seriesStats: {}, daily: {} });
    console.log('Crunchyroll Speed Controller installed');
  } else if (details.reason === 'update') {
    // Add any new setting keys without overwriting existing choices.
    chrome.storage.sync.get(null, (existing) => {
      const updates = {};
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (!(key in existing)) updates[key] = value;
      }
      if (Object.keys(updates).length > 0) chrome.storage.sync.set(updates);
    });

    // Migrate stats: merge missing keys, add new local collections.
    chrome.storage.local.get(['stats', 'seriesStats', 'daily'], (result) => {
      const merged = { ...DEFAULT_STATS, ...(result.stats || {}) };
      const updates = { stats: merged };
      if (!result.seriesStats) updates.seriesStats = {};
      if (!result.daily) updates.daily = {};
      chrome.storage.local.set(updates);
    });

    console.log('Crunchyroll Speed Controller updated to', chrome.runtime.getManifest().version);
  }
});

const FEEDBACK_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxV8gykfeOxENvhRDSHXAce7DHkTr0My0yRuOCv7trGl6xxoNn_XRLEC7aqPV8Cev5P/exec';

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'submitFeedback') {
    fetch(FEEDBACK_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify(message.data)
    })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'getSettings') {
    chrome.storage.sync.get({
      speed: 1.0,
      rememberSpeed: true,
      showIndicator: true,
      speedStep: 0.25,
      perSeriesSpeed: false,
      seriesSpeeds: {}
    }, (settings) => {
      sendResponse(settings);
    });
    return true; // Keep channel open for async response
  }
});
